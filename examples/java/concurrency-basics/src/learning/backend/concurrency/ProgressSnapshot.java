package learning.backend.concurrency;

import java.util.Collections;
import java.util.Map;
import java.util.TreeMap;

public record ProgressSnapshot(
        int totalMinutes,
        Map<String, Integer> minutesByLearner
) {
    public ProgressSnapshot {
        if (totalMinutes < 0) {
            throw new IllegalArgumentException("总分钟数不能为负数。");
        }
        minutesByLearner = Collections.unmodifiableMap(
                new TreeMap<>(minutesByLearner)
        );
    }
}
