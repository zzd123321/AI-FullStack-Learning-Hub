package learning.backend.testing.task;

public final class TaskNotFoundException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    public TaskNotFoundException(String taskId) {
        super("任务不存在：" + taskId);
    }
}
