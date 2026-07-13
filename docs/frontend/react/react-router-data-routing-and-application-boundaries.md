---
title: React Router 数据路由与应用边界
description: 使用 React Router 数据模式组织嵌套路由、Loader、Action、Pending UI、错误边界、URL 状态、鉴权与并发
---

# React Router 数据路由与应用边界

> 资料基线：React Router 8.2 Data Mode。React Router 近年的包入口、类型生成与模式边界变化较快；实际项目必须以锁文件对应版本的官方文档为准。旧版本常从 `react-router-dom` 导入，当前文档示例主要从 `react-router` 导入，不能只改包名而忽略迁移说明。

## 1. 学习目标

完成本节后，你应该能够：

- 区分 React Router 的 Framework、Data 与 Declarative Mode。
- 用 Route Tree 同时组织 URL、Layout、数据、写操作和错误边界。
- 正确设计 Index、Layout、Dynamic、Optional 和 Splat Route。
- 在 Loader 中使用 Request URL、Params 和 AbortSignal。
- 把筛选、分页、排序等导航状态放进 URL。
- 使用 Action 与 `<Form>` 处理写操作和服务端校验。
- 使用 `useNavigation` 和 `useFetcher` 设计全局与局部 Pending UI。
- 理解 Action 后 Loader Revalidation 与服务器数据一致性。
- 使用 Route Error Boundary 处理 Response 与程序异常。
- 避免把父 Loader 当成串行鉴权中间件。
- 防止开放重定向、越权、CSRF 和重复提交。
- 理解 Data Router 的取消、竞态和服务端幂等边界。
- 判断何时使用 Data Mode，何时采用 Framework Mode。
- 使用 Memory Router/Route Stub 测试 Loader、Action 和导航流程。

## 2. 路由不只是“URL 对应组件”

传统 SPA 往往在组件挂载后 Fetch：

```text
匹配 URL → Render 空页面 → Effect Fetch → Loading → 内容
```

数据路由把页面进入所需的工作提升到路由层：

```text
Navigation
→ Match Route Branch
→ Run Loaders / Action
→ Handle Redirect or Error
→ Commit Route UI with Data
→ Revalidate affected Loaders after Mutation
```

路由树因此同时表达：

- URL 层级与页面身份。
- 持久 Layout 和 Outlet。
- 页面进入前需要的数据。
- Form 写操作和校验。
- Pending、错误与重定向。
- 数据失效和重新验证。

这比在每个页面复制 `useEffect + loading + error + navigate` 更容易统一取消、竞态和导航语义。

## 3. 三种模式先选清楚

### Declarative Mode

使用 `<BrowserRouter>`、`<Routes>`、`<Route>` 声明匹配和导航。适合已有数据层、只需要客户端路由的 SPA。它不提供完整 Loader/Action 数据协调。

### Data Mode

使用 `createBrowserRouter()` 和 `<RouterProvider>`。Route Object 可定义 Loader、Action、Error Boundary、Revalidation 等。适合自定义 Vite SPA、想使用数据路由但不采用完整框架约定的项目。

### Framework Mode

在 Data Mode 上增加 Route Module、类型生成、自动代码分割、SSR/预渲染、流式、部署适配等框架能力。生产新项目需要服务端渲染、强类型 Route Module 和完整数据生命周期时优先评估。

本课选择 Data Mode，便于看清底层契约；它不代表所有项目都应手写 Router/SSR 基础设施。

## 4. 完整入口与 Router 所有权

浏览器入口：

<<< ../../../examples/frontend/react-router-data/main.tsx

Router 在模块顶层创建，而不是组件 Render 内：

<<< ../../../examples/frontend/react-router-data/router.tsx

如果每次 App Render 都 `createBrowserRouter()`，会重建 Router 实例、丢失内部状态、重复订阅 History。Router 配置通常是应用结构，应保持稳定。

测试需要隔离时，每例创建独立 Memory Router，而不是复用生产 Browser Router Singleton。

## 5. Route Tree 与 UI Tree 对齐

示例 Route Branch：

```text
/
└── RootLayout
    ├── index → HomePage
    ├── login → LoginPage
    ├── pathless ProtectedLayout
    │   └── lessons → LessonsLayout
    │       ├── index → LessonIndexPage
    │       ├── :lessonId → LessonDetailPage
    │       └── :lessonId/edit → LessonEditPage
    └── * → NotFoundPage
```

URL `/lessons/react-state/edit` 同时匹配 Root、Pathless Protected、Lessons 和 Edit 四层。父组件通过 `<Outlet />` 渲染匹配的子级。

路由嵌套不只是拼路径，还决定：

- 哪些 Layout 在子导航时保留。
- 哪些 Loader 属于匹配 Branch。
- Pending 和 Error 在哪里展示。
- 相对 Link/Action 如何解析。

不要为了目录整齐建立与 UI/URL 生命周期无关的深层路由。

## 6. Index、Layout、Prefix 与 Splat

### Index Route

`{ index: true }` 在父 URL 精确匹配时渲染默认 Outlet 内容。它没有 path，也不能有 children。`/lessons` 显示“请选择课程”，而不是空 Outlet。

### Layout Route

没有 path、只有 Component 和 children 的 Route 不增加 URL Segment。本课 ProtectedLayout 就是 Pathless Layout。

### Prefix Route

有 path、无 Component 的 Route 只给 children 增加路径前缀，不产生额外 Layout。

### Dynamic Segment

`:lessonId` 进入 Loader/Action Params。Params 来自外部 URL，TypeScript 的 string 类型不代表值合法；必须检查缺失、格式和权限。

### Optional Segment

`:lang?` 表示可选 Segment。可选层级过多会让 URL 解析和 Canonical 复杂，应谨慎使用。

### Splat

`*` 匹配剩余路径，常用于 404 或文件路径。读取 Params 时 Key 是 `"*"`。Catch-all Route 应放在语义正确的子树，才能保留对应 Layout。

## 7. Root Layout 与全局导航状态

<<< ../../../examples/frontend/react-router-data/RootLayout.tsx

`useNavigation()` 暴露当前全局导航状态：

```text
idle → submitting → loading → idle
```

普通 Link 导航通常是 idle → loading → idle；提交 Action 后通常是 submitting → loading（Loader Revalidation）→ idle。

Root 可以显示全局进度条，但不要在每次短导航中替换整个页面为 Spinner。保留旧 UI 并给出非阻塞反馈，能减少布局跳变，也让用户知道从哪里发起导航。

`navigation.location` 是目标位置；Pending UI 可据此判断哪个 Link 或筛选正在进行。

## 8. Loader 是 Route 读取边界

Route 数据、查询、表单错误与 Session 的领域类型集中定义：

<<< ../../../examples/frontend/react-router-data/types.ts

Loader 接收 Web Standard Request 和 Route Params：

```ts
async function loader({ request, params }: LoaderFunctionArgs) {
  const url = new URL(request.url)
  const data = await fetchSomething(params.id, request.signal)
  return { data }
}
```

本课所有 Loader/Action：

<<< ../../../examples/frontend/react-router-data/loaders-and-actions.tsx

Loader 的职责：

- 解析和验证 Params/Search Params。
- 调用服务或 BFF 获取该 Route 数据。
- 返回可序列化的页面数据。
- 抛出 Redirect 或 Response Error。
- 把 `request.signal` 传给底层请求。

不要在 Loader 中修改模块全局 Store 来“缓存”。数据模式已有导航与 Revalidation 语义；需要跨导航 Cache 时使用明确数据策略/缓存层。

## 9. Request Signal 与取消

用户从课程 A 快速导航到 B，A Loader 可能仍在请求。Data Router 会在导航失效时取消对应 Request，底层 Fetch 必须接收 Signal：

```ts
await getLesson(lessonId, request.signal)
```

完整服务：

<<< ../../../examples/frontend/react-router-data/lesson-service.ts

Abort 能：

- 减少无用网络和解析。
- 让旧导航更快释放资源。
- 防止被取消的 Loader 正常提交到新 Branch。

但取消浏览器请求不能撤销服务器已经执行的写操作。Action 的 POST/PUT 需要幂等、版本或 Idempotency Key 保护。

## 10. HTTP 错误应保留状态语义

通用读取函数：

<<< ../../../examples/frontend/react-router-data/http.ts

它把非 2xx 转成带 Status 的 Response，让最近 Error Boundary 区分 404、401、500。错误处理不能把所有失败压成 `new Error('失败')`，否则路由层丢失 HTTP 语义。

生产中还应：

- 校验 JSON Schema，而不是只做 Type Assertion。
- 区分网络错误、超时、Abort、业务校验与程序缺陷。
- 只把安全的用户消息放入 Response。
- 服务端日志记录 request ID 和原始 Cause，不把内部堆栈泄漏给浏览器。

## 11. Search Params 是导航状态

筛选解析器：

<<< ../../../examples/frontend/react-router-data/route-contracts.ts

课程列表使用 GET Form：

<<< ../../../examples/frontend/react-router-data/LessonsLayout.tsx

提交后字段进入 URL：

```text
/lessons?keyword=React&status=published
```

收益：

- 刷新不丢筛选。
- Back/Forward 恢复历史。
- 链接可分享和收藏。
- Loader/SSR 能直接根据 URL 取相同数据。
- 不需要 Context 与 URL 双向 Effect。

Search Params 是不可信字符串。缺失、重复、非法 Enum 和超大分页必须归一化。解析函数返回领域类型，页面不要到处直接读取 Raw URLSearchParams。

## 12. Uncontrolled GET Form 与 URL Source of Truth

示例 Input 使用 `defaultValue={query.keyword}`，提交后 Router 导航到新 URL，Loader 返回新的 query。这样 DOM Form 是提交前草稿，URL 是已应用筛选。

若要求每次键入实时更新 URL，可使用 `useSearchParams` 或 `useSubmit`，但要处理：

- Debounce。
- History Replace，避免每个字符一条历史。
- IME 中文输入组合事件。
- Pending 请求取消。
- 焦点与光标稳定。

不要同时让 Local State、Context 和 URL 都自称筛选 Source of Truth。

## 13. Action 是 Route 写操作边界

Action 处理非 GET Form：

```text
Form Submit
→ Route Action
→ Validation / Mutation
→ Action Data or Redirect
→ Matched Loaders Revalidate
→ UI receives fresh server state
```

编辑 Action：

- 读取 `request.formData()`。
- 验证标题和正文。
- 失败返回 400 + 字段错误和值。
- 成功 PUT 后 Redirect 到详情页。

验证失败不是程序异常，不必抛 Error Boundary；它是该表单可预期 Action Data。

## 14. `<Form>` 与服务端校验

编辑页面：

<<< ../../../examples/frontend/react-router-data/LessonEditPage.tsx

`useActionData()` 读取最近一次 Action 返回的校验结果。失败后使用提交值回填，而不是退回旧 Loader Data。

服务端校验必须存在，即使浏览器有 `required`、minLength 或客户端 Schema：

- 请求可以绕过 UI。
- 权限和唯一性只能由服务端可靠判断。
- 多用户并发时客户端数据可能过期。

字段错误用 `aria-describedby` 关联 Input；Form Error 应用 `role="alert"` 或明确焦点策略。完整无障碍表单还需 Error Summary 和提交后聚焦首个错误。

## 15. Action 后为什么通常不手动更新列表

Data Router 在 Action 完成后 Revalidate 当前匹配 Loader，使 UI 回到服务器真实状态。无需：

```tsx
await updateLesson()
setLesson(localCopy)
navigate(...)
refetchList()
```

Router 协调 Mutation、Navigation 和 Loader Freshness，减少本地 Cache 与服务器分歧。

但 Revalidation 不是万能缓存策略。大页面可能有昂贵父 Loader，可用 `shouldRevalidate` 精确控制，但必须证明跳过后数据仍正确。错误地优化会显示陈旧权限或列表。

## 16. Navigation Form 与 Fetcher Form

### Navigation Form

编辑保存成功后应跳回详情页，因此使用 `<Form method="post">`。它参与全局 `useNavigation()` 状态。

### Fetcher Form

发布课程应留在当前详情页，不需要 Navigation，因此使用 `fetcher.Form`：

<<< ../../../examples/frontend/react-router-data/LessonDetailPage.tsx

Fetcher 拥有独立：

- state：idle/submitting/loading。
- formData。
- data。

它仍调用 Route Action，并在成功后触发必要 Revalidation，但不会改变 URL。适合 Inline Toggle、收藏、删除行和 Combobox 加载。

不要为避免导航而在普通组件里手写 Fetch + 本地 Cache Patch；Fetcher 已提供并发和 Revalidation 协调。

## 17. Pending UI 要有正确粒度

三层常见反馈：

| 粒度 | API | 示例 |
| --- | --- | --- |
| 全局导航 | `useNavigation()` | 顶部进度条 |
| 当前表单导航 | navigation.formAction/formData | 保存按钮 |
| 局部非导航操作 | `fetcher.state` | 单行发布按钮 |

示例 `saving = navigation.state === 'submitting'` 在页面只有一个 Navigation Form 时足够；复杂 Root 同时观察多个表单时还应比较 `navigation.formAction`，否则可能把无关按钮标为 Saving。

Pending UI 应：

- 阻止同一不可幂等操作重复提交。
- 保留用户已输入内容。
- 明确局部操作，不让整个页面闪烁。
- 超快请求避免视觉抖动，慢请求及时反馈。
- Error 后允许安全重试。

## 18. Error Boundary 是 Route Tree 的故障隔离

<<< ../../../examples/frontend/react-router-data/RouteErrorBoundary.tsx

Route Error Boundary 会处理：

- Loader 抛出的 Response/Error。
- Action 抛出的 Response/Error。
- Route Component Render Error。

错误从发生 Route 向祖先冒泡，最近有 ErrorBoundary 的 Route 接管；未受影响的祖先 Layout 可以保留。

建议边界层次：

- Root：全应用兜底、报告未知错误。
- 业务 Layout：保留导航，替换失败工作区。
- 关键叶子：局部资源 404 或编辑失败。

错误页本身应简单，不依赖同一失败 API。不要直接向用户显示未知 Error Stack 或服务端敏感消息。

## 19. 404 有两类

### URL 没有 Route 匹配

Catch-all `*` 渲染 NotFoundPage。

### Route 匹配，但实体不存在

`/lessons/missing` 匹配详情 Route，API 返回 404，Loader 抛 Response，由 Route Error Boundary 处理。

两者都应显示合适页面；SSR/Framework Mode 还应返回真实 HTTP 404。SPA 静态 Host 通常对所有前端路径先返回 index.html，其 HTTP Status 可能仍是 200，这是部署层限制，需在服务端/边缘渲染中解决 SEO 语义。

## 20. 鉴权 Loader 是导航体验，不是安全边界

认证服务：

<<< ../../../examples/frontend/react-router-data/auth-service.ts

Pathless Protected Loader 未登录时 Redirect：

<<< ../../../examples/frontend/react-router-data/ProtectedLayout.tsx

重要事实：匹配 Branch 的 Loader 可以并行执行，父 Loader 不是会先完成再允许子 Loader 的 Express Middleware。Protected Loader Redirect 时，Child Loader 可能已经发起请求。

因此：

- 每个后端 API 必须独立验证 Session、权限和租户。
- 不能依赖前端父 Route 防止敏感数据返回。
- 需要严格串行鉴权/共享上下文时，使用 Framework Middleware/BFF 或让子 Loader 调用受保护数据端点。
- Redirect Loader 改善 UX，不是授权实现。

本课 API 默认由服务器正确鉴权。即使 Child 请求并行发出，未授权服务器也不能返回课程数据。

## 21. Login Redirect 与开放重定向

登录前保存：

```text
/login?returnTo=/lessons/react-state
```

登录 Action 成功后回到原页面。但 returnTo 来自用户输入，若允许 `https://evil.example` 或 `//evil.example`，就形成开放重定向。

`safeReturnTo()` 只接受单斜杠开头的站内路径，其余回退 `/lessons`。生产还可限制到允许的 Route 前缀。

登录 Action 同样不能只相信前端：

- Session Cookie 使用 HttpOnly、Secure、合适 SameSite。
- 状态改变请求有 CSRF 防护。
- 登录限速并防账号枚举。
- Redirect 前重新验证目标权限。
- URL 不放 Token、密码或敏感信息。

完整登录页面：

<<< ../../../examples/frontend/react-router-data/LoginPage.tsx

## 22. Params、Query、FormData 都是不可信输入

类型 `params.lessonId?: string` 反映它可能缺失。`requiredParam()` 只验证存在；生产还需验证格式、长度、Canonical 和权限。

FormData 可能包含：

- 缺失字段。
- 同名多值。
- File 而非 string。
- 超大内容。
- 未知 intent。

示例对值显式 `String()` 并校验长度，只用于说明边界。严谨项目使用共享 Schema Validator，但服务端仍必须再次验证。

## 23. 相对导航由 Route 层级决定

详情中的：

```tsx
<Link to="edit">编辑</Link>
```

从 `/lessons/:lessonId` 进入 `edit` 子路径。

编辑页：

```tsx
<Link to=".." relative="path">取消</Link>
```

明确按 URL Path 返回详情。React Router 还支持按 Route Hierarchy 解析相对导航，Layout Route 不一定增加 Path。复杂嵌套中要测试目标，不要只凭文件目录猜 `..`。

优先使用 Link/NavLink/Form；只有倒计时、外部系统回调等命令式场景才使用 `useNavigate()`。普通点击用 navigate 会失去原生链接语义，如新标签页、复制地址和可访问性。

## 24. `location.state` 不是持久状态

Navigation 可携带内存 `state`，适合：

- 从哪个列表进入详情。
- 非关键过渡提示。
- Back 时恢复短暂 UI 上下文。

它不适合：

- 刷新后必须存在的数据。
- 可分享筛选。
- 权限凭据。
- 服务端渲染所需信息。

可分享、可刷新状态放 URL；实体从 Loader 获取；秘密留在安全 Session。

## 25. 并发与竞态管理

Data Router 模拟浏览器文档导航语义：新导航会取消过时 Loader，旧 Revalidation 结果不会随意覆盖更新结果。Fetcher 也有自己的并发协调。

但客户端 Router 无法消除服务器竞态：

- 两个 POST 都可能到达服务器。
- Abort 到达时数据库已经提交。
- 不同 Tab/设备可同时编辑。
- 最后写入可能覆盖他人更新。

服务端需要：

- Idempotency Key。
- 乐观锁/版本字段/ETag If-Match。
- 事务与唯一约束。
- 权限在写入时重新检查。

前端在 409 Conflict 后应显示冲突恢复，而不是静默覆盖。

## 26. Router Data 与客户端 Cache

React Router 管理的是 Navigation Data 生命周期，不必再把 Loader Data 复制到 Context。文档状态解释中，很多所谓客户端状态可以直接使用：

- Loader Data 代替组件 Fetch Cache。
- Action + Revalidation 代替手工同步服务器状态。
- URL Search Params 代替筛选 Context。
- Fetcher 代替局部 Mutation 状态机。

仍需专用数据 Cache 的场景：

- 同一数据跨不相关 Route 长期缓存。
- 复杂 Background Refresh/Stale Time。
- Offline、乐观更新和规范化实体。
- WebSocket Push 与多源合并。

可以集成数据缓存，但必须定义 Router Loader 与 Cache 谁负责 Fetch、Invalidation、Error 和 SSR，避免双重请求。

## 27. 类型安全的现实边界

Data Mode 可以使用：

```tsx
useLoaderData<typeof lessonLoader>()
useActionData<typeof editLessonAction>()
useFetcher<typeof lessonAction>()
```

它让返回类型随函数推断，但 Params 名、Route ID 和跨 Route 数据仍可能依赖人工契约。

Framework Mode 的 Route Module 类型生成能根据 Route 配置产生更完整类型。在大型项目中，优先采用当前版本官方类型方案，不要维护一套手写 Params Interface 却与 Path 漂移。

网络 JSON 仍是 `unknown` 边界。Router 类型不会验证服务器响应。

## 28. Code Splitting 与 Lazy Route

大型应用不应在入口同步导入所有 Route Component。Data Router 支持 Lazy Route 定义；Framework Mode 可提供自动代码分割。

拆分原则：

- 以 Route Branch 为主要 Chunk 边界。
- Loader/Component/Error Boundary 的加载时序一起评估。
- 关键首屏避免过碎瀑布。
- 预加载来自真实导航意图。
- Chunk Load Failure 有刷新/版本恢复策略。

教学示例静态导入是为了在一个页面展示完整关系，不代表生产 Bundle 策略。

## 29. 导航阻止不是数据安全保证

未保存草稿可用 Blocker/Prompt 提醒，但：

- 浏览器关闭还要 `beforeunload`。
- Mobile 进程被杀无法保证弹窗。
- 自动保存要处理版本和离线。
- 阻止导航不能替代服务器草稿。

只在用户确实会丢不可恢复输入时阻止。过度弹窗会伤害 Back/Forward 体验。更好的方案可能是本地/服务端自动草稿和冲突恢复。

## 30. SSR 与 Framework Mode

Data Router 提供 `createStaticHandler`、`createStaticRouter`、`StaticRouterProvider` 等底层 SSR API，但完整生产 SSR 还需：

- 请求级 Router/Context。
- Loader/Action Server 执行边界。
- Status、Redirect、Header 和 Cookie。
- Loader Data 安全序列化与 Hydration。
- Client/Server Build 和资源 Manifest。
- Streaming/Error/Abort。

这些与 Vue SSR 课程中的边界相同。React Router Framework Mode 已集成 Route Module、Rendering Strategy 和部署能力；除非已有成熟服务器平台，不要轻率手写全部基础设施。

## 31. 测试 Loader 与 Action

Loader/Action 接收标准 Request，服务边界可注入或 Mock Server：

- 合法/非法 Params。
- Search Params 默认值和非法 Enum。
- 401 Redirect 与 returnTo 编码。
- API 404 抛 Route Response。
- Request Abort 传到底层 Fetch。
- Form 400 返回字段错误和值。
- 成功 Action Redirect。
- 未知 intent 返回 400。

尽量直接测试解析器和服务纯边界，再用 Router 集成测试验证接线。

## 32. Router 集成测试

使用 `createMemoryRouter(routes, { initialEntries })` 或当前版本的 Route Testing 工具：

- 初始深层 URL 渲染正确嵌套 Layout。
- Loader 完成前显示 Pending。
- 点击 NavLink 更新 URL 和 Outlet。
- GET Form 写入 Search Params。
- Action Validation 回填输入。
- Fetcher 发布不改变 URL。
- Action 成功后 Loader Revalidate。
- Error 在最近边界展示且祖先 Layout 保留。
- Back/Forward 恢复 URL 状态。

不要在单元测试复用 Browser Router；Memory Router 使历史和初始位置可控。E2E 还需验证服务器对深层 URL 的 Fallback/SSR Status。

## 33. 可访问性与导航体验

SPA 导航不会自动等同浏览器完整文档导航。检查：

- 页面标题和 Head 随 Route 更新。
- 导航后焦点进入合理标题/主区域。
- Pending 使用 `role="status"`，Error 使用合适 Alert。
- NavLink 的 Active 状态不仅依赖颜色。
- Back/Forward 和 Scroll Restoration。
- Form Error 与字段关联。
- Loading 不移除当前可读内容。
- Redirect 不形成焦点丢失或循环。

Framework 提供部分 Head/Scroll 能力时优先使用官方通道；Data Mode 需要项目明确实现。

## 34. 常见失败模式

### 每个页面 `useEffect` Fetch

产生 Loading Flash、竞态、瀑布和重复 Cache。首屏 Route Data 放 Loader。

### Loader Data 再复制进 Context

两份 Source of Truth，Revalidation 后 Context 仍旧。直接消费 Loader Data或建立明确 Cache 集成。

### 父 Loader 当鉴权 Middleware

Loader 并行，Child 请求已发出。后端逐请求授权。

### 所有跳转都 `useNavigate`

失去 Link/Form 原生语义。用户点击优先声明式导航。

### 用本地 Boolean 管 Pending

Redirect/Error 时容易忘记复位。使用 Navigation/Fetcher 状态。

### Action 成功后手工 Patch 所有页面

易与服务器分歧。让 Revalidation 恢复真实数据，性能问题再精确优化。

### returnTo 不校验

形成开放重定向。只允许站内安全路径。

### 只在前端 Route 做权限

攻击者直接调用 API。授权必须在服务器。

## 35. 完整示例结构

```text
examples/frontend/react-router-data/
├── LessonDetailPage.tsx
├── LessonEditPage.tsx
├── LessonsLayout.tsx
├── LoginPage.tsx
├── ProtectedLayout.tsx
├── RootLayout.tsx
├── RouteErrorBoundary.tsx
├── auth-service.ts
├── http.ts
├── lesson-service.ts
├── loaders-and-actions.tsx
├── main.tsx
├── route-contracts.ts
├── router.tsx
└── types.ts
```

前文已通过源码引用展示全部 15 个文件，没有省略 Router 接线、Action 或错误处理实现。

示例不包含 React Router 依赖配置；本专题不得修改根 `package.json`，当前工作树也未安装 React Router 8 类型和运行时。因此验证包括纯 TypeScript 严格检查和 TSX 语法检查，不会声称执行了完整 Router 类型构建或浏览器运行。

## 36. 生产检查清单

### 路由结构

- Route Tree 与 UI/Layout 生命周期一致。
- Index、Pathless Layout、Dynamic 和 404 语义明确。
- Router 实例稳定，测试实例隔离。
- Route Chunk 和错误边界合理分层。

### 数据

- 首屏 Route Data 由 Loader 获取并传递 Request Signal。
- Search/Params/FormData 全部解析和验证。
- Loader Data 没有冗余复制进 Context。
- Action 后 Revalidation 与缓存策略一致。

### 交互

- Navigation 与 Fetcher 使用正确场景。
- Pending 粒度、重复提交和 Error Recovery 已设计。
- URL 状态支持 Refresh、Share、Back/Forward。
- Focus、Title、Scroll 和 ARIA 已验证。

### 安全

- 后端逐 API 鉴权和授权。
- returnTo 防开放重定向。
- 写操作有 CSRF、幂等/并发保护。
- Error 不泄漏堆栈、Token 和内部数据。

### 运行

- 深层 URL 在 Host/SSR 可直接访问。
- 404/Redirect/Status 在服务端语义正确。
- Loader/Action/Fetcher 竞态与 Abort 已测试。
- 版本、导入包和官方模式文档与 Lockfile 一致。

## 37. 进一步阅读

- [React Router：Picking a Mode](https://reactrouter.com/start/modes)
- [React Router：Data Mode Routing](https://reactrouter.com/start/data/routing)
- [React Router：Data Loading](https://reactrouter.com/start/data/data-loading)
- [React Router：Actions](https://reactrouter.com/start/data/actions)
- [React Router：Pending UI](https://reactrouter.com/start/data/pending-ui)
- [React Router：Navigating](https://reactrouter.com/start/data/navigating)
- [React Router：Error Boundaries](https://reactrouter.com/how-to/error-boundary)
- [React Router：Network Concurrency Management](https://reactrouter.com/explanation/concurrency)
- [React Router：State Management](https://reactrouter.com/explanation/state-management)

## 38. 本节小结

Data Router 把 Route 当作应用协调边界：URL 匹配决定组件 Branch，Loader 读取进入页面所需数据，Action 处理 Form 写操作，Navigation/Fetcher 提供 Pending 状态，Error Boundary 隔离失败，Revalidation 让 UI 回到服务器事实。

它不会替代服务器安全、事务、幂等和缓存设计。父 Loader 不是串行 Middleware，Abort 不能撤销已提交写操作，前端 Params 类型也不能验证外部输入。把 Router 的导航职责和后端的数据职责分清，才能得到可分享、可刷新、可取消、可测试的 React 应用。

下一课将进入 React 表单与复杂交互状态，进一步讨论受控/非受控字段、原生 FormData、服务器 Action、异步校验、可访问错误、乐观更新和防重复提交。
