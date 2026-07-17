package learning.backend.concurrency;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public final class AsyncDashboardService implements AutoCloseable {
    private final ExecutorService executor = Executors.newFixedThreadPool(3);

    public CompletableFuture<LearningDashboard> loadDashboard(String userId) {
        // 用户资料和统计数据彼此独立，先同时启动，不在这里 join 阻塞。
        CompletableFuture<UserProfile> profile = loadProfile(userId);
        CompletableFuture<LearningStats> stats = loadStats(userId);

        // 推荐依赖 profile 的结果，且下一步本身返回 Future，所以使用 thenCompose 展平。
        CompletableFuture<String> recommendation = profile.thenCompose(
                this::loadRecommendation
        );

        return profile
                // thenCombine 等两边都成功后才执行合并函数。
                .thenCombine(stats, DashboardParts::new)
                .thenCombine(recommendation, (parts, topic) -> new LearningDashboard(
                        parts.profile().displayName(),
                        parts.stats().completedCourses(),
                        parts.stats().totalMinutes(),
                        topic
                ))
                // 超时会让返回的阶段失败，但不保证底层阻塞操作已经停止。
                .orTimeout(2, TimeUnit.SECONDS);
    }

    public CompletableFuture<LearningDashboard> loadDashboardWithFallback(String userId) {
        // exceptionally 把上游异常转换为一个正常的降级值。
        return loadDashboard(userId).exceptionally(error ->
                LearningDashboard.unavailable("访客"));
    }

    private CompletableFuture<UserProfile> loadProfile(String userId) {
        return CompletableFuture.supplyAsync(() -> {
            if (!"U-001".equals(userId)) {
                throw new IllegalArgumentException("用户不存在：" + userId);
            }
            return new UserProfile(userId, "小林");
        }, executor);
    }

    private CompletableFuture<LearningStats> loadStats(String userId) {
        return CompletableFuture.supplyAsync(
                () -> new LearningStats(12, 860),
                executor
        );
    }

    private CompletableFuture<String> loadRecommendation(UserProfile profile) {
        return CompletableFuture.supplyAsync(
                () -> profile.displayName() + "，下一节学习 CompletableFuture",
                executor
        );
    }

    @Override
    public void close() {
        executor.shutdown();
        try {
            if (!executor.awaitTermination(2, TimeUnit.SECONDS)) {
                executor.shutdownNow();
            }
        } catch (InterruptedException error) {
            executor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }

    private record DashboardParts(UserProfile profile, LearningStats stats) {
    }
}
