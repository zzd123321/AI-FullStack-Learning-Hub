package learning.backend.messaging.broker;

import learning.backend.messaging.consumer.IdempotentOrderConsumer;
import learning.backend.messaging.outbox.OutboxMessageCodec;
import org.springframework.context.annotation.Profile;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
@Profile("kafka")
public class KafkaOrderListener {

    private final OutboxMessageCodec codec;
    private final IdempotentOrderConsumer consumer;

    public KafkaOrderListener(
            OutboxMessageCodec codec,
            IdempotentOrderConsumer consumer) {
        this.codec = codec;
        this.consumer = consumer;
    }

    @KafkaListener(
            topics = KafkaOutboxPublisher.TOPIC,
            groupId = "learning-order-projection-v1")
    public void onMessage(String envelope) {
        consumer.consume(codec.decode(envelope));
    }
}
