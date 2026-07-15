---
title: SQL 与索引优化实战
description: 从查询形状出发优化可搜索条件、联合与覆盖索引、分页、N+1、批量读取、排序聚合，并用 MySQL 与 PostgreSQL 执行计划验证收益和写入代价
prev:
  text: 数据库性能诊断：从慢接口到根因
  link: /database/database-performance-diagnosis
---

# SQL 与索引优化实战

上一课解决了“应该优化哪条 SQL”，这一课解决“怎样改才真正有效”。优化不是把语句写得更短，也不是看到某列出现在 `WHERE` 就创建单列索引，而是减少数据库为返回正确结果必须完成的工作：少读无关行、少做随机回表、少排序、少网络往返，并控制索引给写入带来的额外成本。

本课以订单列表接口为主线，把 SQL 语义、索引顺序、分页协议和接口调用方式放在一起分析。示例使用会话临时表，不修改已有业务表。

## 优化前先冻结正确性契约

假设接口请求：

```http
GET /api/accounts/42/orders?status=paid&from=2026-01-01&pageSize=20
```

需要明确：

- 只返回账号 42 的订单。
- 状态为 `paid`，创建时间不早于起点。
- 按 `created_at DESC, id DESC` 稳定排序。
- 返回 20 条，并提供下一页游标。
- 每条返回 `id`、`amount`、`created_at`。
- 翻页期间新订单或状态变更怎样体现。

不能为了性能删除过滤条件、改成不稳定排序或返回陈旧错误数据。优化必须在相同业务语义下比较；若要改变一致性或分页语义，应把它作为接口契约变更单独评审。

## 把 SQL 拆成查询形状

```sql
SELECT id, amount, created_at
FROM orders
WHERE account_id = ?
  AND status = ?
  AND created_at >= ?
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

这个形状包含：

| 部分 | 作用 | 对索引的提示 |
| --- | --- | --- |
| `account_id = ?` | 租户/账号等值过滤 | 通常放在 B-Tree 前部 |
| `status = ?` | 等值过滤 | 可继续缩小同一索引范围 |
| `created_at >= ?` | 范围下界 | 范围后续列通常难再用于缩小查找区间 |
| `ORDER BY created_at, id` | 稳定顺序 | 索引顺序匹配可避免额外排序 |
| `LIMIT 20` | 早停 | 有序索引找到 20 条即可停止 |
| 返回三列 | 覆盖机会 | 需权衡回表与索引宽度 |

候选索引因此不是三个单列索引，而是围绕完整形状设计：

```sql
(account_id, status, created_at DESC, id DESC)
```

MySQL InnoDB 可把 `amount` 追加到索引尾部形成覆盖候选；PostgreSQL 可使用 `INCLUDE (amount)` 把它作为非键 payload。是否值得覆盖取决于调用频率、回表成本、写入量和索引大小。

## 联合索引不是列的集合，而是有序结构

对 B-Tree `(account_id, status, created_at, id)`，可以把它想成先按账号分组，组内按状态，再按时间和 ID 排序。

通常有效的左侧形状包括：

```text
account_id
account_id + status
account_id + status + created_at range
```

只按 `status` 或只按 `created_at` 查询，不能假设该索引同样高效。MySQL 与 PostgreSQL 新版本都可能在某些条件下使用 skip scan 等优化，但成本取决于前导列基数与数据分布，不能把它当作稳定替代品。

### 等值列、范围列与排序列

实用推理顺序：

1. 先放能定义主要查询范围的等值条件。
2. 再放其他常用等值条件。
3. 接着考虑范围与排序是否能共享顺序。
4. 最后才考虑覆盖返回列。

这不是死记“等值永远在范围前”。如果查询主要只按 `account_id`，状态选择性很低且经常不传，`status` 是否进入索引、放在哪里要比较多个真实查询形状。一个索引无法完美服务所有可选筛选组合。

### 可选条件会制造多个查询形状

下面的万能 SQL 很常见：

```sql
WHERE (? IS NULL OR status = ?)
  AND (? IS NULL OR created_at >= ?)
```

它方便 ORM 复用一条语句，但 OR、NULL 参数和参数化计划可能让选择性估算或索引范围变差。更好的做法往往是为有限的稳定筛选组合生成明确 SQL，并限制 API 可组合条件数量。

不能无限为每种组合建索引。应从 digest/query ID 的频率和总成本选择最重要形状，其他低频条件接受过滤、异步导出或专用搜索系统。

## SARGable：让条件可转成索引搜索范围

SARGable 可以理解为“优化器能把条件转换成索引上的可搜索范围”。

### 不要在被筛选列上包函数

较差形状：

```sql
WHERE DATE(created_at) = '2026-07-15'
```

更适合普通时间索引的半开区间：

```sql
WHERE created_at >= '2026-07-15 00:00:00'
  AND created_at <  '2026-07-16 00:00:00'
```

半开区间不会依赖“一天最后一微秒”，也能自然适配不同时间精度。

但时区必须先定义：如果数据库保存 UTC，而接口按 Asia/Shanghai 自然日筛选，应用应把本地边界准确转换成 UTC instant，再绑定参数；不能直接截取 UTC 日期假装是本地日期。

### 避免隐式类型转换

把数字 ID 当字符串、字符集/collation 不一致、时间参数类型错误，都可能改变比较语义或索引使用。参数绑定类型要与列类型一致，不要用字符串拼接让数据库猜类型。

### 前缀模糊查询与任意包含

```sql
name LIKE 'alice%'   -- B-Tree 在合适 collation/operator class 下可能使用前缀范围
name LIKE '%alice%'  -- 普通 B-Tree 通常无法从开头定位
```

任意包含、分词、拼写相似和多语言搜索属于搜索需求。PostgreSQL 可评估全文检索或 `pg_trgm`，其他场景可能使用专用搜索引擎；不要通过给每列加普通索引期待解决 `%keyword%`。

### 表达式索引是显式设计，不是免费修复

若业务确实总按 `lower(email)` 查询，可以评估 PostgreSQL expression index 或 MySQL 生成列/函数索引能力。但查询表达式必须与索引表达式匹配，且每次写入都要维护计算结果。更重要的是先统一邮箱大小写和唯一性语义，避免索引优化掩盖数据规则不清。

## 覆盖索引与 Index-Only Scan 的边界

覆盖索引包含查询所需的过滤、排序和返回列，使执行器可能不再读取基础表行。

### MySQL InnoDB

InnoDB 二级索引叶子包含主键值。若查询只需要二级索引列和主键，计划可能显示 `Using index`。把大文本追加到覆盖索引会显著膨胀叶子页，降低缓存密度并增加写放大。

### PostgreSQL

`INCLUDE` 列不参与 B-Tree 搜索顺序，但可作为返回 payload。真正的 Index Only Scan 还要求访问方法支持，并且 heap page 的 all-visible 信息允许跳过 heap 可见性检查；更新频繁的表即使有覆盖索引，也可能仍访问 heap。

所以“索引包含所有列”只创造了机会，不保证每次零回表。必须看实际计划、heap fetch、buffer 和数据更新特征。

### 不要覆盖 `SELECT *`

接口明确列出需要字段：

```sql
SELECT id, amount, created_at ...
```

`SELECT *` 会：

- 读取和传输不需要的大列。
- 让覆盖索引几乎不可能保持合理大小。
- 表结构增加列时悄悄改变接口成本。
- 增加驱动解码、对象映射与 JSON 序列化。

字段裁剪是端到端优化，不只影响数据库执行时间。

## 索引排序与稳定分页

如果索引在过滤后的范围内已经按 `created_at DESC, id DESC` 排列，数据库可顺序读取并在 20 条后停止。否则可能读取大量候选行再排序。

排序必须有唯一 tie-breaker：

```sql
ORDER BY created_at DESC, id DESC
```

只按 `created_at` 时，同一时间戳的行顺序不确定；不同页或不同计划可能重复/遗漏行。

### 深 OFFSET 的成本

```sql
LIMIT 20 OFFSET 100000
```

即使使用有序索引，数据库通常仍要走过前 100,000 条再丢弃。页码越深，成本越高；并发插入还会让页边界移动。

### Keyset/Cursor Pagination

上一页最后一条是 `(created_at, id)`：

```sql
WHERE account_id = ?
  AND status = ?
  AND (
    created_at < ?
    OR (created_at = ? AND id < ?)
  )
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

PostgreSQL 与 MySQL 也支持行值比较，可在确认类型和 NULL 语义后写成：

```sql
AND (created_at, id) < (?, ?)
```

游标应包含：

- 排序键值。
- 影响结果集的稳定筛选摘要或版本。
- 编码版本和防篡改签名。

不要把 OFFSET 数字换个 Base64 名字就称为 cursor。真正 keyset 是从最后排序键继续搜索。

### Keyset 也不是快照

后续页查询仍是新的数据库语句。在 READ COMMITTED 下，翻页期间插入、删除或状态变化会影响结果。它通常避免已看记录因前方插入而整体位移，但不能自动提供跨页一致快照。

需要导出一致快照时，可使用受控事务、导出任务或版本边界；不要让 Web 请求保持数分钟事务只为分页。

## N+1：单条 SQL 不慢，接口仍会慢

伪代码：

```text
orders = SELECT 20 orders
for order in orders:
    account = SELECT account WHERE id = order.account_id
```

第二条查询每次 1 ms，执行 20 次仍产生 20 次 RTT、连接占用和解析/执行开销。列表扩大到 100 条，问题线性增长。

常见方案：

- 一个合理 JOIN 直接返回需要字段。
- 先收集唯一外键，用一次 `WHERE id IN (...)` 批量读取并在应用组装。
- ORM eager loading/batch loader，并验证实际 SQL 数量。
- 稳定小字典使用有版本和失效策略的缓存。

不是所有 N+1 都应改成一个巨型 JOIN。多个一对多关系同时 JOIN 会产生笛卡尔放大：10 个订单 × 5 个条目 × 4 个标签得到 200 行。此时可用主查询 + 少量按外键批量查询，而不是每行查询或一次无限放大。

接口测试应断言 SQL 次数上限。例如列表从 20 条变成 100 条时，数据库调用仍保持 2～3 次，而不是从 21 次变成 101 次。

## 批量操作：减少往返，但保留边界

批量读取：

```sql
SELECT id, display_name
FROM accounts
WHERE id IN (?, ?, ...);
```

需要注意：

- 去重 ID，限制 batch 大小。
- 数据库返回顺序不等于输入顺序，应用按 ID 重建。
- 空集合不要生成非法 `IN ()`。
- 超大列表增加 SQL/协议、解析和计划成本，可分批或使用临时表/数组等数据库能力。
- Cluster/sharding 后要按数据位置拆批并表达部分失败。

批量写入要控制事务大小、锁时间、WAL/redo、复制延迟和失败语义。100,000 行一次事务并不一定比每 500～2,000 行一批更可靠。最佳大小需要在真实 payload 和并发下测量。

## JOIN 优化先减少输入，再选择索引

连接性能取决于每侧输入规模、连接键和算法，不是“JOIN 数量越少越快”。

检查：

1. 外键/连接列类型、长度和 collation 是否一致。
2. 被连接侧是否有唯一/合适索引。
3. 过滤能否在连接前减少输入。
4. 一对多基数是否造成结果放大。
5. 估算行数是否因列相关或数据倾斜出错。
6. 返回字段是否迫使读取大列。

把 INNER JOIN 随意改成 LEFT JOIN、或把过滤从 ON 移到 WHERE，可能改变 NULL 行语义。任何重写都先用边界数据验证结果集。

## EXISTS、IN 与 JOIN 不靠口诀选

“EXISTS 一定比 IN 快”“JOIN 一定最快”都不可靠。现代优化器会把很多形式转换为 semi join、anti join 或等价计划。

先表达正确语义：

- 只判断关联是否存在：`EXISTS` 通常最清晰。
- 需要关联表字段：JOIN。
- 小批固定 ID 集合：IN。
- `NOT IN` 遇到 NULL 会产生 UNKNOWN，反连接场景常用 `NOT EXISTS` 更容易表达预期。

然后使用真实数据和计划验证，而不是根据语法外观判断。

## 聚合、COUNT 与列表接口

`COUNT(*)` 不是元数据常数，尤其带过滤和 JOIN 时需要执行实际工作。每次列表请求同时跑“精确总数 + 当前页”，深数据集可能让计数成为主要成本。

接口先问清：

- UI 是否真的需要精确总页数？
- 能否只返回 `hasNext`，通过多取 1 条判断？
- 能否异步计算或短期缓存近似总数？
- 总数的新鲜度目标是什么？

不要伪造不准确的 `total` 却不告诉调用方。近似值和延迟值必须在 API 字段/文档中表达。

聚合报表若反复扫描大量事实数据，可评估汇总表、物化视图或分析系统，但必须设计增量更新、迟到数据、更正、重建和对账。预计算把读成本移到了写入与一致性，不是消失。

## OR 条件与 UNION ALL

```sql
WHERE account_id = ? OR email = ?
```

优化器可能使用多个索引组合，也可能扫描。若两个分支有独立高效访问路径，可评估 `UNION ALL`：

```sql
SELECT ... WHERE account_id = ?
UNION ALL
SELECT ... WHERE email = ?;
```

但两分支可能返回同一行。`UNION` 会去重并增加排序/哈希成本；`UNION ALL` 不去重。改写前必须定义重复语义并检查计划，不能把 OR 机械改写。

## NULL 与三值逻辑不能在优化中丢失

```sql
col <> 'x'
```

不会匹配 `col IS NULL`。改成 `NOT (col = 'x')` 也不会自动包含 NULL。若业务需要 NULL：

```sql
col <> 'x' OR col IS NULL
```

这又会改变查询形状和索引选择。最好的起点仍是模型：字段是否真的允许 NULL，NULL 表示未知、未填写还是不适用。不要用 `COALESCE(col, '')` 随手包列来修复语义，因为它还可能使普通索引不可搜索。

## 参数倾斜与计划稳定性

同一 SQL：

```sql
WHERE tenant_id = ? AND status = 'pending'
```

小租户 10 行，大租户 10,000,000 行；同一个计划未必都好。Prepared statement 的 custom/generic plan、MySQL 直方图、PostgreSQL MCV/extended statistics 都可能影响估算。

优化时至少选择：

- 普通参数。
- 最大租户/热点值。
- 极少见值。
- 无结果值。
- 时间范围很窄和很宽。

只用开发账号 42 验证，会错过生产大租户。若多列相关导致估算错误，PostgreSQL 可评估 extended statistics；MySQL 可评估直方图等统计能力。统计对象和 target 也有采样、维护与规划开销，应针对证据配置。

## 索引的写入代价

每个二级索引都需要：

- INSERT 时写入新索引项。
- UPDATE 索引列时删除旧项、写新项。
- DELETE 时维护索引和清理。
- 占磁盘、buffer/cache、备份和复制带宽。
- 在 DDL、恢复、校验和迁移时增加时间。

宽索引和随机主键还可能增加页分裂与缓存压力。一次读优化必须同时测：

```text
读：P95/P99、rows/buffers、排序、回表
写：TPS、提交延迟、WAL/redo、锁、复制延迟
空间：表/索引大小、缓存命中、备份恢复
```

### 冗余索引不是只看列前缀

若已有 `(account_id, status, created_at)`，单列 `(account_id)` 可能在部分查询上冗余，但要检查：

- 唯一性与约束用途。
- 排序方向、collation、表达式、partial predicate。
- 覆盖列与索引类型。
- 外键检查和其他查询形状。
- 数据库是否支持/使用 skip scan。

删除索引是生产变更。MySQL 可用 invisible index 在适用版本中测试优化器不使用它的影响；PostgreSQL 没有等价通用 invisible index 开关，通常在副本/测试环境验证并谨慎变更。不能只凭 `idx_scan = 0` 删除，因为统计可能重置，索引也可能服务月末任务或约束。

## 索引上线本身也要设计

在大表创建索引可能持续很久，消耗 CPU、I/O、临时空间和复制带宽，并与 DDL/事务交互。

上线前确认：

- MySQL 目标 DDL 算法和 lock 行为是否被版本/变更支持。
- PostgreSQL 是否需要 `CREATE INDEX CONCURRENTLY`，以及失败后 invalid index 的处理。
- 磁盘临时空间和最终空间。
- 长事务是否阻碍 DDL 完成。
- 复制延迟、备份窗口和故障切换影响。
- 取消、失败、重试和回滚方案。

本课示例仅对会话临时表创建索引，不提供可直接复制到生产大表的 DDL 流程。

## 优化验证模板

每次改动记录：

```text
目标：哪个接口/SQL，当前 SLO 与影响
假设：哪一步造成额外工作，证据是什么
改动：SQL、索引或调用方式
正确性：结果集、排序、NULL、并发与一致性验证
负载：数据规模、分布、参数、并发、冷/热缓存
收益：端到端与数据库指标
代价：写延迟、空间、复制、锁和维护
发布：灰度、观察窗口、停止条件、回退
```

只比较 EXPLAIN 的 cost 不够。MySQL 与 PostgreSQL 的 cost 单位和模型不同，不能跨数据库比较；即使同库 cost 下降，也要用实际时间、行数、buffer、吞吐和资源验证。

## 配套 SQL

### MySQL 8.4

`examples/database/16-mysql-sql-index-optimization.sql` 使用临时订单表演示：

- 函数包列与半开时间范围。
- 查询形状对应的联合覆盖索引。
- 深 OFFSET 与 keyset pagination。
- 稳定排序和 EXPLAIN ANALYZE。

### PostgreSQL 18

`examples/database/16-postgresql-sql-index-optimization.sql` 演示同一组语义，并使用 `INCLUDE` 展示覆盖机会与 `BUFFERS`。

两份脚本只创建会话临时表，插入确定性学习数据；连接关闭后自动消失。`EXPLAIN ANALYZE` 只执行 SELECT。

## 上线检查清单

### SQL 语义

- 结果、NULL、时区、排序和并发语义未改变。
- 返回字段最小且稳定，没有无界 `SELECT *`。
- 参数绑定类型与列一致。
- 可选筛选不会生成无限查询形状。

### 访问路径

- 使用代表性和倾斜参数读取实际计划。
- 估算与实际行数差异可解释。
- 扫描、过滤、排序、loops、buffer 和 temp 已检查。
- keyset 游标包含完整唯一排序键。
- N+1 用 SQL 次数断言防回归。

### 索引代价

- 联合索引顺序服务明确查询形状。
- 覆盖列大小受控，不为 `SELECT *` 建宽索引。
- 写吞吐、WAL/redo、空间和复制延迟已测量。
- DDL 算法、锁、磁盘和失败恢复已评审。
- 冗余索引结论覆盖完整统计窗口和约束用途。

## 常见误区

### “WHERE 里每一列各建一个索引”

多个单列索引不等于一个匹配过滤与排序的联合索引；索引组合也有额外成本，是否使用由计划决定。

### “把范围列永远放最后”

这是常见启发式，不是定律。排序、可选条件、其他查询形状和实际选择性都会改变最佳顺序。

### “Using index / Index Only Scan 就一定最快”

宽覆盖索引可能更大、更难缓存；PostgreSQL 还可能因可见性检查访问 heap。要看实际 buffer、时间和写代价。

### “LIMIT 20，所以查询最多读 20 行”

如果没有匹配过滤与排序的访问路径，数据库可能扫描或排序大量候选行后才返回 20 条。

### “所有查询合成一条 JOIN 就没有 N+1”

多个一对多关系可能产生巨大行数放大。目标是有界往返与有界结果，而不是 SQL 条数永远等于一。

### “索引让读变快，不会影响业务”

索引会增加写入、存储、复制、备份和 DDL 成本，可能让写接口和故障恢复变慢。

## 本课小结

- 先冻结接口正确性，再按等值、范围、排序、LIMIT 和返回列定义查询形状。
- B-Tree 联合索引是有序结构；列顺序决定可搜索前缀、排序和早停能力。
- 条件应尽量可转换为索引范围；函数、隐式转换和前导通配符可能破坏普通索引访问。
- 覆盖索引减少回表只是机会，不是保证；宽索引会降低缓存密度并增加写放大。
- 稳定分页需要唯一排序键；深 OFFSET 成本随深度增长，keyset 从最后排序键继续。
- N+1 应通过 JOIN 或有界批量加载治理，并用接口 SQL 次数防回归。
- EXISTS、IN、JOIN、OR 与 UNION 没有脱离数据和计划的固定快慢口诀。
- 参数倾斜、列相关与统计质量会让同一 SQL 在不同参数下选择不同计划。
- 每次索引优化都要同时验证读收益、写代价、空间、复制和上线 DDL 风险。

## 官方资料

- [MySQL 8.4：Multiple-column indexes](https://dev.mysql.com/doc/refman/8.4/en/multiple-column-indexes.html)
- [MySQL 8.4：Optimization and indexes](https://dev.mysql.com/doc/refman/8.4/en/optimization-indexes.html)
- [MySQL 8.4：ORDER BY optimization](https://dev.mysql.com/doc/refman/8.4/en/order-by-optimization.html)
- [MySQL 8.4：LIMIT optimization](https://dev.mysql.com/doc/refman/8.4/en/limit-optimization.html)
- [MySQL 8.4：Range optimization](https://dev.mysql.com/doc/refman/8.4/en/range-optimization.html)
- [PostgreSQL 18：Multicolumn indexes](https://www.postgresql.org/docs/18/indexes-multicolumn.html)
- [PostgreSQL 18：Indexes and ORDER BY](https://www.postgresql.org/docs/18/indexes-ordering.html)
- [PostgreSQL 18：Index-only scans and covering indexes](https://www.postgresql.org/docs/18/indexes-index-only-scans.html)
- [PostgreSQL 18：Indexes on expressions](https://www.postgresql.org/docs/18/indexes-expressional.html)
- [PostgreSQL 18：Planner statistics](https://www.postgresql.org/docs/18/planner-stats.html)
