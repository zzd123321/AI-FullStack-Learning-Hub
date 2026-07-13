---
title: 关系型数据库、表、行、列、主键与第一个 SQL 查询
description: 从用户列表接口出发，理解关系模型并写出第一个安全、可预测的 SQL 查询
prev:
  text: 数据库专题首页
  link: /database/
---

# 关系型数据库、表、行、列、主键与第一个 SQL 查询

你在接口联调时见过这样的响应：

```json
{
  "items": [
    { "id": 101, "displayName": "林夏", "status": "active" },
    { "id": 103, "displayName": "周宁", "status": "active" }
  ],
  "page": 1,
  "pageSize": 2
}
```

前端看到的是 JSON，后端通常先从数据库取得行，再把结果转换为接口响应。数据库不是“保存 JSON 的黑盒”；它有自己的数据模型、约束和查询语言。理解这一层，才能判断接口为什么漏数据、重复数据、顺序变化或变慢。

## 这一课要建立的心智模型

关系型数据库把相关数据组织为表。先用一张简化的用户表观察几个核心概念：

| id | display_name | email | status | created_at |
| ---: | --- | --- | --- | --- |
| 101 | 林夏 | linxia@example.com | active | 2026-07-01 09:00:00 |
| 102 | 陈川 | chenchuan@example.com | disabled | 2026-07-02 10:30:00 |
| 103 | 周宁 | zhouning@example.com | active | 2026-07-03 14:20:00 |

- **数据库（database）**：管理一组数据及其结构、约束和访问方式的系统边界。
- **表（table）**：同一类数据的集合，例如 `learning_users` 表保存用户。
- **行（row）**：一个具体记录，例如 `id = 101` 的用户。在关系模型中也常称为元组。
- **列（column）**：记录的一个属性，例如 `email`。列定义名称、数据类型和约束。
- **模式（schema）**：表有哪些列、每列是什么类型、允许什么值，以及列之间有什么约束。
- **主键（primary key）**：能唯一标识一行的一列或一组列；主键值必须唯一且不能为 `NULL`。

“关系型”不只是把数据画成表格。更重要的是：表具有明确结构，约束负责拒绝不合法的数据，表与表之间还能通过键建立关系。关系模型中的表和查询结果本身没有可依赖的行顺序；需要稳定顺序时必须明确写 `ORDER BY`。

## 从接口字段回到数据库列

接口字段与数据库列经常表达同一份业务信息，但不必使用相同命名：

| 接口层 | 数据库层 | 说明 |
| --- | --- | --- |
| `id` | `id` | 资源标识通常直接对应主键 |
| `displayName` | `display_name` | JSON 常用 camelCase，SQL 常用 snake_case |
| `status` | `status` | 可以作为列表接口的筛选条件 |
| `createdAt` | `created_at` | 后端还要负责时间格式和时区转换 |

数据库的一行也不等于最终响应对象。后端可以只查询需要的列、重命名字段、组合多张表，或者隐藏 `email` 等不该暴露的信息。把数据库实体直接序列化为接口响应，往往会让存储结构和接口契约过度耦合。

## 用 SQL 描述一张表

SQL（Structured Query Language）是一种声明式语言：你描述想要的数据或结构，数据库决定如何执行。

下面的定义刻意使用 MySQL 与 PostgreSQL 都支持的基础写法：

```sql
CREATE TEMPORARY TABLE learning_users (
  id INTEGER PRIMARY KEY,
  display_name VARCHAR(50) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL,
  created_at TIMESTAMP NOT NULL
);
```

逐列阅读这段定义：

- `id INTEGER PRIMARY KEY`：`id` 是整数，也是每行的唯一身份。
- `VARCHAR(50)`：保存最长 50 个字符的变长文本。
- `NOT NULL`：插入时不能缺少这个值。
- `UNIQUE`：所有行的 `email` 不能重复。
- `TIMESTAMP`：保存日期和时间；生产系统还需要明确时区策略，后续课程会单独处理。
- `TEMPORARY`：表只存在于当前数据库会话，连接结束后自动消失，适合安全试跑本课示例。

主键不仅服务于数据库内部。接口中的 `/api/users/101` 也需要一个稳定标识，才能准确读取或修改某一个用户。不要把昵称、手机号等可能改变的业务属性想当然地当作主键。

## 写入演示数据

`INSERT` 把行加入表中。显式列出目标列可以让语句更容易审查，也不会暗中依赖表的列顺序：

```sql
INSERT INTO learning_users (id, display_name, email, status, created_at)
VALUES
  (101, '林夏', 'linxia@example.com', 'active', '2026-07-01 09:00:00'),
  (102, '陈川', 'chenchuan@example.com', 'disabled', '2026-07-02 10:30:00'),
  (103, '周宁', 'zhouning@example.com', 'active', '2026-07-03 14:20:00');
```

如果再次插入 `id = 101`，主键约束应拒绝这条数据；如果插入重复邮箱，唯一约束也应拒绝。约束把一部分数据规则放到最终存储边界上，避免所有正确性都依赖某一个后端接口。

## 第一个查询：SELECT、FROM、WHERE、ORDER BY

假设前端请求：

```text
GET /api/users?status=active&page=1&pageSize=2
```

对应的基础查询可以写成：

```sql
SELECT id, display_name, status
FROM learning_users
WHERE status = 'active'
ORDER BY id
LIMIT 2 OFFSET 0;
```

按职责拆开看：

1. `SELECT id, display_name, status` 决定结果包含哪些列。
2. `FROM learning_users` 指定数据来源。
3. `WHERE status = 'active'` 只保留符合条件的行。
4. `ORDER BY id` 规定稳定的返回顺序。
5. `LIMIT 2 OFFSET 0` 只取第一页的两行。

结果是：

| id | display_name | status |
| ---: | --- | --- |
| 101 | 林夏 | active |
| 103 | 周宁 | active |

这里没有写 `SELECT *`。在接口查询中显式列名通常更合适：返回结构更清楚，也能减少读取和误暴露无关列的机会。后端再把 `display_name` 映射为响应中的 `displayName`。

## SQL 的书写顺序与理解顺序

SQL 写作从 `SELECT` 开始，但第一次阅读时可以先问四个问题：

1. 从哪张表取？看 `FROM`。
2. 哪些行符合条件？看 `WHERE`。
3. 按什么顺序返回？看 `ORDER BY`。
4. 最后输出哪些列？看 `SELECT`。

这不是完整的数据库执行顺序，却是理解简单查询的实用起点。数据库究竟如何找到这些行，之后会通过索引和执行计划展开。

## 后端不能直接拼接查询参数

上面的 `'active'` 是固定演示值。真实接口中的 `status` 来自请求参数，不能把它直接拼进 SQL 字符串，否则会引入 SQL 注入风险。后端应使用数据库驱动提供的参数化查询：

```sql
-- JDBC、许多 MySQL 驱动使用 ? 占位符
SELECT id, display_name, status
FROM learning_users
WHERE status = ?
ORDER BY id
LIMIT ? OFFSET ?;
```

```sql
-- PostgreSQL 常见客户端使用 $1、$2、$3 占位符
SELECT id, display_name, status
FROM learning_users
WHERE status = $1
ORDER BY id
LIMIT $2 OFFSET $3;
```

占位符的具体形式取决于驱动和框架，原则相同：SQL 结构与用户输入分开提交，由驱动绑定参数。参数化解决的是输入安全和类型绑定，不替代接口层对状态取值、页大小等业务规则的校验。

## 安全运行完整示例

完整脚本位于 `examples/database/01-relational-model-first-query.sql`。它只创建当前会话可见的临时表、写入三行演示数据并执行只读查询：

```bash
# MySQL：先连接到你专门用于学习的数据库
mysql -u <用户名> -p <学习数据库名> \
  < examples/database/01-relational-model-first-query.sql

# PostgreSQL：先确认连接目标是学习数据库
psql -d <学习数据库名> \
  -f examples/database/01-relational-model-first-query.sql
```

即使脚本本身使用临时表，也应先核对命令中的服务器和数据库名。养成“执行前确认环境”的习惯，比背更多 SQL 更重要。

## 本课小结

- 关系型数据库用表、行、列和约束组织数据。
- 主键唯一且非空，为数据库记录和 API 资源提供稳定身份。
- `SELECT` 选择列，`FROM` 指定来源，`WHERE` 筛选行，`ORDER BY` 明确顺序。
- 不写 `ORDER BY` 就不应依赖结果顺序；接口分页尤其需要稳定排序。
- 接口参数必须通过驱动绑定，不能拼接进 SQL。
- 数据库行与 API 响应属于不同边界，后端负责查询、映射和暴露控制。

## 官方资料

- [PostgreSQL 18：数据定义](https://www.postgresql.org/docs/18/ddl.html)
- [PostgreSQL 18：约束与主键](https://www.postgresql.org/docs/18/ddl-constraints.html#DDL-CONSTRAINTS-PRIMARY-KEYS)
- [PostgreSQL 18：SELECT](https://www.postgresql.org/docs/18/sql-select.html)
- [MySQL 8.4：创建表](https://dev.mysql.com/doc/refman/8.4/en/creating-tables.html)
- [MySQL 8.4：从表中检索信息](https://dev.mysql.com/doc/refman/8.4/en/retrieving-data.html)
