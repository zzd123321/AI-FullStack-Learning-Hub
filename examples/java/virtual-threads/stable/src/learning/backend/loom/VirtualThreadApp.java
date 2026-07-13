package learning.backend.loom;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.Semaphore;

public final class VirtualThreadApp {
    private static final int DOWNSTREAM_LIMIT = 2;

    private VirtualThreadApp() {
    }

    public static void main(String[] args)
            throws InterruptedException, ExecutionException {
        Semaphore downstreamPermits = new Semaphore(DOWNSTREAM_LIMIT);
        List<Future<FetchResult>> futures = new ArrayList<>();

        try (ExecutorService executor =
                     Executors.newVirtualThreadPerTaskExecutor()) {
            for (String resource : List.of("spring", "jvm", "api", "lock")) {
                futures.add(executor.submit(
                        () -> fetch(resource, downstreamPermits)
                ));
            }

            List<FetchResult> results = new ArrayList<>();
            for (Future<FetchResult> future : futures) {
                results.add(future.get());
            }
            results.sort((left, right) -> left.value().compareTo(right.value()));

            boolean allVirtual = results.stream().allMatch(FetchResult::virtual);
            List<String> values = results.stream().map(FetchResult::value).toList();
            System.out.println("全部为虚拟线程：" + allVirtual);
            System.out.println("结果：" + values);
            System.out.println("下游并发上限：" + DOWNSTREAM_LIMIT);
        }
    }

    private static FetchResult fetch(
            String resource,
            Semaphore downstreamPermits
    ) throws InterruptedException {
        downstreamPermits.acquire();
        try {
            Thread.sleep(20);
            return new FetchResult(resource, Thread.currentThread().isVirtual());
        } finally {
            downstreamPermits.release();
        }
    }

    private record FetchResult(String value, boolean virtual) {
    }
}
