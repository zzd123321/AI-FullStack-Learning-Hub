---
title: 读写分离、复制延迟与一致性
description: 理解 MySQL 与 PostgreSQL 复制流水线、异步和同步确认点、读写路由、写后读与单调读、延迟度量、Hot Standby 冲突、故障切换和副本容量边界
prev:
  text: 数据库连接池、超时与过载保护
  link: /database/connection-pools-timeouts-overload
---

# 读写分离、复制延迟与一致性

当单库读流量增长时，常见方案是把写入发送到 primary，把部分 SELECT 发送到 replica。它能分担读取和报表压力，却把“查询哪台数据库”变成业务正确性的一部分：副本可能落后、不同副本进度不同、故障切换会改变角色，刚写入的数据也可能暂时读不到。

读写分离不是一个驱动开关，而是一份接口一致性契约。本课从复制流水线开始，分别解释 MySQL 与 PostgreSQL 的确认点和观测方式，再建立写后读、单调读、延迟预算、路由、故障与容量模型。

## 先区分三个目标

复制常同时被用于：

| 目标 | 核心问题 | 副本要求 |
| --- | --- | --- |
| 高可用 | primary 故障后能否提升副本 | 数据足够新、可恢复、可被安全选主 |
| 读扩展 | 能否分担 SELECT | 查询能力、延迟和陈旧度满足接口 |
| 灾备/备份 | 能否应对机房或误操作 | 故障域隔离、保留、恢复与演练 |

同一副本可以承担多个角色，但目标会冲突。重报表占满 CPU/I/O 可能拖慢 WAL/binlog 回放，使它不再适合作为低 RPO 的故障候选；延迟副本有助于应对误删，却不适合实时读流量。

先为每个副本定义角色，不要把“有两台 replica”等同于三个目标都已满足。

## 复制是一条多阶段流水线

简化模型：

```text
客户端事务
  ↓ primary 执行并生成 binlog/WAL
primary 提交/持久化
  ↓ 网络传输
replica 接收日志
  ↓ 写入 relay log/WAL
replica 刷盘
  ↓ apply/replay
replica 数据页和查询可见状态更新
  ↓ 客户端路由到该 replica
读取到新版本
```

“复制延迟”可能发生在任意阶段：

- primary 日志生成或发送受限。
- 网络拥塞、断连或接收线程停止。
- replica 磁盘写入/刷盘慢。
- apply worker 被大事务、锁、单线程依赖或资源竞争拖慢。
- 已回放但客户端仍连接另一台更旧副本。

因此一个 `seconds behind` 数字不能完整描述端到端数据新鲜度。

## 异步复制的基本语义

MySQL 复制默认异步；PostgreSQL streaming replication 也默认异步。primary 返回 COMMIT 成功时，事务可能还没有到达任何副本。

```text
primary：COMMIT OK
  │
  ├─ 客户端已收到成功
  └─ replica 可能尚未 receive/apply
```

后果：

- 立即从 replica 读取可能查不到刚创建的订单。
- primary 在日志传出前永久故障，提升落后副本可能丢失已确认写入。
- 多副本进度不同，连续两次读取可能从新数据退回旧数据。

异步不是错误配置；它用较低写延迟换取复制窗口。关键是把陈旧和故障丢失边界写进业务目标。

## durability、visibility 与 routing 是三件事

复制确认经常被误解：

1. **durability**：日志是否已持久存在于足够故障域。
2. **visibility**：目标副本是否已经 apply/replay，查询能看到。
3. **routing**：下一次读是否真的到达满足条件的那个节点。

某种同步模式证明副本“收到”或“刷盘”，不一定证明它已经回放；即使指定副本已回放，负载均衡器把读取发到另一台落后副本，写后读仍会失败。

端到端保证必须同时说明确认点和路由规则。

## MySQL：binlog、relay log 与 apply

MySQL source 把数据变更写入 binary log。replica receiver/I/O thread 拉取事件并写入 relay log，coordinator/worker 再执行应用。

### GTID 是事务身份，不是自动一致性

启用 GTID 后，每个复制事务有全局标识，便于判断某个事务集合是否已执行、切换来源和避免重复应用。但“使用 GTID”不意味着副本零延迟，也不意味着路由器自动等待写入。

应用可在特定协议中携带写入后的 GTID set/token，在目标 replica 使用 `WAIT_FOR_EXECUTED_GTID_SET()` 有界等待。但要注意：

- 等待会占用连接并增加延迟。
- timeout 后要回 primary 或返回可解释状态，不能无限等。
- token 大小、来源和权限要受控。
- 只有目标副本 executed set 覆盖 token 才能满足写后读。
- 事务提交响应如何获得/关联 GTID 取决于驱动和架构。

这是一种高级协议，不应为所有缓存式读取机械添加。

### 半同步复制确认什么

MySQL 8.4 通过插件支持 semisynchronous replication。source 在返回提交前等待所需数量的 semisync replica acknowledgment 或直到 timeout。

它提高事务存在于至少两个位置的概率/保证边界，但 acknowledgment 的具体等待点和持久化/提交语义由配置决定；通常不能直接等同于“replica 已 apply，马上可查询”。

还必须监控：

- 插件是否安装且启用。
- source/replica semisync status 是否实际 ON。
- 当前等待会话、ack 成功和 timeout/fallback。
- required replica 数量和故障域。

只看配置变量为 ON 不够。副本不可用或 timeout 后，系统行为可能退化，应用的 RPO 假设必须覆盖该状态。

## PostgreSQL：WAL receive、flush 与 replay

primary 生成 WAL；standby walreceiver 接收，startup/recovery process 回放。Hot Standby 允许在恢复期间执行只读查询。

在 primary 的 `pg_stat_replication` 中，常见位置：

- `sent_lsn`：已发送。
- `write_lsn`：standby 已写入。
- `flush_lsn`：standby 已刷盘。
- `replay_lsn`：standby 已回放。
- `write_lag`、`flush_lag`、`replay_lag`：近期同步提交相关延迟估计。

在 standby：

- `pg_last_wal_receive_lsn()`：最后收到位置。
- `pg_last_wal_replay_lsn()`：最后回放位置。
- `pg_last_xact_replay_timestamp()`：最后回放事务时间戳。

LSN byte gap 可用 `pg_wal_lsn_diff()` 计算，但字节差不是时间。1 GB WAL 在空闲快速磁盘和满载慢盘上的追赶时间完全不同。

### synchronous_commit 的确认级别

PostgreSQL 可按系统、角色、session 甚至 transaction 选择同步提交级别。与 synchronous standby 配合时，不同值可等待到 remote write、remote flush，或 `remote_apply`。

`remote_apply` 等到同步 standby 回放并使事务可见后再确认，能加强对相应同步 standby 的写后读基础，但代价是 commit latency 和可用性更依赖 standby。仍要确保读取路由到满足确认的 standby，而不是任意异步副本。

同步复制等待期间，事务锁可能继续持有。跨地域 RTT、standby I/O 或回放变慢会直接增加写延迟与锁竞争，所以不能只从 RPO 角度配置。

## 复制延迟至少看四个维度

### 1. 时间延迟

最后回放事务时间与当前时间的差值，或 MySQL `Seconds_Behind_Source` 类指标。

缺点：无新写入时值可能看似不变/为空；依赖时钟与实现；大事务在提交前可能表现不连续。

### 2. 日志位置差

GTID executed/retrieved 差异、binlog position，或 WAL LSN byte gap。它反映待处理工作量，但不能直接换算成秒。

### 3. 队列与线程状态

receiver 是否连接、applier worker 是否运行/报错、WAL receiver 状态、replay 是否推进。线程 stopped 时一个“旧的 lag 数字”可能不再更新。

### 4. 业务版本探针

写入带版本的 canary 后，在副本读取并计算可见延迟，最接近端到端业务路径。探针必须使用专用小表/前缀、受控频率、生命周期和权限，不污染业务数据。

告警应组合这些信号，而不是只依赖一个秒数。

## 写后读：刚写完必须看到自己写的数据

典型接口：

```text
POST /orders → primary 创建订单 1001
GET /orders/1001 → 若路由 replica，可能 404
```

把这个 404 负缓存还会延长错误窗口。

### 策略一：写后粘 primary

对同一用户、session 或业务资源，在一段有界窗口内从 primary 读取。

优点：实现直观。缺点：

- 时间窗口是估计，延迟超过窗口仍失败。
- 无状态多实例要传递/共享粘性状态。
- primary 读流量可能增加。

### 策略二：携带复制位置/版本 token

写响应返回可验证 token；读请求只选择已达到 token 的 replica，否则有界等待或回 primary。

这比固定等待 500 ms 更精确，但实现依赖数据库位置语义、驱动和路由器，并要防止客户端伪造超大 token 导致资源消耗。

### 策略三：业务版本验证

资源带单调 `version`/`updated_at`，调用方要求至少版本 N。replica 返回低版本时回 primary。

业务版本易理解，但需要额外读取/比较，并且时间戳必须避免精度、时钟和并发覆盖问题；整数版本或数据库生成序列通常更清晰。

### 策略四：关键读取固定 primary

支付结果、权限变更、刚更新的订单状态等低容忍接口直接读 primary。读扩展不是所有 SELECT 都必须走 replica。

## 单调读：不要从新版本倒退到旧版本

```text
请求 1 → replica A，已回放 version 12
请求 2 → replica B，只回放 version 10
```

用户会看到状态倒退。解决思路：

- session affinity 到同一副本，但该副本故障时仍需处理。
- 客户端携带 minimum version/LSN token。
- 只选进度不低于 token 的节点。
- 不满足时回 primary，而不是返回旧值。

负载均衡的“随机健康副本”只保证节点可连接，不保证 session monotonic reads。

## 事务不能拆到不同节点

```text
BEGIN on primary
SELECT on replica
UPDATE on primary
COMMIT on primary
```

这不是一个数据库事务。snapshot、锁和未提交写都绑定同一连接/节点。事务内所有语句必须在同一 backend 上完成。

纯只读事务可以路由到 replica，但需要接受该副本 snapshot 的陈旧度和 Hot Standby 限制。驱动根据 SQL 文本猜“SELECT 就去副本”也不可靠：

- `SELECT ... FOR UPDATE` 是锁定读取，不能在只读 standby 执行。
- SELECT 可能调用有副作用函数。
- CTE/函数/临时对象可能依赖 session。
- 事务前面可能已经写入。

优先由调用方声明 workload/consistency，例如 `readEventuallyConsistent`、`readPrimary`，而不是脆弱的字符串分类。

## 延迟预算必须按接口分类

| 接口 | 可接受陈旧 | 建议路由 |
| --- | --- | --- |
| 商品公开列表 | 数秒 | 健康 replica，可缓存 |
| 用户刚修改的资料 | read-your-writes | primary 或 token-aware replica |
| 权限校验 | 极低/不可陈旧 | primary/强一致路径 |
| 财务余额 | 依业务账本要求 | 明确强一致路径，不随机副本 |
| 离线报表 | 分钟级 | 专用报表 replica/数仓 |

同一个微服务里也需要多种策略。把整个 DAO 配成 `readOnly=true` 后全部走 replica，通常过于粗糙。

## 路由器的副本健康不是一个布尔值

一个可选 replica 至少要满足：

- 网络、TLS、认证可用。
- 角色仍是 replica/standby，且处于可查询状态。
- receiver 和 applier/replay 正常。
- lag 在该请求的 staleness budget 内。
- CPU、I/O、连接和查询队列未饱和。
- schema/应用兼容，迁移阶段能执行目标 SQL。
- 若请求携带 token，进度已覆盖 token。

健康检查的结果应带能力，例如：

```text
replica A：lag 80 ms，可服务 realtime-read
replica B：lag 12 s，只服务 stale-ok/report
replica C：applier stopped，不接业务流量
```

## 副本读取也会反过来影响复制

### 资源竞争

重查询占用 CPU、I/O、内存和缓存，使 apply/replay 变慢；lag 增加后更多请求回 primary，又改变整个拓扑负载。

### PostgreSQL Hot Standby conflict

standby 查询可能需要查看 primary 已经通过 WAL 要删除/改变的旧版本或对象，回放与查询会冲突。系统需要在“等待查询”与“取消查询继续回放”之间取舍。

`max_standby_streaming_delay` 等配置控制允许 recovery 因冲突等待的总预算，不是单条查询固定运行时间。`hot_standby_feedback` 可减少因 cleanup 引起的查询取消，但会让 primary 保留 dead rows，可能造成 bloat。它是把冲突成本转移到 primary，不是免费开关。

监控 `pg_stat_database_conflicts`、被取消查询、replay lag 和 primary bloat。

### MySQL apply 与业务查询竞争

replica applier、并行 worker、buffer pool 和业务 SELECT 共享资源。大事务、热点更新、DDL 或慢存储都可能使 apply 落后。只增加读取副本数量也会增加 source 网络/连接与运维成本。

## 故障切换不仅是“把 replica 改成 primary”

安全 failover 包含：

1. 判断旧 primary 不可安全继续服务。
2. 选择满足数据/故障域目标的候选副本。
3. 提升并建立新的写入权威。
4. fencing 旧 primary，防止双写/split brain。
5. 更新代理、DNS、service discovery 和客户端池。
6. 清除旧角色连接，验证新连接角色。
7. 重建副本与恢复冗余。
8. 确认丢失/重复/未知提交窗口并对账。

如果旧 primary 仍能被部分应用访问，就可能出现两个节点接受写入。只依赖 DNS TTL 不足以 fencing 已存在的长连接。

客户端在 reconnect 后要重新发现角色；旧连接收到 read-only/connection error 后不能无限重试非幂等写。COMMIT 响应丢失仍属于未知结果。

## schema migration 与副本兼容

滚动迁移期间 primary 和 replica 可能处在不同 replay 位置：

- 应用新 SQL 已发布，某副本尚未回放新增列/索引 DDL。
- 长查询与 DDL/recovery conflict。
- 副本落后导致旧 schema 被路由器误判为健康。

使用 expand/contract：先部署向后兼容 schema，等所有副本回放并验证，再发布读取/写入新字段；最后清理旧结构。路由健康应包含 migration barrier，而不只是 lag 秒数。

## 副本不会扩展写吞吐

所有写仍需在 primary 生成日志，并由每个副本接收和回放。增加副本：

- 增加读容量，但不是线性：查询和数据分布决定收益。
- 增加 source 网络、复制连接和存储成本。
- 每个副本都要执行/回放写入工作。
- 同步副本还可能进入 commit latency 路径。

写瓶颈要先优化事务、索引、批次和热点；真正拆写通常进入分片/分库，复杂度显著更高。

## 容量规划与故障余量

正常时把 replica CPU 用到 80% 承接读取，failover 后它成为 primary，还要接写入、日志生成和复制下游，可能立即过载。

至少验证：

- 任一读副本退出后，剩余副本和 primary 能否承接流量。
- 候选副本提升后能否承接 primary 写负载。
- 全量 base backup/clone 与业务读取同时发生。
- replica 从大 lag 追赶时的资源。
- 同步副本故障时写延迟和可用性行为。
- 所有副本不可用时哪些读回 primary，是否有限流。

读写分离容量不是“primary 50% + replica 50%”的静态图，而是故障场景下的路由矩阵。

## 可观测性

### 应用/路由层

- 每个逻辑查询的 primary/replica 路由数。
- consistency class、staleness budget。
- 写后粘主、token wait、fallback primary 数量和耗时。
- replica 读 404/版本落后后回主的比例。
- failover reconnect、role mismatch 和 unknown commit。

### MySQL

- receiver/coordinator/worker service state 与 last error。
- retrieved/executed GTID 差。
- relay/apply queue 和 worker 利用率。
- `Seconds_Behind_Source` 作为辅助而非唯一指标。
- semisync operational status、ack 和 fallback/timeout。

### PostgreSQL

- sent/write/flush/replay LSN 与 byte gap。
- write/flush/replay lag。
- WAL receiver 状态和最后消息时间。
- last replay transaction timestamp。
- recovery conflict、取消查询与 bloat。
- replication slot retained WAL，防止磁盘被无限占用。

## 配套示例

### 状态模型

`examples/database/18-replica-routing-consistency.mjs` 不连接数据库，验证：

- 只把 lag 满足请求预算的副本加入候选。
- minimum position token 防止写后读和单调读倒退。
- 不满足条件时回 primary，而不是返回旧版本。
- 随机副本路由如何让连续读取倒退。
- failover epoch/fencing 阻止旧 primary 继续接受写入。

### MySQL 8.4

`examples/database/18-mysql-replication-diagnostics.sql` 只读检查 server role、receiver/coordinator/worker、GTID 和 semisync 插件状态。

### PostgreSQL 18

`examples/database/18-postgresql-replication-diagnostics.sql` 同时提供 primary 侧 `pg_stat_replication` 与 standby 侧 receive/replay、WAL receiver 和 conflict 查询；不修改复制配置。

## 上线检查清单

### 一致性

- 每个接口标注允许陈旧度和写后读要求。
- 权限、支付、余额等关键读取不随机走副本。
- token/sticky/fallback 策略有 deadline 和指标。
- 多副本连续读取不会无声倒退。
- 事务内语句固定同一节点和连接。

### 路由与健康

- 角色、连接、receiver、apply/replay、lag 和资源共同决定健康。
- 副本按 realtime/stale/report 能力分级。
- migration barrier 纳入路由。
- 所有副本不可用时回 primary 流量有上限。
- 客户端 failover 后重建连接并重新验证角色。

### 复制与故障

- RPO/RTO 与异步/同步确认点一致。
- semisync/synchronous replication 监控实际 operational 状态。
- lag 同时使用位置、时间、线程和业务探针。
- failover 有 fencing、未知提交对账和副本重建。
- 延迟副本、报表副本和 HA 候选角色明确分离。

### 容量

- 副本业务查询不会饿死 apply/replay。
- 提升候选有承接写入和复制的余量。
- full sync/base backup/追赶经过压测。
- 同步副本 RTT 与故障行为满足写 SLO。
- replication slot/binlog/WAL 保留有磁盘上限告警。

## 常见误区

### “SELECT 都可以走副本”

权限、写后读、锁定读取和事务内查询可能要求 primary；SELECT 也可能依赖 session 或调用副作用函数。

### “半同步/同步复制等于所有副本实时可读”

确认点可能是 receive、write、flush 或 apply，且只涉及配置的同步副本。路由到另一台落后副本仍会读旧。

### “Seconds Behind 为 0，所以没有延迟”

时间指标可能受空闲、时钟、大事务和线程停止影响。要结合 GTID/LSN、worker 状态和业务探针。

### “读副本越多，性能线性增长”

每个副本都消耗 source 网络、存储和运维，并需回放全部写入；热点查询和路由不均也不会自动消失。

### “发生 failover 后 DNS 改了就完成了”

旧长连接可能仍访问旧主，必须 fencing、关闭旧池、重新发现角色，并处理未知提交。

### “hot_standby_feedback 打开就不会取消查询”

它可能减少部分 recovery conflict，却把旧版本保留成本转移到 primary，造成表膨胀；仍需监控和限制长查询。

## 本课小结

- 复制用于高可用、读扩展和灾备时要求不同，应为副本定义角色。
- 异步复制在 primary COMMIT 成功时不保证副本已收到或回放，存在写后读和故障丢失窗口。
- durability、visibility 和 routing 是三个独立条件；同步确认不自动保证任意副本读取最新。
- MySQL 用 binlog/relay/GTID 描述进度，PostgreSQL 用 WAL receive/write/flush/replay LSN 描述阶段。
- 延迟要同时看时间、日志位置、线程状态和业务探针，不能依赖单一秒数。
- 写后读可用粘主、位置 token、业务版本或关键读固定 primary，并设置有界 fallback。
- 多副本随机路由可能破坏单调读；minimum version/position token 能防止倒退。
- 事务不能跨 primary 与 replica 拆分，SQL 文本猜测路由也不可靠。
- 副本查询会与 apply/replay 争用资源，PostgreSQL Hot Standby 还存在 recovery conflict 与 bloat 权衡。
- failover 必须 fencing 旧主、刷新连接和处理未知提交；副本容量要按提升后的写入角色规划。

## 官方资料

- [MySQL 8.4：Replication](https://dev.mysql.com/doc/refman/8.4/en/replication.html)
- [MySQL 8.4：Replication implementation](https://dev.mysql.com/doc/refman/8.4/en/replication-implementation.html)
- [MySQL 8.4：Semisynchronous replication](https://dev.mysql.com/doc/refman/8.4/en/replication-semisync.html)
- [MySQL 8.4：Performance Schema replication tables](https://dev.mysql.com/doc/refman/8.4/en/performance-schema-replication-tables.html)
- [MySQL 8.4：replication_connection_status](https://dev.mysql.com/doc/refman/8.4/en/performance-schema-replication-connection-status-table.html)
- [PostgreSQL 18：Log-shipping standby servers](https://www.postgresql.org/docs/18/warm-standby.html)
- [PostgreSQL 18：Hot Standby](https://www.postgresql.org/docs/18/hot-standby.html)
- [PostgreSQL 18：pg_stat_replication](https://www.postgresql.org/docs/18/monitoring-stats.html#MONITORING-PG-STAT-REPLICATION-VIEW)
- [PostgreSQL 18：Synchronous replication](https://www.postgresql.org/docs/18/warm-standby.html#SYNCHRONOUS-REPLICATION)
- [PostgreSQL 18：Recovery information functions](https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-RECOVERY-INFO-TABLE)
