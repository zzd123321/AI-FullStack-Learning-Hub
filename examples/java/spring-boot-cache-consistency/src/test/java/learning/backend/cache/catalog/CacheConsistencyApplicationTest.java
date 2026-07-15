package learning.backend.cache.catalog;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.cache.CacheManager;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "app.catalog.simulated-load-delay=80ms")
@AutoConfigureMockMvc
class CacheConsistencyApplicationTest {

    private static final UUID COURSE_ID =
            UUID.fromString("40000000-0000-0000-0000-000000000001");
    private static final UUID MISSING_ID =
            UUID.fromString("40000000-0000-0000-0000-000000000099");

    @Autowired
    private CourseQueryService queries;

    @Autowired
    private CourseCommandService commands;

    @Autowired
    private CourseLoader loader;

    @Autowired
    private CacheManager cacheManager;

    @Autowired
    private MockMvc mockMvc;

    private ExecutorService executor;

    @BeforeEach
    void clearCacheAndCounters() {
        cacheManager.getCache(CourseCaches.BY_ID).clear();
        loader.resetDatabaseLoadCount();
    }

    @AfterEach
    void stopExecutor() {
        if (executor != null) {
            executor.shutdownNow();
        }
    }

    @Test
    void repeatedReadUsesDatabaseOnlyOnce() {
        CourseView first = queries.findById(COURSE_ID);
        CourseView second = queries.findById(COURSE_ID);

        assertThat(second).isEqualTo(first);
        assertThat(loader.databaseLoadCount()).isEqualTo(1);
    }

    @Test
    void syncTrueCollapsesConcurrentMissesInsideOneApplicationInstance() throws Exception {
        executor = Executors.newFixedThreadPool(8);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<CourseView>> futures = new ArrayList<>();

        for (int index = 0; index < 8; index++) {
            futures.add(executor.submit(() -> {
                start.await();
                return queries.findById(COURSE_ID);
            }));
        }
        start.countDown();

        for (Future<CourseView> future : futures) {
            assertThat(future.get().id()).isEqualTo(COURSE_ID);
        }
        assertThat(loader.databaseLoadCount()).isEqualTo(1);
    }

    @Test
    void committedUpdateEvictsThenNextReadRepopulates() {
        CourseView original = queries.findById(COURSE_ID);

        commands.update(COURSE_ID, new UpdateCourseRequest("缓存一致性（更新后）", 15900));
        CourseView refreshed = queries.findById(COURSE_ID);

        assertThat(refreshed.title()).isEqualTo("缓存一致性（更新后）");
        assertThat(refreshed.title()).isNotEqualTo(original.title());
        assertThat(loader.databaseLoadCount()).isEqualTo(2);
    }

    @Test
    void rolledBackUpdateDoesNotEvictOrExposeUncommittedValue() {
        CourseView original = queries.findById(COURSE_ID);

        assertThatThrownBy(() -> commands.updateThenFail(
                COURSE_ID,
                new UpdateCourseRequest("不应提交", 1)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("模拟事务回滚");

        assertThat(queries.findById(COURSE_ID)).isEqualTo(original);
        assertThat(loader.databaseLoadCount()).isEqualTo(1);
    }

    @Test
    void exceptionsAreNotNegativeCachedByDefault() {
        assertThatThrownBy(() -> queries.findById(MISSING_ID))
                .isInstanceOf(CourseNotFoundException.class);
        assertThatThrownBy(() -> queries.findById(MISSING_ID))
                .isInstanceOf(CourseNotFoundException.class);

        assertThat(loader.databaseLoadCount()).isEqualTo(2);
    }

    @Test
    void httpNotFoundHasStableErrorAndRepeatedHttpReadsHitCache() throws Exception {
        mockMvc.perform(get("/api/catalog/courses/{id}", COURSE_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SPRING-CACHE"));
        mockMvc.perform(get("/api/catalog/courses/{id}", COURSE_ID))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/catalog/courses/{id}", MISSING_ID))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("COURSE_NOT_FOUND"));

        assertThat(loader.databaseLoadCount()).isEqualTo(2);
    }
}
