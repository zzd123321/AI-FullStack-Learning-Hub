---
title: 数据库全栈必修
description: 关系数据库、SQL、索引、事务、设计、数据访问与测试主线
prev:
  text: 数据库分层导航
  link: /database/
next:
  text: 关系模型与第一个 SQL 查询
  link: /database/core/relational-model-and-first-query
---

# 数据库全栈必修

这一层是数据库首次学习的完整范围。按顺序学习，不需要同时进入 `advanced` 或 `reference` 目录。

## SQL 与关系模型

1. [关系模型与第一个 SQL 查询](/database/core/relational-model-and-first-query)
2. [连接并认识 MySQL 与 PostgreSQL](/database/core/mysql-postgresql-basics)
3. [数据类型、NULL、默认值与约束](/database/core/data-types-defaults-and-constraints)
4. [筛选、排序与分页](/database/core/select-filter-sort-pagination)
5. [安全写入数据](/database/core/safe-insert-update-delete)
6. [多表关系与 JOIN](/database/core/relationships-and-joins)
7. [聚合查询](/database/core/aggregates-group-by-having)
8. [子查询与 CTE](/database/core/subqueries-and-cte)

## 性能与并发基础

9. [索引如何加速查询](/database/core/indexes-and-query-shapes)
10. [读懂执行计划](/database/core/reading-query-plans)
11. [事务与 ACID](/database/core/transactions-and-acid)
12. [并发异常与事务隔离级别](/database/core/transaction-isolation-levels)
13. [锁、MVCC 与并发等待](/database/core/locks-and-mvcc)

## 后端工程闭环

14. [从业务需求到表结构](/database/core/database-design-and-normalization)
15. [ORM、驱动与 Repository 边界](/database/core/orm-drivers-repository-boundaries)
16. [数据库变更与安全发布](/database/core/schema-migrations-online-ddl)
17. [数据库测试与 CI 门禁](/database/core/testing-test-data-ci-release-gates)
18. [Redis 全栈必修](/database/redis/core/)

## 收尾项目

[用户、角色与权限阶段项目](/database/core/full-stack-capstone)分为纯 SQL 和 Spring 数据访问两个检查点。当前只完成纯 SQL 检查点，即可结束数据库首次学习。
