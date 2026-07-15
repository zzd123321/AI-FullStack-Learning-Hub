package learning.backend.tasks.notification;

import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

@Component
public class TaskRegistry {

    private final Map<UUID, TaskSnapshot> tasks = new ConcurrentHashMap<>();
    private final Clock clock = Clock.systemUTC();

    public TaskSnapshot create(UUID taskId, String correlationId) {
        TaskSnapshot snapshot = new TaskSnapshot(
                taskId,
                TaskState.QUEUED,
                correlationId,
                Instant.now(clock),
                null,
                null,
                null,
                "等待执行");
        tasks.put(taskId, snapshot);
        return snapshot;
    }

    public void markRunning(UUID taskId, String workerThread) {
        tasks.computeIfPresent(taskId, (id, current) -> new TaskSnapshot(
                id,
                TaskState.RUNNING,
                current.correlationId(),
                current.submittedAt(),
                Instant.now(clock),
                null,
                workerThread,
                "正在发送"));
    }

    public void markSucceeded(UUID taskId) {
        complete(taskId, TaskState.SUCCEEDED, "发送成功");
    }

    public void markFailed(UUID taskId, String detail) {
        complete(taskId, TaskState.FAILED, detail);
    }

    public void markRejected(UUID taskId) {
        complete(taskId, TaskState.REJECTED, "线程池已饱和，任务未被接受");
    }

    public TaskSnapshot get(UUID taskId) {
        TaskSnapshot snapshot = tasks.get(taskId);
        if (snapshot == null) {
            throw new TaskNotFoundException(taskId);
        }
        return snapshot;
    }

    public void clear() {
        tasks.clear();
    }

    private void complete(UUID taskId, TaskState state, String detail) {
        tasks.computeIfPresent(taskId, (id, current) -> new TaskSnapshot(
                id,
                state,
                current.correlationId(),
                current.submittedAt(),
                current.startedAt(),
                Instant.now(clock),
                current.workerThread(),
                detail));
    }
}
