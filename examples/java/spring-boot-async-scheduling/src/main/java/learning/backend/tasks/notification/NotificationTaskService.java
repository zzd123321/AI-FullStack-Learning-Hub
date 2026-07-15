package learning.backend.tasks.notification;

import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import learning.backend.tasks.context.RequestContext;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Service
public class NotificationTaskService {

    private final TaskRegistry registry;

    public NotificationTaskService(TaskRegistry registry) {
        this.registry = registry;
    }

    @Async("notificationExecutor")
    public CompletableFuture<NotificationResult> execute(
            UUID taskId,
            NotificationRequest request) {
        String workerThread = Thread.currentThread().getName();
        String correlationId = RequestContext.correlationIdOr("system");
        registry.markRunning(taskId, workerThread);

        try {
            Thread.sleep(request.simulatedDelayMillis());
            if (request.simulateFailure()) {
                throw new IllegalStateException("模拟通知网关失败");
            }
            registry.markSucceeded(taskId);
            return CompletableFuture.completedFuture(new NotificationResult(
                    taskId,
                    correlationId,
                    workerThread,
                    "SENT"));
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            registry.markFailed(taskId, "任务被中断");
            return CompletableFuture.failedFuture(exception);
        } catch (RuntimeException exception) {
            registry.markFailed(taskId, exception.getMessage());
            return CompletableFuture.failedFuture(exception);
        }
    }
}
