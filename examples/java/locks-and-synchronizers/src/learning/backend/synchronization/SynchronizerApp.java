package learning.backend.synchronization;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public final class SynchronizerApp {
    private static final String STOP = "<STOP>";
    private static final int WORKER_COUNT = 3;

    private SynchronizerApp() {
    }

    public static void main(String[] args) throws InterruptedException {
        BoundedTaskQueue<String> queue = new BoundedTaskQueue<>(2);
        LimitedTaskProcessor processor = new LimitedTaskProcessor(2);
        ConcurrentLinkedQueue<String> results = new ConcurrentLinkedQueue<>();
        ConcurrentLinkedQueue<RuntimeException> failures = new ConcurrentLinkedQueue<>();
        CountDownLatch ready = new CountDownLatch(WORKER_COUNT);
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(WORKER_COUNT);
        ExecutorService executor = Executors.newFixedThreadPool(WORKER_COUNT);

        try {
            for (int index = 0; index < WORKER_COUNT; index++) {
                executor.submit(() -> runWorker(
                        queue, processor, results, failures, ready, start, done
                ));
            }

            if (!ready.await(1, TimeUnit.SECONDS)) {
                throw new IllegalStateException("工作线程未按时就绪");
            }
            // 所有 worker 就绪后一次性打开起跑门，避免启动快慢干扰并发演示。
            start.countDown();

            // 有界队列满时 put 会等待消费者腾出空间，这就是生产者背压。
            for (String task : List.of("lock", "api", "spring", "jvm")) {
                queue.put(task);
            }
            // 每个 worker 需要一个停止标记，否则部分线程会永远阻塞在 take。
            for (int index = 0; index < WORKER_COUNT; index++) {
                queue.put(STOP);
            }

            if (!done.await(2, TimeUnit.SECONDS)) {
                throw new IllegalStateException("任务处理超时");
            }
            if (!failures.isEmpty()) {
                throw new IllegalStateException("工作线程处理失败", failures.peek());
            }

            List<String> sortedResults = new ArrayList<>(results);
            sortedResults.sort(String::compareTo);
            System.out.println("已处理：" + sortedResults.size());
            System.out.println("结果：" + sortedResults);
            System.out.println("并发上限：" + processor.parallelism());
            System.out.println("队列剩余：" + queue.size());
        } finally {
            executor.shutdownNow();
            if (!executor.awaitTermination(1, TimeUnit.SECONDS)) {
                System.err.println("线程池未按时终止");
            }
        }
    }

    private static void runWorker(
            BoundedTaskQueue<String> queue,
            LimitedTaskProcessor processor,
            ConcurrentLinkedQueue<String> results,
            ConcurrentLinkedQueue<RuntimeException> failures,
            CountDownLatch ready,
            CountDownLatch start,
            CountDownLatch done
    ) {
        ready.countDown();
        try {
            // worker 先报告就绪，再等待主线程统一放行。
            start.await();
            while (true) {
                String task = queue.take();
                if (STOP.equals(task)) {
                    return;
                }
                results.add(processor.process(task));
            }
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
        } catch (RuntimeException error) {
            failures.add(error);
        } finally {
            // 无论正常停止、中断还是业务失败，主线程都必须知道这个 worker 已结束。
            done.countDown();
        }
    }
}
