package learning.backend.messaging.outbox;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class OutboxRelay {

    private final OutboxStore store;
    private final MessagePublisher publisher;
    private final Clock clock = Clock.systemUTC();

    public OutboxRelay(OutboxStore store, MessagePublisher publisher) {
        this.store = store;
        this.publisher = publisher;
    }

    @Scheduled(
            fixedDelayString = "${app.outbox.fixed-delay:PT2S}",
            initialDelayString = "${app.outbox.initial-delay:PT1H}")
    public void scheduledRelay() {
        relayBatch();
    }

    public RelayReport relayBatch() {
        Instant now = Instant.now(clock);
        List<OutboxMessage> batch = store.claimBatch(now, 20);
        int published = 0;
        int failed = 0;

        for (OutboxMessage message : batch) {
            try {
                publisher.publish(message);
                store.markPublished(message.eventId(), Instant.now(clock));
                published++;
            } catch (RuntimeException exception) {
                store.markFailed(
                        message.eventId(),
                        Instant.now(clock),
                        exception.getMessage());
                failed++;
            }
        }
        return new RelayReport(batch.size(), published, failed);
    }
}
