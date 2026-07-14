package learning.backend.diagnostics;

import java.lang.ref.Reference;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public final class DiagnosticWorkloadApp {
    private static final Object MONITOR = new Object();
    private static final int BATCH_COUNT = 3;
    private static final int KIB_PER_BATCH = 256;

    private DiagnosticWorkloadApp() {
    }

    public static void main(String[] args) throws InterruptedException {
        int waitSeconds = parseWaitSeconds(args);
        CountDownLatch holderReady = new CountDownLatch(1);
        CountDownLatch releaseHolder = new CountDownLatch(1);

        Thread holder = new Thread(
                () -> holdMonitor(holderReady, releaseHolder),
                "diagnostic-lock-holder"
        );
        holder.start();
        if (!holderReady.await(1, TimeUnit.SECONDS)) {
            throw new IllegalStateException("锁持有线程未按时就绪");
        }

        Thread waiter = new Thread(
                DiagnosticWorkloadApp::waitForMonitor,
                "diagnostic-lock-waiter"
        );
        waiter.start();

        try {
            awaitState(waiter, Thread.State.BLOCKED, Duration.ofSeconds(1));
            List<byte[]> retained = allocateAndRecord();
            System.out.println("诊断负载已就绪");
            System.out.println("等待线程状态：" + waiter.getState());
            System.out.println("分配批次：" + retained.size());

            if (waitSeconds > 0) {
                TimeUnit.SECONDS.sleep(waitSeconds);
            }
            Reference.reachabilityFence(retained);
        } finally {
            releaseHolder.countDown();
            holder.join();
            waiter.join();
        }

        System.out.println("诊断负载已结束");
    }

    private static int parseWaitSeconds(String[] args) {
        if (args.length == 0) {
            return 0;
        }
        if (args.length != 1) {
            throw new IllegalArgumentException("只接受一个等待秒数参数");
        }
        int seconds = Integer.parseInt(args[0]);
        if (seconds < 0 || seconds > 300) {
            throw new IllegalArgumentException("等待秒数必须在 0 到 300 之间");
        }
        return seconds;
    }

    private static void holdMonitor(
            CountDownLatch holderReady,
            CountDownLatch releaseHolder
    ) {
        synchronized (MONITOR) {
            holderReady.countDown();
            try {
                releaseHolder.await();
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private static void waitForMonitor() {
        synchronized (MONITOR) {
            // 获取到监视器即表示诊断等待已经解除。
        }
    }

    private static void awaitState(
            Thread thread,
            Thread.State expected,
            Duration timeout
    ) {
        long deadline = System.nanoTime() + timeout.toNanos();
        while (thread.getState() != expected) {
            if (System.nanoTime() - deadline >= 0) {
                throw new IllegalStateException(
                        "线程未进入预期状态：" + expected
                );
            }
            Thread.onSpinWait();
        }
    }

    private static List<byte[]> allocateAndRecord() {
        CourseBatchEvent event = new CourseBatchEvent();
        event.begin();

        List<byte[]> retained = new ArrayList<>();
        for (int index = 0; index < BATCH_COUNT; index++) {
            retained.add(new byte[KIB_PER_BATCH * 1_024]);
        }

        event.batchCount = BATCH_COUNT;
        event.allocatedKiB = (long) BATCH_COUNT * KIB_PER_BATCH;
        event.end();
        event.commit();
        return retained;
    }
}
