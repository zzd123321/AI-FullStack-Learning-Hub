---
title: React 大型应用架构、渐进迁移与生产治理
description: 从依赖方向、状态所有权和装配根出发，系统设计 Vue 2 与 React 共存、微前端契约、可观测性、灰度发布与回滚
---

# React 大型应用架构、渐进迁移与生产治理

> 本节不是“推荐一种万能目录结构”。大型前端真正需要稳定的是依赖方向、状态与路由所有权、跨边界契约以及可回滚的交付过程。目录只是这些决策的投影。

## 1. 学习目标

完成本节后，你应该能够：

- 用业务能力而非技术类型划分模块，并让领域层不依赖 React。
- 把 Composition Root、运行时配置、鉴权、数据访问和可观测性放到正确边界。
- 区分组件状态、特性状态、服务端状态、URL 状态和跨应用状态的所有权。
- 用 `useSyncExternalStore` 安全连接 React 外部 Store，并理解 SSR Snapshot 约束。
- 设计 Vue 2 宿主逐页、逐路由或逐组件迁移到 React 的方案。
- 在 Imperative Mount API、Custom Element、iframe 和 Module Federation 之间做取舍。
- 为 DOM Event、Remote Manifest、Host API 和共享依赖建立可演进契约。
- 处理跨应用路由、会话、样式、错误隔离和降级。
- 用真实用户监控、发布标识、灰度指标和 Kill Switch 管理生产风险。
- 判断什么时候不应该上微前端，以及迁移何时算真正完成。

## 2. 大型前端的复杂度来自哪里

代码行数通常不是首要问题。风险更多来自四种耦合：

1. **变更耦合**：改课程详情页，却必须同时修改全局 Store、请求库和三个壳应用。
2. **运行时耦合**：一个 Remote 加载失败、路由抢占或 React 单例冲突拖垮整页。
3. **数据耦合**：多个模块都缓存“当前用户”，但刷新和失效语义不同。
4. **组织耦合**：团队能独立发布，却没有契约兼容期、值班和回滚责任。

架构的目标不是消灭耦合，而是把必要耦合变成**方向明确、契约显式、故障可隔离、演进可验证**的依赖。

```text
浏览器 / 框架 / HTTP / 遥测 SDK
              │ 实现
              ▼
         Infrastructure
              │ 注入
              ▼
Feature UI ── Application Ports ── Domain Types & Rules
     │
     └── 只能通过公开契约访问其他 Feature
```

领域类型和规则处在最内层。React 组件可以依赖它们；领域代码不应该导入 React、Router、Axios 或遥测 SDK。这样业务规则才能在迁移框架、SSR、Worker 和测试中复用。

## 3. 先定义系统边界，再讨论目录

一个适合长期演进的 Feature 通常包含：

```text
features/lessons/
├─ domain/          实体、值对象、纯规则
├─ application/     用例与端口接口
├─ infrastructure/  HTTP、缓存、遥测适配器
├─ ui/              React 组件与 Hook
└─ public.ts         唯一公开入口
```

这不是要求每个小功能都建五层目录。规则是：只有真实存在的变化轴才值得成为边界。简单展示组件可以只有一个文件；核心业务不应把接口响应、React State 和领域模型混成同一对象。

本节示例的共享类型与端口如下：

<<< ../../../examples/frontend/react-enterprise-architecture/types.ts

`LessonService` 和 `Telemetry` 是应用层需要的能力，不暴露 `fetch`、OpenTelemetry SDK 或厂商类型。UI 依赖端口，浏览器基础设施实现端口，所以替换后端、测试替身或遥测供应商不需要改业务组件。

## 4. Composition Root：只在入口组装具体实现

依赖注入的价值不是为了使用容器，而是把“创建什么”和“如何使用”分开。具体对象应在 Bootstrap/Composition Root 中集中构造：

<<< ../../../examples/frontend/react-enterprise-architecture/bootstrap.tsx

这段入口完成四件事：

- 读取并验证部署时配置。
- 创建 HTTP、Telemetry 和 Store 适配器。
- 构造稳定的 Dependencies Object。
- 把应用挂到唯一 Root。

不要在组件 Render 中 `new ApiClient()`，也不要让每个 Feature 自己读取 `window.__CONFIG__`。前者破坏引用稳定性和测试，后者让配置校验、默认值与安全策略散落全站。

## 5. 运行时配置不是环境变量的裸奔

Vite 的构建期变量会被写进客户端 Bundle，无法在构建后按环境改变，而且任何发送到浏览器的值都不是秘密。多环境部署常用 HTML 注入或独立 JSON 提供 Runtime Config，但必须把它当不可信输入验证：

<<< ../../../examples/frontend/react-enterprise-architecture/runtime-config.ts

生产约束包括：

- 配置只含公开值，绝不放数据库密码、签名密钥和长期 Token。
- API/Remote Origin 使用 Allowlist，防止配置被篡改后把凭据请求导向恶意站点。
- 配置带 `release` 和 `environment`，进入日志与遥测上下文。
- 配置不可变；更新配置通常通过重新加载新部署，而不是运行时到处 Mutate。
- 配置加载失败应显示安全的启动错误，不要悄悄使用可能指向错误环境的默认值。

## 6. 状态所有权矩阵

在引入 Store 之前先问：“谁拥有它，谁能修改它，何时失效？”

| 状态 | 推荐所有者 | 示例 | 常见错误 |
| --- | --- | --- | --- |
| 瞬时 UI 状态 | 最近组件 | Popover 开关、输入草稿 | 全放全局 Store |
| Feature 工作流 | Feature Reducer/Store | 多步编辑、选择集 | 多组件各存一份 |
| 服务端状态 | Query Cache/路由数据层 | 课程列表、用户资料 | 复制进全局 Store 后手动同步 |
| 导航状态 | URL/Router | 筛选、分页、选中资源 ID | 只存内存导致刷新丢失 |
| 会话事实 | 服务端 + Session Adapter | 登录态、权限版本 | 多应用传播 Access Token |
| 跨应用瞬时消息 | 版本化事件 | “课程已选择”通知 | 共享可变巨型 Store |

状态应有一个权威来源。Derived State 用 Selector/计算产生，不要额外保存。服务端状态的 Freshness、Retry 和 Invalidation 由数据层管理；本地 Store 只保存真正属于客户端工作流的状态。

## 7. React 如何订阅外部 Store

迁移期可能必须连接遗留 Store、浏览器 API 或框架无关 Store。React 提供 `useSyncExternalStore`，要求 Store 返回**缓存且不可变的 Snapshot**：

<<< ../../../examples/frontend/react-enterprise-architecture/selection-store.ts

<<< ../../../examples/frontend/react-enterprise-architecture/useLessonSelection.tsx

关键约束：

- `getSnapshot()` 在数据未变化时必须返回同一个引用；每次返回新对象会造成循环更新。
- 更新时先替换不可变 Snapshot，再同步通知订阅者。
- `subscribe` 返回清理函数，且函数引用应稳定。
- SSR 的 `getServerSnapshot()` 必须和客户端 Hydration 前的初始快照一致，通常由服务端序列化并传给客户端。
- 不要把请求相关 Store 做成服务端模块单例，否则用户数据可能跨请求污染。本例使用 Factory 为每个 App/Request 创建实例。

`useSyncExternalStore` 是外部系统桥梁，不代表所有应用状态都应该移出 React。

## 8. Provider 只提供稳定能力，不承载所有变化

<<< ../../../examples/frontend/react-enterprise-architecture/AppProviders.tsx

Provider 中适合放稳定服务、当前应用会话句柄和 Store 引用。频繁变化的大对象直接塞进同一个 Context，会让所有消费者重渲染。可以拆成不同 Context，或者让 Context 只提供支持细粒度订阅的 Store。

依赖对象应在 Composition Root 创建。若每次父组件 Render 都重新构造 `{ lessonService, telemetry }`，Context Value 会变化，即便内部服务没变也会传播更新。

## 9. Feature 组件只编排用户交互

<<< ../../../examples/frontend/react-enterprise-architecture/LessonFeature.tsx

这个组件没有硬编码 API Base URL，也不认识遥测厂商。Effect 只负责“组件可见期间同步课程列表”这一外部系统，并用 `AbortController` 处理卸载/切换。错误对用户和遥测分别处理：用户拿到可操作消息，诊断系统拿到结构化上下文。

基础设施层负责把不可信 HTTP 响应解析成应用层契约，而不是用 `as LessonSummary[]` 绕过检查：

<<< ../../../examples/frontend/react-enterprise-architecture/http-lesson-service.ts

`response.ok` 只说明 HTTP 状态是否在成功范围，不证明 JSON 结构正确。即使有 OpenAPI 生成的静态 TypeScript 类型，运行时数据仍来自系统边界；关键响应需要 Schema Validator 或等价的 Runtime Parser。请求携带 Cookie 时还必须配套服务端 CORS、CSRF 与 SameSite 策略，不能只看前端 `credentials` 配置。

这仍是简化示例。正式应用通常把服务端数据交给 Router Loader 或 Query Library，获得缓存、请求去重、重试和失效语义；依赖方向保持不变。

## 10. 错误边界不是可观测性边界的全部

<<< ../../../examples/frontend/react-enterprise-architecture/AppErrorBoundary.tsx

Error Boundary 能捕获后代 Render、生命周期和构造阶段错误，不能自动捕获：

- Event Handler 内抛出的错误；
- 任意异步 Callback/Promise Rejection；
- 服务端渲染错误；
- Error Boundary 自己抛出的错误。

因此还需要数据层错误处理、全局兜底、服务器日志以及框架级 Route Error Boundary。边界粒度要支持局部降级：导航壳、付款区和课程 Widget 不应共享唯一一个“白屏或全好”的边界。

## 11. Telemetry 要稳定、低基数且不泄露隐私

<<< ../../../examples/frontend/react-enterprise-architecture/telemetry.ts

统一 Adapter 应自动补齐 `release`、environment、route template、feature 和 correlation ID。属性要控制基数：使用 `/lessons/:id`，不要把每个实际 URL 当 Metric Label；错误对象和用户输入先清洗，禁止默认上传 Token、Cookie、完整邮箱、课程正文或任意 DOM。

浏览器可观测性至少覆盖：

- JavaScript Error、Unhandled Rejection 与 Chunk Load Error；
- API 成功率、延迟、取消和 Backend Trace Correlation；
- 路由切换、关键业务漏斗和 Feature Flag Cohort；
- LCP、INP、CLS 等真实用户体验，按页面、设备和网络分群；
- 当前 Release、Remote Version 和 Source Map 对应关系。

OpenTelemetry JavaScript 的浏览器端能力仍需谨慎评估成熟度；Adapter 可避免业务代码绑定某个尚在变化的 SDK。Core Web Vitals 以 Field/RUM 数据为主，常用第 75 百分位观察多数用户体验，实验室数据负责复现和开发反馈。

## 12. 渐进迁移的四种切口

Vue 2 应用迁移到 React，不需要一次重写。选择能独立验收和回滚的切口：

| 切口 | 适用情况 | 优点 | 风险 |
| --- | --- | --- | --- |
| 整页/路由 | 页面依赖较独立 | 边界清楚，生命周期简单 | 壳层路由与权限需统一 |
| 垂直业务域 | 团队按领域负责 | 数据、UI、测试可一起迁 | 前期需要拆遗留共享层 |
| 页面内 Widget | 无法立刻迁整页 | 风险小，可 A/B | 双框架、样式和通信复杂 |
| 设计系统叶子组件 | 先统一视觉基础 | 复用面广 | 容易只换外观不拆业务耦合 |

优先整页或垂直业务域。大量细碎 React Widget 嵌在 Vue Tree 中，会增加 Root、Bundle、生命周期和事件桥接成本，适合作为过渡态而非最终形态。

## 13. Vue 2 宿主挂载 React：显式 Imperative API

React Root 的所有权必须唯一。对遗留宿主暴露 `mount/update/unmount`，比让 Vue 2 直接理解 React Context 更可靠：

<<< ../../../examples/frontend/react-enterprise-architecture/mount-react-widget.tsx

<<< ../../../examples/frontend/react-enterprise-architecture/vue2-host-adapter.mts

这里有几个不可省略的细节：

- Vue `mounted` 后容器才存在，才能 `createRoot`。
- Props 改变调用 `update`，不要重复 `createRoot`。
- Vue 2 使用 `beforeDestroy` 对称 `unmount`，释放 Effect、Listener 和资源。
- `WeakSet` 防止同一 DOM 容器被重复占用。
- 跨框架传入的是稳定应用依赖/DTO，不传 Vue Observer、React Element 或内部 Component Instance。

如果 Vue 的 `v-if`、`key` 或 Router 会替换容器，必须验证销毁路径。开发环境可记录未卸载 Root，避免迁移期悄悄积累 Listener 和内存。

## 14. Custom Element：更标准的框架边界

Vue 可以消费原生 Custom Element，也能用 `defineCustomElement` 创建。React Widget 同样可以包装成 Custom Element：

<<< ../../../examples/frontend/react-enterprise-architecture/lesson-widget-element.tsx

Custom Element 的优点是宿主只依赖 Tag、Property、Attribute 和 DOM Event；缺点是：

- Shadow DOM 会改善 CSS 隔离，却让全局设计 Token、Portal、字体和可访问性调试更复杂。
- Attribute 只有字符串，复杂数据应通过 DOM Property 传递，并明确 Property 设置早于/晚于连接的行为。
- SSR/Declarative Shadow DOM、样式加载和 Hydration 需单独验证。
- DOM 移动可能触发 `disconnectedCallback`；示例用 Microtask 再检查 `isConnected`。
- 同一 Tag 只能注册一次，因此定义前检查 `customElements.get()`。

Custom Element 是浏览器级互操作契约，不自动解决版本、数据所有权和部署治理。

## 15. 跨边界通信：命令、事件和查询分开

边界双方不要直接读写彼此 Store。可使用：

- **Properties/Arguments**：宿主向 Widget 传配置和初始输入。
- **Callback/Command Port**：调用方明确请求动作，并等待成功或失败。
- **DOM Event**：发布已发生的事实，允许零到多个订阅者。
- **HTTP/API**：跨部署边界查询权威服务端数据。

事件必须命名空间化、版本化并在运行时校验：

<<< ../../../examples/frontend/react-enterprise-architecture/events.ts

事件名表达业务事实，避免 `update`、`change` 这类无语义名称。Event Payload 只传 ID、版本和必要元数据，不传 Token、大对象或框架实例。消费者不能假设自己一定先于其他消费者执行，也不要用事件总线模拟同步 RPC。

## 16. 跨标签页同步不是共享数据库

同源页面可用 `BroadcastChannel` 传播退出登录、权限版本变化等失效提示：

<<< ../../../examples/frontend/react-enterprise-architecture/cross-tab-session.ts

发送者不会收到自己的消息，所以本标签页必须先更新本地状态，再 Broadcast。Channel 用完应 `close()`。任何同源脚本都可能发送消息，接收端仍要校验结构；频道只传“重新获取会话”的提示，不传播 Access Token，也不能代替服务端授权。

不支持或不适用时，可选择 `storage` Event、SharedWorker 或 Service Worker；先明确一致性与浏览器支持要求，不要为了同步一个 Logout 信号引入分布式客户端数据库。

## 17. 路由和 History 必须只有一个总协调者

Vue 壳与 React Widget 同时监听并修改 Browser History，常导致重复导航、Back Button 异常和 Analytics 重复。推荐：

1. 壳应用拥有顶层 URL 与鉴权导航。
2. Feature 通过 `navigate(to)` Port 或版本化事件请求导航。
3. Widget 内部只管理自己的相对子路由；若要反映到 URL，由壳层映射。
4. URL Schema 是公开契约，旧 Bookmark 和外部链接必须有兼容/重定向策略。

整路由迁移时，可以让 React Router 接管明确前缀，例如 `/learning/*`，壳层只负责把该前缀挂载给 React。不要让两个 Router 同时声称拥有 `/`。

## 18. Session、权限与安全边界

跨应用共享的是“会话能力”，不是把 Bearer Token 发给每个 Remote：

- 优先使用 `HttpOnly`、`Secure`、合适 `SameSite` 的 Cookie，由服务端校验。
- Client Session 只保存显示所需的最小用户摘要和权限版本。
- UI 权限控制只改善体验，服务端每个敏感操作仍需认证和授权。
- Remote 代码与宿主具有相同页面权限；加载第三方 Remote 等同执行第三方脚本，应有来源、CSP、审计和供应链策略。
- Logout、Tenant 切换时清空 Query Cache、外部 Store 和敏感内存，并让其他标签页重新验证。

同源并不等于可信。XSS 一旦进入任何共享页面，就可能访问非 `HttpOnly` 数据和调用用户权限内接口。

## 19. 样式和设计系统治理

双框架共存常见冲突来自 Reset、全局元素选择器、Z-Index 和 Portal。可按强度选择：

1. 统一 Design Token（CSS Custom Properties）与语义契约。
2. CSS Modules/命名空间减少 Feature 泄漏。
3. Cascade Layers 明确 Reset、Design System、Feature、Override 次序。
4. Shadow DOM 强隔离独立 Widget。
5. iframe 用于真正不可信或必须强隔离的系统。

Design System 应发布 Tokens、无框架样式基础，以及必要的 Vue/React Adapter。不要让两个框架 Wrapper 各自实现键盘交互和 ARIA；复杂交互组件要么共享无头状态机，要么由一个团队维护等价实现并跑同一行为契约测试。

## 20. 什么时候需要微前端

微前端解决的核心问题是**多个团队需要独立交付大型业务域**。以下条件越多，收益越可能成立：

- 团队和业务域边界长期稳定。
- 发布节奏确实无法由同一流水线协调。
- 每个团队拥有从代码到生产值班的完整责任。
- Shell API、设计系统、路由和观测契约有治理团队。
- 能接受重复依赖、运行时故障和本地联调成本。

如果只是“仓库太大”“想用新框架”或“团队沟通困难”，Monorepo + 模块边界 + 独立测试往往更便宜。微前端不会消灭组织耦合，只会把它变成网络和运行时契约。

## 21. Module Federation 的真实成本

Module Federation 可让独立构建在运行时组成应用，Host 消费 Remote 的 Exposed Module，并可协商 Shared Module。它适合确需独立部署的团队，但必须治理：

- Remote Entry 加载超时、404、CDN 缓存错配和离线回退。
- React/React DOM、Router、设计系统单例与版本范围。
- Host 先升级还是 Remote 先升级的兼容窗口。
- Chunk Source Map、Release ID 与跨 Remote Trace。
- 预加载策略对启动性能的影响。
- Remote 被攻陷时等同宿主供应链被攻陷的安全事实。

不要随意把所有包标成 Singleton。Singleton 会隐藏重复包，却把版本不兼容变成运行时错误。基础库能重复时可允许重复；需要唯一 Runtime Identity 的 React 等依赖才谨慎共享，并在 CI 验证版本矩阵。

## 22. Remote Manifest 与 Host API 契约

动态地址不能直接信任。Remote Manifest 至少声明 Schema Version、入口、Expose 和 Host API Major，并在加载任何脚本前校验：

<<< ../../../examples/frontend/react-enterprise-architecture/remote-contract.ts

正式实现还应处理：

- Manifest 签名/可信发布链与 HTTPS。
- Entry 的 CSP、SRI 可行性和不可变内容哈希 URL。
- Fetch/Load Timeout、Circuit Breaker 和本地 Fallback。
- Host API 的 Deprecation Window 与兼容矩阵。
- 失败时只降级该业务域，而非阻塞整个 Shell。

独立部署要求 **N/N-1 兼容窗口**：新 Host 必须暂时兼容旧 Remote，新 Remote 也要在旧 Host 上安全失败或维持兼容。原子发布在分布式前端里通常不存在。

## 23. Feature Flag 是发布控制，不是权限系统

灰度需要稳定分桶，否则用户每次刷新进入不同 Cohort：

<<< ../../../examples/frontend/react-enterprise-architecture/feature-flags.ts

Flag 系统应具备 Owner、创建日期、到期日期、Kill Switch 和审计。服务端分桶通常比纯客户端更一致；客户端 Flag 可控制 UI 曝光，但不能保护未授权能力。实验结束后删除旧分支，长期 Flag 会让测试组合指数增长。

按用户 ID Hash 的百分比只是示例。真实系统还需租户、地区、设备、员工 Allowlist 与合规策略；匿名用户要定义稳定标识和隐私生命周期。

## 24. 灰度发布必须有机器可判定的门禁

“先发 5% 看看”不完整，还必须定义看什么、看多久、谁决定、如何回滚：

<<< ../../../examples/frontend/react-enterprise-architecture/release-policy.ts

示例体现三个原则：

- 样本不足时不作过早结论。
- 轻微越界先 Pause，灾难性错误率可直接 Rollback。
- 技术指标与体验指标共同参与决策。

生产门禁还应比较基线版本，按设备/地区分群，并关注关键业务成功率。固定阈值不能覆盖所有统计问题，但比无人负责的 Dashboard 更接近可执行治理。

推荐发布阶梯：内部用户 → 1% → 5% → 25% → 50% → 100%。每一阶设置最短观察窗和自动停止条件。Rollback 必须恢复代码、Manifest/Remote 组合与必要的数据兼容，而不只是重新部署旧 JS。

## 25. 数据 Schema 决定能否真正回滚

前端回滚经常被后端 Schema 变化破坏。使用 Expand/Contract：

1. 后端先增加新字段/新端点，同时保留旧契约。
2. 新旧前端都能工作的兼容窗口内灰度。
3. 全量并稳定后停止旧写入。
4. 观察旧客户端流量归零，再删除旧字段。

客户端读取响应时做 Runtime Validation；解析器可以在兼容期接受 V1/V2，再转成统一内部模型。写入操作尽量 Idempotent，携带 Request ID；不要因为用户重试或 Remote 重挂载产生重复订单。

## 26. 测试金字塔要覆盖边界失败

大型架构最有价值的测试不是给每个 Wrapper 截图，而是验证契约：

- **纯单元测试**：Flag 分桶、Release Policy、Runtime Parser、领域规则。
- **Contract Test**：Host API、DOM Event、Remote Manifest、API Schema 的 Producer/Consumer 兼容。
- **Adapter Integration**：Vue 挂载 → Props 更新 → React Render → Unmount 无泄漏。
- **Browser Test**：Back/Forward、Refresh、Deep Link、Session 失效、Shadow DOM 可访问性。
- **Resilience Test**：Remote 超时、Chunk 404、API 500、旧 Manifest、新旧版本交叉。
- **Production Verification**：Synthetic Smoke + Canary RUM + Release Marker。

CI 应检查禁止的跨 Feature Import、依赖循环、Bundle Budget、重复 React Runtime、过期 Flag 和契约版本矩阵。架构规则如果只写在 Wiki 中，最终一定漂移。

## 27. 一条可执行的 Vue 2 → React 迁移路线

### 阶段一：建立基线

- 记录当前错误率、Web Vitals、Bundle、核心漏斗和发布频率。
- 列出路由、全局 Store、全局事件、权限和隐式 CSS 依赖。
- 给现有 Vue 2 关键路径补浏览器级保护测试。

### 阶段二：抽出框架无关边界

- 把 API Client、DTO Parser、业务规则和 Telemetry 变成明确端口。
- URL 成为可分享导航状态的权威来源。
- 清理组件直接读全局 Singleton 和任意 Event Bus 的路径。

### 阶段三：先迁一个垂直切片

- 选择价值明确、依赖可控、可单独回滚的路由。
- Vue 壳拥有顶层 Router/Session；React Root 拥有内部 Feature。
- 为 Mount/Unmount、Event、Error 和 Release 建立可观测边界。

### 阶段四：扩大迁移并收紧规则

- 用 CI 禁止新代码继续依赖待淘汰 Vue 2 Store/API。
- 按领域迁移，不按“先迁所有 Button、再迁所有 Table”。
- 维持新旧契约兼容窗口，持续删除桥接层。

### 阶段五：完成退出

- 流量和日志证明旧路由无人使用。
- 删除 Vue 2 Runtime、Bridge、Flag、Polyfill 和旧流水线。
- 更新值班、Ownership、Runbook 与恢复演练。
- 对比基线，确认迁移改善了业务和工程指标。

迁移完成的定义是旧路径和临时兼容层被删除，而不是“React 已经占 80%”。

## 28. 常见失败模式

### 28.1 共享一个跨框架巨型 Store

短期通信方便，长期所有应用被同一数据形状、更新时序和版本绑死。改为权威服务端状态、Feature Store 和窄事件契约。

### 28.2 每个小卡片一个 React Root

Root、Provider、Observer、Bundle 和 Error Boundary 激增。扩大迁移切片，优先整区域或整路由。

### 28.3 Remote 能独立部署却不能独立降级

独立发布不等于自治。为每个 Remote 设置 Timeout、Fallback、Release 标识与值班 Owner。

### 28.4 把 Feature Flag 当永久架构

新旧代码永远共存，测试组合持续增长。Flag 创建时就创建删除任务和截止日期。

### 28.5 只测最新版 Host + 最新版 Remote

实际发布必然经历版本交叉。至少验证 Host N/N-1 与 Remote N/N-1 组合。

### 28.6 先重写，再补监控

没有基线就无法证明改善，也无法安全灰度。Observability 和 Release Marker 必须在首个迁移切片之前建立。

## 29. 架构评审清单

上线一个新 Feature/Remote 前，至少回答：

- 业务边界、Owner、SLO 和值班是谁？
- 状态的权威来源、Freshness 和 Invalidation 是什么？
- 谁拥有 URL、History、Session 和顶层错误页面？
- 输入输出是否是运行时可校验、版本化的窄契约？
- 旧 Host/Remote/API 的兼容窗口多长？
- 加载失败、超时、离线和部分数据失败时显示什么？
- Release、Remote Version 和 Source Map 能否关联？
- Flag 的 Kill Switch、Owner 和删除日期是什么？
- Canary 指标、观察窗、Pause/Rollback 阈值是什么？
- 回滚是否被数据 Schema、缓存或不可逆写入阻塞？
- 迁移后哪些旧代码、依赖和 Bridge 必须删除？

## 30. 完整示例文件索引

本页已经逐段展示所有实现，示例目录还包括应用外壳：

<<< ../../../examples/frontend/react-enterprise-architecture/App.tsx

它刻意保持简单：真正的架构价值在于外壳之外的依赖方向和边界契约，而不是 Root JSX 有多少 Provider。

## 31. 官方资料

- [React：Scaling Up with Reducer and Context](https://react.dev/learn/scaling-up-with-reducer-and-context)
- [React：useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)
- [React：createRoot](https://react.dev/reference/react-dom/client/createRoot)
- [Vue：Vue and Web Components](https://vuejs.org/guide/extras/web-components.html)
- [Vue：Ways of Using Vue](https://vuejs.org/guide/extras/ways-of-using-vue)
- [MDN：Using custom elements](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements)
- [MDN：BroadcastChannel](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel)
- [webpack：Module Federation](https://webpack.js.org/concepts/module-federation/)
- [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/)
- [web.dev：Web Vitals in the field](https://web.dev/articles/vitals-tools)

## 32. 本模块小结

React 大型应用架构的核心不是把所有东西搬进 React，而是让业务规则独立、依赖在入口组装、状态只有一个所有者、跨边界只走可演进契约。Vue 2 与 React 可以在迁移期共存，但每个 Bridge 都应有清晰退出计划。

当团队确实需要独立部署时，微前端提供运行时组合能力，也同时引入版本交叉、共享依赖、远程故障和供应链风险。生产治理必须把 Release、真实用户体验、灰度门禁、Kill Switch 和数据兼容纳入同一套回滚设计。

下一节进入“浏览器与网络”模块，从事件循环、任务与微任务、渲染流水线和长任务诊断开始，把框架层现象还原为浏览器执行模型。
