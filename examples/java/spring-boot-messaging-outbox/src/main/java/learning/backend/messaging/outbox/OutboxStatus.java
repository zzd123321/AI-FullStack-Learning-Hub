package learning.backend.messaging.outbox;

public enum OutboxStatus {
    PENDING,
    PUBLISHING,
    PUBLISHED,
    DEAD
}
