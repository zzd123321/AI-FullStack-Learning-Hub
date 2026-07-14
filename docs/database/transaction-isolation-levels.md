---
title: 并发异常与事务隔离级别
description: 理解脏读、不可重复读、幻读、丢失更新、写偏差及 MySQL/PostgreSQL 隔离实现
prev:
  text: 事务与 ACID：从转账接口到原子提交
  link: /database/transactions-and-acid
---

# 并发异常与事务隔离级别

事务保证一组操作原子提交，却不代表并发事务等同于排队执行。隔离级别决定每条语句看到哪个版本的数据，以及数据库何时等待、报冲突或允许并发。

## 用两个请求思考并发

库存初始为 1。请求 A、B 同时读取库存，都判断可以下单，再分别写入 0。如果业务还分别创建两张订单，就卖出了两件商品。每个事务内部都完整提交，整体不变量仍被破坏。

分析并发必须画时间线：

| 时刻 | 事务 A | 事务 B |
| --- | --- | --- |
| T1 | 读取 stock=1 | |
| T2 | | 读取 stock=1 |
| T3 | 写 stock=0 | |
| T4 | | 写 stock=0 |
| T5 | COMMIT | COMMIT |

正确方向是条件更新：

```sql
UPDATE inventory
SET stock = stock - 1
WHERE product_id = ?
  AND stock >= 1;
```

检查影响行数，将检查与扣减合为一个原子写入。

## 四种标准隔离级别

| 隔离级别 | 脏读 | 不可重复读 | 幻读 | 序列化异常 |
| --- | --- | --- | --- | --- |
| READ UNCOMMITTED | 标准允许 | 可能 | 可能 | 可能 |
| READ COMMITTED | 禁止 | 可能 | 可能 | 可能 |
| REPEATABLE READ | 禁止 | 禁止 | 标准仍可能 | 可能 |
| SERIALIZABLE | 禁止 | 禁止 | 禁止 | 禁止成功提交 |

表格描述 SQL 标准最低保证，不等于每个数据库的精确实现。

## 脏读

事务 B 读取事务 A 尚未提交的修改；若 A 随后回滚，B 曾使用一个从未真实存在的状态。PostgreSQL 即使请求 READ UNCOMMITTED 也按 READ COMMITTED 处理；InnoDB 的常规一致性读同样不提供典型脏读。

## 不可重复读

A 在同一事务两次读取同一行，中间 B 修改并提交，A 第二次看到不同值。PostgreSQL READ COMMITTED 每条语句取得新快照，因此可能发生；REPEATABLE READ 使用事务级快照。

## 幻读

A 两次执行 `WHERE status='pending'`，B 中间插入符合条件的新行，第二次结果集合多出“幻影”。PostgreSQL REPEATABLE READ 提供比标准最低要求更强的快照，不出现这种幻读；InnoDB REPEATABLE READ 的一致性读和锁定范围查询还涉及 next-key/gap locks，必须区分普通快照读与锁定读。

## 丢失更新

两个请求基于相同旧值计算新值，后写覆盖先写。解决方式包括：

- `SET stock = stock - 1` 这类数据库内原子表达式。
- `WHERE version = ?` 的乐观锁。
- `SELECT ... FOR UPDATE` 后在短事务内修改。
- SERIALIZABLE 并重试失败事务。

仅提高到 REPEATABLE READ 不能替代明确的写入冲突策略。

## 写偏差

两名医生至少一人必须值班。A、B 各读取“两人都值班”，随后分别把自己改为休息，修改不同的行，因此普通行锁不冲突，最终无人值班。这是跨多行不变量，可能需要 SERIALIZABLE、显式锁住共同守护行，或重新建模为可约束的数据结构。

## MySQL 与 PostgreSQL 默认值不同

- MySQL InnoDB 默认通常是 REPEATABLE READ。
- PostgreSQL 默认是 READ COMMITTED。
- PostgreSQL READ UNCOMMITTED 等同 READ COMMITTED。
- PostgreSQL REPEATABLE READ 基于事务快照，但仍可能出现序列化异常。
- PostgreSQL SERIALIZABLE 使用可序列化快照隔离，检测危险依赖并让某个事务以 serialization failure 失败。

迁移数据库时不能只复制隔离级别名称，必须重新验证业务现象。

## 设置隔离级别

MySQL：

```sql
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
START TRANSACTION;
```

PostgreSQL：

```sql
BEGIN ISOLATION LEVEL REPEATABLE READ;
```

应在事务第一条普通查询前设置。会话级默认可能污染连接池中的后续请求，应用通常优先设置单个事务特征并在归还连接时重置状态。

## 普通读与锁定读不是一回事

普通 SELECT 通常读取 MVCC 快照；锁定读要求当前可锁定版本：

```sql
SELECT id, stock
FROM inventory
WHERE product_id = ?
FOR UPDATE;
```

`FOR UPDATE` 会阻止其他事务同时修改选中行，锁在 COMMIT/ROLLBACK 后释放。查询条件必须有合适索引，否则可能扫描并锁住远超预期的记录或范围。

`NOWAIT` 在锁不可得时立即报错；`SKIP LOCKED` 跳过锁定行，适合多消费者任务队列，不适合要求完整一致结果的普通查询。

## SERIALIZABLE 不是无需思考

可序列化级别保证成功提交的结果等价于某种串行顺序，但实现可能通过阻塞、范围锁或检测依赖后中止事务。应用必须：

1. 捕获死锁或序列化失败。
2. 回滚当前事务。
3. 带随机抖动重试整个事务。
4. 限制重试次数并记录指标。

更高隔离可能降低并发、增加回滚，应该按不变量选择，而不是全局盲目调高。

## 死锁与隔离级别

两个事务按相反顺序锁定账号 101、102，可能互相等待。数据库会选择一个受害者回滚。降低隔离级别并不能消除写操作死锁；更有效的是统一锁顺序、缩短事务、建立合适索引，并正确重试。

## 安全检查脚本

配套脚本只读取当前隔离配置，并开启只读事务后回滚：

```bash
mysql app_learning < examples/database/12-mysql-isolation-inspection.sql
psql --dbname=app_learning --file=examples/database/12-postgresql-isolation-inspection.sql
```

真正的并发现象需要两个独立数据库会话和共享测试表。本课不自动创建永久共享表，也不提供可能遗留锁或数据的自动并发脚本。

## 排查清单

1. 写出业务不变量，而不只描述单行更新。
2. 画出两个事务的读取、写入和提交时间线。
3. 区分普通快照读与 FOR UPDATE 锁定读。
4. 确认数据库、版本、存储引擎和实际隔离级别。
5. 检查 WHERE 索引及锁定范围。
6. 对冲突、死锁、序列化失败重试整个事务。
7. 监控事务时长、锁等待和回滚率。

## 本课小结

- 事务原子性不等于并发安全。
- 标准隔离级别描述最低保证，两库实现并不相同。
- 条件更新和版本列常比“先读后写”可靠。
- REPEATABLE READ 仍可能存在写偏差等序列化异常。
- FOR UPDATE 锁定当前行，普通 SELECT 通常读取快照。
- SERIALIZABLE 需要应用处理并重试序列化失败。
- 死锁是正常并发错误路径，统一锁顺序并重试整个事务。

## 官方资料

- [MySQL 8.4：事务隔离级别](https://dev.mysql.com/doc/refman/8.4/en/innodb-transaction-isolation-levels.html)
- [MySQL 8.4：锁定读](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html)
- [MySQL 8.4：InnoDB 死锁](https://dev.mysql.com/doc/refman/8.4/en/innodb-deadlocks.html)
- [PostgreSQL 18：事务隔离](https://www.postgresql.org/docs/18/transaction-iso.html)
- [PostgreSQL 18：显式锁](https://www.postgresql.org/docs/18/explicit-locking.html)
- [PostgreSQL 18：序列化失败处理](https://www.postgresql.org/docs/18/mvcc-serialization-failure-handling.html)
