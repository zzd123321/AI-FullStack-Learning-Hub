package learning.backend.catalog;

import java.util.Locale;

public enum CourseLevel {
    // 合法级别被限制为这三个实例，调用方无法传入任意字符串冒充级别。
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

        // 只在系统入口解析字符串；进入业务代码后统一使用 CourseLevel 类型。
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
