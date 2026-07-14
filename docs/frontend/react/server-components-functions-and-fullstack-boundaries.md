---
title: Server Components、Server Functions 与现代全栈边界
description: 系统理解 React Server Components、Server Functions、Client Boundary、序列化、缓存、流式、安全与框架职责
---

# Server Components、Server Functions 与现代全栈边界

> 资料基线：React 19.2 与 Next.js 16 Cache Components 模型。React Server Components 和 Server Functions 在 React 19 中是稳定能力，但实现 RSC 的底层 Bundler/Framework API 不遵循 React 19.x Minor SemVer。普通 Vite SPA 不能只添加 `'use client'`/`'use server'` 就获得这些能力，应使用明确支持 RSC 的框架并锁定兼容版本。

## 1. 学习目标

完成本节后，你应该能够：

- 区分 CSR、SSR、Streaming SSR、RSC、Hydration 与 Server Function。
- 理解 Server/Client 是模块依赖边界，不只是组件树父子关系。
- 判断组件应该留在服务端还是进入 Client Bundle。
- 正确使用 `'use client'`，避免无意扩大客户端依赖子树。
- 理解 Server Component 没有 `'use server'` 指令。
- 设计可序列化、最小化且不泄露机密的 DTO。
- 使用 JSX Slot 把 Server Component 组合进 Client Component。
- 理解服务端 Promise、`use()`、Suspense 与流式 Reveal。
- 区分 React `cache()` 的请求期 Memo 与框架跨请求缓存。
- 为缓存建立明确 Key、Freshness、Invalidation 和用户隔离语义。
- 把 Server Function 当公开网络入口验证输入、认证与授权。
- 使用 `useActionState`、`useFormStatus` 和渐进增强处理写操作。
- 判断何时使用 Server Function，何时保留 Route Handler/API。
- 处理多实例部署、Edge Runtime、连接池、日志和错误边界。

## 2. 先拆掉“服务端渲染”这个模糊词

现代 React 中至少有六个不同概念：

| 概念 | 执行位置 | 主要产物 | 浏览器是否执行同一组件逻辑 |
| --- | --- | --- | --- |
| CSR | 浏览器 | DOM | 是 |
| SSR | 服务端先执行，浏览器 Hydrate | HTML + JS | 通常是 |
| Streaming SSR | 服务端分段输出 | HTML Stream + JS | 通常是 |
| Server Component | RSC 环境 | RSC Payload/组件结果 | 否 |
| Client Component | 构建为客户端模块，也可参与预渲染 | JS + 可 Hydrate HTML | 是 |
| Server Function | 服务端 | 网络调用结果/Mutation | 浏览器只有函数引用 |

最关键的一点：**RSC 不等于 SSR**。

Server Component 先在 RSC 环境执行，结果进入 RSC Payload。框架可再把 Server/Client 组合树 SSR 成 HTML，以改善首屏；浏览器收到 HTML、RSC Payload 和 Client Component JS 后进行 Hydration。也可以在后续导航只交换 RSC Payload，而不是完整 HTML。

```text
Request / Navigation
→ RSC Render：执行 Server Components，产生 RSC Payload
→ 可选 SSR：结合 Client Component 引用产生初始 HTML Stream
→ Browser 展示 HTML
→ 下载 Client JS
→ Hydrate Client Components
→ 后续交互/导航继续请求 RSC 或调用 Server Function
```

RSC 决定“哪些组件代码不发给浏览器”；SSR 决定“初始 HTML 在哪里产生”。它们可以组合，但不是同一轴。

## 3. Server Component 的执行模型

Server Component 在独立于浏览器 Client App 的环境执行，可以：

- 在构建时执行，产生静态内容。
- 在每个请求中执行，读取请求相关数据。
- 直接访问数据库、文件、内部服务和服务端依赖。
- 写成 Async Component，在 Render 中 `await`。
- 引入 Markdown Parser、SQL Client 等无需进入 Client Bundle 的库。
- 返回普通 JSX，并嵌入 Client Component 引用。

它不能：

- 使用 `useState`、`useReducer` 管理浏览器交互状态。
- 使用 `useEffect/useLayoutEffect` 浏览器生命周期。
- 注册 `onClick/onChange` 等浏览器事件处理器。
- 读取 `window/document/localStorage`。
- 把普通函数、数据库实体或任意 Class Instance 传给 Client Component。

Server Component 没有专用 Directive。在支持 RSC 的框架 Server Tree 中，它通常是默认类型。`'use server'` 标记的是 **Server Function**，不是 Server Component。

## 4. `'use client'` 是模块图切口

Directive 必须位于文件开头、所有 Import 之前：

```tsx
'use client'

import { useState } from 'react'
```

当 Server Module 导入 `'use client'` Module 时，Bundler 把这里识别为 Server/Client 边界。该 Client Module 的传递依赖也会进入客户端可执行子图。

```text
Server page.tsx
├─ server data.ts          只在服务端
├─ server Article.tsx      只在服务端
└─ client Editor.tsx       进入 Client Bundle
   ├─ date-library         也进入 Client Bundle
   └─ toolbar.tsx          也进入 Client Bundle
```

因此不要在 Page/Layout 顶部随手加 `'use client'`。它会让大量本可留在服务端的组件、Utility 和依赖进入客户端子图，增加下载、Parse、Hydration 与 Runtime 成本。

### Client Component 不等于“只在浏览器 Render”

框架仍可能在初次请求时于服务端预渲染 Client Component，生成 HTML；随后浏览器下载代码并 Hydrate。`'use client'` 表示该模块具备客户端运行能力与客户端依赖，不表示服务器完全不接触它。

## 5. 组件使用位置由模块图决定

同一个未标 Directive 的普通组件定义，可能在不同 Import 路径下成为不同使用方式：

- 被 Server Module 导入并 Render：Server Component 使用。
- 被 Client Module 导入并 Render：进入 Client 子图并作为 Client Component 使用。

父子 Render 关系不能单独判断环境。Client Component 可以显示 Server Component 结果，只要 Server 先创建 JSX，再通过 `children`/Slot 传进去；Client Module 不能直接 Import Server-only Module。

本课 Client Shell：

<<< ../../../examples/frontend/react-server-boundaries/InteractiveShell.tsx

Server-only 讲师卡片：

<<< ../../../examples/frontend/react-server-boundaries/InstructorCard.tsx

Page 在 Server 端创建 `<InstructorCard />`，再作为 `sidebar` Slot 传入 Client Shell。Shell 只知道它拿到一个 `ReactNode`，没有 Import Instructor Module，因此不会把 Instructor 的数据访问代码拖进 Client Bundle。

这种 **Interleaving** 模式非常重要：

```tsx
<ClientModal>
  <ServerRenderedCheckoutSummary />
</ClientModal>
```

Modal 的开关状态在客户端，昂贵或敏感 Summary 仍由服务端生成。

## 6. 序列化边界不是普通 JSON 边界

Server Component 向 Client Component 传 Props 时，框架通过 RSC 协议编码。React 支持的值比 JSON 更丰富，包括：

- String、Number、BigInt、Boolean、Null、Undefined。
- Global Symbol（`Symbol.for`）。
- Array、Map、Set、TypedArray、ArrayBuffer 等可序列化 Iterable。
- Date。
- Plain Object。
- Server Function Reference。
- Server/Client Component Element（JSX）。
- Promise。

不支持的典型值：

- 普通函数/事件回调。
- 自定义 Class Instance、ORM Entity、带 Prototype 的领域对象。
- 非全局 Symbol。
- 数据库连接、Stream、Request Context 等服务端资源。

“协议支持 Date/Map”不代表 API DTO 应随意复杂。稳定的 Plain Object DTO 更容易版本化、测试、日志脱敏和跨框架迁移。

## 7. DTO 是数据泄露防线

内部记录与 Client DTO：

<<< ../../../examples/frontend/react-server-boundaries/types.ts

显式投影：

<<< ../../../examples/frontend/react-server-boundaries/dto.ts

`LessonRecord` 包含 `ownerId` 和 `internalCostNotes`，`LessonDTO` 明确排除它们。不要把 ORM Entity `return {...record}` 后再删除几个字段：Schema 新增字段时可能默认泄露。

更安全的模式是 Allowlist：

```text
Database Record
→ Authorization
→ Explicit DTO Projection
→ RSC Serialization
→ Client Props
```

TypeScript 的 `Pick` 只在编译期约束类型；运行时若返回对象仍带额外属性，序列化器可能照样发送。要实际构造新对象。

### `server-only` 防止意外 Import

服务端数据层可导入 `server-only`，兼容框架会在 Client Module 误 Import 时构建失败。本课 Repository、Auth 与 Data Module 都使用该边界。它是构建期护栏，不替代 DTO、权限校验和 Secret 管理。

## 8. Data Access Layer 集中可信决策

演示 Repository：

<<< ../../../examples/frontend/react-server-boundaries/repository.mts

认证边界：

<<< ../../../examples/frontend/react-server-boundaries/auth.mts

示例用内存 Map 让课程代码自包含；生产环境必须替换为具有事务、唯一约束和共享持久化能力的 Repository。Serverless/多实例部署中的进程内 Map 会丢数据且实例间不一致。

推荐 DAL 负责：

- 读取并验证 Session。
- 对目标资源做 Object-level Authorization。
- 只查询需要字段。
- 返回最小 DTO，而非原始数据库对象。
- 统一审计、超时与错误映射。
- 让 Page、Server Function、Route Handler 复用同一业务命令。

不要只在顶层 Layout 判断已登录。Next/React 应用有多个入口：深层 Route、Server Function、Route Handler、并行 Route 都可能绕过某个 Layout Render。每个敏感操作必须在执行点重新授权。

## 9. Async Server Component 与瀑布

Server Component 可以直接 `await`：

```tsx
export default async function Page() {
  const lesson = await getLesson()
  return <Article lesson={lesson} />
}
```

这消除了 Client 首帧后的 Effect Fetch，但不会自动消灭瀑布：

```text
await session
→ await lesson
→ child render
→ await comments
```

没有数据依赖的请求应尽早并行：

```ts
const lessonPromise = getLesson(id)
const commentsPromise = getComments(id)
const [lesson, comments] = await Promise.all([lessonPromise, commentsPromise])
```

或者用 Suspense Boundary 让重要内容先 Reveal，次要内容流式到达。过度并行也会打爆数据库连接池；应结合查询合并、批处理、限流和 Repository 设计。

## 10. `cache()` 是请求期 Memo，不是持久缓存

React Data Module：

<<< ../../../examples/frontend/react-server-boundaries/lesson-data.mts

`cache(fn)` 在 RSC 中为相同参数复用结果/Promise，适合：

- Page、Metadata、Layout 重复读取同一实体。
- 多个 Server Component 共享同一请求 Snapshot。
- 提前调用启动 Promise，再在子组件 Await。

重要规则：

- React 会为每个 Server Request 失效所有 Memoized Function Cache。
- 每次 `cache(fn)` 都创建独立 Memoized Function，必须从共享 Module 导出同一个实例。
- 参数按浅层引用比较；优先传 ID 等 Primitive。
- Error 也会按参数缓存并再次抛出。
- 在 Component 外调用无法使用 React 提供的 Cache Context。
- `cache()` 仅用于 Server Components，不等于浏览器 `useMemo`。

`cacheSignal()` 提供与 Cache 生命周期关联的 AbortSignal。当 React 不再需要该渲染工作时，支持取消的 Repository/Fetch 可停止浪费资源。

## 11. 跨请求缓存属于框架/平台

React `cache()` 不跨 Request。CDN、数据库结果、完整 Page 或组件输出的跨请求复用由框架和平台定义。

本课采用 Next.js 16 Cache Components 模型，需要项目启用相应 `cacheComponents` 能力。缓存目录函数：

<<< ../../../examples/frontend/react-server-boundaries/cached-catalog.mts

缓存目录 Page：

<<< ../../../examples/frontend/react-server-boundaries/catalog-page.tsx

`'use cache'` 把函数/组件结果加入框架 Cache：

- Build ID、Function ID、可序列化参数和捕获值构成 Key。
- `cacheLife('hours')` 描述 Stale/Revalidate/Expire 生命周期。
- `cacheTag('published-lessons')` 建立按领域事件失效的索引。
- 默认处理器可能是进程内 Cache；多实例共享需要平台或自定义 Cache Handler。

### 缓存决策四问

每个 Cache 必须回答：

1. **Key**：Locale、Tenant、权限、Query、Version 是否包含？
2. **Freshness**：可接受陈旧多久？
3. **Scope**：单 Request、单用户、单进程、区域还是全球？
4. **Invalidation**：哪个领域事件使它失效，失败如何恢复？

用户 A 的权限化结果绝不能因漏掉 User/Tenant Key 而返回给用户 B。Cookies/Headers 等请求动态数据通常不应在公共 Cache Scope 内直接读取；先在外部读取并只传必要、允许缓存的 Key，或使用框架明确的 Private Cache 模型。

## 12. 把 Promise 从 Server 传到 Client

Client 评论组件用 `use()` 读取 Promise：

<<< ../../../examples/frontend/react-server-boundaries/Comments.tsx

Server Wrapper 启动工作但不 Await：

<<< ../../../examples/frontend/react-server-boundaries/CommentsSection.tsx

流程：

```text
Server 创建并缓存 commentsPromise
→ Promise 作为可序列化 Prop 传过 RSC 边界
→ Client Component use(promise)
→ Pending 时激活最近 Suspense Fallback
→ Resolve 后流式/客户端恢复评论 UI
```

重要正文不应为了低优先级评论被阻塞。Promise 必须由支持 RSC/Suspense 的框架数据流稳定提供；Client Render 中每次新建 Promise 会导致重复等待和警告。

`use()` 与普通 Hook 不同，可以在条件/循环中调用，但仍必须位于 Component/Hook 中；读取 Reject Promise 会抛给最近 Error Boundary。

## 13. Route Page 与框架边界

完整 Server Page：

<<< ../../../examples/frontend/react-server-boundaries/page.tsx

它完成：

1. Await Framework Params。
2. 从 Request Memo 读取公开课程。
3. 不存在时进入 `notFound()` 控制流。
4. 只把 DTO 与 Primitive 传给 Client Island。
5. 把 Server Instructor JSX 作为 Slot 传给 Client Shell。
6. 用 Suspense 独立流式评论。

Client Bundle 不包含 Repository、Cookie Auth、内部成本字段和 Instructor 数据访问逻辑。

### Loading、Error、Not Found

Route Loading UI：

<<< ../../../examples/frontend/react-server-boundaries/loading.tsx

Route Error Boundary 必须是 Client Component，才能显示 Retry：

<<< ../../../examples/frontend/react-server-boundaries/error.tsx

Not Found：

<<< ../../../examples/frontend/react-server-boundaries/not-found.tsx

不要把 404 当 500，也不要让所有错误只显示根级 Spinner。Boundary 位置决定 Streaming Reveal、错误隔离和 Retry 范围。

`error.tsx` 收到的 Error Message 在生产可能被框架脱敏；可用 Error Digest/Request ID 关联服务端日志，但不要向用户回显 Stack、SQL 或 Secret。

## 14. Server Function 到底是什么

Server Function 是 Client 可调用、但实际在服务器执行的 Async Function。框架把它编译成 Server Reference；浏览器调用 Reference 时会发送网络请求，序列化参数，执行函数，再返回序列化结果/RSC 更新。

术语边界：

- 所有这类函数叫 Server Functions。
- 当 Server Function 被传给 Form `action` 或从 Action 调用时，通常称 Server Action。
- 并非所有 Server Function 都是 Form Action。

`'use server'` 可以写在 Async Function Body 顶部，或 Module 顶部将所有 Export 标成 Server Function。Client Module 要直接 Import 时，通常需要 Module-level Directive。

它不是把函数源码下载到浏览器执行，也不是零成本本地调用。每次调用都有网络、序列化、认证、部署版本和错误处理成本。

## 15. Server Function 是公开入口

浏览器 DevTools 未显示某个 Action Button，不代表函数不可调用。攻击者可以重放、修改参数、并发请求、使用旧页面引用。

解析 Contract：

<<< ../../../examples/frontend/react-server-boundaries/action-contract.ts

统一领域命令：

<<< ../../../examples/frontend/react-server-boundaries/enrollment-command.mts

安全流程：

```text
Untrusted Serialized Args / FormData
→ Parse + Runtime Validation
→ Authenticate Current Request
→ Load Target Resource
→ Object-level Authorization
→ Transaction + Unique Constraint
→ Minimal Result
→ Cache Invalidation + Audit
```

隐藏字段 `lessonId` 仍完全由客户端控制。TypeScript 类型、闭包捕获和框架加密都不能替代执行时权限检查。

示例用 `(userId, lessonId)` 作为领域唯一键，使重复报名返回同一业务结果。生产数据库必须使用 Unique Index/Transaction 实现；按钮 Disabled 和进程内 Set 都不是并发保证。

## 16. 完整 Server Action

Action Module：

<<< ../../../examples/frontend/react-server-boundaries/actions.mts

核心决策：

- 先 Parse FormData，不做类型断言欺骗。
- 每次调用重新读取 Session。
- Command 统一处理资格、目标与原子写入。
- 可预期错误返回安全状态；未知错误记录服务端详情并返回通用文案。
- Mutation 成功后使用 `updateTag` 建立 Read-your-own-writes。

`updateTag` 在 Next.js 16 Cache Components 中只能用于 Server Action，会立即 Expire，适合用户刚写入后马上看到新结果。`revalidateTag(tag, 'max')` 使用 Stale-while-revalidate，适合目录、CMS 等允许短暂陈旧的数据。

不要“写完以后清空所有 Cache”。过度失效会制造数据库洪峰；Tag 应对应领域实体或集合。

## 17. Client Island 与渐进增强

Submit Button：

<<< ../../../examples/frontend/react-server-boundaries/SubmitButton.tsx

报名 Island：

<<< ../../../examples/frontend/react-server-boundaries/EnrollmentIsland.tsx

Client Island 只承担：

- `useActionState` 管理上次 Action Result。
- `useFormStatus` 显示最近父 Form 的 Pending。
- 渲染 Status/Alert。

认证、授权、唯一约束和写入都不在浏览器。这个边界比把整页标成 Client Component 更小。

在支持的框架中，Server Function + Form 可在 JS 尚未 Hydrate 时提交；`useActionState` 还能回放 Hydration 前的提交。第三个 Permalink 参数可为无 JS 阶段提供稳定目标 URL。具体 URL、排队和部署行为必须以框架版本为准。

Server Functions 面向 Mutation，官方不推荐把它们当普通数据 Fetch RPC；框架可能一次处理一个 Action，也通常不缓存返回值。读取使用 Server Component/Loader/Route API/Query Layer。

## 18. Server Function 与 Route Handler 如何选择

Server Function 适合：

- 只由同一 React 应用调用的 UI Mutation。
- 希望与 Form、Pending、RSC Refresh、Cache Invalidation 深度整合。
- 不需要稳定公开 HTTP Contract。

Route Handler/API 适合：

- Mobile、第三方、Webhook、CLI 等非 React Client。
- 需要明确 Method、Status、Header、Content Negotiation。
- 上传、下载、Streaming、Webhook Signature。
- 独立版本、OpenAPI、Rate Limit 和 API Gateway。
- GET/Cacheable Read Endpoint。

两者应复用同一个领域命令，而不是复制业务规则。

完整 Route Handler：

<<< ../../../examples/frontend/react-server-boundaries/enrollments-route.mts

它使用同一 Parser/Command，但返回标准 HTTP Status，并用 `revalidateTag(..., 'max')` 做后台刷新。Route Handler 的 JSON Body 与 FormData 是不同 Transport Contract，领域输入在解析后统一。

## 19. Server Function 安全清单

### Authentication 与 Authorization

每次调用验证 Session、Role、Tenant 和目标资源。`userId` 不应由客户端决定；从可信 Session 得到。

### 输入与输出

- 参数完全不可信，运行时校验长度、格式、枚举和关系。
- 显式允许可更新字段，防止 Mass Assignment。
- 返回最小 DTO，不返回 ORM Error、Stack、Secret、Token。
- 富文本在可信边界清洗，避免存储型 XSS。

### CSRF 与 Origin

框架通常限制 POST、比较 Origin/Host，并配合 SameSite Cookie，但反向代理、多域名和自托管配置必须验证。不要关闭 Origin 防护来“修复代理”；应正确设置 Forwarded Host 和 Allowed Origins。

### 闭包与 Secret

框架可能加密 Server Action 捕获的闭包值，但加密不是数据分类策略。不要捕获数据库对象、Token 或大对象并假设绝不暴露；重新从 DAL 读取可信状态，使用 Secret Manager，并把加密 Key 的多实例/多版本一致性纳入部署。

### Abuse Protection

Server Function Reference 不是授权令牌。仍需 Rate Limit、Body Size Limit、Timeout、审计、幂等、事务和异常流量告警。

### SSRF

不要根据客户端传入 URL 让服务器任意 Fetch。若业务必须代理资源，使用 Host Allowlist、协议限制、DNS/IP 检查、重定向限制和响应大小上限。

## 20. 缓存失效与一致性

把缓存看成数据系统，而不是性能开关：

```text
Mutation Commit
├─ Database Source of Truth
├─ Request Memo（请求结束自动失效）
├─ Framework Data/Component Cache（Tag/Path 失效）
├─ CDN Cache（Surrogate Key/TTL）
├─ Router Client Cache（Refresh/Revalidation）
└─ Browser HTTP Cache（Cache-Control）
```

只失效其中一层可能仍看到旧数据。框架 API 常会协调部分层，但 CDN、反向代理、外部 API 和自定义 Cache Handler 需要单独设计。

一致性策略要按产品需求选择：

- **Read-your-own-writes**：提交者必须立即看到新状态，用立即 Expire/定向 Refresh。
- **Eventual consistency**：公共目录允许短暂旧数据，用 SWR。
- **Strong inventory**：剩余名额最终由数据库事务决定，Cache 仅展示提示。
- **Permission change**：应快速失效，敏感读操作仍实时授权。

缓存中不要存未经隔离的用户敏感数据，也不要把负权限结果缓存过久。

## 21. Streaming 与 Hydration 的真实成本

RSC 可以减少发送到浏览器的组件代码，但并不保证页面自动更快：

- Server Data 瀑布可能增加 TTFB。
- RSC Payload 也有网络体积。
- Client Island 仍需下载、Parse 和 Hydrate。
- 过多细碎 Boundary 增加协议和调度成本。
- Edge 到数据库跨区域可能比 Node 同区更慢。

应测量：

- Server-Timing：Auth、DB、RSC Render、SSR Shell。
- HTML/RSC/JS 各自字节数。
- Shell 与每个 Suspense Boundary Reveal 时间。
- Hydration 长任务与 INP。
- Cache Hit/Miss/Stale/Revalidation。
- Server Function P50/P95、失败率与重复率。

不要只比较 Client Bundle 变小；若服务器查询从并行变串行，用户可能更慢。

## 22. Node、Edge 与多实例部署

### Runtime 能力

Node Runtime 可使用成熟数据库 Driver、文件系统和 Node Stream；Edge Runtime 启动快、离用户近，但通常只有 Web API、连接/CPU 限制不同。依赖原生模块或长连接的库不一定兼容 Edge。

### 数据库连接

Serverless 并发可能创建大量连接。使用 Provider Proxy/Pool、限制并发、复用安全的进程资源，并监控连接耗尽。

### 多实例

进程内 Session、Cache、Idempotency Set 在实例间不共享，也会随部署丢失。生产使用数据库/共享 KV/平台 Cache，或明确接受每实例语义。

### 滚动发布

旧页面可能持有旧 Build 的 Server Function Reference。框架和平台需要处理版本路由、加密 Key、一段时间内的旧 Asset/Action 可用性；否则部署瞬间提交会失败。客户端应提供安全重试/刷新，不可自动重放非幂等写入。

## 23. 错误、日志与可观测性

服务端错误至少记录：

- Request/Trace ID。
- Route/Action 标识与 Build Version。
- User/Tenant 的不可逆安全标识，而非原始 PII。
- Cache Status、DB Duration、外部依赖。
- Error Cause 与安全 Stack。

客户端只显示可行动、脱敏文案，通过 Digest/Request ID 关联支持系统。不要在 Server Function Result 返回 Stack。

Streaming 中 Shell Error 和 Boundary Error 不同：Shell 无法输出时返回完整错误响应；已输出 200 后局部 Boundary 失败，HTTP Status 已不能代表所有子树结果，必须依靠日志、Digest 和客户端 Error Boundary。

## 24. 测试策略

### 纯逻辑

测试 `parseEnrollmentForm/JSON`、DTO Projection、领域命令错误映射。特别断言 DTO 不含内部字段。

### Server Component

优先使用框架提供的集成测试或 E2E，因为 Async Component、RSC Payload、Directive 和 Bundler Boundary 不是普通 jsdom Render 能完整模拟的。

### Server Function

- 未登录、越权、对象不存在、售罄。
- 修改 Hidden Field 仍被拒绝。
- 重复/并发提交只产生一次领域写入。
- Cache Tag 只在 Commit 成功后失效。
- 未知异常不泄露内部消息。

### Boundary/E2E

- JS 未 Hydrate 时 Form 是否可提交。
- Loading → Stream Reveal → Hydration。
- Client Island 保留交互 State，Server Navigation 更新内容。
- 部署版本切换期间旧页面提交的恢复策略。
- 多用户/多 Tenant Cache 不串数据。

Mock 掉 `'use client'`/`'use server'` Directive 后的普通单测不能证明真实编译产物安全；需要分析 Client Manifest/Bundle，并在真实框架运行时测试。

## 25. 常见误区

### “加 `'use server'` 就是 Server Component”

错误。它把 Async Function 标为 Client 可调用的 Server Function。Server Component 通常没有 Directive。

### “Client Component 的子孙都是 Client Component”

模块 Import 子图会向 Client 扩散，但 Server 创建的 JSX 可以作为 Slot 穿过 Client Component。看模块图，不只看 Render Tree。

### “服务端代码不会泄露，所以可以传整个对象”

Server Module 源码不进浏览器，不代表它返回的数据不进 RSC Payload。DTO 必须显式最小化。

### “Server Function 不是 API，所以不用鉴权”

它就是可远程调用的网络入口。UI 不显示按钮、函数引用加密、TypeScript 类型都不是授权。

### “`cache()` 会永久缓存数据库查询”

React Cache 默认是请求期 Memo。跨请求缓存取决于框架/平台，生命周期和失效语义完全不同。

### “RSC 自动消除所有 Loading”

Data 仍需时间。RSC 把读取移到服务器并允许流式组合；仍要设计 Suspense、并行、Skeleton 和错误恢复。

### “所有组件都改 Server 就没有 JS”

交互 Island、Router Runtime、Analytics、第三方 Widget 仍可能需要 JS；组件边界过细也可能增加 RSC Payload。目标是恰当的 Server/Client 分工，不是指标竞赛。

## 26. 完整代码地图

本课示例采用 Next.js 16 风格文件，展示支持 RSC 的框架应承担的完整边界。它不是普通 Vite 项目可直接运行的目录，也没有修改根 `package.json`、Next 配置或部署配置。

```text
types / dto / contract
├─ repository + auth（server-only）
├─ request cache + cross-request cache
├─ enrollment command
│  ├─ Server Action
│  └─ Route Handler
└─ Route UI
   ├─ Server Page / Catalog / Instructor
   ├─ Client Shell / Enrollment Island
   ├─ Promise + use + Suspense Comments
   └─ loading / error / not-found
```

全部 21 个源码文件均已在本页逐文件展示，不依赖仓库跳转才能阅读完整实现。

## 27. 架构评审清单

1. 当前讨论的是 SSR、RSC、Hydration 还是 Server Function？
2. 框架是否正式支持对应 React 版本，底层 RSC 包是否锁定？
3. `'use client'` 是否位于最小交互叶节点，Client Bundle 增量多少？
4. Client Module 是否意外 Import Server-only 或大型依赖？
5. 跨边界 Props 是否可序列化、最小化且经过显式 DTO 投影？
6. ORM Entity、Secret、内部错误是否可能进入 RSC Payload？
7. 数据请求是否存在串行瀑布，是否应并行或 Suspense？
8. `cache()` 与框架 Cache 的 Scope 是否被混淆？
9. Cache Key 是否包含 Tenant/Locale/权限所需维度？
10. Mutation 后要求立即一致还是允许 SWR，Tag 是否精确？
11. 每个 Server Function 是否重新认证、授权、验证输入？
12. 重复/并发写入是否由数据库唯一约束和事务保护？
13. 外部 Client 是否需要稳定 Route Handler/API，而非 Server Function？
14. Node/Edge Runtime 是否兼容数据库与依赖？
15. 多实例的 Session、Cache 和幂等状态是否共享？
16. Streaming Error、Action Error 和 Client Error 是否分别监控？
17. 是否测试无 JS/Hydration 前提交和部署版本切换？

## 28. 官方资料

- [React Server Components](https://react.dev/reference/rsc/server-components)
- [React Server Functions](https://react.dev/reference/rsc/server-functions)
- [React `'use client'`](https://react.dev/reference/rsc/use-client)
- [React `'use server'`](https://react.dev/reference/rsc/use-server)
- [React `cache`](https://react.dev/reference/react/cache)
- [React `cacheSignal`](https://react.dev/reference/react/cacheSignal)
- [React `use`](https://react.dev/reference/react/use)
- [React DOM Server APIs](https://react.dev/reference/react-dom/server)
- [Next.js Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Next.js Data Security](https://nextjs.org/docs/app/guides/data-security)
- [Next.js `use cache`](https://nextjs.org/docs/app/api-reference/directives/use-cache)
- [Next.js Revalidating](https://nextjs.org/docs/app/getting-started/revalidating)

## 29. 本节小结

RSC、SSR 与 Server Function 解决不同问题：RSC 决定哪些组件模块不进入客户端，SSR 产生初始 HTML，Hydration 恢复客户端交互，Server Function 提供由框架承载的服务端调用边界。只有先分清产物与执行位置，`'use client'`、Streaming 和 Cache 才不会变成模糊口号。

Server/Client Boundary 同时是 Bundle、序列化和数据泄露边界；Server Function 同时是公开网络入口。可靠全栈 React 需要最小 DTO、集中数据访问、请求级与跨请求缓存分层、重新认证授权、幂等写入，以及对 Node/Edge、多实例和部署版本交叉的明确治理。

## 30. 下一节预告

下一节完成 React 模块：**React 大型应用架构、渐进迁移与生产治理**。将整合模块边界、状态与数据所有权、设计系统、微前端取舍、Vue 2/Vue 3 与 React 共存迁移、可观测性和发布策略。
