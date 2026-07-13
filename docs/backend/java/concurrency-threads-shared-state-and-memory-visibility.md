---
title: Java 并发基础、线程生命周期、共享状态与内存可见性
description: 理解线程、竞态、Java 内存模型、happens-before、synchronized、volatile 与协作式中断
outline: deep
---

# Java 并发基础、线程生命周期、共享状态与内存可见性

> 适用环境：JDK 25 LTS。完整示例兼容 JDK 17 和 21；虚拟线程自 JDK 21 成为正式特性，本节会单独标注。

## 1. 学习目标

完成本节后，你应该能够：

- 区分并发、并行、异步和多线程。
- 解释进程、平台线程、虚拟线程与任务之间的关系。
- 正确使用 `start`、`run`、`join`、`sleep` 和线程状态。
- 识别数据竞争、竞态条件、丢失更新和检查后执行问题。
- 区分原子性、可见性和有序性。
- 用 happens-before 判断一个线程的写入何时对另一个线程可见。
- 使用 `synchronized` 保护复合不变量，并正确选择锁对象。
- 理解 `volatile` 能保证什么、不能保证什么。
- 正确响应 `InterruptedException`，避免吞掉中断。
- 使用不可变快照、线程封闭和消息传递减少共享可变状态。
- 理解死锁、活锁和饥饿的基本成因。
- 说明虚拟线程适合什么负载，以及为什么它不自动解决线程安全。
- 使用线程转储和确定性同步工具排查并发问题。

## 2. 并发、并行与异步不是同义词

- **并发（concurrency）**：多个任务在同一时间段内推进，关注任务组织与交错。
- **并行（parallelism）**：多个任务在同一时刻真正执行，通常需要多个处理器核心。
- **异步（asynchrony）**：发起操作后不在当前调用栈同步等待结果，关注控制流和完成通知。
- **多线程**：使用多个线程执行，是实现并发的一种方式。

单核机器可以通过时间片让多个线程并发，但不能同时执行多个 CPU 指令流。多核机器也不会让所有多线程程序自然获得加速：锁竞争、内存访问、调度和串行部分都可能成为瓶颈。

## 3. 进程、线程与任务

```text
操作系统进程 / JVM
├─ 堆：对象通常可被多个线程共享
├─ 方法区等 JVM 运行时结构
└─ 多个线程
   ├─ 各自的调用栈、程序计数等
   └─ 执行 Runnable / Callable 等任务
```

线程是执行载体，任务是要执行的工作：

```java
Runnable task = () -> System.out.println("执行任务");
Thread thread = new Thread(task, "worker-1");
```

把任务与线程分开有利于后续交给 Executor 管理，而不是让业务类继承 Thread。

## 4. `start()` 与 `run()` 完全不同

```java
Thread worker = new Thread(task);
worker.start();
```

`start()` 请求 JVM 调度新线程，新线程随后调用 `run()`。调用者与新线程可以并发推进。

```java
worker.run();
```

直接调用 `run()` 只是当前线程上的普通方法调用，不会创建并发执行。这个错误经常让测试看似正确，因为所有代码仍按顺序执行。

同一个 Thread 对象最多启动一次；第二次调用 `start()` 会抛 `IllegalThreadStateException`。需要再次执行任务就创建新 Thread 或提交给 Executor。

## 5. 线程状态

`Thread.State` 定义六种 JVM 线程状态：

| 状态 | 含义 |
| --- | --- |
| `NEW` | 已创建但尚未 start |
| `RUNNABLE` | 正在 JVM 中执行或等待 CPU 等执行资源 |
| `BLOCKED` | 等待进入 synchronized 监视器 |
| `WAITING` | 无限期等待另一个动作，例如无超时 join/wait |
| `TIMED_WAITING` | 有期限等待，例如 sleep 或带超时 join |
| `TERMINATED` | run 已正常或异常结束 |

这些是 JVM 级状态，不与操作系统状态一一对应。例如 RUNNABLE 同时覆盖实际运行和某些可运行等待情况。

`getState()` 只是观测瞬间快照，返回后状态可能立刻改变，不能用它实现同步协议。

## 6. 调度顺序不可预测

```java
new Thread(() -> System.out.println("A")).start();
new Thread(() -> System.out.println("B")).start();
```

不能保证打印 A 后 B。线程调度受操作系统、JVM、负载、锁、缓存和时机影响。

以下做法不能建立正确顺序：

- 调整线程优先级。
- 调用 `yield()`。
- 猜一个 sleep 时长。
- 在本机运行一百次都没失败。

需要顺序就使用 join、锁、Latch、队列、Future 或其他明确同步关系。

## 7. `sleep`、`join` 和锁

### `Thread.sleep`

让当前线程至少暂停大致指定时间，受计时器和调度精度影响：

```java
Thread.sleep(100);
```

sleep：

- 不保证精确唤醒时刻。
- 可被中断。
- **不会释放当前持有的监视器锁**。
- 不应被当作线程协调条件。

### `join`

等待目标线程终止：

```java
worker.start();
worker.join();
```

目标线程终止 happens-before 另一个线程从成功 join 返回，所以 join 不只是“等一下”，还建立内存可见性关系。

带超时 join 返回时，线程可能仍在运行，应检查 `isAlive()` 或使用返回状态更明确的高级 API。

## 8. 什么是共享可变状态

同时满足三点就需要警惕：

1. 一个对象或变量可被多个线程访问。
2. 至少一个线程会修改它。
3. 访问之间没有正确同步。

局部变量本身通常在线程栈中，但它引用的对象可能被发布给其他线程。`final List<T>` 只保证引用不能重新赋值，不保证列表内容不变。

最安全的共享状态往往是没有共享，或共享不可变值。

## 9. 数据竞争与竞态条件

### 数据竞争（data race）

两个线程访问同一变量，至少一个是写，并且这些冲突访问没有 happens-before 排序。

### 竞态条件（race condition）

程序结果依赖不可控的操作交错。它是更广的逻辑概念；即便单次读写原子，也可能存在竞态。

例如：

```java
if (!map.containsKey(key)) {
    map.put(key, value);
}
```

每个方法单独线程安全也不自动让“先检查再写入”成为原子动作。另一个线程可能在两步之间改变状态。

## 10. `count++` 不是原子操作

```java
count++;
```

概念上包含：

```text
读取 count
计算 count + 1
写回 count
```

两个线程可能都读到 10，都写回 11，于是一次更新丢失。即使 int 单次读写通常是原子的，读—改—写组合仍不是原子操作。

`volatile int count` 也不能修复 `count++`，因为 volatile 不把三步合成不可分割事务。

## 11. 三个核心维度：原子性、可见性、有序性

### 原子性

一个操作或临界区对其他线程不可观察到中间状态。例如锁内同时更新总计和分项。

### 可见性

线程 A 写入后，线程 B 是否被保证看到该写入，而不是旧值。

### 有序性

编译器、JIT 和处理器可以在不改变单线程语义的前提下重排操作。跨线程必须依赖 Java 内存模型规定的同步关系，不能假设源码行顺序自然对所有线程可见。

一个机制可能只解决部分问题。volatile 提供特定可见性和排序，但不保护多变量复合不变量。

## 12. Java 内存模型不是 CPU 缓存教程

Java Memory Model（JMM）定义线程动作在语言层面的允许行为和可见性规则，让 Java 程序不依赖某一种 CPU 缓存结构。

可以用工作内存/缓存建立直觉，但正确性证明应基于 happens-before，而不是“这个 CPU 应该很快刷新缓存”。JVM 和硬件实现可以变化，JMM 契约才是可移植依据。

## 13. happens-before 的含义

如果动作 A happens-before 动作 B，则 A 的效果对 B 可见，并且 A 在 JMM 的内存顺序上先于 B。

重要规则包括：

- **程序顺序**：同一线程中，前面的动作 happens-before 后续动作。
- **监视器锁**：对锁的 unlock happens-before 随后对同一锁的 lock。
- **volatile**：写 volatile 字段 happens-before 随后读取该字段。
- **线程启动**：调用 `Thread.start()` 之前的动作 happens-before 新线程中的动作。
- **线程终止**：线程中的所有动作 happens-before 另一个线程检测到其终止，例如 join 返回。
- **传递性**：A → B 且 B → C，则 A → C。

happens-before 不是现实墙钟时间，也不要求 JVM完全按源码物理顺序执行；它定义其他线程必须观察到的结果。

## 14. 没有 happens-before 会发生什么

错误的停止标志：

```java
boolean running = true;

// 线程 A
while (running) {
    doWork();
}

// 线程 B
running = false;
```

没有同步时，线程 A 不被保证及时看到 false。JIT 还可能基于单线程规则进行优化。

把标志声明为 volatile，或在同一锁下读写，才能建立规定的可见性关系。

## 15. `synchronized` 同时提供互斥与可见性

```java
synchronized (lock) {
    // 临界区
}
```

同一时刻至多一个线程持有同一个对象的监视器。退出同步块会释放锁，后续线程获取同一锁时能看到之前受保护写入。

关键是“同一把锁”：

```java
synchronized (lockA) { shared++; }
synchronized (lockB) { System.out.println(shared); }
```

两边使用不同锁，不能建立需要的互斥和可见性。

## 16. 同步实例方法与静态同步方法

```java
public synchronized void update() {
}
```

等价于锁当前实例 `this`。

```java
public static synchronized void updateGlobal() {
}
```

锁类对象，例如 `Example.class`。实例锁和类锁不是同一把锁。

公共对象作为锁可能被外部代码意外竞争。通常使用：

```java
private final Object lock = new Object();
```

这样锁协议封装在类内部。

## 17. 内置锁是可重入的

持有某对象锁的线程可以再次获取同一锁：

```java
public synchronized void outer() {
    inner();
}

private synchronized void inner() {
}
```

如果不可重入，outer 调用 inner 会把自己永久阻塞。Java 内置监视器记录持有线程和重入次数。

可重入不代表任意嵌套锁安全；获取多把不同锁仍可能死锁。

## 18. 锁应保护不变量，而不只是字段

假设：

```text
totalMinutes == 所有学习者分钟数之和
```

更新总计和分项必须位于同一个临界区：

```java
synchronized (lock) {
    int updatedLearner = Math.addExact(oldLearner, minutes);
    int updatedTotal = Math.addExact(totalMinutes, minutes);
    minutesByLearner.put(learner, updatedLearner);
    totalMinutes = updatedTotal;
}
```

先完成可能抛异常的计算，再写入两个字段，可以避免溢出时只更新一半。锁保证其他线程也看不到中间状态。

分别给两个字段加锁可能破坏跨字段不变量。并发设计的单位是状态关系，而不是语法上的单个变量。

## 19. 所有访问都要遵守同一协议

只在写入时 synchronized，而读取不加锁，仍可能看到旧值或不一致组合：

```java
public Snapshot snapshot() {
    synchronized (lock) {
        return new Snapshot(total, map);
    }
}
```

读写必须遵守同一锁协议，或使用经过证明的其他发布机制。不能因为 getter “只读”就自动认为线程安全。

同时不要把内部可变 Map 引用返回出去；锁释放后调用者会绕过协议。本课示例在锁内创建快照，快照构造器立即复制并包装 Map。

## 20. 缩小临界区，但先保证正确

锁内应包含维护共享不变量所需的全部步骤。昂贵且无关的操作尽量放在锁外：

- 网络或数据库 IO。
- 文件读取。
- 用户回调。
- 大量日志格式化。
- 不依赖共享状态的计算。

在持锁期间调用外部代码会延长阻塞，并可能以未知顺序获取其他锁导致死锁。

但不能为了“缩小锁”拆散必须原子执行的检查与更新。先正确，再测量竞争，再优化。

## 21. `volatile` 保证什么

```java
private volatile boolean running = true;
```

对 volatile 字段的写 happens-before 随后的读，因此适合：

- 停止/配置标志。
- 发布一个独立、完整的新不可变快照引用。
- 状态更新不依赖旧值的简单场景。

volatile 还限制相关内存操作跨 volatile 边界的重排，使看到新标志的线程也看到发布前的写入。

## 22. `volatile` 不保证什么

它不提供复合操作的互斥：

```java
volatile int count;
count++; // 仍会丢失更新
```

也不能维护多个字段之间的不变量：

```java
volatile int lower;
volatile int upper;
```

分别可见不等于读取者能看到同一时刻的一致组合。需要锁、不可变整体快照或原子类支持的单变量操作。

## 23. 安全发布与不可变对象

一个构造完成的对象必须通过正确方式交给其他线程，例如：

- 写入 volatile 引用。
- 在 synchronized 保护下写入并在同一锁下读取。
- 放入线程安全集合或队列。
- 在线程启动前完成赋值，再 start。
- 使用正确初始化的 static final 字段。

final 字段在正确构造且 `this` 没有从构造器逸出时有特殊初始化保证。但 final 引用指向可变集合时，集合内容仍需同步。

不要在构造器中把 `this` 注册给其他线程、启动覆盖方法会访问本对象的线程，或调用可能泄漏本对象的外部回调。

## 24. 减少共享比增加锁更好

常用策略：

### 不可变值

record、String、不可修改集合快照可以在线程间安全传递，前提是元素也满足所需不可变性且对象正确发布。

### 线程封闭

对象只由一个线程访问，就不需要为该对象加锁。局部构建结果，完成后以不可变快照发布。

### 消息传递

多个线程通过 BlockingQueue 等交换所有权或不可变消息，减少直接共享字段。

### 分片状态

不同键或请求由独立状态持有者处理，降低争用。分片也会增加汇总和一致性复杂度，需要按业务权衡。

## 25. `ThreadLocal` 不是全局变量替代品

ThreadLocal 为每个线程提供独立值，常用于请求上下文、追踪信息或无法显式传参的底层集成。

风险：

- 在线程池中线程会复用，忘记 remove 可能把上一个请求数据泄漏到下一个请求。
- 值可能延长对象生命周期。
- 隐式依赖使测试和调用关系更难理解。
- 虚拟线程数量巨大时，不应把它当作缓存大量昂贵对象的地方。

优先显式传递依赖；确需 ThreadLocal 时在 finally 中清理，并理解框架上下文传播方案。

## 26. 中断是协作请求，不是强制终止

```java
worker.interrupt();
```

interrupt 通常：

- 设置目标线程的中断状态。
- 让 sleep、wait、join、BlockingQueue 等某些阻塞方法抛 `InterruptedException`。
- 不会安全地在任意指令处杀死线程。

任务必须决定如何响应：退出、传播取消、清理资源，或在确有协议时继续。

`Thread.stop()` 已废弃并计划移除，因为它可能在对象处于不一致状态、锁刚被释放时强制终止线程。

## 27. `isInterrupted` 与 `interrupted`

```java
thread.isInterrupted()
```

查询指定线程状态，不清除标志。

```java
Thread.interrupted()
```

查询当前线程，并清除中断标志。名字相似但副作用不同。

循环计算任务应定期检查：

```java
while (!Thread.currentThread().isInterrupted()) {
    doOneUnit();
}
```

检查频率要平衡响应速度和开销。

## 28. `InterruptedException` 会清除中断状态

```java
try {
    Thread.sleep(1_000);
} catch (InterruptedException error) {
    Thread.currentThread().interrupt();
    return;
}
```

抛出 InterruptedException 时，中断状态通常已被清除。如果当前方法不能继续向上抛，通常要重新设置，让上层仍能观察取消请求。

例外是当前层明确消费了中断并完成约定的取消。本课 `CooperativeReporter` 在 `running` 已被设为 false 时，把中断视为唤醒 sleep 的停止协议，不再恢复标志；若 running 仍为 true，说明是外部意外中断，就恢复标志。

不要写空 catch 吞掉中断。它会导致关闭超时、任务无法取消和线程池难以回收。

## 29. 清理资源使用 `finally`

中断、运行时异常和正常退出都可能结束任务：

```java
try {
    while (running) {
        doWork();
    }
} finally {
    closeOwnedResource();
}
```

AutoCloseable 资源优先 try-with-resources。finally 中的清理也应避免无限阻塞或覆盖原异常。

## 30. `CountDownLatch` 建立确定性等待

```java
CountDownLatch started = new CountDownLatch(1);

// 工作线程
started.countDown();

// 等待线程
started.await();
```

计数降到零后，所有 await 等待者可继续。countDown 前的动作 happens-before await 成功返回后的动作。

Latch 是一次性的，计数不会重置。它适合启动门、完成信号和测试协调，不适合循环阶段同步；后续课程会介绍 Phaser、Barrier 等工具。

用 Latch 替代 sleep 猜测“线程应该已经启动”，测试更快也更确定。

## 31. Thread 安全结束与 JVM 退出

平台线程分 daemon 和 non-daemon。通常 main 是非守护线程；JVM 的关闭序列在所有已启动非守护线程终止后开始。

daemon 线程不能保证在 JVM 退出前完成 finally、刷新数据或保存文件，不能承载必须完成的关键持久化。

虚拟线程是 daemon 线程，也不会单独阻止 JVM 退出。应用必须在结构化生命周期或任务管理器中等待必要任务完成。

## 32. 平台线程与虚拟线程

### 平台线程

通常近似映射到操作系统线程，栈和调度资源相对昂贵，数量是受限资源。适合各类任务，包括长期 CPU 计算，但需要合理控制数量。

### 虚拟线程（JDK 21+）

由 Java 运行时调度，资源更轻，可以支持非常多并发阻塞任务：

```java
Thread thread = Thread.ofVirtual().start(task);
```

适合大量任务大部分时间等待网络、数据库等阻塞 IO。它们不会让单个 CPU 密集计算更快，也不会减少下游数据库连接数或服务限额。

虚拟线程仍是 Thread：

- 仍会发生数据竞争和死锁。
- 仍需响应中断。
- ThreadLocal 语义仍存在。
- 仍需超时、限流和资源所有权。

不要池化虚拟线程来“节省线程”；通常每任务一个虚拟线程。真正稀缺的数据库连接等资源应单独用信号量、连接池或限流控制。

## 33. 虚拟线程的挂载与固定

虚拟线程运行时会挂载到少量平台 carrier 线程，阻塞时通常可卸载，让 carrier 执行其他虚拟线程。

某些场景可能导致 carrier 在阻塞期间被固定或占用更久。JDK 版本持续改进这方面行为，不能凭旧文章做永久结论。遇到吞吐问题应使用当前 JDK 的线程转储、JFR 和官方诊断建议测量。

无论是否虚拟线程，长时间 CPU 计算仍消耗真实核心，数量过多只会增加调度竞争。

## 34. 死锁

两个线程以相反顺序获取两把锁：

```text
线程 A：持有 lock1，等待 lock2
线程 B：持有 lock2，等待 lock1
```

预防方向：

- 全局固定锁获取顺序。
- 尽量减少同时持有多把锁。
- 不在持锁时调用未知外部代码。
- 使用支持超时/tryLock 的显式锁并设计失败恢复。
- 用更高层并发结构减少手写锁协议。

发生死锁时 sleep 更久不会修复，只是改变出现时机。

## 35. 活锁与饥饿

- **活锁**：线程都在运行并不断响应对方，但系统没有实际进展，例如双方反复礼让。
- **饥饿**：某线程长期得不到需要的 CPU、锁或资源。

公平锁可能减少某些饥饿，但通常降低吞吐，也不保证系统层面的绝对公平。设计应关注有界等待、队列容量、超时和负载控制。

## 36. 为什么不要自己到处 `new Thread`

直接 Thread 适合学习生命周期和极少量受控任务。后端生产系统通常需要：

- 限制平台线程数量。
- 排队与拒绝策略。
- 任务结果与异常传播。
- 取消和超时。
- 统一命名、监控和关闭。

这些由 ExecutorService、Future、CompletableFuture、虚拟线程 Executor 等更高层工具提供。业务代码应提交任务，而不是自己管理大量线程。

本节先把底层模型学牢，下一节再系统使用这些工具。

## 37. Executor 生命周期预览

JDK 17 兼容写法：

```java
ExecutorService executor = Executors.newFixedThreadPool(4);
try {
    executor.submit(task);
} finally {
    executor.shutdown();
}
```

`shutdown` 不接收新任务，但让已提交任务完成；`shutdownNow` 尝试中断正在执行任务并返回未开始任务，不保证强制停止。

只调用 shutdown 不代表已经等待结束。完整关闭协议还要 awaitTermination、超时后升级取消、恢复当前线程中断状态，并由明确生命周期所有者执行。

## 38. 异常不会自动跨线程传播

新线程中未捕获运行时异常会终止该线程，并交给 UncaughtExceptionHandler；它不会像普通方法调用一样自动抛回创建线程。

```java
Thread worker = new Thread(task);
worker.setUncaughtExceptionHandler((thread, error) ->
        logger.error("线程失败: " + thread.getName(), error));
```

生产中 Executor 的 submit 通常把异常封装进 Future，需要调用 get 才能观察；execute 的处理方式又不同。忽略任务结果可能让失败悄悄丢失。

## 39. 并发测试不能只跑一次

错误程序可能运行百万次也不失败，正确程序也不能靠“这次结果对”证明。

测试策略：

- 用 Latch/Barrier 控制关键交错，不用 sleep 猜时机。
- 重复并发压力测试，但知道它只能增加发现概率。
- 测试最终不变量，不依赖线程输出顺序。
- 对 JMM 微妙问题使用 OpenJDK jcstress 等专用工具。
- 性能使用 JMH，避免 JIT 预热和死代码消除误导。
- 生产保留超时、线程池、队列和锁竞争指标。

不要在测试中通过把所有方法 synchronized 掩盖架构问题。

## 40. 线程转储是首要证据

线程卡住、CPU 异常或请求堆积时，线程转储可显示：

- 每个线程的状态和调用栈。
- 等待或持有的监视器。
- 潜在死锁。
- 大量线程阻塞在哪个下游调用。

可以使用 `jcmd <pid> Thread.print`、`jstack`、JFR 或运行平台提供的诊断入口。生产操作必须遵守权限和隐私规则。

一次转储只是瞬间快照；间隔采集多份更容易区分持续阻塞和正常短暂等待。

## 41. 完整示例：并发学习进度账本

示例让三个平台线程同时记录进度，以私有锁维护跨字段不变量，再展示 volatile 停止信号、中断唤醒、Latch 和 join：

::: code-group

<<< ../../../examples/java/concurrency-basics/src/learning/backend/concurrency/ProgressSnapshot.java{java:line-numbers} [ProgressSnapshot.java]

<<< ../../../examples/java/concurrency-basics/src/learning/backend/concurrency/ProgressLedger.java{java:line-numbers} [ProgressLedger.java]

<<< ../../../examples/java/concurrency-basics/src/learning/backend/concurrency/CooperativeReporter.java{java:line-numbers} [CooperativeReporter.java]

<<< ../../../examples/java/concurrency-basics/src/learning/backend/concurrency/ConcurrencyBasicsApp.java{java:line-numbers} [ConcurrencyBasicsApp.java]

:::

编译：

```bash
cd examples/java/concurrency-basics
mkdir -p out
javac --release 17 -Xlint:all -d out \
  src/learning/backend/concurrency/ProgressSnapshot.java \
  src/learning/backend/concurrency/ProgressLedger.java \
  src/learning/backend/concurrency/CooperativeReporter.java \
  src/learning/backend/concurrency/ConcurrencyBasicsApp.java
```

运行：

```bash
java -cp out learning.backend.concurrency.ConcurrencyBasicsApp
```

预期输出：

```text
总分钟数：3000
按学习者：{小周=1000, 小林=2000}
报告任务已协作停止：true
```

执行过程：

1. main 在线程 start 前完成 Ledger 引用和 Runnable 构造，这些动作对新线程可见。
2. 三个线程各记录 1000 次；两个线程写小林，一个写小周。
3. `record` 先在锁外验证独立参数，再获取私有 lock。
4. 锁内先用 `Math.addExact` 计算两个新值，再一起更新 Map 与总计，维持跨字段不变量。
5. 所有读写都通过同一 lock；snapshot 在锁内复制当前一致状态。
6. `ProgressSnapshot` 再复制为按键排序的不可修改 Map，所以输出确定且调用者不能绕过锁修改内部状态。
7. main 对每个工作线程 join；线程终止 happens-before join 返回，因此随后读取能观察全部已完成操作。
8. Reporter 先 countDown，main 的 await 不依赖时间猜测，确认 run 已开始。
9. `requestStop` 写 volatile running=false；Reporter 后续读取被保证可见。
10. interrupt 立即唤醒可能处于 sleep 的 Reporter。因为 running 已为 false，中断属于停止协议，任务进入 finally。
11. finally 写 volatile stopped=true，随后 join 也建立终止可见性；main 输出 true。

示例中的 `sleep(100)` 不是用来猜同步时机，只模拟可中断的阻塞等待；真正的启动协调由 CountDownLatch 完成。生产周期任务通常应使用 ScheduledExecutorService，而不是手写 sleep 循环。

## 42. 如果移除锁会怎样

把 `record` 中 synchronized 去掉后，可能出现：

- totalMinutes 少于 3000。
- 某个学习者计数丢失。
- Map 在并发写入下发生未定义于 HashMap 契约的异常行为。
- 快照看到总计与分项不一致。

但某次运行仍可能刚好输出正确。这不是正确性证明，也不应把错误版本放进自动课程示例等待“偶现失败”。并发正确性来自同步协议和内存模型推理。

## 43. JavaScript / Node.js 对照

| 关注点 | Java | 浏览器/Node.js 常见 JavaScript |
| --- | --- | --- |
| 主执行模型 | JVM 可运行多个 Java 线程 | 主事件循环通常单线程执行 JS 回调 |
| 共享堆并发 | 普通对象可被多个线程访问 | 同一事件循环回调不同时执行，但 Worker/共享内存是例外 |
| 阻塞调用 | 会阻塞当前平台/虚拟线程 | 阻塞主事件循环会卡住其他回调 |
| 异步 IO | Future、异步 API 或每任务虚拟线程等 | Promise、回调、事件循环 |
| 内存模型 | JMM、happens-before、锁、volatile | JS 内存模型；SharedArrayBuffer/Atomics 时需显式并发推理 |
| 取消 | 中断、Future.cancel、协作标志 | AbortController/AbortSignal 等协作取消 |
| CPU 并行 | 多线程/线程池/ForkJoin | Worker Threads/Web Workers 等 |

“JavaScript 单线程”不等于没有竞态。两个异步回调可以在 await 边界交错，形成逻辑竞态；Worker 和共享内存还会引入真正并行。Java 的普通后端请求则常从一开始就在多个线程上并发执行，不能把 Node 单事件循环的直觉直接搬过来。

## 44. 常见错误与排查

### 常见错误

- 调用 `run()`，误以为启动了新线程。
- 依赖输出顺序、线程优先级、yield 或 sleep 建立同步。
- 把单次 int 读写原子误解为 `count++` 原子。
- 只给字段加 volatile，却要维护多个字段不变量。
- 写入加锁、读取不加锁，或读写使用不同锁。
- 在同步方法里返回内部可变集合。
- 锁住 String 常量、装箱整数或调用者可访问对象。
- 持锁执行网络 IO 或未知回调。
- 捕获 InterruptedException 后忽略。
- 调用 `Thread.interrupted()` 只想查询，却意外清除状态。
- 使用已废弃 Thread.stop 强制终止。
- 认为虚拟线程自动让共享状态安全或让 CPU 计算更快。
- 大量任务各自 new 平台线程，没有容量与关闭策略。
- 用一次成功运行证明没有竞态。
- 只看异常日志，不采集线程转储和池/队列指标。

### 排查顺序

1. 列出所有共享可变字段，以及每个字段的读写线程。
2. 为每个状态写出保护协议：哪把锁、哪个 volatile 或哪个线程安全容器。
3. 检查复合不变量是否在同一原子边界内更新和读取。
4. 画出所依赖的 happens-before 边：start、join、锁、volatile、Latch 等。
5. 检查是否吞掉中断、未设置超时或未关闭任务管理器。
6. 卡死时采集多份线程转储，查看 BLOCKED/WAITING 位置和锁顺序。
7. 计数错误时查找读—改—写和检查后执行操作，而不只看字段声明。
8. 性能问题分清 CPU 饱和、锁竞争、线程过多、队列堆积还是下游 IO。
9. 用确定性同步工具重现关键交错，再编写不变量测试。

## 45. 本节总结

- 并发关注任务交错，并行关注同时执行；多线程只是实现方式之一。
- Thread.start 创建并发执行，直接 run 只是普通方法调用；同一 Thread 不能启动两次。
- 调度顺序不可预测，sleep、yield 和优先级不能代替同步。
- 共享可变状态会带来数据竞争和竞态；count++ 是非原子的读—改—写。
- 并发正确性需要分别考虑原子性、可见性和有序性。
- happens-before 是跨线程可见性的核心推理工具，常见来源包括锁、volatile、start、join 和同步器。
- synchronized 对同一锁提供互斥与可见性，应围绕业务不变量设计临界区。
- volatile 适合独立状态标志或不可变快照引用，不适合复合更新与多字段不变量。
- 正确发布、不可变快照、线程封闭和消息传递能显著减少锁复杂度。
- interrupt 是协作式取消请求；InterruptedException 通常应传播或恢复中断状态。
- CountDownLatch 等同步器比 sleep 猜时机更确定，并自带内存一致性保证。
- 虚拟线程适合大量阻塞等待任务，但不提升 CPU 密集任务速度，也不消除锁和竞态。
- 死锁来自循环等待，活锁没有进展，饥饿是长期得不到资源；都需要结构化设计和诊断证据。
- 生产后端应使用 Executor 等管理任务生命周期、容量、结果、异常和关闭。

下一节：[Java ExecutorService、Future、原子类与并发集合](/backend/java/executor-future-atomic-and-concurrent-collections)。

## 46. 参考资料

- [Java Language Specification 25：线程与锁、Java 内存模型](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html)
- [Java SE 25：`Thread` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Thread.html)
- [Java SE 25：`Thread.State` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Thread.State.html)
- [Java SE 25：`Runnable` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Runnable.html)
- [Java SE 25：`CountDownLatch` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/CountDownLatch.html)
- [Java SE 25：`ExecutorService` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ExecutorService.html)
- [OpenJDK JEP 444：Virtual Threads](https://openjdk.org/jeps/444)
- [Dev.java：Virtual Threads](https://dev.java/learn/new-features/virtual-threads/)
- [OpenJDK：Java Concurrency Stress Tests](https://openjdk.org/projects/code-tools/jcstress/)
