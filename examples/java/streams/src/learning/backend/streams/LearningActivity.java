package learning.backend.streams;

import java.util.List;

public record LearningActivity(
        String id,
        String learner,
        String topic,
        int minutes,
        boolean completed,
        List<String> tags
) {
    public LearningActivity {
        id = requireText(id, "活动 ID");
        learner = requireText(learner, "学习者");
        topic = requireText(topic, "主题");
        if (minutes <= 0 || minutes > 1_440) {
            throw new IllegalArgumentException("分钟数必须在 1 到 1440 之间。");
        }
        if (tags == null) {
            throw new IllegalArgumentException("标签列表不能为空。");
        }
        tags = tags.stream()
                .map(tag -> requireText(tag, "标签"))
                .distinct()
                .toList();
    }

    private static String requireText(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(fieldName + "不能为空。");
        }
        return value.strip();
    }
}
