---
title: 数据库性能诊断：从慢接口到根因
description: 从接口 SLO 和调用链开始，用 MySQL Performance Schema、PostgreSQL 统计视图、执行计划、等待事件与锁证据建立可重复的性能诊断方法
prev:
  text: 客户端连接、超时、重试与优雅停机
  link: /database/redis/client-connections-timeouts-retries-shutdown
---

# 数据库性能诊断：从慢接口到根因

“接口慢，给数据库加个索引”不是诊断方法。接口耗时可能发生在应用排队、数据库连接池、网络、锁等待、SQL 执行、结果传输或 JSON 序列化；即使确实是 SQL 慢，也可能是计划估算错误、返回数据过多、临时文件、事务过长或存储饱和，而不只是缺少索引。

本课建立一条可重复的性能诊断链：先确认用户影响和时间窗口，再从应用调用链定位阶段，通过数据库工作负载统计找到高影响 SQL，随后用执行计划、等待事件、锁与资源指标验证根因，最后以同样的负载和指标验证改动。

## 先区分症状、证据、根因和改动

四者经常被混在一起：

| 层次 | 示例 |
| --- | --- |
| 症状 | `/api/orders` P99 从 180 ms 升到 2.4 s |
| 证据 | pool wait 占 1.6 s，数据库 active session 增加 |
| 根因 | 一个报表事务持锁 40 s，阻塞订单更新并占满连接池 |
| 改动 | 缩短事务、拆分报表读取、增加锁等待告警 |

“CPU 90%”是证据，不自动等于根因；“加索引”是候选改动，不是问题解释。只有能说明现象怎样产生、为什么只影响某些请求、为何在该时间开始的因果链，才接近根因。

## 性能目标必须写成可测量的 SLO

“越快越好”无法指导取舍。先定义：

- 哪个接口、租户、地区和请求类型。
- P50、P95、P99 或最大可接受延迟。
- 成功率、timeout 和错误分类。
- 峰值吞吐与并发。
- 数据新鲜度和一致性要求。
- 正常、单节点故障和发布期间的目标。

例如：

```text
订单列表：正常流量下 P95 < 200 ms，P99 < 500 ms
错误率：5xx + deadline exceeded < 0.1%
数据：允许最多 5 秒统计延迟，但订单状态必须读到提交后的版本
```

优化不是让某次本地查询从 8 ms 变成 3 ms，而是让目标负载下的用户指标稳定达标，并且不破坏写入、正确性与故障余量。

## 从端到端时间线定位数据库占比

一次接口请求可以拆成：

```text
总耗时 = 网关和应用排队
       + 数据库连接池等待
       + DNS/TCP/TLS
       + SQL 服务端等待与执行
       + 结果网络传输
       + 驱动解码、对象映射和 JSON 序列化
       + 其他下游调用
```

应用 trace 至少记录逻辑查询名、数据库类型、操作类型、pool wait、数据库调用总耗时、返回行数和错误类别。不要把完整 SQL 参数、个人数据或每个 ID 作为高基数标签。

### 三种常见错觉

1. **数据库 span 很长，SQL 却很快**：span 可能包含连接池等待、网络和读取大结果集。
2. **单条 SQL 只有 5 ms，接口却 800 ms**：可能执行了 150 次，即 N+1。
3. **数据库 CPU 不高，却大量 timeout**：可能在锁、磁盘、网络、连接上等待，或只有一个关键线程/核饱和。

先回答时间花在哪一层，再选择数据库工具。

## 诊断顺序：由广到窄

推荐顺序：

1. 明确影响范围、开始时间和变更时间线。
2. 查看接口吞吐、延迟、错误和连接池。
3. 查看数据库整体负载、活跃连接、等待和复制状态。
4. 按归一化 SQL 聚合总耗时、调用次数、平均/尾延迟和读取量。
5. 选择高影响 SQL，检查执行计划与参数分布。
6. 检查锁链、长事务、I/O、临时文件和内存压力。
7. 提出一个可证伪的假设，只改一个主要变量。
8. 在代表性负载下比较改动前后，并观察副作用。

不要一开始同时改索引、连接池、缓存和数据库参数。即使指标改善，也无法知道哪个改动有效，回归时更难定位。

## “最慢一次”不等于“最值得优化”

工作负载需要至少三个视角：

```text
单次慢：一次执行非常慢，可能影响个别重请求
高频：单次不慢，但每秒执行很多次
总消耗：调用次数 × 平均成本，对整体容量影响最大
```

例子：

| 查询 | 次数/分钟 | 平均耗时 | 总数据库时间/分钟 |
| --- | ---: | ---: | ---: |
| A | 2 | 4 s | 8 s |
| B | 20,000 | 2 ms | 40 s |
| C | 600 | 50 ms | 30 s |

只看慢查询日志可能先看到 A；按总执行时间排序会先看到 B。选择优化对象要结合用户关键度、总资源、尾延迟和改造风险。

## SQL 归一化与 query identity

下面两条 SQL 参数不同，但形状相同：

```sql
SELECT id, status FROM orders WHERE account_id = 42;
SELECT id, status FROM orders WHERE account_id = 99;
```

数据库观测系统通常把常量归一化为同一个 digest/query ID，以便聚合调用次数和耗时。应用也应使用稳定逻辑名称，例如 `OrderRepository.listByAccount`，把一次 HTTP 请求和数据库 digest 关联起来。

归一化有边界：

- 不同参数可能导致选择性和执行计划差异。
- 动态 IN 列表、注释和 SQL 生成器可能产生多个形状。
- DDL、扩展、数据库升级可能改变 query ID 计算。
- 统计系统容量有限，低频语句可能被淘汰。

聚合用于找方向，最终仍要用代表性参数分析具体计划。

## MySQL：从 Performance Schema 的 digest 开始

MySQL 8.4 的 Performance Schema 可以按归一化语句摘要累计统计。`events_statements_summary_by_digest` 常用字段包括：

- `COUNT_STAR`：执行次数。
- `SUM_TIMER_WAIT`、`AVG_TIMER_WAIT`、`MAX_TIMER_WAIT`：累计、平均和最大计时。
- `SUM_ROWS_EXAMINED`、`SUM_ROWS_SENT`：检查与返回的行。
- `SUM_CREATED_TMP_DISK_TABLES`：内部磁盘临时表。
- `SUM_NO_INDEX_USED`：没有使用索引的次数。
- `FIRST_SEEN`、`LAST_SEEN`：摘要观察窗口。
- `QUANTILE_95`、`QUANTILE_99`：语句延迟直方图估计分位。

第 15 课 MySQL 示例提供只读查询：

```sql
SELECT
  SCHEMA_NAME,
  DIGEST_TEXT,
  COUNT_STAR,
  sys.format_time(SUM_TIMER_WAIT) AS total_latency,
  sys.format_time(AVG_TIMER_WAIT) AS avg_latency,
  ROUND(SUM_ROWS_EXAMINED / NULLIF(COUNT_STAR, 0)) AS rows_examined_avg,
  ROUND(SUM_ROWS_SENT / NULLIF(COUNT_STAR, 0)) AS rows_sent_avg
FROM performance_schema.events_statements_summary_by_digest
WHERE SCHEMA_NAME IS NOT NULL
ORDER BY SUM_TIMER_WAIT DESC
LIMIT 20;
```

### 正确解释 digest

- 累计值受实例启动、表重置和 digest 淘汰影响。
- 平均值会掩盖慢尾部，必须结合 histogram、应用 P99 和样本。
- `rows_examined` 高不自动表示错误：全表聚合本来可能需要读取大量行。
- `NO_INDEX_USED` 不是“立刻加索引”告警，小表扫描可能是最优计划。
- 需要权限且 instrumentation/consumer 必须启用，否则空结果不代表没有 SQL。

MySQL `sys` schema 把 Performance Schema 转换为更易读的视图，例如 `statement_analysis`、`statements_with_full_table_scans`、`schema_table_statistics` 和 `innodb_lock_waits`。它是解释层，底层仍是同一批观测数据。

### 慢查询日志的角色

慢查询日志保留超过阈值的语句样本，适合离线分析，但要权衡：

- `long_query_time` 是否匹配 SLO。
- 是否记录未使用索引的查询以及由此产生的日志量。
- 文件访问、轮转、保留和敏感参数脱敏。
- 日志写入开销和磁盘空间。

配置变更属于运维变更，本课脚本只读取相关变量，不执行 `SET GLOBAL`。生产启用前应按版本、托管平台和变更流程评估。

`SHOW PROFILE` 已弃用；新系统应优先使用 Performance Schema。

## PostgreSQL：累计统计与 pg_stat_statements

PostgreSQL 内置累计统计视图回答不同层次的问题：

- `pg_stat_activity`：当前会话、事务、查询状态和 wait event。
- `pg_stat_database`：每数据库事务、缓存命中、临时文件、死锁等。
- `pg_stat_user_tables`：表扫描、行变化、dead tuple、vacuum/analyze。
- `pg_stat_user_indexes`：索引使用统计。
- `pg_stat_io`：按 backend/object/context 的 I/O 统计。

`pg_stat_statements` 是随 PostgreSQL 提供的扩展，用 query ID 聚合计划和执行统计。它需要在 `shared_preload_libraries` 加载，并在目标数据库创建扩展；这通常需要重启和相应权限，因此应用开发者不能假设所有环境都已启用。

常用字段：

- `calls`、`total_exec_time`、`mean_exec_time`、`min_exec_time`、`max_exec_time`。
- `rows`。
- `shared_blks_hit`、`shared_blks_read`。
- `temp_blks_read`、`temp_blks_written`。
- `wal_records`、`wal_bytes`。
- 计划统计字段只在相应跟踪配置启用时有意义。

`track_io_timing` 会让相关视图记录读取/写入时间，但计时本身可能有平台相关开销，应根据目标环境评估。块命中也不能简单解释成“磁盘没读”：操作系统 page cache 仍可能参与。

### 统计窗口和重置

累计统计会跨很多分钟或小时，把当前事故与过去正常流量混在一起。诊断应记录两个时间点的 delta，或至少同时读取 stats reset/实例启动信息。

不要为了“看干净数据”在事故中直接调用 `pg_stat_statements_reset()` 或清空 MySQL summary table。这会删除全团队的观测基线。重置属于受控操作，本课不提供执行语句。

## 当前会话：先看它在做什么或等什么

### PostgreSQL

`pg_stat_activity` 中要把 `state` 和 `wait_event` 分开理解：

- `active`：查询处于活动状态，但仍可能正在等待某个事件。
- `idle in transaction`：事务已开始但当前没有执行查询，仍可能持锁并阻碍 vacuum。
- `wait_event_type = 'Lock'`：在等待重量级锁。
- `ClientRead`：服务端等待客户端发送更多数据，不等于数据库内部很慢。
- I/O、LWLock、BufferPin 等要结合具体事件和资源指标。

当前 `query` 是会话最近语句；阻塞者若 `idle in transaction`，真正取得锁的旧语句可能已结束。因此要同时看 `xact_start`、应用 trace 和事务边界。

### MySQL

MySQL 可从 Performance Schema threads/events、`sys.session`、InnoDB transaction 与 lock wait 视图观察当前活动。`PROCESSLIST` 快照只代表读取瞬间，短查询可能来不及捕捉；高频慢形状仍应靠 digest 聚合。

看到 `Sleep` 连接不等于一定泄漏：连接池会保留空闲连接。需要结合空闲时长、池配置、事务状态、连接总量和服务器 `max_connections` 判断。

## 锁等待要画阻塞链

只找到 waiting session 不够，要找 blocking session：

```text
会话 A：长事务持有订单行锁
  └─ 阻塞会话 B：更新同一订单
       └─ B 占住应用连接，间接让更多请求等待 pool
```

MySQL `sys.innodb_lock_waits` 给出 waiting/blocking transaction 和 PID；metadata lock 则要看 `schema_table_lock_waits`。PostgreSQL 可以用 `pg_blocking_pids(pid)` 找直接/软阻塞者，并结合 `pg_locks` 查看锁类型。

不要看到 blocker 就立即 KILL 或 `pg_terminate_backend`：

- 事务回滚可能持续很久并产生更大 I/O。
- blocker 可能是关键迁移或财务写入。
- 终止连接会让应用自动重试并放大流量。
- 需要确认事务、业务影响、回滚成本和恢复方案。

本课示例只查询阻塞关系，不生成或执行终止命令。

## 长事务为什么是性能问题

长事务不一定持续执行 SQL。应用可以更新一行后等待远程 API，连接处于空闲但事务仍开放。

它可能导致：

- 持锁时间增长，阻塞链扩大。
- PostgreSQL dead tuple 不能及时清理，表和索引膨胀。
- MySQL InnoDB undo 历史增长，旧版本保留更久。
- 连接池槽位长期占用。
- failover、DDL 和维护操作更难完成。

事务应只包含需要原子提交的数据库工作。网络调用、用户输入等待、大文件处理不应夹在持锁事务中。

## 执行计划仍然是单条 SQL 的核心证据

找到高影响 digest 后，再用代表性参数执行 `EXPLAIN`。阅读顺序保持：

1. 验证 SQL 结果语义与参数。
2. 从叶子向根追踪实际行数和 loops。
3. 比较 estimated rows 与 actual rows。
4. 找大量扫描后过滤、连接放大和重复循环。
5. 找显式排序、哈希、临时表和磁盘溢出。
6. 检查索引访问是否匹配 WHERE、JOIN、ORDER BY。
7. 结合 buffers/I/O，而不只看节点名称。

### EXPLAIN ANALYZE 会真正执行

MySQL 与 PostgreSQL 的 `EXPLAIN ANALYZE` 都会运行语句。对 SELECT 也要考虑高负载、函数副作用和大结果计算；对写语句更不能在生产随便执行。

PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` 不会把正常查询结果发送给客户端，因此不能用它测量结果传输成本。PostgreSQL 18 的 `SERIALIZE` 可测量输出格式转换成本，但仍不包含网络传输。

低风险流程：

- 先普通 EXPLAIN。
- 在隔离环境用脱敏代表性数据和参数。
- 设置 statement/lock timeout。
- 生产确需 ANALYZE 时选择安全 SELECT、低峰和只读账号，并设置停止条件。
- 保存改动前后计划，而不是只留优化后截图。

## 估算错误比“没用索引”更值得追问

若优化器估计返回 10 行，实际返回 1,000,000 行，可能选错连接顺序、Nested Loop、内存和并行策略。原因可能是：

- 统计信息过期。
- 数据严重倾斜，平均分布不能代表热门值。
- 多列相关，但优化器按独立分布估算。
- 参数化语句使用 generic/复用计划，而不同参数选择性差异大。
- 表达式、函数或类型转换让统计/索引不可用。

此时先更新和改进统计、检查参数与查询形状；不要立刻用 hint 把某个计划永久固定。固定计划会掩盖数据增长后的变化。

## Rows examined、buffer 和返回行数

几个容易混淆的量：

```text
扫描/检查行数：执行器为得到结果触碰或判断的行
返回行数：服务端向客户端产生的行
buffer hit/read：数据库页层面的缓存命中与读取
响应字节：驱动真正接收的网络数据
```

优化列表接口时：

- rows examined 远大于 rows sent，检查过滤和索引顺序。
- rows sent 本身很大，先限制字段、分页和业务契约。
- 数据库执行快但响应慢，检查大字段、网络和对象映射。
- buffer hit 高但 CPU 高，数据可能都在内存中进行大量扫描。

缓存命中率高不等于查询高效；把全表装进内存后全扫仍会消耗 CPU 和共享缓存容量。

## 临时文件、排序和内存

排序、Hash Join、聚合可能在内存不足时使用磁盘临时空间。发现 temp 增长后先定位语句和节点，不要直接把全局 work memory 调大。

并发放大示例：

```text
单个查询允许 64 MiB × 每查询多个 sort/hash 节点 × 200 并发
```

理论需求可能远超物理内存。内存参数必须与并发、执行节点、连接数和操作系统余量一起规划。

MySQL 内部临时表与 PostgreSQL temp blocks/files 都是线索；具体是否因内存、数据类型、排序或查询形状造成，需要回到计划验证。

## 连接数不是吞吐量

数据库连接消耗内存和调度资源。连接池过小会在应用排队；过大则把过多并发推给数据库，增加锁竞争、缓存抖动和上下文切换。

诊断连接池时同时看：

- active、idle、waiter 与获取等待时间。
- 数据库 active/idle/idle-in-transaction。
- 每请求 SQL 次数和事务时长。
- CPU、I/O、锁等待和吞吐是否随连接增加而改善。
- 多个应用实例连接池总和，而非单实例配置。

目标是在 SLO 内达到吞吐的最小必要并发，而不是把数据库允许连接数全部占满。

## 资源饱和要与工作负载关联

### CPU

区分用户态、系统态、steal 和单核热点。高 CPU 配合高 rows examined，可能是扫描；高 SQL 次数配合低单次耗时，可能是 N+1；CPU 不高而延迟高，可能在等待。

### I/O

关注吞吐、IOPS、延迟、队列深度、fsync/checkpoint 和临时文件。不要只看“磁盘使用率 100%”一个平台指标。

### 内存

数据库 page/buffer cache、连接内存、sort/hash、后台维护和 OS cache 共同使用内存。命中率下降要结合工作集增长、扫描和 I/O 判断。

### 网络

返回大结果、跨地域连接、复制和备份都会占带宽。数据库执行 20 ms、传输 50 MB 用 2 s，不是加索引能完全解决的问题。

## 变更时间线是最快的证据之一

性能突然变化时对齐：

- 应用发布、SQL/ORM 版本和功能开关。
- schema migration、索引创建和统计更新。
- 数据导入、批任务、报表和备份。
- 数据库参数、实例规格和故障切换。
- 流量活动、租户增长和数据倾斜。

“发布后五分钟 P99 上升，并出现一个新 digest”比“数据库最近有点慢”更接近可验证假设。保留 deploy marker、migration ID 和 query logical name 能显著缩短排查时间。

## 一次完整诊断示例

假设订单列表 P99 上升：

1. Trace 显示数据库 span 占 90%，pool wait 正常。
2. digest/pg_stat_statements 显示新列表 SQL 总执行时间排名第一。
3. 该语句调用量未明显变化，但 rows examined/read blocks 增加 30 倍。
4. EXPLAIN ANALYZE 显示 `account_id + status` 估计 20 行，实际 80,000 行，并发生磁盘排序。
5. 数据分布检查发现一个大租户占 60%，统计不能描述列相关性。
6. 候选改动包括匹配过滤与排序的联合索引、扩展统计/直方图、keyset pagination 和大租户隔离。
7. 用大租户与普通租户参数分别压测，确认 P99、写放大、索引大小和计划稳定性。
8. 灰度发布，监控新旧 query identity、锁等待、CPU、buffer 和复制延迟。

这条链每一步都能被证伪。如果第 1 步发现时间主要在 pool wait，后续方向可能转成长事务、连接泄漏或数据库饱和，而不是分析列表 SQL。

## 优化验证必须防止“缓存热了”的假胜利

改动前后测试应固定：

- 数据规模、分布和统计信息。
- 参数集合与请求并发。
- 冷/热缓存阶段。
- 数据库版本、配置和硬件。
- 返回字段与结果正确性。
- 测试时长和后台活动。

比较：

- 端到端 P50/P95/P99 与错误率。
- 吞吐和连接池等待。
- SQL calls、total time、rows、blocks、temp 和 WAL/redo。
- CPU、I/O、内存、锁与复制延迟。
- 写入成本、索引空间和维护时间。

一次执行更快可能只是第二次命中了缓存。至少交替测试、重复多轮并记录置信范围，避免只挑最好结果。

## 低风险改动到高风险改动

通常可以按风险逐步推进：

1. 修复 N+1、无界结果、重复查询和错误事务边界。
2. 更新统计并验证估算。
3. 调整 SQL 形状与分页。
4. 增加或调整索引，并评估写放大。
5. 调整连接池、超时与并发保护。
6. 调整数据库内存、并行、日志等参数。
7. 扩容、读副本、分区。
8. 数据拆分或分库分表。

顺序不是绝对，但越往后变更面和长期复杂度通常越大。分库分表不能修复每请求 200 条 N+1 查询；它只会把 200 条查询分散到更多节点并增加路由复杂度。

## 安全诊断原则

- 观测账号最小权限，敏感 query text 按权限展示和脱敏。
- 不在事故中重置共享统计。
- 不直接复制 sys 视图提供的 KILL 语句执行。
- `EXPLAIN ANALYZE` 前确认它会真正执行目标语句。
- 生产抓取限制行数和频率，避免诊断查询自身制造负载。
- 不对系统表做无界导出，不记录完整参数。
- 配置、扩展、日志和参数修改走变更流程。

本课配套 SQL 全部是只读诊断；没有统计权限或扩展未安装时，部分查询会不可用，应由 DBA/平台提供等价观测，而不是提升应用业务账号权限。

## 配套 SQL

### MySQL 8.4

`examples/database/15-mysql-performance-diagnosis.sql` 包含：

- Performance Schema 与慢日志配置检查。
- digest 按总时间、平均时间和扫描放大排序。
- 当前会话和长事务。
- InnoDB row lock 与 metadata lock 等待。
- 表级 I/O 汇总。

### PostgreSQL 18

`examples/database/15-postgresql-performance-diagnosis.sql` 包含：

- `pg_stat_activity`、长事务和等待事件。
- `pg_blocking_pids()` 阻塞链。
- 数据库、表、索引累计统计。
- 检查可选 `pg_stat_statements`，并提供安装后才执行的查询模板。
- 对隔离的 `generate_series` 查询演示安全 EXPLAIN ANALYZE。

这些查询用于专用学习环境或经授权的只读诊断账号，不改变业务数据，不重置统计，也不终止会话。`pg_stat_statements` 查询默认注释，确认扩展已加载并安装后再单独执行。

## 排障清单

### 确认影响

- 哪个接口、租户、地区和版本？
- P50/P95/P99、吞吐、错误怎样变化？
- 是持续、周期、突发还是只在发布后？

### 定位层次

- 连接池等待还是数据库调用？
- SQL 次数是否出现 N+1？
- 结果行数和字节是否异常？
- 是执行、锁、I/O、网络还是解码？

### 数据库证据

- 总消耗最高的归一化 SQL 是哪些？
- 当前 active、wait event 和长事务是什么？
- 是否存在 blocker chain？
- 估算行数与实际行数在哪个节点分叉？
- 是否出现临时文件、磁盘排序或大范围扫描？

### 验证改动

- 结果和一致性是否保持正确？
- 代表性参数、数据倾斜和并发是否覆盖？
- 读延迟改善是否换来不可接受的写放大？
- 资源、锁、复制和故障余量是否恶化？
- 能否灰度和快速回退？

## 常见误区

### “CPU 高，所以升级机器”

先确认 CPU 被哪些 SQL、扫描、排序或高频调用消耗。扩容可能只延后同一低效形状再次饱和。

### “全表扫描一定不好”

小表或需要大部分行的查询，全表扫描可能比随机索引访问更便宜。要看实际行数、页、频率和总成本。

### “平均查询 10 ms，数据库没有问题”

平均值会掩盖尾延迟、参数倾斜和少量锁等待。接口体验通常更接近 P95/P99。

### “慢查询日志没有记录，SQL 就不慢”

阈值、采样、日志状态和权限可能造成盲区；大量 5 ms 高频查询也可能耗尽数据库，但从不进入 1 秒阈值的慢日志。

### “缓存命中率 99%，不需要看扫描量”

buffer hit 只表示数据库页未从数据文件读取，不代表 CPU 扫描、锁、内存占用和返回数据成本很低。

### “连接数越多，吞吐越高”

超过数据库可持续并发后，更多连接只会增加排队、锁竞争、内存与调度成本。

## 本课小结

- 从接口 SLO、调用链和时间窗口开始，先证明时间确实花在数据库哪一层。
- 症状、证据、根因和改动必须分开，指标异常本身不自动说明因果。
- 按归一化 SQL 的调用量、总耗时、尾延迟和资源消耗选择高影响对象，而不是只看最慢一次。
- MySQL 使用 Performance Schema digest/sys 视图，PostgreSQL 使用累计统计与可选 pg_stat_statements；都要理解观察窗口和权限盲区。
- 当前会话需要同时看 state、wait、事务时间和阻塞链；空闲会话也可能处于长事务并持锁。
- 执行计划用于验证单条 SQL 的访问路径，重点比较估算与实际行数、loops、buffer、排序和临时 I/O。
- `EXPLAIN ANALYZE` 会真正执行语句，生产诊断必须控制权限、超时、频率和语句副作用。
- 优化验证要固定负载和数据分布，防止把缓存预热误认为改动收益，并同时检查写放大与故障余量。
- 分库分表属于高复杂度数据架构手段，不能替代 N+1、索引、事务和容量治理。

## 官方资料

- [MySQL 8.4：Performance Schema summary tables](https://dev.mysql.com/doc/refman/8.4/en/performance-schema-summary-tables.html)
- [MySQL 8.4：sys schema](https://dev.mysql.com/doc/refman/8.4/en/sys-schema.html)
- [MySQL 8.4：EXPLAIN](https://dev.mysql.com/doc/refman/8.4/en/explain.html)
- [MySQL 8.4：InnoDB lock waits](https://dev.mysql.com/doc/refman/8.4/en/sys-innodb-lock-waits.html)
- [MySQL 8.4：Performance Schema data_lock_waits](https://dev.mysql.com/doc/refman/8.4/en/performance-schema-data-lock-waits-table.html)
- [PostgreSQL 18：pg_stat_statements](https://www.postgresql.org/docs/18/pgstatstatements.html)
- [PostgreSQL 18：EXPLAIN](https://www.postgresql.org/docs/18/sql-explain.html)
- [PostgreSQL 18：The cumulative statistics system](https://www.postgresql.org/docs/18/monitoring-stats.html)
- [PostgreSQL 18：Viewing locks](https://www.postgresql.org/docs/18/monitoring-locks.html)
- [PostgreSQL 18：pg_locks](https://www.postgresql.org/docs/18/view-pg-locks.html)
