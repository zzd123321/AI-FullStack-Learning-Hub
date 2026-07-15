package learning.backend.messaging.outbox;

import java.time.Instant;
import java.util.UUID;

public record OutboxMessage(
        UUID eventId,
        String aggregateType,
        String aggregateId,
        String eventType,
        String payload,
        Instant occurredAt) {
}
