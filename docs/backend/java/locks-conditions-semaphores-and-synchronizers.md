---
title: Java Lock、Condition、Semaphore 与高级同步器
description: 使用显式锁、条件队列、许可和阶段协调工具构建可中断、可限时的并发组件
outline: deep
---

# Java `Lock`、`Condition`、`Semaphore` 与高级同步器

> 适用环境：JDK 25 LTS。完整示例兼容 JDK 17 和 21。

## 1. 学习目标

完成本节后，你应该能够：

- 判断普通 `synchronized` 是否已经足够，而不是为了“高级”盲目换锁。
- 正确使用 `ReentrantLock` 的 `lock`、`lockInterruptibly` 和 `tryLock`。
- 保证只在成功加锁后，于 `finally` 中释放锁。
- 使用多个 `Condition` 表达“非空”“未满”等不同等待条件。
- 解释为什么 `await` 必须写在 `while` 中，以及它如何释放并重新获取锁。
- 使用 `Semaphore` 限制数据库、HTTP 或昂贵计算的并发量。
- 区分互斥锁的所有权与信号量的许可计数。
- 按一次性门闩、可复用栅栏、动态阶段选择 `CountDownLatch`、`CyclicBarrier`、`Phaser`。
- 理解读写锁和 `StampedLock` 的适用边界。
- 识别死锁、活锁、饥饿、锁泄漏、许可泄漏和错误通知。
- 说明锁释放/获取与同步器操作建立的 happens-before 关系。

## 2. 先按问题选择工具

这些类名字相似，但解决的问题不同：

| 需求 | 首选工具 | 核心语义 |
| --- | --- | --- |
| 一次只允许一个线程修改状态 | `synchronized` / `ReentrantLock` | 互斥与内存可见性 |
| 等待受锁保护的状态满足条件 | `wait/notifyAll` / `Condition` | 条件等待 |
| 同时最多 N 个任务访问资源 | `Semaphore` | 许可计数 |
| 等待 N 个事件全部发生 | `CountDownLatch` | 一次性倒计数门闩 |
| 固定线程反复在阶段末会合 | `CyclicBarrier` | 可复用栅栏 |
| 参与方动态加入、退出多个阶段 | `Phaser` | 动态多阶段协调 |
| 读多写少且测量证明互斥锁是瓶颈 | `ReadWriteLock` | 多读单写 |
| 极短只读快照且允许乐观验证 | `StampedLock` | 带版本戳访问 |

线程池负责“任务在哪里执行”，同步器负责“任务何时可以继续”。二者不能互相替代。

## 3. `synchronized` 仍然是默认选择

```java
public synchronized void increment() {
    count++;
}
```

监视器锁在离开代码块时自动释放，异常路径也不会泄漏锁。简单互斥优先使用它，因为词法作用域清晰、错误面较小。

考虑 `Lock` 的常见理由是：

- 获取锁时需要响应中断。
- 等待锁需要超时或立即失败。
- 同一把锁需要多个条件队列。
- 算法确实需要跨词法作用域加解锁。
- 需要实现类明确提供的公平策略或监控信息。

不要仅凭性能猜测替换。现代 JVM 会优化内置锁，真实选择应由语义和基准数据决定。

## 4. `Lock` 的基本契约

`Lock` 是接口，最常用实现是 `ReentrantLock`。标准写法是：

```java
lock.lock();
try {
    updateSharedState();
} finally {
    lock.unlock();
}
```

`lock()` 必须紧挨 `try` 之前，`unlock()` 必须是 `finally` 中首先执行的动作。不能这样写：

```java
try {
    lock.lock();
    updateSharedState();
} finally {
    lock.unlock();
}
```

如果获取锁前线程被中断，或获取方法抛异常，错误版本仍会尝试解锁一个当前线程并未持有的锁，掩盖原始异常。

成功的 `unlock` 发生在另一个线程随后成功 `lock` 之前，因此锁不仅防止同时修改，也发布临界区内的写入。

## 5. 可重入不等于没有风险

`ReentrantLock` 允许持锁线程再次获取同一把锁：

```java
void outer() {
    lock.lock();
    try {
        inner();
    } finally {
        lock.unlock();
    }
}
```

每次成功获取都增加持有计数，每次 `unlock` 减少一次；次数不匹配仍会永久占锁。可重入只解决同线程嵌套进入，不解决多把锁的循环等待。

锁通常声明为 `private final`，避免外部代码参与同一同步协议。保护哪些字段、所有访问是否都持锁，也应写成清晰的不变量。

## 6. 响应中断与超时

普通 `lock()` 在等待时不会通过 `InterruptedException` 退出。需要可取消等待时使用：

```java
lock.lockInterruptibly();
try {
    updateSharedState();
} finally {
    lock.unlock();
}
```

限时获取：

```java
if (!lock.tryLock(200, TimeUnit.MILLISECONDS)) {
    return busyResponse;
}
try {
    return updateSharedState();
} finally {
    lock.unlock();
}
```

无参 `tryLock()` 立即成功或失败。限时版本还可能抛 `InterruptedException`，调用者必须区分“超时”“中断”“业务失败”。

捕获中断但无法继续向上抛时，通常恢复状态：

```java
catch (InterruptedException error) {
    Thread.currentThread().interrupt();
    return cancelledResult;
}
```

## 7. 公平锁的真实含义

```java
new ReentrantLock(true);
```

公平模式在竞争时倾向等待最久的线程，可降低饥饿概率，但往往牺牲吞吐量。它不保证操作系统线程调度公平，也不保证每个线程严格轮流执行。

无参 `tryLock()` 即使在公平锁上也会在锁空闲时插队。若必须尊重公平设置，应使用带时间的 `tryLock(0, unit)` 等契约明确的方法，并接受其开销。

默认使用非公平锁；只有明确的延迟、公平性要求和测量结果才能支持开启公平模式。

## 8. `Condition` 是绑定到锁的等待队列

每个 Java 对象监视器只有一个 `wait` 集合，而一把 `Lock` 可以创建多个 Condition：

```java
private final Lock lock = new ReentrantLock();
private final Condition notEmpty = lock.newCondition();
private final Condition notFull = lock.newCondition();
```

这让生产者只唤醒等待“未满”的线程，消费者只唤醒等待“非空”的线程，减少无关唤醒。

调用 `await`、`signal`、`signalAll` 时必须持有关联的锁，否则通常抛 `IllegalMonitorStateException`。Condition 不能脱离创建它的 Lock 使用。

## 9. `await` 的原子释放与重新获取

消费者等待非空：

```java
lock.lockInterruptibly();
try {
    while (queue.isEmpty()) {
        notEmpty.await();
    }
    return queue.remove();
} finally {
    lock.unlock();
}
```

`await()` 会原子地释放锁并挂起线程；返回前，它必须重新获取同一把锁。因此线程从 await 返回时仍位于受保护临界区内。

等待一定写 `while`，不能写 `if`，因为：

- Condition 允许虚假唤醒。
- signal 后，当前线程还要重新竞争锁。
- 在它拿到锁前，另一个线程可能已改变状态。
- 一次唤醒不等于业务条件仍成立。

Condition 等待有可中断、不可中断、限时和截止时间变体。选择必须匹配上层取消与超时契约。

## 10. `signal` 只是通知，不是交接数据

生产者入队后：

```java
queue.add(element);
notEmpty.signal();
```

`signal()` 把一个等待者转移到重新竞争锁的状态；被通知线程不能在通知者释放锁前继续。它不保证被唤醒线程立刻运行，也不直接把某个元素交给它。

使用 `signal` 的前提是：所有等待者等待同类条件，而且一次状态变化足以让一个等待者推进。无法证明时使用 `signalAll` 更安全，让每个等待者在 while 中重查条件。

先修改受保护状态，再发送通知；否则等待者醒来仍看不到满足的条件。

## 11. 有界队列中的两个条件

本课示例实现了一个最小有界阻塞队列：

- `put` 在队列满时等待 `notFull`。
- `take` 在队列空时等待 `notEmpty`。
- 成功放入后 signal 一个消费者。
- 成功取出后 signal 一个生产者。
- 所有队列状态都由同一把锁保护。

生产代码优先使用 JDK 已验证的 `ArrayBlockingQueue`、`LinkedBlockingQueue` 等 BlockingQueue。手写队列用于理解协议，不应轻易替代标准库。

## 12. `Semaphore` 管理许可，不拥有临界区

```java
Semaphore permits = new Semaphore(20);

permits.acquire();
try {
    callRemoteService();
} finally {
    permits.release();
}
```

初始许可为 20，表示最多 20 个调用同时进入。它适合限制连接、第三方 API、GPU 任务或内存昂贵操作的并发数。

与 `Lock` 的关键区别：

- Semaphore 没有“当前持有线程”的所有权概念。
- 一个线程可 acquire，另一个线程可 release。
- 许可数可以大于 1。
- 它控制容量，不自动保护复合状态不变量。

二元信号量只有一个许可，也不等同于可重入锁；持有它的线程再次 acquire 会阻塞自己。

## 13. 防止许可泄漏或凭空增加

只有成功获取后才能释放。错误写法：

```java
try {
    permits.acquire();
    useResource();
} finally {
    permits.release();
}
```

若 acquire 被中断，finally 仍增加一个从未获取的许可。应把 acquire 放在 try 前，或记录状态：

```java
boolean acquired = false;
try {
    acquired = permits.tryAcquire(200, TimeUnit.MILLISECONDS);
    if (!acquired) {
        return overloadedResult;
    }
    return useResource();
} finally {
    if (acquired) {
        permits.release();
    }
}
```

一次获取多个许可可能引发更复杂的饥饿和容量规划。`availablePermits()` 适合监控或诊断，不适合先检查再决定 acquire，因为检查和获取不是同一个原子操作。

release 前的操作 happens-before 另一个线程成功 acquire 后的操作，但仍需建立清晰的数据所有权。

## 14. 信号量公平性与后端限流边界

`new Semaphore(n, true)` 采用先进先出倾向的公平策略，代价与公平锁类似。无参 `tryAcquire()` 不遵守公平排序。

Semaphore 是进程内并发门，不等于完整限流器：

- 它不表达“每秒 N 次”的速率。
- 多实例部署时，各 JVM 的许可彼此独立。
- 它不会自动设置排队上限和请求截止时间。
- 下游连接池可能有更小容量。

后端系统要同时考虑入口队列、线程/虚拟线程数量、信号量许可、连接池、客户端超时和全局限流。

## 15. `CountDownLatch`：一次性事件门闩

```java
CountDownLatch ready = new CountDownLatch(workerCount);
CountDownLatch start = new CountDownLatch(1);
```

每个工作线程就绪后 `ready.countDown()`，主线程 `ready.await()`；主线程准备完毕后 `start.countDown()`，所有工作线程继续。

重要语义：

- 计数只能减少，降到零后不能重置。
- `countDown()` 不会阻塞。
- `await()` 可无限、可限时等待，并响应中断。
- 某线程在 countDown 前的操作 happens-before 另一个线程从对应 await 成功返回后的操作。

门闩本身不会传播工作线程异常。通过 Executor 提交任务时，需要保留 Future、收集错误，或使用能显式传播失败的更高层机制。

## 16. `CyclicBarrier`：固定参与者反复会合

```java
CyclicBarrier barrier = new CyclicBarrier(
        workerCount,
        this::mergePartialResults
);
```

每个参与线程完成一轮后调用 await；最后到达的线程执行可选 barrier action，然后释放本轮所有线程。之后栅栏可进入下一轮，因此称为 cyclic。

若等待线程被中断、超时或栅栏动作失败，栅栏可能进入 broken 状态，其他等待者收到 `BrokenBarrierException`。不要在不理解其他参与者状态时随意 reset；通常应取消整个协作任务并重建协调对象。

固定数量的并行迭代适合 CyclicBarrier。只想等待若干独立任务完成，CountDownLatch 更直接。

## 17. `Phaser`：动态参与方与多阶段流程

Phaser 把注册、到达和等待分开：

```java
int phase = phaser.arrive();
phaser.awaitAdvance(phase);
```

任务可用 `register`/`bulkRegister` 动态加入，用 `arriveAndDeregister` 到达并退出。它适合阶段数量不固定或参与者动态变化的工作流。

常见风险：

- 注册后异常退出却没有 deregister，其他线程永久等待。
- 混淆“到达但继续”“到达并等待”“到达并注销”。
- 没有为取消、强制终止和超时设计策略。
- 阶段推进后仍使用旧 phase 做错误判断。

Phaser 功能强但协议复杂。参与者固定时优先使用更简单的工具。

## 18. `ReadWriteLock` 不保证更快

`ReentrantReadWriteLock` 允许多个读者并发，写者独占。只有读操作足够长、读远多于写、竞争明显时，它才可能优于普通互斥锁。

短临界区中，读写锁的计数、队列和调度成本可能更高。读线程仍会争用共享内部状态，写操作也会阻塞所有读者。

锁降级通常可行：持有写锁时先获取读锁，再释放写锁。不要在持有读锁时直接等待写锁；多个读者同时升级可能互相等待。需要写时，释放读锁、获取写锁并重新检查状态。

## 19. `StampedLock` 的乐观读

```java
long stamp = lock.tryOptimisticRead();
double currentX = x;
double currentY = y;

if (!lock.validate(stamp)) {
    stamp = lock.readLock();
    try {
        currentX = x;
        currentY = y;
    } finally {
        lock.unlockRead(stamp);
    }
}
```

乐观读没有真正获取读锁，必须先复制一致性快照所需的全部字段，再 validate。验证失败就回退到读锁，并重新读取全部字段。

StampedLock 的危险边界：

- 它不可重入，嵌套获取可能自锁。
- 每次解锁必须使用匹配模式的有效 stamp。
- 乐观读期间字段可能正在变化，不能在验证前执行依赖一致性的副作用。
- 它不提供 Condition。
- 调度策略不保证公平，等待者可能饥饿。

只有性能剖析证明读路径需要它，并且不变量足够简单时才考虑使用。

## 20. 其他协调工具

- `Exchanger<V>`：两个线程在会合点交换对象，适合双缓冲或流水线配对。
- `BlockingQueue<E>`：把容量、等待和线程安全封装成生产者—消费者通道，通常优于手写 Condition。
- `SynchronousQueue<E>`：容量为零，每次 put 必须与 take 直接交接。
- `CompletableFuture`：表达异步结果依赖，不是共享可变状态的互斥锁。
- `ForkJoinPool`：负责工作窃取调度，不替代业务容量限制。

`AbstractQueuedSynchronizer` 是许多同步器实现的底层框架，而不是普通业务代码应直接采用的首选 API。

## 21. 死锁、活锁与饥饿

死锁通常需要互斥、持有并等待、不可抢占、循环等待同时成立。工程中常用的预防方法：

- 为多把锁定义全局顺序，并在所有路径按同一顺序获取。
- 缩小临界区，不在持锁时进行远程 IO、长时间计算或未知回调。
- 用带超时的 tryLock，失败后释放已持有锁并退避。
- 优先使用并发集合、消息传递和不可变快照，减少多锁协议。
- 监控线程转储中的 BLOCKED、WAITING 和锁拥有关系。

活锁是线程不断响应彼此却没有进展，例如两个任务同时释放、同时重试。加入随机或指数退避并明确优先级。

饥饿是某个任务长期拿不到 CPU、锁或许可。公平模式只能处理部分排队问题，无法修复过长临界区、线程优先级滥用或资源过载。

## 22. 完整示例：有界学习任务流水线

::: code-group

<<< ../../../examples/java/locks-and-synchronizers/src/learning/backend/synchronization/BoundedTaskQueue.java{java:line-numbers} [BoundedTaskQueue.java]

<<< ../../../examples/java/locks-and-synchronizers/src/learning/backend/synchronization/LimitedTaskProcessor.java{java:line-numbers} [LimitedTaskProcessor.java]

<<< ../../../examples/java/locks-and-synchronizers/src/learning/backend/synchronization/SynchronizerApp.java{java:line-numbers} [SynchronizerApp.java]

:::

编译：

```bash
cd examples/java/locks-and-synchronizers
mkdir -p out
javac --release 17 -Xlint:all -d out \
  src/learning/backend/synchronization/BoundedTaskQueue.java \
  src/learning/backend/synchronization/LimitedTaskProcessor.java \
  src/learning/backend/synchronization/SynchronizerApp.java
```

运行：

```bash
java -cp out learning.backend.synchronization.SynchronizerApp
```

预期输出：

```text
已处理：4
结果：[API, JVM, LOCK, SPRING]
并发上限：2
队列剩余：0
```

执行过程：

1. 主线程创建容量为 2 的队列、3 个工作线程和 2 个处理许可。
2. 工作线程用 ready 门闩报告就绪，再在 start 门闩等待统一开始。
3. 主线程放入 4 个任务；队列满时 put 在 notFull Condition 上等待。
4. 工作线程用 take 获取任务；队列空时在 notEmpty Condition 上等待。
5. 处理器先 acquire Semaphore，因此 3 个工作线程中最多 2 个同时处理。
6. 每个工作线程读到自己的停止标记后退出；运行时失败写入错误通道，并在 finally 中 countDown done。
7. 主线程限时等待 done，先检查工作线程错误，再排序并发容器中的结果，使控制台输出不受调度顺序影响。
8. finally 调用 shutdownNow，并限时等待线程池终止，避免进程泄漏工作线程。

示例刻意手写有界队列用于展示 Condition。真实项目应优先采用 BlockingQueue，并让任务失败通过 Future、错误通道或结构化的任务边界传播。

## 23. JavaScript 对照

浏览器和 Node.js 的普通 JavaScript 通常在一个事件循环线程执行，异步函数交错运行但不会因为 `await` 自动形成 Java 式共享内存多线程。Promise 表示未来结果，不是锁或信号量。

| Java | JavaScript 中较接近的概念 |
| --- | --- |
| ReentrantLock | 用户态 mutex 库；浏览器 Web Locks API 解决的是另一类跨上下文资源协调 |
| Condition.await | 等待某个 Promise/事件，但 JS 没有相同的锁原子释放语义 |
| Semaphore | p-limit、连接池或自建并发许可队列 |
| CountDownLatch | Promise.all 等待一组一次性任务 |
| CyclicBarrier/Phaser | 通常需要按业务阶段自行组合 Promise |
| Java 共享内存锁 | Worker + SharedArrayBuffer + Atomics 才进入更接近的共享内存领域 |

Java `await` 会释放锁、挂起线程并在返回前重新拿锁；JavaScript `await` 会暂停当前 async 函数并把后续放入事件循环调度，两者名字相似但执行模型完全不同。

## 24. 常见错误

- 用 ReentrantLock 替换所有 synchronized，却没有需要其额外能力。
- 未在 finally 解锁，异常后永久泄漏锁。
- 获取失败或被中断后仍 unlock/release。
- Condition.await 使用 if，醒来后不重新检查条件。
- 没持有关联锁就 await、signal 或 signalAll。
- 修改状态前发送 signal，或通知错误的 Condition。
- 持锁执行数据库、HTTP、日志回调或用户提供的函数。
- 把 Semaphore 当互斥锁，忽略它没有线程所有权且不可重入。
- 用 availablePermits 做先检查后获取的竞态逻辑。
- CountDownLatch 计数与实际任务数不一致，或误以为它可以重置。
- 工作任务失败，却只等待门闩而不收集异常。
- CyclicBarrier 某个参与者退出后，其他线程永久等不到固定数量。
- Phaser 注册后忘记注销。
- 在持有读锁时直接升级写锁。
- StampedLock 乐观读未 validate，或解锁时使用错误 stamp。
- 多把锁没有统一顺序，超时重试也没有退避。

## 25. 排查顺序

1. 写出共享状态及其唯一保护机制，检查是否存在绕过锁的访问。
2. 查每个 lock/acquire/register 是否在所有成功路径上精确配对释放。
3. 检查 Condition 等待是否持锁、使用 while，并在状态改变后通知。
4. 标出临界区内的阻塞 IO、长计算、回调和嵌套锁。
5. 为多锁绘制获取顺序，寻找环。
6. 区分线程是在等锁、等 Condition、等许可还是等阶段推进。
7. 获取线程转储，结合锁拥有者、等待时间、队列长度和许可数判断瓶颈。
8. 检查中断是否被吞掉、限时等待是否区分超时与取消。
9. 检查门闩/栅栏参与者失败时，异常和取消是否传播给其他线程。
10. 用压力测试和性能分析验证工具选择，不凭单次运行推断公平性或吞吐量。

## 26. 本节总结

- 简单互斥优先使用 synchronized；需要中断、超时、多条件或特殊策略时再使用 Lock。
- ReentrantLock 每次成功获取都必须在 finally 中精确释放。
- Condition 绑定 Lock；await 原子释放锁并在返回前重新获取，条件必须用 while 重查。
- signal 是唤醒竞争者，不是直接移交执行权；无法证明单唤醒安全时使用 signalAll。
- Semaphore 用许可表达容量，不具备锁所有权，也不等于速率限制器。
- 只有成功 acquire 后才能 release，后端容量应与线程池、连接池和超时统一规划。
- CountDownLatch 是一次性的，CyclicBarrier 可复用，Phaser 支持动态多阶段参与者。
- ReadWriteLock 和 StampedLock 只在测量证明有价值时使用，复杂度本身有成本。
- 锁和同步器既提供协调，也建立内存可见性；共享状态仍需一致的保护协议。
- 生产者—消费者场景优先使用 BlockingQueue 等成熟组件，减少手写同步协议。

下一节：[Java 虚拟线程、结构化并发与 ScopedValue](/backend/java/virtual-threads-structured-concurrency-and-scoped-values)。

## 27. 参考资料

- [Java SE 25：`Lock` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/locks/Lock.html)
- [Java SE 25：`ReentrantLock` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/locks/ReentrantLock.html)
- [Java SE 25：`Condition` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/locks/Condition.html)
- [Java SE 25：`Semaphore` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Semaphore.html)
- [Java SE 25：`CountDownLatch` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/CountDownLatch.html)
- [Java SE 25：`CyclicBarrier` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/CyclicBarrier.html)
- [Java SE 25：`Phaser` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Phaser.html)
- [Java SE 25：`ReadWriteLock` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/locks/ReadWriteLock.html)
- [Java SE 25：`StampedLock` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/locks/StampedLock.html)
