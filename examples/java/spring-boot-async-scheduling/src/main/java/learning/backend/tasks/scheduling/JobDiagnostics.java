package learning.backend.tasks.scheduling;

import java.time.Instant;

public record JobDiagnostics(
        long runs,
        Instant lastStartedAt,
        Instant lastCompletedAt,
        String lastThread) {
}
