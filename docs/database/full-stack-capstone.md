---
title: 全栈数据库阶段项目：用户、角色与权限
description: 用一个规模受控的权限模块串联表设计、约束、JOIN、事务、索引、执行计划、迁移和数据库测试
prev:
  text: 数据库分层导航
  link: /database/
---

# 全栈数据库阶段项目：用户、角色与权限

这不是一组新的理论课，而是数据库必修主线的收尾项目。你将实现一个最小的用户、角色与权限模块，把之前分散学习的知识放进同一条后端请求链路。

::: tip 完成边界
项目只需要支持：创建用户并分配初始角色、按条件分页查询用户、查询某个用户的有效权限。当前完成表结构、事务、索引和执行计划即可结束数据库首次学习；学完 Spring 数据访问后，再回来补接口与集成测试。

不需要实现管理后台、组织架构、字段级权限、Redis 权限缓存或通用 RBAC 框架。
:::

## 分两次完成，不要提前学习 Spring

本站后端路线使用 Java 与 Spring Boot。如果你还没有学到 Spring 数据访问，不需要为了完成数据库专题临时跳过去学习框架。这个项目分成两个检查点：

### 检查点 A：现在完成 SQL 闭环

完成下面内容后，就可以暂停数据库课程并进入 Java 后端：

- 能解释五张表分别保存什么，以及两个关联表为什么需要联合主键。
- 选择 MySQL 或 PostgreSQL，阅读并在自己的学习库运行对应脚本。
- 看懂创建用户事务为什么必须使用同一连接，以及失败时为什么回滚。
- 看懂用户列表的 `EXISTS`、稳定排序和联合索引之间的关系。
- 对列表查询执行 `EXPLAIN`，回答扫描方式、读取行数和排序三个问题。

此时不要求编写 Controller、Service、Repository，也不要求接入 ORM。

### 检查点 B：学完 Spring 数据访问后返回

到后端课程已经覆盖 Spring Boot、数据库驱动、事务和测试时，再回来完成：

- `POST /api/users` 与用户列表接口。
- Repository 参数绑定和数据库错误映射。
- 创建用户并分配初始角色的事务。
- 使用真实目标数据库的集成测试。

第二次回来时，你不是重新学习 SQL，而是在验证后端代码有没有正确尊重数据库边界。

## 先理解业务，而不是先建表

项目只有四条业务规则：

1. 邮箱唯一标识一个用户，用户状态只能是 `active`、`disabled` 或 `pending`。
2. 角色代码和权限代码分别唯一，例如 `admin`、`member`、`user:read`。
3. 一个用户可以拥有多个角色，一个角色可以分配给多个用户。
4. 一个角色可以拥有多个权限，一个权限也可以属于多个角色。

由此可以识别五张表：

```text
users ──< user_roles >── roles ──< role_permissions >── permissions
```

- `users`、`roles`、`permissions` 保存三类独立实体。
- `user_roles`、`role_permissions` 表达两个多对多关系。
- 关联表的联合主键阻止重复分配，外键阻止引用不存在的实体。

这比把角色数组和权限数组直接塞进 `users` 的一个 JSON 字段更容易维护唯一性、关联完整性和查询条件。

## 示例文件

- MySQL 8.4 脚本：`examples/database/capstone/mysql.sql`
- PostgreSQL 脚本：`examples/database/capstone/postgresql.sql`
- 静态安全检查：`examples/database/capstone/verify.mjs`

两个 SQL 文件使用独立的 `capstone_` 表名前缀，不包含 `DROP`、`TRUNCATE` 和无条件删除。请只在自己的学习数据库中运行，生产环境应通过项目的 migration 工具发布。

先运行静态检查：

```bash
node examples/database/capstone/verify.mjs
```

再选择项目实际使用的一种数据库：

```bash
# MySQL：显式选择学习数据库，不在命令行填写密码
mysql --database=your_learning_database --user=your_user --password \
  < examples/database/capstone/mysql.sql
```

```bash
# PostgreSQL：连接信息建议由环境变量或服务配置提供
psql --dbname=your_learning_database \
  --file=examples/database/capstone/postgresql.sql
```

脚本中的演示写事务最终执行 `ROLLBACK`，不会保留演示用户；建表和基础角色、权限种子会保留，方便后端继续联调。

## 从接口契约推导访问模式

### 创建用户并分配初始角色

```http
POST /api/users
Content-Type: application/json

{
  "email": "linxia@example.com",
  "displayName": "林夏",
  "initialRole": "member"
}
```

后端需要在同一连接、同一事务中：

1. 按角色代码读取角色 ID；不存在则返回业务错误。
2. 插入用户并取得数据库生成的用户 ID。
3. 插入 `user_roles`。
4. 提交事务；任何一步失败都回滚。

邮箱唯一不能只靠“插入前先查一次”，因为两个并发请求可能同时查到不存在。真正的并发防线是 `users.email` 的唯一约束；后端捕获唯一冲突后返回 `409 Conflict`。

```text
参数校验
   ↓
开始事务并取得同一连接
   ↓
检查角色 → 插入用户 → 建立用户角色关系
   ↓ 任一步失败                   ↓ 全部成功
回滚并映射错误                    提交并返回用户
```

### 用户列表

```http
GET /api/users?status=active&role=member&pageSize=20
```

查询应满足：

- `status`、`role` 必须来自后端允许的值或通过参数绑定传入。
- `pageSize` 设置合理上限，例如 100。
- 排序使用 `created_at DESC, id DESC`，避免相同时间导致翻页不稳定。
- 仅判断角色是否存在时优先使用 `EXISTS`，避免 JOIN 后一名用户产生多行。
- 数据量变大后可使用 `(created_at, id)` 作为 keyset 游标。

示例索引 `capstone_users(status, created_at, id)` 对应的正是“按状态筛选，再按创建时间和主键倒序分页”这一查询形状。索引不是因为这些列重要，而是因为接口按这个顺序访问它们。

### 用户有效权限

权限查询沿着下面的关系传播：

```text
user_id
  → user_roles.role_id
  → role_permissions.permission_id
  → permissions.code
```

同一权限可能通过多个角色到达，因此结果使用 `DISTINCT` 去重。这里查询的是数据库中的实时授权事实；只有真实项目证明它是热点后，才考虑在 Redis 中缓存，并设计角色变化后的失效协议。

## 怎样检查执行计划

先确保已有少量种子数据，再对用户列表查询执行：

```sql
EXPLAIN
SELECT u.id, u.email, u.display_name, u.status, u.created_at
FROM capstone_users AS u
WHERE u.status = 'active'
ORDER BY u.created_at DESC, u.id DESC
LIMIT 20;
```

第一次只回答：

1. 从 `capstone_users` 读取了多少行？
2. 是否选择了以 `status` 开头的联合索引？
3. 是否出现额外排序？
4. 估算行数是否明显偏离实际数据？

学习库只有几行数据时，优化器选择全表扫描完全可能是合理的。不要为了让计划“显示索引”而强制索引；小表扫描比通过索引反查数据页更便宜。

## 后端实现边界

Repository 可以暴露三个明确方法：

```ts
type CreateUserInput = {
  email: string
  displayName: string
  initialRoleCode: string
}

type UserCursor = {
  createdAt: string
  id: string
}

interface UserRepository {
  createWithInitialRole(input: CreateUserInput): Promise<User>
  list(input: { status?: string; roleCode?: string; limit: number; cursor?: UserCursor }): Promise<User[]>
  findPermissionCodes(userId: string): Promise<string[]>
}
```

实现时检查以下边界：

- SQL 使用驱动参数，不拼接邮箱、状态、角色代码或游标。
- 事务回调中的全部查询使用事务对象提供的连接。
- 数据库 `BIGINT` ID 在 JavaScript/JSON 边界按字符串处理。
- 唯一冲突、外键冲突和未知数据库错误分别映射，不把原始数据库错误直接返回浏览器。
- 日志记录查询名称、耗时和错误类别，不记录密码或完整敏感参数。

## Migration 应该怎样拆分

示例为方便阅读把结构放在一个文件中。真实项目至少应区分：

```text
001_create_users_roles_permissions
002_seed_builtin_roles_permissions
```

migration 需要满足：

- 从空数据库按顺序执行成功。
- 已执行版本不会被修改；新变化创建新版本。
- 应用发布期间保持前后版本兼容。
- 失败恢复方案明确；不要默认所有 MySQL DDL 都能随应用事务回滚。
- 生产删除列或约束前，先确认旧应用不再读写。

## 最小集成测试

这不是要求编写大量测试，只需覆盖数据库真正负责的边界：

| 场景 | 要证明什么 |
| --- | --- |
| 创建用户并分配角色成功 | 多表事务和生成 ID 正确 |
| 角色不存在 | 整个事务回滚，不留下用户 |
| 两次创建同一邮箱 | 唯一约束生效，接口映射为冲突 |
| 重复分配同一角色 | 关联表联合主键生效 |
| 查询用户权限 | 多角色产生的重复权限被去重 |
| migration 从空库执行 | 测试环境和生产不会依赖手工建表 |

测试使用项目实际选择的 MySQL 或 PostgreSQL，而不是只 mock Repository。每个测试通过事务回滚或独立 schema/database 隔离，避免依赖执行顺序。

## 完成检查

检查点 A 完成后，数据库的首次学习已经结束。检查点 B 完成后，你应该能解释整条应用链路：

```text
接口参数
  → Repository 参数绑定
  → 表、类型、约束和关系
  → 同连接事务
  → JOIN / EXISTS 查询
  → 联合索引与执行计划
  → migration
  → 真实数据库集成测试
```

此时应该回到完整全栈项目继续开发。连接池调优、分库分表、CDC、PITR 和 Redis 集群等内容，等项目真的出现对应问题时再进入进阶或参考专题。

## 官方资料

- [MySQL 8.4：CREATE TABLE](https://dev.mysql.com/doc/refman/8.4/en/create-table.html)
- [MySQL 8.4：外键约束](https://dev.mysql.com/doc/refman/8.4/en/create-table-foreign-keys.html)
- [MySQL 8.4：事务提交与回滚](https://dev.mysql.com/doc/refman/8.4/en/commit.html)
- [PostgreSQL：约束](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [PostgreSQL：多列索引](https://www.postgresql.org/docs/current/indexes-multicolumn.html)
- [PostgreSQL：事务](https://www.postgresql.org/docs/current/tutorial-transactions.html)
