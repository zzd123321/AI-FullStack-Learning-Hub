---
title: 数据库变更、在线 DDL 与安全发布
description: 使用 expand–migrate–contract 管理应用与 schema 兼容窗口，理解 MySQL online DDL、PostgreSQL concurrent index、锁、回填、约束验证、失败恢复和分片迁移
prev:
  text: ORM、数据库驱动与 Repository 边界
  link: /database/core/orm-drivers-repository-boundaries
next:
  text: 数据库测试、测试数据与 CI 发布门禁
  link: /database/core/testing-test-data-ci-release-gates
---

# 数据库变更、在线 DDL 与安全发布

::: tip 第一次学习只抓住四件事
- **必须理解**：表结构属于版本化代码；应用与数据库不一定同时发布，因此变更要保持一段兼容窗口。
- **必须会用**：先扩展后收缩——先增加兼容结构，再迁移读写和数据，最后删除旧结构。
- **必须完成**：写一份可重复执行、可在空库验证的 migration，并明确失败后的恢复方式。
- **可以后看**：大型表在线 DDL 工具、复制影响和长事务治理。
:::

应用上线可以滚动发布：一段时间内旧版本和新版本同时运行。数据库 schema 却通常是所有应用实例共享的。若一次迁移把 `status` 列直接重命名为 `state`，新代码也许能工作，但尚未重启的旧实例、后台任务和回滚版本会立即报错。

安全迁移的核心不是找到一条“在线 ALTER”语句，而是设计一个兼容协议：**先扩展 schema，让旧应用和新应用都能运行；再迁移数据和流量；确认所有旧依赖消失后，最后收缩旧结构。**

本课用 expand–migrate–contract 串联代码发布、DDL、回填、约束和清理，分别解释 MySQL 8.4 online DDL 与 PostgreSQL 18 concurrent index/constraint validation 的真实边界，并建立可观察、可暂停、可恢复的发布流程。

## 为什么数据库变更比应用发布难

一个迁移可能同时影响：

- 正在运行的多个应用版本。
- API 请求、消息消费者、定时任务和数据修复脚本。
- primary、replicas、分区与所有 shards。
- 索引、外键、视图、触发器、函数和 ORM 映射。
- 备份恢复、CDC、审计和数据仓库。

DDL 还可能获取强锁、扫描或重写整表、创建临时文件、生成大量 WAL/binlog，并让副本落后。即使语句在测试库只用 50 ms，生产表大小、长事务、并发写入、磁盘余量和缓存状态都不同。

因此每次数据库变更至少包含三个层面：

1. **逻辑兼容性**：旧代码、新代码和数据状态能否共存。
2. **物理执行代价**：锁、扫描、重写、空间、日志和副本影响。
3. **运维状态机**：如何观察、暂停、重试、回退和最终清理。

## 先给变更分类

| 类型 | 示例 | 主要风险 |
| --- | --- | --- |
| 元数据扩展 | 新增可空列、默认值 | metadata lock、版本兼容 |
| 索引变更 | 新增/删除索引 | 扫描、CPU/I/O、空间、失败残留 |
| 约束变更 | NOT NULL、CHECK、FK、UNIQUE | 全表验证、并发脏数据、锁 |
| 数据回填 | 给历史行计算新字段 | 写放大、锁、日志、复制延迟 |
| 类型/布局重写 | 改类型、字符集、主键 | 整表复制/重写、长时间双倍空间 |
| 破坏性收缩 | 删除列、表、索引 | 旧代码立即失败、不可逆数据丢失 |

同一 SQL 在不同版本、存储引擎、列定义、分区、外键和默认值下可能采用不同算法。变更评审不能只标注“ALTER TABLE”，必须写清目标数据库版本、预期算法、锁级别、是否重写、空间上限和失败表现。

## Expand–Migrate–Contract

假设要把订单的 `status` 文本迁移为更清晰的 `state_code`。

### Phase 1：Expand

先添加新列或新表，使它对旧代码无害：

```text
orders.status      仍存在、仍可读写
orders.state_code  新增，允许 NULL
```

此时发布兼容代码：

- 写入同时生成旧值和新值，或由单一规范值派生两者。
- 读取优先新列；新列为空时回退旧列。
- 记录 fallback 次数和双列不一致。

扩展阶段不要立即添加 `NOT NULL`，因为历史行还没有新值，旧应用也不知道必须写它。

### Phase 2：Migrate

用小批、可重试回填历史数据：

```text
WHERE id > :last_id
  AND state_code IS NULL
ORDER BY id
LIMIT :batch_size
```

每批是独立短事务，持久记录水位，并根据数据库负载、锁等待、日志量和复制延迟动态限速。回填完成后进行持续对账，而不是只查一次 `NULL = 0`。

随后逐步切换：

1. 新代码开始双写并兼容读取。
2. 回填历史数据。
3. 校验新旧值业务等价。
4. 读取切到新列，但保留 fallback 与指标。
5. 停止写旧列。
6. 观察足够窗口，确认没有旧调用方。

### Phase 3：Contract

只有满足清理门禁后才收缩：

- 所有生产、后台和应急回滚版本都不再依赖旧列。
- CDC、报表、导出、视图和脚本已迁移。
- 新约束已验证，回填与双写差异为零。
- 至少经历一个完整业务周期和回滚窗口。
- 备份与恢复流程认识新 schema。

再删除旧列、旧索引或兼容代码。Contract 是独立发布，不应与第一次启用新字段放在同一部署中。

## 兼容矩阵比迁移顺序更可靠

给每个阶段明确允许的应用版本：

| Schema 阶段 | 旧应用 v1 | 兼容应用 v2 | 新应用 v3 |
| --- | --- | --- | --- |
| S0 仅旧列 | 可运行 | 可运行，读旧列 | 不可运行 |
| S1 新列可空 | 可运行 | 双写/回退读 | 可读新列但需兼容 NULL |
| S2 已回填 | 可运行 | 双写并校验 | 可读新列 |
| S3 停写旧列 | 不可运行 | 可运行 | 可运行 |
| S4 删除旧列 | 不可运行 | 需不再引用旧列 | 可运行 |

发布系统应把 schema capability 当成依赖：应用启动或启用 feature flag 前检查 schema 至少达到要求；数据库 contract 前检查所有活跃应用版本都高于最低兼容版本。

迁移表不能只记录一个 `version=42`。长迁移应记录 `phase`、目标对象、开始时间、批次水位、校验结果、失败原因、负责人和可重试状态。

## 回填如何避免覆盖新写入

最危险的回填写法是“读取旧值、在应用计算、稍后无条件 UPDATE”。在读取和更新之间，在线请求可能已写入更准确的新值，回填会把它覆盖。

安全更新应带前置条件：

```sql
UPDATE orders
SET state_code = :derived_value
WHERE id = :id
  AND state_code IS NULL;
```

若新列允许后续修改，还应比较版本：

```text
UPDATE ... WHERE id = ? AND version = :observed_version
```

受影响行为 0 表示在线数据已经变化，回填应重新读取或跳过，而不是强制覆盖。

### 稳定批次边界

优先按主键/不可变时间做 keyset 扫描，不使用不断变化的大 OFFSET。批次要有：

- 最多行数和最大事务时长。
- statement/lock timeout。
- 全局速率与每 shard 速率。
- 复制延迟、磁盘和连接池熔断阈值。
- 幂等条件和可持久化 continuation token。

批量任务被取消后，已提交批次保留，未提交批次回滚；重启从水位附近重新扫描，并依靠 `IS NULL`/版本条件保证幂等。

### 不要用 sleep 代替反馈控制

固定每批 sleep 100 ms 无法适应高峰与低谷。控制器应根据近期 p95 请求延迟、锁等待、WAL/binlog 速率和 replica lag 调整批次或暂停。数据库保护阈值优先于“今晚必须跑完”。

## 双写不是免费保险

如果两列在同一行、同一事务内由一个 SQL 更新，原子性相对清晰；如果新旧模型跨表、跨库或跨服务，双写会遇到部分成功、乱序和重试。

设计双写时要明确：

- 哪个字段是 canonical source，另一个如何确定性派生。
- 两边不一致时读哪边、告警还是拒绝请求。
- 重试使用什么幂等键和版本。
- 删除、NULL、默认值和时区如何映射。
- 何时停止旧写，如何证明没有隐蔽旧写入者。

数据库 trigger 能覆盖部分遗漏写入者，但也隐藏成本和副作用，会影响复制、回填、调试与未来删除。若采用 trigger，它本身也需要版本、监控、失败语义和清理阶段，不能当作无需设计的捷径。

## 列重命名与类型变更应使用影子字段

直接 rename 让旧查询立即失败。更稳妥：

```text
新增 state_code
→ 兼容双写
→ 回填并校验
→ 新读路径
→ 停旧写
→ 删除 status
```

类型变更也类似。把 `VARCHAR` 金额直接改成 `DECIMAL` 可能重写整表，并在发现非法历史值时失败。影子列允许逐行解析、把非法值隔离到修复队列，并在切换前验证精度和范围。

字段名或类型变化还要检查：ORM prepared statement、序列化、CDC schema registry、BI 查询和缓存 payload。数据库成功只是迁移的一部分。

## 新增 NOT NULL 的安全路径

通用协议：

1. 新列先允许 NULL。
2. 新代码保证所有新写入非空。
3. 小批回填历史 NULL。
4. 持续查询/指标证明没有新 NULL。
5. 使用目标数据库支持的低影响验证路径。
6. 最后切换为真正 NOT NULL。

PostgreSQL 可先添加等价的 `CHECK (column IS NOT NULL) NOT VALID`，新写入立即受约束，历史数据稍后用 `VALIDATE CONSTRAINT` 检查；有效 CHECK 可帮助后续 `SET NOT NULL` 跳过重新扫描。VALIDATE 仍消耗 I/O 并获取相应锁，只是不会像直接强验证那样把所有成本塞进一次操作。

MySQL 是否重建、允许 concurrent DML 取决于具体列操作和版本；必须显式请求预期 `ALGORITHM`/`LOCK`，让不支持时失败，而不是悄悄回退成 COPY。

## 新增唯一约束的竞态

建立 UNIQUE 之前，先离线/在线检查历史重复不够：检查完成后到索引生效前仍可能出现新重复。

正确边界由数据库最终唯一索引建立过程提供。准备阶段可先：

- 修改应用，让新写入尽量遵守约束。
- 清理历史重复并建立确定性保留规则。
- 在低风险窗口构建唯一索引。
- 处理构建期间新冲突导致的失败。

PostgreSQL 可 `CREATE UNIQUE INDEX CONCURRENTLY`，成功后再将索引附加为约束。并发构建失败会留下 INVALID 索引，虽然它不用于查询，却仍可能带来更新维护开销；发布器必须识别并按 runbook 清理/重试，不能只因为 SQL 返回错误就认为没有残留。

## 新增外键：先执行，再验证历史

外键价值是把引用完整性放进数据库并发边界，但直接验证大表可能扫描并影响写入。

PostgreSQL 可先 `ADD CONSTRAINT ... FOREIGN KEY ... NOT VALID`：新插入/更新的行开始受约束，历史行稍后 `VALIDATE CONSTRAINT`。验证前要保证被引用列有唯一索引、引用列有适当索引，并评估 orphan 清理。

MySQL online foreign key 行为受 `foreign_key_checks` 和具体操作限制。生产中不应为追求 `INPLACE` 随意全局关闭外键检查；关闭期间产生的不一致不会凭空修复，应使用目标版本验证过的受控工具和维护协议。

## MySQL 8.4：INSTANT、INPLACE 与 COPY

### ALGORITHM 描述“怎么做”

- `INSTANT`：主要修改元数据，不扫描/重写每一行；MySQL 8.4 默认优先使用。
- `INPLACE`：避免旧式整表 COPY，但某些操作仍会重建/复制数据结构，例如修改 primary key。
- `COPY`：创建新表结构并复制数据，通常成本和锁影响最大。

“INPLACE”不等于“没有表重建”，“INSTANT”也不等于“没有 metadata lock”。要查目标版本中**具体操作**的支持矩阵。

显式算法是安全护栏：

```sql
-- 示例语义，须在同版本预演后由迁移系统执行：
ALTER TABLE orders
  ADD COLUMN state_code smallint NULL,
  ALGORITHM=INSTANT;
```

若不能 instant，语句失败并进入评审，而不是在生产意外采用更重算法。INSTANT 操作只支持默认锁策略；对 INPLACE 操作可用 `LOCK=NONE` 要求并发读写，不支持时同样让语句失败。

### “在线”仍有 metadata lock

InnoDB online DDL 在初始或结束阶段可能需要短暂独占 metadata lock，最终更新表定义时一定需要相应 MDL。一个开启事务后查询过目标表却长时间不提交的会话，可能让 DDL 等待；排队的 DDL 又可能让后续请求堆积。

所以即使预估执行 10 ms，也要：

- 迁移会话设置短 `lock_wait_timeout`，拿不到锁就失败重试。
- 发布前检查长事务、metadata lock 持有者和队列。
- 给 DDL 设置外层 deadline，客户端取消后确认服务端真实状态。
- 避免自动无限重试造成周期性流量尖峰。

### 在线 DDL 仍消耗资源

创建 secondary index 可允许 concurrent DML，但仍扫描数据、排序、写索引并使用临时空间。并发修改记录在 online alter log；若增长超过 `innodb_online_alter_log_max_size`，操作可能失败。临时目录/磁盘不足也会失败。

DDL 产生的 binlog 与副本执行成本可能让 replication lag 增大。应在 primary 和每个 replica 上观察 CPU、I/O、空间、日志、连接与延迟，并预留失败回滚产生的资源。

## PostgreSQL 18：锁、并发索引与约束验证

### ALTER TABLE 默认要谨慎看待

PostgreSQL `ALTER TABLE` 的不同子命令锁级别不同；除非文档明确说明，通常按可能取得 `ACCESS EXCLUSIVE` 评估。一个事务中组合多个子命令时，会采用其中最强的锁。

metadata-only 不代表拿锁容易。锁持有时间可能短，但等待锁期间会形成队列；若 DDL 放在包含其他业务操作的长事务中，锁会一直持有到事务提交。

迁移会话应设置较短 `lock_timeout` 和合理 `statement_timeout`，并把单个危险 DDL 放在最小事务边界。`CREATE INDEX CONCURRENTLY` 不能在 transaction block 内执行，迁移框架必须支持 non-transactional step 与失败恢复记录。

### CREATE INDEX CONCURRENTLY 的真实代价

普通 `CREATE INDEX` 会阻止表写入；`CONCURRENTLY` 允许 insert/update/delete 继续，但：

- 需要多阶段工作和两次表扫描。
- 要等待影响索引构建的事务和旧 snapshot。
- 通常比普通构建耗时和总工作更多。
- 同一张表一次只能有一个 concurrent index build。
- 失败可能留下 INVALID 索引。
- unique index 在构建未完全结束前就可能开始对其他事务报告唯一冲突。

在分区父表上不能直接并发构建整个 partitioned index；常见路径是父表 `ONLY` 建索引定义、逐分区 concurrent build，再 attach。这需要追踪每个分区状态。

### NOT VALID 与 VALIDATE 分离风险窗口

`NOT VALID` 不是“不执行约束”。对 CHECK/FK 而言，新写入通常开始检查，只是暂不扫描证明历史行。这样把强锁/扫描从“启用保护”中拆开。

验证仍可能很慢，也会读取大量数据。要设置进度、I/O 和锁监控，失败后修复历史坏行再重试。只有 `convalidated = true` 才能宣称历史数据全部满足。

## DDL 预演要复制什么

测试表只有 schema 没有生产数据分布，无法预测真实代价。预演环境应尽量接近：

- 相同数据库小版本、扩展、参数和存储类型。
- 相近表/索引大小、行宽、NULL/重复/倾斜分布。
- 相近写入速率、长事务与查询负载。
- 相同分区数、外键关系和副本拓扑。
- 足够磁盘，但同时设置生产等价容量告警。

记录 DDL 每阶段时间、峰值空间、WAL/binlog、锁等待、请求延迟、复制追赶时间和取消后的状态。用这些数据制定生产 deadline 和容量，而不是用开发库耗时乘一个猜测系数。

## 发布前检查与执行门禁

### 变更 manifest

每次迁移应有机器可读清单：

```text
migration_id / checksum
目标 database、schema、table、shard 集合
要求的数据库版本与当前 schema capability
预期 algorithm、lock、rewrite 和最大耗时
空间/WAL/binlog 预算
前置校验与成功后校验
暂停/取消条件
roll-forward、回退和人工恢复 runbook
```

checksum 防止同一个 migration ID 在不同环境对应不同 SQL。已经开始执行的迁移文件不可就地改写；修复使用新 migration ID。

### 开始前

- 确认最近可恢复备份和 PITR 日志链健康。
- 检查长事务、prepared transaction、metadata/relation lock。
- 确认磁盘、临时空间、WAL/binlog 和 replica 容量。
- 暂停冲突的批处理、归档和其他 DDL。
- 确认应用版本兼容，feature flag 尚未提前启用。
- 选择业务低风险窗口，但不依赖“凌晨一定没流量”。

### 执行中

- 每个阶段有 deadline 与 heartbeat。
- 监控请求 SLO、锁队列、连接池、资源和复制延迟。
- 超阈值自动暂停回填；DDL 取消要确认数据库端实际结束。
- 分片分批 canary，不同时冲击全部节点。
- 日志记录目标对象和阶段，不输出敏感行数据。

### 执行后

- 检查 schema、索引 valid/visible 状态和 constraint validation。
- 用代表性参数验证执行计划，但防止新索引引发回归。
- 检查 replica 全部追上且 schema 一致。
- 持续对账新旧字段，观察至少一个业务周期。
- 更新恢复 runbook、数据字典和下一个 contract 门禁。

## 失败后优先 roll forward

DDL 的事务语义因数据库和操作而异，外部 online-schema-change 工具还可能留下影子表、触发器或迁移元数据。失败后不要机械执行反向 DDL。

先识别实际状态：

- DDL 尚在等待锁、正在运行、已被取消还是已提交？
- MySQL 是否留下临时资源或 online log 压力？
- PostgreSQL 是否留下 INVALID index？
- 部分 shards/partitions 是否已成功，其他失败？
- 新应用是否已经开始依赖新 schema？

扩展变更通常优先保留并修复/重试（roll forward），因为立即删除新列可能比原失败更危险。只有在兼容矩阵证明旧 schema 仍受所有活跃代码支持时，才考虑回退结构。

## 删除列、表和索引的两阶段防护

破坏性 contract 前先“逻辑删除”：

1. 应用停止读取/写入。
2. 权限或 telemetry 证明无访问。
3. 对旧对象重命名/屏蔽是否安全需按数据库评估；重命名本身也会破坏隐蔽调用方。
4. 等待回滚窗口、备份周期和业务周期。
5. 独立审批后物理删除。

删除索引前先证明没有关键计划依赖它。MySQL invisible index 可用于受控观察，PostgreSQL 没有完全等价的通用 invisible index 开关，不能用全局禁用扫描方式在生产随意模拟。即使认为索引冗余，也要考虑 FK、唯一约束和少见报表。

本课程示例不提供可直接执行的 DROP/TRUNCATE 语句。

## 多分片与多租户迁移

在 64 个 shards 同时跑 DDL，会同时放大 CPU、I/O、日志、备份和故障风险。使用分批 rollout：

```text
预演 shard
→ 1 个 canary shard
→ 少量低风险 shard
→ 分批扩大
→ 全量校验
```

目录记录每个 shard 的 schema capability。应用路由到旧 shard 时只能使用旧能力；只有所有目标 shard 达到阶段后，才能全局启用新查询。

失败时不要只存“完成 37/64”。要记录每个 shard 的 migration checksum、phase、开始/结束、数据库位置、索引/约束状态和错误。重试必须只作用于未完成或可恢复状态。

## 可观测性

### 兼容性

- 活跃应用/worker 版本与最低 schema capability。
- 新字段 fallback read 次数、双写不一致和历史 NULL。
- 旧列读写、旧事件 schema 和旧报表访问次数。

### DDL 与回填

- DDL 当前 phase、耗时、锁等待和 blocker。
- 表扫描/索引构建进度、临时空间、CPU 与 I/O。
- 回填水位、rows/s、冲突跳过和预计完成时间。
- WAL/binlog 速率、replica lag 与恢复时间。

### 结果

- schema/checksum 在 primary、replica、shard 间一致。
- PostgreSQL invalid indexes、unvalidated constraints。
- MySQL metadata lock pending 与 online DDL 失败原因。
- 新旧值不变量、查询计划和接口 SLO 回归。

迁移完成的定义不是“命令退出码 0”，而是 schema 生效、数据验证、所有节点追上、应用 SLO 正常并且兼容清理条件可度量。

## 示例说明

### 兼容发布与回填状态模型

运行：

```bash
node examples/database/22-schema-migration-model.mjs
```

脚本只在内存中验证：

- schema 阶段与应用版本的兼容矩阵。
- 条件回填不会覆盖已经发生的新写入。
- 数据未对账或旧应用仍活跃时禁止 contract。
- 分片迁移只有全部达到 required capability 才能启用全局功能。

### MySQL 8.4 只读诊断

`examples/database/22-mysql-ddl-readiness.sql` 检查 online DDL 参数、长事务、metadata lock 等待和大表容量，不执行 ALTER。

### PostgreSQL 18 只读诊断

`examples/database/22-postgresql-ddl-readiness.sql` 检查长事务、relation lock、index build 进度、INVALID index 和未验证约束，不执行 DDL。

## 上线检查清单

### 设计

- 变更被拆成 expand、migrate、contract 独立阶段。
- 兼容矩阵覆盖 Web、worker、脚本、CDC 和回滚版本。
- 明确 canonical 字段、双写、NULL、删除和冲突语义。
- contract 有可观测门禁，不与首次启用新结构同批。

### 物理执行

- 在相同数据库版本和近似数据/负载下预演。
- 明确算法、锁、扫描/重写、峰值空间和日志预算。
- MySQL 显式请求预期 ALGORITHM/LOCK，拒绝意外降级。
- PostgreSQL concurrent/transactional step 被迁移框架正确区分。
- DDL 与回填有 lock/statement/global deadline。

### 数据迁移

- 回填按稳定键小批、幂等、可续跑并带条件更新。
- 在线新写入先满足新约束，再处理历史数据。
- 数据校验持续运行，包含业务等价而不只 NULL 数量。
- 限速根据 SLO、锁、日志和 replica lag 反馈控制。

### 发布与恢复

- migration ID/checksum、阶段和每 shard 状态持久记录。
- 最近备份/PITR 健康，失败状态与 roll-forward runbook 明确。
- canary 后分批扩展，不同时冲击全部分片。
- 取消后确认数据库真实状态和残留对象。
- 旧对象物理删除经过独立观察窗口与审批。

## 常见误区

### “MySQL ALGORITHM=INSTANT，所以没有锁”

元数据修改仍需 metadata lock；长事务可能让短 DDL 等待并形成请求队列。

### “INPLACE 就不会复制或重建数据”

INPLACE 是算法类别，不保证所有操作都不重建。例如修改 InnoDB primary key 仍会大幅重组数据。

### “CREATE INDEX CONCURRENTLY 不影响线上”

它仍扫描表、消耗 I/O/CPU、等待事务，耗时通常更长；失败可能留下 INVALID index。

### “NOT VALID 表示约束完全没生效”

PostgreSQL CHECK/FK 的新写入通常开始受约束，只是历史行尚未完整验证。必须跟踪 `convalidated`。

### “回填脚本可以无条件覆盖，反正数据来源一样”

在线请求可能在回填读取后更新新字段。必须使用 `IS NULL` 或版本前置条件避免覆盖新值。

### “所有实例部署完成就能删除旧列”

后台任务、应急回滚镜像、BI、CDC 和脚本仍可能依赖。Contract 需要真实访问指标和完整业务周期。

### “迁移失败，执行反向 SQL 就能回滚”

实际 DDL 可能已提交、部分 shard 成功或留下 invalid/影子对象，新代码也可能开始依赖。先识别状态，通常优先 roll forward。

## 本课小结

- 数据库安全发布是兼容协议、物理执行和运维状态机的组合，不只是一条 DDL。
- expand–migrate–contract 让旧新应用共存，并把不可逆清理推迟到证据充分之后。
- 回填必须小批、幂等、可续跑并带条件更新，避免覆盖在线新写入。
- MySQL INSTANT/INPLACE 仍可能等待 metadata lock 或消耗大量资源，显式算法用于阻止意外降级。
- PostgreSQL concurrent index 多阶段扫描且可能留下 INVALID 状态；NOT VALID/VALIDATE 可拆分新写保护与历史扫描。
- 列重命名、类型变化、NOT NULL、UNIQUE 和 FK 都应按兼容窗口设计，而不是直接强改大表。
- DDL 预演要复制数据规模、分布、并发和副本环境，并记录空间、日志与追赶时间。
- 迁移必须有 checksum、capability、每 shard phase、deadline、暂停条件和恢复 runbook。
- Contract 是独立、延迟、可审计的破坏性阶段；完成标准包含数据、节点与应用验证。

## 官方资料

- [MySQL 8.4：InnoDB and Online DDL](https://dev.mysql.com/doc/refman/8.4/en/innodb-online-ddl.html)
- [MySQL 8.4：Online DDL Operations](https://dev.mysql.com/doc/refman/8.4/en/innodb-online-ddl-operations.html)
- [MySQL 8.4：Online DDL Failure Conditions](https://dev.mysql.com/doc/refman/8.4/en/innodb-online-ddl-failure-conditions.html)
- [MySQL 8.4：Online DDL Limitations](https://dev.mysql.com/doc/refman/8.4/en/innodb-online-ddl-limitations.html)
- [MySQL 8.4：Performance Schema Lock Tables](https://dev.mysql.com/doc/refman/8.4/en/performance-schema-lock-tables.html)
- [PostgreSQL 18：ALTER TABLE](https://www.postgresql.org/docs/18/sql-altertable.html)
- [PostgreSQL 18：CREATE INDEX](https://www.postgresql.org/docs/18/sql-createindex.html)
- [PostgreSQL 18：Explicit Locking](https://www.postgresql.org/docs/18/explicit-locking.html)
- [PostgreSQL 18：Progress Reporting](https://www.postgresql.org/docs/18/progress-reporting.html)
