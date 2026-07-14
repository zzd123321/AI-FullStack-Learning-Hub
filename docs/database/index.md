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

## 阶段项目

为用户与权限系统设计数据模型，实现分页查询、事务操作、缓存和慢查询分析。
