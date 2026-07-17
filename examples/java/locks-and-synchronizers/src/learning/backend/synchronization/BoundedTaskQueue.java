package learning.backend.synchronization;

import java.util.ArrayDeque;
import java.util.Objects;
import java.util.Queue;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;

public final class BoundedTaskQueue<T> {
    private final Queue<T> elements = new ArrayDeque<>();
    private final int capacity;
    private final ReentrantLock lock = new ReentrantLock();
    // 两个 Condition 共享同一把锁，但分别唤醒“等数据”和“等空间”的线程。
    private final Condition notEmpty = lock.newCondition();
    private final Condition notFull = lock.newCondition();

    public BoundedTaskQueue(int capacity) {
        if (capacity <= 0) {
            throw new IllegalArgumentException("capacity 必须大于 0");
        }
        this.capacity = capacity;
    }

    public void put(T element) throws InterruptedException {
        Objects.requireNonNull(element, "element");
        lock.lockInterruptibly();
        try {
            // 被唤醒后条件可能已被其他线程改变，所以必须重新用 while 检查。
            while (elements.size() == capacity) {
                // await 会原子地释放 lock；返回前会重新获取 lock。
                notFull.await();
            }
            elements.add(element);
            // 新元素到达后，唤醒一个等待“非空”的消费者。
            notEmpty.signal();
        } finally {
            // 只有成功获得锁后才进入 try；任何退出路径都必须释放。
            lock.unlock();
        }
    }

    public T take() throws InterruptedException {
        lock.lockInterruptibly();
        try {
            while (elements.isEmpty()) {
                notEmpty.await();
            }
            T element = elements.remove();
            notFull.signal();
            return element;
        } finally {
            lock.unlock();
        }
    }

    public int size() {
        lock.lock();
        try {
            return elements.size();
        } finally {
            lock.unlock();
        }
    }
}
