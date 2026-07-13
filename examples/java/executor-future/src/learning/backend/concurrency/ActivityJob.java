package learning.backend.concurrency;

public record ActivityJob(
        String id,
        String topic,
        int minutes,
        boolean simulateFailure
) {
    public ActivityJob {
        id = requireText(id, "任务 ID");
        topic = requireText(topic, "主题");
        if (minutes <= 0 || minutes > 1_440) {
            throw new IllegalArgumentException("分钟数必须在 1 到 1440 之间。");
        }
    }

    private static String requireText(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(fieldName + "不能为空。");
        }
        return value.strip();
    }
}
