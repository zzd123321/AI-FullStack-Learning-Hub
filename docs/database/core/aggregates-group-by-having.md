---
title: 聚合查询：COUNT、SUM、GROUP BY 与 HAVING
description: 从订单统计接口出发，掌握聚合函数、分组、条件统计和多表汇总的正确边界
prev:
  text: 多表关系与 JOIN
  link: /database/core/relationships-and-joins
next:
  text: 子查询与 CTE：拆解复杂查询
  link: /database/core/subqueries-and-cte
---

# 聚合查询：COUNT、SUM、GROUP BY 与 HAVING

::: tip 第一次学习只抓住四件事
- **必须理解**：聚合会把多行压缩为统计结果；`WHERE` 在分组前过滤，`HAVING` 在分组后过滤。
- **必须会写**：`COUNT`、`SUM`、`GROUP BY`，并正确处理 `NULL` 和 JOIN 导致的重复计数。
- **必须完成**：实现一个按状态或日期分组的统计接口，并用明细查询抽样核对结果。
- **可以后看**：窗口函数、复杂条件聚合和报表性能优化。
:::

列表查询返回明细行，统计接口通常要回答另一类问题：

- 一共有多少个订单？
- 每个账号的订单数是多少？
- 每天的成交金额是多少？
- 哪些账号至少有两个有效订单？
- 所有订单明细的平均成交单价是多少？

聚合函数把多行压缩为一个结果，`GROUP BY` 决定按什么维度分别压缩。真正困难的不是记住 `COUNT` 和 `SUM`，而是先明确“每一行代表什么”“每一组代表什么”，并防止 JOIN 把同一业务金额重复计算。

## 本课目标与阅读路线

完成本课后，你应能先用一句话说清统计结果的**粒度**（一行对应一笔订单、一个账号还是一天），再选择聚合函数、`GROUP BY`、`WHERE` 与 `HAVING` 的位置；还能解释 `COUNT(*)` 与 `COUNT(column)` 对 `NULL` 的不同处理。它承接上一课的多表 JOIN，并为下一课用子查询与 CTE 拆分复杂统计打基础。

## 从统计接口契约开始

假设后端提供：

```text
GET /api/reports/orders
  ?placedFrom=2026-07-01T00:00:00Z
  &placedTo=2026-08-01T00:00:00Z
  &status=paid
  &groupBy=account
```

返回：

```json
{
  "items": [
    {
      "accountId": "101",
      "orderCount": 2,
      "orderAmount": "714.00"
    }
  ]
}
```

写 SQL 前必须定义：

- `orderCount` 统计订单行还是订单明细行？
- 取消订单是否排除？
- 金额包含运费、折扣、税费和退款吗？
- 时间按 UTC 日还是用户当地日分组？
- 没有订单的账号是否也要返回零？
- 金额和计数使用什么类型序列化？

这些都不是数据库能替产品自动决定的语义。

## 聚合函数把一组行变成一个值

常见聚合函数：

| 函数 | 含义 |
| --- | --- |
| `COUNT(*)` | 输入组中有多少行 |
| `COUNT(expression)` | 表达式结果不为 `NULL` 的行数 |
| `COUNT(DISTINCT expression)` | 不同且非空的表达式值数量 |
| `SUM(expression)` | 非空数值之和 |
| `AVG(expression)` | 非空数值的算术平均 |
| `MIN(expression)` | 最小非空值 |
| `MAX(expression)` | 最大非空值 |

没有 `GROUP BY` 时，所有通过 `FROM` 和 `WHERE` 的行形成一个整体组：

```sql
SELECT
  COUNT(*) AS line_count,
  SUM(quantity) AS unit_count,
  MIN(unit_price) AS minimum_unit_price,
  MAX(unit_price) AS maximum_unit_price,
  AVG(unit_price) AS average_line_unit_price
FROM learning_order_items;
```

结果只有一行。这里 `AVG(unit_price)` 是“每条明细行的单价平均”，不是“每件商品的加权平均”，两者稍后区分。

## COUNT(*) 与 COUNT(column) 不相同

假设订单明细的 `discount_amount` 允许 `NULL`，表示没有记录折扣：

```sql
SELECT
  COUNT(*) AS all_line_count,
  COUNT(discount_amount) AS lines_with_recorded_discount
FROM learning_order_items;
```

- `COUNT(*)` 统计每一行，不看列是否为空。
- `COUNT(discount_amount)` 只统计折扣列非空的行。

不能为了“写得更具体”随意把 `COUNT(*)` 改成 `COUNT(id)`。如果 `id` 确实 `NOT NULL`，两者行数相同；在 LEFT JOIN 或表达式可空时，含义可能完全不同。

### LEFT JOIN 中尤其重要

统计每个账号的订单数，并保留没有订单的账号：

```sql
SELECT
  a.id AS account_id,
  a.display_name,
  COUNT(*) AS joined_row_count,
  COUNT(o.id) AS order_count
FROM learning_accounts AS a
LEFT JOIN learning_orders AS o
  ON o.account_id = a.id
GROUP BY a.id, a.display_name
ORDER BY a.id;
```

没有订单的账号仍有一行 LEFT JOIN 补出的结果，所以 `COUNT(*)` 是 1；右表主键 `o.id` 为 `NULL`，所以 `COUNT(o.id)` 才是 0。

## 聚合函数如何处理 NULL 与空集

大多数常见聚合函数忽略 `NULL` 输入。`COUNT(*)` 不依赖某一列表达式，因此仍统计行。

更容易忽略的是空集：

```sql
SELECT
  COUNT(*) AS row_count,
  SUM(shipping_fee) AS shipping_fee_sum
FROM learning_orders
WHERE id < 0;
```

没有匹配行时：

- `COUNT(*)` 返回 `0`。
- `SUM(...)`、`AVG(...)`、`MIN(...)`、`MAX(...)` 通常返回 `NULL`，不是 `0`。

若接口契约需要金额零，可以显式转换：

```sql
COALESCE(SUM(shipping_fee), 0.00) AS shipping_fee_sum
```

不要无差别把所有 `NULL` 转成零。比如“没有任何评分”的平均值与“平均评分为 0”可能是不同业务状态。

## 表达式中的 NULL 也会传播

明细金额定义为：

```text
quantity × unit_price - discount_amount
```

若 `discount_amount` 是 `NULL`，直接计算会得到 `NULL`，这一行随后会被 `SUM` 忽略。应先明确 `NULL` 是否代表“无折扣”。若是，可以写：

```sql
SUM(
  quantity * unit_price - COALESCE(discount_amount, 0.00)
) AS subtotal
```

`COALESCE` 返回第一个非空参数。它修复的是已经定义清楚的缺失语义，不应该用来掩盖来源不明的数据空值。

## GROUP BY 决定结果粒度

按订单汇总明细：

```sql
SELECT
  order_id,
  COUNT(*) AS line_count,
  SUM(quantity) AS unit_count,
  SUM(
    quantity * unit_price - COALESCE(discount_amount, 0.00)
  ) AS item_amount
FROM learning_order_items
GROUP BY order_id
ORDER BY order_id;
```

`GROUP BY order_id` 表示“每个不同的订单 ID 形成一组”，所以结果每个订单一行。

如果改成：

```sql
GROUP BY order_id, product_id
```

粒度就变成“每个订单中的每个商品一组”。分组列越多，组通常越细，结果行通常越多。

写聚合查询前可以先用一句话描述结果粒度：

```text
每个账号一行
每个自然日和状态组合一行
每个订单一行
```

如果说不清每行代表什么，SQL 往往也还没有设计清楚。

## 非聚合列必须属于分组语义

下面的查询有问题：

```sql
SELECT
  account_id,
  status,
  COUNT(*)
FROM learning_orders
GROUP BY account_id;
```

一个账号可能同时有 paid、cancelled、shipped 订单，数据库无法确定这一组应该展示哪个 `status`。

可靠写法有三种方向：

1. 如果要按账号和状态分别统计，把两列都加入分组。
2. 如果只要账号统计，不选择单个订单的状态。
3. 如果要判断某种状态，用条件聚合表达。

```sql
SELECT
  account_id,
  status,
  COUNT(*) AS order_count
FROM learning_orders
GROUP BY account_id, status
ORDER BY account_id, status;
```

MySQL 默认启用 `ONLY_FULL_GROUP_BY`，会拒绝缺少分组依据且无法证明函数依赖的非聚合列。不要通过关闭它来让模糊查询运行；PostgreSQL 也遵循严格分组语义。跨库课程显式列出所有分组维度。

## WHERE 筛行，HAVING 筛组

需求：“只看 paid/shipped 订单，并找出至少有两个这类订单的账号。”

```sql
SELECT
  account_id,
  COUNT(*) AS billable_order_count
FROM learning_orders
WHERE status IN ('paid', 'shipped')
GROUP BY account_id
HAVING COUNT(*) >= 2
ORDER BY account_id;
```

逻辑顺序：

1. `WHERE` 在分组前排除 cancelled 等明细行。
2. `GROUP BY` 按账号形成组。
3. `COUNT(*)` 计算每组行数。
4. `HAVING` 保留计数至少为 2 的组。

聚合条件不能放进普通 `WHERE`：

```sql
-- 错误：WHERE 阶段还没有每组 COUNT(*)
WHERE COUNT(*) >= 2
```

即使 MySQL 允许在 `HAVING` 中引用部分输出别名，为保持跨库可读性，本课在 `HAVING` 中重复完整聚合表达式。

## 条件聚合：一次查询计算多个指标

统计每个账号的总订单数和各状态订单数：

```sql
SELECT
  account_id,
  COUNT(*) AS total_order_count,
  SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid_order_count,
  SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) AS shipped_order_count,
  SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_order_count
FROM learning_orders
GROUP BY account_id
ORDER BY account_id;
```

`CASE` 为符合条件的行产生 1，否则产生 0，再由 `SUM` 累加。它在 MySQL 与 PostgreSQL 中都可用。

条件金额也可以这样计算：

```sql
SUM(
  CASE
    WHEN status IN ('paid', 'shipped') THEN shipping_fee
    ELSE 0.00
  END
) AS billable_shipping_fee
```

PostgreSQL 支持聚合 `FILTER` 语法，但 MySQL 8.4 不支持同样写法；公共示例使用 `CASE` 保持可移植。

## 条件聚合与 LEFT JOIN 的零值

保留全部账号，并统计订单：

```sql
SELECT
  a.id AS account_id,
  a.display_name,
  COUNT(o.id) AS total_order_count,
  SUM(
    CASE
      WHEN o.status IN ('paid', 'shipped') THEN 1
      ELSE 0
    END
  ) AS billable_order_count
FROM learning_accounts AS a
LEFT JOIN learning_orders AS o
  ON o.account_id = a.id
GROUP BY a.id, a.display_name
ORDER BY a.id;
```

没有订单的账号会有一行空的右侧结果：`COUNT(o.id)` 为 0，`CASE` 进入 `ELSE 0`，因此可返回明确零值。

若条件写到 `WHERE o.status ...`，没有订单的账号会在分组前被过滤掉。与上一课一样，外连接中的筛选位置会改变结果。

## COUNT(DISTINCT ...) 能做什么

订单与明细 JOIN 后，一个订单会出现多行。若只想知道不同订单数，可以写：

```sql
COUNT(DISTINCT o.id) AS distinct_order_count
```

但 `DISTINCT` 不是重复计算的通用修复：

- 它只能对指定表达式去重。
- `SUM(DISTINCT shipping_fee)` 会把两个金额恰好相同但属于不同订单的运费错误合并。
- 多列不同计数的语法和空值细节有产品差异。
- 去重可能增加排序或哈希成本。

遇到一对多 JOIN，优先把每一侧先聚合到目标粒度，再连接。

## 多表聚合最危险的问题：重复计数

每个订单有一个 `shipping_fee`，每个订单又有多条明细。下面的查询会重复运费：

```sql
SELECT SUM(o.shipping_fee) AS wrong_shipping_fee_total
FROM learning_orders AS o
JOIN learning_order_items AS oi
  ON oi.order_id = o.id;
```

订单 5001 有两条明细，它的运费会被加两次；订单 5003 也有两条明细。示例数据得到错误总额 `40.00`，而订单表上的真实总运费是：

```sql
SELECT SUM(shipping_fee) AS correct_shipping_fee_total
FROM learning_orders;
```

结果为 `30.00`。

不要用 `SUM(DISTINCT o.shipping_fee)` 修复：若两个不同订单的运费都是 `10.00`，它只会加一次。

## 正确方向：先聚合到订单，再关联

先把明细聚合为“每个订单一行”：

```sql
WITH order_amounts AS (
  SELECT
    order_id,
    SUM(
      quantity * unit_price - COALESCE(discount_amount, 0.00)
    ) AS item_amount
  FROM learning_order_items
  GROUP BY order_id
)
SELECT
  o.account_id,
  COUNT(*) AS order_count,
  SUM(oa.item_amount + o.shipping_fee) AS order_amount
FROM learning_orders AS o
JOIN order_amounts AS oa
  ON oa.order_id = o.id
WHERE o.status <> 'cancelled'
GROUP BY o.account_id
ORDER BY o.account_id;
```

CTE `order_amounts` 已保证每个订单只有一行，再与订单表一对一连接，运费不会因商品明细数重复。

这个模式非常重要：

```text
先确认目标粒度 → 每个来源预聚合到该粒度 → 再 JOIN → 最后汇总
```

如果同时 JOIN 订单明细、支付记录和物流事件，三个一对多关系可能互相相乘，重复金额会更隐蔽。

## AVG 与加权平均不是一回事

直接写：

```sql
AVG(unit_price)
```

每条明细行权重相同。买 1 件和买 100 件的明细对平均值影响相同。

若指标是“每件售出商品的平均单价”，应按数量加权：

```sql
SELECT
  SUM(quantity * unit_price) / NULLIF(SUM(quantity) * 1.0, 0.0)
    AS weighted_average_unit_price
FROM learning_order_items;
```

`NULLIF(SUM(quantity), 0)` 在总数量为 0 时返回 `NULL`，避免除零。是否扣除折扣、如何分摊订单级优惠，仍由指标定义决定。

平均值最容易被名称误导。接口字段应写清楚分母是什么，例如：

- `averageOrderAmount`：总订单金额 / 订单数。
- `averageLinePrice`：明细单价之和 / 明细行数。
- `averageUnitPrice`：商品金额 / 商品件数。

## 按日期分组先确定时区

按日统计的标准写法可以从类型转换开始：

```sql
SELECT
  CAST(placed_at AS DATE) AS order_date,
  status,
  COUNT(*) AS order_count
FROM learning_orders
GROUP BY CAST(placed_at AS DATE), status
ORDER BY order_date, status;
```

但对时间点字段，`CAST(... AS DATE)` 会依据数据库值或会话时区得到日期。同一 UTC 时间点在上海和洛杉矶可能属于不同日。

报表必须先定义统计时区，再做日期截断：

- MySQL 需要结合会话时区、`CONVERT_TZ` 和时区表配置。
- PostgreSQL 常结合 `AT TIME ZONE`、`date_trunc` 或类型转换。

产品专属日期函数不同，不要把开发机默认时区当作报表规则。高流量报表还可能预计算日维度或维护汇总表，但必须先保证基础语义正确。

## NULL 也会形成一个分组

如果按可空列分组，所有 `NULL` 值会进入同一个组：

```sql
SELECT shipped_at, COUNT(*)
FROM learning_orders
GROUP BY shipped_at;
```

这不代表 `NULL = NULL` 在普通比较中为真，而是 GROUP BY 对分组等价性的处理。报表展示时可以用 `CASE` 或 `COALESCE` 映射为“未发货”，但要避免与真实存储值混淆。

## 聚合结果仍需要明确排序

`GROUP BY` 不保证输出顺序。即使某次结果看起来按账号排列，也必须显式写：

```sql
ORDER BY account_id
```

按聚合结果排序：

```sql
SELECT
  account_id,
  COUNT(*) AS order_count
FROM learning_orders
GROUP BY account_id
ORDER BY order_count DESC, account_id;
```

`account_id` 是并列时的稳定决胜列。报表分页也需要唯一、稳定排序；否则并列组可能跨页移动。

## 聚合结果类型与 API 序列化

聚合输出类型不一定与输入列完全相同：

- 大量行的 `COUNT` 可能超过 32 位整数。
- 整数列的 `SUM` 可能提升到更宽类型。
- 精确数值 `AVG` 可能返回高精度结果。
- 驱动可能把 64 位计数或 `DECIMAL`/`NUMERIC` 映射成字符串。

后端 DTO 不应想当然地使用 JavaScript `number`。金额和可能很大的计数可以用字符串传输，并在接口文档中稳定声明格式。

不要在 SQL 中过早把金额格式化为带货币符号的文本。数据库负责精确计算，API/展示层负责本地化格式。

## 精确 COUNT 不是免费的元数据

`COUNT(*)` 语法简单，不代表大表精确计数是常数时间。数据库可能需要扫描大量表行或索引项，筛选、JOIN 和分组会增加工作量。

设计统计接口时要问：

- 是否必须实时精确？
- 可否返回近似值或延迟汇总？
- 是否可以按时间范围限制？
- 是否需要缓存或预计算？
- 查询是否有支持筛选和分组的索引？

这些问题会在索引、执行计划和缓存章节继续处理。当前阶段先写对，再测量和优化。

## 参数化与动态分组

时间范围、状态等数据值继续使用占位符：

```sql
SELECT
  account_id,
  COUNT(*) AS order_count
FROM learning_orders
WHERE placed_at >= ?
  AND placed_at < ?
  AND status = ?
GROUP BY account_id
ORDER BY account_id;
```

`groupBy=account` 不能直接拼成任意 SQL。和动态排序一样，后端应使用允许列表选择固定查询模板：

| API 分组值 | 固定 SQL 维度 |
| --- | --- |
| `account` | `account_id` |
| `status` | `status` |
| `day` | 经明确时区转换后的日期表达式 |

不同分组维度往往对应不同输出结构和索引策略，固定模板比“任意字段报表生成器”更容易保证安全和性能。

## 排查统计数字不对的顺序

1. 用一句话定义结果每行的粒度。
2. 确认输入明细在 JOIN 前每行代表什么。
3. 单独运行 `FROM + JOIN + WHERE`，暂时不聚合，观察行数。
4. 检查一对多关系是否让金额或父行重复。
5. 区分 `COUNT(*)`、`COUNT(column)` 和 `COUNT(DISTINCT ...)`。
6. 检查 `NULL` 是否被聚合忽略或在表达式中传播。
7. 确认 WHERE 与 HAVING 分别筛的是明细还是组。
8. 检查取消、退款、折扣、运费等业务口径。
9. 对少量手算数据逐项核对，再扩大数据量。

当报表结果“差一点”时，不要先用四舍五入或 `DISTINCT` 掩盖；重复 JOIN、状态口径和时间边界才是更常见的原因。

## 安全运行完整示例

完整脚本创建账号、订单和订单明细三张会话临时表，插入演示数据并执行只读聚合：

```bash
# MySQL 8.4
mysql \
  --host=127.0.0.1 \
  --port=3306 \
  --user=app_writer \
  --password \
  app_learning \
  < examples/database/06-aggregates-group-by-having.sql
```

```bash
# PostgreSQL 18
psql \
  --host=127.0.0.1 \
  --port=5432 \
  --username=app_writer \
  --dbname=app_learning \
  --file=examples/database/06-aggregates-group-by-having.sql
```

脚本只写会话临时表，不包含永久数据修改或删除。

### 预期结果检查点

- 订单明细共有 7 行、售出 11 件，其中 2 行记录了非空折扣。
- 空集的 `COUNT(*)` 为 0，原始 `SUM` 为 `NULL`，`COALESCE` 后为 `0.00`。
- 每个订单的明细金额依次为：5001=`619.00`、5002=`39.00`、5003=`229.00`、5004=`399.00`、5005=`80.00`。
- paid/shipped 订单至少两个的账号只有 101。
- LEFT JOIN 统计中，账号 104 的 `joined_row_count=1`，但 `order_count=0`。
- JOIN 明细后错误运费总和为 `40.00`，直接按订单统计的正确值为 `30.00`。
- 排除 cancelled 后，账号 101 的订单数为 2、订单金额为 `714.00`。
- 按商品数量加权的平均单价约为 `126.45`，与明细行单价的简单平均不是同一指标。

## 本课小结

- 聚合查询先定义结果粒度，再选择函数和分组维度。
- `COUNT(*)` 统计行，`COUNT(column)` 忽略该列表达式为 NULL 的行。
- 空集的 COUNT 为 0，多数其他聚合返回 NULL；是否转零取决于业务契约。
- GROUP BY 后，非聚合列必须属于明确的分组语义。
- WHERE 在分组前筛明细，HAVING 在聚合后筛组。
- 条件聚合可用 `SUM(CASE WHEN ... THEN 1 ELSE 0 END)` 跨库实现。
- LEFT JOIN 统计零关联行时通常使用 `COUNT(right_table.id)`。
- 一对多 JOIN 会重复父表金额；`SUM(DISTINCT ...)` 不是可靠修复。
- 多表统计应先把每个来源预聚合到目标粒度，再 JOIN。
- AVG 必须明确分母；按件平均通常需要数量加权。
- 按日分组必须先定义统计时区。
- 聚合结果类型可能比输入更宽，API 要安全传输大整数和精确小数。

## 官方资料

- [MySQL 8.4：聚合函数](https://dev.mysql.com/doc/refman/8.4/en/aggregate-functions.html)
- [MySQL 8.4：GROUP BY 处理与 ONLY_FULL_GROUP_BY](https://dev.mysql.com/doc/refman/8.4/en/group-by-handling.html)
- [MySQL 8.4：GROUP BY 修饰符](https://dev.mysql.com/doc/refman/8.4/en/group-by-modifiers.html)
- [MySQL 8.4：SELECT](https://dev.mysql.com/doc/refman/8.4/en/select.html)
- [PostgreSQL 18：聚合函数](https://www.postgresql.org/docs/18/functions-aggregate.html)
- [PostgreSQL 18：GROUP BY 与 HAVING](https://www.postgresql.org/docs/18/queries-table-expressions.html#QUERIES-GROUP)
- [PostgreSQL 18：SELECT](https://www.postgresql.org/docs/18/sql-select.html)
