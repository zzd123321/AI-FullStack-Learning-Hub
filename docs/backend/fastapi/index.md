---
title: FastAPI
description: 从 ASGI、请求验证与应用生命周期走向数据访问、安全、AI 服务和生产架构
outline: deep
---

# FastAPI

FastAPI 专题建立在 Python 对象模型、异常、类型提示、测试与 asyncio 基础之上。目标不是记忆 decorator，而是理解 HTTP 请求如何经 ASGI server 进入应用，如何完成路由、解析、校验、依赖解析、业务调用、响应序列化和错误映射。

> 当前基准：FastAPI 0.139.x、Pydantic 2.13.x、Starlette 1.3.x、Uvicorn 0.51.x；Python 3.11+，官方语义讲解以 Python 3.14.x 为参照。

## 学习路线

```text
ASGI 与第一个 API
  → 参数绑定、Pydantic、依赖注入、配置和模块化路由
  → SQL 数据访问、事务和迁移
  → 认证、授权与 Web 安全
  → 测试、日志、指标和追踪
  → 后台任务、消息与实时通信
  → AI 推理服务、流式响应与容量治理
  → 部署和后端架构
```

## 课程目录

1. [ASGI、应用生命周期、路由、请求验证与第一个 API](/backend/fastapi/asgi-lifespan-routing-validation-and-first-api)
2. [参数绑定、Annotated、Pydantic、依赖注入、配置与模块化路由](/backend/fastapi/annotated-pydantic-dependencies-settings-and-modular-routing)
3. [SQLAlchemy 2、Session、事务、Repository 与 Alembic](/backend/fastapi/sqlalchemy-session-transactions-repository-and-alembic)
4. [SQLAlchemy relationship、加载策略、更新删除、并发控制与隔离级别](/backend/fastapi/sqlalchemy-relationships-loading-updates-concurrency-and-isolation)
5. [身份认证、密码存储、JWT、Session、授权与 Web 安全](/backend/fastapi/password-jwt-session-authorization-and-web-security)
6. [测试、结构化日志、Metrics、Tracing 与生产可观测性](/backend/fastapi/testing-structured-logging-metrics-tracing-and-observability)
7. [后台任务、消息队列、幂等、重试、Transactional Outbox 与 SSE](/backend/fastapi/background-tasks-queues-idempotency-retries-outbox-and-sse)
8. [AI 推理服务、流式响应、模型生命周期、容量、超时、取消与背压](/backend/fastapi/ai-inference-streaming-model-lifecycle-capacity-timeout-cancellation-and-backpressure)
9. [部署拓扑、容器、多 Worker、代理、迁移、健康检查与优雅停机](/backend/fastapi/deployment-topology-containers-workers-proxies-migrations-health-and-graceful-shutdown)

后续课程将在本目录继续追加。配套源码统一放在 `examples/python/fastapi-*`，课程页面使用 VitePress 源文件导入展示完整代码。

## 前置知识

- Python module/package、异常与 context manager。
- class、dataclass、Protocol 与领域边界。
- 类型提示、运行时验证与自动化测试的区别。
- coroutine、TaskGroup、timeout、cancellation 和 blocking I/O 边界。

## 学习约定

- 每课明确 FastAPI、Pydantic、Starlette、Uvicorn 和 Python 版本。
- 先解释请求执行过程，再介绍 decorator、模型和参数声明。
- 输入类型注解不冒充运行时校验，Pydantic model 也不冒充领域模型。
- HTTP status、header、body 和错误结构组成完整协议合同。
- 所有外部 I/O 设置容量、timeout、失败传播和生命周期边界。
- 示例必须运行成功路径和关键失败路径测试。
- 与 Vue/JavaScript 对照时明确浏览器、HTTP client、ASGI server 和应用职责。
- 课程不包含练习题。
