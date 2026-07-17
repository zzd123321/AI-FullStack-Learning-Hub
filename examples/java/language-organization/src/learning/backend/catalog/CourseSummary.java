package learning.backend.catalog;

public record CourseSummary(CourseId id, String title, CourseLevel level) {
    public CourseSummary {
        // record 自动生成访问方法和基于组件值的 equals/hashCode，校验仍由我们负责。
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
        // switch 覆盖所有枚举值；将来新增级别时，编译器能提醒这里尚未处理。
        return switch (level) {
            case BASIC -> 45;
            case INTERMEDIATE -> 60;
            case ADVANCED -> 90;
        };
    }
}
