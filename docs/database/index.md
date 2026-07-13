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

先把接口中的“用户列表”还原成数据库中的表和查询，再建立连接、类型与约束边界，最后实现可预测的筛选、排序和分页。

## 阶段项目

为用户与权限系统设计数据模型，实现分页查询、事务操作、缓存和慢查询分析。
