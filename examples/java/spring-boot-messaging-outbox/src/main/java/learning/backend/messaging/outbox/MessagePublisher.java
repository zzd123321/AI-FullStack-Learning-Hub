package learning.backend.messaging.outbox;

public interface MessagePublisher {

    void publish(OutboxMessage message);
}
