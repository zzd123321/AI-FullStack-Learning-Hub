package learning.backend.concurrency;

import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicInteger;

public final class NamedThreadFactory implements ThreadFactory {
    private final AtomicInteger sequence = new AtomicInteger();

    @Override
    public Thread newThread(Runnable task) {
        Thread thread = new Thread(
                task,
                "learning-worker-" + sequence.incrementAndGet()
        );
        thread.setDaemon(false);
        return thread;
    }
}
