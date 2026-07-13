package learning.backend.generics;

public record Article(String id, String title, int readingMinutes)
        implements LearningResource {
    public Article {
        id = requireText(id, "文章 ID");
        title = requireText(title, "文章标题");
        if (readingMinutes <= 0) {
            throw new IllegalArgumentException("阅读分钟数必须大于 0。");
        }
    }

    private static String requireText(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(fieldName + "不能为空。");
        }
        return value.strip();
    }
}
