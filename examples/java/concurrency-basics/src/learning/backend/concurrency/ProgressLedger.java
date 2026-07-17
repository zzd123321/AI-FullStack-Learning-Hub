package learning.backend.concurrency;

import java.util.HashMap;
import java.util.Map;

public final class ProgressLedger {
    // 所有需要保持一致的共享状态都由同一个 lock 保护。
    private final Object lock = new Object();
    private final Map<String, Integer> minutesByLearner = new HashMap<>();
    private int totalMinutes;

    public void record(String learner, int minutes) {
        String normalizedLearner = requireLearner(learner);
        if (minutes <= 0) {
            throw new IllegalArgumentException("分钟数必须大于 0。");
        }

        synchronized (lock) {
            // 读取旧值、计算两个新值、写回必须作为一个整体，不能被另一线程插入。
            int learnerTotal = minutesByLearner.getOrDefault(normalizedLearner, 0);
            int updatedLearnerTotal = Math.addExact(learnerTotal, minutes);
            int updatedTotal = Math.addExact(totalMinutes, minutes);

            minutesByLearner.put(normalizedLearner, updatedLearnerTotal);
            totalMinutes = updatedTotal;
        }
    }

    public ProgressSnapshot snapshot() {
        synchronized (lock) {
            // 在同一把锁内同时读取总数和明细，快照不会混合两个时刻的状态。
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
