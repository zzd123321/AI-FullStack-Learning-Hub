package learning.backend.memory;

import java.time.Duration;
import java.util.Objects;

public final class SnapshotPublisher {
    private volatile LearningSnapshot latest;

    public void publish(LearningSnapshot snapshot) {
        latest = Objects.requireNonNull(snapshot, "snapshot");
    }

    public LearningSnapshot await(Duration timeout) {
        Objects.requireNonNull(timeout, "timeout");
        if (timeout.isNegative() || timeout.isZero()) {
            throw new IllegalArgumentException("timeout 必须大于 0");
        }

        long deadline = System.nanoTime() + timeout.toNanos();
        LearningSnapshot observed;
        while ((observed = latest) == null) {
            if (System.nanoTime() - deadline >= 0) {
                throw new IllegalStateException("等待学习快照超时");
            }
            Thread.onSpinWait();
        }
        return observed;
    }
}
