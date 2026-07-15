package learning.backend.tasks.notification;

import java.util.UUID;

public record NotificationResult(
        UUID taskId,
        String correlationId,
        String workerThread,
        String outcome) {
}
