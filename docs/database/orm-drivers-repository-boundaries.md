---
title: ORM、数据库驱动与 Repository 边界
description: 从接口到 SQL 建立安全的数据访问层，理解类型映射、参数绑定、prepared statement、事务上下文、加载策略、流式读取和错误契约
prev:
  text: 数据库函数、存储过程、触发器与任务调度
  link: /database/functions-procedures-triggers-scheduled-jobs
next:
  text: JSON 与半结构化数据建模
  link: /database/json-semi-structured-data-modeling
---

# ORM、数据库驱动与 Repository 边界

接口返回的订单金额突然少了几分，日志里 SQL 看起来完全正确。进一步排查才发现：数据库 `DECIMAL` 被驱动转成 JavaScript `number`；一个 19 位 `BIGINT` ID 也在 JSON 序列化前失去精度。另一个列表接口在测试数据下只执行 3 条 SQL，生产却因为 ORM 懒加载执行了 201 条。

ORM 能减少重复映射，query builder 能安全组合查询，驱动负责协议和类型传输，但它们不会消除数据库语义。数据访问层的职责是让这种语义**显式、可测试、可观测**，而不是让业务层依赖某个工具的偶然默认值。

## 从 HTTP 到数据库有多层契约

```text
HTTP 请求
  → controller：解析与认证
  → application service：用例与事务编排
  → repository：领域意图、查询形状、错误翻译
  → ORM/query builder：映射与 SQL 生成
  → driver/pool：协议、参数、连接、取消
  → database：类型、约束、锁、事务、计划
```

每层应承担有限责任：

- Controller 不拼 SQL，也不把数据库错误原文返回给浏览器。
- Service 决定一个业务用例的事务边界和重试入口。
- Repository 提供按领域命名的有限操作，而不是暴露任意查询对象。
- ORM/query builder 负责映射与生成，但生成结果要检查。
- Driver 必须正确传递类型、超时、取消和事务连接。
- 数据库最终执行约束、隔离和查询计划。

## ORM 解决什么，不解决什么

ORM 常提供：

- 表/行与语言对象之间的映射。
- 关联加载、变更跟踪、dirty checking。
- identity map：同一工作单元内同一主键尽量对应同一对象实例。
- unit of work：收集变化并在 flush 时写入。
- migration、query builder 或生成 schema 的辅助能力。

它不会替你决定：

- 候选键、唯一约束、外键和删除语义。
- 哪些步骤必须属于同一数据库事务。
- 并发写采用锁、条件更新还是 serializable。
- 列表查询要使用什么索引、排序和分页边界。
- 金额、时间、JSON 与大整数如何穿过语言类型。
- 重试是否会重复外部副作用。

“调用 `save()` 成功”只说明 ORM 完成了当前动作；是否已经 flush、是否已经提交、触发器是否改写了值、外层事务是否之后回滚，要按框架和调用上下文确认。

## Repository 应表达领域意图

不推荐把 ORM 的通用查询对象一路暴露到 controller：

```text
repository.find({ where: request.query, include: request.include })
```

这会让客户端间接控制关联、排序、扫描范围和锁，并把持久化模型泄漏成 HTTP API。更清晰的边界是：

```text
OrderRepository.findPage({
  tenantId,
  status,
  after,
  limit
})

OrderRepository.markPaid({
  tenantId,
  orderId,
  expectedVersion,
  paymentId
}, transaction)
```

有限方法能固定：

- tenant predicate 永远存在。
- 允许的筛选、排序和最大页大小。
- 返回字段和关联加载预算。
- 事务上下文必须显式传入。
- 乐观冲突、未找到和约束错误的领域映射。

Repository 不是“每张表一个 CRUD 类”的机械包装。一个用例可跨多表，一个复杂读模型也可有专门查询服务；边界围绕领域一致性和查询形状建立。

## 类型映射是数据正确性边界

### BIGINT 与 ID

JavaScript `number` 只能精确表达有限范围整数，数据库 64 位 ID 可能超过它。可在应用中保留为十进制字符串或 `bigint`，但 JSON 原生不能直接序列化 `bigint`。API 通常将不参与算术的 ID 作为字符串：

```json
{ "orderId": "9223372036854775806" }
```

不要先转成 `number` 再转回字符串；精度已经丢失。驱动配置、ORM transformer、DTO 和日志系统都要端到端测试。

### DECIMAL/NUMERIC 与金额

精确小数不应无条件转 IEEE 754 浮点数。常见方案：

- 数据库和应用都使用最小货币单位整数，例如 `amount_cents`。
- 驱动返回 decimal 字符串，应用用 decimal library 处理。
- DTO 明确字符串格式与 scale，而不是让 JSON 随意输出科学计数法。

任何方案都要规定舍入模式、币种 scale、溢出和负数规则。ORM column type 写着 `decimal` 不代表语言对象仍然精确。

### 时间

`DATE`、本地日历时间和 instant 不能全部映射成一个 `Date` 类。驱动可能使用 session 时区解析文本，也可能返回字符串。应在 mapper 中显式区分：

- `DATE` 保持 `YYYY-MM-DD` 或专用 LocalDate。
- instant 使用带偏移量类型并规范化输出。
- 本地未来计划同时保留 local datetime 与 IANA zone ID。
- 精度截断和无效/重复 DST 时间有明确策略。

### JSON、数组、枚举和二进制

数据库 JSON 合法不代表符合业务 schema。读取时做版本识别与验证，写入时限制大小、深度和允许字段。数据库 enum 迁移可能比字符串 + check 更难演进，应按产品决定。

二进制值不能经过字符编码往返；UUID、网络地址和数组也应使用驱动原生 codec 或明确 mapper。MySQL `BIT(1)`、布尔表达式和 PostgreSQL `boolean` 的语言映射不要靠真值猜测。

### NULL、缺失和默认值

以下三者不同：

- 属性缺失：调用方没有提供。
- 显式 `null`：调用方要清空，前提是业务允许。
- 数据库 `DEFAULT`：SQL 省略列或显式使用 default 时由数据库产生。

ORM patch 若把缺失字段全部写成 `NULL`，会破坏数据；若忽略所有 `null`，又无法表达清空。DTO 和 repository 更新命令必须区分。

## 参数绑定只绑定值

参数化查询把外部值与 SQL 结构分离：

```sql
SELECT id, status, total_cents
FROM orders
WHERE tenant_id = ? AND status = ?;
```

但占位符通常不能替代表名、列名、`ASC/DESC` 或任意 SQL 片段。动态结构使用后端白名单映射：

```text
API sort=createdAt → trusted SQL fragment: created_at
API direction=desc → trusted SQL fragment: DESC
其他值 → 400
```

不要写 `ORDER BY ?` 期待它变成列名；那通常只是按一个参数值排序。也不要因 query builder 提供 raw SQL escape hatch 就把请求字符串直接传入。

参数绑定同样不承担：

- `LIKE` 中 `%`、`_` 的字面转义。
- tenant 授权和行级权限。
- 参数业务范围、数组长度和 JSON schema 验证。
- 参数类型与列类型一致性。

把数字 ID 绑定成字符串、时间绑定成无类型文本，可能触发隐式转换、改变比较语义或影响索引使用。

## Prepared statement 是协议和连接状态

驱动可能采用客户端模拟，也可能真正使用服务器端 prepared statement。两者都能安全传值，但解析、协议、计划缓存和连接状态不同。

服务器端准备通常经历：

1. Parse/prepare SQL 与参数类型。
2. Bind 具体参数。
3. Execute 并读取结果。
4. Close/deallocate 或随连接结束释放。

Prepared statement 通常属于单个 session/connection。连接池中的连接 A 创建的命名 statement，连接 B 不会自动拥有；transaction pooling 代理还可能让会话级 statement、临时表和 session 设置不可用。驱动与代理模式必须联合验证。

### PostgreSQL generic 与 custom plan

PostgreSQL 可按具体参数生成 custom plan，也可复用不依赖参数值的 generic plan。默认 `plan_cache_mode=auto` 会根据多次执行成本选择。

当数据严重倾斜时，同一 SQL 的参数可能需要完全不同的计划：普通租户走索引，大租户走大范围扫描。generic plan 节省规划成本，却可能对某类参数很差。诊断时应：

- 查看 `pg_prepared_statements` 的 generic/custom 次数。
- 用代表性小/大参数执行 `EXPLAIN EXECUTE`。
- 比较实际 rows、buffers 与尾延迟。
- 优先改善统计、查询形状或拆分稳定场景，再谨慎评估 `plan_cache_mode`。

不要全局强制 custom plan 当万能修复；规划 CPU 也是成本。

### MySQL 自动重新准备

MySQL 检测到 statement 依赖的表/视图元数据变化后，可在下次执行时自动 reprepare。迁移期间仍可能出现重准备开销、metadata lock、返回 metadata 变化或驱动不兼容，不能把自动机制当作无风险发布。

Prepared execution 可能减少重复解析和网络传输，但官方也建议按实际场景比较 prepared 与 nonprepared；它不是所有一次性查询的性能保证。

## 生成 SQL 必须可见

ORM 查询应能在开发、测试和生产观测系统中关联到：

- repository/operation 名称。
- 规范化 SQL 或数据库 digest/query ID。
- 参数类型和数量；敏感值不记录。
- rows returned/affected、耗时、等待和错误码。
- HTTP request ID、job ID、transaction ID。

不要只记录 ORM 方法 `findMany`，也不要在生产完整打印密码、token、邮箱和大 JSON 参数。调试时关注真实 SQL 的列、JOIN、谓词、排序、LIMIT 和锁，而不是 ORM DSL 看起来是否优雅。

## 加载策略与 N+1

### 懒加载

访问 `order.items` 时自动查数据库很方便，却让一个看似普通循环产生 N 次 I/O。序列化器、日志打印或模板渲染也可能意外触发加载。

### JOIN eager loading

一个 JOIN 可减少往返，但同时加载两个一对多集合会发生笛卡尔放大。例如 20 items × 10 tags 变成 200 行，再由 ORM 去重对象，网络和内存仍已消耗。

### 有界批量加载

常见可靠形状是：

1. 一条查询取得当前页订单 ID。
2. 一条 `WHERE order_id IN (...)` 取得该页所有 items。
3. 在应用中按 order ID 分组。

批大小要受限，并考虑数据库参数数量限制。GraphQL DataLoader 等工具只有在 request/transaction 范围正确、cache key 包含 tenant 和权限上下文时才安全。

测试应断言接口数据库调用次数上限和最大返回行数，而不是只断言 JSON 正确。

## Identity map 与对象新鲜度

同一 unit of work 读取相同主键时，ORM 可能返回内存中已有实例，不重新查询数据库。它有助于对象一致性，却可能让开发者误以为“第二次 find 一定看到了别的事务更新”。

还要警惕：

- 长生命周期 entity manager 积累大量对象和陈旧状态。
- bulk update 绕过 identity map，内存实体未同步。
- 只更新部分列后，旧实例覆盖数据库新值。
- 二级缓存与读副本又增加额外陈旧层。

Web 请求通常使用短生命周期 unit of work。需要最新数据库状态时使用框架明确的 refresh/lock/clear 能力，并理解事务隔离，不要随意复制 entity manager 到后台并发任务。

## Flush 不等于 commit

ORM `flush()` 通常只是把 SQL 发到当前事务；事务仍可能回滚。`save()` 可能立即写，也可能只标记 dirty。外部副作用必须安排在事务成功提交之后，或在同一事务写 outbox。

事务上下文必须绑定同一连接：

```text
transaction(async tx => {
  await orderRepository.insert(order, tx)
  await outboxRepository.append(event, tx)
})
```

如果第二个 repository 忽略 `tx`，从池中另借连接，两步就不是同一事务。可以通过 API 设计强制事务版本只能接收 scoped repository/transaction handle，并在集成测试制造第二步失败验证第一步回滚。

不要跨异步并行分支共享一个普通事务连接，除非驱动明确支持相应流水线与错误语义。多数连接同一时刻只能安全处理规定数量的协议操作。

## 乐观锁与 affected rows

版本更新应把版本放进条件：

```sql
UPDATE orders
SET status = ?, version = version + 1
WHERE tenant_id = ?
  AND id = ?
  AND version = ?;
```

Repository 检查 affected rows：

- 1：本次更新成功。
- 0：可能不存在、租户不匹配、版本冲突或数据库的“changed/matched rows”语义差异。
- 大于 1：唯一性/谓词错误，应视为不变量事故。

若 API 必须区分 404 与 409，可做授权安全的额外查询或将不透明冲突映射成统一结果。不能从驱动错误文本字符串匹配。

MySQL affected rows 还会受连接 flag 和语句类型影响；upsert 的计数语义与 PostgreSQL `RETURNING` 也不同。为实际驱动写契约测试，不要跨产品抽象出虚假的统一规则。

## 插入 ID、默认值与触发器结果

写入后应用可能需要数据库生成 ID、默认时间、版本或触发器修改值。优先使用产品/驱动明确的返回能力，例如 PostgreSQL `RETURNING`；MySQL 按主键生成方式和驱动 API 获取 insert ID。

不要用“按创建时间倒序查第一条”找刚插入的行，并发下会拿到别人的数据。批量插入、触发器内部插入和连接复用还会让 last insert ID 的直觉失效，必须按官方和驱动行为验证。

## 大结果集、游标与流式读取

ORM 的 `findAll()` 可能把所有行和关联实体一次加载进内存。导出或回填应使用分页、cursor/stream 或批次，但“stream”不一定端到端流式：驱动可能先缓冲完整结果。

检查：

- server-side cursor/portal 是否要求事务保持打开。
- fetch size 是否真的影响网络批次。
- 消费者变慢时是否有背压。
- 中途取消是否关闭结果、回滚/结束事务并归还连接。
- 长事务快照是否阻碍 vacuum/purge 或扩大历史版本保留。
- 每批处理失败后从哪个稳定水位续跑。

流式读取期间不要在同一连接随意发另一个查询。需要并行处理时，先取有界批次、释放读取连接，再交给受控 worker。

## 超时与取消必须贯穿所有层

HTTP 客户端断开不代表数据库 SQL 自动停止。取消信号要沿 controller → service → repository → driver 传播，并配合：

- 获取连接超时。
- 语句/查询超时。
- 锁等待超时。
- 事务总 deadline。
- 数据库端保护上限。

取消可能与提交竞争：客户端收到超时，事务也许已经提交。写接口依靠 idempotency key 查询结果，不能盲目重发。取消后驱动还必须把连接恢复到干净协议/事务状态，否则污染连接池。

## 错误翻译和重试

Repository 将数据库错误分类为有限领域结果：

| 数据库结果 | 领域层可能映射 | 是否通常重试 |
| --- | --- | --- |
| unique/check/FK violation | 冲突或请求不合法 | 不盲重试 |
| deadlock/serialization failure | 并发冲突 | 从整个事务入口重试 |
| statement timeout/cancel | 超时 | 读可按预算；写先确认幂等结果 |
| connection lost near commit | 提交结果未知 | 按稳定业务键确认 |
| syntax/schema mismatch | 发布或编程错误 | 不重试，告警/回滚 |

保留 SQLSTATE、厂商错误号和 constraint name 的内部映射；constraint 名也要版本化。不要依赖本地化错误文本。

重试必须新开事务，重新读取状态并设置总 deadline、最大次数和 jitter。ORM entity 若来自已失败事务，不应直接复用到新事务。

## Schema、ORM metadata 与发布顺序

数据库 migration、ORM entity、prepared statement 和运行中旧应用必须兼容。安全发布采用 expand/contract：

1. 新增 nullable/default/兼容对象。
2. 部署能同时理解旧、新 schema 的应用。
3. 双写或回填并校验。
4. 切换读取并观察。
5. 所有旧实例退出后再收紧约束、删除旧列。

不要让 ORM 在生产启动时自动 `synchronize schema`。多个实例并发启动、隐式 destructive change、锁时间和无法审查的 SQL 都会放大风险。迁移应是独立、版本化、可观察的发布步骤。

DDL 后连接中的 prepared statement、ORM metadata cache 和代理状态可能需要重新准备或淘汰。canary 应使用真实旧/新驱动和精确数据库版本。

## 测试数据访问层

### Mapper/codec 测试

覆盖最大 BIGINT、DECIMAL scale、NULL、空数组、Unicode、二进制、JSON 版本、时间精度和 DST。断言数据库 → domain → API 不丢信息。

### Repository 集成测试

使用真实目标数据库和 runtime role，验证 SQL、约束、排序、分页、affected rows、返回值和错误分类。不要用内存数据库代替产品方言。

### 事务与并发测试

通过第二步故障证明原子回滚；用独立连接和 barrier 证明乐观/悲观锁行为；连接中断后验证未知提交的幂等确认。

### 查询预算测试

对代表性接口断言 SQL 次数、最大行数、无界关联和计划形状。生产数据分布下再做性能测试，mock 无法发现 generic plan 或笛卡尔放大。

配套 `examples/database/35-repository-boundary-model.mjs` 演示 BIGINT/金额无损解码、排序白名单、两条查询批量加载和 affected rows 乐观冲突。

## 常见误区

### “用了 ORM 就不会 SQL 注入”

raw SQL、动态列名、排序片段和不安全 filter DSL 仍可注入。值参数化，结构白名单。

### “Prepared statement 总会更快”

它减少部分解析/传输成本，但连接生命周期、重准备和 generic plan 可能改变收益。必须测量。

### “对象已经 save，所以消息可以发送”

save/flush 不一定 commit。外部消息使用 after-commit 或 transactional outbox。

### “所有关联 eager load 就解决 N+1”

多个集合 JOIN 会笛卡尔放大。常用主查询加有界批量查询。

### “数据库返回 number，JavaScript 就能安全计算”

BIGINT 和 DECIMAL 可能丢精度。驱动返回类型必须进入显式 codec 契约。

## 上线检查清单

- Repository 是否表达有限领域操作，而非暴露任意 ORM filter？
- tenant、排序、页大小、关联深度是否不可被请求绕过？
- BIGINT、DECIMAL、时间、JSON、NULL 和二进制是否端到端无损？
- 动态值是否参数化，动态结构是否严格白名单？
- prepared statement 是客户端还是服务器端，连接/代理模式是否兼容？
- 倾斜参数下 generic/custom plan 是否用真实数据验证？
- 每个接口的 SQL 次数、返回行数和关联放大是否有预算？
- transaction handle 是否传到所有 repository，并确认 flush/commit 边界？
- affected rows、RETURNING/insert ID 和错误码是否按实际驱动测试？
- 大结果是否真正流式，取消后连接是否干净归还？
- 超时和取消是否从 HTTP 贯穿到数据库，并处理未知提交？
- ORM metadata 与 schema 是否采用 expand/contract 发布？
- SQL/digest、参数类型、rows、等待、错误和 request ID 是否可关联且脱敏？

## 本课小结

- ORM、query builder 和驱动减少重复工作，但数据库类型、事务、并发和计划语义仍需显式验证。
- Repository 应固定领域意图、租户边界、查询形状和错误翻译，不暴露任意查询能力。
- BIGINT、DECIMAL、时间、JSON 与 NULL 的 mapper 是数据正确性边界。
- 参数绑定只处理值；标识符和排序等 SQL 结构必须由可信白名单生成。
- Prepared statement 属于协议与连接状态，PostgreSQL 还需关注 generic/custom plan。
- 懒加载会制造 N+1，多个集合 eager JOIN 又会笛卡尔放大；有界批量加载常是平衡方案。
- identity map 可能陈旧，flush/save 不等于 commit，事务上下文必须传递同一连接。
- 流式读取、取消、affected rows、生成值和错误重试都必须按真实驱动做契约测试。
- ORM schema metadata 与数据库迁移需要兼容发布，不能依赖生产自动同步。

## 官方资料

- [MySQL 8.4：Prepared Statements](https://dev.mysql.com/doc/refman/8.4/en/sql-prepared-statements.html)
- [MySQL 8.4 C API：Prepared Statement Interface](https://dev.mysql.com/doc/c-api/8.4/en/c-api-prepared-statement-interface.html)
- [MySQL 8.4 C API：Prepared Statement Type Codes](https://dev.mysql.com/doc/c-api/8.4/en/c-api-prepared-statement-type-codes.html)
- [MySQL 8.4 C API：Affected Rows](https://dev.mysql.com/doc/c-api/8.4/en/mysql-stmt-affected-rows.html)
- [MySQL 8.4：Caching of Prepared Statements and Stored Programs](https://dev.mysql.com/doc/refman/8.4/en/statement-caching.html)
- [PostgreSQL 18：PREPARE](https://www.postgresql.org/docs/18/sql-prepare.html)
- [PostgreSQL 18：Frontend/Backend Protocol Overview](https://www.postgresql.org/docs/18/protocol-overview.html)
- [PostgreSQL 18：Message Flow](https://www.postgresql.org/docs/18/protocol-flow.html)
- [PostgreSQL 18：pg_prepared_statements](https://www.postgresql.org/docs/18/view-pg-prepared-statements.html)
- [PostgreSQL 18：Error Codes](https://www.postgresql.org/docs/18/errcodes-appendix.html)
