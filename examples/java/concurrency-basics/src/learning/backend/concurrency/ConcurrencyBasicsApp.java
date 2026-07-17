package learning.backend.concurrency;

public final class ConcurrencyBasicsApp {
    private ConcurrencyBasicsApp() {
    }

    public static void main(String[] args) {
        ProgressLedger ledger = new ProgressLedger();
        Thread[] workers = {
                new Thread(recordingTask(ledger, "小林", 1_000), "record-xiaolin"),
                new Thread(recordingTask(ledger, "小周", 1_000), "record-xiaozhou"),
                new Thread(recordingTask(ledger, "小林", 1_000), "record-xiaolin-2")
        };

        // start 才会创建并发执行；直接调用 worker.run() 仍只会在 main 线程顺序执行。
        for (Thread worker : workers) {
            worker.start();
        }

        // join 建立“工作线程完成 → 主线程读取结果”的先后关系，不能靠 sleep 猜完成时间。
        if (!joinAll(workers)) {
            System.err.println("主线程被中断，演示提前结束。");
            return;
        }

        ProgressSnapshot snapshot = ledger.snapshot();
        System.out.println("总分钟数：" + snapshot.totalMinutes());
        System.out.println("按学习者：" + snapshot.minutesByLearner());

        CooperativeReporter reporter = new CooperativeReporter();
        Thread reporterThread = new Thread(reporter, "progress-reporter");
        reporterThread.start();

        try {
            reporter.awaitStarted();
            // 停止标志表达业务意图，interrupt 用来唤醒可能正在阻塞的线程。
            reporter.requestStop();
            reporterThread.interrupt();
            reporterThread.join();
            System.out.println("报告任务已协作停止：" + reporter.stopped());
        } catch (InterruptedException error) {
            reporter.requestStop();
            reporterThread.interrupt();
            Thread.currentThread().interrupt();
            System.err.println("等待报告任务时被中断。");
        }
    }

    private static Runnable recordingTask(
            ProgressLedger ledger,
            String learner,
            int repetitions
    ) {
        return () -> {
            for (int count = 0; count < repetitions; count++) {
                if (Thread.currentThread().isInterrupted()) {
                    // 中断是协作信号，不会像强制终止那样自动停在任意一行。
                    return;
                }
                ledger.record(learner, 1);
            }
        };
    }

    private static boolean joinAll(Thread[] workers) {
        try {
            for (Thread worker : workers) {
                worker.join();
            }
            return true;
        } catch (InterruptedException error) {
            // 主线程不再等待时，也通知尚未结束的工作线程尽快退出。
            for (Thread worker : workers) {
                worker.interrupt();
            }
            Thread.currentThread().interrupt();
            return false;
        }
    }
}
