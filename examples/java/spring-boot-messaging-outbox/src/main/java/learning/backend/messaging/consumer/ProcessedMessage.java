package learning.backend.messaging.consumer;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(
        name = "processed_message",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_processed_consumer_event",
                columnNames = {"consumer_name", "event_id"}))
public class ProcessedMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "consumer_name", nullable = false, length = 100)
    private String consumerName;

    @Column(name = "event_id", nullable = false)
    private UUID eventId;

    @Column(name = "processed_at", nullable = false)
    private Instant processedAt;

    protected ProcessedMessage() {
    }

    public ProcessedMessage(String consumerName, UUID eventId, Instant processedAt) {
        this.consumerName = consumerName;
        this.eventId = eventId;
        this.processedAt = processedAt;
    }
}
