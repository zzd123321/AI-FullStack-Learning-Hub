---
title: 索引如何加速查询：B-Tree、选择性与联合索引
description: 从订单列表接口出发，理解 B-Tree、选择性、联合索引、覆盖查询和索引写入成本
prev:
  text: 子查询与 CTE：拆解复杂查询
  link: /database/subqueries-and-cte
next:
  text: 读懂执行计划：扫描、连接、排序与实际执行
  link: /database/reading-query-plans
---

# 索引如何加速查询：B-Tree、选择性与联合索引

::: tip 第一次学习只抓住四件事
- **必须理解**：索引是按特定顺序组织的额外数据结构，用写入和空间成本换取特定查询更少的扫描。
- **必须会做**：从等值条件、范围条件和排序顺序推导一个联合索引，而不是为每列各建一个索引。
- **必须完成**：为自己的列表接口设计一个索引，并说明它服务的是哪种查询形状。
- **可以后看**：覆盖索引细节、索引下推、表达式索引和各数据库专属索引类型。
:::

当订单表只有几百行时，列表接口几乎总是很快；增长到几百万行后，同一条 SQL 可能扫描大量数据、排序并丢弃绝大多数行。索引的作用不是“让数据库变快”这么笼统，而是为特定查询提供一条更便宜的数据访问路径。

本课从一个真实接口形状出发，理解 B-Tree 索引适合什么条件、联合索引的列顺序如何决定可用范围，以及为什么索引越多不一定越好。配套脚本只创建会话临时表和临时表上的索引，不修改永久业务结构。

## 本课目标与阅读路线

完成本课后，你应能从 `WHERE`、`JOIN`、`ORDER BY` 和分页方式还原查询形状，说明一份索引能帮助哪一段访问路径、又会给写入带来什么成本；而不是把“给所有列加索引”当作优化。下一课会用执行计划验证这些推理是否真的被优化器采用。

## 从慢列表接口开始

假设后端接口为：

```text
GET /api/accounts/42/orders
  ?status=paid
  &createdFrom=2026-01-02T00:00:00Z
  &limit=20
```

SQL：

```sql
SELECT id, amount, created_at
FROM orders
WHERE account_id = ?
  AND status = ?
  AND created_at >= ?
ORDER BY created_at DESC, id DESC
LIMIT ?;
```

这条查询包含四种需求：

1. `account_id = ?`：等值筛选。
2. `status = ?`：另一个等值筛选。
3. `created_at >= ?`：范围筛选。
4. `ORDER BY ... LIMIT`：按时间倒序取很少的行。

索引设计必须服务这一整个查询形状，而不只是看到 WHERE 中有四列就分别建四个单列索引。

## 没有合适索引时数据库做什么

最直接的策略是扫描表中所有可见行：

```text
读取一行
  → 检查 account_id
  → 检查 status
  → 检查 created_at
  → 保留匹配行
  → 排序
  → 取前 20 行
```

MySQL 执行计划中可能看到访问类型 `ALL`，PostgreSQL 可能显示 `Seq Scan`。这不必然是错误：

- 表很小时，顺序读全表比随机访问索引和表更便宜。
- 查询本来就要返回大部分行。
- 统计信息判断索引选择性太低。
- 表刚建立、缓存状态或成本参数使全表扫描更合理。

优化目标不是消灭所有全表扫描，而是让高频、延迟敏感且只返回少量数据的查询拥有合适访问路径。

## 索引是一份额外维护的有序结构

可以把普通 B-Tree 索引想成按键值排序的目录：

```text
(account_id, status, created_at, id) → 行位置或主键
```

数据库不必从第一行检查到最后一行，而是先在树中定位目标键范围，再沿叶子节点读取匹配条目。

真实实现比“目录”复杂得多：页面大小、树高、分裂、缓存、并发控制、MVCC 和存储引擎都会影响成本。当前先抓住三个性质：

- 有序：适合等值、范围和有条件的排序访问。
- 额外：索引占磁盘和缓存。
- 需维护：INSERT、DELETE 以及被索引列的 UPDATE 都要同步更新索引。

MySQL InnoDB 常被描述为 B+Tree 索引结构；PostgreSQL 默认的 `btree` 访问方法也提供常见的有序查找能力。学习 SQL 设计时通常统称 B-Tree 类索引，但不能把两个数据库的物理实现细节完全等同。

## B-Tree 常见适用条件

典型 B-Tree 可以支持：

```sql
WHERE account_id = 42
WHERE amount >= 100.00
WHERE created_at >= ? AND created_at < ?
WHERE status IN ('paid', 'shipped')
ORDER BY created_at DESC
```

它不自动适合所有搜索：

- `%keyword%` 这种前导通配符通常不能直接做普通 B-Tree 前缀定位。
- 全文检索更适合专门的全文索引。
- JSON 内部字段、数组、空间数据可能需要表达式索引、生成列或专用索引类型。
- 超大、与物理顺序相关的时间序列，在 PostgreSQL 中有时适合 BRIN。

先按目标数据库、运算符和数据分布选择索引类型，不要把所有索引都理解成同一种树。

## 单列索引从最简单的点查开始

如果接口经常按外部业务编号查询订单：

```sql
SELECT id, status, amount
FROM orders
WHERE order_no = ?;
```

且 `order_no` 唯一，可以建立唯一约束：

```sql
ALTER TABLE orders
ADD CONSTRAINT uq_orders_order_no UNIQUE (order_no);
```

唯一约束通常会由数据库通过唯一索引实现。它同时表达两件事：

- 正确性：不能出现两个相同订单号。
- 访问路径：可快速定位某个订单号。

不要为了性能把本应唯一的业务字段只建普通索引；约束语义更重要。

配套脚本不对永久表执行 ALTER，而是在临时表定义中直接声明约束。

## 选择性：一个条件能排除多少行

如果一百万行中只有一行匹配某个唯一订单号，选择性很高；若 95% 的订单都是 `status='paid'`，单独按状态筛选的选择性很低。

低选择性列不是“绝对不能建索引”，但单列索引通常收益有限：

```sql
CREATE INDEX idx_orders_status ON orders (status);
```

当查询返回几十万行时，通过索引找到大量位置再读取表，可能比顺序扫描更贵。状态列更常作为联合索引的一部分，与租户、账号或时间范围组合。

判断选择性要看真实分布：

- 不同值数量。
- 每个值出现频率是否均匀。
- NULL 占比。
- 热门租户与普通租户差异。
- 时间范围通常覆盖多少数据。

只看“distinct 值有多少”仍可能忽略数据倾斜。

## 联合索引不是多个单列索引的简单相加

为开头的接口设计：

```sql
CREATE INDEX idx_orders_account_status_created_id
ON orders (account_id, status, created_at DESC, id DESC);
```

它按以下层级排序：

```text
先 account_id
  再 status
    再 created_at DESC
      最后 id DESC
```

对于：

```sql
WHERE account_id = 42
  AND status = 'paid'
  AND created_at >= ?
ORDER BY created_at DESC, id DESC
LIMIT 20
```

数据库可以定位账号 42、状态 paid 的索引范围，从最新端开始读取，满足时间边界后尽快取到 20 行。理想情况下，不需要扫描全表，也不需要对大量结果额外排序。

## 最左前缀先建立方向感

对索引 `(account_id, status, created_at, id)`，MySQL 文档强调可用于从左开始的前缀：

```text
(account_id)
(account_id, status)
(account_id, status, created_at)
(account_id, status, created_at, id)
```

只有 `status` 或只有 `created_at` 时，不能像电话簿跳过姓直接按名高效定位。

PostgreSQL 18 的 B-Tree 优化器在某些条件和数据分布下可能使用 skip scan，从较后列条件进行多次搜索。因此更准确的跨库说法是：

- 约束前导列通常最能缩小需要扫描的索引范围。
- 缺少前导列时，索引可能无法用于有效查找，或只能扫描较大部分。
- PostgreSQL 某些计划可能使用跳跃扫描，但是否划算由成本模型决定。
- 最终必须查看目标版本的实际执行计划。

不要背一句“最左原则”后停止验证。

## 等值列通常在范围列之前

常见经验是把稳定的等值条件放在范围条件前：

```text
account_id = ?
status = ?
created_at >= ?
```

因此索引使用 `(account_id, status, created_at)`。一旦进入 `created_at` 范围，后续列通常难以继续缩小同一个连续扫描范围，但仍可能参与排序、过滤或覆盖查询。

这不是机械公式。列顺序还要综合：

- 哪些查询最重要、最频繁。
- 某条件是否总会出现。
- 排序和 LIMIT 能否提前停止。
- 数据选择性与倾斜。
- 是否要支持多种查询形状。
- 目标数据库的优化器能力。

“选择性最高的列永远放第一”也不是通用规则。多租户系统常把 `tenant_id` 放前面，因为几乎所有访问都必须先限制租户，即使它不是全局选择性最高的列。

## 索引列顺序与 ORDER BY

查询需要：

```sql
ORDER BY created_at DESC, id DESC
```

`id` 是时间相同时的稳定决胜列，也与游标分页条件一致：

```sql
AND (
  created_at < ?
  OR (created_at = ? AND id < ?)
)
```

索引末尾同样使用 `(created_at DESC, id DESC)`，有机会按所需顺序读取并在 LIMIT 后停止。

是否完全避免排序取决于：

- 前导列是否被等值约束。
- ORDER BY 的列、顺序和方向是否与索引兼容。
- NULL 排序规则和方言差异。
- 查询是否跨越多个不连续范围。
- 优化器是否认为另一计划成本更低。

看到索引列“包含了排序列”还不够，要在计划中确认是否出现额外 sort/filesort。

## 范围之后的列并非完全没用

对 `(account_id, created_at, status)`：

```sql
WHERE account_id = ?
  AND created_at >= ?
  AND status = ?
```

`created_at` 是范围列，后面的 `status` 往往不能继续把搜索定位成一个更小的连续区间。但数据库仍可能：

- 在索引条目上过滤 status，减少回表。
- 利用索引条件下推等优化。
- 把 status 用于覆盖查询。

因此要区分：

- 定位扫描范围的列。
- 在扫描中参与过滤的列。
- 仅用于返回结果的列。

执行计划会帮助识别这些角色。

## 覆盖查询减少回表，但不是免费午餐

如果查询只需要：

```sql
SELECT id, amount, created_at
```

而这些值都能从索引条目获得，数据库可能避免再访问主数据页，这通常称为覆盖索引或 index-only scan。

MySQL InnoDB 的二级索引叶子中包含主键值，因此查询主键有时无需额外把主键显式加到末尾。但其他返回列如 `amount` 若不在索引中，仍可能需要回到聚簇索引读取。

PostgreSQL 支持 `INCLUDE` 非键列：

```sql
CREATE INDEX ...
ON orders (account_id, status, created_at DESC, id DESC)
INCLUDE (amount);
```

但 PostgreSQL 的 index-only scan 还受 MVCC 可见性信息影响，索引“覆盖所有列”不保证每次都完全不访问 heap。

覆盖索引越宽：

- 占用空间和缓存越多。
- 写入维护成本越高。
- 每个索引页容纳条目更少。
- 建索引时间和复制压力更大。

只为高价值查询添加必要列，不要把 `SELECT *` 的所有列塞进索引。

## MySQL 与 PostgreSQL 的主数据组织不同

InnoDB 表的主键索引是聚簇索引，行数据按主键组织；二级索引记录包含主键值。结果是：

- 短而稳定的主键能减小所有二级索引负担。
- 按二级索引查询其他列通常需要再按主键读取聚簇索引。
- 更新主键代价很高，业务上也通常不应修改主键。

PostgreSQL 普通表是 heap，索引条目指向 heap tuple。PostgreSQL 的 `CLUSTER` 可以按某个索引一次性重排表，但不会在后续写入中永久维持类似 InnoDB 的聚簇组织。

因此“二级索引回表”“聚簇索引”这些术语不能不加区分地套用到两个数据库。

## 对列做函数计算可能破坏可索引条件

按某天查询订单，常见但不理想的写法：

```sql
WHERE DATE(created_at) = '2026-01-05'
```

普通 `created_at` 索引保存原始时间值。对每行先计算日期，可能让数据库无法直接定位原始值范围。

更通用的写法是半开区间：

```sql
WHERE created_at >= '2026-01-05 00:00:00'
  AND created_at <  '2026-01-06 00:00:00'
```

它既明确边界，也更适合 B-Tree 范围查找。真实接口还必须先按业务时区计算 UTC 边界。

MySQL 可通过生成列或函数索引、PostgreSQL 可通过表达式索引支持特定函数表达式，但查询表达式必须与索引定义匹配，并承担额外维护成本。先确认高频查询确实需要。

## 隐式类型转换也会影响索引

如果列是字符串，却用数字参数比较，或列与参数的字符集、排序规则、时间类型不匹配，数据库可能发生隐式转换。转换发生在索引列一侧时，可能无法按预期使用索引，还可能产生错误语义。

后端应让绑定参数类型与列类型一致：

- BIGINT ID 不作为任意浮点数处理。
- DECIMAL 金额使用精确类型或字符串边界。
- 时间点使用明确的时区和驱动类型。
- 文本遵循目标列字符集与排序规则。

不要只在 SQL 文本里看到 `id = ?` 就认为一定是高效点查。

## LIKE 能否使用 B-Tree 取决于模式

通常：

```sql
WHERE name LIKE 'Lin%'
```

有机会利用前缀范围，而：

```sql
WHERE name LIKE '%Lin%'
```

无法从开头定位。大小写规则、排序规则、操作符类和数据库方言还会影响实际计划。

用户搜索需求若是任意词、相关度、分词或拼写容错，应评估 MySQL FULLTEXT、PostgreSQL 全文检索、trigram 扩展或独立搜索引擎，而不是不断给普通 B-Tree 加列。

## 外键列是否自动有索引不能想当然

MySQL InnoDB 对外键检查有索引要求，可能自动创建所需索引；PostgreSQL 不会因为声明引用方外键就自动为引用列建立普通索引。

即使数据库自动创建，也要验证索引列顺序是否服务实际查询。例如订单表经常按账号查订单：

```sql
WHERE account_id = ?
ORDER BY created_at DESC
```

仅 `(account_id)` 能帮助关联和约束检查，但 `(account_id, created_at DESC, id DESC)` 可能更贴合列表接口。不要重复保留完全被联合索引前缀覆盖且无独立价值的索引。

## 多个单列索引不等于一个联合索引

假设分别有：

```text
(account_id)
(status)
(created_at)
```

优化器有时能组合多个索引，例如 MySQL Index Merge 或 PostgreSQL BitmapAnd。但组合需要读取、合并多个索引结果，通常也不能自然提供目标联合排序。

对稳定高频的复合查询，一个按筛选和排序共同设计的联合索引往往更合适。反过来，也不能为了每种参数组合建立一个联合索引；需要用接口频率、延迟目标和写入成本取舍。

## 重复和冗余索引会拖慢写入

若已有：

```text
idx_a    (account_id)
idx_ab   (account_id, created_at)
```

`idx_a` 可能被 `idx_ab` 的前缀覆盖，但不能仅凭列名立即删除：

- 唯一性是否不同？
- 排序方向、前缀长度、表达式和过滤条件是否不同？
- 较窄索引是否对某个高频查询明显更便宜？
- 外键或数据库内部要求是否依赖它？
- 生产执行计划是否实际使用？

应结合索引定义、使用统计和计划评估。删除生产索引同样是结构变更，需要审批、回滚方案和观察窗口；本课不执行删除索引。

## 索引会增加所有写路径成本

每次 INSERT 都要写入相关索引；UPDATE 被索引列时要移动或重写索引条目；DELETE 也要处理索引记录和后续清理。

成本包括：

- 磁盘占用。
- 缓存被更多索引页竞争。
- redo/WAL 与复制流量。
- 页分裂和随机 I/O。
- 更长的批量导入与迁移时间。
- 优化器评估更多候选路径。

读多写少的报表库与高写入事件表，索引预算不同。每个索引都应能回答：“它服务哪条重要查询或哪项约束？”

## 用 EXPLAIN 验证，不靠索引名称猜测

MySQL：

```sql
EXPLAIN
SELECT id, amount, created_at
FROM learning_orders
WHERE account_id = 42
  AND status = 'paid'
  AND created_at >= '2026-01-02 00:00:00'
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

先关注：

- `type`：访问方式，`ALL` 常表示全表扫描。
- `possible_keys`：可能候选索引。
- `key`：最终选择的索引。
- `rows`：估计检查行数。
- `Extra`：过滤、覆盖索引、排序等提示。

PostgreSQL 的计划是节点树，先关注：

- `Seq Scan`、`Index Scan`、`Index Only Scan`、`Bitmap Heap Scan`。
- `Index Cond` 与 `Filter` 的区别。
- `Sort` 是否存在。
- 每个节点估计的 `rows`、`cost`。

成本单位不是毫秒，MySQL 与 PostgreSQL 的数字也不能横向比较。

## EXPLAIN 与 EXPLAIN ANALYZE 不相同

普通 `EXPLAIN` 主要展示估算计划，通常不真正执行 SELECT。`EXPLAIN ANALYZE` 会实际运行语句并给出真实时间与行数。

这意味着：

- 对慢 SELECT，它可能真的运行很久。
- 对写语句，某些数据库的分析模式会真的修改数据。
- 函数、触发器或外部副作用需要特别小心。
- 生产执行必须有权限、超时和负载控制。

本课脚本只使用普通 `EXPLAIN SELECT`。后续执行计划课程会在安全临时数据上学习实际执行统计。

## 统计信息决定优化器的估算

优化器不会逐行试跑所有计划，而是根据统计信息估计选择性和成本。数据刚大量导入、分布突变或统计信息过旧时，计划可能偏离实际。

配套脚本在造数后运行目标数据库的统计信息收集命令：

- MySQL：`ANALYZE TABLE learning_orders`。
- PostgreSQL：`ANALYZE learning_orders`。

生产中 ANALYZE 的锁、I/O、采样和自动维护行为应按目标版本评估，不要机械地在每个请求后运行。

## 为什么创建索引后仍可能不用

常见原因：

- 表太小，全表扫描成本更低。
- 条件匹配比例太高。
- 缺少联合索引前导列。
- 列上有函数或不兼容运算符。
- 参数与列发生类型转换。
- 统计信息过旧或数据严重倾斜。
- 查询返回很多索引外列，回表代价高。
- ORDER BY 与索引顺序不兼容。
- 优化器判断另一个索引或位图计划更便宜。

不要第一时间强制索引。先确认语义、统计和数据分布，再比较真实计划；提示词会绑定具体实现，升级或数据变化后可能变成负优化。

## 设计索引的工作流

1. 收集真实慢查询和调用频率，不从表结构凭空设计。
2. 写出 WHERE、JOIN、ORDER BY、GROUP BY、LIMIT 的完整查询形状。
3. 明确返回行数、延迟目标和数据分布。
4. 先保留主键、唯一约束和必要外键支持索引。
5. 为高价值查询尝试最小可用联合索引。
6. 在接近生产规模与分布的数据上更新统计信息。
7. 比较建索引前后的 EXPLAIN 与实际运行指标。
8. 观察写入延迟、存储、缓存和复制代价。
9. 检查重复与长期未使用索引。
10. 通过迁移、审批和回滚方案上线，不在控制台临时改生产结构。

## 安全运行 MySQL 示例

脚本创建 10,000 行会话临时订单，先观察无联合索引计划，再创建临时索引并重新 EXPLAIN：

```bash
mysql \
  --host=127.0.0.1 \
  --port=3306 \
  --user=app_writer \
  --password \
  app_learning \
  < examples/database/09-mysql-indexes-and-query-shapes.sql
```

## 安全运行 PostgreSQL 示例

```bash
psql \
  --host=127.0.0.1 \
  --port=5432 \
  --username=app_writer \
  --dbname=app_learning \
  --file=examples/database/09-postgresql-indexes-and-query-shapes.sql
```

两份脚本只创建当前会话临时表及其索引，不包含永久表结构修改、UPDATE、DELETE 或 DROP。执行计划的具体成本和节点可能随版本、平台、缓存和统计采样变化，不要把示例中的某个数字当作固定答案。

### 预期观察点

- 临时表共有 10,000 行，账号分布在 1 到 97。
- 创建联合索引前，目标列表查询通常采用全表/顺序扫描并可能额外排序。
- 创建索引后，候选或实际计划应出现 `idx_learning_orders_account_status_created_id`。
- 目标查询能使用账号、状态和时间范围缩小扫描，并按索引顺序获取最新 20 行。
- 只按 status 查询时，因为缺少前导 account_id 且选择性较低，计划可能仍选择全表扫描。
- 对 `created_at` 使用日期函数与使用半开原始时间范围，可能得到不同访问路径。

## 本课小结

- 索引是为特定查询提供的额外有序访问结构，不是通用加速开关。
- 全表扫描在小表或返回大比例数据时可能是正确计划。
- 选择性衡量条件排除行的能力，还要考虑数据倾斜。
- 联合索引的列顺序同时服务等值、范围、排序和 LIMIT。
- 前导列通常决定能否高效缩小 B-Tree 扫描范围；PostgreSQL 18 某些场景可能使用 skip scan。
- 覆盖查询可能减少主数据访问，但宽索引增加存储和写入成本。
- InnoDB 聚簇主键与 PostgreSQL heap 组织不同，不能混用物理术语。
- 列函数、隐式转换和前导通配符可能阻碍普通索引定位。
- 多个单列索引不等于一个为完整查询设计的联合索引。
- 用 EXPLAIN 和真实数据验证计划，不因“已经建索引”就假设会使用。
- 每个索引都必须在读收益与写入、存储、缓存成本之间取舍。

## 官方资料

- [MySQL 8.4：优化与索引](https://dev.mysql.com/doc/refman/8.4/en/optimization-indexes.html)
- [MySQL 8.4：多列索引](https://dev.mysql.com/doc/refman/8.4/en/multiple-column-indexes.html)
- [MySQL 8.4：使用 EXPLAIN 优化查询](https://dev.mysql.com/doc/refman/8.4/en/using-explain.html)
- [MySQL 8.4：InnoDB 聚簇索引与二级索引](https://dev.mysql.com/doc/refman/8.4/en/innodb-index-types.html)
- [PostgreSQL 18：索引类型](https://www.postgresql.org/docs/18/indexes-types.html)
- [PostgreSQL 18：多列索引](https://www.postgresql.org/docs/18/indexes-multicolumn.html)
- [PostgreSQL 18：Index-Only Scan 与覆盖索引](https://www.postgresql.org/docs/18/indexes-index-only-scans.html)
- [PostgreSQL 18：检查索引使用情况](https://www.postgresql.org/docs/18/indexes-examine.html)
- [PostgreSQL 18：使用 EXPLAIN](https://www.postgresql.org/docs/18/using-explain.html)
