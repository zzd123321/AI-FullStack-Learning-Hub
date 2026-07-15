package learning.backend.messaging.outbox;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("!rabbit & !kafka")
public class RecordingMessagePublisher implements MessagePublisher {

    private final List<OutboxMessage> published = new CopyOnWriteArrayList<>();
    private final AtomicBoolean failNext = new AtomicBoolean();

    @Override
    public void publish(OutboxMessage message) {
        if (failNext.compareAndSet(true, false)) {
            throw new IllegalStateException("模拟 Broker 暂时不可用");
        }
        published.add(message);
    }

    public List<OutboxMessage> publishedMessages() {
        return List.copyOf(published);
    }

    public OutboxMessage find(UUID eventId) {
        return published.stream()
                .filter(message -> message.eventId().equals(eventId))
                .findFirst()
                .orElseThrow();
    }

    public void failNextPublish() {
        failNext.set(true);
    }

    public void clear() {
        published.clear();
        failNext.set(false);
    }
}
