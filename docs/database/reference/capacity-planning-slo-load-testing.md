---
title: 数据库容量规划、SLO 与压测
description: 从接口 SLO、工作负载和排队关系推导吞吐、并发、连接、CPU、I/O、存储与日志容量，建立可解释的压测、增长预测和扩容门禁
prev:
  text: 数据库分层导航
  link: /database/
---

# 数据库容量规划、SLO 与压测

“数据库能扛多少 QPS”没有脱离上下文的答案。一次主键点查、一次扫描 30 天订单的聚合、一次带锁库存扣减，即使都算一个 query，资源需求也完全不同。压测跑到 20 万 QPS，也不代表生产在促销、备份、故障切换和副本追赶同时发生时还能满足接口 SLO。

容量规划要把业务请求翻译成数据库工作：查询组合、并发、CPU 时间、页读取、写入字节、日志、连接、锁和数据增长；再为正常峰值、单节点故障、维护和增长保留余量。

本课从 SLI/SLO 与工作负载画像开始，使用 Little's Law 和服务需求建立直觉，区分吞吐、并发和利用率，设计避免 coordinated omission 的压测，并把连接、复制、备份、存储、分片与成本纳入同一容量闭环。

## 容量规划先回答五个问题

1. **服务目标是什么**：哪些接口的 p95/p99、错误率和可用性必须满足？
2. **工作负载是什么**：每类业务请求产生哪些 SQL，读写比例、数据分布和事务边界如何？
3. **瓶颈在哪里**：CPU、I/O、锁、连接、日志、网络、内存还是下游副本？
4. **故障时要承载什么**：少一个节点、只剩 primary、备份或迁移并行时还需多少容量？
5. **何时扩容**：增长率、采购/迁移 lead time 和安全余量能否在耗尽前触发动作？

若只回答“平均 CPU 35%”，无法判断 p99 锁等待、瞬时 IOPS、连接排队或磁盘只剩 12 天的问题。

## SLI、SLO 与数据库内部指标

### 用户可见 SLI

- 接口成功率与超时率。
- 端到端 p50/p95/p99 延迟。
- 写入确认到读取可见的延迟。
- 数据新鲜度、复制陈旧度。
- 正确性：重复扣款、漏写、跨租户泄漏等必须单独计量。

### 数据库路径 SLI

- 连接池等待、获取失败和 in-use 数。
- 每个 query fingerprint 的调用数、总时间、p95/p99、扫描/返回行数。
- transaction latency、锁等待、死锁与回滚。
- CPU、run queue、磁盘 latency/IOPS/throughput、缓存命中。
- WAL/binlog 生成率、复制 receive/apply lag。
- 临时文件、排序溢出、checkpoint/flush 和 autovacuum/purge 压力。

内部指标用来解释用户 SLI，不能取代它。数据库平均查询 3 ms，但连接池排队 800 ms，用户看到的仍是慢接口；接口很快却读到落后副本，也不是正确服务。

### SLO 要按接口分级

示例：

| 接口 | 目标 | 数据一致性 | 过载策略 |
| --- | --- | --- | --- |
| 创建订单 | p99 < 300 ms，99.95% | primary 提交成功 | 限流，不能静默丢写 |
| 订单详情 | p99 < 150 ms | 写后读 | 超预算副本回 primary |
| 搜索 | p99 < 800 ms | 可陈旧 60 s | 降级字段/结果数 |
| 运营导出 | 10 min 内异步完成 | 快照一致 | 排队、限并发 |

把所有 SQL 混成一个平均延迟，会让低频 5 秒报表和高频 2 ms 点查相互掩盖。

## 工作负载画像不是只有读写比例

至少按业务事务分类：

```text
create_order:
  1 × INSERT orders
  N × INSERT order_items
  1 × UPDATE inventory（带锁）
  1 × INSERT outbox

list_orders:
  1 × tenant + cursor 索引查询
  返回 20 行
```

记录：

- 到达率与日内/周内/活动峰值。
- 每请求 SQL 数量与事务时长。
- 行数、行宽、参数选择性和热点键。
- cache hit/miss 后不同数据库路径。
- 读写字节、WAL/binlog、临时空间。
- 重试、超时、失败和补偿产生的额外负载。
- 租户/分片分布与 top-N 热点。

“90% 读”仍可能被 10% 写锁或日志吞吐限制；“主键查询”若返回大 JSON/BLOB，可能由网络和内存限制。

## 平均值会隐藏峰值与尾延迟

容量至少观察：

- 1 分钟与更细粒度峰值，而不只日平均。
- p95/p99 与 max，而不只平均。
- 正常峰值、发布/迁移、备份和故障场景。
- 季节性、活动预热和突发 burst。

如果一天平均 1000 RPS、晚高峰 8000 RPS、促销 25000 RPS，按平均值扩容必然失败。还要考虑重试风暴：超时后客户端立即重试，会在数据库最慢时增加到达率。

错误预算适合管理可靠性目标，但不能把数据错误与普通 500 完全等价。资金或租户隔离不变量通常是零容忍约束，不应用“本月还有错误预算”接受。

## Little's Law：吞吐、延迟与并发

稳定系统中：

```text
L = λ × W

平均在系统中的请求数 = 到达率 × 平均停留时间
```

若数据库路径 2000 requests/s，平均从进入连接池到完成为 20 ms：

```text
L = 2000 × 0.020 = 40 个并发中的请求
```

这不代表连接池精确设为 40。分布有尾部、事务可能多语句、请求会突发，还需为超时与故障设边界。但它能识别荒谬配置：若理论在途约 40，却为每个应用实例开 200 条连接，连接总量很可能只会增加争用。

### 区分服务时间与排队时间

```text
响应时间 = 排队时间 + 数据库执行/等待时间 + 网络与客户端处理
```

增加连接只可能减少“等待连接”的一部分，却会增加数据库内部 runnable session、锁竞争和上下文切换。系统已经饱和时，更多并发通常让吞吐不再增长而延迟急升。

## Utilization 不是线性刻度

资源接近饱和时，偶发抖动会形成长队列。CPU 从 50% 到 80% 的影响不一定只是慢 30%；如果热点锁、磁盘队列或 checkpoint 同时出现，p99 可成倍增长。

不要给所有资源一个统一“80% 告警”：

- CPU 需看核数、run queue、steal 和单核瓶颈。
- 磁盘需看 latency、queue depth、IOPS/throughput 限额。
- 内存需看数据库缓存、OS page cache、swap/OOM 风险。
- 连接需看 active/runnable/waiting，不只 opened 数。
- 存储需看可用空间、增长率、临时/重写峰值和回收延迟。

安全目标利用率来自故障与抖动压测。例如两节点分担读取时，每台正常 55%，失去一台理论会超过 100%，这不是 N+1 容量。

## 服务需求与瓶颈估算

对每种事务估算单位资源需求：

```text
业务 TPS × 每事务 CPU ms = 每秒 CPU ms
业务 TPS × 每事务 WAL bytes = WAL bytes/s
业务 TPS × 每事务读页数 = page reads/s
```

混合工作负载：

```text
总 CPU/s = Σ(事务类型 TPS × 单次 CPU 时间)
总日志/s = Σ(事务类型 TPS × 单次日志字节)
```

8 个完全可用 CPU 核每秒提供约 8000 CPU-ms；若目标只允许 60% 持续利用，可规划约 4800 CPU-ms/s。真实数据库还有后台线程、复制、checkpoint、autovacuum/purge、备份和 OS 开销，因此不能把所有核时全分给前台 SQL。

这种估算不是排队模型的精确预测，而是把业务增长翻译成资源数量并找出最可能先饱和的维度。最后仍需用相似环境压测校准。

## 连接容量是多层预算

```text
总潜在连接 = 应用实例数 × 每实例池上限 × 数据库目标数
```

还要加 migration、监控、备份、管理员、复制和 failover 保留。分片和读副本会让目标数增长，但应用通常不会均匀使用每个池。

规划过程：

1. 从 Little's Law 和事务时长估算正常 active concurrency。
2. 给短 burst 有界队列，而非无限建连接。
3. 按数据库可高效处理的并发设全局上限。
4. 把预算分给服务/租户并保留应急连接。
5. 故障切换后验证所有池重连不会形成认证/连接风暴。

连接池利用率长期 100% 是排队信号，不必然意味着池太小；先看数据库是否已经饱和。

## 内存容量不能只看 buffer pool/shared buffers

数据库内存包括：

- 全局缓存和元数据结构。
- 每连接/每查询排序、哈希、临时和协议缓冲。
- maintenance/index build/autovacuum 内存。
- replication、backup 和插件。
- OS page cache 与内核开销。

危险估算：`max_connections × 每查询最大内存` 可能远超物理内存。PostgreSQL 一个复杂计划可有多个 sort/hash 节点并由并行 worker 使用 `work_mem`；MySQL 也有多种按连接/操作分配的 buffer。配置上限不是常驻量，但必须分析最坏并发。

压测应同时覆盖大排序/哈希、并行查询和维护任务，观察 RSS、swap、OOM 与内存高水位。

## 存储容量与 runway

容量不只是业务行：

```text
总存储 ≈ table + indexes + MVCC/undo bloat + WAL/binlog
         + temp + online DDL/重写空间 + replication slots
         + 本地备份/快照开销 + 安全余量
```

简单 runway：

```text
剩余天数 = 可用于增长的字节 ÷ 最近高分位每日净增长
```

不要用长期平均掩盖活动峰值，也不要假设 DELETE 立即归还文件系统空间。PostgreSQL dead tuples 要等 VACUUM 且普通 VACUUM 通常不缩小文件；InnoDB purge 和表空间回收也有各自边界。

扩容触发点：

```text
触发 runway > 扩容/迁移 lead time + 验证时间 + 安全缓冲
```

若磁盘还够 20 天，但采购、数据迁移和观察需要 30 天，已经过晚。

## WAL/binlog 是独立容量维度

大批回填、索引/表重写和批量更新会突然提高日志率，影响：

- 本地日志磁盘。
- 归档上传带宽与 RPO。
- 副本网络、receive/apply 和 lag。
- replication slot 保留。
- PITR 存储成本与恢复重放时间。

规划使用峰值 bytes/s 和持续时长，而不是只看事务数。一个 UPDATE 大字段可能比数百点查产生更多日志。

必须压测“写峰值 + 一个副本重建/追赶 + 备份/归档”，因为故障期才是容量最重要的时刻。

## 副本容量与 failover

读副本不是只按 SELECT QPS 规划。它还要持续 replay 全部写入，并可能承担：

- 报表/搜索读取。
- 备份。
- 故障后成为 primary。
- 为下游副本发送日志。

提升候选必须有写入、连接、WAL/binlog、checkpoint 和磁盘余量。primary 正常 70% 而副本只配一半规格，即使读查询正常，failover 后也可能立即过载。

读扩展的 N+1 测试应下线一个副本，把其流量与重连同时压到剩余节点，并观察 apply lag，而不只是做静态除法。

## 压测要回答具体假设

无目标的 benchmark 只会产出一个漂亮 TPS。每次测试写明：

- 假设：例如“4 vCPU primary 在 N+1 场景能承载 600 create_order TPS”。
- 成功条件：接口 p99、错误率、replica lag、CPU/I/O/连接阈值。
- 数据集：大小、分布、热点、缓存状态和索引。
- 工作负载：事务混合、到达模型、重试和 think time。
- 环境差异：硬件、网络、版本、参数、备份/监控。
- 终止条件：SLO 失败、磁盘/日志/锁达到保护阈值。

## Closed-loop 与 open-loop

### Closed-loop

固定并发客户端：完成一次请求后才发下一次。系统变慢时，生成端自动降低到达率。

优点是容易控制并发；缺点是可能出现 **coordinated omission**：数据库卡顿时，客户端也停止发新请求，报告的延迟样本漏掉真实用户本会排队的请求。

### Open-loop

按目标到达时间独立发请求，更接近外部流量。系统变慢时队列增长，能揭示过载和尾延迟，但必须设最大 backlog/并发，避免压测器把环境彻底淹没。

报告应说明到达模型，并记录 scheduled time 到完成的端到端延迟。仅报告已开始执行请求的 service time 会低估排队。

## 数据集和缓存状态决定结果

在 1 万行表上测试的索引全部驻留内存，不能代表 2 TB 生产数据。需要：

- 接近生产的表/索引尺寸和行宽。
- 参数选择性、租户大小和热点分布。
- 足够长测试让 checkpoint、purge/autovacuum、缓存淘汰出现。
- 分别测 warm cache、cold/restart 和工作集变化。
- 避免复用生产敏感数据，使用合成或不可逆脱敏数据。

压测器也可能先饱和。监控生成端 CPU、网络、socket、事件循环和错误，最好多生成器交叉验证。

## 阶梯测试、持续测试和破坏点

### 阶梯测试

逐级增加到达率，每级保持足够时间达到近似稳态，记录吞吐、p99、队列和资源。找到：

- 线性区：吞吐上升，延迟稳定。
- knee：延迟开始快速上升。
- saturation：吞吐不再增加，队列/错误增长。

生产容量不应设在破坏点，而应在 knee 前并满足故障余量。

### Soak test

长时间运行目标峰值，发现内存泄漏、连接泄漏、bloat、日志积压、checkpoint 周期和慢性副本延迟。10 分钟峰值测试看不到一天后磁盘增长。

### Spike 与故障测试

模拟突然 5 倍流量、缓存失效、连接重建、一个 replica/primary 故障、网络延迟和存储抖动。目标是验证限流、超时、熔断和恢复，而不是证明系统永不报错。

## pgbench 与微基准的边界

PostgreSQL `pgbench` 能以并发 session 重复事务脚本，并报告 TPS/延迟/失败；自定义脚本比默认类 TPC-B 场景更接近业务。但初始化模式会创建/修改数据，只能在专用测试数据库运行，绝不能对生产执行 `pgbench -i`。

MySQL `BENCHMARK()` 主要重复计算单个表达式，适合比较函数开销，不代表真实事务、锁、I/O、网络或连接池容量。完整容量测试需要业务协议或自定义 SQL workload。

工具输出不是结论。必须与数据库统计、OS/云指标和接口 SLI 同时采集，并保存版本化 test manifest。

## 避免压测污染结论

- 不在生产做无审批写压测。
- 压测账号、schema、数据和外部副作用隔离。
- 禁止真实邮件、支付、Webhook 和消息下游。
- 每轮前确认数据状态，回收方式不破坏下一轮分布。
- 监控/审计开销应与生产相近，不为高分临时关闭。
- 预热、测量、冷却阶段分开。
- 错误与 timeout 计入结果，不能只统计成功 TPS。

压测写入会生成真实 WAL/binlog、备份和复制成本；测试环境若带跨区域副本，也要控制费用和销毁流程。

## 从一次测试推导容量曲线

不要只保存“最大 12000 TPS”。保存每个 load level：

```text
arrival rate / achieved throughput
p50 / p95 / p99 / timeout / error
pool queue / active connections
CPU / run queue / IO latency / network
locks / deadlocks / temp / WAL rate / replica lag
dataset size / cache state / test duration
```

对比发布前后时，要固定或解释数据集、硬件、参数和 workload 差异。性能回归门禁可要求：相同 SLO 下最大安全吞吐下降不超过阈值，而不是比较两个噪声很大的单点 TPS。

## 增长预测与容量门禁

按天/周保存：

- 业务峰值 TPS 和 top transaction mix。
- 每租户/分片增长与热点。
- table/index/WAL/backup bytes。
- p99、队列与资源 headroom。
- schema/产品变化对单位请求成本的影响。

线性预测适合短期稳定增长；季节性活动、客户签约和数据保留变化要作为事件场景叠加。给预测输出区间而不是伪精确日期。

扩容/分片门禁示例：

```text
若未来 60 天正常峰值预计超过验证容量的 65%，
或 N+1 峰值超过 80%，
或存储 runway 少于 90 天，
则进入扩容/优化评审。
```

具体阈值来自实际 knee、故障策略和 lead time，不是行业通用常数。

## 成本不是只看实例单价

数据库成本包括：

- primary/replica/分片计算与存储。
- IOPS、网络、跨区域复制和日志归档。
- 备份、PITR 与恢复演练环境。
- 许可证、代理、监控和审计。
- 工程与 on-call 复杂度。

优化单位可以是“每千订单数据库成本”或“每活跃租户月成本”。便宜一半但 RTO 从 30 分钟变成 8 小时，不是同等方案。

分片能增加总容量，也会乘以连接、备份、DDL、监控和恢复成本。先优化单位工作，再决定横向拆分。

## 可观测性闭环

```text
生产 SLI 与 workload digest
  ↓
容量模型与增长预测
  ↓
相似环境压测校准
  ↓
扩容/优化/限流决策
  ↓
发布后验证单位成本和安全吞吐
  └──────── 回到生产观测
```

MySQL Performance Schema statement digest/sys schema、PostgreSQL 累积统计与 `pg_stat_statements` 可提供聚合工作负载证据。统计是累积窗口，要记录 reset 时间；采集配置、digest 容量和权限也会影响可见性。没有采集到不等于没有负载。

## 示例说明

### 容量数学与过载模型

运行：

```bash
node examples/database/24-capacity-planning-model.mjs
```

脚本在内存中验证：

- Little's Law 如何连接到达率、延迟与在途并发。
- 混合事务如何转换为 CPU 和日志需求。
- 目标利用率与 N+1 场景如何限制安全吞吐。
- 存储 runway 和扩容 lead time 如何形成提前量门禁。

### MySQL 8.4 只读快照

`examples/database/24-mysql-capacity-snapshot.sql` 汇总连接、全局计数、digest 总时间/扫描行和 schema 容量。计数器必须用两个时间点求 rate，单次快照不是 QPS。

### PostgreSQL 18 只读快照

`examples/database/24-postgresql-capacity-snapshot.sql` 汇总连接、数据库累计统计、WAL、表/索引容量，并检查 `pg_stat_statements` 是否启用，不创建 extension 或压测数据。

## 上线检查清单

### 目标与画像

- 核心接口有 p95/p99、错误率、一致性和过载策略。
- 工作负载按业务事务拆解，不只用 SQL 总 QPS/读写比。
- 参数分布、热点、缓存 miss、重试和事务边界被建模。
- 正常、活动、维护和故障峰值分别定义。

### 资源

- CPU、I/O、内存、连接、锁、日志、网络和存储都有 headroom。
- 连接预算按所有应用实例、分片/副本和运维连接计算。
- WAL/binlog 峰值覆盖回填、备份、追赶和归档带宽。
- 存储包含索引、bloat/undo、temp、DDL 和 slot 保留。
- failover 候选能承载 primary 完整角色。

### 压测

- test manifest 固定版本、数据、负载、到达模型和成功条件。
- 数据规模/分布、热点、缓存与生产近似。
- open-loop 记录调度到完成延迟，避免 coordinated omission。
- 阶梯、soak、spike 和 N+1 故障场景都覆盖。
- timeout/error/副本延迟计入结果，压测器自身未饱和。

### 预测与决策

- 计数器转换为 rate，统计 reset 与采集缺口可见。
- 安全容量取 knee 前满足 SLO 的点，不取最大 TPS。
- runway 大于采购、迁移、验证和观察 lead time。
- 每次 schema/产品发布复核单位请求成本。
- 扩容、优化、限流、归档与分片按成本/RPO/RTO共同评估。

## 常见误区

### “CPU 还有 30%，所以容量还有 30%”

排队和多资源瓶颈是非线性的；锁、磁盘或单核可能已饱和，p99 会在平均 CPU 到顶前恶化。

### “把连接池加大就能提高吞吐”

数据库饱和后更多连接增加排队、锁和上下文切换。先用 Little's Law 和 active concurrency 判断。

### “压测最大 TPS 就是生产容量”

生产容量必须在满足 SLO、错误、复制、恢复与故障余量的点，通常显著低于破坏点。

### “固定并发压测没有排队，所以系统很稳定”

closed-loop 在系统变慢时自动降载，可能漏掉 coordinated omission。需要明确到达模型和端到端等待。

### “数据都在内存里时测试更稳定”

这只证明 warm working set。生产工作集变化、重启和大于内存的数据会触发完全不同的 I/O 路径。

### “删除历史数据后磁盘会立即变小”

逻辑删除和版本清理不一定归还文件系统空间；容量模型要使用实际数据库回收行为。

### “加一个副本就有 N+1 容量”

副本还要 replay，故障时读流量重分配并可能承担写入。必须真实下线节点测试。

## 本课小结

- 容量规划从接口 SLO 和业务事务开始，单一 QPS 没有可比意义。
- Little's Law 连接到达率、停留时间与在途并发，能约束连接池直觉。
- 平均利用率不是线性容量；安全点应位于 latency knee 前并满足故障余量。
- 混合事务应转换为 CPU-ms、页、日志字节和锁需求，找出最先饱和资源。
- 存储要包含索引、MVCC/undo、日志、临时空间、DDL 和备份，并用高分位增长算 runway。
- closed-loop 可能产生 coordinated omission；open-loop 需记录从计划到完成的延迟和队列。
- 有效压测需要相似数据、事务混合、阶梯、soak、spike、N+1 和明确终止条件。
- 副本与 failover 候选按提升后的完整角色规划，不能只看平时读 QPS。
- 生产统计、容量模型、压测校准、扩容决策和发布后验证应形成持续闭环。

## 官方资料

- [MySQL 8.4：Performance Schema](https://dev.mysql.com/doc/refman/8.4/en/performance-schema.html)
- [MySQL 8.4：Statement Summary Tables](https://dev.mysql.com/doc/refman/8.4/en/performance-schema-statement-summary-tables.html)
- [MySQL 8.4：sys Schema](https://dev.mysql.com/doc/refman/8.4/en/sys-schema.html)
- [MySQL 8.4：Measuring Performance](https://dev.mysql.com/doc/refman/8.4/en/optimize-benchmarking.html)
- [PostgreSQL 18：Monitoring Database Activity](https://www.postgresql.org/docs/18/monitoring.html)
- [PostgreSQL 18：pg_stat_statements](https://www.postgresql.org/docs/18/pgstatstatements.html)
- [PostgreSQL 18：pgbench](https://www.postgresql.org/docs/18/pgbench.html)
