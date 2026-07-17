---
title: Spring Boot
description: 从项目启动、IoC 与 Spring MVC 走向数据访问、安全、测试、可观测性和生产架构
outline: deep
---

# Spring Boot

Spring Boot 专题建立在 Java、JVM 与 Maven 基础之上，目标不是记忆注解，而是理解一个后端服务从依赖模型、容器启动、HTTP 请求处理到数据、安全和生产运行的完整过程。

> 当前基准：Spring Boot 4.1.0、Spring Framework 7.0.8、Maven 3.9.16；Java 17 编译目标，JDK 25 可作为构建和运行时。

## 学习路线

```text
项目结构与自动配置
  → IoC、Bean 生命周期与代理
  → Spring MVC、校验与测试
  → 配置、日志与 Actuator
  → JDBC、JPA、事务与数据库迁移
  → 缓存、异步任务与消息
  → Spring Security
  → API 设计、测试体系与可观测性
  → 部署和后端架构
```

## 小白应该怎样学习本专题

Spring Boot 最容易学错的方式，是先背 `@Component`、`@Service`、`@Autowired` 等注解。注解只是配置入口，真正需要建立的是一条连续的运行过程：

```text
启动 Java 程序
  → Spring 创建并连接对象
  → Web Server 开始监听端口
  → 请求匹配到 Controller
  → Controller 调用业务对象
  → 结果或错误被转换成 HTTP 响应
```

第一次学习建议分三轮：

1. **先跑通：**学习第 1～4 课，只要求看懂启动、依赖注入和一次请求。
2. **再做完整：**学习数据访问、安全与测试，让 API 具备真实应用的基本边界。
3. **最后做可靠：**学习缓存、异步、消息、可观测性和生产运行。

每当遇到新注解，先问“如果没有它，我原本需要手工完成什么”，再观察 Spring 在启动期或请求期替你做了什么。

## 课程目录

1. [项目结构、启动流程、自动配置、配置系统与第一个 HTTP API](/backend/spring-boot/project-structure-auto-configuration-config-and-first-api)
2. [Bean 生命周期、Java 配置、作用域、代理与循环依赖](/backend/spring-boot/bean-lifecycle-java-config-scopes-proxies-and-circular-dependencies)
3. [MVC 参数绑定、输入校验、统一错误响应与测试](/backend/spring-boot/mvc-parameter-binding-validation-error-response-and-testing)
4. [配置分层、Profiles、日志、Actuator 与可观测性基础](/backend/spring-boot/config-profiles-logging-actuator-and-observability)
5. [JDBC、连接池、事务边界与 Flyway 数据库迁移](/backend/spring-boot/jdbc-connection-pool-transactions-and-flyway)
6. [JPA、实体生命周期、关联映射、查询与 N+1](/backend/spring-boot/jpa-entity-lifecycle-associations-queries-and-n-plus-one)
7. [JPA 分页、Specification、批量写入与 Testcontainers](/backend/spring-boot/jpa-pagination-specification-batch-and-testcontainers)
8. [缓存抽象、Caffeine、Redis 与缓存一致性](/backend/spring-boot/cache-abstraction-caffeine-redis-and-consistency)
9. [异步任务、线程池、定时调度、上下文传播与优雅停机](/backend/spring-boot/async-execution-scheduling-context-and-graceful-shutdown)
10. [消息驱动、RabbitMQ、Kafka、可靠投递与 Transactional Outbox](/backend/spring-boot/messaging-rabbitmq-kafka-reliability-and-outbox)
11. [Spring Security：认证、授权、过滤器链、密码、Session、JWT、CSRF 与 CORS](/backend/spring-boot/security-authentication-authorization-session-jwt-and-csrf)
12. [测试体系：JUnit、Mockito、MVC 切片与完整应用集成测试](/backend/spring-boot/testing-strategy-junit-mockito-slices-and-integration-tests)

配套源码统一放在 `examples/java/spring-boot-*`，课程页面使用 VitePress 源文件导入展示完整代码。源码注释重点解释对象由谁创建、代码在哪个线程和生命周期阶段执行，以及失败如何向外传播。

## 前置知识

开始本专题前，建议已完成：

- Java 语法、面向对象、异常、集合与泛型。
- 并发基础和 Java 内存模型。
- JVM 类加载、运行时内存与故障诊断。
- Maven POM、依赖管理、生命周期和插件。

若暂未掌握全部 JVM 诊断工具，也可以先进入 Spring Boot；遇到启动、线程或内存问题时再回到对应 Java 课程复习。

## 学习约定

- 每课明确 Spring Boot、Spring Framework、Java 和 Maven 版本边界。
- 先解释请求和容器执行过程，再给出注解与配置。
- 示例必须能编译，并按课程风险验证成功和失败路径。
- HTTP 错误使用准确状态码和稳定错误结构。
- 配置与秘密分离，避免把本机偶然环境当成工程契约。
- 与 JavaScript/Node 对照时说明相似点，也明确线程、类型与生命周期差异。
- 课程不包含练习题。
