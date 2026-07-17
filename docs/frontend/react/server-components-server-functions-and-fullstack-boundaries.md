---
title: Server Components、Server Functions 与现代全栈边界
description: 区分 RSC、SSR、Hydration 与 Server Functions，掌握客户端边界、序列化、缓存、渐进增强、安全和框架职责
---

# Server Components、Server Functions 与现代全栈边界

> 资料基线：React 19.2。React Server Components 与 Server Functions 的应用层语义已稳定，但实现 RSC Bundler/Framework 的底层 API 仍不遵循 React 19.x 的 SemVer；业务应用应使用并锁定框架集成，不应自行拼装协议。

## 1. 学习目标

完成本节后，你应该能够：

- 严格区分 Server Component、SSR、Streaming、Hydration 与 Server Function。
- 解释 RSC Payload、HTML 和客户端 JavaScript 分别解决什么问题。
- 正确使用 `'use client'` 与 `'use server'`，并知道两者都不是“部署位置”注释。
- 把交互限制在最小 Client Island，避免意外扩大浏览器 Bundle。
- 设计 Server-to-Client 可序列化的 Props 与 Command/Result DTO。
- 用 Server Component 直接读取数据，同时避免 N+1、请求瀑布和缓存误解。
- 用 Server Function 处理变更、Action 状态、渐进增强与重新验证。
- 将所有 Server Function 参数视为不可信，并落实鉴权、授权、事务、幂等、CSRF 与输出安全。
- 理解 React `cache()` 的请求级去重边界，以及框架数据缓存的不同职责。
- 为 Node、Edge、连接池、冷启动、日志与可观测性选择正确运行时。
- 在测试中分别验证纯 Command、Server Adapter、Route/Framework Integration 与 E2E。

## 2. 五个概念，五个问题

| 概念 | 核心问题 | 浏览器收到什么 |
| --- | --- | --- |
| Server Component (RSC) | 哪些组件只能在服务器/构建环境执行？ | 组件树描述与序列化 Props；自身代码不进客户端 Bundle |
| SSR | 首次访问能否尽早看到 HTML？ | 预渲染 HTML |
| Streaming SSR | 不同区域能否按完成顺序抵达？ | Shell + Suspense 区域的分段 HTML |
| Hydration | HTML 如何重新获得事件交互？ | Client Component JS 与事件绑定 |
| Server Function | Client 如何触发可信服务器变更？ | 对函数引用的网络调用及序列化结果 |

它们常被框架一起使用，却不互为同义词。RSC 可以在构建时运行；SSR 可以没有 RSC；Server Function 不是每个 Server Component；Hydration 只适用于需要在浏览器运行的 Client Component。

```text
Request
  ├─ Server Components → RSC Payload（组件树、数据、Client 引用）
  ├─ SSR（可选）      → 初始 HTML
  └─ Browser
       ├─ 立即显示 HTML
       ├─ 下载 Client Component JS
       └─ Hydrate 需要交互的 Island
```

RSC 的价值不是“所有代码都在服务器”。它让非交互、依赖私有数据层或体积大的计算不进入浏览器，同时把交互部分保留为普通 React Client Component。

## 3. Server Component 默认，但不是“`use server`”

在 RSC 框架中，没有 `'use client'` 的组件默认是 Server Component。它可 `async/await`、访问数据库/文件系统/私有 Token，并且其模块不会发往浏览器。

`'use server'` 的含义完全不同：它标记可从客户端调用的异步 **Server Function**。React 官方明确指出：没有标记 Server Component 的 `'use server'` 指令。

### Server Component 的限制

- 不能注册 `onClick`、`onChange` 等浏览器事件。
- 不能使用 `useState`、`useEffect` 等客户端 Hook。
- 不会在浏览器内存中保持自身 State。
- 不能把数据库连接、Class 实例或普通函数作为 Props 传给 Client Component。

这不是劣势，而是边界。把数据读取、权限决定和静态呈现留在服务器；只把真正交互的叶子做成 Client Component。

## 4. `'use client'` 是模块图切分点

`'use client'` 必须位于模块最顶部。标记一个文件后，该文件及其静态 Import 的客户端模块子树会被打入浏览器 Bundle；它不是“这个组件在客户端渲染一次”的开关。

一个很小的 Button 边界：

<<< ../../../examples/frontend/react-server-components-boundaries/SubmitButton.tsx

一个有本地 State 的 Island：

<<< ../../../examples/frontend/react-server-components-boundaries/ClientFilters.tsx

常见错误是把顶层 Page 标成 `'use client'`，随后数据库 SDK、Markdown Parser、权限库和所有子组件都无法留在服务器。Client Boundary 应靠近需要 State、Effect、浏览器 API 或事件的叶子。

Server Component 能渲染并向 Client Component 传递 JSX `children`。这不是 Client Component “导入 Server Component”；真正的 Server 渲染发生在边界外，Client 只接收已解析的元素描述。

## 5. 跨边界的是协议，不是 TypeScript 幻觉

领域类型：

<<< ../../../examples/frontend/react-server-components-boundaries/types.ts

Server → Client Props 必须可序列化。React 19 支持 Primitive、Array/Map/Set、Date、TypedArray、Plain Object、Promise、Server Function 与 JSX Element 等特定值；不支持普通函数、任意 Class 实例、Null Prototype Object、局部 Symbol 和事件对象。

因此 Props 应是明确 DTO：

```ts
// ✅ 可跨边界的投影
{ id: lesson.id, title: lesson.title, seatsRemaining: lesson.seatsRemaining }

// ❌ 不要跨边界
{ lessonEntity, db, currentUser, onEnroll: () => ... }
```

TypeScript 不能证明某对象实际可被 RSC 序列化。数据库 ORM Entity 即使结构上像 Object，也可能含 Lazy Getter、循环引用、Class 原型或敏感字段。转换为 Public Projection 是安全和稳定性的共同边界。

## 6. 一个完整的 Server/Client 组合

Server 呈现的摘要：

<<< ../../../examples/frontend/react-server-components-boundaries/LessonSummary.tsx

默认 Server Page：

<<< ../../../examples/frontend/react-server-components-boundaries/LessonPage.tsx

Page 等待主要课程数据后，传递最小 Primitive Props 给报名 Island。`commandToken` 是请求进入框架时创建的幂等 Token；不要在 React Render 中用随机数生成它，因为 Render 可以重试。

```text
Server Page
├─ LessonSummary           Server：数据、HTML、无客户端代码
├─ EnrollmentForm          Client：Form 状态、Pending、事件
│  └─ SubmitButton         Client：读取 Form 状态
└─ ClientFilters           Client：本地展开状态
   └─ <p>children</p>      Server 已渲染的元素内容
```

这是一条实用规则：**Server 管读取与组合，Client 管局部交互，Server Function 管写入。** 规则不是绝对架构法，但能避免大多数边界泄漏。

## 7. 数据读取、并行与瀑布

Server Component 可以直接读取数据，不需要为浏览器先造一层 JSON API：

```tsx
export default async function Page({ id }: { id: string }) {
  const lesson = await getLesson(id)
  return <LessonSummary lesson={lesson} />
}
```

这减少浏览器往返和客户端 Waterfall，但并不自动消灭服务器瀑布：

```ts
// 串行：第二个请求依赖第一个结果时才合理
const lesson = await getLesson(id)
const author = await getAuthor(lesson.authorId)

// 无依赖时并行启动
const [lesson, recommendations] = await Promise.all([
  getLesson(id),
  getRecommendations(id),
])
```

列表中逐项 `await getAuthor()` 可能产生 N+1；应使用 Batch Query、DataLoader/Repository Batch API，或一次查询投影。数据靠近组件不等于每个组件各自触发无限数据库查询。

## 8. `cache()` 只是请求级记忆化

服务器 Repository：

<<< ../../../examples/frontend/react-server-components-boundaries/server/lesson-repository.mts

`cache(fn)` 以参数为 Key 复用同一次 Server Request/Render 中的结果。它的关键边界：

- React 会在每个服务器请求时使所有 `cache()` 结果失效。
- 必须在模块级只创建一次同一个 Memoized Function；每次调用 `cache(fn)` 都是新缓存。
- 同参数抛出的 Error 也会被缓存。
- Object 参数按引用浅比较，优先传 Primitive ID。
- 它只适用于 Server Components，不是浏览器 Cache，也不是 Redis/CDN/数据库查询缓存。

框架 Data Cache 的寿命可能跨请求、跨部署甚至跨区域；HTTP Cache 由 URL/Header 控制；CDN 缓存的是响应。这三者与 React `cache()` 的失效模型不同，必须在设计文档中分别命名。

缓存前先确定正确性：用户私有数据、权限、Locale、Cookie、Feature Flag 是否构成 Cache Key；Mutation 后哪个 Tag/Path/Query 需要失效；过期窗口是否允许用户看到旧值。

## 9. Server Function 是网络写接口

`'use server'` 必须位于文件或 async 函数最顶部。框架把导出的 Server Function 编译为服务器引用；Client 调用它会发起网络请求，不是直接跨进程调用。

Runtime 契约：

<<< ../../../examples/frontend/react-server-components-boundaries/server/runtime.mts

框架 Bootstrap Adapter：

<<< ../../../examples/frontend/react-server-components-boundaries/framework-bootstrap.mts

真实框架应在这里连接请求级 Session、ORM/Repository、事务、日志/Trace 与 Tag/Path Invalidator。示例中的 `throw` 是刻意的：它强调这些能力由框架和部署环境提供，不能在普通 Vite 客户端项目里凭空出现。

Server Function：

<<< ../../../examples/frontend/react-server-components-boundaries/actions.mts

它把业务结果建模为可序列化 State，而把未知异常收敛为通用错误。Server Function 适合改变服务器状态；React 官方不建议把它当作数据读取 API，框架通常也不会按查询缓存其返回值。

## 10. Form Action、`useActionState` 与渐进增强

Client Form：

<<< ../../../examples/frontend/react-server-components-boundaries/EnrollmentForm.tsx

Action State 类型：

<<< ../../../examples/frontend/react-server-components-boundaries/action-state.ts

当 Server Function 作为 `<form action>` 使用时，React 把调用纳入 Transition；`useActionState` 返回上次 State、可传给 Form 的 Action 和 Pending。提交成功后非受控字段会重置，因此错误路径应返回足够 State 来重建 UI。

`useActionState(serverAction, initial, permalink)` 的第三个参数可用于 JavaScript 尚未 Hydrate 前的表单提交重放/跳转。真正的无 JS 渐进增强需要框架把 Server Function 映射为可处理的 HTTP POST，并在目标 URL 渲染同一 Form/Action 身份；仅在普通 SPA 写 `'use server'` 不会自动得到这种能力。

若在 Button Click 中调用 Server Function，应放在 `startTransition` 中；直接作为 Form Action 时 React 自动处理 Transition。

## 11. Command 输入与授权：隐藏字段不可信

Command 解析：

<<< ../../../examples/frontend/react-server-components-boundaries/validation.ts

Action 没有从 `FormData` 信任 `lessonId`，而是通过 `bind(null, lessonId)` 使用服务器渲染时已知的 ID。即便如此，任何来自 Client 的 Argument、Hidden Input、Cookie、URL 和 Server Function 调用都应视为不可信。

每个 Server Function 必须执行：

1. 认证：请求是否有有效 Session？
2. 授权：此用户能否对该 Lesson 执行该操作？
3. 输入解析：类型、长度、枚举、File、跨字段规则。
4. 事务内的当前状态检查：容量、版本、库存、所有权。
5. 幂等：重复请求返回同一业务结果，而非重复写入。
6. 输出投影：不返回内部 Entity、Stack、Secret 或他人数据。

不要因函数源码在服务器就放松授权。Server Function 是可被浏览器直接请求的公开写入口；UI Disabled、隐藏按钮和 Route Guard 都不是安全控制。

## 12. Mutation 后一致性

`runtime.enroll()` 的数据库实现应在一个事务内完成：

```text
验证 Session/权限
→ 读取课程当前状态（必要时加锁/乐观版本检查）
→ 检查容量与已报名状态
→ 用 (userId, idempotencyKey) 或业务唯一约束去重
→ 写入报名与容量变化
→ Commit
→ 失效受影响 RSC/数据缓存
```

失效必须发生在成功 Commit 后。若先失效后事务回滚，用户可能读到不一致投影；若写入成功但没有失效，用户会一直读旧 Cache。可靠的跨系统副作用（邮件、队列）还需要 Outbox/可靠消息模式，不能用一次 Server Function 调用假定全都原子成功。

重新验证 API（Path、Tag、Route、Query）是框架特性，名称不能跨框架照抄。设计时把“失效什么数据、何时重新读、用户何时看到新值”写成领域契约。

## 13. CSRF、XSS 与敏感数据

### CSRF

Cookie Session 会随同源/部分跨站请求自动携带。Server Function 仍需框架提供的 Origin/Host 检查、SameSite Cookie、CSRF Token 或同等策略；不能因为调用形式像函数就忽略 CSRF。

### XSS

React 对普通文本插值转义，但富文本、URL、文件名和 `dangerouslySetInnerHTML` 仍需在可信边界清洗。不要把 Server Component 当 XSS 防护层。

### Secret 泄漏

- 不把服务器环境变量、数据库 Client、内部错误或完整 User Entity 传到 Client。
- 使用 `server-only` 或框架等价编译期边界保护服务器模块。
- 所有 Public DTO 最小化。
- 日志脱敏 Token、Cookie、密码、支付信息和原始 FormData。

React 有实验性 Taint API 试图阻止敏感 Object/Unique Value 穿越边界，但不能作为当前稳定安全模型。

## 14. 错误、Suspense 与流式展示

Server Component 可在 Render 时 Suspend。把页面的 Reveal Sequence 设计为：

```text
立即：导航、标题、关键课程信息
随后：推荐/评论的 Suspense Skeleton
失败：最近 Error Boundary 的可恢复页面级反馈
```

不要用一个根级 Suspense 替代整页已有内容。已显示内容在 Transition 中再次 Suspend 时，React 尽量保留旧界面；新 Boundary 仍会显示自己的 Fallback。

错误分层：

- 领域可恢复错误（名额已满）：Action State/字段信息。
- Route 不存在：404 Boundary。
- 权限不足：登录/403 流程，不能透露资源存在性。
- 基础设施异常：Error Boundary + 服务端日志/Trace ID。

Error Boundary 给用户稳定文案；服务器日志保存 Request ID、Route、用户匿名 ID、依赖耗时和安全处理后的错误原因。

## 15. Node、Edge 与部署现实

RSC 不要求特定运行时。选择 Node/Edge 时看依赖和数据位置：

| 维度 | Node Runtime | Edge Runtime |
| --- | --- | --- |
| Node 原生模块/大型 ORM | 通常可用 | 常不可用或受限 |
| 冷启动/就近执行 | 因平台而异 | 常有优势 |
| 数据库连接 | 注意连接池/Proxy | 通常需 HTTP/Edge 兼容 Driver |
| 长任务/二进制处理 | 较适合 | 常有时限/内存限制 |
| 区域一致性 | 依部署 | 必须明确读写主区域与缓存传播 |

不要只因为“Edge 很快”把所有 Server Function 移过去。测量用户位置、数据源位置、P95 冷启动、连接数、序列化大小和缓存命中率后决定。

## 16. 测试 RSC 架构

测试层级应与边界对应：

- `parseEnrollmentCommand`：纯单元测试非法 Token、边界长度与信任 ID。
- Repository/Transaction：集成测试真实数据库或隔离数据库，验证容量、授权和幂等唯一约束。
- Server Function：注入/装配 Runtime Fake，验证 State 映射、失效调用和不泄漏内部错误。
- Framework Route：集成测试 RSC Render、Suspense、Cookie/Session、Cache Revalidation。
- E2E：真实浏览器提交后刷新/新标签页仍看到持久化结果。

RSC 依赖框架编译器和协议，不能只用 jsdom Render 一个 async Server Component 就宣称验证了系统。优先使用所选框架提供的 Route/Server Function 测试方案。

## 17. 采用决策

适合评估 RSC 的信号：

- 首屏有大量非交互内容与私有数据读取。
- Client Fetch Waterfall 和 Bundle 体积明显影响体验。
- 团队愿意采用完整框架、Route Convention、Cache 与部署模型。
- 服务端/客户端边界能由同一团队共同维护。

暂不适合强推的信号：

- 现有纯客户端 SPA 数据层成熟，收益有限。
- 大量实时离线交互、复杂本地优先数据模型。
- 团队无法承担框架升级、缓存调试和服务器可观测性。
- 运行时依赖无法在目标 Server/Edge 环境执行。

RSC 不是迁移 Vue 2/React SPA 的默认下一步。先用 Route Data、SSR、代码分割、服务器 API 和缓存解决已测量的问题；需要跨边界的组件级数据读取与 Bundle 收益时再引入。

## 18. 常见误解

### “Server Component 每次请求都会渲染 HTML”

不一定。它可能在构建时、请求时、缓存命中时运行；RSC Payload 与 HTML SSR 是两个产物。

### “`use client` 让整个页面只能客户端渲染”

它标记模块子树，不阻止服务器对 Client Component 生成初始 HTML。它主要决定客户端 Bundle 与可用 API。

### “Server Function 不需要 API 安全”

错误。它是网络入口，参数可被伪造，必须认证、授权、验证和限流。

### “`cache()` 等同 Redis”

错误。React `cache()` 默认每个 Server Request 失效，只解决一次 Render 内重复工作。

### “RSC 使所有 Fetch 消失”

浏览器仍可能 Fetch JS、图片、Client Query、第三方 API；服务器也可能访问数据库/服务。RSC 改变的是谁在何处读取以及哪些代码进 Bundle。

## 19. 决策清单

1. 此组件需要 State、Effect、浏览器 API 或事件吗？需要才加 `'use client'`。
2. Client Boundary 是否已尽可能靠近交互叶子？
3. 所有跨边界 Props/返回值是否是最小可序列化 DTO？
4. 是否误把 `'use server'` 当作 Server Component 标记？
5. 数据读取是否并行化，是否存在 N+1？
6. `cache()` 是否只用于同请求去重，跨请求 Cache 是否另有设计？
7. 每个 Server Function 是否认证、授权、验证、事务和幂等？
8. Hidden Field/Client Argument 是否被当作不可信输入？
9. Mutation Commit 后失效哪些 Tag/Path/Query？
10. CSRF、Rate Limit、审计日志和 Secret 脱敏在哪里实现？
11. Suspense/Error Boundary 是否符合用户可接受的 Reveal/恢复顺序？
12. Node/Edge 是否与 ORM、连接、区域和任务时限相容？
13. 是否由框架负责 RSC 编译、Payload、Streaming、Hydration 与部署？
14. 是否有跨刷新、跨标签页的 E2E 来证明写入和失效？

## 20. 官方资料

- [React Server Components](https://react.dev/reference/rsc/server-components)
- [React Server Functions](https://react.dev/reference/rsc/server-functions)
- [React `'use client'`](https://react.dev/reference/rsc/use-client)
- [React `'use server'`](https://react.dev/reference/rsc/use-server)
- [React `cache`](https://react.dev/reference/react/cache)
- [React `use`](https://react.dev/reference/react/use)
- [React `<Suspense>`](https://react.dev/reference/react/Suspense)
- [React `useActionState`](https://react.dev/reference/react/useActionState)

## 21. 下一节预告

React 模块至此形成完整闭环。下一阶段进入 **浏览器与网络**：从事件循环、任务队列、渲染流水线与输入响应开始，建立后续网络、缓存、性能与安全课程的共同底座。
