package learning.backend.generics;

public record Video(String id, String title, int durationMinutes)
        implements LearningResource {
    public Video {
        id = requireText(id, "视频 ID");
        title = requireText(title, "视频标题");
        if (durationMinutes <= 0) {
            throw new IllegalArgumentException("视频分钟数必须大于 0。");
        }
    }

    private static String requireText(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(fieldName + "不能为空。");
        }
        return value.strip();
    }
}
