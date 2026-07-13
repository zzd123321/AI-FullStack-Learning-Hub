package learning.backend.concurrency;

public final class CompletableFutureApp {
    private CompletableFutureApp() {
    }

    public static void main(String[] args) {
        try (AsyncDashboardService service = new AsyncDashboardService()) {
            LearningDashboard dashboard = service.loadDashboard("U-001").join();
            System.out.println("用户：" + dashboard.displayName());
            System.out.println("已完成课程：" + dashboard.completedCourses());
            System.out.println("累计分钟：" + dashboard.totalMinutes());
            System.out.println("推荐：" + dashboard.recommendation());

            LearningDashboard fallback = service
                    .loadDashboardWithFallback("U-404")
                    .join();
            System.out.println("失败回退：" + fallback.recommendation());
        }
    }
}
