---
title: 从列表接口到可靠 SELECT：筛选、排序与分页
description: 把列表接口的查询参数转成安全、稳定、可分页的 MySQL 与 PostgreSQL 查询
prev:
  text: 数据类型、NULL、默认值与约束
  link: /database/core/data-types-defaults-and-constraints
next:
  text: 安全写入数据：INSERT、UPDATE、DELETE 与幂等边界
  link: /database/core/safe-insert-update-delete
---

# 从列表接口到可靠 SELECT：筛选、排序与分页

::: tip 第一次学习只抓住四件事
- **必须理解**：查询参数要经过验证和参数绑定；排序必须稳定；页大小必须有限制。
- **必须会写**：`SELECT`、`WHERE`、`ORDER BY`、`LIMIT`，并给排序字段追加唯一主键作为决胜条件。
- **必须完成**：实现一个带筛选、稳定排序和受限分页的列表接口查询。
- **可以后看**：复杂关键词转义、keyset 分页的全部变体和精确总数优化。数据量变大时再深入。
:::

列表接口看起来只是“查一批数据”，真正上线后却很容易出现这些问题：

- 同一页刷新后顺序变化。
- 翻到下一页时出现重复或遗漏。
- 关键词里的 `%`、`_` 得到意外匹配。
- 状态和时间条件组合后结果比预期更多。
- 页码越靠后，响应越慢。
- 查询参数被直接拼进 SQL，形成注入风险。

这一节从一个订单列表接口出发，把投影、筛选、排序、计数和两种分页方式组织成一条可靠的查询链路。

## 本课目标与阅读路线

完成本课后，你应能把 API 的查询参数转换为有明确类型、稳定排序和参数绑定的 SQL，并能解释 offset 分页为何会在数据变化时重复或遗漏、keyset 分页为何需要连续且唯一的排序键。它使用上一课定义的类型与约束，并为多表 JOIN、聚合和索引设计提供典型查询形状。

## 从接口契约开始

假设前端请求：

```text
GET /api/orders
  ?accountId=101
  &status=paid
  &minAmount=100.00
  &placedFrom=2026-07-01T00:00:00Z
  &placedTo=2026-08-01T00:00:00Z
  &sort=placedAt
  &direction=desc
  &page=1
  &pageSize=20
```

后端不能把整段查询字符串机械翻译成 SQL。它要先定义：

- 哪些字段允许筛选。
- 时间区间的起点和终点是否包含。
- 金额使用什么精度。
- 允许按哪些列排序。
- 页大小上限是多少。
- 缺省排序是什么。
- 返回总数是必需、可选还是不提供。

接口查询参数是外部输入；SQL 查询结构是后端控制的程序。两者之间必须有验证和映射边界。

## 本课数据模型

可执行示例使用一张会话级临时订单表：

```sql
CREATE TEMPORARY TABLE learning_orders (
  id BIGINT PRIMARY KEY,
  account_id BIGINT NOT NULL,
  reference_code VARCHAR(40) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL,
  total_amount DECIMAL(12, 2) NOT NULL,
  customer_note VARCHAR(200) NULL,
  placed_at TIMESTAMP NOT NULL,
  shipped_at TIMESTAMP NULL,
  CONSTRAINT chk_learning_orders_status
    CHECK (status IN ('pending', 'paid', 'shipped', 'cancelled')),
  CONSTRAINT chk_learning_orders_total_amount
    CHECK (total_amount >= 0)
);
```

为保持 MySQL 与 PostgreSQL 可共同运行，示例手工指定主键，并使用两者都接受的基础 `TIMESTAMP`。真实系统中的跨时区事件仍应遵循上一课确定的产品专属时间类型和 UTC 策略。

## 一条 SELECT 的组成

典型列表查询可以写成：

```sql
SELECT
  id,
  reference_code,
  status,
  total_amount,
  placed_at
FROM learning_orders
WHERE account_id = 101
  AND status = 'paid'
  AND total_amount >= 100.00
  AND placed_at >= '2026-07-01 00:00:00'
  AND placed_at < '2026-08-01 00:00:00'
ORDER BY placed_at DESC, id DESC
LIMIT 20 OFFSET 0;
```

每个子句承担不同职责：

| 子句 | 作用 |
| --- | --- |
| `SELECT` | 决定输出哪些列或表达式 |
| `FROM` | 指定数据来源 |
| `WHERE` | 在排序和分页前筛选行 |
| `ORDER BY` | 建立结果顺序 |
| `LIMIT` | 限制最多返回多少行 |
| `OFFSET` | 跳过多少行后开始返回 |

理解简单查询时，可以用近似的逻辑顺序：`FROM → WHERE → SELECT → ORDER BY → LIMIT/OFFSET`。这不是数据库引擎实际执行步骤；优化器可以选择更高效但语义等价的执行计划。

## 投影：只选择接口需要的列

`SELECT` 后面的列表叫作投影。列表接口通常不应该使用 `SELECT *`：

```sql
SELECT
  id AS order_id,
  reference_code,
  status,
  total_amount,
  placed_at
FROM learning_orders;
```

显式投影带来几个好处：

- 查询返回结构清晰，减少误暴露内部列。
- 表新增大字段后，现有接口不会自动把它读出来。
- 驱动映射和代码审查更容易。
- 为后续覆盖索引等优化保留可能性。

`AS order_id` 是列别名，只改变结果集标签，不会重命名表中的列。别名可以在 `ORDER BY` 中使用，但通常不能在同一层查询的 `WHERE` 中使用，因为筛选在逻辑上早于输出别名生成。

## 比较条件与类型边界

常见比较运算符包括：

```sql
=  <>  >  >=  <  <=
```

应让参数以正确类型绑定：

- `accountId` 绑定为 64 位整数或对应驱动的整数类型。
- `minAmount` 绑定为十进制定点数，不先转成 JavaScript 浮点再拼字符串。
- 时间参数解析为明确的时间点或数据库时间类型。
- 状态先通过允许值集合校验。

不要依赖 MySQL 的隐式类型转换来让字符串和数字“看起来能比较”。PostgreSQL 的类型规则通常更严格，而隐式转换也可能让索引无法按预期使用或产生边界错误。

## `AND`、`OR` 与括号

`AND` 的优先级高于 `OR`。例如需求是“账号 101，且状态为 paid 或 shipped”，正确写法是：

```sql
WHERE account_id = 101
  AND (status = 'paid' OR status = 'shipped')
```

如果漏掉括号：

```sql
WHERE account_id = 101
  AND status = 'paid'
  OR status = 'shipped'
```

它会被理解为：

```text
(account_id = 101 AND status = 'paid') OR status = 'shipped'
```

于是其他账号的 shipped 订单也会进入结果。即使你记得运算符优先级，混用 `AND` 与 `OR` 时显式加括号仍更适合审查。

## `IN`：匹配有限集合

多个相等条件可以写成：

```sql
WHERE status IN ('paid', 'shipped')
```

真实接口必须为每个值生成独立占位符，不能把逗号拼接字符串绑定成一个参数：

```sql
-- 两个状态需要两个参数位置
WHERE status IN (?, ?)
```

还要在后端处理空数组。`IN ()` 在 MySQL 和 PostgreSQL 中都不是可依赖的合法写法；如果筛选集合为空，后端应根据接口语义直接返回空结果，或构造恒假条件，而不是生成坏 SQL。

### `NOT IN` 与 `NULL` 陷阱

由于 SQL 三值逻辑，如果 `NOT IN` 的候选集合或子查询结果含有 `NULL`，条件可能得到 `UNKNOWN`，结果与直觉不同。涉及可空数据的排除查询应先明确 `NULL` 语义，复杂场景通常用 `NOT EXISTS` 表达得更可靠；子查询会在后续课程展开。

## 时间范围使用半开区间

查询 2026 年 7 月的订单，推荐写成：

```sql
WHERE placed_at >= '2026-07-01 00:00:00'
  AND placed_at < '2026-08-01 00:00:00'
```

这是 `[起点, 终点)` 半开区间：包含 7 月 1 日零点，不包含 8 月 1 日零点。

不推荐把月末写成：

```sql
WHERE placed_at BETWEEN
  '2026-07-01 00:00:00'
  AND '2026-07-31 23:59:59'
```

`BETWEEN` 两端都包含，而且数据库可能保存微秒级小数秒，`23:59:59.500000` 就会被漏掉。半开区间还能让相邻月份无重叠、无间隙。

接口层应明确 `placedFrom` 与 `placedTo` 是时间点、哪个时区，以及结束值是否排除。不能让前端传当地日期字符串，再由每台后端机器按自己的默认时区解释。

## `NULL` 筛选

“尚未发货”可以用可空的 `shipped_at` 表示：

```sql
WHERE shipped_at IS NULL
```

“已经发货”则是：

```sql
WHERE shipped_at IS NOT NULL
```

不能写 `shipped_at = NULL`。同时要确认业务语义：取消的订单也可能 `shipped_at IS NULL`，所以“待发货”往往还需要状态条件：

```sql
WHERE status = 'paid'
  AND shipped_at IS NULL
```

## `LIKE`：通配符和用户输入是两层问题

`LIKE` 使用两个通配符：

- `%`：匹配零个或多个字符。
- `_`：匹配恰好一个字符。

查找以 `WEB_` 字面量开头的参考编号时，下划线必须转义：

```sql
WHERE reference_code LIKE 'WEB!_%' ESCAPE '!'
```

这里 `!_` 表示普通下划线，末尾 `%` 才是通配符。

### 参数绑定不等于通配符转义

参数绑定能阻止输入改变 SQL 结构，但用户输入中的 `%` 和 `_` 仍然具有 `LIKE` 模式含义。如果接口承诺“按字面文本包含搜索”，后端需要先按同一转义规则处理关键词：

```text
!  → !!
%  → !%
_  → !_
```

再在两端加 `%`，并使用：

```sql
WHERE customer_note LIKE ? ESCAPE '!'
```

处理顺序很重要：应先转义转义符本身，再转义两个通配符。最终模式仍通过占位符绑定，不应拼进 SQL。

### 大小写不能靠猜

MySQL 的 `LIKE` 是否区分大小写通常受字符集和排序规则影响；PostgreSQL `LIKE` 通常区分大小写，并提供非标准的 `ILIKE`。若产品要求跨库一致的忽略大小写搜索，应明确规范化和排序规则策略。

简单地写 `LOWER(column) = LOWER(?)` 虽然容易理解，却可能不能直接使用列上的普通索引。函数索引、排序规则和全文检索会在索引章节展开。

## 动态筛选必须绑定值

后端可以根据已验证的查询参数决定是否添加某个固定条件，但值必须通过驱动绑定。

MySQL/JDBC 风格：

```sql
SELECT id, reference_code, status, total_amount, placed_at
FROM learning_orders
WHERE account_id = ?
  AND status = ?
  AND total_amount >= ?
ORDER BY placed_at DESC, id DESC
LIMIT ? OFFSET ?;
```

PostgreSQL 客户端常见风格：

```sql
SELECT id, reference_code, status, total_amount, placed_at
FROM learning_orders
WHERE account_id = $1
  AND status = $2
  AND total_amount >= $3
ORDER BY placed_at DESC, id DESC
LIMIT $4 OFFSET $5;
```

占位符只能代表数据值，不能代表表名、列名、`ASC` 或 `DESC` 等 SQL 结构。这是下一节动态排序必须单独处理的原因。

## 动态排序使用允许列表

下面这种拼接是危险的：

```text
ORDER BY ${request.query.sort} ${request.query.direction}
```

即使值查询全部参数化，未经限制的排序字段仍能改变 SQL 结构。后端应把外部枚举映射到内部固定片段：

| API 值 | 固定 SQL 列 |
| --- | --- |
| `placedAt` | `placed_at` |
| `amount` | `total_amount` |
| `status` | `status` |

方向只允许 `asc`、`desc` 两种枚举，并映射为固定的 `ASC`、`DESC`。未知值应返回参数错误或使用明确默认值，不能原样透传。

不要允许客户端直接传任意函数、表达式或表名。允许列表同时保护安全、接口稳定性和可优化范围。

## 稳定排序必须包含唯一决胜列

只写：

```sql
ORDER BY placed_at DESC
```

并不能确定 `placed_at` 相同的订单谁在前。数据库可以在不同执行计划、并发状态或分页请求中以不同顺序返回这些并列行。

加入唯一主键作为决胜列：

```sql
ORDER BY placed_at DESC, id DESC
```

这样每两行都能确定先后关系。稳定分页的排序键应满足：

1. 业务排序符合接口预期。
2. 最终组合能形成唯一顺序。
3. 每一页使用完全相同的排序表达式和方向。

即使按金额排序，也要补上主键：

```sql
ORDER BY total_amount DESC, id DESC
```

### `NULL` 的排序位置

MySQL 与 PostgreSQL 对 `NULL` 默认排序位置及可用语法存在差异。需要跨库明确“未发货放最后”时，可以先排序布尔表达式：

```sql
ORDER BY
  (shipped_at IS NULL) ASC,
  shipped_at DESC,
  id DESC
```

非空行的表达式为 false，空值行为 true，因此非空时间排在前面；`id` 继续提供唯一顺序。采用产品专属 SQL 时，PostgreSQL 还支持 `NULLS FIRST`/`NULLS LAST` 显式控制。

## 页码分页：LIMIT 与 OFFSET

传统页码分页公式是：

```text
offset = (page - 1) × pageSize
```

第一页、每页 3 条：

```sql
ORDER BY placed_at DESC, id DESC
LIMIT 3 OFFSET 0
```

第二页：

```sql
ORDER BY placed_at DESC, id DESC
LIMIT 3 OFFSET 3
```

后端必须验证：

- `page >= 1`。
- `pageSize` 在合理范围内，例如 `1..100`。
- 乘法不会溢出语言整数范围。
- 不能用负数或任意大页大小制造昂贵查询。

### OFFSET 的两个固有限制

第一，数据库仍需计算并跳过前面的行。`OFFSET 100000` 并不是直接跳到存储中的第 100001 行，深分页通常越来越慢。

第二，多个请求之间有并发写入时，行的位置会改变。用户请求第一页后插入了一条排在最前的新订单，再请求第二页，原第一页末尾的行可能被推到第二页并重复出现；删除也可能造成遗漏。

稳定 `ORDER BY` 能消除并列顺序的不确定性，但不能让多个独立请求自动看到同一个数据快照。

## 游标分页：从上一页最后一行继续

当排序为：

```sql
ORDER BY placed_at DESC, id DESC
```

上一页最后一行是：

```text
placed_at = 2026-07-10 10:00:00
id = 1004
```

下一页可以查询排在它后面的行：

```sql
SELECT id, reference_code, status, total_amount, placed_at
FROM learning_orders
WHERE placed_at < '2026-07-10 10:00:00'
   OR (placed_at = '2026-07-10 10:00:00' AND id < 1004)
ORDER BY placed_at DESC, id DESC
LIMIT 3;
```

后端把 `(placed_at, id)` 编码成不透明游标返回给前端，下一次请求再解码并绑定参数。游标应包含：

- 所有排序键的值。
- 排序字段和方向，或能验证其与当前请求一致的信息。
- 必要时包含筛选条件摘要、版本和签名，防止篡改或误用。

游标分页的优势：

- 不需要扫描并丢弃大量前置行。
- 新插入到列表前面的数据通常不会让已经浏览过的行位移。
- 很适合“加载更多”和无限滚动。

代价也要明确：

- 不适合直接跳到任意第 N 页。
- 排序键必须稳定且形成唯一顺序。
- 修改排序字段的并发更新仍可能让行移动。
- 游标不是数据库事务快照，不能保证跨请求绝对一致。

## 总数查询与列表查询要共享条件

页码接口有时返回：

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 42
}
```

总数通常需要单独查询：

```sql
SELECT COUNT(*) AS total
FROM learning_orders
WHERE account_id = 101
  AND status IN ('paid', 'shipped')
  AND placed_at >= '2026-07-01 00:00:00'
  AND placed_at < '2026-08-01 00:00:00';
```

列表查询与计数查询必须复用完全相同的筛选语义，否则会出现“总数 42，实际只能翻到 39 条”。可以在后端集中构造筛选条件和参数，再分别组合投影/排序/分页与 `COUNT(*)`。

还要评估产品是否真的需要精确总数：

- 大数据集的复杂精确计数可能昂贵。
- 列表查询和计数查询分开执行时，并发写入可能使两者看到不同状态。
- “是否还有下一页”可以请求 `pageSize + 1` 条后判断，不一定要计算全量总数。

## 不要用一个万能条件代替动态 SQL

有些代码为了避免按参数组合条件，会写成：

```sql
WHERE (? IS NULL OR status = ?)
  AND (? IS NULL OR account_id = ?)
```

它有时能工作，但会让类型推断、可读性和索引选择变复杂。更清晰的做法通常是：

1. 后端验证允许的筛选参数。
2. 只添加实际存在的固定条件片段。
3. 为每个数据值生成并绑定占位符。
4. 对排序结构使用固定允许列表。

“动态构造 SQL”不等于“拼接用户输入”。结构由后端从可信片段组合，外部数据始终通过参数绑定。

## 结果为空不是数据库错误

列表查询没有匹配行时会返回空结果集，接口通常应返回：

```json
{ "items": [], "page": 1, "pageSize": 20, "total": 0 }
```

它不是 `404 Not Found`。`404` 更常用于按唯一资源 ID 查询却不存在的情况。数据库驱动也应区分：

- 查询成功但零行。
- 连接或 SQL 执行失败。
- 参数不合法，查询根本不应执行。

## 安全运行完整示例

完整脚本只创建当前会话的临时表、插入演示数据并执行 `SELECT`：

```bash
# MySQL 8.4
mysql \
  --host=127.0.0.1 \
  --port=3306 \
  --user=app_writer \
  --password \
  app_learning \
  < examples/database/04-select-filter-sort-pagination.sql
```

```bash
# PostgreSQL 18
psql \
  --host=127.0.0.1 \
  --port=5432 \
  --username=app_writer \
  --dbname=app_learning \
  --file=examples/database/04-select-filter-sort-pagination.sql
```

脚本中的固定值用于得到可复核结果。真实接口必须改用驱动占位符，并执行类型、范围和允许列表校验。

### 预期结果检查点

- 账号 101 在 7 月的 paid/shipped 查询依次返回 `1002、1001、1004`；前两行时间相同，由 `id DESC` 决胜。
- “已支付但尚未发货”返回 `1001、1003、1004`。
- 字面量 `WEB_` 前缀查询返回五行 `WEB_...`，不会误匹配 `WEBX202607X006`。
- 与第一条列表相同条件的 `COUNT(*)` 返回 `3`。
- 全量排序第一页为 `1008、1002、1001`，第二页为 `1003、1004、1005`。
- 从游标 `(2026-07-10 10:00:00, 1004)` 继续，返回 `1005、1006、1007`。

## 本课小结

- 列表接口先定义筛选、排序和分页契约，再写 SQL。
- 显式投影比 `SELECT *` 更适合稳定接口边界。
- 混用 `AND`、`OR` 时用括号表达业务分组。
- 时间范围优先使用 `[起点, 终点)` 半开区间，避免遗漏小数秒。
- `NULL` 使用 `IS NULL`/`IS NOT NULL`，不能用等号比较。
- `LIKE` 的 `%`、`_` 是通配符；参数绑定与通配符转义必须分别处理。
- 数据值使用占位符，排序列和方向使用后端允许列表。
- 分页排序必须包含唯一决胜列，例如 `placed_at DESC, id DESC`。
- `OFFSET` 适合浅页和跳页；游标分页更适合深分页和连续浏览。
- 游标分页减少位移问题，但不是跨请求事务快照。
- 精确总数有成本，列表与计数必须共享同一筛选语义。

## 官方资料

- [MySQL 8.4：SELECT](https://dev.mysql.com/doc/refman/8.4/en/select.html)
- [MySQL 8.4：比较函数与运算符](https://dev.mysql.com/doc/refman/8.4/en/comparison-operators.html)
- [MySQL 8.4：PREPARE 与参数标记](https://dev.mysql.com/doc/refman/8.4/en/prepare.html)
- [MySQL 8.4：ORDER BY 优化](https://dev.mysql.com/doc/refman/8.4/en/order-by-optimization.html)
- [PostgreSQL 18：SELECT](https://www.postgresql.org/docs/18/sql-select.html)
- [PostgreSQL 18：排序](https://www.postgresql.org/docs/18/queries-order.html)
- [PostgreSQL 18：LIMIT 与 OFFSET](https://www.postgresql.org/docs/18/queries-limit.html)
- [PostgreSQL 18：模式匹配](https://www.postgresql.org/docs/18/functions-matching.html)
- [PostgreSQL 18：比较函数与运算符](https://www.postgresql.org/docs/18/functions-comparison.html)
- [PostgreSQL 18：PREPARE](https://www.postgresql.org/docs/18/sql-prepare.html)
