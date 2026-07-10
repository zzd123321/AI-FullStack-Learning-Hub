---
title: AI 全栈学习路线
description: 面向有前端经验开发者的全栈与 AI 分阶段学习计划
---

# AI 全栈学习路线

这条路线面向已有 JavaScript、Vue 2 和常见前后端联调经验的开发者。前端基础会快速通过，Java、Python、数据库和 AI 则从核心概念开始。

> [!TIP]
> 推荐每周投入 6～8 小时。时间不是硬性要求，是否完成阶段项目和验收任务才是进入下一阶段的依据。

## 路线总览

| 阶段 | 学习重点 | 阶段产出 | 验收标准 |
| --- | --- | --- | --- |
| 0. 站点 MVP | VitePress、Markdown、内容规范 | 可搜索的学习站点 | 可以本地构建并阅读首篇文档 |
| 1. 前端现代化 | TypeScript、Vue 3、浏览器与工程化 | Vue 3 小型应用 | 能独立设计组件、状态和类型 |
| 2. Java 后端 | Java、JVM、Maven、Spring Boot | 用户与权限 API | 能实现、测试并解释 REST API |
| 3. 数据库与全栈 | SQL、事务、索引、Redis、联调 | 前后端分离管理系统 | 能设计数据模型并定位慢查询 |
| 4. Python 与 AI 基础 | Python、NumPy、机器学习、PyTorch | 数据处理与模型实验 | 能解释训练、推理和评估过程 |
| 5. 大模型应用 | 模型 API、Prompt、RAG、Agent、MCP | 文档问答与任务助手 | 能评估效果、成本与安全风险 |
| 6. 工程与架构 | Docker、CI/CD、监控、系统设计 | 可部署的综合项目 | 能说明关键架构权衡 |
| 7. 作品集与面试 | 知识复盘、项目表达、系统设计 | 作品集与题库 | 能完整讲清项目价值与实现 |

## 阶段 1：前端现代化

学习顺序：

1. TypeScript 类型系统与工程配置。
2. Vue 3 Composition API、响应式系统和组件设计。
3. 浏览器渲染、事件循环、HTTP 和安全基础。
4. Vite、测试、性能优化和前端架构。

阶段项目：使用 Vue 3 和 TypeScript 完成一个带搜索、筛选和持久化的学习任务面板。

完成标准：

- 能在 `strict` 模式下设计组件 Props、事件和接口数据类型。
- 能解释 Vue 3 响应式数据的更新过程。
- 能定位常见请求、渲染和性能问题。
- 项目包含单元测试、错误状态和基本可访问性支持。

## 阶段 2：Java 后端

学习顺序：Java 语法与面向对象 → 集合与泛型 → 异常与 IO → 并发 → JVM → Maven → Spring Boot → 数据访问 → 安全。

阶段项目：用户、角色和权限管理 API。

完成标准：能够设计分层结构、处理异常、编写测试，并说明一次 HTTP 请求从控制器到数据库的完整过程。

## 阶段 3：数据库与全栈

学习顺序：SQL → MySQL/PostgreSQL → 索引 → 事务与锁 → MVCC → Redis → 数据库设计 → 性能优化。

阶段项目：将管理后台与 Java API、关系型数据库连接，加入登录、分页、缓存和审计日志。

## 阶段 4：Python 与 AI 基础

学习顺序：Python 语法与类型标注 → 虚拟环境和包管理 → 异步编程 → FastAPI → NumPy/Pandas → 机器学习 → PyTorch → Transformer。

阶段项目：数据处理服务与一个可解释的小型模型实验。

## 阶段 5：大模型应用开发

学习顺序：模型 API → Prompt → Structured Output → 工具调用 → Embedding → 向量检索 → RAG → 评估 → Agent → MCP → 安全与部署。

阶段项目：带来源引用、评估集、流式输出和工具调用的学习助手。

## 当前任务

- [x] 创建站点 MVP
- [x] 学习“从 JavaScript 到 TypeScript”
- [x] 学习 TypeScript 对象类型与函数类型
- [x] 学习 TypeScript 联合类型、交叉类型与类型收窄
- [x] 学习 TypeScript 泛型基础与约束
- [ ] 学习 TypeScript keyof、typeof 与索引访问类型
- [ ] 进入 Vue 3 Composition API

当前课程：[TypeScript keyof、typeof 与索引访问类型](/frontend/typescript/keyof-typeof-and-indexed-access)
