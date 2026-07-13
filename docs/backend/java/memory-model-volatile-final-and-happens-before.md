---
title: Java 内存模型、volatile、final 与 happens-before
description: 从可见性、原子性和有序性理解线程通信，掌握安全发布、不可变对象和原子更新
outline: deep
---

# Java 内存模型、`volatile`、`final` 与 happens-before

> 适用环境：JDK 25 LTS。完整示例兼容 JDK 17 和 21。

## 1. 学习目标

完成本节后，你应该能够：

- 说明 Java 内存模型描述的是合法可观察行为，而不是某一种 CPU 缓存实现。
- 区分共享变量、线程局部变量、冲突访问和数据竞争。
- 分别判断并发操作的可见性、原子性与有序性。
- 使用 happens-before 推导一条跨线程数据是否安全可见。
- 掌握监视器、volatile、start、join 和安全并发工具建立的发布关系。
- 解释 volatile 为什么适合状态标记和不可变快照，却不能让 `count++` 原子化。
- 识别 volatile 引用、对象字段和数组元素之间的保证边界。
- 正确理解 final 字段的初始化安全性，并避免构造期间泄漏 this。
- 通过不可变对象、静态初始化、锁、volatile、并发容器和任务完成安全发布。
- 使用 AtomicInteger、AtomicReference 和 CAS 表达复合原子更新。
- 理解 CAS 更新函数可能重复执行以及 ABA 问题。
- 知道 VarHandle 的 plain、opaque、acquire/release 和 volatile 模式为何不能随意混用。
- 避免用 sleep、日志、调试器或“我的机器没复现”证明并发正确性。

## 2. 内存模型不是“每个线程有一份内存”

常见入门图会画出“主内存”和“线程工作内存”。它有助于形成可见性直觉，但不是可以据此逐条预测 CPU 指令的实现规范。

Java 内存模型（JMM）回答的是：给定一个多线程程序和一次执行，某个读取允许观察到哪些写入，这次执行是否合法。

JVM、JIT 编译器和处理器可以：

- 把值保存在寄存器。
- 消除重复读取。
- 重排彼此无依赖的操作。
- 合并或删除在单线程语义下不可观察的写入。
- 使用不同层级缓存和内存屏障。

只要最终可观察行为仍符合 JMM，这些实现策略都合法。业务代码应基于 happens-before 规则推理，而不是猜测“什么时候刷回主内存”。

## 3. 哪些变量在线程间共享

JLS 把实例字段、static 字段和数组元素视为共享变量，它们位于多个线程可能访问的堆对象中。

方法局部变量、形参和异常处理参数本身不在线程间共享：

```java
void handle(Request request) {
    int retries = 0;
}
```

但局部变量可引用共享对象。`request` 这个引用槽是当前调用局部的，`request` 指向对象的字段仍可能被其他线程访问。

Lambda 捕获的对象同样不会因为捕获发生就自动线程安全。

## 4. 冲突访问与数据竞争

两个访问满足以下条件时是冲突访问：

- 访问同一个共享变量。
- 至少一个访问是写入。

若两个冲突访问来自不同线程，又没有被 happens-before 排序，程序存在 data race。

```java
// Thread A
status = "READY";

// Thread B
System.out.println(status);
```

普通字段的一写一读没有同步关系，Thread B 不保证及时看到 READY。

数据竞争不等于 JVM 崩溃，也不意味着每次都读到旧值。它表示程序允许出现反直觉结果，正确性依赖调度、优化或硬件偶然行为。

## 5. 无数据竞争与顺序一致性

JMM 提供重要保证：正确同步、没有数据竞争的程序，其执行结果表现得像某种与各线程程序顺序一致的总顺序。

这常称为 DRF-SC：data-race-free 程序获得 sequential consistency 风格的推理基础。

但没有数据竞争仍不自动保证业务复合操作正确：

```java
if (!map.containsKey(key)) {
    map.put(key, createValue());
}
```

即使 map 的每个方法线程安全，两个方法组成的“检查后执行”不是一个原子操作。应使用 `computeIfAbsent` 等整体原子 API，或在同一锁中执行。

## 6. 三个维度要分开

### 可见性

一个线程的写入，另一个线程能否按协议观察到。

### 原子性

一个操作是否作为不可分割整体发生，中间状态不会被其他线程观察或插入修改。

### 有序性

跨线程观察时，多个操作是否按需要的先后关系出现。

volatile 同时提供特定可见性和排序保证，但单次 volatile 读写的原子性不等于复合表达式原子。

## 7. `count++` 为什么不是一个操作

```java
volatile int count;
count++;
```

逻辑上至少包括：

1. 读取 count。
2. 加一。
3. 写回 count。

两个线程都可能读到 10，各自写回 11，丢失一次更新。volatile 保证它们读写的是按 volatile 规则可见的值，却没有把“读—改—写”合成一个原子事务。

正确选择包括：

```java
synchronized (lock) {
    count++;
}
```

或：

```java
AtomicInteger count = new AtomicInteger();
count.incrementAndGet();
```

## 8. 程序顺序只是 happens-before 起点

同一个线程内，按单线程语义先发生的动作 happens-before 后续动作：

```java
payload = createPayload();
ready = true;
```

这只能直接排序当前线程的两个动作。要让另一个线程安全读取 payload，还需要一条跨线程 synchronizes-with 边，再利用传递性组成完整 happens-before 链。

## 9. 核心 happens-before 规则

工程中最常用的规则包括：

- 同一线程中，程序顺序靠前的动作 happens-before 后续动作。
- 对同一监视器的 unlock happens-before 后续成功 lock。
- 对同一 volatile 变量的写 happens-before 后续读。
- 调用 `Thread.start()` happens-before 新线程中的动作。
- 线程中的全部动作 happens-before 另一线程从该线程的 `join()` 成功返回。
- 中断动作 happens-before 其他线程检测到中断。
- 对象字段的默认初始化 happens-before 程序中的其他普通动作。
- happens-before 具有传递性。

`java.util.concurrent` 类还在各自 API 中规定了更高层内存一致性效果，例如任务提交与执行、Future 完成与 get、并发队列放入与取出。

## 10. 用传递性推导发布

发布线程：

```java
snapshot = buildSnapshot(); // 普通写及对象初始化
ready = true;               // volatile 写
```

读取线程：

```java
if (ready) {                // volatile 读
    use(snapshot);          // 普通读
}
```

推导链：

1. snapshot 写在发布线程程序顺序上早于 ready 写。
2. ready 的 volatile 写 synchronizes-with 读取线程后续看到它的 volatile 读。
3. 读取 ready 在读取线程程序顺序上早于 snapshot 读。
4. 通过传递性，snapshot 的初始化 happens-before use(snapshot)。

关键是读取线程必须真正读取同一个 volatile 变量并观察到对应写入。

## 11. volatile 的发布/获取语义

对 volatile 变量的写可视为发布（release），后续读到该写的 volatile 读可视为获取（acquire）。

它不仅让 volatile 字段本身可见，也把写之前的普通操作发布给读之后的普通操作。

典型用途：

- 停止标记。
- 配置或不可变快照引用。
- 初始化完成标记。
- 单写多读的版本/状态。
- 双重检查锁中的实例引用。

每个协议都要能明确指出哪次读观察哪次写，不能只因类里“有一个 volatile”就认为所有字段安全。

## 12. volatile 停止标记

```java
private volatile boolean running = true;

void runLoop() {
    while (running) {
        processNextBatch();
    }
}

void stop() {
    running = false;
}
```

这适合循环可频繁检查、单个批次能及时结束的场景。若线程阻塞在队列、锁或 IO 中，仅改变标记不会唤醒它；还需 interrupt、关闭资源或调用对应取消 API。

对于任务取消，优先遵循 Executor/Future/框架的结构化取消协议，而不是到处自建 boolean。

## 13. `sleep` 和 `yield` 不建立可见性

错误代码：

```java
while (!done) {
    Thread.sleep(100);
}
```

若 done 是普通字段，sleep 不要求编译器重新读取它，也不建立线程间同步。JLS 明确指出 sleep 和 yield 没有同步语义。

同理，增加日志后问题“消失”可能是 println 内部锁、时序或 JIT 行为变化造成，不能证明原代码正确。

## 14. volatile 引用不让对象整体 volatile

```java
volatile User user;
```

这表示 user 引用槽按 volatile 规则读写。它不表示：

- `user.name` 的每次后续修改都是 volatile。
- User 自动成为不可变对象。
- 多字段更新成为原子事务。
- 对同一个 User 的并发集合修改自动安全。

最安全的快照模型是构造一个全新的不可变对象，然后一次 volatile 写替换引用；读取者只读，不在发布后修改对象。

## 15. volatile 数组陷阱

```java
volatile int[] counters = new int[10];
counters[0]++;
```

volatile 修饰的是数组引用，不是每个元素。对 `counters[0]` 的读写仍是普通数组元素访问，`++` 仍非原子。

可选工具：

- `AtomicIntegerArray`。
- 在锁内更新普通数组。
- 构造新数组快照后替换 volatile 引用。
- 按业务维度使用并发集合或 LongAdder。

## 16. 单次读写原子不等于线程安全

Java 对引用和除规范特殊说明外的大多数基本类型单次读写提供原子访问。volatile long/double 的读写始终原子；JLS 对非 volatile long/double 仍不承诺相同的不可拆分保证。

即便单次 int 读写原子，以下不变量仍可能破坏：

```java
balance = balance - amount;
```

原子性要按完整业务状态转换判断，不是按某个机器字大小判断。

## 17. final 字段的特殊初始化语义

```java
final class UserProfile {
    private final String id;
    private final String name;

    UserProfile(String id, String name) {
        this.id = id;
        this.name = name;
    }
}
```

若对象在构造完成前没有泄漏，其他线程即使通过某些缺少普通同步的路径获得引用，也能得到 final 字段初始化值的特殊保证。

这让正确构造的不可变对象比可变对象更容易安全共享。但它不是鼓励数据竞争：引用本身仍应通过明确的安全发布机制传递，以获得完整、可维护的可见性语义。

## 18. final 不等于深度不可变

```java
final List<String> roles;
```

final 保证 roles 引用不能指向另一个 List，不阻止当前 List 内容变化。

构造时做防御性复制：

```java
this.roles = List.copyOf(roles);
```

数组使用 `Arrays.copyOf`，Map/Set 使用不可变副本，嵌套对象也应满足不可变约束。否则别的线程仍能通过外部别名修改对象内部状态。

record 的组件字段是 final，但组件引用的对象不会自动深拷贝。本课 LearningSnapshot 在紧凑构造器中使用 List.copyOf。

## 19. 构造期间不能泄漏 `this`

错误示例：

```java
class Listener {
    final String name;

    Listener(EventBus bus) {
        bus.register(this); // this 已逃逸
        name = "ready";
    }
}
```

另一个线程可能在构造器完成前调用对象，看到默认值或未建立的不变量。常见逃逸路径：

- 构造器中注册监听器。
- 构造器中启动捕获 this 的线程。
- 把 this 写入 static 字段或共享集合。
- 调用可被子类覆盖的方法，间接访问未初始化子类状态。

使用工厂方法：先完整构造，再注册或启动。

## 20. 安全发布方式

常见可靠方式包括：

- 在类初始化期间写入 static final 字段。
- 写入 volatile 引用，并从该 volatile 引用读取。
- 在同一把锁保护下写入和读取。
- 放入线程安全集合或 BlockingQueue，并按其 API 读取。
- 在线程 start 前准备数据，由启动线程读取。
- 通过 Future.get、Thread.join 或结构化任务 join 观察任务结果。
- 只在一个线程拥有可变对象，通过消息传递不可变结果。

发布与对象内部线程安全是两个问题：安全发布一个可变 HashMap 后，后续并发修改仍需同步。

## 21. 静态初始化是强安全边界

```java
private static final Config CONFIG = loadConfig();
```

JVM 保证类初始化按协议串行执行，并把初始化结果安全发布给使用该类的线程。

初始化按需持有者模式利用这一点实现延迟单例：

```java
final class ServiceHolder {
    private static class Holder {
        static final Service INSTANCE = new Service();
    }

    static Service instance() {
        return Holder.INSTANCE;
    }
}
```

它通常比手写双重检查锁更简单。

## 22. 双重检查锁必须使用 volatile

```java
private static volatile Service instance;

static Service instance() {
    Service current = instance;
    if (current == null) {
        synchronized (ServiceFactory.class) {
            current = instance;
            if (current == null) {
                current = new Service();
                instance = current;
            }
        }
    }
    return current;
}
```

没有 volatile，引用写入与对象初始化缺少所需发布关系，另一个线程可能观察到不完整状态。局部 current 减少成功初始化后的 volatile 读取。

即使写法正确，也优先考虑 static final、Holder、依赖注入容器或枚举单例，减少手写并发协议。

## 23. 锁同时提供互斥与发布

```java
synchronized (lock) {
    settings = newSettings;
}
```

读取者必须对同一个 lock 加锁：

```java
synchronized (lock) {
    return settings;
}
```

发布线程 unlock happens-before 读取线程后续 lock，所以临界区之前的写入可见。锁还把复合状态修改变成互斥操作，这是 volatile 不提供的能力。

若写和读使用不同锁，不会形成所需关系。

## 24. `Thread.start` 与 `join`

```java
Task task = new Task(config);
Thread worker = new Thread(task);
worker.start();
```

start 前对 task/config 的写 happens-before worker 中的动作。

```java
worker.join();
Result result = task.result();
```

worker 的全部动作 happens-before join 成功返回后的读取。不要通过 sleep 猜测线程已完成；join、Future.get 或 CountDownLatch 才表达完成关系。

## 25. Atomic 类与 CAS

```java
AtomicInteger count = new AtomicInteger();
count.incrementAndGet();
```

Atomic 类使用原子读—改—写操作，常由 compare-and-set（CAS）实现：只有当前值仍等于期望值时才写入新值，否则失败并重试。

```java
AtomicReference<State> state = new AtomicReference<>(initial);
state.updateAndGet(old -> old.next());
```

把多个相关字段封装进不可变 State，再原子替换引用，可实现无锁状态机。但复杂不变量、外部副作用或高竞争下，锁往往更清晰。

## 26. CAS 更新函数可能执行多次

`updateAndGet`、`getAndUpdate`、`accumulateAndGet` 的函数可能因 CAS 竞争重复执行。

错误：

```java
state.updateAndGet(old -> {
    paymentClient.charge();
    return old.paid();
});
```

重试可能重复扣款。更新函数应无副作用、确定且执行快速；外部操作应与状态机、幂等键或事务协议分离。

## 27. ABA 问题

CAS 只比较当前值是否仍等于期望值。若值从 A 变 B 再变 A，CAS 可能认为“没有变化”，但中间事件对算法可能重要。

应对方法包括：

- 把版本号与值一起放进不可变状态。
- 使用 AtomicStampedReference。
- 重新设计所有权或采用锁。

普通业务代码不应为了无锁而引入难以验证的 ABA、回收和重试协议。

## 28. `LongAdder` 的边界

高竞争统计计数可使用 LongAdder，把更新分散到多个单元，读取 sum 时汇总。

它适合指标、请求数等允许读取瞬间不是全局原子快照的场景。不适合账户余额、库存扣减或需要与其他字段构成事务不变量的值。

“更高吞吐”来自放松某些一致性特征，选择前要先写清业务语义。

## 29. VarHandle 是底层内存访问工具

VarHandle 可对字段、数组元素等执行不同访问模式：

- plain：接近普通字段语义。
- opaque：保证有限的相干性，排序较弱。
- acquire/release：建立单向排序。
- volatile：提供最强的 volatile 访问语义。
- compareAndSet/getAndAdd 等原子更新。

更弱模式可能减少屏障，但推理难度更高，而且性能收益高度依赖平台和上下文。业务代码优先使用 volatile、锁、Atomic 和并发集合。

只有实现底层并发组件、具备形式化协议和基准证据时才直接使用 VarHandle。

## 30. 内存屏障不是业务 API

不要用“加一个 fence 应该能修复”替代完整协议。屏障只影响特定操作排序，不能：

- 自动建立对象所有权。
- 让复合操作互斥。
- 选择正确的发布/读取变量。
- 修复生命周期和取消。

先用 JMM 的高层规则证明 happens-before，再让 JVM 根据 volatile/锁/Atomic 生成适合硬件的屏障。

## 31. 完整示例：不可变快照安全发布

::: code-group

<<< ../../../examples/java/memory-model/src/learning/backend/memory/LearningSnapshot.java{java:line-numbers} [LearningSnapshot.java]

<<< ../../../examples/java/memory-model/src/learning/backend/memory/SnapshotPublisher.java{java:line-numbers} [SnapshotPublisher.java]

<<< ../../../examples/java/memory-model/src/learning/backend/memory/MemoryModelApp.java{java:line-numbers} [MemoryModelApp.java]

:::

编译：

```bash
cd examples/java/memory-model
mkdir -p out
javac --release 17 -Xlint:all -d out \
  src/learning/backend/memory/LearningSnapshot.java \
  src/learning/backend/memory/SnapshotPublisher.java \
  src/learning/backend/memory/MemoryModelApp.java
```

运行：

```bash
java -cp out learning.backend.memory.MemoryModelApp
```

预期输出：

```text
版本：18
课程：Java 内存模型
主题：[happens-before, volatile, final]
原子计数：4000
```

执行过程：

1. 读取任务先启动并等待 volatile latest 不再为 null。
2. 发布任务完整构造 LearningSnapshot；record 字段为 final，topics 使用 List.copyOf 防御性复制。
3. publish 对 latest 执行一次 volatile 写。
4. 读取任务的 volatile 读观察到该引用，也获得构造和发布前普通写入的可见性。
5. 读取者只读取不可变快照，不与发布者共同修改对象内部状态。
6. 4 个任务各执行 1,000 次 incrementAndGet，原子读—改—写避免丢失更新。
7. 主线程通过 Future.get 等待每项工作并传播任务异常。
8. finally 关闭线程池并限时等待终止。

SnapshotPublisher 的自旋只用于展示 volatile 读取。真实服务不应让线程长期空转等待配置；使用 CompletableFuture、CountDownLatch、Condition、BlockingQueue 或事件订阅等阻塞/异步通知机制。

## 32. 为什么示例不展示“错误值复现”

数据竞争的错误执行是允许出现，不是保证出现。下面做法都不能证明代码正确或错误：

- 循环一百万次没有失败。
- 在 x86 机器没有复现。
- 加日志后不再失败。
- debug 单步时结果正常。
- 改成虚拟线程后看似正常。

课程示例展示可由规范证明的正确链路。研究弱内存竞态应使用 OpenJDK jcstress 等专门工具，并正确解释允许/禁止/可接受结果，而不是自己写无限循环测试。

## 33. JavaScript 对照

普通浏览器或 Node.js JavaScript 代码主要在单个事件循环线程执行，同一个事件循环中的回调不会在同一时刻并行访问 JS 对象，因此没有完全相同的普通字段数据竞争。

但以下情况重新引入并发协调：

- Web Worker / Worker Threads。
- SharedArrayBuffer。
- Atomics API。
- 多进程、数据库或分布式共享状态。

| Java | JavaScript 近似概念 |
| --- | --- |
| volatile 可见性/排序 | SharedArrayBuffer 上的 Atomics 操作 |
| AtomicInteger CAS | Atomics.compareExchange |
| synchronized/Lock | JS 普通事件循环无直接等价；共享内存时需 Atomics 协议 |
| Future.get/join | Promise await 表达任务完成，但调度模型不同 |
| final 引用 | const 只限制变量重新赋值，同样不深度冻结对象 |
| 不可变快照 | Object.freeze/不可变数据约定，但 freeze 也需理解深度 |

JavaScript 的 const 与 Java final 都不自动深度不可变；Promise 完成顺序也不等于数据库事务隔离或跨进程内存一致性。

## 34. 常见错误

- 用 CPU 缓存示意图替代 JMM happens-before 推理。
- 认为线程最终一定会看到普通字段的新值。
- 用 sleep/yield/日志建立可见性。
- 把 volatile 当锁，让 count++、余额扣减或多字段状态原子化。
- 认为 volatile 引用会让对象所有字段和数组元素都 volatile。
- 发布可变对象后无同步继续修改。
- final 引用指向可变集合，却称对象完全不可变。
- 构造器中注册 this、启动线程或调用可覆盖方法。
- 双重检查锁的实例字段没有 volatile。
- 写和读使用不同锁，误以为任意 synchronized 都能发布。
- 用线程安全方法拼出非原子的“检查后执行”。
- CAS 更新函数执行数据库、支付、日志等不可重复副作用。
- 把 LongAdder 用于要求精确事务快照的余额或库存。
- 直接使用 VarHandle 弱模式，却没有完整证明和基准。
- 只靠压力测试通过证明并发代码正确。

## 35. 排查顺序

1. 列出全部共享可变字段、static 字段、数组和集合。
2. 对每对冲突访问写出保护机制：同锁、volatile、Atomic、并发容器或线程封闭。
3. 画出发布线程普通写、同步边、读取线程普通读的 happens-before 链。
4. 检查读写是否使用同一个 volatile、同一把锁或同一并发对象。
5. 区分单次读写与完整业务复合操作的原子性。
6. 检查构造器是否泄漏 this，以及集合/数组是否防御性复制。
7. 检查 CAS Lambda 是否可重复、无外部副作用。
8. 检查等待是否用 sleep 猜测完成，改为 join/Future/门闩/队列。
9. 用线程转储定位锁与等待，再用 JFR/性能分析定位竞争和吞吐问题。
10. 对底层无锁算法使用 jcstress、代码审查和形式化不变量，而非仅依赖常规单元测试。

## 36. 本节总结

- JMM 规定多线程读取允许观察哪些写入，不等同于某种具体缓存实现。
- 不同线程对同一变量的冲突访问若没有 happens-before 排序，就存在数据竞争。
- 可见性、原子性与有序性必须分别分析。
- volatile 写 happens-before 后续观察它的 volatile 读，并可发布此前普通写入。
- volatile 不把读—改—写变成原子操作，也不让对象字段或数组元素自动 volatile。
- sleep、yield 和调度偶然性没有同步语义。
- final 提供特殊初始化安全保证，但前提是构造期间不泄漏 this。
- final/record 不会深度冻结引用对象，集合与数组需要不可变副本。
- 静态初始化、同锁、volatile 引用、并发容器、线程 start/join 和 Future 都可建立安全发布。
- Atomic 类适合单值或不可变状态 CAS；更新函数必须允许重复执行。
- LongAdder 适合高竞争统计，不适合事务性精确状态。
- VarHandle 弱访问模式属于底层并发工具，业务代码优先使用高层组件。
- 并发正确性来自规范证明和一致协议，压力测试只能补充验证。

下一节建议：Java 类加载、字节码、JIT、栈、堆与垃圾回收基础。

## 37. 参考资料

- [Java Language Specification 25：§17.4 Memory Model](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html#jls-17.4)
- [Java Language Specification 25：§17.5 final Field Semantics](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html#jls-17.5)
- [Java SE 25：`VarHandle` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/invoke/VarHandle.html)
- [Java SE 25：`AtomicInteger` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/atomic/AtomicInteger.html)
- [Java SE 25：`AtomicReference` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/atomic/AtomicReference.html)
- [OpenJDK jcstress](https://openjdk.org/projects/code-tools/jcstress/)
