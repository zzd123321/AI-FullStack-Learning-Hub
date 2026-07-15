---
title: 数据库
description: 从 SQL 基础走向事务、索引、缓存和数据架构
---

# 数据库

数据库学习不会只停留在 SQL 语法，而是围绕“数据如何被正确保存、快速查询并安全更新”展开。

## 学习顺序

1. 关系模型与 SQL。
2. MySQL 和 PostgreSQL 的基础使用。
3. 索引结构与查询计划。
4. 事务、隔离级别、锁和 MVCC。
5. 数据库设计。
6. Redis 与缓存一致性。
7. 性能优化与分库分表。

## 当前课程

### 关系模型与 SQL

- [关系型数据库、表、行、列、主键与第一个 SQL 查询](/database/relational-model-and-first-query)
- [连接并认识 MySQL 与 PostgreSQL](/database/mysql-postgresql-basics)
- [数据类型、NULL、默认值与约束](/database/data-types-defaults-and-constraints)
- [从列表接口到可靠 SELECT：筛选、排序与分页](/database/select-filter-sort-pagination)
- [多表关系与 JOIN](/database/relationships-and-joins)
- [聚合查询：COUNT、SUM、GROUP BY 与 HAVING](/database/aggregates-group-by-having)
- [子查询与 CTE：拆解复杂查询](/database/subqueries-and-cte)
- [安全写入数据：INSERT、UPDATE、DELETE 与幂等边界](/database/safe-insert-update-delete)

先把接口中的“用户列表”还原成数据库中的表和查询，再建立连接、类型与约束边界，实现可靠的查询与复杂查询拆解，最后建立安全、可并发的写入习惯。

### 索引与执行计划

- [索引如何加速查询：B-Tree、选择性与联合索引](/database/indexes-and-query-shapes)
- [读懂执行计划：扫描、连接、排序与实际执行](/database/reading-query-plans)

从真实接口的筛选与排序形状出发设计索引，再通过执行计划验证数据库是否采用了预期访问路径。

### 事务、锁与 MVCC

- [事务与 ACID：从转账接口到原子提交](/database/transactions-and-acid)
- [并发异常与事务隔离级别](/database/transaction-isolation-levels)
- [锁、MVCC 与并发等待](/database/locks-and-mvcc)

从多步写入的原子边界开始，再逐步理解并发事务之间的可见性、锁等待和多版本并发控制。

### 数据库设计

- [从业务需求到表结构：实体、关系、范式与约束](/database/database-design-and-normalization)

从接口字段和业务不变量识别实体、关系与约束，再用范式控制冗余，并为查询、演进和数据生命周期保留清晰边界。

### Redis 与缓存

- [Redis 与缓存专题](/database/redis/)

先把 Redis 看作提供多种数据结构和原子命令的内存数据服务，建立键、过期、内存、持久化与安全边界，再进入缓存一致性设计。

### 性能优化与数据架构

- [数据库性能诊断：从慢接口到根因](/database/database-performance-diagnosis)
- [SQL 与索引优化实战](/database/sql-and-index-optimization)
- [数据库连接池、超时与过载保护](/database/connection-pools-timeouts-overload)
- [读写分离、复制延迟与一致性](/database/read-write-splitting-replication-consistency)
- [分区表、数据生命周期与归档](/database/partitioning-data-lifecycle-archiving)
- [分库分表、路由键与全局一致性](/database/sharding-routing-global-consistency)
- [备份、时间点恢复与灾难演练](/database/backup-pitr-disaster-recovery)
- [数据库变更、在线 DDL 与安全发布](/database/schema-migrations-online-ddl)
- [数据库权限、租户隔离与审计](/database/access-control-tenant-isolation-auditing)
- [数据库容量规划、SLO 与压测](/database/capacity-planning-slo-load-testing)
- [数据库事故响应、故障切换与复盘](/database/incident-response-failover-postmortem)

从端到端接口延迟出发，使用工作负载聚合、执行计划、等待事件和锁证据定位瓶颈，再逐步进入 SQL、索引、连接、容量、分区、读写分离与分库分表。

## 阶段项目

为用户与权限系统设计数据模型，实现分页查询、事务操作、缓存和慢查询分析。
