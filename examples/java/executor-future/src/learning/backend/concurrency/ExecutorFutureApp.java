package learning.backend.concurrency;

import java.util.List;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

public final class ExecutorFutureApp {
    private ExecutorFutureApp() {
    }

    public static void main(String[] args) {
        try {
            runDemo();
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            System.err.println("主线程被中断，演示提前结束。");
        }
    }

    private static void runDemo() throws InterruptedException {
        try (LearningTaskExecutor executor = new LearningTaskExecutor(2)) {
            // submit 立即返回 Future；两个工作线程会从队列中逐个领取四个任务。
            List<Future<ActivityResult>> futures = List.of(
                    executor.submit(new ActivityJob("J-001", "Java 集合", 45, false)),
                    executor.submit(new ActivityJob("J-002", "Java 泛型", 60, false)),
                    executor.submit(new ActivityJob("J-003", "Java 集合", 30, false)),
                    executor.submit(new ActivityJob("J-004", "并发异常", 20, true))
            );

            for (Future<ActivityResult> future : futures) {
                printResult(future);
            }

            CountDownLatch waitingTaskStarted = new CountDownLatch(1);
            Future<Void> waiting = executor.submitInterruptibleWait(waitingTaskStarted);
            waitingTaskStarted.await();
            // true 表示允许通过 interrupt 请求正在执行的任务停止，但任务仍需正确响应中断。
            waiting.cancel(true);

            try {
                waiting.get();
            } catch (CancellationException error) {
                System.out.println("等待任务已取消：" + waiting.isCancelled());
            } catch (ExecutionException error) {
                System.out.println("等待任务失败：" + error.getCause().getMessage());
            }

            MetricsSnapshot snapshot = executor.metricsSnapshot();
            System.out.println("成功任务数：" + snapshot.succeeded());
            System.out.println("失败任务数：" + snapshot.failed());
            System.out.println("按主题分钟：" + snapshot.minutesByTopic());
        }
    }

    private static void printResult(Future<ActivityResult> future)
            throws InterruptedException {
        try {
            // get 在当前线程等待，并把任务的正常返回值取出来。
            ActivityResult result = future.get();
            System.out.println("完成：" + result.id());
        } catch (ExecutionException error) {
            // 工作线程的原始异常被 Future 包装；真正原因保存在 cause 中。
            Throwable cause = error.getCause();
            System.out.println("失败：" + cause.getMessage());
        }
    }
}
