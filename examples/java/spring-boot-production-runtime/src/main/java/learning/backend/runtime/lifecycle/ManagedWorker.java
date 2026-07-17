package learning.backend.runtime.lifecycle;

import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;

@Component
public final class ManagedWorker implements SmartLifecycle {
    private final AtomicBoolean running = new AtomicBoolean();

    @Override
    public void start() {
        // 真实组件可在这里启动消费循环；示例只记录生命周期状态。
        running.set(true);
    }

    @Override
    public void stop(Runnable callback) {
        try {
            // 真实组件应停止领取新任务，并在超时边界内等待已领取任务完成。
            running.set(false);
        } finally {
            // 必须调用 callback，Spring 才知道这个异步停止阶段已经结束。
            callback.run();
        }
    }

    @Override
    public void stop() {
        running.set(false);
    }

    @Override
    public boolean isRunning() {
        return running.get();
    }

    @Override
    public int getPhase() {
        // phase 越大启动越晚、停止越早；后台入口应先于底层资源停止。
        return 1_000;
    }
}
