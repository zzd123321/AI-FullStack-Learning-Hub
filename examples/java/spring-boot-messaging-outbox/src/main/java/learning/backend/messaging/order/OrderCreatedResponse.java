package learning.backend.messaging.order;

import java.util.UUID;

public record OrderCreatedResponse(
        UUID orderId,
        String status,
        UUID outboxEventId) {
}
