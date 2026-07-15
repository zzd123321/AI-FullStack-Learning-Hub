package learning.backend.messaging.broker;

import learning.backend.messaging.consumer.IdempotentOrderConsumer;
import learning.backend.messaging.outbox.OutboxMessageCodec;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("rabbit")
public class RabbitOrderListener {

    private final OutboxMessageCodec codec;
    private final IdempotentOrderConsumer consumer;

    public RabbitOrderListener(
            OutboxMessageCodec codec,
            IdempotentOrderConsumer consumer) {
        this.codec = codec;
        this.consumer = consumer;
    }

    @RabbitListener(queues = RabbitTopologyConfiguration.QUEUE)
    public void onMessage(String envelope) {
        consumer.consume(codec.decode(envelope));
    }
}
