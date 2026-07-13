package learning.backend.collections;

public record LearningSession(
        String sessionId,
        String learner,
        String topic,
        int minutes
) {
    public LearningSession {
        sessionId = requireText(sessionId, "场次 ID");
        learner = requireText(learner, "学习者");
        topic = requireText(topic, "主题");

        if (minutes <= 0 || minutes > 1_440) {
            throw new IllegalArgumentException("学习分钟数必须在 1 到 1440 之间。");
        }
    }

    private static String requireText(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(fieldName + "不能为空。");
        }
        return value.strip();
    }
}
