package learning.backend.messaging.outbox;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

@Entity
@Table(name = "outbox_event")
public class OutboxEvent {

    @Id
    private UUID id;

    @Version
    @Column(nullable = false)
    private long version;

    @Column(name = "aggregate_type", nullable = false, length = 80)
    private String aggregateType;

    @Column(name = "aggregate_id", nullable = false, length = 80)
    private String aggregateId;

    @Column(name = "event_type", nullable = false, length = 120)
    private String eventType;

    @Column(nullable = false, length = 4000)
    private String payload;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private OutboxStatus status;

    @Column(nullable = false)
    private int attempts;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "next_attempt_at", nullable = false)
    private Instant nextAttemptAt;

    @Column(name = "locked_until")
    private Instant lockedUntil;

    @Column(name = "published_at")
    private Instant publishedAt;

    @Column(name = "last_error", length = 500)
    private String lastError;

    protected OutboxEvent() {
    }

    public OutboxEvent(
            UUID id,
            String aggregateType,
            String aggregateId,
            String eventType,
            String payload,
            Instant createdAt) {
        this.id = id;
        this.aggregateType = aggregateType;
        this.aggregateId = aggregateId;
        this.eventType = eventType;
        this.payload = payload;
        this.status = OutboxStatus.PENDING;
        this.attempts = 0;
        this.createdAt = createdAt;
        this.nextAttemptAt = createdAt;
    }

    public void claim(Instant lockedUntil) {
        status = OutboxStatus.PUBLISHING;
        attempts++;
        this.lockedUntil = lockedUntil;
        lastError = null;
    }

    public void published(Instant now) {
        status = OutboxStatus.PUBLISHED;
        publishedAt = now;
        lockedUntil = null;
        lastError = null;
    }

    public void failed(Instant now, String error, int maxAttempts) {
        lockedUntil = null;
        lastError = abbreviate(error);
        if (attempts >= maxAttempts) {
            status = OutboxStatus.DEAD;
            return;
        }
        status = OutboxStatus.PENDING;
        long delaySeconds = Math.min(60, 1L << Math.min(attempts, 6));
        nextAttemptAt = now.plus(Duration.ofSeconds(delaySeconds));
    }

    public OutboxMessage message() {
        return new OutboxMessage(
                id,
                aggregateType,
                aggregateId,
                eventType,
                payload,
                createdAt);
    }

    public UUID id() {
        return id;
    }

    public OutboxStatus status() {
        return status;
    }

    public int attempts() {
        return attempts;
    }

    public Instant nextAttemptAt() {
        return nextAttemptAt;
    }

    public String lastError() {
        return lastError;
    }

    private static String abbreviate(String value) {
        if (value == null) {
            return "未知发布错误";
        }
        return value.length() <= 500 ? value : value.substring(0, 500);
    }
}
