package learning.backend.tasks;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import com.jayway.jsonpath.JsonPath;
import learning.backend.tasks.context.CorrelationIdFilter;
import learning.backend.tasks.context.RequestContext;
import learning.backend.tasks.notification.NotificationRequest;
import learning.backend.tasks.notification.NotificationResult;
import learning.backend.tasks.notification.NotificationTaskService;
import learning.backend.tasks.notification.TaskRegistry;
import learning.backend.tasks.notification.TaskSnapshot;
import learning.backend.tasks.notification.TaskState;
import learning.backend.tasks.scheduling.ReconciliationJob;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "app.jobs.reconciliation.initial-delay=PT1H")
@AutoConfigureMockMvc
class AsyncSchedulingApplicationTest {

    @Autowired
    private NotificationTaskService taskService;

    @Autowired
    private TaskRegistry registry;

    @Autowired
    @Qualifier("notificationExecutor")
    private ThreadPoolTaskExecutor executor;

    @Autowired
    @Qualifier("taskScheduler")
    private ThreadPoolTaskScheduler scheduler;

    @Autowired
    private ReconciliationJob reconciliationJob;

    @Autowired
    private MockMvc mockMvc;

    @BeforeEach
    void resetState() {
        registry.clear();
        RequestContext.clear();
    }

    @AfterEach
    void clearCallerContext() {
        RequestContext.clear();
    }

    @Test
    void asyncMethodRunsOnNamedWorkerAndCopiesCallerContext() throws Exception {
        UUID taskId = UUID.randomUUID();
        RequestContext.setCorrelationId("corr-direct-test");
        registry.create(taskId, "corr-direct-test");

        CompletableFuture<NotificationResult> future = taskService.execute(
                taskId,
                new NotificationRequest("student@example.com", "课程更新", 30, false));
        NotificationResult result = future.get(2, TimeUnit.SECONDS);

        assertThat(result.workerThread()).startsWith("notify-");
        assertThat(result.correlationId()).isEqualTo("corr-direct-test");
        assertThat(Thread.currentThread().getName()).doesNotStartWith("notify-");
        assertThat(registry.get(taskId).state()).isEqualTo(TaskState.SUCCEEDED);
    }

    @Test
    void futureCarriesFailureAndRegistryKeepsObservableState() {
        UUID taskId = UUID.randomUUID();
        registry.create(taskId, "corr-failure");

        CompletableFuture<NotificationResult> future = taskService.execute(
                taskId,
                new NotificationRequest("student@example.com", "失败路径", 0, true));

        assertThatThrownBy(future::join)
                .hasRootCauseInstanceOf(IllegalStateException.class)
                .hasRootCauseMessage("模拟通知网关失败");
        assertThat(registry.get(taskId).state()).isEqualTo(TaskState.FAILED);
    }

    @Test
    void boundedPoolRejectsInsteadOfGrowingQueueWithoutLimit() throws Exception {
        CountDownLatch workersStarted = new CountDownLatch(2);
        CountDownLatch releaseWorkers = new CountDownLatch(1);
        List<Future<?>> accepted = new ArrayList<>();

        Runnable blockingTask = () -> {
            workersStarted.countDown();
            try {
                releaseWorkers.await();
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            }
        };

        accepted.add(executor.submit(blockingTask));
        accepted.add(executor.submit(blockingTask));
        assertThat(workersStarted.await(1, TimeUnit.SECONDS)).isTrue();
        accepted.add(executor.submit(() -> { }));
        accepted.add(executor.submit(() -> { }));

        assertThatThrownBy(() -> executor.submit(() -> { }))
                .isInstanceOf(TaskRejectedException.class);

        releaseWorkers.countDown();
        for (Future<?> future : accepted) {
            future.get(2, TimeUnit.SECONDS);
        }
    }

    @Test
    void schedulerUsesItsOwnPool() throws Exception {
        long before = reconciliationJob.diagnostics().runs();

        Future<?> scheduled = scheduler.schedule(
                reconciliationJob::runOnce,
                Instant.now());
        scheduled.get(2, TimeUnit.SECONDS);

        assertThat(reconciliationJob.diagnostics().runs()).isEqualTo(before + 1);
        assertThat(reconciliationJob.diagnostics().lastThread()).startsWith("schedule-");
    }

    @Test
    void httpSubmissionReturnsAcceptedThenStatusBecomesSucceeded() throws Exception {
        String response = mockMvc.perform(post("/api/notifications")
                        .header(CorrelationIdFilter.HEADER_NAME, "corr-http-test")
                        .contentType("application/json")
                        .content("""
                                {
                                  "recipient": "student@example.com",
                                  "message": "异步课程已发布",
                                  "simulatedDelayMillis": 20,
                                  "simulateFailure": false
                                }
                                """))
                .andExpect(status().isAccepted())
                .andExpect(header().string(
                        CorrelationIdFilter.HEADER_NAME,
                        "corr-http-test"))
                .andExpect(jsonPath("$.state").value("QUEUED"))
                .andReturn()
                .getResponse()
                .getContentAsString();

        UUID taskId = UUID.fromString(JsonPath.read(response, "$.taskId"));
        TaskSnapshot snapshot = awaitTerminalState(taskId);

        assertThat(snapshot.state()).isEqualTo(TaskState.SUCCEEDED);
        assertThat(snapshot.correlationId()).isEqualTo("corr-http-test");
        assertThat(snapshot.workerThread()).startsWith("notify-");

        mockMvc.perform(get("/api/notifications/{taskId}", taskId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("SUCCEEDED"));
    }

    private TaskSnapshot awaitTerminalState(UUID taskId) throws InterruptedException {
        for (int attempt = 0; attempt < 100; attempt++) {
            TaskSnapshot snapshot = registry.get(taskId);
            if (snapshot.state() == TaskState.SUCCEEDED
                    || snapshot.state() == TaskState.FAILED
                    || snapshot.state() == TaskState.REJECTED) {
                return snapshot;
            }
            Thread.sleep(20);
        }
        throw new AssertionError("任务未在预期时间内结束");
    }
}
