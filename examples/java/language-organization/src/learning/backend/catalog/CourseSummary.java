package learning.backend.catalog;

public record CourseSummary(CourseId id, String title, CourseLevel level) {
    public CourseSummary {
        if (id == null) {
            throw new IllegalArgumentException("课程 ID 不能为空。");
        }
        if (title == null || title.isBlank()) {
            throw new IllegalArgumentException("课程标题不能为空。");
        }
        if (level == null) {
            throw new IllegalArgumentException("课程级别不能为空。");
        }

        title = title.trim();
    }

    public int recommendedMinutes() {
        return switch (level) {
            case BASIC -> 45;
            case INTERMEDIATE -> 60;
            case ADVANCED -> 90;
        };
    }
}
