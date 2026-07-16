---
title: 后端架构
description: 从 HTTP API 合同走向缓存、消息、分布式一致性、弹性、微服务与容量规划
outline: deep
---

# 后端架构

本专题建立在 Java/Spring Boot 与 Python/FastAPI 两条实现主线之上，关注跨语言长期稳定的系统边界。目标不是背诵架构名词，而是理解请求、状态、时间、失败和所有权如何在单进程、数据库、缓存、消息系统与多服务之间传播。

## 学习路线

```text
HTTP API 合同
  → 缓存与数据访问路径
  → 消息与事件驱动
  → 分布式事务、Saga 与一致性
  → 超时、重试、熔断、隔离与限流
  → 网关、服务发现与配置
  → 微服务边界与演进
  → 容量规划、可用性与灾难恢复
```

## 课程目录

1. [HTTP API 资源建模、方法语义、错误、分页、并发控制与版本演进](/backend/architecture/http-api-resource-modeling-semantics-errors-pagination-concurrency-and-versioning)

后续课程将在本目录继续追加。课程不把某个框架的默认行为冒充 HTTP 标准；关键语义优先依据 IETF RFC、IANA 和 OpenAPI 官方规范，并用 Spring Boot/FastAPI 的实现经验对照。

## 学习约定

- 先解释问题与失败窗口，再介绍 pattern 和工具。
- 明确逻辑合同与物理实现边界。
- 区分客户端、代理、应用、数据库、broker 与编排平台的责任。
- 一致性、可用性、安全、性能结论写出适用条件。
- 示例包含成功路径和关键失败路径，不包含练习题。
