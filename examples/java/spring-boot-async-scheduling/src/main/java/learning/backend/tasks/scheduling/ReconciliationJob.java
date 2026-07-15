package learning.backend.tasks.scheduling;

import java.time.Clock;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class ReconciliationJob {

    private final AtomicLong runs = new AtomicLong();
    private final Clock clock = Clock.systemUTC();

    private volatile Instant lastStartedAt;
    private volatile Instant lastCompletedAt;
    private volatile String lastThread;

    @Scheduled(
            fixedDelayString = "${app.jobs.reconciliation.fixed-delay:PT30S}",
            initialDelayString = "${app.jobs.reconciliation.initial-delay:PT1H}")
    public void runOnce() {
        lastStartedAt = Instant.now(clock);
        lastThread = Thread.currentThread().getName();
        try {
            runs.incrementAndGet();
        } finally {
            lastCompletedAt = Instant.now(clock);
        }
    }

    public JobDiagnostics diagnostics() {
        return new JobDiagnostics(
                runs.get(),
                lastStartedAt,
                lastCompletedAt,
                lastThread);
    }
}
