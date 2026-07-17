package learning.backend.catalog;

import java.util.Locale;

public record CourseId(String value) {
    public CourseId {
        // 紧凑构造方法在 record 字段赋值前校验并规范化构造参数。
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("课程 ID 不能为空。");
        }

        // Locale.ROOT 表示与用户语言无关的稳定大小写转换，适合机器标识符。
        value = value.trim().toUpperCase(Locale.ROOT);

        if (!value.matches("[A-Z0-9-]+")) {
            throw new IllegalArgumentException("课程 ID 只能包含字母、数字和连字符。");
        }
    }
}
