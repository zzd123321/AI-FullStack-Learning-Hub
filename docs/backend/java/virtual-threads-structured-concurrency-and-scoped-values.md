---
title: Java 虚拟线程、结构化并发与 ScopedValue
description: 使用轻量线程编写可读的高并发阻塞代码，并明确任务生命周期、取消、上下文和版本边界
outline: deep
---

# Java 虚拟线程、结构化并发与 `ScopedValue`

> 主环境：JDK 25 LTS。虚拟线程示例兼容 JDK 21；ScopedValue 需要 JDK 25；结构化并发在 JDK 25 仍为预览 API。

## 1. 学习目标

完成本节后，你应该能够：

- 区分平台线程、虚拟线程、载体线程和业务任务。
- 解释虚拟线程提高的是高等待负载的吞吐能力，而不是单个任务速度。
- 使用 `Thread.ofVirtual` 和 `Executors.newVirtualThreadPerTaskExecutor`。
- 说明为什么虚拟线程应该每任务创建，而不是放进固定大小的池。
- 使用 Semaphore、连接池和超时保护稀缺下游资源。
- 判断 CPU 密集、阻塞 IO、异步 IO 分别适合什么并发模型。
- 理解 JDK 21–23 与 JDK 24+ 的 synchronized 固定载体差异。
- 用 StructuredTaskScope 表达父任务与并行子任务的生命周期关系。
- 设计子任务失败、取消、中断、超时和结果汇合策略。
- 使用 ScopedValue 在有界动态作用域内传递不可变请求上下文。
- 区分 ScopedValue 绑定不可变与绑定对象自身不可变。
- 对比虚拟线程顺序代码、CompletableFuture 链和 JavaScript async/await。

## 2. 先看版本状态

| 功能 | 首次正式版本 | JDK 25 状态 | 编译要求 |
| --- | --- | --- | --- |
| 虚拟线程 | JDK 21，JEP 444 | 正式 | 普通编译 |
| synchronized 不再造成绝大多数固定载体 | JDK 24，JEP 491 | JVM 实现改进 | 普通编译 |
| ScopedValue | JDK 25，JEP 506 | 正式 | 普通编译 |
| StructuredTaskScope | 尚未正式 | 第五次预览，JEP 505 | `--enable-preview --release 25` |

预览 API 可能在后续 JDK 改名、改签名或继续预览。生产项目采用前要检查部署 JDK、构建工具、测试环境、容器镜像和启动参数是否一致。

不能只在 javac 开预览：运行 class 也必须传 `--enable-preview`，否则 JVM 拒绝加载使用预览功能的字节码。

## 3. 平台线程为什么稀缺

平台线程通常与操作系统线程一一对应。每个线程需要原生栈、调度资源和内核参与，因此不能无限创建。

传统服务常用固定线程池复用平台线程：

```java
ExecutorService pool = Executors.newFixedThreadPool(200);
```

如果 200 个任务都在等数据库或 HTTP 响应，线程池虽没有做 CPU 工作，却没有线程执行第 201 个请求。增加池大小只能把限制向后推，并增加内存和调度成本。

异步回调通过“等待时归还线程”缓解这个问题，但业务流程会被拆成多个阶段。异常栈、调试和事务边界也更难直观看懂。

## 4. 虚拟线程是什么

虚拟线程仍是 `java.lang.Thread`，但由 JDK 调度，不在整个生命周期中独占一个操作系统线程。

关键术语：

- **虚拟线程**：运行一项顺序业务任务的轻量 Thread。
- **平台线程**：通常映射到操作系统线程的传统 Thread。
- **载体线程**：某一时刻实际承载虚拟线程执行 Java 代码的平台线程。
- **挂载**：虚拟线程被调度到载体上执行。
- **卸载**：虚拟线程等待时离开载体，让载体执行其他虚拟线程。

同一个虚拟线程一生中可能先后运行在不同载体上。业务代码不能依赖载体身份，`Thread.currentThread()` 看到的是虚拟线程本身。

## 5. 它解决吞吐，不缩短单次计算

虚拟线程最适合：

- 同时存在大量相互独立请求。
- 任务的大部分时间在等待网络、数据库、队列或文件 IO。
- 希望保留普通方法调用、循环和 try/catch 的顺序代码风格。

不适合把 CPU 密集任务简单扩到成千上万线程。CPU 同一时刻只能运行接近核心数的计算；过量可运行线程只会增加调度和内存压力。

虚拟线程不是“更快的线程”。它让高等待系统能以更多并发任务获得更高吞吐，单个远程调用的网络延迟不会因此降低。

## 6. 创建单个虚拟线程

直接启动：

```java
Thread thread = Thread.startVirtualThread(() -> handleRequest());
thread.join();
```

通过 Builder 命名：

```java
Thread thread = Thread.ofVirtual()
        .name("request-42")
        .start(this::handleRequest);
```

检测当前线程：

```java
boolean virtual = Thread.currentThread().isVirtual();
```

虚拟线程总是 daemon thread，优先级固定。不要依赖 daemon 线程在 JVM 退出时完成关键写入；应用仍需等待业务任务、关闭作用域或 Executor。

## 7. 每任务一个虚拟线程 Executor

常用入口：

```java
try (ExecutorService executor =
             Executors.newVirtualThreadPerTaskExecutor()) {
    Future<User> user = executor.submit(this::loadUser);
    Future<Stats> stats = executor.submit(this::loadStats);
    return new Dashboard(user.get(), stats.get());
}
```

这个 Executor 每提交一个任务就创建一个新虚拟线程，不是固定大小线程池。JDK 21 起 ExecutorService 可用于 try-with-resources；close 会启动有序关闭并等待任务终止。

显式 get 仍可能无限等待。真实应用必须在 HTTP/JDBC 客户端、任务整体和请求入口配置匹配的超时与取消策略。

## 8. 不要池化虚拟线程

平台线程昂贵，所以传统线程池复用线程。虚拟线程便宜，正确模型是每个业务任务一个新线程，任务结束后线程结束。

错误思路：

```java
Executors.newFixedThreadPool(100, Thread.ofVirtual().factory());
```

这人为把便宜线程限制成 100 个，重新制造排队瓶颈。若目的是保护最多 20 个数据库连接，应限制连接或使用 Semaphore，而不是限制虚拟线程数量。

大量创建虚拟线程仍会分配 Thread 对象、栈块和任务数据。“便宜”不是“零成本”，入口必须有过载控制，不能无限接受无价值工作。

## 9. 并发量必须在资源边界限制

```java
Semaphore permits = new Semaphore(20);

permits.acquire();
try {
    return remoteClient.call();
} finally {
    permits.release();
}
```

虚拟线程解除的是线程稀缺，不会增加：

- 数据库连接数。
- 第三方 API 配额。
- 文件描述符、内存、CPU 或带宽。
- 下游服务容量。

并发许可、客户端连接池、队列上限、速率限制和截止时间必须一起设计。等待许可也应可中断或限时，避免请求已经超时却仍在队列里占用内存。

## 10. 阻塞代码重新变得可伸缩

```java
User user = userClient.get(id);
Stats stats = statsRepository.find(id);
return new Dashboard(user, stats);
```

顺序阻塞代码的优势：

- 调用栈保留完整业务路径。
- try/catch/finally 直接表达失败和清理。
- 调试器可逐行进入方法。
- 每个请求的局部变量自然在线程栈中。

前提是底层库真正允许虚拟线程在等待时卸载或合理补偿。老旧 native 库、某些文件系统调用、不可中断 API 和长时间本地调用仍需测试。

## 11. 虚拟线程不会消除阻塞语义

调用 `Future.get`、`BlockingQueue.take` 或 socket read 时，当前虚拟线程仍然处于等待状态。区别在于它通常不会同时占住载体线程。

因此：

- 业务超时仍然必要。
- 中断仍是协作式取消信号。
- 底层操作可能不响应中断。
- 锁竞争仍会串行化业务。
- 死锁在虚拟线程中仍然是死锁。

“不会浪费平台线程”不等于“等待没有成本”或“系统不会过载”。

## 12. JDK 24 改变了 synchronized 固定载体结论

在 JDK 21–23 中，虚拟线程若在 synchronized 块内执行阻塞操作，可能固定在载体线程上。旧资料常建议为此把 synchronized 全部换成 ReentrantLock。

JDK 24 的 JEP 491 改变 JVM 监视器实现：虚拟线程在 synchronized 内阻塞、等待获取监视器或执行 Object.wait 时，通常也可以卸载。因此在 JDK 24+，选择 synchronized 或 Lock 应重新回到语义需求：

- 简单词法互斥优先 synchronized。
- 需要限时、可中断获取、公平策略或多个 Condition 时使用 Lock。

仍不应持锁执行长时间 IO，因为即使不固定载体，也会长时间阻止其他需要同一锁的业务任务。

## 13. 剩余固定载体情况

JDK 24+ 仍可能在 native/Foreign Function 调用回 Java 后阻塞、类解析或类初始化等少数路径固定载体。这些场景通常少见，但迁移大型系统时要用实际负载验证。

JDK 24 移除了旧的 `jdk.tracePinnedThreads` 诊断作用；剩余固定情况应使用 JDK Flight Recorder 的 `jdk.VirtualThreadPinned` 事件和对应 JDK 工具观察。

不要把针对 JDK 21 的调优文章原样应用到 JDK 25，也不要因为 JDK 24 的改进就忽略 native 依赖的行为。

## 14. ThreadLocal 在虚拟线程中的成本

虚拟线程支持 ThreadLocal，这保证了大量旧代码可迁移。但“每个线程缓存昂贵对象”的传统池化技巧会改变含义：

- 平台线程池只有几十到几百个 ThreadLocal 副本。
- 每任务虚拟线程可能产生海量副本。
- 任务结束后副本可回收，但峰值分配仍可能很高。

不要在每个虚拟线程里创建数据库连接、巨型缓冲区或重量级解析器。把昂贵资源放入明确的池、不可变共享对象或受控缓存。

请求 ID、认证主体等单向不可变上下文，在 JDK 25 可考虑 ScopedValue。

## 15. 非结构化并发的问题

```java
Future<User> user = executor.submit(this::loadUser);
Future<Stats> stats = executor.submit(this::loadStats);
return new Dashboard(user.get(), stats.get());
```

如果 user.get 失败：

- stats 是否仍在运行？
- 谁负责取消它？
- 当前方法退出时子任务是否已经结束？
- 父请求超时时如何向两个任务传播取消？
- 线程转储能否显示这两个线程属于同一请求？

ExecutorService 允许任务比创建它的业务调用活得更久。灵活性很高，但生命周期、失败和取消需要手工编排。

## 16. 结构化并发的核心不变量

结构化并发把一组相关子任务放进词法作用域：

```java
try (var scope = StructuredTaskScope.<Object>open()) {
    var user = scope.fork(this::loadUser);
    var stats = scope.fork(this::loadStats);
    scope.join();
    return new Dashboard(user.get(), stats.get());
}
```

核心目标是：方法不能在其子任务仍无归属地运行时正常越过作用域边界。父任务、子任务和嵌套作用域形成一棵树。

这类似普通方法调用：调用者返回前，被调用方法已经返回或抛异常。并发仍存在，但生命周期结构重新可见。

## 17. JDK 25 API 与旧教程不同

JDK 21–24 的预览教程常出现：

```java
new StructuredTaskScope.ShutdownOnFailure()
```

JDK 25 改为静态工厂和 Joiner：

```java
StructuredTaskScope.open()
StructuredTaskScope.open(Joiner.allSuccessfulOrThrow())
StructuredTaskScope.open(Joiner.anySuccessfulResultOrThrow())
```

不要混用不同预览轮次的源码。即使都叫 StructuredTaskScope，JDK 版本变化也可能导致源码无法编译。

## 18. 默认完成策略

JDK 25 的零参数 `open()`：

- 所有子任务成功时，join 正常返回。
- 任一子任务失败时，作用域取消未完成子任务，join 抛 FailedException。
- 作用域通常使用虚拟线程执行 fork 的子任务。
- join 后才能安全调用 Subtask.get 读取成功结果。

FailedException 的 cause 是子任务的原始失败。边界层应按业务异常分类，而不是统一变成空结果。

## 19. Joiner 表达结果策略

内置策略包括：

- `allSuccessfulOrThrow()`：全部成功，返回成功 Subtask 流；有失败则抛出。
- `anySuccessfulResultOrThrow()`：任一个成功就返回其值并取消其他任务；全部失败才失败。
- `awaitAllSuccessfulOrThrow()`：等待全部成功，但 join 结果为 Void。
- `awaitAll()`：等待全部完成，不以相同方式汇总失败。

“最快成功”适合查询冗余副本，但被取消的请求仍可能在下游继续执行。必须验证客户端中断/取消支持、幂等性和资源成本。

自定义 Joiner 的完成回调可能被多个子任务线程并发调用，其内部状态必须线程安全。

## 20. 取消依赖子任务合作

作用域取消会中断未完成子任务，但 Java 中断不是强制终止：

- `Thread.sleep`、可中断队列和许多阻塞方法会抛 InterruptedException。
- CPU 循环必须主动检查中断状态。
- 某些 native 或客户端调用可能不响应中断。
- 吞掉 InterruptedException 会延迟整个作用域关闭。

StructuredTaskScope.close 会等待子任务真正结束。它保证生命周期结构，因此一个拒绝结束的子任务也可能让 close 长时间等待。

正确修复是让底层操作具备截止时间和取消能力，而不是绕过 close 留下孤儿任务。

## 21. 作用域超时

JDK 25 可在 Configuration 中设置整体超时：

```java
try (var scope = StructuredTaskScope.open(
        Joiner.<Result>allSuccessfulOrThrow(),
        config -> config.withTimeout(Duration.ofSeconds(2))
)) {
    tasks.forEach(scope::fork);
    return scope.join().map(Subtask::get).toList();
}
```

超时会取消作用域并使 join 抛 TimeoutException。但它仍依赖子任务响应中断；HTTP 连接、读取和数据库查询还需要各自的超时。

整体截止时间应从入口向下游递减传播，避免每层各等两秒导致总耗时无限叠加。

## 22. 作用域由拥有线程控制

打开作用域的线程是 owner，负责 fork、join 和 close。JDK 在运行时检查结构：

- 非 owner 错误操作作用域会失败。
- close 必须遵守嵌套顺序。
- 离开前没有正确 join 会触发取消和结构违规检查。
- Subtask 不能当作脱离作用域长期保存的 Future。

这些限制不是麻烦，而是防止任务泄漏和生命周期失控的机制。

## 23. ScopedValue 解决什么问题

有些上下文需要穿过多层调用，但中间方法本身不使用它：

```text
HTTP 入口 -> 业务服务 -> 仓储 -> SQL 日志
 requestId                         需要 requestId
```

显式参数最清楚，应优先使用。但框架边界、认证主体、追踪 ID 等横切上下文可能让大量中间签名只负责转发参数。

ScopedValue 提供一个有界、单向、按动态调用范围读取的隐藏参数。

## 24. 创建、绑定与读取

通常声明为私有静态常量：

```java
private static final ScopedValue<RequestContext> CONTEXT =
        ScopedValue.newInstance();
```

绑定一段调用：

```java
return ScopedValue.where(CONTEXT, context)
        .call(this::handleRequest);
```

深层方法读取：

```java
RequestContext context = CONTEXT.get();
```

call 返回或抛异常后绑定自动消失，不需要 finally remove。未绑定时 get 会失败；可先 `isBound()`，或按 API 契约使用 `orElse`/`orElseThrow`。

## 25. “不可变”的准确含义

ScopedValue 绑定在范围内不能被 set 成另一个值，但它不会冻结所引用的对象。

错误设计：

```java
ScopedValue<List<String>> MUTABLE_CONTEXT;
```

子线程若同时修改同一个 ArrayList，仍然发生数据竞争。上下文应使用 record、不可变集合和线程安全值对象：

```java
record RequestContext(String requestId, String userId) {}
```

ScopedValue 适合从调用者向被调用者单向传值，不适合让深层方法把结果偷偷写回调用者。

## 26. 嵌套绑定与动态作用域

同一个 ScopedValue 可以在内层临时重新绑定：

```java
ScopedValue.where(CONTEXT, outer).run(() -> {
    handle();
    ScopedValue.where(CONTEXT, inner).run(this::handle);
    handle();
});
```

内层看到 inner，离开后自动恢复 outer。这是动态作用域：取值由当前执行路径上最近的绑定决定，不是由源码类的词法嵌套决定。

可通过 Carrier 一次绑定多个 ScopedValue，避免多层嵌套调用。

## 27. 子任务继承上下文

StructuredTaskScope fork 的子任务自动继承 owner 打开作用域时可见的 ScopedValue 绑定，而且无需为每个子线程复制可变存储。

这也是两项功能配合的关键：父调用的绑定必须活到所有子任务结束，结构化作用域保证子任务不会越过绑定的动态生命周期。

普通 ExecutorService、ForkJoinPool 或任意新线程不提供相同的结构化继承保证。不要假设“创建了子线程就一定能读到 ScopedValue”。

## 28. ScopedValue 与 ThreadLocal

| 关注点 | ScopedValue | ThreadLocal |
| --- | --- | --- |
| JDK 状态 | JDK 25 正式 | 长期正式 |
| 写入方式 | 在 where 动态范围绑定 | 任意位置 set/remove |
| 生命周期 | 由调用结构自动限定 | 线程结束或显式 remove |
| 数据流 | 主要单向向下 | 可任意修改 |
| 子任务继承 | StructuredTaskScope 自动继承 | ThreadLocal 不继承；InheritableThreadLocal 复制语义复杂 |
| 典型用途 | 请求 ID、主体、截止时间 | 遗留框架状态、每线程可变缓存等 |

ScopedValue 不是 ThreadLocal 的全面替代。若业务确实需要每线程可变状态或反向传值，需要重新评估数据所有权，而不是机械迁移。

## 29. 事务、安全与日志上下文

虚拟线程不自动改变框架事务语义。请求全程在同一虚拟线程上执行时，既有 ThreadLocal 事务通常能保持；fork 出来的子任务则是不同线程，不应自动共享同一数据库事务或连接。

安全主体和追踪上下文可由框架适配 ScopedValue，但应用不能假设所有库已经迁移。必须核对所用框架版本和传播机制。

不要把可变 EntityManager、数据库 Connection 或事务对象作为 ScopedValue 共享给并行子任务；它们通常不支持并发使用。

## 30. 与 CompletableFuture 的选择

虚拟线程与 CompletableFuture 不是互斥功能：

- 顺序阻塞业务、清晰异常栈、高并发 IO：优先考虑虚拟线程。
- 已有异步驱动、需要非阻塞协议或大量完成阶段组合：CompletableFuture 仍有价值。
- 一次请求内少量并行 IO 且要求统一失败/取消：结构化并发更直观，但 JDK 25 仍是预览。
- CPU 数据并行：考虑并行 Stream、ForkJoin 或受控计算池，而不是海量虚拟线程。

不要在虚拟线程中为了“异步”机械套 CompletableFuture，也不要为避免一个可承受的阻塞调用重写整个框架。

## 31. 完整示例 A：JDK 21 稳定虚拟线程

<<< ../../../examples/java/virtual-threads/stable/src/learning/backend/loom/VirtualThreadApp.java{java:line-numbers}

编译：

```bash
cd examples/java/virtual-threads
mkdir -p out/stable
javac --release 21 -Xlint:all -d out/stable \
  stable/src/learning/backend/loom/VirtualThreadApp.java
```

运行：

```bash
java -cp out/stable learning.backend.loom.VirtualThreadApp
```

预期输出：

```text
全部为虚拟线程：true
结果：[api, jvm, lock, spring]
下游并发上限：2
```

执行过程：

1. Executor 每收到一个资源查询就创建一个虚拟线程。
2. 4 个业务任务可以同时存在，不受固定线程池大小限制。
3. Semaphore 只允许最多 2 个任务同时进入模拟下游。
4. acquire 被中断时不会错误 release；成功获取后才由 finally 归还许可。
5. 主线程通过 Future.get 观察成功、失败或中断。
6. 结果按值排序，输出不依赖并发调度顺序。
7. try-with-resources 关闭 Executor 并等待任务结束。

## 32. 完整示例 B：JDK 25 预览结构化并发

::: code-group

<<< ../../../examples/java/virtual-threads/preview/src/learning/backend/loom/preview/RequestContext.java{java:line-numbers} [RequestContext.java]

<<< ../../../examples/java/virtual-threads/preview/src/learning/backend/loom/preview/LearningDashboard.java{java:line-numbers} [LearningDashboard.java]

<<< ../../../examples/java/virtual-threads/preview/src/learning/backend/loom/preview/StructuredDashboardService.java{java:line-numbers} [StructuredDashboardService.java]

<<< ../../../examples/java/virtual-threads/preview/src/learning/backend/loom/preview/StructuredConcurrencyApp.java{java:line-numbers} [StructuredConcurrencyApp.java]

:::

编译：

```bash
cd examples/java/virtual-threads
mkdir -p out/preview
javac --enable-preview --release 25 -Xlint:all,-preview \
  -d out/preview \
  preview/src/learning/backend/loom/preview/RequestContext.java \
  preview/src/learning/backend/loom/preview/LearningDashboard.java \
  preview/src/learning/backend/loom/preview/StructuredDashboardService.java \
  preview/src/learning/backend/loom/preview/StructuredConcurrencyApp.java
```

编译器仍会提示源码使用 Java SE 25 预览功能；`-preview` 只关闭重复的逐处预览警告，不会把 API 变成正式功能。

运行：

```bash
java --enable-preview -cp out/preview \
  learning.backend.loom.preview.StructuredConcurrencyApp
```

预期输出：

```text
请求：REQ-2026-017
用户：小林
已完成课程：17
子任务上下文一致：true
```

执行过程：

1. 入口创建不可变 RequestContext，并通过 ScopedValue 限定其动态生命周期。
2. 服务在绑定范围内打开 StructuredTaskScope。
3. 用户资料和统计两个独立 IO 模拟任务并行 fork。
4. 子任务自动读取父调用绑定的同一个请求上下文。
5. 默认 join 策略要求两个子任务都成功；用户不存在会使资料子任务失败并取消作用域。
6. join 成功后读取两个 Subtask 结果并组装 Dashboard。
7. try-with-resources 保证离开方法前作用域关闭，子任务不会成为无归属后台线程。
8. call 返回后 RequestContext 绑定自动撤销。

## 33. JavaScript 对照

| Java | JavaScript / Node.js |
| --- | --- |
| 虚拟线程 | 没有直接等价物；普通 JS 主要运行在事件循环线程 |
| 阻塞式顺序 IO | async/await 写法看似顺序，底层仍由 Promise 与事件循环驱动 |
| Future.get | await Promise，但 get 阻塞当前 Java 线程，await 暂停 async 函数 |
| StructuredTaskScope | AbortController + Promise 组合可近似部分生命周期/取消策略 |
| ScopedValue | AsyncLocalStorage 较接近请求上下文传播，但契约不同 |
| CPU 并行 | Java 平台/虚拟线程或计算池；JS 通常需要 Worker Threads |

Java 虚拟线程让阻塞 API 在大量任务下具备更好的线程可伸缩性；JavaScript async/await 不创建“每请求一个 JS 线程”，而是把 continuation 交回事件循环。

Promise.all 在一个 Promise 拒绝后不会自动停止其他底层操作。StructuredTaskScope 默认失败策略会发出取消，但仍需要子任务和客户端响应中断。这两边都不能把“组合对象失败”误解成底层 IO 已被强制终止。

## 34. 常见错误

- 把虚拟线程称作更快线程，用它加速 CPU 密集循环。
- 创建固定大小虚拟线程池，重新引入无意义并发上限。
- 认为线程便宜，所以数据库连接、内存和下游容量也无限。
- 每个虚拟线程通过 ThreadLocal 缓存昂贵可变对象。
- 吞掉 InterruptedException，使请求取消和作用域关闭失效。
- 只给父任务设超时，底层 HTTP/JDBC 调用无限等待。
- 把 JDK 21 关于 synchronized 固定载体的结论原样用于 JDK 25。
- 因 JDK 24 改进而持锁执行长 IO，造成业务锁竞争。
- 使用 JDK 21–24 StructuredTaskScope 旧构造器示例编译 JDK 25。
- 编译打开 preview，运行时忘记 `--enable-preview`。
- scope 内 fork 后忘记 join，或把 Subtask 泄漏到 scope 外。
- 认为作用域取消能强制杀死不可中断子任务。
- ScopedValue 未绑定就 get。
- 把可变集合绑定到 ScopedValue 后让多个子任务并发修改。
- 假设普通 Executor 创建的任务自动继承 ScopedValue。
- 把数据库事务/连接作为上下文共享给并行子任务。

## 35. 排查与观测

1. 先确认运行 JDK 与编译 JDK，记录是否启用 preview。
2. 用 `Thread.currentThread().isVirtual()` 验证框架入口实际线程类型。
3. 区分任务是 CPU 可运行、等待锁、等待许可还是等待 IO。
4. 核对请求并发、信号量许可、连接池和下游配额是否匹配。
5. 检查所有阻塞边界是否有限时、可取消并正确传播中断。
6. JDK 24+ 用 JFR 观察剩余 VirtualThreadPinned 事件，不依赖已移除作用的旧属性。
7. 用 `jcmd <pid> Thread.dump_to_file -format=json <file>` 获取适合大量虚拟线程的新线程转储。
8. 检查结构化作用域是否形成清晰父子树，失败子任务是否让兄弟任务及时结束。
9. 检查 ScopedValue 的绑定入口、读取路径和对象不可变性。
10. 用真实并发和延迟分布压测，比较吞吐、尾延迟、内存、连接等待和错误率。

传统 `jstack` 的平铺输出不适合展示海量虚拟线程。JDK 的 JSON 线程转储和 JFR 更适合观察请求与结构化任务关系。

## 36. 本节总结

- 虚拟线程自 JDK 21 正式，适合大量高等待、非 CPU 密集任务。
- 虚拟线程提高可扩展吞吐，不自动降低单任务延迟，也不增加下游资源。
- 每个任务创建一个虚拟线程，不要用固定虚拟线程池做容量控制。
- 数据库、HTTP 和昂贵资源应由连接池、Semaphore、超时和过载策略保护。
- JDK 24 起 synchronized 阻塞通常不再固定载体；锁选择应以语义为准。
- 中断仍是协作式取消，底层不可中断操作会拖延任务和作用域关闭。
- StructuredTaskScope 把并行子任务限制在父任务生命周期内，但 JDK 25 仍为预览。
- JDK 25 StructuredTaskScope 使用 open 与 Joiner，不能照搬旧预览构造器。
- ScopedValue 在 JDK 25 正式，适合有界、单向、不可变的请求上下文传播。
- ScopedValue 绑定不可变不代表绑定对象自动线程安全。
- 结构化子任务自动继承 ScopedValue，使上下文生命周期与任务树保持一致。
- 虚拟线程、CompletableFuture 和计算池应按阻塞模型与业务结构选择，而非互相全面替代。

下一节：[Java 内存模型、volatile、final 与 happens-before](/backend/java/memory-model-volatile-final-and-happens-before)。

## 37. 参考资料

- [OpenJDK JEP 444：Virtual Threads](https://openjdk.org/jeps/444)
- [OpenJDK JEP 491：Synchronize Virtual Threads without Pinning](https://openjdk.org/jeps/491)
- [OpenJDK JEP 505：Structured Concurrency（JDK 25 第五次预览）](https://openjdk.org/jeps/505)
- [OpenJDK JEP 506：Scoped Values](https://openjdk.org/jeps/506)
- [Java SE 25：`Thread` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Thread.html)
- [Java SE 25：`Executors` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Executors.html)
- [Java SE 25：`ScopedValue` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/ScopedValue.html)
- [Java SE 25：`StructuredTaskScope` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/StructuredTaskScope.html)
