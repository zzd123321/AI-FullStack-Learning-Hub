package learning.backend.loom.preview;

public record LearningDashboard(
        String displayName,
        int completedCourses,
        String requestId,
        boolean childContextsMatched
) {
}
