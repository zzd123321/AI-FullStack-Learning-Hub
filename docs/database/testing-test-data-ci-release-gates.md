---
title: 数据库测试、测试数据与 CI 发布门禁
description: 使用真实数据库引擎、确定性测试数据、迁移矩阵、并发调度、幂等与恢复验证，建立从接口契约到生产发布的数据库 CI 门禁
prev:
  text: 数据库变更、在线 DDL 与安全发布
  link: /database/schema-migrations-online-ddl
next:
  text: Redis 与缓存分层导航
  link: /database/redis/
---

# 数据库测试、测试数据与 CI 发布门禁

接口联调成功，只证明一条请求在某个环境、某组数据和某个时刻走通。它没有证明空值、重复请求、并发提交、旧 schema、连接复用、故障恢复或数据库升级仍然正确。

数据库测试的目标不是追求 SQL 行覆盖率，而是验证业务不变量在真实数据库语义、失败和演进中仍成立。本课建立从纯函数、repository、迁移、并发、消息到恢复的分层测试体系，并把高风险结果转换成发布门禁。

## 测试对象不是“数据库”，而是可观察契约

先从接口行为写出可判定契约：

```text
POST /payments 使用同一 idempotencyKey 重试：最多产生一笔扣款
两个请求并发购买最后一件库存：最多一个成功，库存永不为负
创建订单返回成功：订单、明细、幂等记录和 outbox 同时存在
列表游标翻页：无重复、无遗漏，排序键相同时由 id 稳定决胜
租户 A：无法读取、修改或通过错误推断租户 B 的行
```

这类断言比“调用了 repository.save 一次”更有价值。后者锁定实现细节，却可能在真实数据库中仍违反唯一性、隔离或时间语义。

## 分层测试：每层发现不同问题

| 层级 | 运行对象 | 主要发现 |
| --- | --- | --- |
| 纯领域测试 | 映射、金额、状态机、canonical form | 规则与边界值错误 |
| SQL/repository 集成测试 | 应用 + 真实目标数据库 | SQL 方言、类型、约束、驱动行为 |
| 迁移测试 | 历史 schema → 当前 schema | 升级路径、兼容矩阵、存量坏数据 |
| 并发测试 | 多个独立连接 + 受控时序 | 丢失更新、写偏差、锁与重试错误 |
| 组件链路测试 | 数据库、CDC/broker、缓存/读模型 | 重复、乱序、水位和最终一致性 |
| 恢复测试 | 备份、日志、应用验证 | RPO/RTO 与恢复后的业务正确性 |
| 性能/容量测试 | 生产特征数据与工作负载 | 计划回归、尾延迟、资源上限 |

不是每次提交都运行完整灾难演练。关键是分层安排频率，并且任何层都不能被大量快速单元测试“抵消”。

## 为什么 SQL 不能只用 mock 测

mock repository 可快速验证服务编排，但它通常不会真实模拟：

- `NULL` 三值逻辑、collation、时区和精确数值。
- 唯一键、外键、延迟约束和错误码。
- MySQL/PostgreSQL 的 upsert、affected rows 与 `RETURNING` 差异。
- 隔离级别、行锁、deadlock 和 serialization failure。
- 驱动将 `BIGINT`、`DECIMAL/NUMERIC`、JSON、时间映射成什么语言类型。
- optimizer、索引、统计信息和真实执行计划。

因此 mock 只能验证“应用以为数据库会怎样”，真实引擎测试才验证数据库实际怎样。核心 repository 查询至少要在支持的精确数据库版本上运行。

若生产只支持 MySQL，不必为了“通用”强迫所有测试通过 PostgreSQL；若产品声称双数据库兼容，就必须把两者都纳入独立兼容矩阵，不能用一个内存数据库替代。

## 测试环境要匹配哪些生产特征

最低限度锁定：

- 数据库产品、主/小版本与扩展。
- 字符集、collation、时区、SQL mode 和隔离级别。
- schema migration 版本与关键参数。
- 驱动、连接池、代理/transaction pooling 模式。
- runtime 数据库角色、RLS/权限，而不是 superuser。

容器或临时实例有助于一致性，但“用了容器”不代表环境等价。镜像 tag 漂移、默认配置不同、缺少代理和扩展，仍会让 CI 与生产语义分叉。记录镜像 digest/版本并在测试开始时查询服务器实际配置。

## 隔离策略：每个测试必须拥有清晰边界

常见方案：

### 每个测试一个事务，结束时回滚

适合单连接、只产生事务内数据库副作用的 repository 测试，速度快。但存在边界：

- 被测代码若自行提交，外层回滚可能失效或改变真实行为。
- 多连接并发测试看不到未提交 fixture，无法共享同一测试事务。
- CDC、邮件、HTTP 和缓存副作用不随数据库回滚。
- 连接池若把事务绑定到错误连接，测试可能得到假结果。
- DDL 是否回滚取决于数据库和语句。

### 每个 worker 一个数据库或 schema

适合并行测试、迁移和多连接场景。数据库/schema 名包含 run ID 和 worker ID，创建、迁移、测试、销毁都有 owner 与超时清理。schema 隔离仍要注意全局对象、extension、role、database-level setting 和共享连接池。

### 每个 suite 一个实例

隔离最强，可测试数据库级设置、升级和恢复，但启动成本高。适合迁移、扩展、权限和故障测试，不必用于每个纯查询测试。

测试框架必须在开始前验证目标名称、环境标签和权限，绝不能根据默认连接字符串清空未知数据库。

## MySQL 与 PostgreSQL 的回滚边界不同

MySQL 的许多 DDL 会在执行前后隐式提交，不能假设外层 `ROLLBACK` 能清理 `CREATE TABLE/ALTER TABLE`。`CREATE TEMPORARY TABLE` 不触发该隐式提交，但表的创建本身仍不可回滚，表会留到 session 结束；其 InnoDB 数据 DML 可以回滚。

PostgreSQL 的许多 DDL 可以放进事务，临时表还支持 `ON COMMIT` 行为。但并非所有运维命令都适合事务，扩展和外部系统也可能有自己的副作用。迁移测试仍应在可销毁环境完整运行，而不是依赖某条 DDL “大概能回滚”。

`SAVEPOINT` 只回滚当前数据库事务的一部分，不会撤销已发送的消息或 HTTP 请求。嵌套应用事务通常由 savepoint 模拟，不等于真正的独立嵌套事务。

## 测试数据应确定、最小且有语义

好的 fixture 不是复制一大份匿名 JSON，而是明确表达测试条件：

```js
orderFactory({
  tenantId: 'tenant-a',
  status: 'PAID',
  totalCents: 12900,
  createdAt: '2026-07-16T00:00:00.000Z',
});
```

原则：

- 默认值固定，调用者只覆盖与本测试有关的字段。
- 时间由 fake clock/显式参数提供，不依赖“现在”。
- ID 稳定或由有 seed 的生成器产生，失败可复现。
- fixture 通过公开写路径还是直接 SQL 要明确；前者验证更多，后者建立边界场景更精确。
- 每个测试自己创建数据，不依赖前一个测试的执行顺序。
- 断言按业务键查询，不依赖自增 ID 恰好从 1 开始。

“最小”不等于只测普通值。需要专门覆盖边界矩阵：

- `NULL`、空字符串、缺失字段和默认值。
- 0、负数、最大精度、四舍五入和多币种。
- Unicode、emoji、大小写、重音、尾随空格和 collation 冲突。
- UTC 跨日、夏令时、本地日期与时间精度截断。
- 相同排序键、空页、最后一页和游标已删除。
- 唯一键重复、外键缺失、未知枚举和旧 schema payload。
- 热点租户、大行、JSON 缺键和最大允许长度附近。

## 禁止直接复制生产个人数据

生产快照可能包含姓名、手机号、token、支付信息和租户机密。即使测试集群“只在内网”，复制也扩大了访问面、保留期和泄漏风险。

优先使用合成数据。确需生产分布时，必须经过审批和可验证脱敏：

- 保持需要测试的基数、偏斜和字段相关性。
- 对相同值做一致映射，才能保留 join/唯一性关系。
- 移除密钥、认证材料和不需要的列。
- 防止小群体、稀有组合或自由文本重新识别个人。
- 规定访问、审计、地域、保留与自动销毁。

简单把姓名替换成 `***` 可能破坏长度、collation 和唯一性，既不安全也失去测试价值。

## repository 契约测试要断言什么

以订单分页为例：

- 相同过滤条件返回正确租户与状态。
- `ORDER BY created_at DESC, id DESC` 在并列时间下稳定。
- 下一页游标使用最后一行的完整排序键。
- `NULL` 排序、时区和精度与 API 契约一致。
- 列表查询 SQL 次数有上限，防止 N+1。
- 空结果不是错误，重复/非法游标得到明确响应。
- 64 位 ID、精确金额和时间经过驱动后没有精度损失。

避免快照整个 ORM 对象或完整 SQL 字符串；无关别名或格式变化会制造脆弱测试。应断言结果、调用次数上限、关键查询形状和业务不变量。

## 约束的正向和反向测试

数据库约束是可执行业务边界，测试至少包含：

- 合法行可以写入。
- `NOT NULL/CHECK/UNIQUE/FOREIGN KEY` 的非法行被拒绝。
- 错误能映射成稳定应用错误，而不是把数据库内部消息直接暴露给前端。
- 事务失败后连接被完整 rollback，可以安全归还池。
- deferred constraint 在预期时点检查。

断言 SQLSTATE/数据库错误码和约束名通常比完整错误文本稳定；错误文本可能随版本、语言和驱动改变。不要只断言“抛了异常”，否则连接断开也可能让测试假通过。

## 迁移测试必须覆盖“从哪里升级”

只在空数据库运行全部 migration 能发现语法问题，却发现不了真实升级问题。至少测试：

1. **fresh install**：从空库执行到最新 schema。
2. **supported upgrade**：从每个仍可能在线的旧版本升级到最新。
3. **production-shaped data**：包含 NULL、重复候选、超长值和历史非法值。
4. **expand/contract compatibility**：旧应用 + 新 schema、新应用 + 过渡 schema 的矩阵。
5. **restartability**：在允许的失败点中断后，能识别状态并安全续跑/人工恢复。
6. **post-migration invariants**：约束、数据等价、索引、权限和查询计划。

向下 migration 不是唯一回退证明。生产 DDL、数据回填和新写可能不可逆，更重要的是旧应用是否能在 expand schema 上运行、备份恢复是否可行，以及何时关闭回退资格。

migration 文件一旦在共享环境执行，应视为不可变历史；修改旧文件会让“新建数据库”和“已升级数据库”得到不同 schema。修正使用新的 migration，并检测文件 checksum 漂移。

## 并发测试必须使用独立连接和受控屏障

两个异步函数同时启动不保证发生目标交错。并发测试应明确时间线：

```text
connection A: BEGIN → 读取库存 1 → 到达 barrier
connection B: BEGIN → 读取库存 1 → 到达 barrier
释放 barrier
A/B 同时执行条件扣减并提交
断言：一个成功、一个冲突、最终库存 0
```

使用独立物理连接、唯一测试 run ID、statement/lock timeout 和最终清理。不要用 `sleep(100)` 猜测调度；机器负载变化会造成 flaky test。用 barrier、latch、数据库 advisory coordination 或可观察锁状态控制顺序。

并发测试至少覆盖：

- 乐观版本条件与 lost update。
- 唯一键竞争和同幂等键并发。
- deadlock 后整个事务重试。
- PostgreSQL serialization failure（SQLSTATE `40001`）重试。
- 锁等待超时、连接取消与池中连接恢复。
- 多租户上下文在连接复用时不泄漏。

测试结束不能留下未提交事务或永久等待会话，所有等待都有比 CI job 更短的超时。

## 重试测试要验证“整个事务”，不是最后一条 SQL

serialization failure 或 deadlock 通常意味着当前事务已失败，应 rollback 并从事务入口重新执行。重试函数需要：

- 只重试明确可重试的错误码。
- 每次使用新事务/有效连接状态。
- 有最大次数、指数退避和抖动。
- 业务请求使用稳定幂等键。
- 外部副作用在 commit 后或通过 outbox 传播。
- 达到上限后返回可观察失败，不无限循环。

测试要注入“第一次可重试失败、第二次成功”，再验证数据库只有一次结果、outbox 只有一个事件；也要测试一直失败后停止。

错误分类应由数据访问层规范化：PostgreSQL serialization failure 使用 SQLSTATE `40001`、deadlock 使用 `40P01`；MySQL deadlock 常见 error number 为 1213，并可能携带 SQLSTATE `40001`。锁等待超时是否重试取决于语句是否幂等、事务状态和业务截止时间，不能把所有 timeout 一概重试，也不要匹配易变化的错误文本。

## 未知提交结果必须单独测试

数据库可能已经 `COMMIT`，但确认包在网络中丢失。应用看到超时，不能安全推断事务失败。测试应模拟：

1. 服务端提交成功。
2. 客户端收到连接中断/timeout。
3. 同一 idempotency key 重试。
4. 通过唯一键读取第一次结果，而不是再次扣款。

仅在 `COMMIT` 前注入异常，无法覆盖最危险的未知结果窗口。

## CDC、Outbox、缓存与读模型测试

组件链路需要验证的不只是“最终收到一条消息”：

- 业务变化与 outbox 是否同事务。
- relay publish 后、标记前崩溃是否产生可接受重复。
- consumer inbox 与业务副作用是否同事务。
- 乱序、版本缺口、poison event 和重放。
- schema 新字段、未知枚举和旧消费者兼容。
- 缓存删除失败、TTL、冷启动、击穿保护和回源限流。
- 事实源与读模型在共同水位的对账。

这些测试可使用受控 fake broker 测状态机，也需要较低频率的真实 broker/CDC 兼容测试。fake 能制造精确故障，真实组件能发现协议与配置差异，两者互补。

## 安全与租户隔离测试

使用真实 runtime role，而不是 owner/superuser：

- 无 tenant context 时拒绝访问。
- tenant A 读、写、upsert、批处理均不能触及 B。
- 唯一键/外键错误不会泄漏另一个租户是否存在。
- 事务失败和连接复用后 session context 已重置。
- 只读副本、后台任务和管理接口遵守各自权限。
- migration role 与 runtime role 权限严格分离。

安全测试应以“尝试越权并被拒绝”为主，不能仅检查 GRANT 配置看起来正确。

## 查询性能回归测试的正确粒度

CI 小数据集无法证明生产性能，但可以捕获明显退化：

- 关键列表的数据库调用次数上限，防 N+1。
- 目标查询存在可用索引和合理访问形状。
- 迁移后 top query 的计划特征没有从索引点查变成无界全扫。
- 返回行估计与实际数据分布没有数量级偏差。

不要逐字 snapshot 完整执行计划：cost、节点细节和统计随版本/数据变化，容易制造无意义失败。断言稳定特征，并在生产特征环境比较真实 p95/p99、资源和计划。

`EXPLAIN ANALYZE` 会真实执行语句；对写语句必须在专用测试环境和可控事务中使用，不能把“只看计划”误认为只读。

## 备份存在不等于恢复通过

定期门禁应从真实备份链恢复到隔离环境，并验证：

- 目标时间点、schema version 和日志连续性。
- 表数、关键 count、分块摘要和业务不变量。
- 应用以 runtime role 启动并完成关键旅程。
- sequence/identity、extension、collation、权限和加密密钥。
- CDC/slot、缓存和下游按正确顺序重建。
- 实测 RPO/RTO 达标。

逻辑导出工具能成功退出只证明导出完成，不证明文件可在目标版本、权限和扩展条件下恢复。

## CI 门禁按风险分层

```mermaid
flowchart LR
  P["每个提交"] --> U["领域 + SQL/repository + fresh migration"]
  U --> M["合并前：历史升级 + 并发 + 权限"]
  M --> N["每日：CDC/缓存 + 生产特征计划"]
  N --> R["定期：恢复 + 故障 + 容量"]
  R --> D["发布：兼容矩阵与证据签核"]
```

发布的硬门禁可以包括：

- fresh 与所有受支持升级路径通过。
- repository 契约、约束反向测试和 runtime role 权限通过。
- 关键并发不变量与可重试错误处理通过。
- schema/app expand-contract 兼容矩阵完整。
- 数据回填 dry run 和等价验证通过。
- 备份恢复证据仍在有效期内。
- top query/接口没有未解释的计划或尾延迟回归。

测试失败不能用“重跑直到绿”绕过。若确认 flaky，先隔离发布风险、保留失败证据并修复同步/隔离根因；简单提高重试次数会隐藏真实竞争。

## 测试报告必须足以复现

失败产物至少记录：

- commit、migration checksum、数据库/驱动/镜像精确版本。
- server settings、隔离级别、时区、collation 和 runtime role。
- 随机 seed、fixture 业务键和 worker/run ID。
- 各连接的有序事件时间线、SQLSTATE/错误码和 timeout。
- 最小必要 SQL、参数类别和脱敏后的计划。
- 数据库日志、锁证据和容器/实例保留位置。

不要把密码、完整连接串、token 或生产 PII 上传为 CI artifact。失败证据也受最小权限和保留期约束。

## 与前端联调的连接

前端看到的很多“偶现问题”实际上需要数据库契约测试：

- 连点两次按钮：幂等键是否防止重复订单。
- 提交后立即刷新：读己之写路径还是最终一致读模型。
- 同时编辑：版本冲突是否返回 409，而不是静默覆盖。
- 游标分页加载更多：并发插入时是否稳定。
- 金额和 64 位 ID：JSON 序列化是否丢精度。
- 日期筛选：浏览器时区与数据库 UTC 边界是否一致。

将这些联调案例固化成 API + 真实数据库测试，才能从人工发现升级为持续门禁。

## 示例说明

运行 `node examples/database/31-database-ci-gate-model.mjs`，验证发布门禁缺证据时拒绝、并发条件更新防超卖、可重试事务从入口重跑和稳定幂等键。

- `examples/database/31-mysql-transaction-test.sql` 只在 session-private InnoDB 临时表上演示 fixture、savepoint 与 DML rollback；临时表创建本身不随 rollback 消失，session 结束自动清理。
- `examples/database/31-postgresql-transaction-test.sql` 在事务内创建 `ON COMMIT DROP` 临时表，演示 savepoint、转账不变量和完整 rollback。

两份 SQL 都不会触碰永久业务表，但仍应只在专用学习/测试连接运行。

## 上线检查清单

- 测试断言业务不变量和 API 契约，而非只断言 mock 调用。
- 核心 SQL 在目标数据库精确版本、驱动和 runtime role 上执行。
- 测试隔离策略覆盖 DDL、多连接和外部副作用边界。
- fixture 固定时间与 seed，包含 NULL、精度、Unicode、时区和冲突。
- 不直接复制生产 PII；脱敏保留必要分布且可验证。
- fresh install、所有支持升级路径和 expand/contract 矩阵通过。
- 并发测试使用独立连接与 barrier，不用 sleep 猜时序。
- retry 从事务入口开始，只处理明确错误码，并保持幂等。
- 未知 commit、outbox 重复、CDC 乱序和缓存故障均有覆盖。
- runtime role 的租户隔离、连接复用和错误侧信道经过反向测试。
- 恢复测试验证应用旅程与不变量，而不只验证备份文件存在。
- 报告记录版本、seed、时间线和错误码，不泄漏凭据/PII。

## 常见误区

### “repository 已经 mock 了，不需要数据库”

mock 不会真实执行 SQL 方言、约束、类型、隔离和驱动映射。它适合服务编排，不替代集成测试。

### “每个测试最后 ROLLBACK 就绝对干净”

MySQL DDL 隐式提交、多连接、被测代码自行 commit，以及消息/缓存副作用都会越过外层回滚。

### “并发启动两个 Promise 就是并发测试”

没有 barrier 和连接证据，目标交错可能从未发生。测试绿不能证明竞争路径正确。

### “随机数据覆盖面更广”

没有 seed 和失败缩减，随机失败难以复现；纯随机还可能长期碰不到关键边界。应把显式边界与可复现生成结合。

### “迁移在空库通过就能上线”

真实旧 schema、存量非法值、活跃旧应用、表规模和锁行为都没有被验证。

### “备份任务成功，所以恢复能力通过”

只有实际恢复、应用启动、业务不变量和 RPO/RTO 测量才能证明恢复能力。

## 本课小结

- 数据库测试验证可观察业务契约，而不是 SQL 行数或 mock 调用。
- 纯领域、真实 repository、迁移、并发、组件链路、恢复和性能层各自不可替代。
- 测试环境需匹配产品版本、配置、驱动、代理和 runtime 权限。
- 事务回滚隔离有 DDL、多连接、commit 和外部副作用边界，MySQL/PostgreSQL 不同。
- fixture 要确定、最小、有语义，同时显式覆盖 NULL、精度、Unicode、时区和冲突。
- 迁移测试必须从所有支持的历史 schema 升级，并验证应用兼容矩阵。
- 并发测试用独立连接和 barrier 固定时序，重试必须从整个事务入口开始。
- 未知提交结果依赖稳定幂等键与唯一约束确认第一次结果。
- CDC、缓存、权限、恢复与计划回归都要进入不同频率的 CI 门禁。
- 失败证据应可复现且脱敏，不能以反复重跑掩盖 flaky 或真实竞争。

## 官方资料

- [MySQL 8.4：START TRANSACTION、COMMIT 与 ROLLBACK](https://dev.mysql.com/doc/refman/8.4/en/commit.html)
- [MySQL 8.4：Statements That Cause an Implicit Commit](https://dev.mysql.com/doc/refman/8.4/en/implicit-commit.html)
- [MySQL 8.4：CREATE TEMPORARY TABLE](https://dev.mysql.com/doc/refman/8.4/en/create-temporary-table.html)
- [MySQL 8.4：SAVEPOINT](https://dev.mysql.com/doc/refman/8.4/en/savepoint.html)
- [MySQL 8.4：InnoDB Error Handling](https://dev.mysql.com/doc/refman/8.4/en/innodb-error-handling.html)
- [PostgreSQL 18：CREATE TABLE 与临时表](https://www.postgresql.org/docs/18/sql-createtable.html)
- [PostgreSQL 18：SAVEPOINT](https://www.postgresql.org/docs/18/sql-savepoint.html)
- [PostgreSQL 18：Transaction Isolation](https://www.postgresql.org/docs/18/transaction-iso.html)
- [PostgreSQL 18：Serialization Failure Handling](https://www.postgresql.org/docs/18/mvcc-serialization-failure-handling.html)
- [PostgreSQL 18：Error Codes](https://www.postgresql.org/docs/18/errcodes-appendix.html)
- [PostgreSQL 18：pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html)
