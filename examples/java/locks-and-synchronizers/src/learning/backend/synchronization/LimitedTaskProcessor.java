package learning.backend.synchronization;

import java.util.Locale;
import java.util.concurrent.Semaphore;

public final class LimitedTaskProcessor {
    private final int parallelism;
    private final Semaphore permits;

    public LimitedTaskProcessor(int parallelism) {
        if (parallelism <= 0) {
            throw new IllegalArgumentException("parallelism 必须大于 0");
        }
        this.parallelism = parallelism;
        this.permits = new Semaphore(parallelism);
    }

    public String process(String task) throws InterruptedException {
        permits.acquire();
        try {
            Thread.sleep(20);
            return task.toUpperCase(Locale.ROOT);
        } finally {
            permits.release();
        }
    }

    public int parallelism() {
        return parallelism;
    }
}
