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
- [测试策略与可测试架构](/frontend/react/testing-strategy-and-testable-architecture)
- [Server Components、Server Functions 与现代全栈边界](/frontend/react/server-components-functions-and-fullstack-boundaries)
- [大型应用架构、渐进迁移与生产治理](/frontend/react/large-scale-architecture-migration-and-production-governance)

完成本模块后，你应该能设计、测试和渐进迁移具有清晰边界的 React 应用。

### 浏览器与网络

- [事件循环、渲染流水线与长任务诊断](/frontend/browser/event-loop-rendering-and-long-tasks)
- [从 URL 到响应：DNS、TLS、HTTP 缓存与 Fetch](/frontend/browser/url-dns-tls-http-cache-and-fetch)
- [DOM、事件传播、Shadow DOM 与可访问交互](/frontend/browser/dom-events-shadow-dom-and-accessible-interactions)
- [浏览器存储、IndexedDB 与离线一致性](/frontend/browser/browser-storage-indexeddb-cache-and-offline-consistency)
- [浏览器安全模型：XSS、CSRF、CSP 与跨源隔离](/frontend/browser/browser-security-xss-csrf-csp-and-cross-origin-isolation)

### 前端工程化

- [Vite 开发服务器、模块图、插件流水线与生产构建](/frontend/engineering/vite-dev-server-module-graph-plugins-and-production-build)
- [代码质量：ESLint、Prettier、TypeScript、Git Hooks 与 CI 门禁](/frontend/engineering/code-quality-eslint-prettier-typescript-git-hooks-and-ci-gates)
- [前端测试工程化：单元、组件、集成与端到端测试](/frontend/engineering/frontend-testing-unit-component-e2e-and-reliability)
- [前端性能工程：Core Web Vitals、RUM 与持续性能预算](/frontend/engineering/frontend-performance-core-web-vitals-rum-and-budgets)

### 前端架构

- [大型前端架构：模块边界、领域分层与微前端](/frontend/architecture/large-scale-frontend-modules-boundaries-and-micro-frontends)
- [前端可观测性与生产治理：从错误采集到灰度和事故响应](/frontend/architecture/frontend-observability-release-governance-and-incident-response)
- [前端设计系统与跨框架组件平台](/frontend/architecture/design-system-tokens-accessibility-and-cross-framework-components)
- [前端国际化与本地化工程](/frontend/architecture/frontend-internationalization-localization-and-rtl-engineering)
- [前端数据可视化与复杂交互架构](/frontend/architecture/frontend-data-visualization-rendering-interaction-and-accessibility)
- [前端实时同步与多人协作架构](/frontend/architecture/frontend-realtime-sync-and-collaboration-architecture)
- [前端 AI 应用的流式交互、任务状态与生成式 UI 架构](/frontend/architecture/frontend-ai-streaming-task-state-and-generative-ui-architecture)
- [前端语音、音频与实时多模态交互架构](/frontend/architecture/frontend-realtime-voice-audio-and-multimodal-interaction-architecture)
- [前端文件上传、媒体资产处理与大文件传输架构](/frontend/architecture/frontend-file-upload-media-assets-and-large-file-transfer-architecture)
- [PWA、Service Worker、后台同步与离线应用架构](/frontend/architecture/pwa-service-worker-background-sync-and-offline-application-architecture)
- [Web Push、通知权限与后台消息架构](/frontend/architecture/web-push-notification-permission-and-background-messaging-architecture)
- [WebView、Electron 与跨端前端架构](/frontend/architecture/webview-electron-and-cross-platform-frontend-architecture)
- [前端权限、设备能力与隐私工程架构](/frontend/architecture/frontend-permissions-device-capabilities-and-privacy-engineering)
- [Web Worker、SharedWorker、WebAssembly 与前端计算架构](/frontend/architecture/web-worker-sharedworker-webassembly-and-frontend-compute-architecture)
- [前端身份认证、会话、Token 与授权架构](/frontend/architecture/frontend-authentication-session-token-and-authorization-architecture)
- [前端支付、结算与高风险交易交互架构](/frontend/architecture/frontend-payment-checkout-and-high-risk-transaction-architecture)
- [前端多租户、权限系统与企业级管理后台架构](/frontend/architecture/frontend-multi-tenant-permission-and-enterprise-admin-architecture)
- [前端复杂表单、审批工作流与低代码配置架构](/frontend/architecture/frontend-complex-forms-approval-workflow-and-low-code-architecture)
