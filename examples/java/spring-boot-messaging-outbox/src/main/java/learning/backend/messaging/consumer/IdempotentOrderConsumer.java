package learning.backend.messaging.consumer;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

import learning.backend.messaging.outbox.OutboxMessage;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class IdempotentOrderConsumer {

    private static final String CONSUMER_NAME = "order-projection-v1";

    private final ProcessedMessageRepository processedMessages;
    private final OrderProjectionRepository projections;
    private final Clock clock = Clock.systemUTC();

    public IdempotentOrderConsumer(
            ProcessedMessageRepository processedMessages,
            OrderProjectionRepository projections) {
        this.processedMessages = processedMessages;
        this.projections = projections;
    }

    @Transactional
    public ConsumptionResult consume(OutboxMessage message) {
        if (processedMessages.existsByConsumerNameAndEventId(
                CONSUMER_NAME,
                message.eventId())) {
            return ConsumptionResult.DUPLICATE;
        }

        UUID orderId = UUID.fromString(message.aggregateId());
        projections.save(new OrderProjection(orderId, message.occurredAt()));
        processedMessages.save(new ProcessedMessage(
                CONSUMER_NAME,
                message.eventId(),
                Instant.now(clock)));
        return ConsumptionResult.APPLIED;
    }
}
