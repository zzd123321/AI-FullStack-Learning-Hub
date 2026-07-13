package learning.backend.streams;

import java.util.List;

public final class LearningStreamApp {
    private LearningStreamApp() {
    }

    public static void main(String[] args) {
        List<LearningActivity> activities = List.of(
                new LearningActivity(
                        "L-001", "小林", "Java 集合", 45, true,
                        List.of("Java", "集合", "API")
                ),
                new LearningActivity(
                        "L-002", "小周", "Java 集合", 30, true,
                        List.of("Java", "集合")
                ),
                new LearningActivity(
                        "L-003", "小林", "Java 泛型", 60, true,
                        List.of("Java", "泛型", "API")
                ),
                new LearningActivity(
                        "L-004", "小林", "Stream 预习", 20, false,
                        List.of("Java", "Stream")
                )
        );

        LearningReportService service = new LearningReportService();
        LearningReport report = service.createReport(activities, " 小林 ", 30);

        System.out.println(report.learner() + "的完成报告");
        report.activities().forEach(activity ->
                System.out.printf("- %s / %d 分钟%n", activity.topic(), activity.minutes()));
        System.out.println("总时长：" + report.totalMinutes() + " 分钟");
        System.out.println("按主题：" + report.minutesByTopic());
        System.out.println("标签：" + report.tags());

        String longestTitle = service.findLongestCompleted(activities, "小林")
                .map(LearningActivity::topic)
                .orElseGet(() -> "暂无完成记录");
        System.out.println("最长活动：" + longestTitle);

        String missing = service.findLongestCompleted(activities, "小陈")
                .map(LearningActivity::topic)
                .orElse("暂无完成记录");
        System.out.println("小陈：" + missing);
    }
}
