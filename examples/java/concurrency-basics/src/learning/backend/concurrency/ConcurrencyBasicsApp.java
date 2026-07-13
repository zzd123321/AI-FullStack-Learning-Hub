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

        for (Thread worker : workers) {
            worker.start();
        }

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
            for (Thread worker : workers) {
                worker.interrupt();
            }
            Thread.currentThread().interrupt();
            return false;
        }
    }
}
