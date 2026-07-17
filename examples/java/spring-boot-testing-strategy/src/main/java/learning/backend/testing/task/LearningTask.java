package learning.backend.testing.task;

public record LearningTask(String id, String title, boolean completed) {
    public LearningTask {
        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException("任务 ID 不能为空。");
        }
        if (title == null || title.isBlank()) {
            throw new IllegalArgumentException("任务标题不能为空。");
        }
        id = id.strip();
        title = title.strip();
    }

    public LearningTask complete() {
        // record 不可变：完成任务会产生新值，不会偷偷修改旧对象。
        return completed ? this : new LearningTask(id, title, true);
    }
}
