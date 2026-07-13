package learning.backend.catalog;

import java.util.Locale;

public enum CourseLevel {
    BASIC("基础"),
    INTERMEDIATE("进阶"),
    ADVANCED("高级");

    private final String displayName;

    CourseLevel(String displayName) {
        this.displayName = displayName;
    }

    public String displayName() {
        return displayName;
    }

    public static CourseLevel fromInput(String input) {
        if (input == null) {
            throw new IllegalArgumentException("课程级别不能为空。");
        }

        return switch (input.trim().toLowerCase(Locale.ROOT)) {
            case "basic" -> BASIC;
            case "intermediate" -> INTERMEDIATE;
            case "advanced" -> ADVANCED;
            default -> throw new IllegalArgumentException(
                    "课程级别必须是 basic、intermediate 或 advanced。"
            );
        };
    }
}
