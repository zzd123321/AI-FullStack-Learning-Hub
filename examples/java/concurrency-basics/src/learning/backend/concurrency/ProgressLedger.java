package learning.backend.concurrency;

import java.util.HashMap;
import java.util.Map;

public final class ProgressLedger {
    private final Object lock = new Object();
    private final Map<String, Integer> minutesByLearner = new HashMap<>();
    private int totalMinutes;

    public void record(String learner, int minutes) {
        String normalizedLearner = requireLearner(learner);
        if (minutes <= 0) {
            throw new IllegalArgumentException("分钟数必须大于 0。");
        }

        synchronized (lock) {
            int learnerTotal = minutesByLearner.getOrDefault(normalizedLearner, 0);
            int updatedLearnerTotal = Math.addExact(learnerTotal, minutes);
            int updatedTotal = Math.addExact(totalMinutes, minutes);

            minutesByLearner.put(normalizedLearner, updatedLearnerTotal);
            totalMinutes = updatedTotal;
        }
    }

    public ProgressSnapshot snapshot() {
        synchronized (lock) {
            return new ProgressSnapshot(totalMinutes, minutesByLearner);
        }
    }

    private String requireLearner(String learner) {
        if (learner == null || learner.isBlank()) {
            throw new IllegalArgumentException("学习者不能为空。");
        }
        return learner.strip();
    }
}
