package learning.backend.tasks.notification;

import java.time.Instant;
import java.util.UUID;

public record TaskSnapshot(
        UUID taskId,
        TaskState state,
        String correlationId,
        Instant submittedAt,
        Instant startedAt,
        Instant completedAt,
        String workerThread,
        String detail) {
}
