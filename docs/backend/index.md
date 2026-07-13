---
title: 后端开发
description: 从 Java 与 Python 基础走向可靠的服务端应用
---

# 后端开发

后端路线分为 Java 主线和 Python 辅线。Java 用于系统学习企业级服务、并发、JVM 和 Spring 生态；Python 用于自动化、数据处理、FastAPI 和 AI 应用服务。

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

前十六课从工具链和程序执行过程开始，再建立静态类型、对象建模、多态、异常处理、文件 IO、集合、泛型、函数式处理与并发基础。完成后，你能安全处理资源与数据流水线，并通过 Executor、Future、CompletableFuture、显式锁与同步器管理任务执行、共享状态和异步编排。

## Python 辅线

Python 语法 → 类型标注 → 虚拟环境与包管理 → 生成器与装饰器 → 异步编程 → FastAPI → 数据处理 → AI 服务。

## 阶段项目

先构建用户与权限 API，再分别使用 Java 和 Python 实现小型服务，比较两种语言的类型系统、并发模型和工程组织方式。
