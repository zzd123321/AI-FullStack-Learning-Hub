package learning.backend.messaging.broker;

import java.util.concurrent.TimeUnit;

import learning.backend.messaging.outbox.MessagePublisher;
import learning.backend.messaging.outbox.OutboxMessage;
import learning.backend.messaging.outbox.OutboxMessageCodec;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("rabbit")
public class RabbitOutboxPublisher implements MessagePublisher {

    private final RabbitTemplate rabbitTemplate;
    private final OutboxMessageCodec codec;

    public RabbitOutboxPublisher(
            RabbitTemplate rabbitTemplate,
            OutboxMessageCodec codec) {
        this.rabbitTemplate = rabbitTemplate;
        this.codec = codec;
    }

    @Override
    public void publish(OutboxMessage message) {
        CorrelationData correlation = new CorrelationData(message.eventId().toString());
        rabbitTemplate.convertAndSend(
                RabbitTopologyConfiguration.EXCHANGE,
                "purchase-order.created",
                codec.encode(message),
                amqpMessage -> {
                    amqpMessage.getMessageProperties()
                            .setDeliveryMode(MessageDeliveryMode.PERSISTENT);
                    amqpMessage.getMessageProperties()
                            .setHeader("eventId", message.eventId().toString());
                    return amqpMessage;
                },
                correlation);
        try {
            CorrelationData.Confirm confirm = correlation.getFuture().get(5, TimeUnit.SECONDS);
            if (!confirm.ack()) {
                throw new IllegalStateException("RabbitMQ nack: " + confirm.reason());
            }
            if (correlation.getReturned() != null) {
                throw new IllegalStateException(
                        "RabbitMQ 无路由: " + correlation.getReturned().getReplyText());
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("等待 RabbitMQ confirm 被中断", exception);
        } catch (java.util.concurrent.ExecutionException
                | java.util.concurrent.TimeoutException exception) {
            throw new IllegalStateException("未取得 RabbitMQ publisher confirm", exception);
        }
    }
}
