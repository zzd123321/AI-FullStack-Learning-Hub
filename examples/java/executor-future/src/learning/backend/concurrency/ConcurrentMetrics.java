package learning.backend.concurrency;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.LongAdder;

public final class ConcurrentMetrics {
    private final LongAdder succeeded = new LongAdder();
    private final LongAdder failed = new LongAdder();
    private final ConcurrentHashMap<String, LongAdder> minutesByTopic =
            new ConcurrentHashMap<>();

    public void recordSuccess(String topic, int minutes) {
        minutesByTopic.computeIfAbsent(topic, ignored -> new LongAdder()).add(minutes);
        succeeded.increment();
    }

    public void recordFailure() {
        failed.increment();
    }

    public MetricsSnapshot snapshot() {
        Map<String, Long> topicCopy = new HashMap<>();
        minutesByTopic.forEach((topic, counter) -> topicCopy.put(topic, counter.sum()));
        return new MetricsSnapshot(succeeded.sum(), failed.sum(), topicCopy);
    }
}
