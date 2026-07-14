package learning.backend.springboot.course;

import java.util.List;
import java.util.Locale;

public record Course(String slug, String title, List<String> topics) {

    public Course {
        slug = requireText(slug, "slug").toLowerCase(Locale.ROOT);
        title = requireText(title, "title");
        topics = List.copyOf(topics == null ? List.of() : topics);
        if (topics.isEmpty()) {
            throw new IllegalArgumentException("topics 至少需要一个主题");
        }
    }

    private static String requireText(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(fieldName + " 不能为空");
        }
        return value.strip();
    }
}
