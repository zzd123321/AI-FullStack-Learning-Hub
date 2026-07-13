package learning.backend.loom.preview;

public final class StructuredConcurrencyApp {
    private StructuredConcurrencyApp() {
    }

    public static void main(String[] args) throws InterruptedException {
        StructuredDashboardService service = new StructuredDashboardService();
        RequestContext context = new RequestContext("REQ-2026-017", "U-001");
        LearningDashboard dashboard = service.loadDashboard(context);

        System.out.println("请求：" + dashboard.requestId());
        System.out.println("用户：" + dashboard.displayName());
        System.out.println("已完成课程：" + dashboard.completedCourses());
        System.out.println("子任务上下文一致：" + dashboard.childContextsMatched());
    }
}
