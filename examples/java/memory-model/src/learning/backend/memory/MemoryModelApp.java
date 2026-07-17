package learning.backend.memory;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public final class MemoryModelApp {
    private MemoryModelApp() {
    }

    public static void main(String[] args)
            throws InterruptedException, ExecutionException {
        SnapshotPublisher publisher = new SnapshotPublisher();
        CountDownLatch readerReady = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(4);

        try {
            Future<LearningSnapshot> reader = executor.submit(() -> {
                // latch 只证明读取任务已开始，不代表它已经看见稍后发布的数据。
                readerReady.countDown();
                return publisher.await(Duration.ofSeconds(2));
            });

            if (!readerReady.await(1, TimeUnit.SECONDS)) {
                throw new IllegalStateException("读取线程未按时就绪");
            }

            Future<?> writer = executor.submit(() -> publisher.publish(
                    new LearningSnapshot(
                            18,
                            "Java 内存模型",
                            List.of("happens-before", "volatile", "final")
                    )
            ));
            // Future.get 不只是等待：任务完成还 happens-before get 返回后的读取。
            writer.get();
            LearningSnapshot snapshot = reader.get();

            AtomicInteger completedUpdates = new AtomicInteger();
            List<Future<?>> updates = new ArrayList<>();
            for (int worker = 0; worker < 4; worker++) {
                updates.add(executor.submit(() -> {
                    for (int index = 0; index < 1_000; index++) {
                        // 多线程共享的 ++ 不是原子操作；AtomicInteger 把读改写合成一个原子更新。
                        completedUpdates.incrementAndGet();
                    }
                }));
            }
            for (Future<?> update : updates) {
                update.get();
            }

            System.out.println("版本：" + snapshot.version());
            System.out.println("课程：" + snapshot.course());
            System.out.println("主题：" + snapshot.topics());
            System.out.println("原子计数：" + completedUpdates.get());
        } finally {
            executor.shutdownNow();
            if (!executor.awaitTermination(1, TimeUnit.SECONDS)) {
                System.err.println("线程池未按时终止");
            }
        }
    }
}
