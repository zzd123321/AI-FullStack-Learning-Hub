---
title: Java ExecutorService、Future、原子类与并发集合
description: 使用线程池管理任务生命周期，通过 Future 获取结果，并用原子类和并发集合安全维护共享状态
outline: deep
---

# Java `ExecutorService`、`Future`、原子类与并发集合

> 适用环境：JDK 25 LTS。完整示例兼容 JDK 17 和 21；`ExecutorService.close()` 自 JDK 19 可用，示例通过自有 `AutoCloseable` 包装保持 JDK 17 兼容。

## 1. 学习目标

完成本节后，你应该能够：

- 区分线程、任务、Executor 与 ExecutorService。
- 根据是否需要结果选择 Runnable 或 Callable。
- 理解 `execute` 与 `submit` 的异常观察差异。
- 使用 Future 获取结果、处理任务异常、设置超时和请求取消。
- 正确执行 Executor 的有序关闭与强制关闭降级。
- 解释线程池大小、工作队列、最大线程数和拒绝策略之间的关系。
- 使用 ThreadFactory 设置有诊断价值的线程名称。
- 理解 CAS、AtomicInteger 与 LongAdder 的适用边界。
- 使用 ConcurrentHashMap 的原子复合方法安全聚合单键状态。
- 了解 CopyOnWriteArrayList、BlockingQueue 和并发有序集合的典型用途。
- 识别“线程安全容器”仍无法保证跨键、跨容器或数据库事务。
- 区分平台线程池与虚拟线程每任务 Executor 的容量控制方式。

## 2. 从“创建线程”转向“提交任务”

底层写法把任务与执行策略绑在一起：

```java
new Thread(task).start();
```

Executor 把两者分开：

```java
Executor executor = ...;
executor.execute(task);
```

业务代码描述任务，执行器决定：

- 使用哪个线程。
- 立即执行还是排队。
- 可同时运行多少任务。
- 容量耗尽时如何拒绝。
- 如何命名、监控和关闭工作线程。

这种分离是后端并发治理的基础。

## 3. `Executor` 与 `ExecutorService`

`Executor` 只有：

```java
void execute(Runnable command);
```

它不规定必须异步，也可能在调用线程直接执行。

`ExecutorService` 增加：

- submit 并返回 Future。
- invokeAll / invokeAny 批量执行。
- shutdown、shutdownNow、awaitTermination 生命周期。
- JDK 19+ 的 AutoCloseable close。

不要看到 Executor 就自动假设“线程池”或“新线程”。行为取决于具体实现。

## 4. Runnable 与 Callable

### Runnable

```java
Runnable task = () -> saveAuditLog();
```

- `run()` 返回 void。
- 不能声明任意受检异常。
- 适合没有业务结果的动作。

### Callable<V>

```java
Callable<ActivityResult> task = () -> process(job);
```

- `call()` 返回 V。
- 可以抛 Exception。
- 适合查询、计算和需要报告结果的任务。

提交 Runnable 也可以获得 `Future<?>`，用于等待、取消和观察完成，只是成功 get 返回 null。

## 5. `execute` 与 `submit` 不只是返回值不同

```java
executor.execute(runnable);
Future<?> future = executor.submit(runnable);
```

execute 中未捕获运行时异常通常到达工作线程的 UncaughtExceptionHandler。submit 会把异常捕获到 Future 中；调用 `get()` 时通过 ExecutionException 暴露。

如果 submit 后既不保存 Future，也不调用 get，任务失败可能悄无声息。必须有统一策略：

- 消费 Future。
- 包装任务并记录异常。
- 定制 ThreadPoolExecutor.afterExecute。
- 使用框架提供的可观测任务机制。

不能只靠默认未捕获异常处理器覆盖所有提交方式。

## 6. `Future<V>` 表示待完成结果

```java
Future<Result> future = executor.submit(callable);
```

Future 支持：

- `get()`：等待并返回结果。
- `get(timeout, unit)`：最多等待指定时间。
- `cancel(mayInterruptIfRunning)`：请求取消。
- `isDone()`：正常、异常或取消都算完成。
- `isCancelled()`：任务是否在正常完成前被取消。

JDK 19+ 还提供 `state`、`resultNow`、`exceptionNow` 等非阻塞状态 API；JDK 17 代码不能直接使用。

## 7. `Future.get()` 的三类失败

```java
try {
    Result result = future.get();
} catch (InterruptedException error) {
    Thread.currentThread().interrupt();
} catch (ExecutionException error) {
    Throwable cause = error.getCause();
} catch (CancellationException error) {
    // Future 已取消
}
```

- `InterruptedException`：等待线程被中断，不代表任务一定已取消。
- `ExecutionException`：任务自身异常结束，真正原因在 `getCause()`。
- `CancellationException`：任务 Future 已取消。

成功 get 还建立内存一致性关系：任务动作 happens-before get 返回后的动作。

## 8. 超时不等于取消

```java
try {
    return future.get(500, TimeUnit.MILLISECONDS);
} catch (TimeoutException error) {
    future.cancel(true);
    throw new ServiceTimeoutException(error);
}
```

get 超时只表示调用者不再等待，任务默认仍可能继续运行。是否取消要按业务决定，并明确：

- 任务是否允许在调用者超时后继续。
- 下游请求是否也有超时。
- 取消后是否会留下半完成副作用。
- 重试是否幂等。

仅在最外层设置超时，不能自动终止数据库或网络调用。

## 9. `cancel(true)` 只是中断尝试

如果任务尚未开始，成功取消应使它不再运行；如果已开始，true 请求中断执行线程。

它不能：

- 强制杀死不响应中断的代码。
- 回滚已经写入数据库的内容。
- 自动关闭任务拥有的所有资源。
- 保证第三方驱动立即停止底层操作。

任务必须协作处理中断，并把副作用设计成可取消、幂等或事务化。

`cancel(false)` 允许已开始任务继续，只阻止未开始任务；它也不是等待完成。

## 10. 提交与获取结果的 happens-before

ExecutorService 规定：

```text
提交任务前的调用线程动作
        happens-before
任务中的动作
        happens-before
另一个线程成功 Future.get 后的动作
```

因此在 submit 前构造好的不可变参数可被任务看到，get 后可观察任务结果。但这不意味着多个并发任务之间自动排序，也不意味着未通过 get/锁/并发容器发布的旁路状态安全。

## 11. `invokeAll`、`invokeAny` 与完成顺序

`invokeAll(tasks)` 等待所有任务结束，返回 Future 列表的顺序与输入任务迭代顺序相同，不是完成顺序。带超时版本会取消未完成任务。

`invokeAny(tasks)` 返回第一个成功完成的结果，并取消其他未完成任务；不是第一个结束，因为较早失败的任务不算成功。

需要按完成顺序逐个消费结果时可使用 ExecutorCompletionService，避免按提交顺序 get 导致“队头阻塞”。

## 12. Executor 必须有明确所有者

线程池不是普通临时变量。应明确谁负责：

- 创建。
- 提交权限。
- 监控容量和失败。
- 停止接收任务。
- 等待结束和升级取消。

Web 框架管理的 Executor 通常由框架关闭，业务方法不应擅自 shutdown。自行创建的池则必须关闭，否则非 daemon 平台线程可能阻止 JVM 退出并泄漏资源。

## 13. 两阶段关闭

JDK 17 兼容模式：

```java
pool.shutdown();
try {
    if (!pool.awaitTermination(timeout, unit)) {
        pool.shutdownNow();
        if (!pool.awaitTermination(timeout, unit)) {
            logger.error("线程池未能结束");
        }
    }
} catch (InterruptedException error) {
    pool.shutdownNow();
    Thread.currentThread().interrupt();
}
```

shutdown：拒绝新任务，让已提交任务完成，不等待结束。

shutdownNow：返回队列中未开始任务，并中断正在运行任务，是 best effort，不等待任务结束。

awaitTermination：等待 shutdown 后达到 terminated、超时或当前线程被中断。

## 14. JDK 19+ 的 try-with-resources

ExecutorService 从 JDK 19 起继承 AutoCloseable：

```java
try (ExecutorService executor = Executors.newFixedThreadPool(4)) {
    // submit
}
```

close 会发起有序关闭并等待结束；若等待线程被中断，会尝试 shutdownNow，继续等待并在返回前恢复中断状态。

它没有应用级超时策略。需要有界关闭、告警和未开始任务处理时，仍应封装自己的生命周期组件。本课示例就是 JDK 17 兼容的 AutoCloseable 包装。

## 15. 常见执行器工厂

### 固定平台线程池

```java
Executors.newFixedThreadPool(n)
```

固定工作线程数，默认使用无界 LinkedBlockingQueue。它限制并发线程，却不限制排队任务，突发流量可能造成内存增长和长尾延迟。

### 单线程执行器

```java
Executors.newSingleThreadExecutor()
```

按顺序执行任务，适合线程封闭状态，但无界队列风险仍存在。一个任务永久阻塞会拖住后续全部任务。

### CachedThreadPool

按需创建平台线程并复用空闲线程，线程数可能快速增长。不适合未经限流的不可信请求负载。

### ScheduledExecutorService

用于延迟和周期任务，通常优于手写 sleep 循环。任务执行时间、异常和 fixed-rate/fixed-delay 语义必须明确。

### WorkStealingPool

基于 ForkJoinPool，适合可分解 CPU 工作，不保证执行顺序，不适合默认承载阻塞 IO。

### 虚拟线程每任务执行器（JDK 21+）

```java
Executors.newVirtualThreadPerTaskExecutor()
```

每个任务一个虚拟线程，适合大量阻塞 IO。它不是固定大小池；下游连接、速率和内存仍需独立限制。

## 16. `ThreadPoolExecutor` 的容量模型

提交任务时可粗略理解：

```text
运行线程 < corePoolSize  → 创建线程
否则尝试进入工作队列
队列已满且线程 < maximumPoolSize → 再创建线程
队列也满且达到 maximum → 拒绝策略
```

具体行为还受 keepAliveTime、allowCoreThreadTimeOut 等配置影响。

使用无界队列时通常永远不会因为队列满而扩展到 maximumPoolSize，所以 max 配得很大可能毫无效果。

## 17. 线程数不能只写“CPU 核数 + 1”

CPU 密集任务的有效线程数通常接近可用核心，但还受容器 CPU 配额、其他线程、GC 和任务特征影响。

IO 密集任务可允许更多并发，但上限常由：

- 数据库连接池。
- 下游服务容量。
- 文件描述符和内存。
- SLA、超时与排队预算。
- 上游流量和重试放大。

应结合 Little's Law、负载测试与生产指标做容量规划，而不是复制固定公式。

## 18. 有界队列与背压

有界队列让过载可见。容量用尽时必须选择：

- 快速拒绝并返回过载响应。
- 调用线程执行，向上游传播背压。
- 在有界时间内等待入队。
- 按业务优先级丢弃或降级。

无限排队不是“永不拒绝”，只是把拒绝变成更晚的 OOM、超时和雪崩。

## 19. 拒绝策略

ThreadPoolExecutor 内置：

- AbortPolicy：抛 RejectedExecutionException。
- CallerRunsPolicy：由提交线程执行，除非池已关闭。
- DiscardPolicy：静默丢弃。
- DiscardOldestPolicy：丢弃队头再尝试。

静默丢任务通常不可接受。CallerRuns 能减缓提交者，但可能把耗时任务带到事件循环、请求线程或锁内调用者，造成新的风险。策略必须结合调用上下文选择和监控。

## 20. ThreadFactory 是可观测性入口

```java
final class NamedThreadFactory implements ThreadFactory {
    private final AtomicInteger sequence = new AtomicInteger();

    public Thread newThread(Runnable task) {
        return new Thread(task, "orders-" + sequence.incrementAndGet());
    }
}
```

线程名称会出现在日志、线程转储和 JFR 中。还可以统一 daemon、优先级、UncaughtExceptionHandler 和上下文，但不要让 ThreadFactory 隐式复制敏感 ThreadLocal。

## 21. 原子类与 CAS

AtomicInteger 等通过原子读改写操作提供无锁单变量更新：

```java
AtomicInteger count = new AtomicInteger();
int updated = count.incrementAndGet();
```

CAS 概念：

```text
如果当前值仍等于 expected
    写入 update 并成功
否则失败，重新读取/重试
```

失败重试不会阻塞等待锁，但竞争激烈时仍消耗 CPU。lock-free 不等于 wait-free，也不等于永远更快。

## 22. 常用 AtomicInteger 操作

- `get` / `set`。
- `getAndIncrement` / `incrementAndGet`。
- `getAndAdd` / `addAndGet`。
- `compareAndSet`。
- `updateAndGet` / `getAndUpdate`。
- `accumulateAndGet`。

前缀决定返回旧值还是新值：

```java
int old = counter.getAndIncrement();
int now = counter.incrementAndGet();
```

传给 updateAndGet 的函数可能因 CAS 竞争执行多次，不能含发送消息、扣款等副作用。

## 23. 原子引用与 ABA

AtomicReference 可对对象引用做 CAS，但比较的是引用身份。一个值可能从 A 变 B 又回 A，单纯 CAS 看不出中间变化，这叫 ABA。

AtomicStampedReference、版本号或不可变状态中的递增版本可帮助识别，但是否需要取决于算法。普通业务代码优先使用成熟并发结构，不要轻易手写无锁算法。

## 24. Atomic 不会自动维护多个变量事务

```java
AtomicInteger available;
AtomicInteger reserved;
```

两个字段各自原子，不代表“available 减一、reserved 加一”整体原子。其他线程仍可能看到中间状态。

跨变量不变量需要：

- 锁保护整个复合状态。
- 把状态封装为一个不可变对象，用 AtomicReference CAS 整体替换。
- 数据库事务或领域级串行化。

## 25. `LongAdder` 适合高争用统计

LongAdder 把更新分散到多个内部单元，减少高并发热点计数竞争：

```java
LongAdder requests = new LongAdder();
requests.increment();
long snapshot = requests.sum();
```

代价：

- sum 在并发更新时不是原子快照。
- 占用更多空间。
- 不适合需要精确 CAS 或序列号的场景。

适合请求数、指标等统计；账户余额、库存和唯一 ID 通常不适合。

## 26. `ConcurrentHashMap` 的保证

```java
ConcurrentHashMap<K, V> map = new ConcurrentHashMap<>();
```

- 并发读通常不阻塞。
- 更新具有更细粒度协调。
- 不允许 null 键或 null 值，避免并发下 null 歧义。
- 单键成功更新与后续读取具有规定的 happens-before 关系。
- 迭代器弱一致，不抛 ConcurrentModificationException，可反映部分并发更新。

弱一致快照不等于事务时点快照。监控遍历通常可接受，结算报表可能不接受。

## 27. 使用原子复合方法

错误：

```java
if (!map.containsKey(key)) {
    map.put(key, value);
}
```

使用：

```java
map.putIfAbsent(key, value);
map.computeIfAbsent(key, k -> new LongAdder()).increment();
map.merge(key, delta, Math::addExact);
map.compute(key, (k, old) -> nextValue(old));
```

这些方法让单键复合动作由 Map 协调。计算函数应简短，不阻塞，不递归修改同一 Map，且准备好在竞争/实现策略下避免不可重复副作用。

## 28. 并发 Map 仍不是跨键事务

```java
balances.compute(from, ...);
balances.compute(to, ...);
```

转出和转入是两个动作。中间失败会破坏总余额，其他线程也可能观察到一半。

ConcurrentHashMap 解决容器并发访问，不解决：

- 跨键原子性。
- 与数据库/消息队列的一致性。
- 唯一业务约束和幂等。
- 多服务分布式事务。

需要更高层锁、单线程所有者、不可变整体 CAS 或真正事务系统。

## 29. `size()` 与并发观测

并发更新期间，size、isEmpty、containsValue 和聚合结果只能用于监控/估算时尤其要谨慎。刚返回状态就可能变化。

不要写：

```java
if (map.size() < limit) {
    map.put(key, value);
}
```

它不是容量原子约束。使用 Semaphore、有界队列或锁内计数等明确机制。

## 30. 其他并发集合

### CopyOnWriteArrayList

每次结构性写入复制底层数组。适合元素少、读/遍历极多、写极少的监听器列表。写频繁或列表很大时成本高；迭代看到创建迭代器时的快照。

### BlockingQueue

支持 put/take 等阻塞操作，是生产者—消费者、背压和所有权传递的重要工具。ArrayBlockingQueue 有界，LinkedBlockingQueue 应明确容量。

### ConcurrentLinkedQueue

非阻塞并发队列，不自动提供容量限制和等待机制。

### ConcurrentSkipListMap/Set

并发有序 Map/Set，提供范围查询，常见操作 O(log n)，成本高于无序哈希结构。

### Collections.synchronizedXxx

用单一锁包装普通集合。复合遍历时调用者仍需在返回集合对象上手动同步，容易误用；新设计通常优先专用并发集合或明确外部锁。

## 31. 线程安全性的边界必须写进文档

一个类可能：

- 完全不可变。
- 线程安全。
- 有条件线程安全（调用者需遵守协议）。
- 非线程安全但可在线程封闭环境使用。

“用了 ConcurrentHashMap”不能证明整个类线程安全。还要检查：

- 其他字段。
- 跨字段不变量。
- 返回的可变视图。
- 回调重入。
- 生命周期与关闭竞态。

## 32. 完整示例：任务执行与并发指标

示例用固定线程池处理四个任务，通过 Future 观察成功和异常，再取消一个已开始的阻塞任务，并用 ConcurrentHashMap + LongAdder 聚合指标：

::: code-group

<<< ../../../examples/java/executor-future/src/learning/backend/concurrency/ActivityJob.java{java:line-numbers} [ActivityJob.java]

<<< ../../../examples/java/executor-future/src/learning/backend/concurrency/ActivityResult.java{java:line-numbers} [ActivityResult.java]

<<< ../../../examples/java/executor-future/src/learning/backend/concurrency/MetricsSnapshot.java{java:line-numbers} [MetricsSnapshot.java]

<<< ../../../examples/java/executor-future/src/learning/backend/concurrency/ConcurrentMetrics.java{java:line-numbers} [ConcurrentMetrics.java]

<<< ../../../examples/java/executor-future/src/learning/backend/concurrency/NamedThreadFactory.java{java:line-numbers} [NamedThreadFactory.java]

<<< ../../../examples/java/executor-future/src/learning/backend/concurrency/LearningTaskExecutor.java{java:line-numbers} [LearningTaskExecutor.java]

<<< ../../../examples/java/executor-future/src/learning/backend/concurrency/ExecutorFutureApp.java{java:line-numbers} [ExecutorFutureApp.java]

:::

编译：

```bash
cd examples/java/executor-future
mkdir -p out
javac --release 17 -Xlint:all -d out \
  src/learning/backend/concurrency/ActivityJob.java \
  src/learning/backend/concurrency/ActivityResult.java \
  src/learning/backend/concurrency/MetricsSnapshot.java \
  src/learning/backend/concurrency/ConcurrentMetrics.java \
  src/learning/backend/concurrency/NamedThreadFactory.java \
  src/learning/backend/concurrency/LearningTaskExecutor.java \
  src/learning/backend/concurrency/ExecutorFutureApp.java
```

运行：

```bash
java -cp out learning.backend.concurrency.ExecutorFutureApp
```

预期输出：

```text
完成：J-001
完成：J-002
完成：J-003
失败：模拟处理失败：J-004
等待任务已取消：true
成功任务数：3
失败任务数：1
按主题分钟：{Java 泛型=60, Java 集合=75}
```

执行过程：

1. `LearningTaskExecutor` 用两个平台工作线程和 NamedThreadFactory 创建固定池。
2. App 按输入顺序保存 Future，再逐个 get，所以输出按任务列表顺序，不依赖实际完成顺序。
3. 成功 Callable 返回包含任务 ID 和工作线程名的 ActivityResult。
4. 模拟失败被 submit 捕获；get 抛 ExecutionException，App 读取 cause 保留原始消息。
5. 服务在抛出失败前用 LongAdder 记录失败指标，成功任务按主题更新 ConcurrentHashMap 中的 LongAdder。
6. `computeIfAbsent` 原子建立单键计数器，多个线程可安全共享。
7. 额外等待任务先 countDown，确保 main 知道它已经开始并进入可中断阶段。
8. `cancel(true)` 请求中断 sleep；Future 进入取消状态，get 抛 CancellationException。
9. 所有业务 Future 已完成后才读取指标，Future.get 建立可见性关系；快照排序并不可修改。
10. try-with-resources 关闭自有包装器；close 先 shutdown/await，超时后 shutdownNow，并在自身被中断时恢复标志。

取消的等待任务不计为业务成功或失败，因为它不是 ActivityJob。指标定义必须明确区分失败、取消、拒绝和超时；生产监控通常分别计数。

## 33. 示例的刻意限制

`ConcurrentMetrics.recordSuccess` 先增加主题分钟，再增加 succeeded。这两个操作各自线程安全，却不是一个原子事务。示例只在所有 Future 完成后读取，因此最终值一致；若要求运行中每个快照都满足“成功数与分钟同时更新”，应使用锁或整体不可变状态 CAS。

同样，LongAdder.sum 在并发写入时是近似瞬时聚合，不适合余额或配额。课程示例把它限定为监控指标。

## 34. JavaScript / Node.js 对照

| 关注点 | Java | Node.js |
| --- | --- | --- |
| 任务执行器 | ExecutorService / 虚拟线程 Executor | 事件循环、libuv 线程池、Worker Pool |
| 待完成结果 | Future、CompletableFuture | Promise |
| 阻塞等待 | Future.get 阻塞当前线程 | await 暂停 async 函数但不阻塞事件循环 |
| 取消 | Future.cancel + 中断协作 | AbortSignal 等协作协议 |
| CPU 并行 | 平台线程池/ForkJoin/Worker | Worker Threads |
| 原子共享状态 | java.util.concurrent.atomic | SharedArrayBuffer + Atomics |
| 并发 Map | ConcurrentHashMap | 主事件循环普通 Map；跨 Worker 需消息或共享机制 |

Java 的 Future.get 放在请求线程上会占用该线程；虚拟线程能降低阻塞线程成本，但不会降低下游调用延迟。Node 的 await 让出事件循环，但 Promise 本身也不会取消底层操作。

## 35. 常见错误与排查

### 常见错误

- 每个请求创建一个 Executor，任务后不关闭。
- 使用固定池却忽略默认无界队列。
- 把 maximumPoolSize 调大，却使用永不满的无界队列。
- submit 后丢弃 Future，任务异常无人观察。
- get 超时后以为任务已经停止。
- cancel(true) 后假设数据库副作用已回滚。
- shutdown 后不 await，误以为全部任务已结束。
- shutdownNow 后不处理未开始任务列表。
- 吞掉 await/get 的 InterruptedException。
- 用 DiscardPolicy 静默丢失关键任务。
- AtomicInteger 保护多个字段不变量。
- 在 updateAndGet 函数里执行不可重复副作用。
- 用 LongAdder 做精确库存或唯一序列。
- 对 ConcurrentHashMap 先 containsKey 再 put。
- 认为 ConcurrentHashMap 的遍历是事务快照。
- 用并发 Map 两次 compute 实现资金转账。
- 虚拟线程无限冲击数据库连接池。

### 排查顺序

1. 确认 Executor 的创建者、提交者和关闭者。
2. 记录池大小、active count、queue size、拒绝数和任务耗时。
3. 检查队列是否有界，以及过载策略是否适合调用线程。
4. 对每个 Future 明确成功、ExecutionException、超时、取消和中断分支。
5. 超时后追踪任务与下游是否真正收到取消信号。
6. 指标异常时区分精确状态与 LongAdder 弱快照。
7. 逐个标出复合操作是单变量、单键还是跨键/跨系统。
8. 卡住时采集线程转储，区分池耗尽、队列堆积、锁竞争和下游阻塞。
9. 用负载测试验证容量和拒绝行为，而不只验证正常功能。

## 36. 本节总结

- Executor 将任务与执行策略分离，ExecutorService 增加结果、批量执行和生命周期。
- Callable 返回值并可抛异常；submit 把结果和异常封装进 Future。
- Future.get 会阻塞，并通过 ExecutionException 保留任务 cause；成功 get 建立内存可见性。
- 超时不自动取消，cancel(true) 也只是中断尝试，副作用需要独立一致性设计。
- Executor 必须有明确所有者并执行有序关闭、超时等待和强制取消降级。
- 线程池容量由核心线程、最大线程、队列和拒绝策略共同决定；无界队列会隐藏过载。
- ThreadFactory 的命名和异常策略是诊断与可观测性的重要部分。
- Atomic 类通过 CAS 提供单变量原子更新，但不能自动维护多变量事务。
- LongAdder 适合高争用指标，不适合精确余额、库存和强一致快照。
- ConcurrentHashMap 提供并发访问和单键复合方法，不提供跨键或跨系统原子性。
- 并发集合应按读写比、顺序、容量和等待语义选择，而不是统一替换普通集合。
- 虚拟线程每任务模型降低阻塞线程成本，但下游资源仍需限流和超时。

下一节：[Java CompletableFuture、异步编排、超时与异常恢复](/backend/java/completable-future-async-composition-timeout-and-recovery)。

## 37. 参考资料

- [Java SE 25：`ExecutorService` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ExecutorService.html)
- [Java SE 25：`ThreadPoolExecutor` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.html)
- [Java SE 25：`Executors` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Executors.html)
- [Java SE 25：`Future` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Future.html)
- [Java SE 25：`ExecutorCompletionService` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ExecutorCompletionService.html)
- [Java SE 25：`AtomicInteger` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/atomic/AtomicInteger.html)
- [Java SE 25：`LongAdder` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/atomic/LongAdder.html)
- [Java SE 25：`ConcurrentHashMap` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ConcurrentHashMap.html)
- [Java SE 25：`BlockingQueue` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/BlockingQueue.html)
- [Java SE 25：`CopyOnWriteArrayList` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/CopyOnWriteArrayList.html)
