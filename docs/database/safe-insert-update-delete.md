---
title: 安全写入数据：INSERT、UPDATE、DELETE 与幂等边界
description: 从创建和修改账号接口出发，掌握受约束写入、影响行数、乐观并发控制、软删除与 UPSERT
prev:
  text: 子查询与 CTE：拆解复杂查询
  link: /database/subqueries-and-cte
next:
  text: 索引如何加速查询：B-Tree、选择性与联合索引
  link: /database/indexes-and-query-shapes
---

# 安全写入数据：INSERT、UPDATE、DELETE 与幂等边界

查询写错可能返回错误数据，写入写错则可能永久改变大量数据。后端的创建、修改、状态流转和删除接口，最终都会落到 `INSERT`、`UPDATE` 或 `DELETE`，但“语法执行成功”远远不等于业务操作正确。

本课建立一套保守的写入顺序：先定义接口契约和不变量，再预览目标行，使用精确条件写入，检查影响行数，最后决定提交还是回滚。配套示例只修改会话临时表，并在事务结尾回滚，不接触永久业务数据。

## 从三个写接口开始

假设后端提供：

```text
POST   /api/accounts
PATCH  /api/accounts/:id
DELETE /api/accounts/:id
```

看似对应三条 SQL，但每个接口都有必须提前定义的问题。

创建账号：

- 主键由谁生成？
- 邮箱重复返回什么状态？
- 客户端重试会不会创建两行？
- 默认状态和版本号由谁设置？

修改账号：

- PATCH 中“字段缺失”和“显式传 null”是否不同？
- 两个客户端同时修改时，后提交者是否覆盖前者？
- 目标不存在、版本冲突和新值等于旧值如何区分？

删除账号：

- 是永久删除还是业务停用？
- 关联订单、审计记录如何处理？
- 重复删除是否算成功？
- 谁有权限删除这条记录？

这些语义必须由 API、领域规则和数据库约束共同完成，不能只靠一条宽松的 SQL。

## 写入的第一道原则：明确列名

创建账号时写出列名：

```sql
INSERT INTO learning_accounts (
  id,
  email,
  display_name,
  status,
  version
)
VALUES (?, ?, ?, 'active', 1);
```

不要依赖表当前的物理列顺序：

```sql
INSERT INTO learning_accounts
VALUES (?, ?, ?, 'active', 1, NULL);
```

后者在新增列、调整迁移或不同环境结构不一致时更脆弱，也让代码评审者难以判断每个参数的含义。

显式列名还允许数据库为未列出的字段应用 `DEFAULT`。但要记住：

- 省略一列，数据库可能使用默认值。
- 显式传入 NULL，是要求写入 NULL。
- `DEFAULT` 不会自动修复显式 NULL，除非数据库或具体定义另有特殊行为。

## 参数绑定适用于所有写语句

用户输入不能拼接进 `INSERT` 或 `UPDATE`：

```text
错误：UPDATE accounts SET display_name = '" + input + "' WHERE id = ...
```

正确做法是使用驱动占位符：

```sql
UPDATE learning_accounts
SET display_name = ?
WHERE id = ?;
```

参数绑定负责把输入当作数据，不负责业务验证。后端仍需检查：

- 字符串长度和标准化规则。
- 枚举状态是否合法。
- 金额、数量和时间边界。
- 当前用户是否有权操作目标资源。
- 字段是否允许被此接口修改。

## 数据库约束是最后一道边界

假设账号表有：

```sql
email VARCHAR(255) NOT NULL UNIQUE,
status VARCHAR(20) NOT NULL,
version INTEGER NOT NULL CHECK (version > 0)
```

后端可以提前检查邮箱是否存在，让错误提示更友好；但只有唯一约束能在并发下可靠阻止两个请求同时写入相同邮箱。

典型流程是：

1. 后端做格式和业务校验。
2. 数据库执行带约束的写入。
3. 捕获唯一约束、非空约束或检查约束错误。
4. 按约束名或驱动错误信息映射为稳定的领域错误。

不要把完整数据库错误原样返回给客户端，它可能泄露表名、列名和内部 SQL。

## 多行 INSERT 是一条语句，不是字符串拼接

批量导入少量固定结构数据可以写：

```sql
INSERT INTO learning_accounts (
  id,
  email,
  display_name,
  status,
  version
)
VALUES
  (?, ?, ?, 'active', 1),
  (?, ?, ?, 'active', 1);
```

后端应按行数生成固定占位符结构，再逐个绑定值。还要设置：

- 单批最大行数或最大字节数。
- 请求体大小限制。
- 超时和事务范围。
- 某一行失败时是整批失败还是记录逐行结果。

超大批量写入需要数据库专属批处理或导入工具，不应无限扩大一条 `VALUES`。

## 生成主键：跨库接口相同，取值方式不同

常见方案：

- 数据库生成递增标识。
- 应用生成 UUID、ULID 或其他全局标识。
- 上游系统提供稳定业务标识。

MySQL 常使用 `AUTO_INCREMENT`，插入后通过驱动生成键 API 或 `LAST_INSERT_ID()` 获取当前会话最后生成的值。不要用 `SELECT MAX(id)`：并发请求可能在你查询前插入更大的 ID。

PostgreSQL 可使用 identity 列并在同一语句中：

```sql
INSERT INTO accounts (email, display_name)
VALUES ($1, $2)
RETURNING id, email, display_name;
```

`RETURNING` 能返回数据库默认值或触发器处理后的行，避免为了刚写入的数据再做一次不可靠查询。MySQL 8.4 没有与 PostgreSQL 对所有 `INSERT/UPDATE/DELETE` 通用的同形 `RETURNING`，数据访问层应明确方言差异，而不是假装完全一致。

## UPDATE 必须从 WHERE 开始设计

危险思路是先写：

```sql
UPDATE learning_accounts
SET status = 'suspended';
```

再考虑筛选条件。更安全的过程是先定义目标集合：

```sql
SELECT id, email, status, version
FROM learning_accounts
WHERE id = ?
  AND status = 'active';
```

确认目标后，把相同条件放进 UPDATE：

```sql
UPDATE learning_accounts
SET status = 'suspended'
WHERE id = ?
  AND status = 'active';
```

条件中的旧状态既是业务前置条件，也是防止错误状态跳转的保护。更新订单状态时同理：只有允许从 `pending` 转到 `paid`，才把 `status='pending'` 写进 WHERE。

## 主键条件不等于授权

下面只能保证定位一行，不能保证当前用户有权修改：

```sql
UPDATE projects
SET name = ?
WHERE id = ?;
```

多租户系统通常还要限制租户或所有者：

```sql
UPDATE projects
SET name = ?
WHERE id = ?
  AND tenant_id = ?;
```

`tenant_id` 仍由可信身份上下文提供，而不是盲信请求体。数据库行级安全、独立 schema 或独立数据库可以提供更强隔离，但应用查询也必须维持清晰的授权边界。

## PATCH 不能用 COALESCE 模糊缺失与 NULL

有人会写万能更新：

```sql
UPDATE profiles
SET
  nickname = COALESCE(?, nickname),
  avatar_url = COALESCE(?, avatar_url)
WHERE id = ?;
```

这让“客户端没传 avatarUrl”和“客户端明确要求清空 avatarUrl”都变成同一种行为，无法写入 NULL。

更可靠的方式是后端区分字段状态：

- 缺失：不生成该列的 SET 子句。
- 存在且为 NULL：验证该列允许 NULL，然后绑定 NULL。
- 存在且有值：验证并绑定值。

动态列名不能来自用户原文，必须通过允许列表映射到固定 SQL 片段。

## 影响行数是写接口的重要输出

执行精确 UPDATE 后，后端应读取驱动提供的影响行数：

```text
期望修改一条资源：影响 1 行 → 成功
期望修改一条资源：影响 0 行 → 不存在、前置条件失败或版本冲突
期望修改一条资源：影响大于 1 行 → 条件或约束设计错误
```

不能只检查“SQL 没有抛异常”。一条 UPDATE 匹配零行通常也会正常执行。

MySQL 的 affected rows 还受“匹配行的值是否实际改变”以及客户端是否启用 found rows 语义影响；UPSERT 的计数规则也不同。不要跨驱动硬编码同一套含义。对关键命令，最好让 WHERE 中包含明确旧状态或版本，并在数据访问层测试实际驱动行为。

## 乐观并发控制防止丢失更新

假设两个客户端都读取账号 101 的 `version=1`：

1. 客户端 A 把名称改为“林夏 A”。
2. 客户端 B 仍基于旧页面把名称改为“林夏 B”。
3. 如果只按 ID 更新，B 会静默覆盖 A。

加入版本条件：

```sql
UPDATE learning_accounts
SET
  display_name = ?,
  version = version + 1
WHERE id = ?
  AND version = ?;
```

A 使用期望版本 1，更新一行并把版本改为 2。B 仍使用版本 1，只会影响 0 行。后端可返回 `409 Conflict`，让客户端重新读取后决定如何合并。

需要注意：0 行也可能表示资源不存在。若 API 必须区分不存在和版本冲突，可以额外安全查询，或按授权策略统一返回冲突/不存在，避免泄露其他租户资源是否存在。

版本列只是乐观锁的一种形式。使用 `updated_at` 也可以，但时间精度、时区序列化和同一时间值碰撞更难控制，整数版本通常更直接。

## 状态转换也应是条件写入

订单支付回调不能先 SELECT 再无条件 UPDATE：

```sql
UPDATE orders
SET status = 'paid'
WHERE id = ?;
```

更安全的表达是：

```sql
UPDATE orders
SET
  status = 'paid',
  paid_at = ?
WHERE id = ?
  AND status = 'pending';
```

这样重复回调不会把已经退款的订单改回已支付。影响一行代表状态转换成功；零行意味着要检查“已经处理”“状态不允许”或“订单不存在”。

复杂状态机仍需要事务、锁、唯一约束和审计记录配合，后续事务课程会继续展开。

## DELETE 的 WHERE 同样先用 SELECT 预览

永久删除前先运行同条件只读查询：

```sql
SELECT id, email, status
FROM learning_accounts
WHERE id = ?
  AND status = 'pending_deletion';
```

确认后才执行：

```sql
DELETE FROM learning_accounts
WHERE id = ?
  AND status = 'pending_deletion';
```

生产运维中的人工删除还应有：

- 工单和审批。
- 数据备份或恢复方案。
- 明确的事务与影响行数上限。
- 审计记录。
- 在正确环境、数据库和租户上的再次确认。

本课配套 DELETE 只删除事务内刚插入的临时表行，随后整体回滚。

## 软删除不是把 DELETE 换成 UPDATE 就结束

软删除通常增加 `deleted_at`：

```sql
UPDATE learning_accounts
SET deleted_at = ?
WHERE id = ?
  AND deleted_at IS NULL;
```

随后普通查询必须统一加：

```sql
WHERE deleted_at IS NULL
```

软删除的代价包括：

- 所有查询都要正确过滤。
- 唯一邮箱是否允许被新账号复用，需要专门设计。
- 关联表如何判断父记录有效。
- 数据仍占存储并受隐私保留期限约束。
- 恢复操作要处理期间产生的冲突。

它适合业务停用、可恢复删除和审计需求，但不等于合规意义上的永久擦除。

## 外键决定硬删除能否发生

若订单外键引用账号，数据库可能：

- `RESTRICT` / `NO ACTION`：存在引用时拒绝删除。
- `CASCADE`：连带删除子行。
- `SET NULL`：保留子行并清空引用。

选择必须来自数据生命周期，而不是为了让 DELETE “方便成功”。订单和审计数据通常不应因删除账号而悄悄消失；可考虑匿名化个人字段、停用账号并保留必要业务记录。

执行删除前，要理解所有直接和间接外键，不要在应用捕获错误后改成关闭约束。

## UPSERT 解决原子写入，不自动解决业务语义

“不存在就插入，存在就更新”如果写成两条独立语句：

1. SELECT 判断不存在。
2. INSERT。

两个并发请求都可能通过第一步，随后一个触发唯一冲突。应依赖唯一约束和数据库原子 UPSERT。

PostgreSQL：

```sql
INSERT INTO contacts (email, display_name)
VALUES ($1, $2)
ON CONFLICT (email) DO UPDATE
SET display_name = EXCLUDED.display_name
RETURNING id, email, display_name;
```

MySQL 8.4：

```sql
INSERT INTO contacts (email, display_name)
VALUES (?, ?) AS new
ON DUPLICATE KEY UPDATE
  display_name = new.display_name;
```

两者语法和影响行数不同。尤其要明确：

- 哪个唯一键算冲突目标？
- 冲突时允许更新哪些字段？
- 是否能更新资源所有者或租户 ID？通常不能。
- 更新时间是否在值没变化时也改变？
- 客户端如何知道发生了插入还是更新？

不要把请求体全部字段无条件覆盖到现有行。

## 幂等请求不是简单 UPSERT 业务表

移动网络或网关可能重试 `POST /payments`。如果每次都创建新支付记录，就会重复扣款。

常见设计是客户端发送幂等键：

```text
Idempotency-Key: 2f8c...stable-per-operation
```

服务端在同一业务作用域内建立唯一约束，例如：

```text
(tenant_id, idempotency_key) UNIQUE
```

并保存：

- 请求主体摘要。
- 处理状态。
- 创建的资源 ID。
- 可重复返回的响应结果。
- 过期时间。

同一个键配相同请求可返回之前结果；同一个键配不同请求应拒绝。UPSERT 可以参与实现，但必须结合事务和业务唯一约束，不能只对最终业务表“冲突就随便更新”。

## INSERT IGNORE 或静默忽略错误要谨慎

把约束错误一律忽略看似方便，却可能把以下问题混为一谈：

- 预期的重复请求。
- 非空字段缺失。
- 数据被截断或转换。
- 检查约束失败。
- 真正的数据质量缺陷。

只有当接口明确允许“已存在则不做任何事”，并且能够确认忽略的是目标唯一冲突时，才使用对应语义。其余错误应失败并被观察到。

## 写入与审计必须共享原子边界

如果修改账号后还要写审计事件：

```text
UPDATE account
INSERT audit_event
```

两步应在同一事务中完成，否则可能出现账号已改但审计缺失，或审计存在但账号修改失败。事务还要处理：

- 任一步失败都回滚。
- 持锁时间尽量短。
- 不在事务中等待用户输入或长时间调用外部 API。
- 对可重试错误制定有限重试策略。

本课只使用 `BEGIN` 和 `ROLLBACK` 安全演示；原子性、隔离级别、死锁和 MVCC 会在事务专题深入学习。

## 事务不是危险 SQL 的保险按钮

虽然事务能回滚 DML，但仍不能把它当作唯一保护：

- 某些数据库和存储引擎行为不同。
- DDL 可能隐式提交或具有不同事务语义。
- 大范围 UPDATE/DELETE 会长期持锁并产生大量日志。
- 人可能误执行 COMMIT。
- 外部副作用如已发送消息不能靠数据库回滚撤销。

更可靠的组合是：正确环境确认、最小权限、精确 WHERE、影响行数检查、小批量、事务、备份和审计。

## 错误映射要稳定

数据访问层不应只返回“数据库报错”。可以映射为：

| 数据库结果 | 可能的 API 语义 |
| --- | --- |
| 唯一邮箱冲突 | `409 Conflict` |
| 外键目标不存在 | `400` 或 `409`，取决于契约 |
| CHECK / NOT NULL 失败 | 通常是 `400`，服务端错误则为 `500` |
| 乐观锁影响 0 行 | `409 Conflict` |
| 授权范围内查不到目标 | `404 Not Found` |
| 死锁或序列化失败 | 服务端有限重试，耗尽后返回可观察错误 |

具体状态码可以不同，但同一领域错误不应随数据库驱动文本变化。

## 排查写入问题的顺序

1. 确认当前环境、主机、端口、数据库、schema 和登录身份。
2. 写出接口不变量与允许的状态转换。
3. 用 SELECT 和完全相同的 WHERE 预览目标行。
4. 确认列名、参数顺序和参数类型。
5. 检查唯一、外键、非空和 CHECK 约束。
6. 把租户、所有者、旧状态或版本条件放进 WHERE。
7. 在事务中执行最小范围写入。
8. 检查影响行数和返回行，不只检查异常。
9. 验证审计或关联写入处于同一原子边界。
10. 提交前再次核对；不确定就回滚。

## 安全运行配套脚本

跨库主线脚本只使用临时表，并在末尾回滚所有演示写入：

```bash
# MySQL 8.4
mysql \
  --host=127.0.0.1 \
  --port=3306 \
  --user=app_writer \
  --password \
  app_learning \
  < examples/database/08-safe-writes.sql
```

```bash
# PostgreSQL 18
psql \
  --host=127.0.0.1 \
  --port=5432 \
  --username=app_writer \
  --dbname=app_learning \
  --file=examples/database/08-safe-writes.sql
```

数据库专属生成键与 UPSERT 示例：

```bash
mysql app_learning < examples/database/08-mysql-generated-key-upsert.sql
psql --dbname=app_learning --file=examples/database/08-postgresql-returning-upsert.sql
```

三份脚本创建的都是会话临时表。MySQL 的事务回滚需要事务型存储引擎，本路线以默认的 InnoDB 为前提；MySQL 专属脚本也显式指定了 InnoDB。请仍然先确认连接目标是专用学习数据库，不要把学习脚本直接套用到生产表。

### 跨库脚本预期检查点

- 初始账号有 101、102、103 三行。
- 事务内插入账号 104 后可查询到该行。
- 账号 101 使用期望版本 1 更新成功，名称变为“林夏（已验证）”，版本变为 2。
- 再使用过期版本 1 更新时，账号 101 保持不变。
- 账号 102 只在旧状态为 active 时转为 suspended。
- 账号 103 软删除后，普通有效账号查询不再返回它。
- 硬删除只针对事务中刚创建的账号 104。
- ROLLBACK 后恢复为最初三行，账号 101 的名称和版本也恢复原值。

MySQL 专属脚本应返回生成的联系人 ID，UPSERT 后名称为“林夏（更新）”，回滚后行数为 0。PostgreSQL 专属脚本通过两次 `RETURNING` 返回插入及更新后的行，回滚后行数同样为 0。

## 本课小结

- INSERT 显式写列名，所有外部数据使用参数绑定。
- 后端校验改善体验，数据库约束负责并发下的最终正确性。
- 生成主键应使用驱动生成键 API、`LAST_INSERT_ID()` 或 `RETURNING`，不能查 `MAX(id)`。
- UPDATE 和 DELETE 先用相同 WHERE 做 SELECT 预览。
- 主键只负责定位，租户、所有者、旧状态和版本条件负责业务边界。
- 每次精确写入都要检查影响行数或返回行。
- 整数版本列配合条件 UPDATE 可以检测丢失更新。
- 软删除会改变查询、唯一约束、恢复和合规设计，不是免费功能。
- UPSERT 依赖唯一约束实现原子冲突处理，但 MySQL 与 PostgreSQL 语法不同。
- 幂等接口需要稳定幂等键、请求摘要和事务，不等于随意 UPSERT。
- 事务是写入安全的一层，不能替代精确条件、权限、备份和审计。

## 官方资料

- [MySQL 8.4：INSERT](https://dev.mysql.com/doc/refman/8.4/en/insert.html)
- [MySQL 8.4：UPDATE](https://dev.mysql.com/doc/refman/8.4/en/update.html)
- [MySQL 8.4：DELETE](https://dev.mysql.com/doc/refman/8.4/en/delete.html)
- [MySQL 8.4：INSERT ON DUPLICATE KEY UPDATE](https://dev.mysql.com/doc/refman/8.4/en/insert-on-duplicate.html)
- [MySQL 8.4：START TRANSACTION、COMMIT 与 ROLLBACK](https://dev.mysql.com/doc/refman/8.4/en/commit.html)
- [PostgreSQL 18：INSERT 与 ON CONFLICT](https://www.postgresql.org/docs/18/sql-insert.html)
- [PostgreSQL 18：UPDATE](https://www.postgresql.org/docs/18/sql-update.html)
- [PostgreSQL 18：DELETE](https://www.postgresql.org/docs/18/sql-delete.html)
- [PostgreSQL 18：从修改行返回数据](https://www.postgresql.org/docs/18/dml-returning.html)
- [PostgreSQL 18：事务教程](https://www.postgresql.org/docs/18/tutorial-transactions.html)
