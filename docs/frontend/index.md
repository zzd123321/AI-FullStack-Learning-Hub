---
title: 前端开发
description: 从 Vue 2 与 JavaScript 基础走向现代前端工程
---

# 前端开发

这条路线不会重复铺陈已经熟悉的 HTML、CSS 和 JavaScript 入门内容，而是优先补齐现代前端所需的类型系统、Vue 3、React、浏览器原理、测试和架构能力。

## 学习顺序

1. **TypeScript**：类型系统、泛型、工程配置和类型设计。
2. **Vue 3**：Composition API、响应式原理、组件与状态管理。
3. **React**：渲染模型、Hooks、状态管理和应用架构。
4. **浏览器与网络**：事件循环、渲染流程、HTTP、缓存与安全。
5. **工程化**：Vite、代码质量、测试、构建与发布。
6. **性能与架构**：性能指标、模块设计、微前端和可维护性。

## 当前模块

### TypeScript

- [从 JavaScript 到 TypeScript](/frontend/typescript/from-javascript-to-typescript)
- [对象类型与函数类型](/frontend/typescript/object-and-function-types)
- [联合类型、交叉类型与类型收窄](/frontend/typescript/unions-intersections-and-narrowing)
- [泛型基础与约束](/frontend/typescript/generics-and-constraints)
- [`keyof`、`typeof` 与索引访问类型](/frontend/typescript/keyof-typeof-and-indexed-access)
- [条件类型与 `infer`](/frontend/typescript/conditional-types-and-infer)
- [映射类型与常用工具类型](/frontend/typescript/mapped-types-and-utility-types)
- [模板字面量类型与类型安全契约](/frontend/typescript/template-literal-types-and-type-safe-contracts)
- [工程配置与模块边界](/frontend/typescript/project-configuration-and-module-boundaries)

完成本模块后，你应该能在严格模式下为 Vue 3 和接口数据建立可靠的类型边界。

### Vue 3

- [Composition API 与组件类型设计](/frontend/vue3/composition-api-and-component-typing)
- [响应式原理与副作用管理](/frontend/vue3/reactivity-and-effect-management)
- [组件通信、依赖注入与可复用组件](/frontend/vue3/component-communication-and-reusable-components)
- [Pinia 状态管理与服务层设计](/frontend/vue3/pinia-state-management-and-service-layer)
- [Vue Router 4 与前端路由架构](/frontend/vue3/vue-router-and-routing-architecture)
- [表单架构与复杂交互状态](/frontend/vue3/form-architecture-and-complex-interaction-state)
- [渲染机制、组件更新与性能优化](/frontend/vue3/rendering-mechanism-component-updates-and-performance)
- [测试策略与可测试架构](/frontend/vue3/testing-strategy-and-testable-architecture)
- [SSR、Hydration 与同构应用边界](/frontend/vue3/ssr-hydration-and-universal-application-boundaries)
- [Vue 2 到 Vue 3 的渐进式迁移与大型应用架构](/frontend/vue3/vue2-to-vue3-progressive-migration-and-architecture)

完成本模块后，你应该能设计、测试和迁移具有明确状态边界的 Vue 3 应用。

### React

- [核心心智模型与 TypeScript 组件设计](/frontend/react/core-mental-model-and-typescript-components)
- [Effect、Ref、异步竞态与自定义 Hook](/frontend/react/effects-refs-async-races-and-custom-hooks)
- [Reducer、Context 与跨组件状态架构](/frontend/react/reducer-context-and-cross-component-state-architecture)
- [React Router 数据路由与应用边界](/frontend/react/react-router-data-routing-and-application-boundaries)
- [表单架构、Actions 与复杂交互状态](/frontend/react/form-architecture-actions-and-complex-interactions)
- [渲染性能、并发特性与 Suspense](/frontend/react/rendering-performance-concurrency-and-suspense)
