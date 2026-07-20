---
title: Server Components、Server Functions 与现代全栈边界
description: 从执行位置、模块图与网络协议出发，理解 RSC、SSR、Client Boundary、缓存、Mutation、安全和框架职责
outline: deep
---

# Server Components、Server Functions 与现代全栈边界

> 资料基线：React 19.2 与 Next.js 16 Cache Components。React Server Components 和 Server Functions 的应用层语义已稳定，但框架/打包器实现 RSC 的底层 API 不遵循 React 19.x Minor SemVer。普通 Vite SPA 不能靠添加 `'use client'` 或 `'use server'` 获得 RSC，必须使用并锁定明确支持它的框架版本。

“这段代码在服务端”在现代 React 中可能指很多不同事情：服务器生成 HTML、Server Component 不进入浏览器、Server Function 接收一次远程调用，或者 CDN 返回缓存结果。如果不先分清产物和执行位置，`'use client'`、Streaming 与 Cache 很快会变成模糊口号。

本课先拆开概念，再沿一条完整链路组织它们：

```text
请求进入框架
  → Server Components 读取并投影数据
  → 产生 RSC Payload
  → 可选 SSR/Streaming 生成初始 HTML
  → 浏览器下载 Client Component JS 并 Hydrate
  → 用户通过 Form 调用 Server Function
  → 服务端重新认证、授权、事务写入并失效缓存
```

## 先拆开六个容易混淆的概念

| 概念 | 主要执行位置 | 主要产物 | 浏览器是否执行同一组件逻辑 |
| --- | --- | --- | --- |
| CSR | 浏览器 | DOM | 是 |
| SSR | 服务端先执行，浏览器 Hydrate | HTML + JS | 通常是 |
| Streaming SSR | 服务端分段输出 | HTML Stream + JS | 通常是 |
| Server Component | RSC 环境 | RSC Payload / 组件结果 | 否 |
| Client Component | 可参与预渲染，最终进浏览器 | JS + 可 Hydrate HTML | 是 |
| Server Function | 服务器 | Mutation/远程调用结果 | 浏览器只有函数引用 |

最重要的结论是：RSC 不等于 SSR。

- RSC 回答“哪些组件模块和依赖不发给浏览器”；
- SSR 回答“初始 HTML 在哪里产生”；
- Hydration 让初始 HTML 中的 Client Component 获得事件与 State；
- Server Function 让客户端通过框架协议触发服务器异步函数。

框架可以先执行 Server Component 生成 RSC Payload，再把组合树 SSR 为 HTML。后续客户端导航还可能只交换 RSC Payload，而不是整份 HTML。

## Server Component 是一种执行环境，不是指令

在支持 RSC 的框架 Server Tree 中，没有 `'use client'` 的组件通常作为 Server Component。它可以：

- 在构建期或每次请求中执行；
- 写成 Async Component，直接 Await 数据；
- 访问数据库、文件、私有内部服务；
- Import 不需要进入浏览器的解析器和服务端依赖；
- 返回普通 JSX，并组合 Client Component。

它不能持有浏览器交互 State、运行 Effect、注册 `onClick`，也不能读取 `window`、DOM 或 LocalStorage。

React 没有标记 Server Component 的 `'use server'` 指令。`'use server'` 标记的是可以从客户端远程调用的 Server Function。把二者混为一谈，会同时误判 Bundle 和安全边界。

## `'use client'` 切分的是模块图

```tsx
'use client'

import { useState } from 'react'
```

Directive 必须位于文件顶部。Server Module 导入这个文件时，框架把它识别为 Client Boundary；该文件的静态 Import 子图也进入客户端可执行模块。

```text
Server page.tsx
├─ data.mts              只在服务端
├─ InstructorCard.tsx   只在服务端
└─ Editor.tsx           'use client'
   ├─ editor-library    进入 Client Bundle
   └─ toolbar.tsx       进入 Client Bundle
```

所以不要为了一个按钮把 Page 或 Layout 整体标成 Client Component。边界应尽量靠近真正需要 State、Effect、浏览器 API 与事件的叶子。

### Client Component 也可能在服务端预渲染

`'use client'` 不表示“服务器永远不执行它”。框架可以在初次请求中预渲染 Client Component 的 HTML，随后浏览器下载代码并 Hydrate。它表示该模块拥有客户端运行能力并进入客户端依赖图。

### Render Tree 与 Module Graph 不是同一棵树

Client Module 不能直接 Import `server-only` Repository，但 Server Component 可以先创建 Server JSX，再把结果通过 `children` 或 Slot 传给 Client Component。

Client Shell：

<<< ../../../examples/frontend/react-server-boundaries/InteractiveShell.tsx

Server-only 卡片：

<<< ../../../examples/frontend/react-server-boundaries/InstructorCard.tsx

Page 可以这样组合：

```tsx
<InteractiveShell sidebar={<InstructorCard />}>
  <ServerRenderedArticle />
</InteractiveShell>
```

Shell 只收到 `ReactNode`，没有 Import Instructor Module，因此讲师数据访问逻辑不会被拖进 Client Bundle。Client Shell 管开关交互，Server Component 管敏感读取与静态呈现。

## 跨边界的是协议，不是 TypeScript 类型幻觉

Server Component 给 Client Component 传 Props 时，RSC 协议负责序列化。它支持的值比 JSON 多，包括 Primitive、Date、Map、Set、TypedArray、Plain Object、Promise、Server Function Reference 和 JSX Element。

普通函数、自定义 Class Instance、ORM Entity、数据库连接、非全局 Symbol 和事件对象不能直接穿过边界。Server Function 参数/返回值的序列化集合又与 Client Props 略有区别，例如客户端不能把任意 JSX 作为 Server Function 参数。

即使协议支持 Date 或 Map，业务 DTO 仍优先使用结构简单、显式版本化的 Plain Object。

内部记录与公开类型：

<<< ../../../examples/frontend/react-server-boundaries/types.ts

显式 DTO 投影：

<<< ../../../examples/frontend/react-server-boundaries/dto.ts

`LessonRecord` 中的 `ownerId` 和 `internalCostNotes` 不应进入浏览器。安全流程应是：

```text
Database Record
  → Authentication / Authorization
  → Explicit Allowlist Projection
  → RSC Serialization
  → Client Props
```

不要先 `{ ...record }` 再删除几个字段。数据库新增字段时，这种 Blocklist 很容易默认泄露。TypeScript `Pick` 也只约束编译期；运行时必须真正构造新对象。

### `server-only` 是构建护栏，不是数据脱敏

服务端模块导入 `server-only` 后，兼容框架会在 Client Module 误 Import 时构建失败。本课的 Repository、Auth 与 Data Module 都使用它。

它只能阻止错误模块依赖，不能替代 DTO、资源授权、Secret Manager 和输出校验。Server Module 源码不进浏览器，不代表它返回的数据不会进入 RSC Payload。

## Data Access Layer 集中可信读取与写入

演示 Repository：

<<< ../../../examples/frontend/react-server-boundaries/repository.mts

认证边界：

<<< ../../../examples/frontend/react-server-boundaries/auth.mts

示例用内存 Map 保持代码自包含，并使用 `__Host-session` 演示更严格的 Cookie 命名约束。生产中必须替换为真正的 Session Store、数据库事务和共享唯一约束；进程内 Map 在多实例间不一致，也会随部署消失。

一个可信 DAL 通常负责：

- 从当前 Request 读取 Session，不信任客户端 `userId`；
- 对目标实体做 Object-level Authorization；
- 只查询所需字段并投影 DTO；
- 统一 Timeout、审计和错误分类；
- 让 Page、Server Function 与 Route Handler 复用同一个领域命令。

不要只在 Layout 判断一次登录。深层 Route、Server Function、Route Handler 和并行 Route 都可能独立进入系统，每个敏感操作必须在执行点重新授权。

## Async Server Component 减少客户端往返，但不消灭瀑布

```tsx
export default async function Page() {
  const lesson = await getLesson()
  return <Article lesson={lesson} />
}
```

数据读取不再等 Client Mount 后的 Effect，浏览器也不需要先下载请求逻辑。但服务器仍可能串行等待：

```text
await session
  → await lesson
    → Render child
      → await comments
```

无依赖请求应尽早启动并用 `Promise.all` 等待；有先后依赖的查询保持串行。列表逐项查询作者会形成 N+1，应通过批量 Query、DataLoader 或 Repository Batch API 解决。

并行也不是越多越好。数据库连接池、外部 API Rate Limit 和内存都有上限。重点内容可以先 Await，次要内容用 Suspense 分段 Reveal。

## React `cache()` 只做请求期 Memo

请求 Data Module：

<<< ../../../examples/frontend/react-server-boundaries/lesson-data.mts

`cache(fn)` 让同一 RSC 请求/渲染中，相同参数的调用复用同一结果或 Promise，适合 Page、Metadata 和子组件读取一致实体快照。

它的边界必须说清：

- React 会在每个 Server Request 后失效所有 Memoized Cache；
- 每次 `cache(fn)` 都创建新缓存，应从共享 Module 导出同一函数；
- 参数浅比较，优先传 Primitive ID；
- 同参数抛出的 Error 也会缓存并再次抛出；
- 它不是 Redis、CDN、浏览器 Cache 或永久数据库缓存；
- `cacheSignal()` 可把 React 不再需要当前 Cache 工作的取消信号传给支持取消的 Repository/Fetch。

不要用它缓存跨用户隐私数据并误以为会跨请求复用；它解决的是一次 Server Render 内的重复读取。

## 跨请求缓存是框架/平台能力

本课采用 Next.js 16 的 Cache Components 模型，项目需启用 `cacheComponents`。React 本身并不定义下面这些 Next API。

缓存目录函数：

<<< ../../../examples/frontend/react-server-boundaries/cached-catalog.mts

目录 Page：

<<< ../../../examples/frontend/react-server-boundaries/catalog-page.tsx

`'use cache'` 可以标记 Async Function、Component 或文件；`cacheLife('hours')` 描述生命周期，`cacheTag('published-lessons')` 建立领域失效索引。默认 Cache Handler 可能只是进程内存，多实例共享依赖平台或自定义 Handler。

每个跨请求 Cache 都要回答：

1. Key 包含哪些 Tenant、Locale、权限、Query 和 Version？
2. 用户可接受陈旧多久？
3. Scope 是单请求、单用户、单进程、区域还是全球？
4. 哪个领域事件失效它，失效失败怎样恢复？

Cookies、Headers 等 Request Runtime Data 通常不能直接进入公共 Cache Scope。应先在外部读取，传入真正属于 Key 的最小值，或采用框架明确的 Private Cache 模型。Next 16 Cache Components 当前要求 Node Runtime，不能把本课 `use cache` 示例直接搬到 Edge。

## Promise、`use()` 与 Suspense 组织次要内容

Client 评论组件：

<<< ../../../examples/frontend/react-server-boundaries/Comments.tsx

Server Wrapper 启动 Promise，但不在这里 Await：

<<< ../../../examples/frontend/react-server-boundaries/CommentsSection.tsx

```text
Server 创建并缓存 commentsPromise
  → Promise 穿过 RSC Props
  → Client Component 用 use(promise) 读取
  → Pending 激活最近 Suspense Fallback
  → Resolve 后流式或客户端恢复评论
```

Promise 必须由支持 RSC/Suspense 的框架数据流稳定提供。Client Render 中每次创建新 Promise 会重复等待并产生警告。`use()` 可以在条件或循环中调用，但仍只能处于 Component/Hook 中；Reject 会抛给最近 Error Boundary。

## 一张 Page 怎样组合完整边界

Server Page：

<<< ../../../examples/frontend/react-server-boundaries/page.tsx

它依次完成：

1. Await 框架提供的 Params；
2. 从 Request Memo 读取公开课程 DTO；
3. 不存在时进入 `notFound()` 控制流；
4. 把 Primitive 课程 ID 交给最小 Client Island；
5. 把 Server Instructor JSX 作为 Slot 交给 Client Shell；
6. 用 Suspense 让次要评论独立 Reveal。

Client Bundle 不包含 Repository、Cookie Session、内部成本字段和 Instructor Server Module。

Route Loading：

<<< ../../../examples/frontend/react-server-boundaries/loading.tsx

Error Boundary 为了提供重试按钮，必须是 Client Component：

<<< ../../../examples/frontend/react-server-boundaries/error.tsx

Not Found：

<<< ../../../examples/frontend/react-server-boundaries/not-found.tsx

404、预期业务失败和 500 不应显示同一根级 Spinner。Boundary 位置决定 Streaming Reveal、错误隔离和 Retry 范围。生产错误 Message 可能被框架脱敏，应通过 Digest/Request ID 关联服务端日志，不向用户回显 Stack、SQL 或 Secret。

## Server Function 本质上是公开远程入口

`'use server'` 可以写在 Async Function Body 顶部，也可以位于 Module 顶部，把该模块导出的 Async Function 标成 Server Function。框架生成 Server Reference；客户端调用时会发网络请求、序列化参数并执行服务器函数。

它不是本地调用，也不是秘密内部函数。攻击者可以重放请求、修改参数、并发调用和使用旧页面持有的 Reference。

解析 Contract：

<<< ../../../examples/frontend/react-server-boundaries/action-contract.ts

统一领域命令：

<<< ../../../examples/frontend/react-server-boundaries/enrollment-command.mts

可信流程是：

```text
Untrusted FormData / Serialized Args
  → Runtime Parse
  → Authenticate Current Request
  → Authorize Role、Tenant 与目标资源
  → Transaction + Unique Constraint
  → Minimal Result
  → Cache Invalidation + Audit
```

隐藏字段 `lessonId` 仍由客户端控制。示例明确区分未登录 401 与已登录但无权限 403，并只捕获确定的认证错误；数据库或框架异常不能被误装成“请登录”。

示例用 `(userId, lessonId)` 表达重复报名的领域唯一键。生产必须使用数据库 Unique Index/Transaction；按钮 Disabled 和单进程 Set 不是并发保证。

## Server Action 把 Mutation 接入 Form 状态

Action Module：

<<< ../../../examples/frontend/react-server-boundaries/actions.mts

它先解析输入，每次调用重新读取 Session，通过领域命令执行写入，再把可预期错误映射成安全状态。未知异常只在服务端记录细节，客户端得到通用文案。

Submit Button：

<<< ../../../examples/frontend/react-server-boundaries/SubmitButton.tsx

Client Island：

<<< ../../../examples/frontend/react-server-boundaries/EnrollmentIsland.tsx

Island 只负责 `useActionState`、`useFormStatus` 和 Status/Alert。认证、授权、库存与原子写入全部留在服务器。

支持的框架还能让 Server Function Form 在 JavaScript 尚未 Hydrate 时提交，并在 Hydration 后恢复 Action State。具体渐进增强、Permalink 和队列行为应以框架版本为准。

Server Functions 主要为 Mutation 设计，不推荐当普通查询 RPC；框架通常不会缓存其返回结果。读取优先放在 Server Component、Loader、Route API 或 Query Layer。

## 写入后到底怎样看到新数据

Next.js 16 Cache Components 区分两种常见语义：

- `updateTag(tag)` 只能用于 Server Action，立即 Expire，适合提交者 Read-your-own-writes；
- `revalidateTag(tag, 'max')` 使用 Stale-while-revalidate，适合允许短暂陈旧的公共目录。

Action 示例报名后调用 `updateTag`。不要清空所有 Cache；过度失效会制造数据库洪峰，Tag 应对应领域实体或集合。

缓存不只有一层：

```text
Mutation Commit
├─ Database Source of Truth
├─ React Request Memo（请求结束自动失效）
├─ Framework Data/Component Cache
├─ Router Client Cache
├─ CDN / Reverse Proxy
└─ Browser HTTP Cache
```

框架只协调其中一部分。公共目录可接受 SWR，提交者可能需要立即一致；名额展示可以缓存，真正库存判断必须回到数据库事务；权限变更应快速失效，敏感读取仍需实时授权。

## Server Function 与 Route Handler 不互相替代

Server Function 适合只由同一 React UI 调用、希望与 Form、Pending、RSC Refresh 和 Cache 深度结合的 Mutation。

Route Handler/API 更适合：

- Mobile、第三方、Webhook 和 CLI；
- 明确 Method、Status、Header 与 Content Negotiation；
- 上传、下载、Streaming 和 Webhook Signature；
- 独立版本、OpenAPI、Rate Limit 与 API Gateway；
- 可缓存 GET Read Endpoint。

两者应复用同一领域命令，而不是复制权限和业务规则。

Route Handler：

<<< ../../../examples/frontend/react-server-boundaries/enrollments-route.mts

它解析 JSON，复用报名命令，用 401/403/404/409 表达不同错误，并使用 `revalidateTag(..., 'max')` 刷新公共目录。Transport Contract 不同，授权和领域不变量相同。

## 全栈边界还需要哪些安全约束

### CSRF 与 Origin

框架通常限制 POST、比较 Origin/Host 并结合 SameSite Cookie。反向代理、多域名和自托管必须正确配置 Forwarded Host/Allowed Origins，不能为了“请求能通”关闭来源检查。

### Mass Assignment 与输出最小化

只接收允许字段，重新从 Session 获取用户身份。返回 DTO，不返回 ORM Error、Stack、Token 或数据库对象。富文本需要可信 Allowlist Sanitization。

### Server Function 闭包

框架可能加密 Action 捕获值，但加密不是数据分类策略。不要捕获数据库连接、Token 或大对象；执行时重新从 DAL 读取可信状态，多实例还要共享正确的加密 Key/版本配置。

### Abuse、SSRF 与资源上限

Server Reference 不是授权令牌。仍需 Rate Limit、Body Size、Timeout、审计和异常流量告警。若服务器根据客户端 URL Fetch，必须限制协议和 Host、检查 DNS/IP、限制 Redirect 与响应大小。

## Streaming 与 RSC 不保证页面自动更快

RSC 可以减少客户端 JavaScript，却可能引入新的成本：

- Server Data 瀑布增加 TTFB；
- RSC Payload 本身有网络体积；
- Client Island 仍要下载、Parse 与 Hydrate；
- 过多细碎 Boundary 增加协议和调度成本；
- Edge 到远程数据库可能比 Node 同区更慢。

应同时测量 Server-Timing、HTML/RSC/JS 字节、Shell 和 Boundary Reveal、Hydration Long Task、INP、Cache Hit/Miss 以及 Server Function P95/失败率。Bundle 变小但数据库查询串行，用户仍可能更慢。

## Node、Edge、多实例与滚动发布

Node Runtime 有成熟数据库 Driver、文件系统和 Node Stream；Edge 靠近用户，但 API、CPU、连接和原生依赖限制不同。本课的 Next 16 Cache Components `use cache` 需要 Node Runtime。

Serverless 并发可能耗尽数据库连接，应使用连接代理/Pool、限制并发并监控。Session、Cache 和幂等集合放在进程内不会跨实例共享，也会在冷启动/部署后消失。

滚动发布时，旧页面可能持有旧 Build 的 Server Function Reference。平台需要处理版本路由、Action 加密 Key 和旧 Asset 可用窗口。客户端可提供安全刷新/重试，但不能自动重放非幂等写入。

服务端日志至少应关联 Request/Trace ID、Route/Action、Build Version、脱敏 User/Tenant 标识、Cache 状态、数据库耗时和 Error Cause。Streaming 已经输出 200 后，局部 Boundary 失败无法再由 HTTP Status 完整表达，更依赖日志、Digest 和客户端 Error Boundary。

## 怎样验证真实 RSC 架构

纯逻辑可以直接测试：

- Form/JSON Parser 的格式边界；
- DTO 不包含内部字段；
- 命令对未登录、越权、不存在和售罄的映射；
- 重复提交的领域结果。

Server Component、Directive、RSC Payload 和 Bundler Manifest 不是普通 jsdom Render 能完整模拟的，应使用框架集成测试或 E2E：

- Client Manifest 中没有 Repository 和 Secret 依赖；
- JS 未 Hydrate 时 Form 能按产品要求提交；
- Loading → Streaming Reveal → Hydration；
- Client Island State 与 Server Navigation 正确协作；
- Mutation Commit 后才失效正确 Tag；
- 多用户/Tenant Cache 不串数据；
- 部署版本切换期间旧页面提交有安全恢复策略。

Mock 掉 `'use client'`/`'use server'` 后的普通单测，只能验证内部函数，不能证明真实编译产物与网络安全。

## 完整示例与验证边界

本课示例采用 Next.js 16 风格，共 21 个文件，前文源码引用已覆盖全部实现：

```text
types / dto / action contract
├─ repository + auth（server-only）
├─ request memo + cross-request cache
├─ enrollment command
│  ├─ Server Action
│  └─ Route Handler
└─ Route UI
   ├─ Server Page / Catalog / Instructor
   ├─ Client Shell / Enrollment Island
   ├─ Promise + use + Suspense Comments
   └─ loading / error / not-found
```

这些文件不是普通 Vite SPA 可直接运行的目录。本专题不修改根 `package.json`、Next 配置或部署配置；当前仓库也没有 Next/React RSC 运行时。因此纯 TypeScript Contract 可做严格检查，`.mts` 可做语法审查，其余进行源码与官方契约核对，不声称执行了 RSC Build、Streaming 或 Server Action 集成测试。

## 本节小结

RSC、SSR、Hydration 与 Server Function 解决不同问题：RSC 决定哪些组件模块不进入客户端，SSR 产生初始 HTML，Hydration 恢复 Client Component 交互，Server Function 则是由框架承载的远程 Mutation 入口。

Server/Client Boundary 同时是模块、序列化和数据泄露边界；Server Function 同时是公开网络与授权边界。可靠全栈 React 需要显式 DTO、集中 DAL、请求期与跨请求缓存分层、执行点认证授权、数据库幂等事务，以及对 Node Runtime、多实例、Streaming Error 和滚动发布的治理。

下一课进入 [React 大型应用架构、渐进迁移与生产治理](./large-scale-architecture-migration-and-production-governance.md)，把模块边界、状态所有权、设计系统、Vue 与 React 共存、可观测性和发布策略组合成可演进架构。

## 延伸阅读

- [React：Server Components](https://react.dev/reference/rsc/server-components)
- [React：Server Functions](https://react.dev/reference/rsc/server-functions)
- [React：`'use client'`](https://react.dev/reference/rsc/use-client)
- [React：`'use server'`](https://react.dev/reference/rsc/use-server)
- [React：`cache`](https://react.dev/reference/react/cache)
- [React：`cacheSignal`](https://react.dev/reference/react/cacheSignal)
- [React：`use`](https://react.dev/reference/react/use)
- [Next.js：Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Next.js：Data Security](https://nextjs.org/docs/app/guides/data-security)
- [Next.js：Cache Components](https://nextjs.org/docs/app/getting-started/cache-components)
- [Next.js：`use cache`](https://nextjs.org/docs/app/api-reference/directives/use-cache)
- [Next.js：Revalidating](https://nextjs.org/docs/app/getting-started/revalidating)
