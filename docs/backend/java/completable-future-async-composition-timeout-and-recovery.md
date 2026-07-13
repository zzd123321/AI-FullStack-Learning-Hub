---
title: Java CompletableFuture、异步编排、超时与异常恢复
description: 使用 CompletionStage 组合依赖与并行任务，明确执行线程、超时、取消和异常恢复边界
outline: deep
---

# Java `CompletableFuture`、异步编排、超时与异常恢复

> 适用环境：JDK 25 LTS。完整示例兼容 JDK 17 和 21。

## 1. 学习目标

完成本节后，你应该能够：

- 区分 Future 的阻塞取值与 CompletionStage 的完成后编排。
- 使用 `supplyAsync`、`runAsync` 启动异步任务并显式选择 Executor。
- 正确选择 `thenApply`、`thenCompose`、`thenCombine` 和 `allOf`。
- 理解无 Async 后缀阶段可能在哪个线程执行。
- 使用 `exceptionally`、`handle`、`whenComplete` 表达恢复、转换和观察。
- 区分 `get` 与 `join` 的异常类型及中断语义。
- 使用 `orTimeout` 和 `completeOnTimeout`，并理解它们不自动停止底层工作。
- 解释 CompletableFuture 的取消为何通常不等于中断计算线程。
- 避免 commonPool 被阻塞 IO、长任务或不受控业务占满。
- 设计异步 API 的所有权、失败语义、上下文传播和生命周期。

## 2. Future 的局限

普通 Future 主要提供“等待结果”：

```java
Future<User> future = executor.submit(this::loadUser);
User user = future.get();
```

如果用户加载后还要查询权限，容易在调用线程连续阻塞 get。CompletableFuture 同时实现 Future 和 CompletionStage，可以声明完成关系：

```java
CompletableFuture<User> user = loadUserAsync();
CompletableFuture<Permissions> permissions =
        user.thenCompose(this::loadPermissionsAsync);
```

它描述依赖图，而不是要求当前线程立刻等待每一步。

## 3. 创建与完成

有返回值：

```java
CompletableFuture<User> future = CompletableFuture.supplyAsync(
        this::loadUser,
        executor
);
```

无返回值：

```java
CompletableFuture<Void> future = CompletableFuture.runAsync(
        this::refreshCache,
        executor
);
```

已有结果：

```java
CompletableFuture.completedFuture(value);
CompletableFuture.failedFuture(error);
```

还可以手工 `complete` 或 `completeExceptionally`，多个线程竞争完成时只有一个成功。手工完成适合把回调 API 适配为 Stage，但必须处理重复回调、取消和资源清理。

## 4. 默认执行器不是免费的

不传 Executor 的 `supplyAsync`、`runAsync` 和 Async 阶段默认使用 `ForkJoinPool.commonPool()`（并行度不足时实现可使用新线程）。commonPool 在 JVM 内被多个功能共享。

风险包括：

- 阻塞数据库/网络调用占住工作线程。
- 不同业务互相干扰。
- 无法按下游容量独立限流。
- 线程命名、监控和关闭所有权不清楚。

后端业务通常显式注入有容量、名称和生命周期的 Executor。虚拟线程可降低阻塞成本，但仍要限制数据库连接和外部并发量。

## 5. 同步阶段与 Async 阶段

```java
future.thenApply(this::transform);
future.thenApplyAsync(this::transform, executor);
```

无 Async 后缀的依赖动作可能由完成上游 Future 的线程执行，也可能由调用完成方法的其他线程执行；不要假设它一定在提交者或某个固定工作线程。

Async 后缀把动作调度到默认或显式 Executor。它会增加排队、上下文切换和失败点，不应机械地每一步都加 Async。

原则：

- 很短、非阻塞的纯转换可用非 Async 阶段。
- 阻塞、昂贵或需要隔离的工作显式指定 Executor。
- 不依赖 ThreadLocal 恰好存在；上下文需要显式传播。

## 6. `thenApply`：同步一对一转换

```java
CompletableFuture<String> name = userFuture
        .thenApply(User::displayName);
```

函数返回普通值 R，结果是 `CompletableFuture<R>`。它对应 Optional.map 和 Stream.map 的“一层转换”。

如果函数抛异常，下游 Future 异常完成，后续只处理正常值的阶段会被跳过。

## 7. `thenCompose`：异步依赖展开

错误嵌套：

```java
CompletableFuture<CompletableFuture<Permissions>> nested =
        userFuture.thenApply(this::loadPermissionsAsync);
```

正确：

```java
CompletableFuture<Permissions> permissions =
        userFuture.thenCompose(this::loadPermissionsAsync);
```

当第二个异步操作依赖第一个结果时使用 thenCompose。它类似 flatMap，把两层 Stage 展平。

## 8. `thenCombine`：独立任务汇合

```java
CompletableFuture<User> user = loadUserAsync(id);
CompletableFuture<Stats> stats = loadStatsAsync(id);

CompletableFuture<Dashboard> dashboard = user.thenCombine(
        stats,
        Dashboard::new
);
```

两个任务先独立启动，均正常完成后组合结果。不要先 join 第一个再启动第二个，否则把可并行等待变成串行。

`thenAcceptBoth` 消费两个结果但不返回业务值，`runAfterBoth` 只关心两者完成。

## 9. 任意一个完成

- `applyToEither`：任一阶段正常完成后转换其值。
- `acceptEither`：任一正常结果到达后消费。
- `runAfterEither`：任一正常完成后运行无参动作。
- `anyOf`：任一 Future 完成，返回 `CompletableFuture<Object>`。

“最快成功”不是自动可靠的容灾：失败语义、其他请求取消、幂等、成本和结果一致性都要设计。`anyOf` 返回 Object 也会丢失精确类型。

## 10. `allOf` 不收集结果

```java
CompletableFuture<Void> all = CompletableFuture.allOf(futuresArray);
```

allOf 只表示全部完成，结果为 Void。要收集值，通常在 allOf 后对已完成 Future join：

```java
CompletableFuture<List<T>> collected = all.thenApply(ignored ->
        futures.stream().map(CompletableFuture::join).toList()
);
```

输入为空时 allOf 立即正常完成。某个输入异常时组合结果异常完成，但这不代表其他任务自动取消。

## 11. 成功后的消费

- `thenAccept(value -> ...)`：消费值，返回 `CompletableFuture<Void>`。
- `thenRun(() -> ...)`：不需要上游值，只在正常完成后运行。

不要把关键数据库写入随意藏在 thenAccept 中后丢弃返回 Stage；调用者将无法知道副作用是否完成。异步 API 应返回代表完整业务操作的最终 Stage。

## 12. 三种异常处理方法

### `exceptionally`

仅异常时执行，并把异常转换为同类型备用值：

```java
future.exceptionally(error -> fallback);
```

### `handle`

无论成功失败都执行，接收 value 和 error，并可转换为新结果：

```java
future.handle((value, error) -> error == null ? value : fallback);
```

### `whenComplete`

无论成功失败都观察，通常用于日志/指标，原则上保留原完成结果：

```java
future.whenComplete((value, error) -> recordMetrics(error));
```

如果 whenComplete 自己抛异常，最终异常关系会更复杂。观察逻辑也必须可靠且轻量。

## 13. 异常会被包装

任务异常通常在链中表现为 CompletionException。终点：

- `get()` 抛受检 `InterruptedException` / `ExecutionException`。
- `join()` 抛非受检 `CompletionException`，取消时抛 CancellationException。

```java
try {
    return future.join();
} catch (CompletionException error) {
    Throwable cause = error.getCause();
}
```

处理时保留 cause，并避免重复包装成多层无信息异常。join 不声明 InterruptedException，也不会像 get 那样提供可中断等待契约；需要响应当前线程中断时优先使用 get 或更高层非阻塞返回。

## 14. 恢复应该按异常分类

```java
future.exceptionally(error -> {
    Throwable cause = unwrap(error);
    if (cause instanceof NotFoundException) {
        return emptyResult;
    }
    throw new CompletionException(cause);
});
```

不要把认证失败、数据损坏、程序 bug 和临时超时全部转换成同一个空结果。恢复会改变业务语义，应明确哪些错误可降级、哪些必须传播。

JDK 12+ 的 `exceptionallyCompose` 可在失败时启动另一个异步 Stage，例如备用服务查询。

## 15. `orTimeout` 与 `completeOnTimeout`

```java
future.orTimeout(500, TimeUnit.MILLISECONDS);
```

超时前未完成时，以 TimeoutException 异常完成同一个 CompletableFuture。

```java
future.completeOnTimeout(fallback, 500, TimeUnit.MILLISECONDS);
```

超时时以备用值正常完成。

两者解决“Future 何时完成”，不保证停止 supplier 正在执行的数据库或网络调用。底层客户端仍需连接、读取和整体超时；超时后的迟到副作用仍需处理。

## 16. 取消边界尤其容易误解

CompletableFuture 没有像 FutureTask 那样直接控制产生结果的计算。其 `cancel` 被定义为异常完成，`mayInterruptIfRunning` 参数不会按普通线程任务那样可靠中断底层 supplier。

因此：

- 取消下游 Stage 不保证取消上游。
- 取消组合 Future 不保证终止所有分支。
- 需要保留底层 Future、请求句柄或显式取消令牌。
- 外部 IO 客户端必须支持自己的取消/超时。

不要把 CF 图当作自动传播取消的结构化并发作用域。

## 17. 手工阻塞会破坏异步价值

错误：

```java
return loadUserAsync(id).thenApply(user ->
        loadStatsAsync(id).join()
);
```

这个阶段阻塞执行线程等待另一个 Future，可能耗尽小线程池。应使用 thenCombine 或 thenCompose 描述依赖。

最外层命令行 main 可以 join 等待最终结果；Web 控制器是否阻塞取决于框架线程模型。不要在事件循环线程上 join。

## 18. 上下文传播

日志 MDC、安全上下文、事务上下文和 ThreadLocal 不会因 CompletableFuture 自动可靠传播到另一个 Executor。

可选策略：

- 把必要上下文作为不可变参数显式传入。
- 使用框架提供的 TaskDecorator/上下文传播库。
- 在任务边界安装并 finally 清理上下文。

复制所有 ThreadLocal 既昂贵又可能泄漏敏感数据。虚拟线程也不自动解决业务上下文所有权。

## 19. 事务不会跨异步线程自动延续

许多 Spring 事务绑定当前线程。事务方法内启动 supplyAsync，异步线程通常不在原事务上下文中。

不要依赖“外层加了 @Transactional”覆盖异步分支。应划分独立事务边界、传递业务 ID，并通过幂等、Outbox 或工作流协调跨步骤一致性。

## 20. API 返回 `CompletionStage` 还是 `CompletableFuture`

返回 CompletionStage 能表达“调用者可以继续组合，但不应任意 complete/obtrude 当前对象”：

```java
CompletionStage<Dashboard> loadDashboard(String id)
```

返回 CompletableFuture 则暴露 Future 的 join/get/cancel 和主动完成能力。库 API 通常倾向最小必要接口；应用内部若确实需要 Future 控制可返回具体类型。

`minimalCompletionStage()` 与 `copy()` 可以限制部分操纵能力，但要理解其完成和异常包装契约。

## 21. 完整示例：异步学习仪表盘

::: code-group

<<< ../../../examples/java/completable-future/src/learning/backend/concurrency/UserProfile.java{java:line-numbers} [UserProfile.java]

<<< ../../../examples/java/completable-future/src/learning/backend/concurrency/LearningStats.java{java:line-numbers} [LearningStats.java]

<<< ../../../examples/java/completable-future/src/learning/backend/concurrency/LearningDashboard.java{java:line-numbers} [LearningDashboard.java]

<<< ../../../examples/java/completable-future/src/learning/backend/concurrency/AsyncDashboardService.java{java:line-numbers} [AsyncDashboardService.java]

<<< ../../../examples/java/completable-future/src/learning/backend/concurrency/CompletableFutureApp.java{java:line-numbers} [CompletableFutureApp.java]

:::

编译：

```bash
cd examples/java/completable-future
mkdir -p out
javac --release 17 -Xlint:all -d out \
  src/learning/backend/concurrency/UserProfile.java \
  src/learning/backend/concurrency/LearningStats.java \
  src/learning/backend/concurrency/LearningDashboard.java \
  src/learning/backend/concurrency/AsyncDashboardService.java \
  src/learning/backend/concurrency/CompletableFutureApp.java
```

运行：

```bash
java -cp out learning.backend.concurrency.CompletableFutureApp
```

预期输出：

```text
用户：小林
已完成课程：12
累计分钟：860
推荐：小林，下一节学习 CompletableFuture
失败回退：暂时无法生成推荐
```

执行过程：

1. 资料和统计通过同一个显式 Executor 独立启动，可并行等待。
2. 推荐依赖资料内容，因此 profile 用 thenCompose 展开另一个异步查询。
3. profile 与 stats 用 thenCombine 汇合为中间 record。
4. 中间结果再与 recommendation 汇合为最终 Dashboard。
5. orTimeout 给整条返回 Stage 设置两秒完成期限，但不承诺取消底层任务。
6. 未知用户让 profile 异常完成，依赖资料的分支被跳过，最终链异常完成。
7. `loadDashboardWithFallback` 用 exceptionally 把失败映射成明确降级对象。
8. main 只在应用边界 join 最终结果；服务通过 AutoCloseable 包装 JDK 17 Executor 生命周期。

示例为了教学使用内存返回值。真实 IO 必须设置客户端级超时、容量限制、追踪上下文与可取消句柄。

## 22. JavaScript Promise 对照

| 关注点 | CompletableFuture | JavaScript Promise |
| --- | --- | --- |
| 一对一转换 | thenApply | then |
| 异步展开 | thenCompose | then 自动吸收返回 Promise |
| 两个结果汇合 | thenCombine | Promise.all 后解构 |
| 全部完成 | allOf（不收集值） | Promise.all（收集值） |
| 任意完成 | anyOf/applyToEither | Promise.race / Promise.any 语义各异 |
| 异常恢复 | exceptionally/handle | catch/then 第二参数 |
| 执行线程 | Executor/完成线程 | 事件循环与微任务队列 |
| 取消 | 异常完成，不可靠中断底层 | Promise 本身不可取消，常配 AbortSignal |

Java 的非 Async 阶段可能在完成上游的线程内执行；Promise 回调按 JS 微任务规则调度。不能仅凭链式语法相似推断线程与时序。

## 23. 常见错误与排查

### 常见错误

- 阻塞 IO 使用默认 commonPool。
- 每一步机械添加 Async，制造额外排队和上下文切换。
- 假设非 Async 阶段固定在调用线程执行。
- 用 thenApply 返回 Future，产生嵌套 CF。
- 在阶段内部 join 另一个 CF，造成线程池饥饿。
- allOf 后忘记收集各结果或观察分支异常。
- exceptionally 把所有错误静默降级。
- 只设置 orTimeout，底层 HTTP/数据库无超时。
- 调用 cancel(true) 后假设 supplier 已被中断。
- 丢弃最终返回 Stage，导致副作用失败无人观察。
- 依赖 ThreadLocal、事务或 MDC 自动跨 Executor 传播。
- 自建 Executor 不关闭，或关闭框架共享 Executor。

### 排查顺序

1. 画出依赖图，标明串行依赖、可并行分支和汇合点。
2. 标出每个阶段是同步还是 Async，以及实际 Executor 所有者。
3. 查找 Lambda 内的 get/join/阻塞 IO。
4. 从最终异常逐层解包 CompletionException/ExecutionException 的 cause。
5. 检查恢复阶段是否误吞不可恢复错误。
6. 分别核对 Future 超时、底层客户端超时和业务整体截止时间。
7. 取消无效时追踪底层计算是否有独立取消句柄并响应中断。
8. 检查上下文与事务是否跨线程丢失。
9. 监控 Executor 活跃线程、队列、拒绝、阶段耗时和超时数。

## 24. 本节总结

- CompletableFuture 同时是 Future 和 CompletionStage，用依赖图代替逐步阻塞 get。
- thenApply 转换普通值，thenCompose 展开依赖异步任务，thenCombine 汇合独立结果。
- 非 Async 阶段可能由完成上游的线程执行；Async 阶段应显式选择合适 Executor。
- commonPool 是共享资源，不适合不受控阻塞 IO 与业务隔离。
- exceptionally 用于同类型恢复，handle 同时处理成功失败，whenComplete 适合观察。
- get 提供受检异常和中断等待，join 使用 CompletionException，二者都可能阻塞当前线程。
- orTimeout 和 completeOnTimeout 只决定 Future 完成，不保证停止底层工作。
- CompletableFuture.cancel 是异常完成，通常不能可靠中断产生结果的计算。
- allOf 不收集值，任一分支失败也不会自动取消其他分支。
- ThreadLocal、事务和日志上下文不会自动跨 Executor 安全传播。
- 异步 API 应返回代表完整业务操作的最终 Stage，并明确所有权、容量、失败和取消语义。

下一节建议：Java 锁、条件队列、信号量与高级同步器。

## 25. 参考资料

- [Java SE 25：`CompletableFuture` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/CompletableFuture.html)
- [Java SE 25：`CompletionStage` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/CompletionStage.html)
- [Java SE 25：`ForkJoinPool` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ForkJoinPool.html)
- [Java SE 25：`CompletionException` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/CompletionException.html)
- [Java SE 25：`Executors` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Executors.html)
