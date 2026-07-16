---
title: 数据库
description: 面向全栈工程师的数据库必修路线，以及按需查阅的后端与架构专题
---

# 数据库

数据库专题分成三层，**不要求按页面数量全部学完**：

1. **全栈必修主线**：第一次学习只走这一层，完成后即可继续做全栈项目。
2. **后端工程进阶**：遇到性能、权限、复制、搜索等真实需求时选学。
3. **架构与运维参考**：用于大型系统和生产事故，平时查阅，不作为入门进度。

::: tip 先记住停止点
完成“全栈必修主线”和 Redis 前两课后，数据库入门阶段就已经结束。你不需要先掌握分库分表、CDC、PITR、双时态模型或数据库事故响应，才能继续学习后端和完成项目。
:::

## 怎样使用这套课程

- 第一次学习只选一个主数据库。项目使用 MySQL 就以 MySQL 为主，使用 PostgreSQL 就以 PostgreSQL 为主；另一种数据库只了解关键差异。
- 不背配置项和执行计划字段。先理解它解决什么问题，需要时再查官方资料。
- 每学完一个阶段就回到接口代码，实际完成一次查询、写入或事务联调。
- 每篇必修课开头都有“第一次学习只抓住……”提示。第一次只完成其中的“必须理解”和“必须完成”，其余正文作为解释与参考，不要求一次记住。
- 标为“进阶”或“参考”的页面可以跳过；页面存在不等于当前必须掌握。
- 遇到不理解的高级段落时，先继续项目，不用为了“全部看懂”停住主线。

## 目录结构

```text
database/
├── core/          全栈必修
├── advanced/      后端工程进阶
├── reference/     架构与运维参考
└── redis/         Redis 独立专题，内部使用相同三层结构
```

## 第一层：全栈必修主线

[进入全栈必修目录](/database/core/)

建议按下面 15 个阶段学习。部分阶段包含两篇紧密相关的页面，但它们共同解决一个能力目标。

### 阶段 1：认识关系数据库

- [关系型数据库、表、行、列、主键与第一个 SQL 查询](/database/core/relational-model-and-first-query)
- [连接并认识 MySQL 与 PostgreSQL](/database/core/mysql-postgresql-basics)

目标：能解释浏览器请求怎样经过后端到达数据库，并能安全连接自己的学习数据库。

### 阶段 2：类型和数据边界

- [数据类型、NULL、默认值与约束](/database/core/data-types-defaults-and-constraints)

目标：知道字符串、整数、金额、时间和 NULL 为什么不能随意互换，并用约束拒绝明显坏数据。

### 阶段 3：完成可靠列表接口

- [从列表接口到可靠 SELECT：筛选、排序与分页](/database/core/select-filter-sort-pagination)

目标：实现带参数绑定、稳定排序和分页上限的列表查询。

### 阶段 4：安全写入

- [安全写入数据：INSERT、UPDATE、DELETE 与幂等边界](/database/core/safe-insert-update-delete)

目标：完成安全新增和条件更新，理解 affected rows、生成 ID 与幂等键。

### 阶段 5：表之间的关系

- [多表关系与 JOIN](/database/core/relationships-and-joins)

目标：能表达一对一、一对多和多对多关系，并避免简单 N+1 查询。

### 阶段 6：统计和复杂查询

- [聚合查询：COUNT、SUM、GROUP BY 与 HAVING](/database/core/aggregates-group-by-having)
- [子查询与 CTE：拆解复杂查询](/database/core/subqueries-and-cte)

目标：完成常用统计接口，并能把复杂 SQL 分成可验证的步骤。第一次学习不必掌握所有高级写法。

### 阶段 7：索引

- [索引如何加速查询：B-Tree、选择性与联合索引](/database/core/indexes-and-query-shapes)

目标：根据接口的等值筛选、范围、排序和分页设计一个合理联合索引。

### 阶段 8：执行计划

- [读懂执行计划：扫描、连接、排序与实际执行](/database/core/reading-query-plans)

目标：能判断查询在全表扫描、使用哪个索引、读取多少行以及是否额外排序；不要求背完所有节点。

### 阶段 9：事务

- [事务与 ACID：从转账接口到原子提交](/database/core/transactions-and-acid)

目标：让多步数据库写入在同一连接和事务中一起提交或回滚。

### 阶段 10：并发、隔离与锁

- [并发异常与事务隔离级别](/database/core/transaction-isolation-levels)
- [锁、MVCC 与并发等待](/database/core/locks-and-mvcc)

目标：理解丢失更新、锁等待和死锁，能使用条件更新、唯一约束或明确锁解决一个真实并发问题。MVCC 内部细节可留待以后。

### 阶段 11：数据库设计

- [从业务需求到表结构：实体、关系、范式与约束](/database/core/database-design-and-normalization)

目标：从接口需求识别实体、候选键、关系和业务不变量，而不是把响应 JSON 原样做成一张表。

### 阶段 12：应用数据访问层

- [ORM、数据库驱动与 Repository 边界](/database/core/orm-drivers-repository-boundaries)

目标：理解 ORM 不会替代数据库设计，确保类型映射、事务连接和生成 SQL 可观察。第一次学习重点阅读 Repository、类型映射、N+1、flush/commit 四部分。

### 阶段 13：数据库迁移

- [数据库变更、在线 DDL 与安全发布](/database/core/schema-migrations-online-ddl)

目标：掌握 migration 版本、先扩展后收缩和应用/数据库兼容顺序。大型在线 DDL 工具和锁评估属于进阶内容，可先略读。

### 阶段 14：数据库测试

- [数据库测试、测试数据与 CI 发布门禁](/database/core/testing-test-data-ci-release-gates)

目标：用真实目标数据库测试 repository、migration、约束和事务，而不只 mock ORM。

### 阶段 15：Redis 与缓存入门

- [Redis 基础与核心数据类型](/database/redis/core/fundamentals-and-data-types)
- [Cache-Aside 与缓存一致性](/database/redis/core/cache-aside-and-consistency)

目标：把关系数据库作为事实来源，使用可过期、可重建的缓存副本，并理解缓存失效的基本竞态。

::: info 全栈主线完成标准
能独立设计一个中小型业务表结构，实现带 JOIN 和分页的接口，在事务中完成多表写入，为查询设计索引并查看执行计划，再为一个热点读取加入 Cache-Aside，即可认为数据库主线完成。
:::

## 第二层：后端工程进阶

[进入后端工程进阶目录](/database/advanced/)

这些专题解决常见生产问题，但不要求连续学习。根据项目现状选择：

### 性能与可靠访问

- [数据库性能诊断：从慢接口到根因](/database/advanced/database-performance-diagnosis)
- [SQL 与索引优化实战](/database/advanced/sql-and-index-optimization)
- [数据库连接池、超时与过载保护](/database/advanced/connection-pools-timeouts-overload)

适合：接口出现慢查询、连接池耗尽、超时或数据库过载时。

### 权限、备份与复制

- [数据库权限、租户隔离与审计](/database/advanced/access-control-tenant-isolation-auditing)
- [备份、时间点恢复与灾难演练](/database/advanced/backup-pitr-disaster-recovery)
- [读写分离、复制延迟与一致性](/database/advanced/read-write-splitting-replication-consistency)

适合：项目即将上线、引入多租户、只读副本或正式恢复要求时。

### 数据表达和查询能力

- [JSON 与半结构化数据建模](/database/advanced/json-semi-structured-data-modeling)
- [数据库全文检索、相关度与搜索架构](/database/advanced/full-text-search-ranking-architecture)
- [视图、物化视图、汇总表与派生读模型](/database/advanced/views-materialized-views-summary-read-models)

适合：出现动态属性、搜索接口或昂贵汇总查询时。普通业务不必预先引入。

### 数据传播与治理

- [CDC、Transactional Outbox 与可靠事件传播](/database/advanced/cdc-transactional-outbox-reliable-events)
- [数据质量、跨系统对账与安全修复](/database/advanced/data-quality-reconciliation-safe-repair)
- [大规模数据回填、批处理与断点续跑](/database/advanced/large-scale-backfills-batching-checkpoints)

适合：数据库变化需要可靠传播到消息、搜索、缓存或其他系统，或者已有大量存量数据需要修复时。

### Redis 按需进阶

- [Redis 与缓存专题分层导航](/database/redis/)
- [缓存穿透、击穿、雪崩与热点治理](/database/redis/advanced/cache-penetration-breakdown-avalanche)
- [TTL、内存淘汰、大 key 与热 key 治理](/database/redis/advanced/ttl-memory-eviction-big-hot-keys)
- [客户端连接、超时、重试与优雅停机](/database/redis/advanced/client-connections-timeouts-retries-shutdown)

适合：Redis 已进入真实请求链路，并出现热点、容量或客户端稳定性问题时。

## 第三层：架构与运维参考

[进入架构与运维参考目录](/database/reference/)

以下内容是参考手册。除非正在处理对应问题，否则只需知道它们存在：

### 数据规模和分布式架构

- [分区表、数据生命周期与归档](/database/reference/partitioning-data-lifecycle-archiving)
- [分库分表、路由键与全局一致性](/database/reference/sharding-routing-global-consistency)
- [数据库容量规划、SLO 与压测](/database/reference/capacity-planning-slo-load-testing)
- [数据库技术选型、架构评审与演进决策](/database/reference/technology-selection-architecture-review-evolution)

### 生产运维与升级

- [数据库事故响应、故障切换与复盘](/database/reference/incident-response-failover-postmortem)
- [数据库版本升级、兼容性与回退设计](/database/reference/version-upgrades-compatibility-rollback)

### 专门数据模型与数据库端能力

- [时间语义、历史版本与时态数据建模](/database/reference/time-semantics-history-temporal-modeling)
- [数据库函数、存储过程、触发器与任务调度](/database/reference/functions-procedures-triggers-scheduled-jobs)

### Redis 架构与运维参考

- [分布式锁、幂等、计数器与限流](/database/redis/reference/distributed-locks-idempotency-counters-rate-limiting)
- [List、Pub/Sub 与 Streams 消息模型](/database/redis/reference/lists-pubsub-streams-messaging)
- [RDB、AOF、复制、Sentinel 与故障转移](/database/redis/reference/persistence-replication-sentinel-failover)
- [Redis Cluster、分片、hash slot 与多 key 限制](/database/redis/reference/cluster-sharding-hash-slots-multi-key)
- [安全、ACL、TLS、监控与容量规划](/database/redis/reference/security-observability-capacity-planning)

## 推荐的学习节奏

```text
阶段 1～4   SQL 读写一个接口
    ↓
阶段 5～8   多表查询 + 索引 + 执行计划
    ↓
阶段 9～11 事务、并发和表结构
    ↓
阶段 12～14 接入真实后端项目并建立迁移、测试
    ↓
阶段 15    只为一个明确热点加入 Redis 缓存
    ↓
停止主线，继续做项目；遇到问题再进入第二、三层
```

## 阶段项目

按照[全栈数据库阶段项目：用户、角色与权限](/database/core/full-stack-capstone)分两次完成：当前阶段先完成纯 SQL 检查点；学完 Java 与 Spring Boot 数据访问后，再返回实现接口、Repository 和集成测试。不要为了结束数据库课程提前学习后端框架。

最终需要形成下面这条最小闭环：

- 设计用户、角色、权限和关联表，并建立候选键、外键和必要索引。
- 实现带筛选、稳定排序和 keyset/受限分页的用户列表。
- 在一个事务中创建用户并分配初始角色，失败时整体回滚。
- 使用真实数据库测试唯一约束、权限关系和并发重复创建。
- 查看列表接口执行计划，解释扫描、索引和排序。
- 只选择一个适合缓存的读取接口实现 Cache-Aside，并保留数据库回源。

完成上述项目后，不必继续学习参考专题；先把数据库知识用于其他全栈功能，效果比连续阅读更多高级页面更好。
