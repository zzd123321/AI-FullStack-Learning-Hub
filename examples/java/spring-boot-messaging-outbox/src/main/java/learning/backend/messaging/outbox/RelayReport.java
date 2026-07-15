package learning.backend.messaging.outbox;

public record RelayReport(int claimed, int published, int failed) {
}
