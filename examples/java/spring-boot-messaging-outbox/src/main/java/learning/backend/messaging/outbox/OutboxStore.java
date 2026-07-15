package learning.backend.messaging.outbox;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OutboxStore {

    private static final Duration CLAIM_LEASE = Duration.ofSeconds(30);
    private static final int MAX_ATTEMPTS = 5;

    private final OutboxEventRepository repository;

    public OutboxStore(OutboxEventRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public List<OutboxMessage> claimBatch(Instant now, int batchSize) {
        return repository.lockPublishable(now, PageRequest.of(0, batchSize)).stream()
                .peek(event -> event.claim(now.plus(CLAIM_LEASE)))
                .map(OutboxEvent::message)
                .toList();
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markPublished(UUID eventId, Instant now) {
        repository.findById(eventId).orElseThrow().published(now);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markFailed(UUID eventId, Instant now, String error) {
        repository.findById(eventId).orElseThrow().failed(now, error, MAX_ATTEMPTS);
    }

    @Transactional(readOnly = true)
    public long count(OutboxStatus status) {
        return repository.countByStatus(status);
    }
}
