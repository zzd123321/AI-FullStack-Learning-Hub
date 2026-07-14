---
title: 并发异常与事务隔离级别
description: 从快照、时间线和业务不变量理解脏读、不可重复读、幻读、丢失更新、写偏差及两库隔离实现
prev:
  text: 事务与 ACID：从转账接口到原子提交
  link: /database/transactions-and-acid
next:
  text: 锁、MVCC 与并发等待
  link: /database/locks-and-mvcc
---

# 并发异常与事务隔离级别

事务能保证一次请求中的多步数据库修改一起提交或一起回滚，却不代表多个事务会自动排队执行。两个接口请求可以同时读取、等待、修改和提交；即使每个事务单独看都正确，组合结果仍可能破坏库存、余额或权限不变量。

## 本课目标与阅读路线

完成本课后，你应能沿着两个事务的时间线识别脏读、不可重复读、幻读、丢失更新和写偏差，区分“标准术语”与 MySQL/PostgreSQL 的具体实现，并按业务不变量选择隔离、锁或约束方案。它承接 ACID 的原子边界，下一课会进一步解释锁和 MVCC 如何在内部实现这些可见性与等待规则。

隔离级别规定并发事务之间的可见性与冲突处理：一条语句能看到哪个已提交版本，是否可能看到未提交版本，写入冲突时等待还是失败，以及一组成功事务的结果是否等价于某种串行执行。

本课的目标不是背诵四个名称，而是学会回答：当前 SQL 读到了什么、哪个业务判断可能过期、数据库会阻止哪种冲突，以及应用还要承担什么责任。

## 先区分四个问题

分析并发时，把问题拆成四层：

| 层次 | 要回答的问题 | 典型机制 |
| --- | --- | --- |
| 事务边界 | 哪些步骤必须一起提交 | BEGIN、COMMIT、ROLLBACK |
| 可见性 | 当前读能看到哪个版本 | 隔离级别、MVCC 快照 |
| 互斥 | 谁可以同时修改同一资源 | 行锁、范围锁、条件写入 |
| 全局正确性 | 结果是否符合业务不变量 | 约束、序列化检测、建模与重试 |

BEGIN 只建立事务边界，不会自动选择正确的不变量保护方式。MVCC 让普通读不必总等待写入，也不代表两个写请求永不冲突。提高隔离级别可以减少允许的并发现象，却不能替代唯一约束、原子 UPDATE 和明确的状态转换。

## 用串行执行作为参照

假设事务 A、B 真正一个接一个运行，只有两种顺序：

```text
A 完整执行并提交 → B 完整执行并提交
```

或：

```text
B 完整执行并提交 → A 完整执行并提交
```

可序列化（Serializable）的核心不是“物理上完全排队”，而是所有成功提交事务的整体效果，必须等价于某一种串行顺序。数据库仍可让它们并发运行，只是在发现不可能对应任何串行顺序时阻塞或中止某个事务。

较低隔离级别允许更多交错来换取并发能力。是否安全取决于业务读取和写入方式，不取决于级别名称听起来是否“足够高级”。

## 用两个下单请求建立时间线

库存初始为 1。请求 A、B 都采用“先读、在应用判断、再写固定新值”：

| 时刻 | 事务 A | 事务 B |
| --- | --- | --- |
| T1 | 读取 `stock=1` | |
| T2 | | 读取 `stock=1` |
| T3 | 计算新值 0 | 计算新值 0 |
| T4 | 写 `stock=0` | 等待或稍后写 `stock=0` |
| T5 | COMMIT | COMMIT |

如果两个事务还各自创建一张订单，库存最终虽然是 0，却卖出了两件商品。这是基于旧读做决定导致的不变量破坏。

更可靠的写法把检查与扣减放进同一条原子语句：

```sql
UPDATE inventory
SET stock = stock - 1
WHERE product_id = ?
  AND stock >= 1;
```

后端检查影响行数：1 表示成功扣减，0 表示不存在或库存不足。数据库在执行 UPDATE 时协调写锁，不需要两个请求先把旧库存拿回应用再计算。

这个例子说明：隔离级别是并发正确性的一部分，SQL 形状同样重要。

## SQL 标准的四种现象

SQL 标准用几类现象定义隔离级别的最低保护：

| 隔离级别 | 脏读 | 不可重复读 | 幻读 | 序列化异常 |
| --- | --- | --- | --- | --- |
| READ UNCOMMITTED | 允许 | 可能 | 可能 | 可能 |
| READ COMMITTED | 禁止 | 可能 | 可能 | 可能 |
| REPEATABLE READ | 禁止 | 禁止 | 标准仍允许 | 可能 |
| SERIALIZABLE | 禁止 | 禁止 | 禁止 | 成功提交的事务中禁止 |

这里是标准最低保证，不是 MySQL 和 PostgreSQL 的精确实现表。数据库可以提供比标准要求更强的行为；同一个 `REPEATABLE READ` 名称在不同产品中也可能使用不同的快照、锁和冲突处理策略。

“序列化异常”不是某一行被重复读取，而是一组成功事务的最终结果无法解释为任何串行顺序。丢失更新和写偏差是理解这类业务问题的重要模式，但不能简单把所有并发异常硬塞进前三个现象。

## 脏读：读到从未提交的状态

脏读时间线：

| 时刻 | 事务 A | 事务 B |
| --- | --- | --- |
| T1 | 将余额 100 改为 0，未提交 | |
| T2 | | 读取余额 0 |
| T3 | ROLLBACK，余额恢复 100 | |

B 使用了一个最终从未提交的值。如果它根据余额 0 发送风控通知，即使数据库没有永久错误，外部副作用也已经发生。

产品差异必须说清：

- InnoDB 的 `READ UNCOMMITTED` 确实允许非锁定 SELECT 读到其他事务尚未提交的行版本，这就是脏读。
- InnoDB 从 `READ COMMITTED` 起不允许普通一致性读看到其他事务未提交的数据。
- PostgreSQL 接受 `READ UNCOMMITTED` 名称，但内部按 `READ COMMITTED` 处理，因此不提供脏读行为。

因此，不能用“MVCC 数据库通常不脏读”代替检查目标产品和实际隔离级别。

## 不可重复读：同一行两次读取不同

| 时刻 | 事务 A | 事务 B |
| --- | --- | --- |
| T1 | 读取用户状态 `active` | |
| T2 | | 改为 `disabled` 并 COMMIT |
| T3 | 再读同一用户，得到 `disabled` | |

A 在一个事务内两次读取同一行，却看到不同已提交值。这不是脏读，因为 B 已经提交。

在 READ COMMITTED 中，每条普通查询通常取得自己的语句级快照，所以这种现象可能发生。在基于稳定事务快照的 REPEATABLE READ 中，A 的第二次普通快照读仍看到旧版本 `active`。

“重复读到旧值”也不表示旧值仍是数据库当前真相。它只表示 A 的快照保持稳定；A 若要根据当前可修改状态执行写入，还要考虑锁定读或冲突检测。

## 幻读：同一条件的结果集合变化

不可重复读关注已经读过的一行发生变化；幻读关注满足查询条件的行集合变化。

| 时刻 | 事务 A | 事务 B |
| --- | --- | --- |
| T1 | 查询 `status='pending'`，得到 5 行 | |
| T2 | | 插入一条 pending 订单并 COMMIT |
| T3 | 再执行相同条件，得到 6 行 | |

新增行像“幻影”一样出现在第二次结果中。删除符合条件的行也可能使集合变少。

PostgreSQL 的 REPEATABLE READ 比标准最低要求更强，普通查询使用稳定快照，不会出现标准定义的幻读。InnoDB REPEATABLE READ 的普通一致性读也保持快照；锁定范围查询还会使用索引范围相关的 gap/next-key lock 防止影响锁定结果的插入。

这里必须区分快照读与锁定读：前者可以通过读取旧版本保持结果稳定，后者要协调“当前哪些行或范围可被修改”。下一课会展开锁范围与索引的关系。

## 丢失更新：后写覆盖先写的业务结果

典型错误是两个事务都读取旧值 10，在应用中分别加 1，再写回 11：

```text
A 读 10 → 计算 11 ───────→ 写 11
B 读 10 → 计算 11 ─────────────→ 写 11
```

两个“加一”最终只增加一次。数据库产品和隔离级别可能让第二个写等待、重新判断或报并发更新错误，但应用不应把正确性寄托在模糊假设上。

可靠策略包括：

### 数据库内原子表达式

```sql
UPDATE counters
SET value = value + 1
WHERE id = ?;
```

写入基于数据库取得的当前可修改版本，而不是应用先读出的旧数值。

### 乐观版本检查

```sql
UPDATE documents
SET body = ?,
    version = version + 1
WHERE id = ?
  AND version = ?;
```

影响 0 行表示版本已变化，应用重新读取、合并或返回冲突。

### 悲观锁定读

```sql
SELECT value
FROM counters
WHERE id = ?
FOR UPDATE;
```

随后在同一短事务、同一连接中更新。它适合必须读取多个字段后计算，且冲突值得提前串行化的场景。

### SERIALIZABLE 与完整重试

让数据库拒绝无法序列化的一组事务，应用回滚并从 BEGIN 重跑。它不能免除重试，也不能回滚事务外已经发生的副作用。

仅把隔离级别从 READ COMMITTED 改成 REPEATABLE READ，不等于所有数据库和所有 SQL 形状都自动解决丢失更新。

## 写偏差：修改不同的行也能破坏不变量

假设两名医生中至少一人必须值班：

| 时刻 | 事务 A | 事务 B |
| --- | --- | --- |
| T1 | 读取：A、B 都值班 | |
| T2 | | 读取：A、B 都值班 |
| T3 | 将医生 A 改为休息 | 将医生 B 改为休息 |
| T4 | COMMIT | COMMIT |

两个事务修改不同的行，普通单行排他锁不会直接冲突；最终却无人值班。每个事务都基于一个独立看来合法的快照做决定，这就是典型写偏差。

解决方向取决于模型：

- 使用 SERIALIZABLE，并重试被判定为序列化失败的整个事务。
- 显式锁住所有参与判断的行，并统一锁顺序。
- 引入一行共同的“值班规则”或配额记录，让更新在同一可锁资源上竞争。
- 将不变量重新建模为数据库可以用唯一、外键或检查约束表达的结构。

这说明“我更新的不是同一行，所以不会有并发问题”是不成立的。业务不变量可能跨行、跨表甚至跨服务。

## 快照何时建立

很多误解来自把 `BEGIN` 等同于“立刻冻结数据库画面”。实际要看产品和级别。

### InnoDB REPEATABLE READ

同一事务中的普通一致性读使用由第一次一致性读建立的快照。若需要在事务开始时建立一致性快照，MySQL 提供 `START TRANSACTION WITH CONSISTENT SNAPSHOT`，但仍要核对隔离级别和语句类型。

事务自己的修改对后续查询可见。于是一次普通 SELECT 的结果可能同时包含当前事务的新写入和快照中的旧版本；不要把它理解成数据库在某个物理时刻的完整备份。

### PostgreSQL REPEATABLE READ

快照对应事务中第一条非事务控制语句开始时的视图，而不是单纯执行 BEGIN 的瞬间。后续查询仍能看到当前事务自己的写入，但看不到快照后其他事务提交的变化。

### READ COMMITTED

两库在 READ COMMITTED 中，普通一致性查询通常每条语句取得新快照。单条 SELECT 内部视图保持一致，不表示下一条 SELECT 继续使用同一个视图。

所以讨论“事务看到什么”时，要同时说明数据库、隔离级别、普通读还是锁定/写入语句，以及快照建立时机。

## 普通快照读与当前写入路径

普通 SELECT 主要回答“按我的快照，哪些版本可见”。`SELECT ... FOR UPDATE`、UPDATE、DELETE 则需要找到并协调当前可锁定或可修改的版本。

这会产生看似矛盾的现象：同一个 REPEATABLE READ 事务里，普通 SELECT 仍看到旧值，而锁定读或写入路径必须处理其他事务已经提交的新版本。

InnoDB 官方文档明确不建议在需要一致整体状态时，随意混合 REPEATABLE READ 下的非锁定 SELECT 与锁定语句，因为它们可能呈现不同的数据状态。应先明确事务是在做稳定报表，还是要基于当前状态完成写入。

PostgreSQL READ COMMITTED 中，UPDATE 找到目标行后若该行正被并发更新，会等待；对方提交后，它会在新版本上重新判断 WHERE 是否仍成立。这对简单的单行条件更新很有用，但复杂搜索条件仍可能看到不容易推理的交错状态。

## MySQL InnoDB 四级行为

### READ UNCOMMITTED

- 非锁定 SELECT 可能脏读。
- 除此之外的行为大体接近 READ COMMITTED。
- 很少适合依赖精确业务状态的接口。

不能因为它可能减少部分开销，就用于余额、权限、库存和订单状态判断。

### READ COMMITTED

- 每次普通一致性读建立新快照。
- 锁定读、UPDATE、DELETE 通常只锁索引记录，不使用普通搜索 gap lock；外键与重复键检查仍可能使用 gap lock。
- 不匹配记录的锁可较早释放，通常能减少锁范围和死锁概率，但死锁仍会发生。
- 同一事务的两次 SELECT 可能看到其他事务在中间提交的变化。

### REPEATABLE READ

- InnoDB 默认隔离级别。
- 同一事务中的普通一致性读复用第一次一致性读建立的快照。
- 唯一索引完整等值查找通常只锁记录；范围搜索的锁定读、UPDATE、DELETE 可能使用 gap/next-key lock。
- 普通快照读与当前锁定/写入语句的可见状态并不完全相同。

### SERIALIZABLE

- 比 REPEATABLE READ 更严格。
- 在关闭 autocommit 的事务中，普通 SELECT 会隐式转换为 `SELECT ... FOR SHARE`。
- 更可能等待和死锁，不代表应用可以省略超时与重试。

InnoDB SERIALIZABLE 主要依靠更强锁定行为；不能把 PostgreSQL SSI 的实现细节套过来。

## PostgreSQL 四级行为

PostgreSQL 实际提供三种不同内部行为，因为 READ UNCOMMITTED 按 READ COMMITTED 处理。

### READ UNCOMMITTED / READ COMMITTED

- 默认级别是 READ COMMITTED。
- 普通 SELECT 只看该语句开始前已提交的数据和当前事务自己的写入。
- 同一事务中的连续 SELECT 可以看到不同快照。
- UPDATE/DELETE 遇到目标行被并发修改时会等待；对方提交后，在更新后的行版本上重新判断条件。

这适合按主键进行简单、独立的命令，但涉及多次读取或跨行不变量时必须额外设计。

### REPEATABLE READ

- 使用稳定事务快照，且不出现标准定义的幻读。
- 本质上属于快照隔离，但仍可能发生无法对应串行执行的写偏差。
- 若要修改的目标行在事务开始后被其他事务实际更新并提交，当前事务可能以 `could not serialize access due to concurrent update` 失败。
- 应用必须回滚并重试整个更新事务。

“错误文本含 serialize”不表示这个级别已经等同完整 SERIALIZABLE；它仍可能允许其他序列化异常。

### SERIALIZABLE

- 建立在 Repeatable Read 的快照行为上。
- PostgreSQL 使用 Serializable Snapshot Isolation 监测读写依赖。
- 发现并发结果无法对应任何串行顺序时，让某个事务以 serialization failure 失败。
- 用于依赖它保护不变量的应用必须重试完整事务。

PostgreSQL 的 predicate lock 主要用于记录可能的读写依赖，不像普通排他锁那样直接阻塞写入。它与 InnoDB 阻止范围插入的 gap lock 不是同一种机制。

## 两库同名级别不能机械对照

| 关注点 | MySQL InnoDB | PostgreSQL |
| --- | --- | --- |
| 默认级别 | REPEATABLE READ | READ COMMITTED |
| READ UNCOMMITTED | 可能脏读 | 按 READ COMMITTED 处理 |
| RR 普通读 | 事务内复用首次一致性读快照 | 事务级稳定快照 |
| RR 幻读 | 普通快照读稳定；锁定范围还涉及 next-key | 实现比标准最低要求更强，不出现标准幻读 |
| RR 并发写冲突 | 锁定读/写走当前状态与 InnoDB 锁规则 | 目标行被快照后更新可能中止事务 |
| SERIALIZABLE | 更强的锁定读行为 | SSI 依赖检测与序列化失败 |

迁移数据库时，不能只复制隔离级别名称。要用真实 SQL、索引和并发时间线重新验证结果、等待、错误码和重试行为。

## 设置和检查隔离级别

### MySQL：只设置下一事务

```sql
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
START TRANSACTION;
```

`SET TRANSACTION` 不带 SESSION/GLOBAL 时用于下一事务。事务完成后，会话默认值仍可保持原配置。

### PostgreSQL：在 BEGIN 中声明

```sql
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
```

也可以在事务开始后用 SET TRANSACTION，但必须在不违反数据库关于事务首条查询与写入的限制时设置。应用优先使用驱动提供的单事务隔离选项。

### 连接池边界

会话级 `SET SESSION`、`SET default_transaction_isolation` 等设置可能跟随物理连接进入下一个请求。若确实修改会话状态，连接归还池前必须由框架可靠重置。

配套脚本只读展示默认值和当前值，并在显式只读事务中复查；PostgreSQL 还可直接显示当前事务的 read-only 状态。MySQL 的会话默认变量不能被误当作单个 `START TRANSACTION READ ONLY` 的独立证明，因此脚本不这样标注：

```bash
mysql app_learning < examples/database/12-mysql-isolation-inspection.sql
psql --dbname=app_learning --file=examples/database/12-postgresql-isolation-inspection.sql
```

## 如何选择隔离级别

不要从“越高越好”出发，而要从读取目的和不变量出发。

### 简单点查与条件写入

按主键读写、使用唯一约束、原子 UPDATE，并能接受同一事务连续查询看到新提交时，READ COMMITTED 常能提供较好并发。

### 稳定报表快照

同一事务要执行多条查询并保持相同数据视图，可评估 REPEATABLE READ 的稳定快照。报表事务仍要短，避免长期保留旧版本。

### 跨行不变量

值班人数、总配额、跨账户规则等依赖多个读取结果时，考虑 SERIALIZABLE、显式锁住共同资源或重新建模为可约束状态。

### 工作队列与抢占

需要消费者互斥领取任务时，重点是锁定读、`SKIP LOCKED`、租约和幂等，而不是只调高隔离级别。

选择后必须在真实数据库版本上做并发验证，并记录预期是等待、失败还是允许继续。

## 可重试错误的完整边界

可序列化和并发控制通常通过“让一个事务失败”保持整体正确，因此失败是正常控制路径，不是数据库随机故障。

```text
attempt = 0
while attempt < maxAttempts:
  begin transaction
  try:
    重新读取所有判断所需数据
    执行全部写入
    commit
    return success
  catch recognizedRetryableDatabaseError:
    rollback
    随机退避
    attempt += 1
throw concurrencyFailure
```

重试必须满足：

1. 只匹配明确的死锁、序列化失败等可重试错误。
2. 从 BEGIN 重跑，不能只重试最后一条 SQL。
3. 每次重新读取，不能复用上次事务对象和计算结论。
4. 设置最大次数、指数退避和随机抖动。
5. 记录数据库、错误码、尝试次数与事务耗时。
6. 邮件、支付、消息等外部副作用需要幂等或在提交后触发。

PostgreSQL 常见序列化失败 SQLSTATE 为 `40001`，死锁为 `40P01`。MySQL/InnoDB 的死锁和锁等待超时有自己的错误码与驱动异常类型。生产代码应按目标驱动核对，不能靠匹配错误文本。

## 为什么本课不自动制造并发异常

真实脏读、幻读和写偏差需要两个独立数据库会话共享同一组测试数据。会话临时表无法被另一个会话看到；创建永久演示表又需要严格的环境隔离、执行顺序和清理流程。

本课因此采用可复核时间线和只读检查脚本，不自动创建可能遗留的共享对象，也不提供会无限等待锁的单文件脚本。需要在团队测试环境验证时，应使用专门数据库、两个明确标识的会话、语句超时和受控清理方案。

## 并发问题排查顺序

1. 写出业务不变量，例如“库存不得为负”或“至少一人值班”。
2. 画出两个事务的读、写、等待、提交时间线。
3. 标出每次普通读使用语句快照还是事务快照。
4. 区分普通快照读、锁定读和 UPDATE/DELETE。
5. 确认数据库产品、版本、存储引擎和实际隔离级别。
6. 检查 WHERE 条件、唯一约束、版本列和使用的索引。
7. 判断预期结果是等待、立即失败、跳过还是允许并发。
8. 检查应用是否回滚并重试整个事务。
9. 关联请求 ID、连接 ID、事务时长和锁等待。
10. 用故障注入验证 COMMIT 结果未知和外部副作用幂等。

## 常见误区

### “有事务就不会超卖”

事务只保证单次尝试的原子边界。两个事务仍可能基于同一旧值做决定；库存应使用条件 UPDATE、锁定读或可序列化策略。

### “REPEATABLE READ 就是所有读都永远相同”

当前事务自己的修改可见，锁定读和写入路径也必须处理当前可修改版本。MySQL 与 PostgreSQL 的冲突行为更不相同。

### “更高隔离级别一定更快解决问题”

更强保护可能带来更多锁等待、中止和重试。先定义不变量和访问模式，再选择最小但足够的机制。

### “锁住读取到的那一行就保护了所有规则”

写偏差可能修改不同的行，幻读涉及查询范围。必须锁住真正代表不变量的资源，或使用 SERIALIZABLE/重新建模。

### “序列化失败说明数据库坏了”

它往往表示数据库主动中止某个并发事务，从而避免不可序列化结果。应用若选择该隔离策略，就必须把完整重试作为正常路径。

## 本课小结

- 事务边界保证一组步骤原子提交，隔离级别决定并发事务的可见性与冲突处理。
- SQL 标准四级描述最低保护；同名级别在 MySQL 与 PostgreSQL 中不能机械等同。
- InnoDB READ UNCOMMITTED 可能脏读；PostgreSQL 将它按 READ COMMITTED 处理。
- READ COMMITTED 通常使用语句级快照，同一事务连续查询可能看到不同已提交状态。
- REPEATABLE READ 提供稳定快照，但当前事务写入、锁定读和并发写冲突仍需单独理解。
- 丢失更新优先用原子表达式、版本检查或短事务锁定读解决。
- 写偏差修改不同记录也能破坏跨行不变量，可能需要 SERIALIZABLE、共同锁资源或重新建模。
- PostgreSQL SERIALIZABLE 使用 SSI 检测危险依赖；InnoDB SERIALIZABLE 主要加强锁定行为。
- 可重试错误必须回滚并从 BEGIN 重跑整个事务，外部副作用还要幂等。
- 选择隔离级别要从业务不变量、读写形状和可接受的等待/失败方式出发。

## 官方资料

- [MySQL 8.4：事务隔离级别](https://dev.mysql.com/doc/refman/8.4/en/innodb-transaction-isolation-levels.html)
- [MySQL 8.4：一致性非锁定读](https://dev.mysql.com/doc/refman/8.4/en/innodb-consistent-read.html)
- [MySQL 8.4：锁定读](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html)
- [MySQL 8.4：SET TRANSACTION](https://dev.mysql.com/doc/refman/8.4/en/set-transaction.html)
- [MySQL 8.4：InnoDB 死锁](https://dev.mysql.com/doc/refman/8.4/en/innodb-deadlocks.html)
- [PostgreSQL 18：事务隔离](https://www.postgresql.org/docs/18/transaction-iso.html)
- [PostgreSQL 18：显式锁](https://www.postgresql.org/docs/18/explicit-locking.html)
- [PostgreSQL 18：SET TRANSACTION](https://www.postgresql.org/docs/18/sql-set-transaction.html)
- [PostgreSQL 18：序列化失败处理](https://www.postgresql.org/docs/18/mvcc-serialization-failure-handling.html)
