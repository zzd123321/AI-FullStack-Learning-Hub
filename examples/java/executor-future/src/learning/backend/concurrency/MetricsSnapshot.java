package learning.backend.concurrency;

import java.util.Collections;
import java.util.Map;
import java.util.TreeMap;

public record MetricsSnapshot(
        long succeeded,
        long failed,
        Map<String, Long> minutesByTopic
) {
    public MetricsSnapshot {
        minutesByTopic = Collections.unmodifiableMap(
                new TreeMap<>(minutesByTopic)
        );
    }
}
