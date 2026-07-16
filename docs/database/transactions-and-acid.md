---
title: 事务与 ACID：从转账接口到原子提交
description: 从多步转账写入出发，理解原子性、一致性、隔离性、持久性、自动提交、保存点和外部副作用
prev:
  text: 读懂执行计划：扫描、连接、排序与实际执行
  link: /database/reading-query-plans
next:
  text: 并发异常与事务隔离级别
  link: /database/transaction-isolation-levels
---

# 事务与 ACID：从转账接口到原子提交

::: tip 第一次学习只抓住四件事
- **必须理解**：事务保护一个业务不变量，使多步写入一起提交或一起回滚；它不是把整段 HTTP 请求无限包住。
- **必须会做**：在同一个数据库连接上开始事务、执行所有相关语句、提交，并在异常时回滚。
- **必须完成**：让一个多表写入在中途失败时不留下半成品数据。
- **可以后看**：分布式事务、日志实现细节和严格形式化的 ACID 讨论。
:::

许多后端操作不是一条 SQL：转账需要扣款、入账和记录流水；创建订单需要冻结库存、保存订单和写入事件。如果第一步成功、第二步失败，数据库就会留下业务上无法接受的中间状态。

事务把一组数据库操作定义为一个原子工作单元：最终要么全部提交，要么全部回滚。本课先建立正确的事务边界；隔离级别、锁和 MVCC 将在后续课程深入。

## 从转账接口定义原子边界

假设接口：

```text
POST /api/transfers
Idempotency-Key: transfer-20260714-001

{
  "fromAccountId": "101",
  "toAccountId": "102",
  "amount": "250.00"
}
```

至少包含：

1. 验证两个账号和金额。
2. 从 101 扣除 `250.00`。
3. 向 102 增加 `250.00`。
4. 写入唯一转账流水。
5. 提交后返回成功。

第 2 到第 4 步必须共享数据库事务。否则可能只扣款未入账，或余额已变化但没有可审计流水。

## BEGIN、COMMIT 与 ROLLBACK

基本结构：

```sql
BEGIN;

UPDATE accounts ...;
UPDATE accounts ...;
INSERT INTO transfers ...;

COMMIT;
```

若任一步失败：

```sql
ROLLBACK;
```

MySQL 应用中常显式使用：

```sql
START TRANSACTION;
```

PostgreSQL 常使用 `BEGIN`。驱动通常提供 `beginTransaction()`、`commit()`、`rollback()` 等 API，优先遵循驱动事务接口，确保同一连接贯穿整个事务。

## 自动提交为什么会破坏多步原子性

MySQL 默认启用 autocommit；PostgreSQL 在没有显式事务块时，也会把每条语句作为独立事务处理。

如果直接连续执行：

```sql
UPDATE accounts SET balance = balance - 250.00 WHERE id = 101;
UPDATE accounts SET balance = balance + 250.00 WHERE id = 102;
```

第一条成功后通常已经提交。第二条失败时，回滚无法撤销第一条已经结束的事务。

因此多步业务必须显式开始事务，并在所有步骤结束后只提交一次。不要依赖某个 ORM 当前版本“好像自动包事务”。

## ACID 分别保证什么

### Atomicity：原子性

事务中的数据库修改作为整体提交或整体取消。断言是“数据库事务内的步骤不会只永久保留一半”，不是“整个 HTTP 请求的所有世界状态都能回滚”。

### Consistency：一致性

事务从一个满足约束的状态转换到另一个满足约束的状态。但数据库不知道所有业务规则，需要共同依靠：

- 主键、唯一、外键、CHECK、NOT NULL。
- 正确的 SQL 条件和状态机。
- 应用领域校验。
- 必要的锁或隔离级别。

如果应用在同一事务里给双方都扣款，然后提交，数据库不会凭空理解这是错误转账。

### Isolation：隔离性

并发事务的中间状态不应被其他事务以破坏语义的方式观察。隔离不是“事务完全串行执行”；数据库通过锁、快照和 MVCC 在正确性与并发之间取舍。

不同隔离级别允许不同现象。仅有事务边界不代表不会发生丢失更新、不可重复读或幻读。

### Durability：持久性

数据库确认 COMMIT 成功后，修改应能在符合配置与故障模型的前提下恢复。它依赖 WAL/redo、刷盘策略、存储硬件、复制和数据库配置。

持久性不等于备份：误删被正确提交后也会被持久保存并复制。仍需要备份、时间点恢复和恢复演练。

## 一致性需要把不变量写出来

转账前后应满足：

```text
from.balance >= 0
from.balance + to.balance 的总和不因内部转账改变
request_key 在业务作用域内唯一
流水金额 > 0
```

可使用条件更新防止透支：

```sql
UPDATE accounts
SET balance = balance - ?
WHERE id = ?
  AND balance >= ?;
```

后端必须检查影响行数恰好为 1。零行可能是账号不存在或余额不足，必须回滚，不能继续给收款方加钱。

## 事务伪代码必须保证 finally 回滚

```text
connection = pool.acquire()
try:
  connection.begin()

  debitRows = debit(connection, fromId, amount)
  if debitRows != 1:
    raise InsufficientFundsOrNotFound

  creditRows = credit(connection, toId, amount)
  if creditRows != 1:
    raise TargetNotFound

  insertTransfer(connection, requestKey, fromId, toId, amount)
  connection.commit()
catch error:
  safelyRollback(connection)
  throw mapDatabaseError(error)
finally:
  pool.release(connection)
```

关键点：

- 所有 SQL 使用同一连接。
- 每个写入检查影响行数。
- 只有全部成功才 COMMIT。
- 任意异常都尝试 ROLLBACK。
- 回滚失败也要记录，连接可能需要从池中淘汰。
- 连接归还前不能遗留开放事务。

## 连接池最容易制造“事务看似存在”

错误封装可能让每个仓储方法自行从池中取连接：

```text
debit()  → connection A
credit() → connection B
```

即使外层调用了 begin，这两条 SQL 也不在同一事务中。事务上下文必须显式传递连接、entity manager 或 unit of work。

归还带开放事务的连接会污染下一个请求。连接池应在归还时重置状态，但应用仍要正确结束事务，不能把池的防御机制当主流程。

## 不要在事务中等待外部网络

下面会让数据库事务保持开放：

```text
BEGIN
UPDATE inventory
调用支付服务，等待 8 秒
INSERT order
COMMIT
```

期间可能一直占用连接、行锁、undo/WAL 和旧版本，放大锁等待与连接池耗尽。

更合理的设计通常是：

- 先完成必要的外部授权，再开启短事务持久化结果；或
- 在短事务内写业务状态与 outbox，提交后异步执行外部动作；或
- 使用明确的 saga/补偿流程处理跨系统一致性。

具体顺序取决于外部系统的幂等与补偿能力，不能靠一个本地数据库事务覆盖多个独立系统。

## 数据库回滚不了外部副作用

事务中如果已经：

- 发送邮件。
- 调用第三方扣款。
- 发布无法撤销的消息。
- 写入另一个无分布式事务的数据库。

随后 ROLLBACK，本地数据可撤销，外部动作不会自动消失。

常用 transactional outbox：在业务事务内同时写业务表和 outbox 表；提交后由独立发布器可靠投递。消费者仍需幂等，因为投递通常是至少一次而非绝对一次。

## 幂等与事务解决不同问题

事务解决“一次尝试内部的多个数据库步骤是否原子”；幂等解决“同一业务请求被重试多次是否重复生效”。两者都需要。

转账表可以建立：

```sql
UNIQUE (request_key)
```

若客户端因超时重试相同 key，唯一约束阻止第二笔流水。但还需保存请求摘要，防止同一个 key 被用于不同金额或账号。

不要先 SELECT key 是否存在再 INSERT；并发请求可能同时看到不存在。唯一约束才是最终竞争点。

## COMMIT 结果不确定怎么办

客户端发送 COMMIT 后网络断开，可能出现：

- 数据库已经提交，但客户端没收到确认。
- 数据库尚未提交，连接已断。

此时不能盲目重新执行一笔新转账。使用稳定幂等键，在新连接上按 key 查询最终状态；重试逻辑必须能识别已提交结果。

“异常抛出”不总等于“事务一定未提交”，尤其是提交阶段的连接错误。

## 事务失败后不能继续假装成功

PostgreSQL 事务块中一条语句报错后，事务通常进入 aborted 状态；后续普通语句会被拒绝，直到整个 ROLLBACK，或回滚到错误前建立的 SAVEPOINT。

MySQL InnoDB 对不同错误可能只回滚当前语句，也可能回滚整个事务。不能编写“捕获错误后继续提交剩余步骤”的跨库通用逻辑。

保守策略是：关键事务中任一未预期数据库错误都回滚整个事务；仅对事先设计的保存点局部恢复。

## SAVEPOINT：局部撤销，不是嵌套提交

```sql
BEGIN;

UPDATE accounts ...;
SAVEPOINT before_optional_audit;
INSERT INTO optional_audit ...;
ROLLBACK TO SAVEPOINT before_optional_audit;

COMMIT;
```

回滚到保存点只撤销保存点之后的修改，事务仍然开放。`RELEASE SAVEPOINT` 删除保存点并保留其后的修改。

保存点不等于真正独立的嵌套事务：外层最终 ROLLBACK 时，所谓“内层已成功”的修改仍会被撤销。

审计通常不应是可选项；示例仅为了展示语义。真实业务应明确哪些步骤允许局部失败。

## 事务要尽量短，但不能随意拆断不变量

短事务通常：

- 更快释放锁与连接。
- 减少死锁窗口。
- 降低 undo/WAL 和版本保留压力。
- 更容易失败重试。

但不能为了短把必须原子的扣款与入账拆成两个提交。优化方向是把网络、复杂计算和用户交互移出事务，而不是破坏数据库不变量。

## DDL 与事务的跨库差异

MySQL 中许多 DDL 会隐式提交当前事务，因此不能假设：

```sql
BEGIN;
CREATE TABLE ...;
ROLLBACK;
```

一定撤销结构变化。PostgreSQL 的许多 DDL 可以参与事务，但也存在不能在事务块内执行的操作和外部副作用。

数据库迁移应使用针对目标数据库验证过的迁移工具、备份与回滚方案，不能把 DML 的经验机械套到 DDL。

配套脚本在事务开始前创建临时表，事务中只执行 DML。

## MySQL 必须确认存储引擎支持事务

MySQL 事务可靠性依赖事务型存储引擎。本路线使用 InnoDB，并在脚本中显式声明：

```sql
ENGINE = InnoDB
```

混用非事务型表时，ROLLBACK 可能无法撤销其修改。生产表应核对引擎，不能只因 SQL 接受 START TRANSACTION 就假设所有表都可回滚。

## 隔离性问题不会被 BEGIN 自动消除

即使扣款、入账在一个事务里，并发事务仍可能：

- 同时读取旧余额。
- 以不同顺序锁定账号导致死锁。
- 在不同隔离级别看到不同快照。
- 出现写偏差或幻读。

条件 UPDATE 已把“余额足够”检查与扣款合为一个原子语句，但更复杂的不变量仍需锁和隔离设计。下一课将用并发时间线拆解这些现象，并解释为什么自动脚本不能在一个会话里真实复现两个事务的交错。

## 可重试错误必须重试整个事务

死锁或序列化失败时，数据库可能要求事务回滚。重试应：

1. 丢弃当前事务结果。
2. 延迟一个带随机抖动的短时间。
3. 从 BEGIN 开始重新读取与执行。
4. 设置最大次数并记录指标。

不能只重试最后一条 SQL，因为之前读取的状态可能已过期。业务操作还必须幂等，防止提交结果不确定时重复执行。

## 事务日志与审计日志不是同一概念

redo/WAL 用于崩溃恢复和复制，不是面向业务人员的永久审计接口。业务流水应保存：

- 稳定业务 ID 和幂等键。
- 来源与目标。
- 精确金额和币种。
- 状态与时间。
- 操作者或系统来源。

余额是当前状态，流水是发生过的事实；关键金额系统通常不能只修改余额而没有可追溯记录。

## 事务边界排查清单

1. 用一句话定义必须全部成功或全部失败的步骤。
2. 确认所有 SQL 使用同一数据库连接。
3. 确认目标表使用事务型存储。
4. 检查 autocommit 与 ORM 事务传播配置。
5. 把约束、条件写入和影响行数检查纳入流程。
6. 任一错误都走明确回滚路径。
7. COMMIT 前不返回 HTTP 成功。
8. 不在开放事务中等待外部网络或用户输入。
9. 用幂等键处理请求重试和提交结果不确定。
10. 对死锁等可重试错误重跑整个事务。
11. 监控事务时长、锁等待、回滚率和连接占用。
12. 用故障注入验证每一步失败后数据仍满足不变量。

## 安全运行 MySQL 示例

```bash
mysql \
  --host=127.0.0.1 \
  --port=3306 \
  --user=app_writer \
  --password \
  app_learning \
  < examples/database/11-mysql-transactions-and-acid.sql
```

## 安全运行 PostgreSQL 示例

```bash
psql \
  --host=127.0.0.1 \
  --port=5432 \
  --username=app_writer \
  --dbname=app_learning \
  --file=examples/database/11-postgresql-transactions-and-acid.sql
```

两份脚本只创建会话临时表。演示转账和保存点后执行整个 ROLLBACK，永久数据库不会新增表或业务记录。

### 预期检查点

- 初始账号 101 余额 `1000.00`，账号 102 余额 `500.00`，合计 `1500.00`。
- 事务内转账 `250.00` 后，余额分别为 `750.00` 和 `750.00`，合计仍为 `1500.00`。
- 转账流水在事务内有 1 行。
- 保存点之后插入的可选审计行被局部回滚，计数恢复为 0。
- 最终 ROLLBACK 后余额恢复为 `1000.00` 与 `500.00`，转账流水和审计表均为空。

## 本课小结

- 事务把多条数据库操作组成全部提交或全部回滚的工作单元。
- 自动提交会让独立 SQL 各自提交，不能保护多步业务。
- ACID 的一致性需要约束、条件写入和领域规则共同维护。
- COMMIT 成功后的持久性不等于备份，也不能修复正确提交的误操作。
- 所有事务 SQL 必须使用同一连接，归还连接前必须结束事务。
- 事务中避免外部网络调用；数据库回滚不了邮件、支付和消息。
- 事务解决单次原子性，幂等解决重复请求，两者不可互相替代。
- COMMIT 响应丢失时通过稳定业务键查询结果，不能盲目重复执行。
- SAVEPOINT 只局部撤销，不是独立嵌套提交。
- MySQL 要确认 InnoDB 等事务型存储引擎，并警惕 DDL 隐式提交。
- 并发异常重试必须从 BEGIN 重跑整个事务。
- BEGIN 不会自动解决隔离级别、锁顺序和并发不变量问题。

## 官方资料

- [MySQL 8.4：InnoDB 与 ACID](https://dev.mysql.com/doc/refman/8.4/en/mysql-acid.html)
- [MySQL 8.4：START TRANSACTION、COMMIT 与 ROLLBACK](https://dev.mysql.com/doc/refman/8.4/en/commit.html)
- [MySQL 8.4：自动提交、提交与回滚](https://dev.mysql.com/doc/refman/8.4/en/innodb-autocommit-commit-rollback.html)
- [MySQL 8.4：SAVEPOINT](https://dev.mysql.com/doc/refman/8.4/en/savepoint.html)
- [MySQL 8.4：导致隐式提交的语句](https://dev.mysql.com/doc/refman/8.4/en/implicit-commit.html)
- [PostgreSQL 18：事务教程](https://www.postgresql.org/docs/18/tutorial-transactions.html)
- [PostgreSQL 18：BEGIN](https://www.postgresql.org/docs/18/sql-begin.html)
- [PostgreSQL 18：COMMIT](https://www.postgresql.org/docs/18/sql-commit.html)
- [PostgreSQL 18：ROLLBACK](https://www.postgresql.org/docs/18/sql-rollback.html)
- [PostgreSQL 18：SAVEPOINT](https://www.postgresql.org/docs/18/sql-savepoint.html)
