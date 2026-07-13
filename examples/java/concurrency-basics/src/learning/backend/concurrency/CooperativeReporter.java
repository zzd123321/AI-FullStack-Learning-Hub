package learning.backend.concurrency;

import java.util.concurrent.CountDownLatch;

public final class CooperativeReporter implements Runnable {
    private final CountDownLatch started = new CountDownLatch(1);
    private volatile boolean running = true;
    private volatile boolean stopped;

    @Override
    public void run() {
        started.countDown();

        try {
            while (running) {
                Thread.sleep(100);
            }
        } catch (InterruptedException error) {
            if (running) {
                Thread.currentThread().interrupt();
            }
        } finally {
            stopped = true;
        }
    }

    public void awaitStarted() throws InterruptedException {
        started.await();
    }

    public void requestStop() {
        running = false;
    }

    public boolean stopped() {
        return stopped;
    }
}
