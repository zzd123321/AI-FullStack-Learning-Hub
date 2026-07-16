---
title: 大规模数据回填、批处理与断点续跑
description: 为历史数据补列、重算派生值或重建读模型时，使用稳定水位、短事务、条件写、持久断点、自适应限速和不变量验证控制生产风险
prev:
  text: CDC、Transactional Outbox 与可靠事件传播
  link: /database/cdc-transactional-outbox-reliable-events
next:
  text: 数据库测试、测试数据与 CI 发布门禁
  link: /database/testing-test-data-ci-release-gates
---

# 大规模数据回填、批处理与断点续跑

给十行测试数据补一个字段，一条 `UPDATE` 就够了；给十亿行生产数据补字段，它是一个会持续数小时甚至数天的在线系统。期间用户仍在写入，副本和 CDC 仍要追赶，数据库还要服务正常接口。

因此，大规模回填不是“把 SQL 放进后台执行”，而是一项有水位、有状态、有资源预算、可暂停、可续跑、可验证的生产任务。本课建立从 dry run 到最终补扫的完整协议。

## 先区分三类任务

| 任务 | 目标 | 典型风险 |
| --- | --- | --- |
| schema backfill | 为新列补历史值 | 与新旧应用并存、切读时机 |
| 数据修复 | 修正已知错误 | 权威来源不清、覆盖合法新写 |
| 派生重建 | 重建缓存、索引、汇总或读模型 | 水位缺口、重复与下游过载 |

它们都需要批处理和幂等，但验收标准不同。schema backfill 关心新旧表示等价；数据修复必须有证据和审批；派生重建必须与增量流在同一水位衔接。不要用同一个“万能脚本”模糊不同正确性边界。

## 开始前写出不变量和映射规则

假设要从旧状态字符串回填新状态码：

```text
pending  -> 10
paid     -> 20
shipped  -> 30
cancelled-> 40
```

至少要明确：

- 源字段是什么，谁拥有其业务含义。
- 映射版本、未知值和 NULL 如何处理。
- 目标字段为空才写，还是允许覆盖某些旧版本。
- 在线写入期间由哪个应用版本同时维护新旧字段。
- 一行失败是暂停整个任务、进入隔离队列还是人工审批。
- 完成条件是“扫描结束”还是“所有行满足等价不变量”。

映射规则应固定版本并进入代码审查。若规则在任务中途改变，不能悄悄继续；需记录新版本、影响范围，并决定重扫还是开新任务。

## Expand → Backfill → Verify → Switch → Contract

回填通常位于兼容迁移的中间，而不是独立操作：

```mermaid
flowchart LR
  E["Expand：增加兼容结构"] --> W["新代码双写 / 新写维护新字段"]
  W --> B["Backfill：补历史行"]
  B --> V["Verify：等价与完整性"]
  V --> S["Switch：切换新读路径"]
  S --> C["Contract：停止旧写并清理旧结构"]
```

必须先让在线写路径维护新字段，再开始回填。否则任务扫过的旧行可能被旧应用再次更新成不完整状态，形成永远追不完的移动目标。

## 为什么一条大 UPDATE 风险很高

一个包含海量行的事务会同时放大：

- 行锁持有时间与死锁范围。
- undo/redo 或 WAL 生成量。
- MySQL purge 压力、PostgreSQL dead tuples 与 autovacuum 压力。
- 复制延迟、CDC backlog、备份和 PITR 日志体积。
- buffer cache 污染、磁盘写入和 checkpoint 压力。
- 失败后的回滚时间与不确定性。

MySQL 官方文档明确建议将巨大更新拆成多次定期提交；大事务回滚甚至可能比原操作耗时更久。PostgreSQL 的每次 `UPDATE` 会产生新行版本，大量更新会产生需要 `VACUUM` 回收的 dead tuples。

“夜间执行”也不是安全机制：跨时区流量、备份、报表和 autovacuum 可能恰好在夜间运行。需要实际资源预算和停止门槛。

## 固定本轮上界，避免永远追逐新数据

任务启动时捕获一个明确上界，例如当前最大单调主键、创建时间加主键的复合水位，或一致快照对应的日志位置：

```text
job_id = backfill-order-state-v1
lower_bound = 0
upper_bound = 987654321
rule_version = state-code-v1
```

本轮只处理 `id <= upper_bound`。新插入行应由新应用直接写完整，或由下一轮增量补扫负责。没有固定上界，进度分母不断增长，任务可能永远无法证明完成。

最大 ID 只对单调、稳定且不会复用的键有效。随机 UUID 没有时间含义，但仍可按确定性范围/hash 分桶；时间字段可能重复或被修改，应使用 `(created_at, id)` 复合游标并固定 UTC 精度。

## 用 keyset 游标，不用 OFFSET 翻页

```sql
SELECT id, status, state_code, version
FROM orders
WHERE id > :last_scanned_id
  AND id <= :upper_bound
ORDER BY id
LIMIT :batch_size;
```

`OFFSET` 越深通常扫描越多，而且并发插入/删除会造成跳行或重复。keyset 让每一批从最后稳定键继续，查询形状也更容易由索引支持。

断点记录的是“已安全处理到哪里”，不是当前循环读到了哪里。若一批事务尚未提交就提前推进 checkpoint，崩溃会永久跳过数据。

## 一批事务的正确顺序

推荐状态机：

```text
读取 batch（记录 observed version / source digest）
→ 在内存计算派生值并分类异常
→ 短事务执行条件更新
→ COMMIT
→ 持久化 batch 结果和 checkpoint
→ 采样验证、观察门禁、决定下一批速度
```

数据库提交后、checkpoint 更新前仍可能崩溃。重启会重做这一批，因此更新必须幂等；“至少一次扫描”是正常语义，不要依赖每行只访问一次。

如果 checkpoint 与业务更新能放在同一个数据库事务中，可以缩小这个窗口，但任务编排器、分片和外部读模型常让二者无法共享事务，幂等仍不可省略。

## 条件写保护在线更新

危险做法是根据几分钟前读到的 `status` 无条件覆盖 `state_code`。期间用户可能已经取消或完成订单。更安全的更新同时检查目标为空、源值或版本仍与观察一致：

```sql
UPDATE orders
SET state_code = :derived_state_code,
    version = version + 1
WHERE id = :id
  AND version = :observed_version
  AND state_code IS NULL;
```

影响行数为 0 不是可以忽略的“偶发失败”，而要分类：

- 目标已由在线应用正确填充：验证后标记 resolved。
- 源字段/版本变化但目标仍空：重新读取并按新值计算。
- 行被删除或超出范围：按业务删除语义处理。
- 新旧字段冲突：隔离并告警，不能让最后写入者获胜。

也可用一条基于当前行值的确定性 SQL 更新，减少读写窗口；但复杂规则、外部依赖和跨行聚合仍需显式版本控制。

## MySQL 的分批 UPDATE

MySQL 单表 `UPDATE` 支持 `ORDER BY` 和 `LIMIT`：

```sql
UPDATE orders
SET state_code = CASE status
  WHEN 'pending' THEN 10
  WHEN 'paid' THEN 20
  WHEN 'shipped' THEN 30
  WHEN 'cancelled' THEN 40
END
WHERE state_code IS NULL
  AND id <= :upper_bound
  AND status IN ('pending', 'paid', 'shipped', 'cancelled')
ORDER BY id
LIMIT :batch_size;
```

每次执行后提交，再继续直到影响行为 0。注意 MySQL 的 `LIMIT` 是“匹配行”上限，不一定等于实际改变行数；不要仅依靠计数推断完整性。为可复现进度，任务程序通常先选出稳定 ID 范围并记录边界，比仅循环无状态的 `UPDATE LIMIT` 更容易审计。

不要使用 `UPDATE IGNORE` 隐藏转换和唯一键错误；被忽略的行必须显式进入异常清单。

## PostgreSQL 的分批 UPDATE

PostgreSQL 没有直接的 `UPDATE ... LIMIT`。可以先在 CTE 中选取一小批稳定主键，再更新：

```sql
WITH batch AS (
  SELECT id
  FROM orders
  WHERE id > :last_scanned_id
    AND id <= :upper_bound
    AND state_code IS NULL
  ORDER BY id
  FOR UPDATE SKIP LOCKED
  LIMIT :batch_size
)
UPDATE orders AS target
SET state_code = CASE target.status
  WHEN 'pending' THEN 10
  WHEN 'paid' THEN 20
  WHEN 'shipped' THEN 30
  WHEN 'cancelled' THEN 40
END
FROM batch
WHERE target.id = batch.id
  AND target.state_code IS NULL
RETURNING target.id;
```

官方文档还展示了在同一个短事务内用 `ctid` 连接所选行的方式。`ctid` 是物理行位置，行更新或移动后可能改变，适合当前语句内定位，不适合写入持久 checkpoint、事件或外部任务表。

使用 `SKIP LOCKED` 能减少多个 worker 争抢，但被锁行可能被跳过；任务结束前必须做不带跳过语义的最终补扫和完整性验证。

## checkpoint 需要保存哪些状态

最小任务记录通常包含：

```text
job_id, job_type, rule_version
scope / shard / tenant
lower_bound, upper_bound, last_scanned_key
status: planned | running | paused | failed | verifying | completed
rows_scanned, rows_changed, rows_already_valid, rows_conflicted, rows_failed
batch_size, throttle_reason
started_at, heartbeat_at, finished_at
code_version, operator, approval_id
```

若采用 hash 分桶，每个 bucket 有独立 checkpoint；若一行冲突后仍推进主游标，必须把该业务键持久放入 retry/quarantine 集合。只保存一个 `last_id` 而丢弃异常键，会在“进度 100%”时留下永久空洞。

worker 使用租约和 fencing token 防止旧进程恢复后与新进程同时更新同一任务。心跳过期只表示可重新领取，不证明旧进程已经停止；每次写 checkpoint 时应检查租约代次。

## 多 worker：确定性分片优先于自由争抢

并行方式包括：

- 按租户、主键范围或 hash bucket 预先分片，每个 worker 独占一个范围。
- 使用任务表 + `FOR UPDATE SKIP LOCKED` 动态领取小块。
- 每个数据库 shard 独立运行并由全局控制面汇总。

确定性范围易于审计和续跑；动态领取在数据分布不均时利用率更好，但要处理租约与最终补扫。并发度不是越高越好：多个 worker 可能争用同一索引页、饱和日志和存储，导致吞吐反而下降。

同一行集使用一致的主键顺序可减少死锁。发生 deadlock/lock timeout 时，回滚小批、随机退避再重试；不要无上限立即重试。

## batch size 与速率必须反馈控制

固定“每批 10000 行”没有跨环境意义。行宽、索引数、触发器、磁盘和正常流量都会改变成本。控制器应观察：

- 业务接口 p95/p99 与错误率。
- 数据库 CPU、I/O、锁等待、活跃连接和日志写速率。
- MySQL history list/undo、PostgreSQL dead tuples/autovacuum。
- replica replay lag、CDC lag、broker backlog。
- 磁盘/WAL/binlog runway 和 checkpoint 压力。

控制策略示例：

```text
健康窗口连续 5 分钟 → batch size 或并发小幅增加
任一预警阈值 → 减半并延长间隔
业务 SLO、复制 lag 或磁盘达到停止阈值 → 暂停领取新批次
已在执行的小事务完成后退出，不强杀制造大回滚
```

调整要有上下限与冷却时间，避免指标轻微波动导致速度不停振荡。业务流量优先级高于回填完成日期。

## CDC、触发器与副作用

回填 UPDATE 会像普通写入一样进入 binlog/WAL，可能触发：

- CDC 把数亿条历史变化发往搜索和数仓。
- update trigger、审计表和 `updated_at` 被改写。
- 缓存逐键失效，造成回源风暴。
- “状态改变”监听器误发邮件、积分或 webhook。

在设计阶段决定这是“业务事件”还是“表示层补齐”。领域事件不应仅通过任意行变化猜测；可让消费者按 migration metadata 识别，或回填派生系统时使用独立重建通道。

不要为了减少 CDC 流量随意关闭 session binlog/WAL：这可能使副本、PITR 和下游永久缺失。任何过滤都必须由平台、恢复和数据 owner 共同评审，并有对账与重建方案。

## 索引与查询计划

回填选择条件如 `state_code IS NULL AND id <= upper_bound` 需要用执行计划验证。可能使用主键范围扫描，再在行上判断 NULL；也可能需要临时/部分索引，但新增索引本身有 DDL、空间和写放大成本。

不要只为了让一次回填快就永久保留低价值索引。若创建临时索引：

- 先估算构建时间、空间和在线 DDL 锁行为。
- 纳入 schema migration 流程，而不是在脚本里临时创建。
- 回填完成后观察正常查询是否需要，再通过独立变更删除。

执行计划要使用真实范围与数据分布；小测试库上的索引选择不能代表生产。

## PostgreSQL 的 bloat 与 autovacuum

PostgreSQL 更新产生旧行版本，由 `VACUUM` 回收以供重用；标准 `VACUUM` 通常可与业务读写并行，但也消耗 I/O。回填期间关注 `n_dead_tup`、最近 autovacuum、表/索引大小和 transaction age。

不要默认在每批后执行 `VACUUM FULL`：它重写表并需要 `ACCESS EXCLUSIVE` 锁。通常应让 autovacuum 正常工作，必要时由 DBA 基于证据调整表级参数或安排标准 `VACUUM`。长时间打开的读事务也会阻碍旧版本清理。

回填完成后统计分布可能明显变化，需要确认 `ANALYZE` 是否及时更新并重新检查 top query 计划。

## MySQL 的 undo、purge 与回滚

InnoDB 为 MVCC 和回滚保留 undo。长事务会阻止 purge 清理其他事务产生的旧版本，读查询重建旧版本的成本也会上升。

若大事务已经进入长时间 rollback，强制重启不会神奇取消成本，恢复后仍需处理回滚。预防方式是短事务、每批明确上限、lock/statement timeout、暂停开关和 canary，而不是事故发生后反复 kill。

回填不能通过降低持久性参数换吞吐，除非业务明确接受改变后的 RPO 且经过独立审批；性能比较必须在相同 durability 下进行。

## dry run、canary 与发布门禁

上线前分阶段：

1. **只读 dry run**：统计候选数、未知值、租户/分区分布，抽样计算预期结果。
2. **影子环境**：使用生产分布验证执行计划、日志量、bloat 和恢复。
3. **生产 canary**：一个低风险租户或窄 ID 范围，小批低速运行。
4. **分阶段扩量**：逐步增加范围、batch 或 worker，每次经过观察窗口。
5. **稳定运行**：自动限速、告警、on-call 与暂停权限就绪。
6. **最终补扫与验证**：处理冲突/隔离行，确认不变量后才能切新读路径。

dry run 必须使用和真实任务相同的过滤与映射代码，否则它只是另一套未验证逻辑。

## 验证不能只看 rows affected

至少包含：

- 范围覆盖：所有 `id <= upper_bound` 是否被扫描或有明确例外。
- 完整性：目标为空的剩余行数，按租户/分区分类。
- 等价性：`state_code` 是否和当前 `status` 映射一致。
- 异常集合：未知状态、条件冲突、删除和失败是否全部 resolved。
- 分块摘要：迁移前后或事实源/派生目标在同一水位比较。
- 业务旅程：新旧应用读写、回滚版本、缓存与下游均验证。
- 性能回归：正常接口、复制、CDC、备份和 autovacuum 恢复稳定。

先用 count 定位，再对差异分块和逐行下钻。任务 `completed` 应由独立验证门禁设置，不能由 worker “没有读到下一批”自行宣布。

## 回退通常是停止与前滚修正

回填一旦分批提交，无法用一个事务 `ROLLBACK` 撤销。预先定义：

- 立即暂停新批次的 kill switch。
- 已写值能否根据 `job_id/rule_version` 精确识别。
- 错误值是否可由权威源重新计算并条件覆盖。
- 对账、备份/PITR 的恢复点与允许数据损失。
- 已传播的 CDC/事件怎样用补偿或重建修复。

无条件把新列全部设回 NULL 可能删除在线应用写入的正确值。回退也必须有版本/来源条件。很多情况下最安全的是停止、修正规则、重新跑幂等前滚，而不是逆向大更新。

## 示例说明

运行 `node examples/database/30-online-backfill-model.mjs`，验证固定上界、数据库提交后 checkpoint 前崩溃的幂等续跑、在线更新条件冲突、异常集合与自适应暂停门禁。

- `examples/database/30-mysql-backfill-readiness.sql` 只读采集表规模、索引、InnoDB undo/purge、日志和复制压力信号。
- `examples/database/30-postgresql-backfill-readiness.sql` 只读采集 dead tuples、autovacuum、长事务、WAL 与复制延迟信号。

诊断脚本不执行真实回填；示例阈值也必须按生产 SLO 与容量基线重新制定。

## 上线检查清单

- 规则、不变量、权威源、upper bound 和异常策略已版本化。
- 在线新写已维护目标表示，旧应用兼容性已确认。
- 使用稳定 keyset/分桶，不用 OFFSET 或持久化 `ctid`。
- 每批是短事务，提交后才推进 checkpoint，重跑保持幂等。
- 条件写不会覆盖在线更新，0 affected 会分类并追踪。
- checkpoint、retry/quarantine、租约和 fencing 状态可恢复。
- canary 验证锁、日志、复制、CDC、触发器与下游副作用。
- 自适应限速有预警、暂停和恢复阈值，业务 SLO 优先。
- MySQL undo/purge 或 PostgreSQL dead tuples/autovacuum 有容量预算。
- 最终补扫不使用 `SKIP LOCKED`，所有异常都有 resolution。
- 独立验证不变量、覆盖率、分块摘要和业务旅程。
- 切读、停止旧写、contract 与错误前滚分别有门禁。

## 常见误区

### “加了 LIMIT 就一定安全”

还需要短事务提交、稳定顺序、索引、checkpoint、条件写、限速和最终验证。LIMIT 只控制行数，不控制每行成本。

### “受影响行数最终为 0，所以完成了”

过滤错误、权限变化、未知状态和被锁行都可能让它为 0。完成必须由独立不变量验证决定。

### “回填只改新列，不会影响线上”

每次更新仍会写日志、维护索引、产生 MVCC 旧版本，并可能触发 CDC、trigger、缓存和审计。

### “任务失败后从 last_id 继续即可”

若 checkpoint 早于提交推进会漏行；若条件冲突被跳过却没有 retry 集合，也会留下永久空洞。

### “多开 worker 就能线性加速”

日志、磁盘、热点索引页和锁会成为共享瓶颈。并发应由正常业务 SLO 和数据库压力反馈控制。

### “出现问题就把新列清空”

这可能删除在线应用写入的正确值。回退必须识别任务写入版本，通常优先暂停并前滚修正。

## 本课小结

- 大规模回填是长期在线任务，不是一条后台大 SQL。
- 先让在线写维护新表示，再固定本轮上界并回填历史数据。
- keyset/确定性分桶提供稳定范围，OFFSET 与持久化 `ctid` 不适合作断点。
- 小批短事务降低锁、日志、复制、bloat 和回滚风险。
- checkpoint 在提交后推进；崩溃窗口要求任务天然幂等。
- 条件写与版本检查防止陈旧计算覆盖用户的新写入。
- `SKIP LOCKED` 提高并发但可能跳行，结束前必须无跳过补扫。
- 自适应限速观察业务 SLO、日志、复制、CDC、undo/dead tuples 和磁盘。
- 回填可能触发 CDC、trigger 与用户副作用，必须预先分类其业务语义。
- 完成由独立不变量、异常集合和同水位对账决定，而非 rows affected。

## 官方资料

- [MySQL 8.4：UPDATE Statement](https://dev.mysql.com/doc/refman/8.4/en/update.html)
- [MySQL 8.4：Optimizing InnoDB Transaction Management](https://dev.mysql.com/doc/refman/8.4/en/optimizing-innodb-transaction-management.html)
- [MySQL 8.4：Undo Logs](https://dev.mysql.com/doc/refman/8.4/en/innodb-undo-logs.html)
- [MySQL 8.4：Optimizing InnoDB Redo Logging](https://dev.mysql.com/doc/refman/8.4/en/optimizing-innodb-logging.html)
- [PostgreSQL 18：UPDATE](https://www.postgresql.org/docs/18/sql-update.html)
- [PostgreSQL 18：Routine Vacuuming](https://www.postgresql.org/docs/18/routine-vacuuming.html)
- [PostgreSQL 18：VACUUM](https://www.postgresql.org/docs/18/sql-vacuum.html)
- [PostgreSQL 18：Cumulative Statistics System](https://www.postgresql.org/docs/18/monitoring-stats.html)
