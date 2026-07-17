---
title: Java GC 日志、JFR、线程转储、堆转储与故障排查
description: 从低开销运行时证据到高成本内存转储，建立可复现、可关联的 JVM 故障诊断流程
outline: deep
---

# Java GC 日志、JFR、线程转储、堆转储与故障排查

> 适用环境：JDK 25 LTS。完整示例兼容 JDK 17 和 21。

## 这是故障现场手册，不需要线性背诵

本课的命令很多，但它们不组成一套每次全部执行的仪式。诊断应从症状出发，先选择成本最低、最能验证假设的证据，再决定是否采集更重的转储。

第一次阅读只建立以下顺序：记录时间线和运行环境，先看指标与日志，再按高 CPU、线程阻塞、频繁 GC 或内存增长选择工具。JFR、线程转储和堆转储的命令细节留在真正排障时查阅；不要为了练习工具在生产环境无评估地生成大文件。

## 1. 学习目标

完成本节后，你应该能够：

- 在操作前记录时间线、JDK、PID、启动参数、容器限制和故障现象。
- 区分应用、JVM、操作系统、容器和下游服务的证据。
- 使用 Unified Logging 持续记录 GC 与 safepoint，并限制日志磁盘占用。
- 从 GC cause、暂停、回收前后占用、频率和分配速率判断问题方向。
- 区分分配压力、存活集增长、Java 堆泄漏、Metaspace 和 native memory 增长。
- 启动、检查、转储和停止 JFR，并用 `jfr` 命令读取录制文件。
- 设计低开销、有限基数且不泄漏敏感信息的自定义 JFR Event。
- 从线程状态、栈帧、锁拥有者和多次快照变化判断阻塞、死锁或忙循环。
- 理解传统线程转储与大量虚拟线程 JSON 转储的区别。
- 安全获取 class histogram 和 heap dump，并评估暂停、磁盘和隐私影响。
- 使用 Native Memory Tracking 排查“RSS 很高但 Java 堆不高”。
- 为高 CPU、高延迟、内存增长、频繁 GC 和 OOM 建立分支式排查路径。
- 知道什么时候应停止继续采集，先恢复服务或请求更高权限。

## 2. 诊断的第一原则：先保留证据

故障时最危险的动作不是“命令不够多”，而是重启、扩容或改参数后丢失唯一现场，却没有记录改变前状态。

最小事件记录：

- 绝对时间与时区，例如 `2026-07-14T09:30:00+08:00`。
- 症状开始、告警、变更、重启、恢复时间。
- 服务、实例、pod/container、host、region、版本和 commit。
- JDK vendor/version、PID、完整启动参数。
- CPU、RSS、heap、线程数、请求量、错误率、P95/P99。
- 最近部署、配置、流量和依赖变化。
- 已执行命令及其输出文件路径。

证据要能跨应用日志、GC 日志、JFR、基础设施指标和 tracing 按时间对齐。

## 3. 先确认影响与操作权限

诊断命令不是全部无害：

| 操作 | 常见影响 | 主要风险 |
| --- | --- | --- |
| `VM.version`、`VM.flags`、`JFR.check` | 低 | 信息暴露 |
| 线程转储 | 低到中，线程越多影响越大 | 栈中可能有业务数据 |
| JFR default 长录制 | 通常低 | 磁盘与敏感字段 |
| JFR profile 短录制 | 低到中 | 额外采样开销 |
| class histogram | 中到高 | 大堆扫描和暂停 |
| heap dump | 高 | 长暂停、大文件、隐私数据、磁盘打满 |
| 强制 Full GC | 中到高 | 长暂停、尾延迟放大 |

执行高影响操作前确认：业务是否允许暂停、剩余磁盘、写入目录、数据处理政策、容器重启风险和负责人授权。

## 4. 三层症状不能混为一谈

### 应用层

请求超时、错误码、队列积压、线程池拒绝、连接池等待、锁竞争。

### JVM 层

GC、safepoint、JIT、类加载、Java/虚拟线程、heap/Metaspace/code cache/direct buffer。

### 系统与容器层

CPU throttling、cgroup 内存、OOM kill、swap、page fault、文件描述符、网络、磁盘 IO。

Java 进程消失且没有 `OutOfMemoryError`，可能是容器/内核 OOM kill；Java heap 使用正常但 RSS 增长，可能是线程栈、direct memory、native 库或映射文件。

## 5. 统一日志（Unified Logging）基础

JDK 9+ 使用 `-Xlog` 统一记录 JVM 内部事件：

```bash
java -Xlog:gc*,safepoint \
  -cp out learning.backend.diagnostics.DiagnosticWorkloadApp
```

基本结构：

```text
-Xlog:<selectors>:<output>:<decorators>:<output-options>
```

- selector：标签与级别，如 `gc*`、`safepoint`、`class+load=info`。
- output：stdout、stderr 或文件。
- decorator：time、uptime、level、tags、pid、tid 等。
- output option：文件轮转数量和大小。

查看当前 JDK 可用标签与语法：

```bash
java -Xlog:help
```

## 6. 生产 GC 日志模板

```text
-Xlog:gc*,safepoint:file=/logs/gc-%p.log:time,uptime,level,tags:filecount=5,filesize=20M
```

- `%p` 展开为 PID，避免同目录实例互相覆盖。
- 绝对时间用于跨系统关联，uptime 用于进程内顺序。
- filecount/filesize 防止日志无限增长。
- 路径必须可写，并纳入日志采集和磁盘告警。

在容器内先确认 `/logs` 是持久卷还是临时层；pod 删除后临时文件也会消失。

## 7. 读一条 GC 日志看什么

不同收集器格式不同，但核心问题一致：

- GC ID：同一周期的多行如何关联。
- cause：Allocation Failure、Metadata GC Threshold、System.gc 等触发原因。
- 类型/阶段：Young、Mixed、Old、Concurrent、Pause。
- before → after：本次回收了多少。
- heap capacity：当时堆上限/提交量。
- pause duration：停顿多久。
- CPU time：user/sys/real 是否异常。
- concurrent duration：并发阶段耗时和是否被打断。

不要只截取“Pause 20ms”一行；需要上下文、前后周期和同时间业务指标。

## 8. 分配压力与泄漏的区别

### 高分配但可回收

- Young GC 频繁。
- 每次回收后占用回落到相近基线。
- 老年代/长期存活集不持续上升。
- CPU 和吞吐可能受影响，但不一定泄漏。

### 存活集持续增长

- GC 后最低占用逐步抬升。
- Old/Mixed 周期更频繁。
- Full GC 后仍无法明显回落。
- 最终可能 OOM。

判断泄漏要看“回收后的基线趋势”，不能只看回收前的锯齿峰值。

## 9. GC 暂停与 safepoint 要分开

GC pause 通常发生在 safepoint，但 safepoint 不只服务 GC。偏向撤销历史、类重定义、线程转储、部分 VM 操作等也可能让线程进入安全点。

长延迟可能来自：

- 到达 safepoint 很慢。
- safepoint 中 VM operation 本身很慢。
- GC stop-the-world 阶段。
- GC 之外的锁、IO 或 CPU throttling。

因此同时记录 `gc*` 与 `safepoint`，再与 JFR 和业务 tracing 对齐。

## 10. 不要主动 `GC.run` 作为第一反应

```bash
jcmd <pid> GC.run
```

它调用 `System.gc()`，影响取决于收集器、堆大小和 JVM 设置，可能造成明显停顿。

若目的是判断泄漏，强制 GC 会改变现场并伤害业务。优先使用已有 GC 周期、JFR old object sample、histogram 趋势或受控 heap dump；确需 Full GC 时先记录原因和影响窗口。

## 11. JFR 是时间相关的 JVM 事件记录

Java Flight Recorder 记录带时间戳的 JVM、JDK 和应用事件，例如：

- CPU execution sample。
- 线程 park/sleep、Java monitor 等待。
- socket/file IO。
- 对象分配采样。
- GC、safepoint、类加载和 JIT。
- 异常统计。
- 虚拟线程事件。
- 自定义业务事件。

JFR 的优势是把多个子系统放到同一时间线，而不仅是一张静态快照。

## 12. `default` 与 `profile` 配置

- `default.jfc`：预定义低开销信息，适合持续或较长时间录制。
- `profile.jfc`：采集更多信息、开销更高，适合故障窗口短时深入分析。

不要把 profile 永久开启后不评估开销。先用 default 建立常态基线，异常时在有限时段提升采样强度。

## 13. JVM 启动时开启 JFR

```text
-XX:StartFlightRecording=name=backend,settings=default,maxage=1h,maxsize=256m,dumponexit=true,filename=/recordings/backend-%p.jfr
```

`maxage`/`maxsize` 让磁盘仓库成为滚动窗口。`dumponexit` 在正常 JVM 退出时写文件，但进程被 SIGKILL、容器 OOM kill 或节点消失时不能保证完成。

录制目录应独立限额，并保护文件权限。JFR 可能包含类名、路径、系统属性、命令行、线程名、自定义字段和栈信息。

## 14. 对运行中 JVM 启动 JFR

```bash
jcmd <pid> JFR.start \
  name=incident \
  settings=profile \
  duration=2m \
  filename=/recordings/incident-%p-%t.jfr
```

检查：

```bash
jcmd <pid> JFR.check name=incident
```

运行中复制当前数据，录制继续：

```bash
jcmd <pid> JFR.dump \
  name=incident \
  filename=/recordings/incident-now-%p-%t.jfr
```

停止并写文件：

```bash
jcmd <pid> JFR.stop \
  name=incident \
  filename=/recordings/incident-final-%p-%t.jfr
```

参数以目标 JDK 的 `jcmd <pid> help JFR.start` 为准。

## 15. 使用 `jfr` 命令读取

若 `jfr` 不在 PATH，使用：

```bash
"$JAVA_HOME/bin/jfr" summary incident.jfr
```

查看预定义视图：

```bash
"$JAVA_HOME/bin/jfr" view hot-methods incident.jfr
"$JAVA_HOME/bin/jfr" view gc-pauses incident.jfr
```

按事件打印：

```bash
"$JAVA_HOME/bin/jfr" print \
  --events jdk.ThreadPark,jdk.JavaMonitorEnter \
  incident.jfr
```

可用事件和 view 随 JDK 版本变化，先运行 `jfr help`、`jfr view` 或 `jfr metadata`。

## 16. 自定义 JFR 事件

```java
@Name("learning.backend.CourseBatch")
@Label("Course Batch")
@Category({"Learning", "Backend"})
final class CourseBatchEvent extends Event {
    @Label("Batch Count")
    int batchCount;
}
```

典型使用：

```java
CourseBatchEvent event = new CourseBatchEvent();
event.begin();
try {
    processBatch();
    event.batchCount = count;
} finally {
    event.end();
    event.commit();
}
```

事件类应描述业务边界，而不是把每个普通方法都变成事件。

## 17. 自定义事件设计原则

- 事件名称稳定、全局唯一并带组织前缀。
- 字段数量有限，使用业务 ID 类别而非完整请求体。
- 禁止密码、token、身份证、SQL 参数等敏感值。
- 高频事件先检查 `isEnabled()`；构造昂贵字段前检查 `shouldCommit()`。
- duration threshold 过滤太短事件，减少数据量。
- 枚举/状态保持有限基数，避免任意用户 ID 让分析维度爆炸。
- 自定义事件与 tracing span/metric 使用可关联但合规的 ID。

JFR Event 未启用时提交开销较低，不代表昂贵字段生成也自动免费。

## 18. 线程转储是什么

线程转储是某一时刻所有可观测线程的状态、Java 栈和锁关系快照。

传统平台线程：

```bash
jcmd <pid> Thread.print -l
```

写入文件：

```bash
jcmd <pid> Thread.dump_to_file \
  -format=plain \
  /diagnostics/threads-%p.txt
```

大量虚拟线程优先使用 JSON：

```bash
jcmd <pid> Thread.dump_to_file \
  -format=json \
  /diagnostics/threads-%p.json
```

命令语法和是否支持某选项以目标 JDK 的 help 为准。

## 19. Java 线程状态

| 状态 | 含义 | 常见现场 |
| --- | --- | --- |
| NEW | 尚未 start | 线程对象已创建 |
| RUNNABLE | JVM 可运行；也可能在 native IO | CPU 计算、socket 调用 |
| BLOCKED | 等待进入 synchronized monitor | 锁竞争 |
| WAITING | 无限等待其他动作 | Object.wait、join、park |
| TIMED_WAITING | 带期限等待 | sleep、限时 wait/park/join |
| TERMINATED | 已结束 | 正常返回或异常退出 |

RUNNABLE 不等于正在消耗 CPU；必须结合栈顶 native 方法、JFR execution sample 和系统线程 CPU。

## 20. `BLOCKED` 与 `WAITING` 的不同

`BLOCKED` 特指等待获取对象监视器：

```text
"diagnostic-lock-waiter" ... BLOCKED
  - waiting to lock <0x...>
  - locked <0x...> by "diagnostic-lock-holder"
```

`WAITING`/`TIMED_WAITING` 可能是正常的线程池空闲、队列 take、Condition、Future、join 或 sleep。

不能按 WAITING 数量判断服务“卡死”。要看它在等待什么、谁应唤醒、等待多久，以及业务请求是否被这些线程持有。

## 21. 线程转储要连续采样

单张转储只能说明一个瞬间。诊断高 CPU 或卡顿通常间隔数秒取 3–5 张：

```bash
jcmd <pid> Thread.print -l > threads-1.txt
sleep 5
jcmd <pid> Thread.print -l > threads-2.txt
```

若同一线程在多张快照保持相同业务栈：

- RUNNABLE 且 CPU 高：可能忙循环/热点计算。
- BLOCKED：查锁拥有者是否长 IO、死锁或停滞。
- WAITING：查完成信号是否丢失、任务是否从未提交。

采样间隔应覆盖故障持续时间，又不能频繁到只看到同一瞬间。

## 22. 死锁证据

典型 Java monitor/ownable synchronizer 死锁会在线程转储末尾显示检测结果和环：

```text
Thread A holds Lock 1, waits Lock 2
Thread B holds Lock 2, waits Lock 1
```

还存在 JVM 不一定自动识别的“业务死锁”：线程等 Future，Future 任务排在同一个已耗尽线程池；请求持有数据库连接再等待另一个连接等。

要把线程、锁、线程池队列、连接池和业务依赖一起画图。

## 23. 高 CPU 线程定位

推荐证据链：

1. 系统/容器确认是进程 CPU，而非 throttling 指标误读。
2. JFR `ExecutionSample`/hot methods 找 Java 热点。
3. 必要时把 OS thread ID 与转储中的 nid 对应（平台差异需确认进制）。
4. 连续转储确认热点栈是否持续。
5. 检查 GC CPU、JIT、序列化、正则、循环和重试。

虚拟线程会迁移载体，不能把业务虚拟线程长期绑定到某个 OS TID 推理；JFR 能保留更合适的线程与事件关系。

## 24. Class Histogram

```bash
jcmd <pid> GC.class_histogram
```

输出按类汇总实例数与浅大小，适合回答：

- 哪类对象数量异常。
- byte[]、char[]、String、Map 节点是否大量增长。
- 同一时间点的主要堆占用类型。

它不显示对象为何存活、谁引用它，也不等于 retained size。命令被官方标记为高影响，具体成本取决于堆大小和对象数量。

## 25. Histogram 趋势比单点更重要

在相近流量阶段采集两到三个 histogram，比较：

- instance count 增量。
- bytes 增量。
- 类加载器/代理类增长。
- GC 后是否仍增长。

单点看到大量 byte[] 可能只是正常缓存或网络缓冲。需要结合分配栈、业务指标和保留链。

不要在高峰期无节制重复执行高影响 histogram。

## 26. Heap Dump

```bash
jcmd <pid> GC.heap_dump /diagnostics/heap-%p.hprof
```

JDK 25 的 jcmd 文档说明该命令影响高，默认可能请求 Full GC；`-all` 可包含不可达对象并改变相关行为。

Heap dump 可分析：

- 对象、字段、数组内容。
- GC Root 路径。
- dominator tree 与 retained size。
- 类加载器和 ThreadLocal 保留。
- 大集合、缓存和重复字符串。

它是静态内存快照，不能直接告诉你 CPU、历史增长速度或对象分配时间线。

## 27. 获取堆转储前的安全检查

- 目标目录空间应明显大于预期堆转储大小。
- 文件写在持久且受控的挂载，不写满应用日志盘。
- 评估 Full GC/堆遍历暂停能否接受。
- 限制文件权限和下载人群。
- 视 heap dump 为生产数据库副本级敏感资产。
- 传输、存储、删除遵守数据保留政策。
- 记录命令开始/结束时间，关联延迟影响。

若没有足够磁盘或不能暂停，先用 JFR、histogram 趋势、指标和可控副本复现。

## 28. OOM 自动转储

```text
-XX:+HeapDumpOnOutOfMemoryError
-XX:HeapDumpPath=/diagnostics
```

优点是捕获失败时现场；风险是：

- 目录不可写导致没有文件。
- 多实例同时 OOM 写满共享盘。
- 写 dump 期间进程仍占资源。
- dump 含敏感数据。
- 某些非 heap OOM 的 heap dump价值有限。

还应保存 stderr、GC 日志、容器事件和退出码，区分 JVM OOM 与内核/cgroup kill。

## 29. Heap Dump 分析顺序

1. 确认 dump 时间、实例、流量和堆上限。
2. 看总体对象数、类和 ClassLoader。
3. 查看 dominator tree 的最大 retained size。
4. 对可疑对象追踪到 GC Roots 的保留路径。
5. 区分缓存设计、请求积压、ThreadLocal、listener 和 classloader 泄漏。
6. 与正常基线 dump/histogram 对比，而不是只看绝对数量。
7. 回到源码确认对象生命周期和清理协议。

Shallow size 只含对象自身；retained size 估算删除该对象后可释放的整个支配子图，更适合找保留者。

## 30. Native Memory Tracking

NMT 需要在 JVM 启动时开启：

```text
-XX:NativeMemoryTracking=summary
```

查看：

```bash
jcmd <pid> VM.native_memory summary scale=MB
```

建立基线并比较：

```bash
jcmd <pid> VM.native_memory baseline
jcmd <pid> VM.native_memory summary.diff scale=MB
```

NMT 有自身开销，detail 高于 summary；它主要跟踪 HotSpot/JVM 已纳入分类的 native 分配，不是进程 RSS 的完整替代。

## 31. RSS 高于 `-Xmx` 很正常

进程 RSS 还可能包含：

- Metaspace/class space。
- code cache。
- 平台线程 native stacks。
- direct/NIO buffers。
- GC/JIT/JVM 内部结构。
- JNI/native 库分配。
- mmap 文件、共享库页。

`-Xmx=2g` 只限制 Java heap 的一部分语义，不是进程总内存上限。容器 memory limit 需要为完整进程留余量。

## 32. 容器诊断限制

- jcmd 必须在目标 JVM 所在机器/命名空间可达，且有效用户/组匹配。
- `jcmd -l` 看不到另一个容器 PID namespace 中的进程。
- 极简运行镜像可能只有 JRE 模块，没有 jcmd/jfr 等工具。
- Kubernetes exec 权限、只读文件系统和 seccomp 会限制采集。
- sidecar/ephemeral debug container 也要解决 PID namespace、用户和 JDK 版本匹配。
- pod 被重建前要把录制和转储复制到持久存储。

生产镜像是否携带诊断工具应在上线前设计，不要事故时临时下载未知二进制。

## 33. 高 CPU 排查路径

```text
进程 CPU 高
  ├─ GC CPU 高？→ 看 GC 周期、分配率、存活集
  ├─ JIT/类加载短时？→ 看 JFR compilation/class load
  ├─ 应用线程热点？→ JFR samples + 连续线程转储
  └─ 容器 throttling？→ 看 cgroup quota/throttled time
```

修复前确认热点与业务请求关联。CPU 高可能是健康吞吐增长，也可能是无限重试、序列化爆炸或正则灾难性回溯。

## 34. 延迟或卡死排查路径

1. 对齐入口 P99、下游 tracing、连接池和线程池指标。
2. 查 GC/safepoint 是否覆盖延迟窗口。
3. JFR 查看 monitor、park、socket/file IO 与长任务。
4. 连续线程转储定位相同栈和锁拥有者。
5. 查线程池队列、拒绝、Future 依赖和连接池等待。
6. 查外部依赖超时、DNS、TLS、网络丢包。

不要看到线程 WAITING 就增加线程池；若真正瓶颈是数据库连接或锁，只会增加等待者。

## 35. Java Heap 增长路径

1. GC 日志确认 GC 后基线是否持续增长。
2. JFR 看 allocation sample/old object sample 和类趋势。
3. 在可接受窗口采集 histogram，并与基线比较。
4. 必要时安全获取 heap dump。
5. 用 dominator/GC Roots 找实际保留者。
6. 检查无界缓存、队列、ThreadLocal、listener、session 和 classloader。

“分配最多的类”不一定是“保留最多的类”；热点分配和泄漏是两个问题。

## 36. OOM 排查路径

先完整记录消息：

- `Java heap space` → heap 使用、存活集、dump。
- `Metaspace` → class 数、ClassLoader、动态代理、热部署。
- `Direct buffer memory` → NIO/direct buffer、客户端和 native memory。
- `unable to create native thread` → 平台线程数、`-Xss`、系统进程/线程限制和地址空间。
- 无 JVM 错误直接退出 → 容器/内核 OOM kill、SIGKILL、节点事件。

不同 OOM 证据完全不同，统一“加 Xmx”可能让容器更快被杀。

## 37. 故障后验证修复

修复不以“服务重启成功”为完成：

- 用相同负载验证症状消失。
- 对比修复前后的 GC/JFR/线程/内存基线。
- 检查错误率、P99、CPU、RSS、分配率和下游压力。
- 验证告警能在用户大面积受影响前触发。
- 验证自动转储目录、轮转和权限。
- 写入时间线、根因、触发条件、修复与防复发项。

若只降低告警阈值或扩容，没有解释资源为何增长，通常还没找到根因。

## 38. 完整示例：可控诊断负载

::: code-group

<<< ../../../examples/java/jvm-diagnostics/src/learning/backend/diagnostics/CourseBatchEvent.java{java:line-numbers} [CourseBatchEvent.java]

<<< ../../../examples/java/jvm-diagnostics/src/learning/backend/diagnostics/DiagnosticWorkloadApp.java{java:line-numbers} [DiagnosticWorkloadApp.java]

:::

编译：

```bash
cd examples/java/jvm-diagnostics
mkdir -p out
javac --release 17 -Xlint:all -d out \
  src/learning/backend/diagnostics/CourseBatchEvent.java \
  src/learning/backend/diagnostics/DiagnosticWorkloadApp.java
```

普通运行：

```bash
java -cp out learning.backend.diagnostics.DiagnosticWorkloadApp
```

预期输出：

```text
诊断负载已就绪
等待线程状态：BLOCKED
分配批次：3
诊断负载已结束
```

执行过程：

1. `diagnostic-lock-holder` 获取 MONITOR，在 CountDownLatch 上等待释放。
2. `diagnostic-lock-waiter` 尝试进入同一个 synchronized，稳定进入 BLOCKED。
3. 主线程确认状态后分配 3 个 256 KiB 数组，并通过 reachabilityFence 保留到诊断窗口结束。
4. 分配过程提交一个 `learning.backend.CourseBatch` 自定义 JFR Event。
5. 默认等待时间为 0，验证运行立即释放 holder 并 join 两个线程。
6. 传入 1–300 秒可保留诊断窗口，finally 始终释放 monitor。

## 39. 对示例执行线程诊断

启动一个 30 秒窗口：

```bash
java -cp out \
  learning.backend.diagnostics.DiagnosticWorkloadApp 30 &
PID=$!
```

确认目标：

```bash
jcmd "$PID" VM.version
jcmd "$PID" VM.command_line
```

线程转储：

```bash
jcmd "$PID" Thread.print -l
```

搜索 `diagnostic-lock-waiter`，应看到 BLOCKED 及 monitor 拥有关系；holder 通常在 CountDownLatch.await 对应的 WAITING/PARK 状态，同时仍持有 MONITOR。

等待示例正常退出：

```bash
wait "$PID"
```

## 40. 对示例录制并读取 JFR

启动即录制：

```bash
java \
  -XX:StartFlightRecording=filename=diagnostics.jfr,settings=profile,dumponexit=true \
  -cp out \
  learning.backend.diagnostics.DiagnosticWorkloadApp
```

汇总：

```bash
"$JAVA_HOME/bin/jfr" summary diagnostics.jfr
```

读取自定义事件：

```bash
"$JAVA_HOME/bin/jfr" print \
  --events learning.backend.CourseBatch \
  diagnostics.jfr
```

应能看到 `batchCount = 3` 与 `allocatedKiB = 768`。`.jfr` 是运行生成物，不应提交到仓库。

## 41. 示例为什么不制造真实 OOM

教学代码不应通过无限分配或死锁让机器失去响应：

- OOM 可能影响同机其他进程。
- heap dump 可耗尽磁盘。
- 死锁/无限等待会让自动验证挂起。
- 不同 JVM/容器限制下结果不可控。

示例只保留 768 KiB，并把诊断窗口限制为最多 300 秒。真实 OOM 演练应在隔离容器中设置明确 heap、磁盘、CPU、超时和清理策略。

## 42. JavaScript / Node.js 对照

| JVM | Node.js / V8 近似工具 |
| --- | --- |
| GC unified log | `--trace-gc` 等 V8 日志 |
| JFR | CPU profile、trace events、diagnostic report 的组合能力 |
| Java thread dump | Node diagnostic report / Worker 状态，执行模型不同 |
| heap dump HPROF | V8 heap snapshot |
| jcmd | Node inspector、signal/report 与系统工具 |
| NMT | process/native memory 与 V8 heap 分开分析 |

Node 主事件循环卡顿常表现为单线程 CPU 或同步调用阻塞；Java 服务可能是多平台/虚拟线程、锁、GC 或线程池/连接池问题。工具名字相似不代表状态模型相同。

两者的 heap snapshot 都可能包含敏感业务对象，文件权限和数据处理要求相同重要。

## 43. 常见错误

- 故障时立刻重启，未记录时间、PID、参数和现场证据。
- 只看平均延迟，不关联 P99 与 GC/safepoint/JFR。
- 看到 GC 前占用高就判断泄漏，不看 GC 后基线。
- 把所有 safepoint 都称为 GC 暂停。
- 在高峰期反复 GC.run、histogram 和 heap dump。
- JFR profile 永久开启却未评估开销与磁盘。
- 自定义 JFR Event 写入 token、SQL 参数或高基数用户 ID。
- 只取一张线程转储就判断忙循环或死锁。
- 认为 RUNNABLE 必然消耗 CPU，WAITING 必然异常。
- 增加线程池解决数据库连接、锁或下游容量瓶颈。
- histogram 的 shallow bytes 当作 retained size。
- heap dump 前不检查磁盘、暂停和敏感数据。
- `HeapDumpOnOutOfMemoryError` 配了不可写临时目录。
- RSS 高于 Xmx 就认定 JVM 泄漏。
- 未在启动时开启 NMT，事故时才期待完整 native 基线。
- 容器被 OOM kill，却只查 Java heap dump。
- 采集文件留在即将被删除的 pod 临时文件系统。

## 44. 排查总顺序

1. 明确用户影响和时间窗口，冻结变更信息。
2. 保存版本、PID、启动参数、JDK、容器限制与系统指标。
3. 关联应用错误、tracing、GC/safepoint 日志和基础设施事件。
4. 优先低影响命令：VM.version、VM.flags、JFR.check、已有指标。
5. 用短 JFR 和连续线程转储确定 CPU、锁、park、IO 或 GC 方向。
6. 内存问题先看 GC 后基线和 NMT，再决定 histogram/heap dump。
7. 高影响采集前确认暂停、磁盘、权限、隐私和恢复计划。
8. 对证据建立假设，再用下一项最小成本证据证伪。
9. 修复后在相同负载验证，比较前后基线。
10. 将诊断参数、存储、权限和 runbook 自动化，避免下次临时准备。

## 45. 本节总结

- JVM 故障排查从时间线和低影响证据开始，不从随机调参开始。
- GC 日志要包含时间、uptime、级别、标签和轮转，并与业务指标关联。
- 泄漏看 GC 后存活基线持续上升；高分配不自动等于泄漏。
- safepoint 不只有 GC，长延迟需联合 JFR、日志和 tracing 判断。
- JFR 提供跨 CPU、线程、IO、GC、JIT 和应用事件的统一时间线。
- default 适合持续录制，profile 适合有限故障窗口。
- 自定义 JFR Event 应低成本、有限基数且不包含敏感数据。
- 线程转储要连续采样；BLOCKED 表示 monitor 竞争，RUNNABLE 不等于 CPU 忙。
- Histogram 看类数量和浅大小趋势，heap dump 才能深入 GC Roots 与 retained size。
- Heap dump 高影响且高度敏感，采集前必须评估暂停与磁盘。
- NMT 需启动时开启，用于解释 Java heap 之外的 JVM native memory。
- Xmx 不是进程 RSS 上限，容器还要容纳线程栈、Metaspace、code cache 和 direct/native memory。
- OOM 必须按具体消息和容器退出原因分流，不能统一扩大堆。
- 诊断完成标准是根因可解释、修复可复现、指标有改善并形成防复发机制。

下一节：[Maven 项目模型、依赖管理、生命周期与插件](/backend/java/maven-project-model-dependencies-lifecycle-and-plugins)。

## 46. 参考资料

- [Oracle JDK 25：`jcmd` 命令](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html)
- [Oracle JDK 25：`jfr` 命令](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jfr.html)
- [Oracle JDK 25：`java` 命令与 JVM 选项](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html)
- [Oracle JDK 25：Diagnostic Tools](https://docs.oracle.com/en/java/javase/25/troubleshoot/diagnostic-tools.html)
- [Oracle JDK 25：Troubleshoot Process Hangs and Loops](https://docs.oracle.com/en/java/javase/25/troubleshoot/troubleshoot-process-hangs-and-loops.html)
- [Oracle JDK 25：Garbage Collection Tuning Guide](https://docs.oracle.com/en/java/javase/25/gctuning/)
- [Java SE 25：`jdk.jfr` API](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.jfr/module-summary.html)
