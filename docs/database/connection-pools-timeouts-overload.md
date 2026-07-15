---
title: 数据库连接池、超时与过载保护
description: 从接口 deadline 出发理解连接池的准入控制、Little 定律、连接与会话状态、MySQL/PostgreSQL 超时语义、取消与未知结果、重试放大、背压和优雅停机
prev:
  text: SQL 与索引优化实战
  link: /database/sql-and-index-optimization
next:
  text: 读写分离、复制延迟与一致性
  link: /database/read-write-splitting-replication-consistency
---

# 数据库连接池、超时与过载保护

一条 SQL 从 500 ms 优化到 20 ms，不代表接口在高峰时一定稳定。如果应用允许几千个请求同时进入数据库、每层各自重试、连接池无界等待，数据库仍会在短暂抖动中迅速失去恢复能力。

连接池的核心职责不只是“复用连接、减少握手”，更是限制进入数据库的并发量。超时的核心职责也不只是“早点报错”，而是让无用工作及时停止，并为回源、降级和返回响应保留预算。

本课从一次接口请求的 deadline 开始，串联应用池、驱动、数据库会话、事务与发布生命周期，并分别说明 MySQL 8.4 和 PostgreSQL 18 的超时边界。

## 先看没有保护时的故障链

```text
数据库延迟从 20 ms 升到 200 ms
  ↓ 同样吞吐下 in-flight 请求约增至 10 倍
连接池被占满
  ↓ 新请求在池队列等待
HTTP 请求达到 timeout
  ↓ 网关、客户端和应用开始重试
数据库收到更多并发与重复工作
  ↓ 延迟继续上升，事务更长，锁更多
所有请求一起超时
```

这是典型的正反馈。单纯扩大连接池，可能暂时让 pool wait 下降，却把更多并发直接压给已变慢的数据库，使整体更快崩溃。

## 连接池是并发闸门

一个应用实例的连接池通常包含：

- 已建立且空闲的连接。
- 正被请求借用的连接。
- 等待连接的请求队列。
- 正在建立、验证或回收的连接。

关键参数不只有 `maxPoolSize`：

| 参数/行为 | 要回答的问题 |
| --- | --- |
| min/idle | 空闲时保留多少连接，是否造成大量长期空闲会话 |
| max | 单实例最多把多少并发送入数据库 |
| acquire timeout | 池满后最多等多久 |
| max waiters | 等待队列是否有界 |
| idle lifetime | 多久回收空闲连接，如何与服务端 timeout 协调 |
| max lifetime | 是否错峰轮换，避免所有连接同时老化 |
| validation | 借出前、后台还是失败后识别断线 |
| leak detection | 连接/事务借出过久怎样告警 |

“池满立即失败”与“等待一小段时间”都是策略；“无限等待”通常不是。有限队列能吸收很短的抖动，超过预算后应明确过载，而不是把内存变成无限排队区。

## 先算所有应用实例的总连接上限

配置常写在单个 Pod：

```text
max pool size = 40
```

但数据库看到的是：

```text
总潜在连接 = 应用实例数 × 每实例池上限 × 每个目标数据库/角色
             + worker/定时任务
             + migration/管理/监控
             + 故障切换期间的重叠连接
```

例如 80 个 API Pod 每个 40 条连接，已经是 3,200 条；若分别维护 primary 和 replica 池，还可能继续增加。数据库 `max_connections` 不是应该被业务池全部瓜分的额度，需要保留复制、监控、维护和紧急管理连接。

扩容应用实例时，如果不同时重新计算总池大小，横向扩容 Web 层可能反而压垮数据库。

## 用 Little 定律理解延迟为什么放大并发

稳定系统中可以用近似关系：

```text
并发中的请求数 L ≈ 到达速率 λ × 平均停留时间 W
```

假设数据库操作到达 500 次/秒：

```text
平均 20 ms：L ≈ 500 × 0.020 = 10
平均 200 ms：L ≈ 500 × 0.200 = 100
```

吞吐没变，延迟变 10 倍，在途请求也约变 10 倍。若池只有 30，后面的请求必然排队；若池扩大到 100，而数据库只能稳定处理 30 并发，数据库内部开始排队。

Little 定律描述关系，不直接给出最佳池大小。真实工作负载还有尾延迟、事务、锁、不同 SQL 成本和突发流量；最终要逐步增加并发做负载测试，找到吞吐停止增长或 P99/错误开始恶化的拐点。

## 连接数与活跃查询数不同

连接池可以保留很多 idle connection，但只有一部分同时执行。数据库成本包括：

- 每连接会话内存和 backend/thread 资源。
- 活跃查询的 CPU、I/O、锁和工作内存。
- 事务持有的 snapshot、锁和 undo/MVCC 版本。
- prepared statement、临时对象与会话状态。

100 个空闲连接与 100 个同时排序的大查询风险不同；100 个 `idle in transaction` 又比普通 idle 更危险。容量监控必须按状态拆分。

## 一个连接不是无状态 HTTP 请求

数据库连接承载会话状态：

- 当前事务、隔离级别、只读状态。
- MySQL session variables、临时表、用户变量。
- PostgreSQL `search_path`、role、GUC、prepared statement、LISTEN。
- 时区、字符集、日期格式和应用名称。
- advisory lock 和其他连接级资源。

连接归还池时，下一位调用者可能拿到同一会话。如果上一个请求忘记 ROLLBACK、保留修改过的 `search_path` 或持有 advisory lock，就会发生跨请求污染。

成熟连接池/驱动应有明确 reset 行为；应用仍要遵守：

```text
借连接 → BEGIN（如需要）→ SQL → COMMIT/ROLLBACK → 清理 → 归还
```

任何异常路径都必须释放连接。不要在业务代码中“发生异常直接 return”而跳过 rollback/finally。

### 连接池与事务池不是同一个语义

某些代理以 transaction 为单位复用后端连接。这样可以让大量客户端共享较少数据库连接，但连接级功能可能受限：

- session prepared statement 的可用性依代理能力而定。
- 临时表、LISTEN/NOTIFY、session advisory lock、SET SESSION 可能不能跨事务保持。
- 应用以为固定在同一连接，下一事务实际可能换 backend。

选择池化模式前要盘点驱动和 ORM 使用的会话能力，不能只看“支持 PostgreSQL/MySQL 协议”。

## 一次数据库调用有多层时间预算

```text
HTTP deadline
  ├─ pool acquire timeout
  ├─ connect/TLS/auth timeout
  ├─ transaction total budget
  │    ├─ lock wait budget
  │    ├─ statement execution budget
  │    └─ result read/socket budget
  └─ 序列化与返回响应余量
```

合理关系通常是外层更长：

```text
pool wait < 数据库操作预算 < HTTP 总 deadline
lock timeout < statement timeout ≤ 事务/数据库操作预算
```

这不是简单设置一串固定数字。列表查询、写事务、后台报表和 migration 的预算不同，应使用独立 workload class、账号或连接池。

### 示例预算

```text
HTTP deadline                   500 ms
pool acquire                     20 ms
connect（仅新连接）              80 ms
单条在线 SQL                    150 ms
lock wait                        30 ms
整个数据库阶段                 250 ms
为降级、编码和网络返回保留      250 ms
```

若 pool acquire 已花 200 ms，再给 SQL 完整 500 ms，会超过上游 deadline。应用应传播“剩余时间”，而不是每一层重新开始自己的最大 timeout。

## 客户端 timeout、取消和服务端 timeout 不等价

### 客户端读取 timeout

驱动不再等待响应，但服务端 SQL 可能继续运行。关闭 socket 后数据库通常会最终发现断开并清理，但时间点、取消能力和语句阶段依协议与数据库而异。

### 客户端显式取消

PostgreSQL 驱动可通过独立取消请求要求 backend 取消当前查询；MySQL 驱动/代理能力不同。取消是尽力而为：请求可能在取消到达前已完成，网络也可能阻止取消送达。

### 数据库服务端 timeout

服务端自己停止语句，能更可靠地限制数据库资源使用，但不同 timeout 的回滚范围不同。应用仍要捕获错误、决定事务是否可继续，并归还干净连接。

因此客户端 timeout 用来保护调用方等待时间，服务端 timeout 用来限制数据库工作；生产通常需要两者配合，而不是二选一。

## PostgreSQL 18 的四类关键 timeout

### statement_timeout

限制一条 statement 从服务端收到相关消息到完成的时间。超时会中止当前 statement。它不等于整个 HTTP deadline，也不天然限制事务中多条语句的总时长。

### lock_timeout

只在等待获取锁时计时，并对每次锁获取尝试分别适用。如果它等于或大于非零 `statement_timeout`，通常先触发 statement timeout，失去区分价值。

### idle_in_transaction_session_timeout

连接在已打开事务中空闲太久时终止 session，避免长时间持锁、保留旧 snapshot 并阻碍 vacuum。它不是普通查询执行 timeout。

### transaction_timeout

限制事务总跨度，包括显式事务与单语句隐式事务。PostgreSQL 官方不建议不加区分地在 `postgresql.conf` 全局设置，因为所有 session 工作负载不同；可按角色、数据库或事务局部策略配置。

若 `transaction_timeout` 小于或等于某些更长 timeout，官方语义会使那些更长限制被忽略。配置时必须核对组合，而不是独立看每个数字。

### 优先使用事务局部设置

对特定事务：

```sql
BEGIN;
SET LOCAL statement_timeout = '500ms';
SET LOCAL lock_timeout = '100ms';
-- 业务 SQL
COMMIT;
```

`SET LOCAL` 只在当前事务有效，结束后自动恢复，适合连接池复用。`SET SESSION` 若未 reset 会污染下一位借用者。

## MySQL 8.4 的 timeout 边界

### max_execution_time

`max_execution_time` 以毫秒限制只读 SELECT 的执行时间，可设 session 值或使用 `MAX_EXECUTION_TIME(N)` optimizer hint。官方说明它不覆盖所有语句，并且在存储程序等场景有适用限制。

不能因为设置了它，就认为 INSERT/UPDATE/DELETE、COMMIT、DDL 和整个事务都有同一执行上限。

### innodb_lock_wait_timeout

限制 InnoDB 事务等待行锁的秒数。默认语义中，超时时回滚当前 statement，不是自动回滚整个 transaction。应用收到错误后必须明确 ROLLBACK 或按经过验证的 savepoint/事务协议处理；不能继续把连接当作事务已结束。

它不适用于所有 table/metadata lock，deadlock detection 开启时死锁通常会更早被检测并选择一个事务回滚。

### wait_timeout / interactive_timeout

它们限制连接在无活动时服务器等待多久，不限制正在执行的慢 SQL。普通应用连接一般使用 noninteractive `wait_timeout`；连接池必须能识别被服务端关闭的陈旧连接并重建。

把 idle timeout 设得极短会造成频繁重连、TLS/auth 开销和高峰连接风暴。客户端 idle/max lifetime 应与服务端策略协调，并加入随机抖动，避免所有实例同时轮换。

### 驱动 timeout 仍不可缺少

MySQL 服务端变量不能替代 connect、socket read/write 和 pool acquire timeout。特别是写语句，客户端超时后结果可能未知，必须通过业务幂等键或查询事实确认。

## timeout 后先判断事务状态

不同错误可能产生不同状态：

| 场景 | 可能状态 | 应用动作 |
| --- | --- | --- |
| 借连接前 pool timeout | SQL 未发送 | 降级/过载失败，不需数据库回滚 |
| 建连失败 | 业务 SQL 通常未发送 | 有界重连或失败 |
| SELECT 被 statement timeout 取消 | 当前 statement 失败 | PostgreSQL 事务进入 failed 状态时需 rollback |
| MySQL InnoDB lock wait timeout | 默认当前 statement 回滚 | 明确决定并通常 rollback 整个业务事务 |
| 写入后响应丢失 | COMMIT/语句结果未知 | 查询业务事实，不能盲重试 |
| 连接断开且事务未提交 | 服务端最终回滚未提交事务 | 仍需处理客户端不知道 COMMIT 是否已完成的窗口 |

PostgreSQL 事务内一条语句报错后，后续语句通常会收到“current transaction is aborted”，直到 ROLLBACK 或回到 savepoint。MySQL 不同错误的事务回滚范围不同。跨数据库抽象层不能假设完全一致。

## COMMIT timeout 是最危险的未知结果

```text
应用 ── COMMIT ──> 数据库
数据库已持久提交
数据库 ── OK ──× 网络断开
应用看到 timeout
```

应用不能安全地把它标为失败后重新创建订单。正确设计依赖：

- 稳定 idempotency key。
- 数据库唯一约束。
- 可查询的业务状态/资源 ID。
- Outbox 或持久事件记录。
- 对账和恢复任务。

数据库事务保证服务端内部原子性，不保证客户端一定收到提交结果。

## 重试必须有单一预算

可能同时重试的层：

- 浏览器/移动端。
- API gateway/service mesh。
- HTTP SDK。
- repository/数据库驱动。
- 消费者任务框架。

若四层各重试 2 次，一次原始请求最坏可能产生指数级尝试。应明确哪一层拥有重试决策，并给出总 attempt/deadline budget。

只对满足条件的操作重试：

1. 错误确实可能瞬时恢复，例如建连失败、serialization/deadlock victim。
2. 已执行结果已知，或业务操作可幂等去重。
3. 剩余 deadline 足够完成下一次尝试。
4. 使用指数退避与 jitter，避免同步重试。
5. 系统仍有容量，熔断器/重试预算未耗尽。

数据库过载时，立即重试 timeout 往往是最坏策略。

## Deadlock 和 serialization failure 应重试整个事务

这类错误说明当前事务尝试不能提交。若业务协议允许，应从事务开头在新 snapshot/锁顺序下重试，而不是只重发最后一条 SQL。

重试前确保：

- 事务外副作用尚未发生，或有幂等保护。
- 使用同一业务 request ID。
- 次数有限并有退避。
- 事务读取的输入会重新检查。
- 错误分类来自数据库 code/SQLSTATE，而不是匹配文案。

把远程支付调用放在数据库事务中，发生 serialization retry 时可能重复支付；这正是事务内不应执行不可回滚远程副作用的原因。

## 背压与负载卸载

### 有界等待队列

池满后只允许有限 waiter；超过立即返回 overload。这样可以保护应用内存和 deadline。

### 并发隔离

把在线请求、后台报表、批任务、消费 worker 分成独立池/账号/资源组，避免一个大查询占满所有连接。总和仍必须受数据库容量约束。

### 限流与自适应并发

当 pool wait、数据库 P99、锁等待或错误持续升高时，降低进入数据库的并发，而不是增加。可对低优先级接口快速失败或返回可接受的陈旧缓存。

### 熔断器

数据库持续失败时短期停止新的非关键尝试，让资源恢复；半开阶段只放少量探测。熔断不能让关键写“假成功”，返回契约必须明确。

### 缓存回源保护

Redis 故障或 miss 激增时，数据库 semaphore/singleflight 必须独立限制回源并发。缓存可用时的数据库池大小不代表能安全承接全量缓存流量。

## 为什么不能用数据库 max_connections 当池大小

`max_connections` 是服务器接纳上限，不是性能最优并发，也不是单个服务配额。

PostgreSQL 会根据 `max_connections` 配置某些资源，提高上限会增加共享内存等资源需求；还提供 `reserved_connections` 和 `superuser_reserved_connections` 为受权角色/紧急管理保留槽位。

MySQL 也需要为管理、复制和监控保留访问能力。达到普通连接上限时，事故处理者若也无法连接，恢复会更困难。

业务池总和应低于服务器上限，并通过数据库用户、代理、部署控制和监控确保配额，而不是靠团队口头约定。

## Pool sizing 的实验方法

1. 用生产代表性 SQL 比例、事务和数据分布。
2. 固定数据库规格和后台任务。
3. 从较小连接并发开始逐步增加。
4. 每级稳定运行足够时间，覆盖 cache/ checkpoint 波动。
5. 记录吞吐、P50/P95/P99、pool wait、DB active、CPU、I/O、锁和错误。
6. 找到吞吐不再线性增长、尾延迟开始陡升的拐点。
7. 选择低于拐点并有故障余量的并发。
8. 再乘应用实例数验证总连接，不按单实例单独压测。

池大小应随工作负载变化复测。把一个只读缓存服务的 50 连接配置复制给持锁写事务服务没有依据。

## 健康检查不要制造连接风暴

### Liveness

数据库短时不可用通常不应让所有应用实例同时重启。liveness 关注进程自身是否卡死，不宜强依赖数据库。

### Readiness

应用完全无法建立必要连接且不能降级时，可以 not ready；但所有 Pod 同时摘除又恢复，会造成流量和建连尖峰，需要启动抖动与渐进恢复。

### Pool validation

每次借出都执行 `SELECT 1` 会增加高频往返。可采用失败后丢弃、空闲后台验证或基于连接寿命策略，具体遵循驱动能力和故障模型。

健康探针使用短 timeout、低频、只读账号，不开启长事务，也不查询业务大表。

## 发布与优雅停机

滚动发布时：

1. readiness 变 false，停止接收新请求。
2. 停止产生新数据库任务与重试。
3. 在 shutdown deadline 内 drain in-flight 请求。
4. 正常 COMMIT/ROLLBACK 已开始的事务。
5. 取消尚未发送或仍在 pool queue 的操作。
6. 对已发送未确认的写记录未知结果，交给幂等恢复。
7. 关闭 pool，等待连接释放，而不是直接杀进程。
8. 超过平台宽限期前保留清理和日志时间。

若每个 Pod 关闭旧池的同时新 Pod 预热最大池，会短时产生两代连接。部署容量必须考虑这种重叠。

## 可观测性

应用侧：

- pool size、active、idle、waiters、acquire latency、timeout。
- connect/TLS/auth 延迟与失败。
- transaction duration 和每事务 SQL 数。
- statement latency、rows、error code/SQLSTATE。
- cancel、retry、backoff、最终结果和 unknown outcome。
- shutdown drain 与未完成操作。

数据库侧：

- current/total connections，按账号和应用名拆分。
- active、idle、idle in transaction。
- 长事务、锁等待、deadlock/serialization。
- CPU、I/O、临时文件、WAL/redo 和复制延迟。

组合告警比单阈值更有行动性：

```text
pool wait P99 上升
+ active 达池上限
+ DB statement P99/lock wait 上升
= 数据库阶段饱和，限制并发并定位慢/阻塞事务
```

仅看到连接使用率 100% 不足以决定扩池；如果数据库仍空闲，可能池确实过小；如果数据库 CPU/锁已饱和，应减少工作或修复根因。

## 配套示例

### 状态模型

`examples/database/17-connection-pool-overload.mjs` 验证：

- Little 定律下延迟增长如何放大 in-flight。
- 多实例池总和不能超过数据库业务连接预算。
- pool wait、SQL 和 HTTP deadline 的嵌套预算。
- 多层重试如何放大数据库尝试次数。
- 有界池在过载时拒绝新工作，而不是无限排队。

### MySQL 8.4

`examples/database/17-mysql-connection-timeouts.sql` 只读取连接/timeout 配置，并在当前 session 演示 `max_execution_time` 和 `innodb_lock_wait_timeout`，最后恢复原 session 值。

### PostgreSQL 18

`examples/database/17-postgresql-connection-timeouts.sql` 读取连接状态和 server timeout，并用 `SET LOCAL` 演示事务局部预算；ROLLBACK 后设置自动恢复。

三份示例不修改全局配置、不终止连接、不制造锁等待，也不访问业务表。

## 上线检查清单

### 池与连接

- 汇总所有实例、角色、worker 和故障重叠连接。
- 为管理、监控、复制和迁移保留连接。
- acquire queue 有界且有短 timeout。
- session 状态、事务和异常路径能可靠 reset。
- idle/max lifetime 与服务端 timeout 协调并带 jitter。

### Deadline 与 timeout

- deadline 从 HTTP/任务传播到 pool 和数据库阶段。
- lock timeout 小于 statement/事务总预算。
- MySQL 明确区分 SELECT、row lock、idle connection timeout。
- PostgreSQL 使用适当 statement/lock/idle transaction/transaction timeout。
- timeout 后按数据库语义 rollback，不复用污染连接。

### 重试与过载

- 只有一层拥有主要重试策略，总次数可计算。
- 写操作有幂等键、唯一约束和结果查询。
- deadlock/serialization 从事务开头有限重试。
- Redis/缓存故障时数据库回源并发有独立上限。
- 在线、报表、批任务有资源隔离和优先级。

### 发布与观测

- liveness 不依赖数据库短时可用性。
- readiness 和降级能力一致。
- 滚动发布考虑新旧连接重叠与预热风暴。
- 监控 pool wait、事务时长、SQLSTATE、锁和未知提交。
- 优雅停机能 drain、rollback 并关闭池。

## 常见误区

### “连接池越大，排队越少”

排队可能只是从应用池移到数据库内部，并带来更多锁、内存和调度竞争。吞吐达到拐点后继续加连接通常只增加尾延迟。

### “设置服务端 idle timeout 可以杀掉慢查询”

MySQL `wait_timeout` 和 PostgreSQL `idle_session_timeout` 面向空闲连接，不是正在执行 statement 的上限。

### “客户端 timeout 后数据库一定停止了”

客户端可能只是不再等待；服务端仍可能执行。需要服务端 timeout/取消与业务未知结果协议。

### “锁等待超时后整个事务已经回滚”

MySQL InnoDB 默认只回滚当前 statement。PostgreSQL 事务报错后也需显式 rollback 才能恢复连接状态。

### “所有 timeout 统一设成 1 秒最简单”

若 lock、statement、事务和 HTTP 同时到期，无法区分原因，也没有时间降级或返回。预算应按层次嵌套。

### “自动重试能提高可靠性”

没有幂等、退避、总预算和过载判断的重试会重复写入并放大故障。

## 本课小结

- 连接池既复用连接，也限制数据库并发；等待队列必须有界。
- 总连接要按所有实例、数据库角色和发布重叠计算，不能只看单 Pod。
- Little 定律说明延迟增长会在相同吞吐下放大在途请求，形成池耗尽。
- 数据库连接有事务和 session 状态，归还前必须 COMMIT/ROLLBACK 与 reset。
- HTTP、pool、connect、lock、statement 和 transaction timeout 应组成嵌套 deadline。
- 客户端 timeout/取消不保证服务端已停止，写入与 COMMIT 可能产生未知结果。
- PostgreSQL 与 MySQL 的 timeout 适用范围和回滚范围不同，抽象层不能混为一谈。
- 重试只适用于可恢复错误和可安全重复的事务，并受单一总预算约束。
- 过载时应背压、限流、隔离和降级，而不是扩池加重数据库排队。
- 池大小通过真实负载找到吞吐/尾延迟拐点，并保留故障和管理余量。

## 官方资料

- [MySQL 8.4：Server system variables](https://dev.mysql.com/doc/refman/8.4/en/server-system-variables.html)
- [MySQL 8.4：InnoDB system variables](https://dev.mysql.com/doc/refman/8.4/en/innodb-parameters.html)
- [MySQL 8.4：Performance Schema connection tables](https://dev.mysql.com/doc/refman/8.4/en/performance-schema-connection-tables.html)
- [MySQL 8.4：Performance Schema threads](https://dev.mysql.com/doc/refman/8.4/en/performance-schema-threads-table.html)
- [PostgreSQL 18：Client connection defaults](https://www.postgresql.org/docs/18/runtime-config-client.html)
- [PostgreSQL 18：Connections and authentication](https://www.postgresql.org/docs/18/runtime-config-connection.html)
- [PostgreSQL 18：SET](https://www.postgresql.org/docs/18/sql-set.html)
- [PostgreSQL 18：Monitoring database activity](https://www.postgresql.org/docs/18/monitoring-stats.html)
