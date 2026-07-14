---
title: 读懂执行计划：扫描、连接、排序与实际执行
description: 掌握 MySQL 与 PostgreSQL 的计划树、估算行数、扫描方式、连接算法和 EXPLAIN ANALYZE
prev:
  text: 索引如何加速查询：B-Tree、选择性与联合索引
  link: /database/indexes-and-query-shapes
next:
  text: 事务与 ACID：从转账接口到原子提交
  link: /database/transactions-and-acid
---

# 读懂执行计划：扫描、连接、排序与实际执行

索引建立后，数据库不保证使用它；SQL 写得相似，执行代价也可能相差几个数量级。执行计划是查询优化器为 SQL 选择的物理执行方案，它回答“从哪里读行、如何连接、在哪里过滤、是否排序、预计处理多少数据”。

本课不追求记住所有节点名称，而是建立一套可迁移的阅读顺序：先确认结果语义，再从计划叶子向根节点追踪数据量，比较估算与实际，找出数据在哪一步突然膨胀或被大量丢弃。

## 从接口延迟拆解问题

考虑订单列表接口：

```sql
SELECT id, amount, created_at
FROM orders
WHERE account_id = ?
  AND status = ?
  AND created_at >= ?
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

接口耗时可能来自：

- 等待连接池，而非 SQL 本身。
- 数据库锁等待。
- 扫描和过滤大量行。
- 排序或哈希表溢出到磁盘。
- 查询很快，但传输和序列化大量结果很慢。
- 同一请求触发 N+1 查询。

执行计划主要解释数据库内部的访问与计算，不能替代端到端追踪。优化前先用应用指标确认时间确实花在这条 SQL 上。

## 计划是优化器的选择，不是 SQL 的另一种排版

同一条声明式 SQL 可以有多种执行方式：

```text
全表扫描 → 过滤 → 排序 → LIMIT
索引范围扫描 → LIMIT
先查账号 → 对每个账号索引查订单
先筛订单 → 哈希连接账号
```

优化器根据表结构、索引、统计信息、参数和成本模型选择估计最便宜的方案。它不是证明“唯一正确”的方案，而是在现有信息下做成本判断。

计划也会变化：

- 数据量和分布改变。
- 统计信息更新。
- 新增或删除索引。
- 数据库版本升级。
- 参数值不同。
- 内存、并行度和成本配置改变。

因此不要把某次计划截图当成永久契约。

## EXPLAIN 与实际执行要严格区分

普通 `EXPLAIN` 通常生成估算计划，而不执行 SELECT：

```sql
EXPLAIN SELECT ...;
```

`EXPLAIN ANALYZE` 会真正运行语句，并附加实际时间、行数和循环次数：

```sql
EXPLAIN ANALYZE SELECT ...;
```

后者更接近事实，也更危险：慢查询会真的消耗资源；若目标是写语句，还可能真的修改数据。生产使用前必须确认：

- 只分析安全 SELECT，或有可靠隔离和回滚设计。
- 设置合理 statement timeout。
- 避开高峰并控制并发。
- 查询中的函数、外部调用和序列等副作用是否可撤销。
- 当前账号权限和目标环境是否正确。

本课脚本只对会话临时表执行 SELECT。

## 计划树从叶子向根阅读

计划通常是一棵树。简化示例：

```text
Limit
└─ Sort
   └─ Nested Loop
      ├─ Index Scan orders
      └─ Index Lookup accounts
```

叶子节点产生基础行，上层节点消费子节点输出：

1. 扫描 orders 找候选订单。
2. 对候选订单关联 accounts。
3. 对连接结果排序。
4. Limit 只返回前 20 行。

从根向下能看到最终目标，从叶子向上更容易理解工作量如何累积。每到一个节点都问：

- 输入多少行？
- 输出多少行？
- 丢弃了多少行？
- 执行多少次？
- 是否分配大块内存或产生临时数据？

## cost 不是毫秒

PostgreSQL 常显示：

```text
cost=0.29..8.31 rows=1 width=24
```

- 第一个 cost 是产生第一行前的启动成本。
- 第二个是返回全部估算结果的总成本。
- `rows` 是估算输出行数。
- `width` 是估算每行平均字节数。

成本是优化器内部可比较的单位，不是毫秒，也不能跨数据库比较。它用于在同一次规划中比较候选方案。

MySQL TREE 计划也会展示 cost 和估算 rows，同样不能直接当响应时间。真实毫秒需要实际执行统计和应用监控。

## 估算行数往往比成本数字更值得先看

连接顺序、连接算法、索引和排序选择都依赖行数估算。如果优化器认为条件返回 10 行，实际却返回 100 万行，后面的每个决定都可能建立在错误前提上。

优先比较：

```text
estimated rows  vs  actual rows
```

常见偏差来源：

- 统计信息过旧。
- 数据严重倾斜。
- 两列高度相关，却被当成独立条件估算。
- 表达式、函数或自定义类型缺少统计。
- 临时表造数后没有 ANALYZE。
- 参数化计划无法针对具体值估算。

偏差一两倍不一定重要；偏差几个数量级且发生在计划下层，通常值得优先调查。

## MySQL 的三种常用输出格式

MySQL 8.4 支持：

```sql
EXPLAIN FORMAT = TRADITIONAL SELECT ...;
EXPLAIN FORMAT = TREE SELECT ...;
EXPLAIN FORMAT = JSON SELECT ...;
```

用途不同：

- TRADITIONAL：表格紧凑，便于看 `type`、`key`、`rows`、`Extra`。
- TREE：展示迭代器层级和更精确操作描述，哈希连接需要 TREE 才能清楚呈现。
- JSON：适合程序化保存和比较，字段更丰富。

`EXPLAIN ANALYZE` 总是 TREE 语义；如果会话默认 EXPLAIN 格式设为 JSON，可显式写：

```sql
EXPLAIN ANALYZE FORMAT = TREE SELECT ...;
```

## MySQL TRADITIONAL 先看哪些列

| 列 | 首要含义 |
| --- | --- |
| `table` | 当前访问的表或中间结果 |
| `type` | 访问类型 |
| `possible_keys` | 优化器认为可能使用的索引 |
| `key` | 实际选择的索引 |
| `key_len` | 使用的索引键长度 |
| `ref` | 与索引比较的值或列 |
| `rows` | 估算检查行数 |
| `filtered` | 估算通过表条件的百分比 |
| `Extra` | 覆盖索引、排序、临时表等补充信息 |

粗略理解常见 `type`：

- `const`：通过主键或唯一键定位常量行。
- `eq_ref`：连接中对每个外层组合最多匹配一行。
- `ref`：非唯一索引等值查找。
- `range`：索引范围扫描。
- `index`：扫描整个索引，不等于高选择性查找。
- `ALL`：全表扫描。

不要只背排名。扫描一张很小的维表用 ALL 可能完全合理，而对亿级表估算扫描数千万行才值得警惕。

## possible_keys 有索引而 key 为 NULL

这不代表优化器“忘了使用索引”。可能原因：

- 条件返回比例太高。
- 表很小。
- 回表成本超过顺序扫描。
- 索引不能提供目标排序。
- 统计信息认为另一方案更便宜。

先检查估算与实际，再决定是否改查询、统计或索引。强制索引会把当前判断固定下来，数据变化后可能更差。

## MySQL Extra 的常见信号

- `Using index`：查询所需值可从索引获得，常表示覆盖访问。
- `Using where`：读取候选行后还需应用条件。
- `Using index condition`：使用索引条件下推减少完整行读取。
- `Using filesort`：需要额外排序算法，不表示一定写磁盘文件。
- `Using temporary`：需要内部临时结果，常见于某些分组、去重和排序。

Extra 是线索而不是结论。一个只排序 20 行的 filesort 可能无关紧要；对千万行排序且发生磁盘溢出才是关键问题。

## PostgreSQL EXPLAIN 常用选项

估算计划：

```sql
EXPLAIN (FORMAT TEXT)
SELECT ...;
```

安全 SELECT 的实际计划：

```sql
EXPLAIN (
  ANALYZE,
  BUFFERS,
  TIMING,
  SUMMARY,
  FORMAT TEXT
)
SELECT ...;
```

- `ANALYZE`：实际执行。
- `BUFFERS`：报告共享、本地和临时缓冲区访问。
- `TIMING`：节点时间；计时本身也有开销。
- `SUMMARY`：规划与执行汇总。
- `FORMAT JSON`：适合工具解析。
- `WAL`：需要分析写入时可报告 WAL，但写入分析风险更高。

PostgreSQL 18 中 ANALYZE 会隐式启用 BUFFERS；显式写出仍能让脚本意图更清楚。

## PostgreSQL 的扫描节点

- `Seq Scan`：顺序扫描表。
- `Index Scan`：按索引找到条目，再访问 heap 获取行。
- `Index Only Scan`：尝试从索引返回列，但仍可能为 MVCC 可见性访问 heap。
- `Bitmap Index Scan`：生成匹配位置位图。
- `Bitmap Heap Scan`：按页访问 heap，并可能重新检查条件。

位图扫描常适合“匹配行不少，但又远少于全表”的中间区域，也能组合多个索引条件。它不是普通 Index Scan 的失败版本。

## Index Cond、Filter 与 Rows Removed

PostgreSQL 计划可能显示：

```text
Index Cond: (account_id = 42)
Filter: (status = 'paid')
Rows Removed by Filter: 800
```

`Index Cond` 参与索引定位；`Filter` 在读取候选行后判断。若读取 100 万行后过滤掉 99.9%，可能需要把过滤列加入合适联合索引，或重新审视查询形状。

但少量 Rows Removed 不值得为了“归零”添加宽索引。优化始终看总成本和调用频率。

## Nested Loop：小外层配合快速内层查找

嵌套循环的逻辑是：

```text
对外层每一行
  到内层查找匹配行
```

它适合外层结果很小、内层连接键有索引的情况。例如取 20 个订单后按账号主键查账号。

危险信号是：外层实际产生几十万行，内层扫描又很贵。此时内层节点 `loops` 很大，总工作量是每次平均行数/时间乘以 loops。

## Hash Join：构建哈希表再探测

哈希连接通常用于等值连接：

1. 读取一侧并按连接键构建哈希表。
2. 扫描另一侧，用连接键探测。

它适合较大、无合适有序访问路径的等值连接。要关注：

- build 侧实际大小。
- 内存使用和批次数。
- 是否溢出临时存储。
- 估算错误是否选错 build 侧。

MySQL TREE 与 PostgreSQL 都能显示 Hash Join。数据库能使用哈希连接，不代表应该删除业务上必要的连接键索引；写入约束和其他查询仍可能依赖它。

## Merge Join：两边有序地合并

归并连接要求输入按连接键有序。顺序可来自索引，也可来自显式 Sort。它像合并两个已排序列表，适合某些大结果等值或范围连接。

若为了 Merge Join 先对两边大数据排序，排序成本可能超过收益。优化器会在 Nested Loop、Hash Join、Merge Join 等候选方案间比较；MySQL 与 PostgreSQL 支持细节并不完全相同，不能看到 PostgreSQL 节点就期待 MySQL 使用同名方案。

## loops 是理解嵌套计划的关键

PostgreSQL 和 MySQL 实际计划中的节点可能显示：

```text
actual ... rows=3 loops=1000
```

这通常表示每次循环平均输出 3 行，执行 1000 次，总输出工作量约 3000 行。节点时间通常也是每次循环平均值，判断总成本时需要结合 loops。

很多“单次索引查找只要 0.05 ms”的 N+1 计划，乘以十万次就不再便宜。

## actual time 的上下层会重叠

父节点的时间通常包含消费子节点所需时间，不能把所有节点时间直接相加。阅读时重点看：

- 第一行时间与全部行时间。
- 哪个分支开始明显变慢。
- rows × loops 的累计工作量。
- 排序、哈希是否报告内存和磁盘信息。
- 总执行时间与应用观测是否一致。

第一次执行还可能包含冷缓存 I/O，第二次更多命中缓存。基准比较要控制缓存、并发和数据状态。

## Sort：为什么索引存在仍然排序

常见原因：

- ORDER BY 列顺序或方向不匹配。
- 联合索引前导列不是等值条件。
- 多个范围无法保持一个全局顺序。
- JOIN 或聚合改变了行顺序。
- 优化器认为扫描后排序更便宜。

PostgreSQL Sort 节点会在实际计划中显示算法和内存，例如 quicksort；数据大时可能显示 external merge 及磁盘用量。MySQL 可通过 TREE/ANALYZE、状态指标和性能工具继续判断。

`LIMIT 20` 可能让数据库使用 top-N 排序，而不是完整排序全部结果，但如果前置扫描仍产生百万行，LIMIT 并不会消除读取和过滤成本。

## 聚合计划关注输入粒度与内存

常见节点或操作包括：

- Hash Aggregate：按分组键维护哈希状态。
- Group Aggregate：消费已按分组键排序的输入。
- Sort + Aggregate：先排序再分组。
- 临时表或物化中间结果。

分析：

```sql
SELECT account_id, COUNT(*), SUM(amount)
FROM orders
WHERE status = 'paid'
GROUP BY account_id;
```

先看 status 过滤后进入聚合多少行，再看分组数估算是否准确，最后看哈希/排序是否溢出。只盯最终 97 行会忽略前面可能处理数百万订单。

## LIMIT 可能隐藏总工作量

有合适顺序索引时，LIMIT 能提前停止；没有时，数据库可能仍需：

1. 扫描所有符合条件的行。
2. 排序或维护 top-N。
3. 最后返回 20 行。

计划中的 Limit 在根节点不意味着下层只处理 20 行。沿树向下检查每个实际 rows 才能知道是否真正早停。

## CTE、子查询和视图可能被改写

SQL 中写了 CTE，不代表计划一定出现独立临时结果。优化器可能：

- 合并进外层查询。
- 物化一次后多次读取。
- 下推过滤条件。
- 把 IN/EXISTS 改写为半连接或反连接。

计划应按实际节点阅读，不要按 SQL 缩进猜执行顺序。若物化结果很大且外层只需要很少数据，检查条件为何没有下推；若 CTE 多次计算或物化，检查目标版本规则。

## BUFFERS 帮助区分 CPU 与 I/O

PostgreSQL BUFFERS 常见字段：

- `shared hit`：已在共享缓冲区命中。
- `shared read`：需要读取共享块。
- `local`：临时表使用的本地缓冲。
- `temp read/written`：临时文件 I/O，常见于溢出。

块数不是字节数，且父节点数字包含子节点。高 hit 仍消耗 CPU 和内存带宽；read 多也要结合操作系统缓存和存储延迟。一次热缓存执行不能代表冷启动。

## 统计信息过旧时先修复认知

造数或大批写入后应更新统计：

```sql
-- MySQL
ANALYZE TABLE orders;

-- PostgreSQL
ANALYZE orders;
```

生产执行需要评估 I/O 和锁影响。自动统计通常会工作，但大批导入、分区切换和分布突变后仍应验证。

不要通过关闭顺序扫描或强制索引长期掩盖统计问题。提示可以用于诊断对比，但长期使用需明确原因和回归测试。

## 单列统计无法理解列相关性

假设 `country='CN'` 与 `currency='CNY'` 强相关。若优化器独立估算两个条件，可能把联合选择性算得过低。

PostgreSQL 支持扩展统计，例如依赖关系、n-distinct 和最常见值组合。MySQL 可为列维护直方图，改善无索引列的数据分布估算。两者能力和配置不同，应先用实际计划证明估算问题，再增加统计复杂度。

统计只能帮助选择计划，不能替代用于访问路径和约束的索引。

## 参数敏感与数据倾斜

同一 SQL：

```sql
WHERE tenant_id = ?
```

小租户返回 10 行，大租户返回 1000 万行，最佳计划可能不同。准备语句、通用计划、计划缓存和参数嗅探行为在数据库及驱动间不同。

排查时保留参数上下文：

- 哪个 tenant_id、状态和时间范围慢？
- 慢参数是否属于高频值？
- 计划用的是具体参数还是通用估算？
- 接口是否允许无限时间范围？

不要只拿一个“正常租户”的参数复现生产慢查询。

## 计划中的红旗必须结合规模

值得调查的模式：

- 大表全扫描后只保留极少行。
- 估算与实际相差几个数量级。
- Nested Loop 内层执行数十万次。
- 排序或哈希溢出磁盘。
- 连接前行数意外倍增。
- 读取大量行后被 Filter 丢弃。
- LIMIT 之下仍处理海量数据。
- 计划快但应用仍慢，提示瓶颈在锁、网络或连接池。

“看到 Seq Scan”“看到 filesort”本身不是红旗；工作量和延迟才是。

## 从计划回到可验证的优化

每次只提出可验证假设：

```text
现象：读取 500 万行后按 account_id 过滤到 20 行。
假设：缺少以 account_id 开头并兼容排序的索引。
变更：在隔离环境添加候选联合索引。
验证：实际读取行数、排序节点和延迟下降，写入成本可接受。
```

可能的修复不只有索引：

- 缩小接口时间范围。
- 修正 JOIN 条件或重复行。
- 改用游标分页。
- 预聚合报表。
- 更新统计或扩展统计。
- 避免列函数和类型转换。
- 拆分过度通用的查询模板。

优化后必须验证结果集、NULL、排序和并发语义没有改变。

## 生产分析的安全清单

1. 从慢查询日志或追踪取得完整 SQL 指纹与参数形状。
2. 确认是副本、预发还是生产主库，并使用最小权限账号。
3. 先运行普通 EXPLAIN。
4. 检查语句是否只读，函数是否有副作用。
5. 设置超时，评估并发与资源上限。
6. 再决定是否运行 EXPLAIN ANALYZE。
7. 保存数据库版本、计划、统计时间和参数。
8. 在接近生产分布的数据上验证候选改动。
9. 同时观察 p95/p99、CPU、I/O、锁和复制延迟。
10. 通过迁移与回滚方案上线，不在控制台直接改生产索引。

## 安全运行 MySQL 示例

```bash
mysql \
  --host=127.0.0.1 \
  --port=3306 \
  --user=app_writer \
  --password \
  app_learning \
  < examples/database/10-mysql-reading-query-plans.sql
```

脚本生成 10,000 条临时订单，展示 TRADITIONAL、TREE 与实际执行计划，并分析列表查询、JOIN 和聚合。

## 安全运行 PostgreSQL 示例

```bash
psql \
  --host=127.0.0.1 \
  --port=5432 \
  --username=app_writer \
  --dbname=app_learning \
  --file=examples/database/10-postgresql-reading-query-plans.sql
```

两份脚本只创建会话临时表和索引，`EXPLAIN ANALYZE` 只执行 SELECT，不包含 UPDATE、DELETE、DROP 或永久结构变更。

### 预期观察点

- 临时订单共 10,000 行、账号 97 个。
- 账号列表查询使用联合索引，并在实际计划中显示估算与实际行数、时间和 loops。
- JOIN 计划会显示数据库选择的连接顺序与算法；具体节点可能因版本和统计略有不同。
- 聚合计划先处理大量 paid 订单，最终只输出约 97 个账号分组。
- PostgreSQL 实际计划包含 BUFFERS，可观察临时表的 local buffer 访问。
- 所有分析查询结束后，临时数据只在当前会话内存在。

## 本课小结

- 普通 EXPLAIN 展示估算，EXPLAIN ANALYZE 会真实执行。
- 计划树从叶子向根读取，追踪每层输入、输出、过滤与循环次数。
- cost 是内部成本单位，不是毫秒；行数估算偏差常是错误计划根源。
- 扫描节点要结合返回比例和表大小判断，不能见到全表扫描就判错。
- Index Cond 用于定位，Filter 在候选行上继续筛选。
- Nested Loop、Hash Join 和 Merge Join 各有适用输入规模与访问路径。
- actual rows/time 在多 loops 节点通常是每次平均值，要结合 loops。
- LIMIT 只有在下层能早停时才显著减少工作量。
- Sort、Hash 和 Aggregate 要关注内存、磁盘溢出及输入行数。
- BUFFERS 能帮助分析 I/O，但父子节点数字和缓存冷热需要正确解释。
- 统计信息、列相关性、参数倾斜会直接影响行数估算。
- 从计划提出单一假设，再用真实指标验证改动，不能凭节点名称优化。

## 官方资料

- [MySQL 8.4：EXPLAIN](https://dev.mysql.com/doc/refman/8.4/en/explain.html)
- [MySQL 8.4：EXPLAIN 输出格式](https://dev.mysql.com/doc/refman/8.4/en/explain-output.html)
- [MySQL 8.4：哈希连接优化](https://dev.mysql.com/doc/refman/8.4/en/hash-joins.html)
- [MySQL 8.4：优化器统计信息](https://dev.mysql.com/doc/refman/8.4/en/optimizer-statistics.html)
- [PostgreSQL 18：使用 EXPLAIN](https://www.postgresql.org/docs/18/using-explain.html)
- [PostgreSQL 18：EXPLAIN 命令](https://www.postgresql.org/docs/18/sql-explain.html)
- [PostgreSQL 18：规划器统计信息](https://www.postgresql.org/docs/18/planner-stats.html)
- [PostgreSQL 18：多变量统计示例](https://www.postgresql.org/docs/18/multivariate-statistics-examples.html)
