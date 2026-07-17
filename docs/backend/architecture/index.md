---
title: 后端架构
description: 从 HTTP API 合同走向缓存、消息、分布式一致性、弹性、微服务与容量规划
outline: deep
---

# 后端架构

本专题建立在 Java/Spring Boot 与 Python/FastAPI 两条实现主线之上，关注跨语言长期稳定的系统边界。目标不是背诵架构名词，而是理解请求、状态、时间、失败和所有权如何在单进程、数据库、缓存、消息系统与多服务之间传播。

> 这不是后端入门的前置课程。请先做出一个包含 HTTP API、身份认证、持久化和测试的应用，再带着项目里已经出现的问题回来学习。

## 架构不是把组件越加越多

每一课都应从一个已经发生的问题出发：

```text
先描述当前系统和失败现象
  → 找到失败发生在哪条调用链
  → 明确不能被破坏的业务约束
  → 选择最简单的解决机制
  → 接受它引入的新成本和新失败方式
```

例如，“消息队列可以削峰”不是采用消息队列的充分理由。只有当工作允许延后完成、调用双方需要解耦，而且系统能处理重复、乱序和最终失败时，消息才可能是正确工具。

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
2. [HTTP 缓存、CDN、重新验证、缓存键与失效](/backend/architecture/http-cache-cdn-revalidation-keys-and-invalidation)
3. [应用数据缓存与 Redis：cache-aside、TTL、并发回填与一致性](/backend/architecture/application-cache-redis-cache-aside-ttl-stampede-and-consistency)
4. [消息与事件驱动：broker、确认、重投、幂等消费与 Outbox](/backend/architecture/messaging-event-driven-broker-ack-retry-idempotency-and-outbox)
5. [分布式事务、Saga、补偿与一致性边界](/backend/architecture/distributed-transactions-saga-compensation-and-consistency)
6. [弹性治理：deadline、重试、熔断、隔离、限流与过载保护](/backend/architecture/resilience-deadline-retry-circuit-breaker-bulkhead-rate-limit-and-overload)
7. [API Gateway、服务发现、健康检查与配置治理](/backend/architecture/api-gateway-service-discovery-health-and-configuration)
8. [微服务边界、模块化单体与渐进式演进](/backend/architecture/microservice-boundaries-modular-monolith-and-evolution)
9. [容量规划、SLO、可用性与灾难恢复](/backend/architecture/capacity-slo-availability-and-disaster-recovery)

第一次阅读建议只学第 1 课，然后回到项目开发。出现静态资源或读取压力时读第 2、3 课；需要异步处理时读第 4 课；真正出现跨服务写操作后再读第 5 课。第 6～9 课属于生产运行与架构演进，不需要为了完成入门而一次学完。

课程不把某个框架的默认行为冒充 HTTP 标准；关键语义优先依据 IETF RFC、IANA 和 OpenAPI 官方规范，并用 Spring Boot/FastAPI 的实现经验对照。

## 学习约定

- 先解释问题与失败窗口，再介绍 pattern 和工具。
- 明确逻辑合同与物理实现边界。
- 区分客户端、代理、应用、数据库、broker 与编排平台的责任。
- 一致性、可用性、安全、性能结论写出适用条件。
- 示例包含成功路径和关键失败路径，不包含练习题。
