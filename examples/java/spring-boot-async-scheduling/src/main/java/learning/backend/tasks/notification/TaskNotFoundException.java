package learning.backend.tasks.notification;

import java.io.Serial;
import java.util.UUID;

public class TaskNotFoundException extends RuntimeException {

    @Serial
    private static final long serialVersionUID = 1L;

    public TaskNotFoundException(UUID taskId) {
        super("任务不存在: " + taskId);
    }
}
