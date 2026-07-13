---
title: 子查询与 CTE：拆解复杂查询
description: 从订单筛选与统计接口出发，掌握标量子查询、EXISTS、派生表、相关子查询和递归 CTE
prev:
  text: 聚合查询：COUNT、SUM、GROUP BY 与 HAVING
  link: /database/aggregates-group-by-having
---

# 子查询与 CTE：拆解复杂查询

当接口需要“找出存在大额订单的账号”“返回高于账号自身平均金额的订单”或“展示组织树”时，一层 `SELECT` 往往不够。SQL 允许把一个查询放进另一个查询，也允许用 `WITH` 给中间结果命名。

子查询和 CTE 的价值不是让 SQL 显得高级，而是把复杂问题拆成有明确输入、输出和粒度的小步骤。写错时，它们也会带来多行标量错误、`NOT IN` 的 NULL 陷阱、重复计算和难以理解的执行计划。

## 从接口问题判断需要什么结果

假设订单后台有三个接口：

```text
GET /api/accounts?hasOrderAtLeast=200.00
GET /api/orders?aboveAccountAverage=true
GET /api/org-units/tree
```

它们分别在问：

1. 对每个账号，是否存在满足金额条件的订单？
2. 对每个订单，它是否高于所属账号的平均订单金额？
3. 从根组织开始，如何逐层找到所有后代？

对应的常见工具是：

| 问题形状 | 常用工具 |
| --- | --- |
| 需要另一个查询算出的单个值 | 标量子查询 |
| 只关心关联行是否存在 | `EXISTS` / `NOT EXISTS` |
| 先得到一张中间结果表 | 派生表或普通 CTE |
| 子查询要读取当前外层行 | 相关子查询 |
| 重复沿父子关系向下或向上查找 | 递归 CTE |

先判断结果形状，再选语法；不要看到“多表”就一律 JOIN，也不要看到“复杂”就无限嵌套。

## 子查询是嵌套在语句里的查询

最简单的例子：找出金额高于所有有效订单平均金额的订单。

```sql
SELECT id, account_id, amount
FROM learning_orders
WHERE status IN ('paid', 'shipped')
  AND amount > (
    SELECT AVG(amount)
    FROM learning_orders
    WHERE status IN ('paid', 'shipped')
  )
ORDER BY id;
```

括号内是子查询，外面是外层查询。内层 `AVG` 在这里返回一个值，所以可放在 `>` 右侧。

阅读时建议先单独运行内层查询：

```sql
SELECT AVG(amount)
FROM learning_orders
WHERE status IN ('paid', 'shipped');
```

样例结果是 `155.00`。确认内层的列数、行数和 NULL 语义后，再把它嵌回外层。

## 标量子查询必须至多返回一行一列

标量位置只能接受一个值：

```sql
SELECT
  id,
  amount,
  (
    SELECT AVG(amount)
    FROM learning_orders
    WHERE status IN ('paid', 'shipped')
  ) AS overall_average_amount
FROM learning_orders
ORDER BY id;
```

聚合查询没有 `GROUP BY` 时，即使输入为空，也会形成一个聚合结果行，因此这里的 `AVG` 适合作为标量子查询；空集时值为 NULL。

下面的写法不安全：

```sql
-- 一个账号可能有多笔订单，子查询可能返回多行。
SELECT id
FROM learning_accounts
WHERE id = (
  SELECT account_id
  FROM learning_orders
  WHERE status = 'paid'
);
```

如果内层返回多行，数据库会报错，而不是随便挑一行。不要用没有业务排序的 `LIMIT 1` 隐藏建模错误。正确方向取决于意图：

- 判断账号是否在结果集合中：使用 `IN` 或 `EXISTS`。
- 只取唯一业务值：用唯一约束保证最多一行。
- 求最大、最小或平均值：明确使用相应聚合。
- 取“最新一笔”：定义稳定排序，并处理并列规则。

## 子查询返回零行时发生什么

标量子查询返回零行时，其结果按 NULL 处理。于是：

```sql
amount > (返回零行的标量子查询)
```

会得到 UNKNOWN，`WHERE` 不会保留该行。后端看到空结果时，应区分“确实没有匹配数据”与“查询口径因 NULL 变成未知”。

如果产品要求缺失阈值取零，可以显式写 `COALESCE`，但这是一项业务决定：

```sql
amount > COALESCE((子查询), 0.00)
```

## IN：与子查询返回的一列比较

找出被暂停表记录的账号：

```sql
SELECT id, display_name
FROM learning_accounts
WHERE id IN (
  SELECT account_id
  FROM learning_suspensions
)
ORDER BY id;
```

`IN (subquery)` 的子查询必须返回一列，可以返回多行。重复值不会让外层账号重复，因为 `IN` 是条件判断，不是把两边行组合起来。

如果只是和后端已经拿到的一组固定值比较，通常使用参数占位符列表，而不是为了使用子查询而制造子查询：

```sql
WHERE status IN (?, ?)
```

占位符数量应由后端安全构造，值本身仍然绑定。

## NOT IN 最危险的地方是 NULL

直觉上，下面像是在找“未被暂停的账号”：

```sql
SELECT id, display_name
FROM learning_accounts
WHERE id NOT IN (
  SELECT account_id
  FROM learning_suspensions
)
ORDER BY id;
```

但只要子查询结果中含有一个 NULL，判断就可能变成 UNKNOWN，最终一行也不返回。

以 `id=101` 为例，假设右侧是 `(102, NULL)`：

```text
101 <> 102 AND 101 <> NULL
TRUE      AND UNKNOWN
= UNKNOWN
```

`WHERE` 只保留 TRUE，不保留 UNKNOWN。

即使当前列声明为 `NOT NULL`，将来 JOIN、表达式或数据迁移也可能引入 NULL 语义。做反向关联判断时，`NOT EXISTS` 通常更直接可靠。

## EXISTS：只判断是否至少存在一行

找出至少有一笔金额不低于 `200.00` 的有效订单账号：

```sql
SELECT a.id, a.display_name
FROM learning_accounts AS a
WHERE EXISTS (
  SELECT 1
  FROM learning_orders AS o
  WHERE o.account_id = a.id
    AND o.status IN ('paid', 'shipped')
    AND o.amount >= 200.00
)
ORDER BY a.id;
```

内层的 `o.account_id = a.id` 引用了外层当前账号，因此这是相关子查询。语义是：对当前账号，是否至少存在一行满足条件的订单。

`SELECT 1` 是表达“并不使用内层列值”的惯例。对 `EXISTS` 而言，选择 `1`、`o.id` 或 `*` 都不改变真假；关键是是否返回行。

结果不会因一个账号匹配三笔订单而重复三次，这正适合 `hasOrders=true` 一类接口条件。

## NOT EXISTS：表达“没有关联行”

安全找出不在暂停表中的账号：

```sql
SELECT a.id, a.display_name
FROM learning_accounts AS a
WHERE NOT EXISTS (
  SELECT 1
  FROM learning_suspensions AS s
  WHERE s.account_id = a.id
)
ORDER BY a.id;
```

暂停表中无关的 NULL 行不会匹配任何 `a.id`，也不会污染其他账号的判断。样例会返回 101、103、104。

找出没有有效订单的账号同理：

```sql
SELECT a.id, a.display_name
FROM learning_accounts AS a
WHERE NOT EXISTS (
  SELECT 1
  FROM learning_orders AS o
  WHERE o.account_id = a.id
    AND o.status IN ('paid', 'shipped')
)
ORDER BY a.id;
```

样例中返回账号 104。

## EXISTS、JOIN 和 IN 如何选择

它们有时能表达相似结果，但应先按语义选择：

| 目标 | 通常优先考虑 |
| --- | --- |
| 需要关联表的列并组合行 | `JOIN` |
| 只判断是否有关联行 | `EXISTS` |
| 与一个单列结果集合比较 | `IN` |
| 确认没有关联行 | `NOT EXISTS` |

现代优化器可能把 `IN`、`EXISTS` 转成半连接，也可能物化中间结果。不能仅凭 SQL 外形断言谁更快；后续要用真实数据分布和执行计划验证。

语义清楚比猜测优化器更重要。例如为了消除 JOIN 导致的重复而随手加 `DISTINCT`，往往是在掩盖本应使用 `EXISTS` 的事实。

## 相关子查询依赖外层当前行

找出金额高于“该账号自身有效订单平均金额”的订单：

```sql
SELECT o.id, o.account_id, o.amount
FROM learning_orders AS o
WHERE o.status IN ('paid', 'shipped')
  AND o.amount > (
    SELECT AVG(peer.amount)
    FROM learning_orders AS peer
    WHERE peer.account_id = o.account_id
      AND peer.status IN ('paid', 'shipped')
  )
ORDER BY o.id;
```

内层读取 `o.account_id`，所以它不能脱离外层当前行来理解。样例中账号 103 的有效订单平均金额是 `150.00`，只有金额 `220.00` 的订单 5005 高于平均值。

### 列名必须使用别名限定

相关子查询同时出现同一张表的两个实例，省略别名很容易引用错层级：

```sql
peer.account_id = o.account_id
```

不要写成含糊的 `account_id = account_id`；后者很可能在同一作用域内自我比较，条件失去意义。

### 不要把“相关”直接等同于“每行执行一次”

从逻辑语义看，相关子查询依赖外层行；从物理执行看，优化器可能改写为 JOIN、缓存结果、使用半连接或采用其他策略。性能结论必须看 `EXPLAIN` 和实测，不能只数 SQL 里嵌套了几层。

但相关条件上的连接列通常值得关注索引，例如：

```text
learning_orders(account_id, status)
```

索引是否有效还取决于选择性、查询列、数据量和数据库实际计划，下一阶段会系统学习。

## FROM 中的子查询是一张派生表

把每个账号的有效订单先聚合，再与账号表关联：

```sql
SELECT
  a.id,
  a.display_name,
  totals.order_count,
  totals.order_amount
FROM learning_accounts AS a
JOIN (
  SELECT
    account_id,
    COUNT(*) AS order_count,
    SUM(amount) AS order_amount
  FROM learning_orders
  WHERE status IN ('paid', 'shipped')
  GROUP BY account_id
) AS totals
  ON totals.account_id = a.id
ORDER BY a.id;
```

括号内结果在 `FROM` 中充当表，所以称为派生表。它的每行粒度是“一个账号”，外层 JOIN 不会把订单明细重新展开。

派生表应显式起别名 `totals`。列别名 `order_count`、`order_amount` 则定义了它向外暴露的结构。

## 派生表内部 ORDER BY 不保证最终顺序

最终结果的顺序只由最外层 `ORDER BY` 保证：

```sql
SELECT *
FROM (
  SELECT id, amount
  FROM learning_orders
  ORDER BY amount DESC
) AS ordered_orders;
```

不能依赖这段内层排序让外层结果保持顺序。若接口要求排序，必须在最外层明确写 `ORDER BY`，并按分页规则加入唯一决胜列。

当内层 `ORDER BY` 与 `LIMIT` 一起用于定义“前 N 行”时，它决定的是派生表选哪些行；外层展示顺序仍要单独声明。

## CTE：给当前语句的中间结果命名

CTE 使用 `WITH`，可以把上面的派生表改写为：

```sql
WITH account_totals AS (
  SELECT
    account_id,
    COUNT(*) AS order_count,
    SUM(amount) AS order_amount
  FROM learning_orders
  WHERE status IN ('paid', 'shipped')
  GROUP BY account_id
)
SELECT
  a.id,
  a.display_name,
  t.order_count,
  t.order_amount
FROM learning_accounts AS a
JOIN account_totals AS t
  ON t.account_id = a.id
ORDER BY a.id;
```

`account_totals` 只在这一条语句中可见。它不是持久表，也不是跨请求共享的临时表，更不会自动缓存到下一条 SQL。

普通 CTE 的主要价值是：

- 给中间结果取业务名称。
- 让每一步的列和粒度更容易审查。
- 避免把同一查询文本嵌套多层。
- 在一个语句中多次引用同一逻辑结果。

## 多个 CTE 按依赖顺序组成流水线

下面把“有效订单”和“账号汇总”拆成两步，并用 LEFT JOIN 保留零订单账号：

```sql
WITH
billable_orders AS (
  SELECT id, account_id, amount
  FROM learning_orders
  WHERE status IN ('paid', 'shipped')
),
account_totals AS (
  SELECT
    account_id,
    COUNT(*) AS order_count,
    SUM(amount) AS order_amount
  FROM billable_orders
  GROUP BY account_id
)
SELECT
  a.id,
  a.display_name,
  COALESCE(t.order_count, 0) AS order_count,
  COALESCE(t.order_amount, 0.00) AS order_amount
FROM learning_accounts AS a
LEFT JOIN account_totals AS t
  ON t.account_id = a.id
ORDER BY a.id;
```

阅读时逐步问：

1. `billable_orders` 每行是一笔有效订单。
2. `account_totals` 每行是一个至少有有效订单的账号。
3. 最终结果每行是系统中的一个账号，包括零订单账号。

这比从最外层倒着追踪三层括号更适合团队评审和接口排错。

## CTE 不是天然的性能优化

不要认为“写成 CTE 就只计算一次”或“CTE 一定先生成临时表”。MySQL 和 PostgreSQL 的优化器都可能根据查询形状选择：

- 把 CTE 合并进外层查询。
- 将中间结果物化后再读取。
- 推送外层条件。
- 对多次引用采用不同处理策略。

数据库版本、是否递归、引用次数、聚合、去重、限制条件等都会影响决策。CTE 首先是表达结构，不是性能指令。

当性能重要时：

1. 在目标版本和接近生产的数据量上执行 `EXPLAIN`。
2. 看实际扫描行数、循环次数、中间结果和耗时。
3. 比较 CTE、派生表、JOIN 或其他等价写法。
4. 用测试确认改写没有改变 NULL、重复行和边界语义。

## CTE 与临时表不同

| 特性 | CTE | 会话临时表 |
| --- | --- | --- |
| 可见范围 | 当前一条语句 | 当前数据库会话 |
| 是否需要建表语句 | 否 | 是 |
| 能否被后续多条 SQL 使用 | 否 | 可以 |
| 是否有独立表结构和索引操作 | 通常没有 | 取决于数据库能力 |
| 事务与连接池风险 | 较低 | 要管理会话复用与清理 |

连接池会复用数据库会话。若应用在一个请求中创建临时表，却假设下一个请求使用同一连接，行为会变得脆弱。普通接口查询优先使用单条 SQL、派生表或 CTE；确实需要临时表时，要明确连接生命周期和事务边界。

## 递归 CTE：处理层级关系

组织单元表使用邻接表模型：

```text
id | parent_id | name
1  | NULL      | 总部
2  | 1         | 研发中心
4  | 2         | 平台组
```

要从根节点逐层展开后代，可以写：

```sql
WITH RECURSIVE org_tree AS (
  SELECT
    id,
    parent_id,
    name,
    0 AS depth
  FROM learning_org_units
  WHERE parent_id IS NULL

  UNION ALL

  SELECT
    child.id,
    child.parent_id,
    child.name,
    parent.depth + 1 AS depth
  FROM learning_org_units AS child
  JOIN org_tree AS parent
    ON child.parent_id = parent.id
)
SELECT id, parent_id, name, depth
FROM org_tree
ORDER BY depth, id;
```

递归 CTE 有两部分：

- 锚点成员：找到起点，这里是所有根组织。
- 递归成员：用上一轮结果找到下一层子节点。

`UNION ALL` 把各轮结果合并，直到递归成员不再产生新行。样例深度从总部的 0 逐层增加。

## 递归查询必须防御环和失控深度

如果数据出现 `A → B → C → A`，简单的 `UNION ALL` 递归可能不断产生行，直到数据库的递归限制或资源限制终止查询。

生产设计应组合使用：

- 写入时验证父节点不能是自身。
- 变更父节点时检查不能挂到自己的后代下。
- 依据业务设置合理最大深度。
- 查询中维护访问路径或已访问集合并检测环。
- 保留数据库的递归上限和查询超时保护。

MySQL 与 PostgreSQL 在路径数组、字符串拼接、循环检测和递归限制配置上存在差异。跨库基础示例只计算深度；真正的组织树接口应针对目标数据库实现并测试防环策略。

## 递归结果的顺序不是树的展示顺序

递归求值产生行的内部顺序不应被接口依赖。示例用：

```sql
ORDER BY depth, id
```

得到稳定的按层结果，但它不一定等于前端需要的深度优先树顺序。常见做法是：

- SQL 返回 `id`、`parent_id` 和稳定排序字段，后端组装嵌套树。
- 针对目标数据库计算可排序路径。
- 为同级节点保存明确的 `sort_order`，不要依赖主键碰巧递增。

## 子查询中的参数仍要绑定

子查询不改变 SQL 注入规则：

```sql
SELECT a.id, a.display_name
FROM learning_accounts AS a
WHERE EXISTS (
  SELECT 1
  FROM learning_orders AS o
  WHERE o.account_id = a.id
    AND o.amount >= ?
    AND o.placed_at >= ?
    AND o.placed_at < ?
)
ORDER BY a.id;
```

金额和时间边界都是数据值，必须绑定。动态选择 `EXISTS` 查询模板、排序列或分组方式时，使用允许列表组合固定 SQL 片段，不把用户输入直接拼入语句。

## API 查询不要制造 N+1

一种常见错误是：

1. 先查询 100 个账号。
2. 后端循环 100 次，分别查询每个账号的订单数。

这会制造 N+1 次往返。数据库每次查询可能很快，但网络、连接池和解析执行开销会累积。

可以用聚合派生表、CTE 或一次批量查询完成：

```sql
WITH account_totals AS (
  SELECT account_id, COUNT(*) AS order_count
  FROM learning_orders
  GROUP BY account_id
)
SELECT
  a.id,
  COALESCE(t.order_count, 0) AS order_count
FROM learning_accounts AS a
LEFT JOIN account_totals AS t
  ON t.account_id = a.id
ORDER BY a.id;
```

但也不要把所有接口都塞进一条巨大 SQL。合理边界是：一次查询完成一个一致的接口数据需求，同时让结果粒度、执行计划和错误处理仍可理解。

## 选择子查询、CTE 还是后端代码

适合留在 SQL 中的工作：

- 基于数据库当前快照进行筛选、关联、聚合。
- 用 `EXISTS` 判断关联事实。
- 在集合内完成批量计算，避免逐行往返。
- 对层级数据做受控递归。

适合后端处理的工作：

- 调用外部服务后才能决定的规则。
- 复杂展示格式和本地化。
- 需要明确领域对象行为的流程编排。
- SQL 实现会严重绑定某一数据库且收益很小的逻辑。

这不是“SQL 越少越好”或“一个 SQL 解决一切”，而是让计算靠近最合适的数据和一致性边界。

## 排查复杂查询的顺序

1. 用一句话定义最终结果每行的粒度。
2. 把每个子查询或 CTE 单独运行，确认列数、行数和样例值。
3. 检查标量子查询是否真的至多返回一行一列。
4. 检查 `IN`/`NOT IN` 的右侧是否可能含 NULL。
5. 只判断存在性时，确认是否应使用 `EXISTS`。
6. 检查相关子查询的外层引用是否用了正确别名。
7. 检查派生表或 CTE 聚合后的粒度是否会被 JOIN 再次放大。
8. 确认最外层有接口需要的稳定排序。
9. 对递归查询检查起点、终止条件、环和最大深度。
10. 最后再看执行计划和索引，不用错误语义换速度。

## 安全运行完整示例

配套脚本创建账号、订单、暂停记录和组织单元四张会话临时表。除向临时表插入固定演示数据外，所有业务示例均为只读查询：

```bash
# MySQL 8.4
mysql \
  --host=127.0.0.1 \
  --port=3306 \
  --user=app_writer \
  --password \
  app_learning \
  < examples/database/07-subqueries-and-cte.sql
```

```bash
# PostgreSQL 18
psql \
  --host=127.0.0.1 \
  --port=5432 \
  --username=app_writer \
  --dbname=app_learning \
  --file=examples/database/07-subqueries-and-cte.sql
```

脚本只使用当前会话可见的临时表，不包含永久数据修改或删除。

### 预期结果检查点

- 有效订单的整体平均金额为 `155.00`，高于它的是订单 5003 和 5005。
- 金额不低于 `200.00` 的有效订单账号是 102 和 103。
- 暂停记录中含有账号 102 和一条 NULL；带 NULL 的 `NOT IN` 查询返回 0 行。
- 使用 `NOT EXISTS` 查找未暂停账号时，返回 101、103、104。
- 没有有效订单的账号只有 104。
- 高于账号自身有效订单平均金额的订单只有 5005。
- CTE 汇总中账号 103 有 2 笔有效订单、金额 `300.00`，账号 104 的计数和金额为零。
- 组织树共有 6 个节点，根节点深度为 0，平台组和应用组深度为 2。

## 本课小结

- 子查询可以返回标量、行、列或表，使用位置必须匹配结果形状。
- 标量子查询必须至多返回一行一列；零行按 NULL 处理。
- `IN` 适合与单列集合比较，`NOT IN` 会被右侧 NULL 污染。
- 只判断关联行存在或不存在时，优先表达为 `EXISTS` / `NOT EXISTS`。
- 相关子查询读取外层当前行，列名应使用清晰的表别名限定。
- `FROM` 中的子查询是派生表，必须明确输出列和结果粒度。
- CTE 只在当前语句内可见，主要用于命名和拆解中间结果。
- CTE 可能被合并或物化，不是天然缓存或性能优化。
- 递归 CTE 由锚点成员和递归成员组成，生产使用必须防环和限制深度。
- 复杂 SQL 应逐层验证语义，再用执行计划和实测优化。

## 官方资料

- [MySQL 8.4：子查询](https://dev.mysql.com/doc/refman/8.4/en/subqueries.html)
- [MySQL 8.4：EXISTS 与 NOT EXISTS](https://dev.mysql.com/doc/refman/8.4/en/exists-and-not-exists-subqueries.html)
- [MySQL 8.4：WITH 与公共表表达式](https://dev.mysql.com/doc/refman/8.4/en/with.html)
- [MySQL 8.4：子查询、派生表与 CTE 优化](https://dev.mysql.com/doc/refman/8.4/en/subquery-optimization.html)
- [PostgreSQL 18：子查询表达式](https://www.postgresql.org/docs/18/functions-subquery.html)
- [PostgreSQL 18：表表达式与派生表](https://www.postgresql.org/docs/18/queries-table-expressions.html)
- [PostgreSQL 18：WITH 查询与递归 CTE](https://www.postgresql.org/docs/18/queries-with.html)
