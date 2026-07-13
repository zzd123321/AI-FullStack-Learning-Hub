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
            while (elements.size() == capacity) {
                notFull.await();
            }
            elements.add(element);
            notEmpty.signal();
        } finally {
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
