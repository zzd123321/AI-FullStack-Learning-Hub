package learning.backend.concurrency;

import java.time.Duration;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

public final class LearningTaskExecutor implements AutoCloseable {
    private static final Duration SHUTDOWN_TIMEOUT = Duration.ofSeconds(2);

    private final ExecutorService executor;
    private final ConcurrentMetrics metrics = new ConcurrentMetrics();

    public LearningTaskExecutor(int poolSize) {
        if (poolSize <= 0) {
            throw new IllegalArgumentException("线程池大小必须大于 0。");
        }
        executor = Executors.newFixedThreadPool(poolSize, new NamedThreadFactory());
    }

    public Future<ActivityResult> submit(ActivityJob job) {
        Objects.requireNonNull(job, "任务不能为空。");
        return executor.submit(() -> process(job));
    }

    public Future<Void> submitInterruptibleWait(CountDownLatch started) {
        Objects.requireNonNull(started, "启动信号不能为空。");
        Callable<Void> task = () -> {
            started.countDown();
            TimeUnit.SECONDS.sleep(30);
            return null;
        };
        return executor.submit(task);
    }

    public MetricsSnapshot metricsSnapshot() {
        return metrics.snapshot();
    }

    private ActivityResult process(ActivityJob job) {
        try {
            if (job.simulateFailure()) {
                throw new IllegalStateException("模拟处理失败：" + job.id());
            }
            metrics.recordSuccess(job.topic(), job.minutes());
            return new ActivityResult(job.id(), Thread.currentThread().getName());
        } catch (RuntimeException error) {
            metrics.recordFailure();
            throw error;
        }
    }

    @Override
    public void close() {
        executor.shutdown();
        try {
            if (!executor.awaitTermination(
                    SHUTDOWN_TIMEOUT.toMillis(),
                    TimeUnit.MILLISECONDS
            )) {
                List<Runnable> neverStarted = executor.shutdownNow();
                if (!neverStarted.isEmpty()) {
                    System.err.println("未开始任务数：" + neverStarted.size());
                }
                executor.awaitTermination(
                        SHUTDOWN_TIMEOUT.toMillis(),
                        TimeUnit.MILLISECONDS
                );
            }
        } catch (InterruptedException error) {
            executor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }
}
