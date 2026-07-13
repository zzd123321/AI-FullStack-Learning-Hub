package learning.backend.concurrency;

public record LearningDashboard(
        String displayName,
        int completedCourses,
        int totalMinutes,
        String recommendation
) {
    public static LearningDashboard unavailable(String displayName) {
        return new LearningDashboard(displayName, 0, 0, "暂时无法生成推荐");
    }
}
