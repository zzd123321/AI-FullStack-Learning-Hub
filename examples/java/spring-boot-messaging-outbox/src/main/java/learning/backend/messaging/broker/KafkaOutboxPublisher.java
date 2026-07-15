package learning.backend.messaging.broker;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

import learning.backend.messaging.outbox.MessagePublisher;
import learning.backend.messaging.outbox.OutboxMessage;
import learning.backend.messaging.outbox.OutboxMessageCodec;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.springframework.context.annotation.Profile;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
@Profile("kafka")
public class KafkaOutboxPublisher implements MessagePublisher {

    public static final String TOPIC = "learning.purchase-order.events.v1";

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final OutboxMessageCodec codec;

    public KafkaOutboxPublisher(
            KafkaTemplate<String, String> kafkaTemplate,
            OutboxMessageCodec codec) {
        this.kafkaTemplate = kafkaTemplate;
        this.codec = codec;
    }

    @Override
    public void publish(OutboxMessage message) {
        ProducerRecord<String, String> record = new ProducerRecord<>(
                TOPIC,
                message.aggregateId(),
                codec.encode(message));
        record.headers().add(
                "eventId",
                message.eventId().toString().getBytes(StandardCharsets.UTF_8));
        try {
            kafkaTemplate.send(record).get(5, TimeUnit.SECONDS);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("等待 Kafka ack 被中断", exception);
        } catch (java.util.concurrent.ExecutionException
                | java.util.concurrent.TimeoutException exception) {
            throw new IllegalStateException("Kafka 发布未确认", exception);
        }
    }
}
