package learning.backend.catalog;

import java.util.Locale;

public record CourseId(String value) {
    public CourseId {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("课程 ID 不能为空。");
        }

        value = value.trim().toUpperCase(Locale.ROOT);

        if (!value.matches("[A-Z0-9-]+")) {
            throw new IllegalArgumentException("课程 ID 只能包含字母、数字和连字符。");
        }
    }
}
