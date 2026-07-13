package learning.backend.collections;

public record LearningTask(String title, int estimatedMinutes, boolean completed) {
    public LearningTask {
        if (title == null || title.isBlank()) {
            throw new IllegalArgumentException("任务标题不能为空。");
        }
        if (estimatedMinutes <= 0 || estimatedMinutes > 1_440) {
            throw new IllegalArgumentException("预计分钟数必须在 1 到 1440 之间。");
        }

        title = title.strip();
    }

    public LearningTask complete() {
        if (completed) {
            return this;
        }
        return new LearningTask(title, estimatedMinutes, true);
    }
}
