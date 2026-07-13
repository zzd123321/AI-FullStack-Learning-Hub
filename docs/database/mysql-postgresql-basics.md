---
title: 连接并认识 MySQL 与 PostgreSQL
description: 从后端连接出发，理解客户端、服务器、会话、数据库与 PostgreSQL schema
prev:
  text: 关系模型与第一个 SQL 查询
  link: /database/relational-model-and-first-query
next:
  text: 数据类型、NULL、默认值与约束
  link: /database/data-types-defaults-and-constraints
---

# 连接并认识 MySQL 与 PostgreSQL

上一课的 SQL 看起来像是“直接操作表”，但真实后端必须先连接到一个正在运行的数据库服务器。连接目标、登录身份或默认命名空间选错，即使 SQL 本身完全正确，也可能查不到表，甚至访问到错误环境的数据。

这一课不急着比较两个产品的全部功能，而是先回答后端最常遇到的四个问题：

1. SQL 到底在哪里执行？
2. 当前连接到了哪台服务器、哪个数据库？
3. 为什么同一个表名在不同位置可以代表不同对象？
4. 应用配置中的 host、port、user、database 分别控制什么？

## 客户端、服务器与会话

MySQL 和 PostgreSQL 都采用客户端/服务器模式。可以先用一条链路理解：

```text
浏览器 → 后端接口 → 数据库驱动/连接池 → 数据库服务器 → 表
```

- **数据库服务器**：长期运行的进程，负责认证、解析 SQL、读写数据、并发控制和持久化。
- **客户端**：向服务器发起连接并发送命令的程序。命令行中的 `mysql`、`psql` 是客户端，Java JDBC、Python 数据库驱动也是客户端。
- **连接（connection）**：客户端与服务器之间的一条通信通道。
- **会话（session）**：服务器为这条连接维护的上下文，例如当前数据库、当前用户、临时表和部分会话参数。
- **连接池（connection pool）**：后端预先维护一组可复用连接；每个请求通常只是暂时借用其中一条，而不是重新启动数据库。

因此，“我的后端连接不上”至少可能发生在网络、端口、TLS、认证、数据库名或权限中的任一层。不要一看到错误就先改 SQL。

## 一条连接需要哪些信息

常见连接配置可以整理成下面这组字段：

| 字段 | 作用 | 本地常见值 | 常见误区 |
| --- | --- | --- | --- |
| `host` | 数据库服务器地址 | `127.0.0.1` | 容器里的 `127.0.0.1` 指向容器自己 |
| `port` | 服务器监听端口 | MySQL `3306`；PostgreSQL `5432` | 端口开放不等于认证成功 |
| `user` | 数据库账号或角色 | `app_reader` | 不应让业务应用长期使用管理员账号 |
| `password` | 认证凭据 | 由环境提供 | 不应写进源码、URL 或命令历史 |
| `database` | 连接目标/默认数据库 | `app_learning` | MySQL 与 PostgreSQL 对数据库边界的处理不同 |
| TLS 配置 | 加密并校验远程连接 | 依环境而定 | 生产环境不能照搬本地明文配置 |

前端构建工具公开给浏览器的环境变量可能被写入可下载的产物，因此不能用来保存数据库密码。数据库凭据应该只存在于后端或部署环境，并由服务端数据库驱动使用。

## 用命令行客户端连接

以下命令只展示参数位置。请使用专门的学习数据库和最小权限账号，不要照抄不存在的账号，也不要指向生产环境。

### MySQL

```bash
mysql \
  --host=127.0.0.1 \
  --port=3306 \
  --user=app_reader \
  --password \
  app_learning
```

只写 `--password` 会让客户端交互式询问密码，避免把明文密码直接留在 shell 历史中。

### PostgreSQL

```bash
psql \
  --host=127.0.0.1 \
  --port=5432 \
  --username=app_reader \
  --dbname=app_learning
```

`psql` 的 `-d`、`-h`、`-p`、`-U` 分别对应数据库、主机、端口和用户。连接参数可以省略并采用默认值，但学习阶段显式写出更容易判断自己连到了哪里。

命令行客户端只是学习和排错工具。后端框架最终仍会把这些信息交给驱动，建立同类连接。

## 连接后先确认身份与目标

不要根据终端标题、配置文件名或“我记得是测试库”来判断当前环境。连接成功后先向服务器查询。

### MySQL 会话

```sql
SELECT
  VERSION() AS server_version,
  DATABASE() AS current_database,
  CURRENT_USER() AS authenticated_account;
```

- `VERSION()` 返回实际连接到的服务器版本。
- `DATABASE()` 返回当前默认数据库；尚未选择时为 `NULL`。
- `CURRENT_USER()` 返回服务器用于认证和权限检查的 MySQL 账号，通常还包含账号的 host 部分。

若连接时没有选择数据库，可以在确认名称和权限后使用：

```sql
USE app_learning;
```

`USE` 会为当前会话设置默认数据库，不会创建数据库。切换前后都可以再次执行 `SELECT DATABASE()` 验证。

### PostgreSQL 会话

```sql
SELECT
  current_setting('server_version') AS server_version,
  current_database() AS current_database,
  current_user AS current_user,
  current_schema AS current_schema;

SHOW search_path;
```

PostgreSQL 连接请求必须指定一个数据库（或采用客户端推导的默认数据库）。连接建立后，`current_database()`、`current_user` 和 `current_schema` 分别回答当前数据库、权限身份和优先 schema。

`current_user` 与 `current_schema` 在 PostgreSQL 中具有特殊 SQL 语法，不需要尾随括号。

## MySQL database 与 PostgreSQL schema 不要混为一谈

两者都能执行 `SELECT * FROM users`，但寻找 `users` 的范围并不完全相同。

### MySQL 的常见层级

```text
MySQL server
└── database（在 MySQL 文档与命令中也常作为 schema 使用）
    └── table
```

`USE app_learning` 设置当前默认数据库，之后的 `users` 通常解析为 `app_learning.users`。只要权限允许，也可以使用 `other_database.users` 引用同一 MySQL 服务器中的另一数据库。

### PostgreSQL 的层级

```text
PostgreSQL cluster
└── database
    └── schema
        └── table
```

一个 PostgreSQL 连接一次只能进入一个数据库。该数据库内部可以有多个 schema，例如：

```sql
SELECT id, display_name
FROM public.learning_users
ORDER BY id;
```

这里 `public.learning_users` 是“schema 名.表名”，不是“数据库名.表名”。如果要访问另一个 PostgreSQL 数据库，通常需要建立另一条连接；不能把另一个数据库名直接加在表名前当作普通跨库查询。

## PostgreSQL 的 search_path

写 `learning_users` 而不是 `public.learning_users` 时，PostgreSQL 会按 `search_path` 的顺序寻找匹配对象。可以只读查看：

```sql
SHOW search_path;
```

这解释了两个常见现象：

- 表实际存在，但它所在的 schema 不在搜索路径中，于是报“relation does not exist”。
- 两个 schema 中有同名表，未限定 schema 的查询命中了排在前面的那个。

在迁移脚本、排错命令和需要明确边界的后端 SQL 中，使用 `schema.table` 往往更容易审查。不要随意修改共享环境的 `search_path`；它还涉及对象解析和权限安全，后续讲权限时会继续展开。

## 查看自己能看到的表

数据库客户端提供了便捷命令，但要分清哪些是 SQL，哪些只属于客户端。

| 目标 | MySQL | PostgreSQL `psql` |
| --- | --- | --- |
| 查看当前目标 | `SELECT DATABASE();` | `SELECT current_database();` |
| 查看表 | `SHOW TABLES;` | `\dt` |
| 查看表结构 | `DESCRIBE learning_users;` | `\d learning_users` |
| 退出客户端 | `QUIT` | `\q` |

`SHOW TABLES`、`DESCRIBE` 是 MySQL 语句；以反斜线开头的 `\dt`、`\d`、`\q` 是 `psql` 在客户端本地处理的元命令，不是发给 PostgreSQL 服务器的 SQL。它们不能原样放进 JDBC 查询。

需要在程序中以统一表格结果读取元数据时，可以查询标准化程度较高的 `information_schema`。本课的两个脚本就采用这种方式列出当前可见表。

## 把连接错误分层排查

后端启动失败时，按连接建立的顺序阅读错误通常更快：

| 现象 | 优先检查 |
| --- | --- |
| 连接超时 | host、网络、防火墙、安全组 |
| connection refused | 端口、服务是否监听、容器端口映射 |
| TLS/证书错误 | 加密模式、CA、主机名校验、证书有效期 |
| authentication failed / access denied | user、password、认证规则、账号允许来源 |
| unknown database / database does not exist | database 名称与创建环境 |
| permission denied | 当前身份对数据库、schema、表的权限 |
| table/relation does not exist | 当前数据库、schema/search path、表名大小写 |

这和接口联调中的分层排错很像：先确认请求有没有到服务，再检查认证、路由和业务逻辑。数据库也应先确认连接边界，最后才检查查询内容。

## 安全运行只读检查脚本

两个脚本都只读取当前会话信息和元数据，不创建、不修改、不删除任何对象：

```bash
mysql \
  --host=127.0.0.1 \
  --port=3306 \
  --user=app_reader \
  --password \
  app_learning \
  < examples/database/02-mysql-session-inspection.sql
```

```bash
psql \
  --host=127.0.0.1 \
  --port=5432 \
  --username=app_reader \
  --dbname=app_learning \
  --file=examples/database/02-postgresql-session-inspection.sql
```

运行前仍要替换示例连接信息，并确认目标不是生产数据库。只读脚本不会消除“连错环境”本身带来的信息暴露风险。

## 本课小结

- 命令行工具、后端驱动都是客户端；SQL 实际由数据库服务器执行。
- 连接配置至少要区分 host、port、user、password、database 和 TLS。
- 后端应使用最小权限账号，数据库密码不能进入前端代码或命令历史。
- 连接后应查询服务器版本、当前数据库和当前身份，不靠猜测判断环境。
- PostgreSQL 的层级是集群、数据库、schema、表，单条连接只访问一个数据库。
- `psql` 反斜线命令是客户端元命令，不能当作 SQL 交给后端驱动。
- 排错应从网络、TLS、认证、数据库、权限、命名空间逐层推进。

## 官方资料

- [MySQL 8.4：客户端连接选项](https://dev.mysql.com/doc/refman/8.4/en/mysql-command-options.html)
- [MySQL 8.4：创建和使用数据库](https://dev.mysql.com/doc/refman/8.4/en/database-use.html)
- [MySQL 8.4：USE 语句](https://dev.mysql.com/doc/refman/8.4/en/use.html)
- [MySQL 8.4：查看数据库与表信息](https://dev.mysql.com/doc/refman/8.4/en/getting-information.html)
- [PostgreSQL 18：psql](https://www.postgresql.org/docs/18/app-psql.html)
- [PostgreSQL 18：数据库层级](https://www.postgresql.org/docs/18/manage-ag-overview.html)
- [PostgreSQL 18：schema 与搜索路径](https://www.postgresql.org/docs/18/ddl-schemas.html)
- [PostgreSQL 18：会话信息函数](https://www.postgresql.org/docs/18/functions-info.html)
