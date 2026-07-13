package learning.backend.concurrency;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public final class AsyncDashboardService implements AutoCloseable {
    private final ExecutorService executor = Executors.newFixedThreadPool(3);

    public CompletableFuture<LearningDashboard> loadDashboard(String userId) {
        CompletableFuture<UserProfile> profile = loadProfile(userId);
        CompletableFuture<LearningStats> stats = loadStats(userId);

        CompletableFuture<String> recommendation = profile.thenCompose(
                this::loadRecommendation
        );

        return profile
                .thenCombine(stats, DashboardParts::new)
                .thenCombine(recommendation, (parts, topic) -> new LearningDashboard(
                        parts.profile().displayName(),
                        parts.stats().completedCourses(),
                        parts.stats().totalMinutes(),
                        topic
                ))
                .orTimeout(2, TimeUnit.SECONDS);
    }

    public CompletableFuture<LearningDashboard> loadDashboardWithFallback(String userId) {
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
