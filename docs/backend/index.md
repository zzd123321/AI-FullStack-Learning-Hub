---
title: 后端开发
description: 从 Java 与 Python 基础走向可靠的服务端应用
---

# 后端开发

后端路线分为 Java 主线和 Python 辅线。Java 用于系统学习企业级服务、并发、JVM 和 Spring 生态；Python 用于自动化、数据处理、FastAPI 和 AI 应用服务。

## 第一次学习时，不要把所有目录从头读到尾

这个专题内容很多，但你不需要先学完全部理论，才开始写后端。对后端初学者，更有效的路线是反复经历下面这个循环：

```text
先写出一个能运行的小程序
  → 看懂一次请求如何进入程序
  → 保存真实数据并处理错误
  → 加入登录、测试和运行监控
  → 遇到并发或性能问题时，再学习对应底层原理
```

课程中的内容按学习深度分成三类：

| 标记 | 现在需要做到什么 | 典型内容 |
| --- | --- | --- |
| **主线** | 能解释基本过程，并能在项目中使用 | Java 基础、Maven、Spring Boot API、Python 基础、FastAPI |
| **进阶** | 理解它解决的问题，暂时不要求记住细节 | 并发、事务传播、缓存、消息、服务治理 |
| **查阅** | 知道何时回来查，不需要第一次就掌握 | JMM 细则、JVM 诊断、灾难恢复、复杂分布式一致性 |

> 阅读时遇到陌生术语，不要停下来把整棵知识树一次挖完。先回答三个问题：它解决什么问题？程序运行时发生了什么？我现在的项目是否已经需要它？

## 推荐给后端小白的主线

### 第一阶段：尽快写出 Java HTTP API

先学习 Java 前 12 课中的语法、类、接口、异常、集合和泛型，再学习 Maven。然后直接进入 Spring Boot 的项目启动、Bean、MVC、配置和安全课程。

完成标志不是“记住全部注解”，而是你能说清楚：浏览器发出的请求经过哪些组件，业务代码在哪里执行，错误如何变成 HTTP 响应。

### 第二阶段：把 API 变成可维护的应用

继续学习测试、配置、日志、安全、缓存和异步任务。数据库基础与数据访问由独立数据库专题承接，本专题只解释框架如何参与连接、事务和对象映射。

完成标志是：应用出现错误时，你能从测试、日志和指标中找到发生问题的层，而不是只会重新启动。

### 第三阶段：用 Python 构建 AI 服务

学习 Python 的对象模型、函数、模块、异常、类型和异步 I/O，然后进入 FastAPI。不要在同一天来回切换 Java 和 Python；先完成一条最小主线，再做语言对照。

完成标志是：你能解释 Spring Boot 与 FastAPI 各自负责什么，以及为什么 AI 推理服务常由 Python 承担。

### 第四阶段：带着真实问题学习架构

架构专题不是入门前置知识。只有当一个可运行项目已经出现缓存、异步处理、跨服务调用、超时和容量问题时，再依次阅读对应课程。

完成标志是：你能从具体失败场景推导解决方案，而不是看到一个架构名词就把它加入系统。

## Java 主线

Java 语法与面向对象 → 集合与泛型 → 异常与 IO → 并发 → JVM → Maven → Spring Boot → 数据访问 → Spring Security → 微服务。

学习基准以 JDK 25 LTS 为主，并在必要处标注 JDK 17/21 的兼容差异。

### Java 基础

- [Java 开发环境、JDK/JRE/JVM 与第一个程序](/backend/java/development-environment-and-first-program)
- [Java 变量、基本类型、运算符与控制流程](/backend/java/variables-types-operators-and-control-flow)
- [Java 方法、参数传递、数组与可变参数](/backend/java/methods-parameter-passing-arrays-and-varargs)
- [Java 类、对象、构造方法与封装](/backend/java/classes-objects-constructors-and-encapsulation)
- [Java 继承、接口、多态与组合](/backend/java/inheritance-interfaces-polymorphism-and-composition)
- [Java 包、枚举、记录类与代码组织](/backend/java/packages-enums-records-and-code-organization)
- [Java 异常体系、错误传播与资源清理](/backend/java/exceptions-error-propagation-and-resource-cleanup)
- [Java IO、NIO.2、字符编码与文件操作](/backend/java/io-nio2-character-encoding-and-files)
- [Java 集合框架概览与 List](/backend/java/collections-framework-and-list)
- [Java Set、Map、相等性与哈希](/backend/java/set-map-equality-and-hashing)
- [Java 泛型深入、通配符、类型擦除与 API 设计](/backend/java/generics-wildcards-type-erasure-and-api-design)
- [Java Lambda、函数式接口、Optional 与 Stream](/backend/java/lambda-functional-interfaces-optional-and-streams)
- [Java 并发基础、线程生命周期、共享状态与内存可见性](/backend/java/concurrency-threads-shared-state-and-memory-visibility)
- [Java ExecutorService、Future、原子类与并发集合](/backend/java/executor-future-atomic-and-concurrent-collections)
- [Java CompletableFuture、异步编排、超时与异常恢复](/backend/java/completable-future-async-composition-timeout-and-recovery)
- [Java Lock、Condition、Semaphore 与高级同步器](/backend/java/locks-conditions-semaphores-and-synchronizers)
- [Java 虚拟线程、结构化并发与 ScopedValue](/backend/java/virtual-threads-structured-concurrency-and-scoped-values)
- [Java 内存模型、volatile、final 与 happens-before](/backend/java/memory-model-volatile-final-and-happens-before)
- [Java 类加载、字节码、JIT、运行时内存与垃圾回收](/backend/java/class-loading-bytecode-jit-runtime-memory-and-gc)
- [Java GC 日志、JFR、线程转储、堆转储与故障排查](/backend/java/gc-logs-jfr-thread-dumps-heap-dumps-and-troubleshooting)
- [Maven 项目模型、依赖管理、生命周期与插件](/backend/java/maven-project-model-dependencies-lifecycle-and-plugins)

Java 基础与工程课程从工具链和程序执行过程开始，再建立静态类型、对象建模、多态、异常处理、文件 IO、集合、泛型、现代并发、JVM 与 Maven 基础。完成后，你能理解代码从编译、运行、诊断到多模块构建的主要过程，并为 Spring Boot 工程建立可靠基础。

第一次学习时，前 12 课与 Maven 属于主线；并发与 JVM 课程属于进阶或查阅内容，可以在开始 Spring Boot 后按需返回。

## Spring Boot 专题

- [Spring Boot 专题首页与完整学习路线](/backend/spring-boot/)

Spring Boot 独立专题覆盖项目启动、IoC、Bean 生命周期、Spring MVC、数据访问、安全、测试、可观测性和生产架构。现有课程已迁入专题目录，旧路径保留兼容引导页。

## Python 辅线

Python 语法 → 类型标注 → 虚拟环境与包管理 → 生成器与装饰器 → 异步编程 → FastAPI → 数据处理 → AI 服务。

## FastAPI 专题

- [FastAPI 专题首页与完整学习路线](/backend/fastapi/)

FastAPI 独立专题覆盖 ASGI、Pydantic、依赖注入、数据访问、安全、测试、可观测性、AI 推理服务与生产架构。

## 后端架构专题

- [后端架构专题首页与完整学习路线](/backend/architecture/)

本专题从 HTTP API 合同开始，继续学习缓存、消息、分布式一致性、弹性、微服务、容量规划和灾难恢复，并对照 Java/Spring Boot 与 Python/FastAPI 的实现边界。

## 阶段项目

后续阶段项目会围绕一个 AI 知识库逐步演进：Spring Boot 管理用户、权限、文档和会话，FastAPI 负责文档处理与 AI 推理。项目先采用模块化单体和一个独立 AI 服务，只有出现真实拆分理由时才引入更多服务。
