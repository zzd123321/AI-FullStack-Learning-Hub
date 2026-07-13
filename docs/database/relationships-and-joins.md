---
title: 多表关系与 JOIN
description: 从订单接口出发，理解一对多、多对多、主外键和可靠的多表查询
prev:
  text: 从列表接口到可靠 SELECT
  link: /database/select-filter-sort-pagination
---

# 多表关系与 JOIN

一个订单详情接口通常同时返回账号、订单和商品：

```json
{
  "id": 5001,
  "account": {
    "id": 101,
    "displayName": "林夏"
  },
  "status": "paid",
  "items": [
    {
      "productId": 201,
      "productName": "机械键盘",
      "quantity": 1,
      "unitPrice": "399.00"
    },
    {
      "productId": 202,
      "productName": "无线鼠标",
      "quantity": 2,
      "unitPrice": "120.00"
    }
  ]
}
```

如果把所有字段塞进一张订单表，账号名称和商品名称会在大量行中重复，修改时也容易产生不一致。关系型设计把不同实体拆成表，再通过键和 JOIN 恢复它们之间的联系。

## 本课关系模型

示例使用四张表：

```text
learning_accounts  1 ───< N  learning_orders
                                   1
                                   │
                                   │
                                   N
                         learning_order_items
                                   N
                                   │
                                   │
                                   1
                          learning_products
```

也可以把订单与商品看成多对多关系：

```text
learning_orders  N ───< learning_order_items >─── N  learning_products
```

`learning_order_items` 是关联表：每一行表示“某订单中的某个商品”，并保存数量和成交单价。

## 先理解关系基数

基数描述一边的一行最多能对应另一边多少行。

### 一对一（1:1）

一个账号最多对应一份独立资料，例如 `accounts` 与 `account_profiles`。通常由外键加唯一约束实现：

```sql
account_id BIGINT NOT NULL UNIQUE
```

一对一不一定需要拆表。只有当生命周期、权限、访问频率或可选性确实不同，拆分才有价值。

### 一对多（1:N）

一个账号可以有多个订单，一个订单只属于一个账号。外键放在“多”的一侧：

```text
learning_orders.account_id → learning_accounts.id
```

订单的 `account_id NOT NULL` 表示订单必须属于某个账号。如果允许匿名订单，则需要另一套明确建模，不能只是随意把列改成可空。

### 多对多（N:M）

一个订单有多个商品，一个商品也可以出现在多个订单中。关系型数据库通常使用关联表拆成两个一对多：

```text
orders 1:N order_items N:1 products
```

关联表不只是“放两个 ID”。它还能保存关系自身的属性：

- `quantity`：这个订单买了几件。
- `unit_price`：下单时的成交单价。
- 折扣、税率、商品规格快照等。

商品当前售价以后可以变化，历史订单仍应保留成交时的 `unit_price`，不能每次展示历史订单都回读商品当前价格。

## 主键、外键与 JOIN 各自负责什么

- **主键**唯一标识本表的一行。
- **外键**约束子表中的值必须指向父表已有的候选键，维护引用完整性。
- **JOIN**是查询运算，决定如何把多个数据来源的行组合成结果。

有外键不代表查询会自动 JOIN；没有外键也不妨碍 SQL 写出 JOIN，但孤儿数据可能让查询结果不可靠。

真实订单表可以这样声明关系：

```sql
CONSTRAINT fk_orders_account
  FOREIGN KEY (account_id)
  REFERENCES accounts (id)
  ON DELETE RESTRICT
```

这表示存在订单时拒绝删除账号。外键列和被引用列的类型必须兼容；在 MySQL 中还要特别保持整数大小与 `UNSIGNED` 属性一致。

本课可执行脚本使用临时表。MySQL 明确不允许临时表参与外键约束，因此脚本只构造符合关系的数据，不声称验证了外键。生产迁移仍应创建和验证真实外键。

## INNER JOIN：只保留成功匹配的组合

查询订单及其账号名称：

```sql
SELECT
  o.id AS order_id,
  o.status AS order_status,
  a.id AS account_id,
  a.display_name
FROM learning_orders AS o
INNER JOIN learning_accounts AS a
  ON a.id = o.account_id
ORDER BY o.id;
```

阅读顺序：

1. `learning_orders AS o` 是左侧来源。
2. `learning_accounts AS a` 是右侧来源。
3. `ON a.id = o.account_id` 定义两行何时匹配。
4. 每个匹配对产生一行结果。
5. 没有匹配账号的订单、没有订单的账号都不会出现。

`INNER` 可以省略，但学习和复杂查询中显式写出更容易看清意图：

```sql
FROM learning_orders AS o
JOIN learning_accounts AS a ON a.id = o.account_id
```

## 表别名与限定列名

多张表经常都有 `id`、`status`、`created_at`。不限定来源会产生歧义：

```sql
-- id 属于哪张表？
SELECT id, status
FROM learning_orders AS o
JOIN learning_accounts AS a ON a.id = o.account_id;
```

应使用短而有意义的表别名：

```sql
SELECT
  o.id AS order_id,
  o.status AS order_status,
  a.id AS account_id,
  a.status AS account_status
FROM learning_orders AS o
JOIN learning_accounts AS a ON a.id = o.account_id;
```

列别名同时解决驱动映射中的同名覆盖问题。不要在多表接口查询里使用 `SELECT *`，否则结果列可能重名，表新增字段也会悄悄改变接口映射。

## JOIN 条件缺失会产生笛卡尔积

如果左表有 4 行、右表有 4 行，没有关联条件的组合会得到 16 行：

```sql
SELECT a.id, o.id
FROM learning_accounts AS a
CROSS JOIN learning_orders AS o;
```

`CROSS JOIN` 在确实需要所有组合时是合法工具，例如生成日期与门店的完整组合。但业务查询中无意产生笛卡尔积，通常意味着漏写或写错 JOIN 条件。

老式逗号连接也容易隐藏这个问题：

```sql
FROM learning_accounts AS a, learning_orders AS o
WHERE a.id = o.account_id
```

优先使用显式 `JOIN ... ON ...`，让关系条件紧邻数据来源，避免在长 `WHERE` 中丢失。

## LEFT JOIN：保留左侧所有行

如果接口要列出所有账号，即使账号还没有订单，也要使用左连接：

```sql
SELECT
  a.id AS account_id,
  a.display_name,
  o.id AS order_id,
  o.status AS order_status
FROM learning_accounts AS a
LEFT JOIN learning_orders AS o
  ON o.account_id = a.id
ORDER BY a.id, o.id;
```

对每个左侧账号：

- 有匹配订单时，每个订单产生一行。
- 没有匹配订单时，仍产生一行，但右侧订单列为 `NULL`。

本课数据中的账号 104 没有订单，因此它仍出现，`order_id` 和 `order_status` 为 `NULL`。

### 左右方向是接口语义

“保留谁”决定谁放左边。为了可读性和跨库一致性，通常可以调整表顺序后使用 `LEFT JOIN`，不必为了视觉习惯改写成 `RIGHT JOIN`。MySQL 不支持标准 `FULL OUTER JOIN`，因此跨库课程不把它作为通用方案。

## ON 与 WHERE：外连接中不能随意互换

需求：“列出所有账号，并附带它们的 paid 订单；没有 paid 订单的账号也要保留。”

正确写法把右表筛选放在 `ON`：

```sql
SELECT
  a.id AS account_id,
  a.display_name,
  o.id AS paid_order_id
FROM learning_accounts AS a
LEFT JOIN learning_orders AS o
  ON o.account_id = a.id
 AND o.status = 'paid'
ORDER BY a.id, o.id;
```

连接时只有 paid 订单算匹配；没有匹配的账号仍由 LEFT JOIN 补一行空的右侧列。

如果把条件放到 `WHERE`：

```sql
SELECT
  a.id AS account_id,
  a.display_name,
  o.id AS paid_order_id
FROM learning_accounts AS a
LEFT JOIN learning_orders AS o
  ON o.account_id = a.id
WHERE o.status = 'paid'
ORDER BY a.id, o.id;
```

没有匹配订单的账号会得到 `o.status = NULL`，随后被 `WHERE o.status = 'paid'` 过滤掉，LEFT JOIN 在这个查询中表现得像 INNER JOIN。

可以用这个判断方法：

- `ON`：什么样的右侧行可以与左侧行匹配？
- `WHERE`：连接完成后，哪些结果行最终保留？

对于 INNER JOIN，很多条件放在 `ON` 或 `WHERE` 语义相同，优化器也可能生成同类计划；对于外连接，位置会改变结果。

## 找出没有关联行的数据

查找没有订单的账号：

```sql
SELECT a.id, a.display_name
FROM learning_accounts AS a
LEFT JOIN learning_orders AS o
  ON o.account_id = a.id
WHERE o.id IS NULL
ORDER BY a.id;
```

这里检查右表不可空主键 `o.id IS NULL`，能明确表示“没有匹配行”。不要检查本来就允许为空的普通列，否则可能把“有匹配但该列为空”误判为“没有匹配”。

同一需求也可以用 `NOT EXISTS`：

```sql
SELECT a.id, a.display_name
FROM learning_accounts AS a
WHERE NOT EXISTS (
  SELECT 1
  FROM learning_orders AS o
  WHERE o.account_id = a.id
)
ORDER BY a.id;
```

两种写法都很常见。执行计划和索引会在后续章节分析；先确保表达的业务语义正确。

## 多表 JOIN：订单明细与商品

查询订单 5001 的商品明细：

```sql
SELECT
  o.id AS order_id,
  p.id AS product_id,
  p.product_name,
  oi.quantity,
  oi.unit_price,
  oi.quantity * oi.unit_price AS line_amount
FROM learning_orders AS o
JOIN learning_order_items AS oi
  ON oi.order_id = o.id
JOIN learning_products AS p
  ON p.id = oi.product_id
WHERE o.id = 5001
ORDER BY p.id;
```

关系链是：

```text
orders.id = order_items.order_id
order_items.product_id = products.id
```

`unit_price` 来自订单明细，而不是商品表当前的 `current_price`。`line_amount` 是查询结果表达式，不会修改存储数据。

## 一对多 JOIN 必然会重复父表列

订单 5001 有两个明细，JOIN 后得到两行：

| order_id | status | product_name | quantity |
| ---: | --- | --- | ---: |
| 5001 | paid | 机械键盘 | 1 |
| 5001 | paid | 无线鼠标 | 2 |

订单字段重复不是数据库错误，而是一对多关系展开后的正常结果。JOIN 的结果仍然是平面行集，JSON 中的嵌套数组需要额外组装。

不要看到重复就先加 `DISTINCT`：

- 它可能隐藏错误的 JOIN 条件。
- 它无法表达应该按哪个实体去重。
- 两个商品行本来就不同，去重会丢信息。
- 去重本身可能增加排序或哈希成本。

先写清楚关系基数，再判断结果行数是否符合预期。

## 从平面结果组装嵌套接口

后端读取订单与明细 JOIN 结果时，可以按 `order_id` 分组：

```text
读取第 1 行：创建订单 5001，加入商品 201
读取第 2 行：复用订单 5001，加入商品 202
遇到新 order_id：创建下一个订单对象
```

实现时要注意：

- 父记录用主键识别，不能用名称或行位置。
- LEFT JOIN 的右侧主键为 `NULL` 时，不要创建一个全是空值的子对象。
- 金额保持十进制类型或字符串输出。
- SQL 排序要让父行和子行顺序可预测。

MySQL 与 PostgreSQL 都提供 JSON 聚合能力，但函数和细节不同。初学阶段先掌握普通 JOIN 与后端组装，更容易观察行数和错误；产品专属 JSON 聚合可在掌握分组后再引入。

## EXISTS：只关心“是否存在”时避免行数膨胀

需求：“找出至少有一个 paid 订单的账号。”如果使用 JOIN：

```sql
SELECT a.id, a.display_name
FROM learning_accounts AS a
JOIN learning_orders AS o
  ON o.account_id = a.id
WHERE o.status = 'paid';
```

一个账号有多个 paid 订单时，账号会出现多次。如果只需要判断存在性，可以写：

```sql
SELECT a.id, a.display_name
FROM learning_accounts AS a
WHERE EXISTS (
  SELECT 1
  FROM learning_orders AS o
  WHERE o.account_id = a.id
    AND o.status = 'paid'
)
ORDER BY a.id;
```

`EXISTS` 只关心子查询是否至少返回一行，`SELECT 1` 的常量没有特殊数据含义。它比“JOIN 后再 DISTINCT”更直接表达需求。

## 关联表的主键如何选择

本课使用：

```sql
PRIMARY KEY (order_id, product_id)
```

它保证同一商品在一个订单中最多出现一行，数量累加在 `quantity` 中。这适合“相同商品规格合并为一项”的规则。

如果业务允许同一商品因规格、批次、优惠或备注不同而出现多行，就不能仅用 `(order_id, product_id)` 唯一标识。可以引入独立 `order_item_id`，再根据真实业务定义其他唯一约束。

主键设计必须表达“什么构成同一行”，不能因为复合主键写起来麻烦就随意添加自增 ID，同时放弃必要的业务唯一性。

## 外键删除策略必须来自生命周期

外键常见删除动作：

| 动作 | 含义 | 适用判断 |
| --- | --- | --- |
| `RESTRICT` / `NO ACTION` | 存在子行时拒绝删除父行 | 父子是独立业务实体，删除必须显式处理 |
| `CASCADE` | 删除父行时自动删除子行 | 子行完全依附父行、没有独立生命周期 |
| `SET NULL` | 删除父行时把引用设为 `NULL` | 关系可选，且保留子行仍有业务意义 |

订单明细通常是订单的组成部分，`orders → order_items` 可能适合 `ON DELETE CASCADE`；账号与历史订单通常不应因账号删除而级联清空，往往选择限制删除或业务归档。

不要为了“删除方便”统一使用 `CASCADE`。级联可以跨多层传播，影响范围需要在数据模型评审时明确。

MySQL InnoDB 的 `NO ACTION` 与 `RESTRICT` 都会立即拒绝相关操作；PostgreSQL 的 `NO ACTION` 与 `RESTRICT` 在可延迟约束等细节上存在区别。跨库设计不能只看关键词相同。

## 外键索引不要想当然

被引用的父键通常是主键或唯一键，因此已有索引。子表外键列是否自动获得合适索引则有产品差异：

- MySQL InnoDB 要求外键列有可用索引，缺失时会自动创建。
- PostgreSQL 不会仅因为声明外键就自动给引用列创建索引。

即使数据库自动创建了索引，也不代表它就是查询所需的最佳复合索引。例如订单接口可能需要 `(account_id, placed_at, id)`。索引选择必须从查询条件、排序和基数出发，下一阶段会通过执行计划验证。

正常运行中不要随意关闭外键检查。尤其在 MySQL 中，重新开启检查不会自动扫描并修复关闭期间写入的孤儿数据。

## JOIN 与 N+1 查询

一种常见后端写法是：

```text
查询 20 个订单                    1 次 SQL
对每个订单再查询一次订单明细       20 次 SQL
总计                              21 次 SQL
```

这就是 N+1 查询。数据量小时不明显，接口并发上升后会增加网络往返、连接池占用和数据库解析执行次数。

常见解决方向：

1. 使用 JOIN 一次取回父子行，再由后端组装。
2. 先取父 ID，再用一次批量 `WHERE order_id IN (...)` 查询所有子行。
3. 使用 ORM 的批量预加载能力，并检查实际生成的 SQL。

JOIN 也不是永远更好。一次连接过多一对多关系会产生乘法级行数膨胀，例如订单同时 JOIN 明细和多条操作日志。此时分两到三次批量查询可能更清晰、更省传输。目标是避免逐行查询，不是强迫所有数据塞进一条 SQL。

## JOIN 后分页：LIMIT 限制的是结果行，不是父实体

需求是“取最新 2 个订单及其所有明细”。下面的写法有问题：

```sql
SELECT
  o.id AS order_id,
  oi.product_id,
  oi.quantity
FROM learning_orders AS o
JOIN learning_order_items AS oi
  ON oi.order_id = o.id
ORDER BY o.placed_at DESC, o.id DESC, oi.product_id
LIMIT 2;
```

`LIMIT 2` 限制 JOIN 后的两行明细，不是两个订单。若最新订单有两条明细，结果可能只包含一个订单。

应先分页父表，再连接子表：

```sql
WITH paged_orders AS (
  SELECT id, account_id, status, placed_at
  FROM learning_orders
  ORDER BY placed_at DESC, id DESC
  LIMIT 2
)
SELECT
  po.id AS order_id,
  po.status,
  p.id AS product_id,
  p.product_name,
  oi.quantity,
  oi.unit_price
FROM paged_orders AS po
JOIN learning_order_items AS oi
  ON oi.order_id = po.id
JOIN learning_products AS p
  ON p.id = oi.product_id
ORDER BY po.placed_at DESC, po.id DESC, p.id;
```

MySQL 8.4 与 PostgreSQL 18 都支持这里使用的普通 CTE。更复杂的筛选、游标和执行计划仍要在真实数据分布下验证。

如果父实体可能没有子行，而接口仍要返回父实体，第二阶段应改为 LEFT JOIN，并在后端正确处理空子行。

## JOIN 条件与筛选值仍要参数化

关系条件 `a.id = o.account_id` 来自固定表结构，不是用户输入。接口提供的账号 ID、状态、时间范围仍应绑定：

```sql
SELECT
  o.id,
  a.display_name,
  o.status,
  o.placed_at
FROM learning_orders AS o
JOIN learning_accounts AS a
  ON a.id = o.account_id
WHERE o.account_id = ?
  AND o.status = ?
ORDER BY o.placed_at DESC, o.id DESC;
```

表名、列名和 JOIN 类型属于 SQL 结构，不能用普通值占位符绑定。若后端确实支持不同关联视图，应从固定查询模板或允许列表中选择，不能接受客户端提交任意 JOIN 片段。

## 排查 JOIN 结果不对的顺序

当结果过多、过少或重复时，可以按下面顺序检查：

1. 单独查询每张表，确认基础筛选是否正确。
2. 写出关系基数：1:1、1:N 还是 N:M。
3. 检查每个 JOIN 是否包含完整键，复合键不能漏列。
4. 逐个添加 JOIN，观察行数在哪一步发生变化。
5. 区分 `ON` 匹配条件与 `WHERE` 最终筛选。
6. 检查 LEFT JOIN 右表条件是否误放在 `WHERE`。
7. 确认所谓“重复”是否其实是不同子行。
8. 最后才考虑是否真的需要 `DISTINCT` 或聚合。

不要一开始就用 `DISTINCT`、`GROUP BY` 把症状压下去。错误关系条件可能产生巨大的中间结果，即使最终去重，看似正确的数据也掩盖不了性能和语义问题。

## 安全运行完整示例

完整脚本创建四张会话临时表、插入非敏感演示数据并执行只读 JOIN：

```bash
# MySQL 8.4
mysql \
  --host=127.0.0.1 \
  --port=3306 \
  --user=app_writer \
  --password \
  app_learning \
  < examples/database/05-relationships-and-joins.sql
```

```bash
# PostgreSQL 18
psql \
  --host=127.0.0.1 \
  --port=5432 \
  --username=app_writer \
  --dbname=app_learning \
  --file=examples/database/05-relationships-and-joins.sql
```

脚本没有永久表，也没有 `UPDATE`、`DELETE`、`DROP`。连接结束后临时数据自动消失。

### 预期结果检查点

- INNER JOIN 返回 4 个订单及对应账号，不返回没有订单的账号 104。
- LEFT JOIN 保留账号 104，并把它的订单列补为 `NULL`。
- paid 条件放在 `ON` 时保留全部 4 个账号；放在 `WHERE` 时只剩账号 101、103。
- “没有订单的账号”查询只返回 104。
- 订单 5001 的两个明细金额分别为 `399.00` 与 `240.00`。
- `EXISTS` 查询只返回有 paid 订单的账号 101、103，每个账号只有一行。
- 直接 JOIN 后 `LIMIT 2` 只得到最新两个订单中的两条明细行；先分页订单的 CTE 返回最新 2 个订单及其全部 3 条明细。

## 本课小结

- 一对多把外键放在多的一侧，多对多用关联表拆成两个一对多。
- 主键标识本表行，外键维护引用完整性，JOIN 组合查询结果。
- INNER JOIN 只保留匹配行，LEFT JOIN 保留全部左侧行。
- 外连接中，右表条件放在 `ON` 还是 `WHERE` 会改变结果。
- 用右表不可空主键为 `NULL` 判断“没有匹配行”。
- 一对多 JOIN 重复父列是正常展开，不应盲目 `DISTINCT`。
- 只判断关联是否存在时，`EXISTS` 比 JOIN 后去重更贴近语义。
- JOIN 结果是平面行集，后端需要按主键组装嵌套接口对象。
- N+1 应改为 JOIN 或批量查询，但过多一对多 JOIN 也会造成行数膨胀。
- JOIN 后的 LIMIT 限制结果行；分页父实体时应先分页父表再连接子表。
- 外键删除动作必须来自实体生命周期，不能统一滥用 CASCADE。

## 官方资料

- [MySQL 8.4：JOIN](https://dev.mysql.com/doc/refman/8.4/en/join.html)
- [MySQL 8.4：外键约束](https://dev.mysql.com/doc/refman/8.4/en/create-table-foreign-keys.html)
- [MySQL 8.4：SELECT](https://dev.mysql.com/doc/refman/8.4/en/select.html)
- [PostgreSQL 18：表表达式与 JOIN](https://www.postgresql.org/docs/18/queries-table-expressions.html)
- [PostgreSQL 18：约束与外键](https://www.postgresql.org/docs/18/ddl-constraints.html)
- [PostgreSQL 18：SELECT](https://www.postgresql.org/docs/18/sql-select.html)
