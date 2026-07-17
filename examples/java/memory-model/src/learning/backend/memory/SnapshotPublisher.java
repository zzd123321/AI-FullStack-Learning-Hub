package learning.backend.memory;

import java.time.Duration;
import java.util.Objects;

public final class SnapshotPublisher {
    // volatile 发布的是整个不可变快照引用；它不把普通可变对象自动变成线程安全。
    private volatile LearningSnapshot latest;

    public void publish(LearningSnapshot snapshot) {
        // volatile 写与随后观察到该值的 volatile 读建立 happens-before。
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
            // 这是用于演示可见性的短暂自旋，普通业务等待通常应使用阻塞同步工具。
            Thread.onSpinWait();
        }
        return observed;
    }
}
