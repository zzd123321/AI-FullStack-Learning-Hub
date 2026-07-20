---
title: React Router 数据路由与应用边界
description: 从一次导航的完整数据流出发，理解路由树、Loader、Action、Pending、错误、鉴权与并发
outline: deep
---

# React Router 数据路由与应用边界

> 资料基线：React Router 8.2 Data Mode。React Router 的版本、包入口和框架能力变化较快；实际项目应以锁文件对应的官方文档为准。v6 项目常从 `react-router-dom` 导入，当前 v8 文档主要从 `react-router` 导入，升级时不能只机械替换包名。

上一课提到：如果筛选、分页和当前实体需要刷新保留、支持浏览器前进后退、还能分享链接，它们就不应只存在组件 State 中，而应属于 URL。

这正是路由架构的起点。Router 不只是“看到某个路径就显示某个组件”，它还协调页面身份、数据读取、写操作、等待反馈、错误隔离和导航取消。

```text
用户导航或提交表单
        ↓
Router 匹配一条 Route Branch
        ↓
运行 Loader 或 Action
        ↓
处理数据、Redirect 或 Error
        ↓
提交新的 Route UI
        ↓
写操作完成后重新验证相关 Loader
```

理解这条管线后，就能知道为什么页面数据不必默认写成 `useEffect + loading + error`。

## 先选择 Router 承担多少职责

React Router 8 提供三种递增模式。它们不是三个互不相干的产品，而是逐层增加能力和约定。

| 模式 | 顶层 API | 适合 |
| --- | --- | --- |
| Declarative | `<BrowserRouter>`、`<Routes>` | 已有独立数据层，只需要匹配、链接与导航的 SPA |
| Data | `createBrowserRouter`、`<RouterProvider>` | 自定义 SPA，希望使用 Loader、Action、Pending 与错误边界 |
| Framework | Route Module 与框架工具链 | 需要类型生成、代码分割、SSR、预渲染、流式和部署适配的新项目 |

本课选择 Data Mode，因为它能把数据路由的核心机制直接展开，又不要求先接受完整框架目录约定。这不表示生产项目都应自己搭建 SSR；有服务端渲染和强类型 Route Module 需求时，应优先评估 Framework Mode。

浏览器入口只负责挂载稳定 Router：

<<< ../../../examples/frontend/react-router-data/main.tsx

Router 在模块顶层创建：

<<< ../../../examples/frontend/react-router-data/router.tsx

不要在组件每次 Render 时调用 `createBrowserRouter()`。Router 实例拥有 History 订阅、导航状态和 Loader 数据，反复创建会重置这些内部状态。测试则应为每个用例创建独立 Memory Router，避免不同用例共享导航历史。

## Route Tree 同时描述 URL 与 UI 生命周期

示例路由可以画成：

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

访问 `/lessons/react-state/edit` 时，Root、Protected、Lessons 和 Edit 四层同时匹配。每个父 Layout 用 `<Outlet />` 留出子路由位置。导航只改变叶子节点时，上层 Layout 可以继续保留。

因此嵌套路由还决定：

- 哪些界面在子导航时持续存在；
- 哪些 Loader 属于当前匹配分支；
- Error 应由哪一层接住；
- 相对 Link 与 Form Action 如何解析；
- 哪个边界适合显示 Pending UI。

### 常见 Route 形态

- Index Route 使用 `{ index: true }`，在父 URL 精确匹配时填充默认 Outlet；它没有自己的 path。
- Pathless Layout 有 Component 和 children，但没有 path；它增加 UI/数据边界，不增加 URL Segment。
- Prefix Route 有 path 和 children，却没有 Component；它只为子路由增加路径前缀。
- `:lessonId` 是 Dynamic Segment，值通过 Params 进入 Loader/Action。
- `:lang?` 是 Optional Segment；过多可选层级会让规范 URL 变得含糊。
- `*` 是 Splat，匹配剩余路径，适合在语义正确的子树中放置 404。

路由树应尽量贴合 URL 和 UI 的真实持久层级，而不是为了文件夹整齐增加无意义嵌套。

## Loader 是路由的数据读取边界

传统组件请求常经历：

```text
先渲染空页面 → Effect 发请求 → 再渲染 Loading → 最后渲染内容
```

Data Router 在提交目标页面前运行匹配 Loader。Loader 接收 Web 标准 `Request` 和 Params：

```ts
async function loader({ request, params }: LoaderFunctionArgs) {
  const url = new URL(request.url)
  const data = await getSomething(params.id, request.signal)
  return { data }
}
```

示例的路由数据与表单错误类型：

<<< ../../../examples/frontend/react-router-data/types.ts

所有 Loader 与 Action：

<<< ../../../examples/frontend/react-router-data/loaders-and-actions.tsx

Loader 的职责包括：

- 解析和验证 Params 与 Search Params；
- 调用 Service/BFF 获取当前 Route 需要的数据；
- 返回组件可消费的结果；
- 必要时抛出 Redirect 或带状态码的 Response；
- 把 `request.signal` 继续传给底层请求。

Loader 不应偷偷修改模块级 Store 来“缓存”。如果需要跨导航缓存和失效策略，应使用明确的数据缓存层或 Framework 能力。

### URL 参数都是运行时输入

`:lessonId` 的 TypeScript 类型即使是 `string`，也不代表它存在、格式正确或当前用户有权限。示例用 `requiredParam` 处理缺失值，Service 用 `encodeURIComponent` 构造请求路径；后端仍必须校验实体存在性和授权。

Search Params 也一样。课程查询解析器把原始字符串收敛到领域类型：

<<< ../../../examples/frontend/react-router-data/route-contracts.ts

非法 `status` 被归一为 `all`，关键词统一 Trim。分页还应限制最小值、最大值和重复参数。页面不要到处直接读取未经处理的 `URLSearchParams`，否则同一参数会出现多套规则。

### HTTP 边界既要保留状态码，也要校验 JSON

通用读取函数先保留非 2xx 的 HTTP 语义：

<<< ../../../examples/frontend/react-router-data/http.ts

它只返回 `unknown`，因为 `response.json()` 的结果不受 TypeScript 保证。领域 Service 再验证课程字段：

<<< ../../../examples/frontend/react-router-data/lesson-service.ts

这样 404、401、500 可以交给 Route Error Boundary，而“服务器返回 200 但字段结构错误”会作为契约异常进入监控。直接写 `response.json() as Lesson` 不会生成运行时检查。

## URL 是已应用的导航状态

课程筛选使用 GET Form：

<<< ../../../examples/frontend/react-router-data/LessonsLayout.tsx

提交后表单字段进入 URL：

```text
/lessons?keyword=React&status=published
```

于是刷新、Back/Forward、收藏、分享链接和服务端直接访问都能得到同一查询。Router 根据新 URL 重新运行 Loader，不需要 Context 与 URL 之间的双向 Effect。

示例输入使用 `defaultValue`：用户提交前，DOM 中的字段是临时草稿；提交后，URL 才成为已经应用的筛选条件。若产品要求每次键入都更新 URL，需要额外考虑 Debounce、History Replace、中文 IME 组合输入、请求取消和光标稳定，不能只在 `onChange` 中无条件 Push 一条新历史。

## Action 是路由的写操作边界

Loader 回答“进入这个 URL 需要读什么”，Action 回答“向这个 Route 提交后要改什么”。React Router 的 `<Form>` 使用浏览器表单语义触发 Action：

```text
Form Submit
  → Router 进入 submitting
  → 匹配目标 Route Action
  → 解析并校验 FormData
  → 调用写服务
  → 返回数据、Error 或 Redirect
  → 重新验证页面上的 Loader
  → Router 回到 idle
```

编辑页面：

<<< ../../../examples/frontend/react-router-data/LessonEditPage.tsx

服务端校验失败时，Action 返回 400 和用户已输入值，页面显示字段错误；成功时 Redirect 到详情页。`FormData` 与 URL 一样不可信，长度、类型、枚举、实体权限都要在真正执行写操作的边界验证。

### 为什么 Action 后通常不手工 Patch 每个页面

Action 成功后，Data Router 会重新验证当前页面的 Loader。课程发布后，详情 Loader 和列表 Loader 都可以重新读取服务器事实来源，不必在多个 Context 中手动同步标题、状态和列表缓存。

重新验证不是无限免费的。大型应用可以使用缓存层或 `shouldRevalidate` 精确控制，但优化必须建立在明确失效规则上。过早跳过 Revalidation 很容易留下陈旧数据。

### Navigation Form 与 Fetcher Form

两者都会调用 Route Action，主要差异是是否发生导航：

- `<Form>` 适合保存后前往详情、登录后跳回原页面等会改变位置的操作；
- `<fetcher.Form>` 适合原地发布、收藏、行内编辑等不改变 URL 的操作。

详情页用 Fetcher 原地发布：

<<< ../../../examples/frontend/react-router-data/LessonDetailPage.tsx

Fetcher 有自己独立的 `idle → submitting → loading → idle` 状态和返回数据，不会把整个页面伪装成正在导航。Action 完成后仍会参与 Loader Revalidation。

## Pending UI 应对应实际等待范围

根 Layout 可以通过 `useNavigation()` 显示全局导航反馈：

<<< ../../../examples/frontend/react-router-data/RootLayout.tsx

普通 Link 导航通常经历 `idle → loading → idle`；带 Action 的导航提交通常经历 `submitting → loading → idle`。页面不必每次都用全屏 Spinner 替换旧内容，保留当前 UI 并显示非阻塞进度通常更稳定。

更局部的反馈应靠近触发点：

- 搜索表单显示“筛选中”；
- 保存按钮显示“保存中”并防止重复提交；
- Fetcher 发布按钮只禁用自己；
- `navigation.location` 可用来识别目标 URL，而不是只看一个全局 Boolean。

Pending State 由 Router 的真实状态派生。不要另设 `isLoading`，再尝试用 Effect 与 Router 对齐。

## Route Error Boundary 是故障隔离层

Loader、Action 或 Route Render 抛出的错误，会沿匹配 Route Tree 向上寻找最近的 Error Boundary。示例在根路由提供兜底：

<<< ../../../examples/frontend/react-router-data/RouteErrorBoundary.tsx

它区分两类错误：

- `isRouteErrorResponse(error)`：可预期的 HTTP 语义，如 404、401、500；
- 普通异常：程序缺陷、错误 JSON 或意外运行时失败，应记录到监控并向用户显示安全的通用信息。

不要把服务器堆栈、SQL、Token 或内部错误消息直接显示在页面上。大型路由树可在课程、设置等子树放置更近的 Error Boundary，让局部失败不必摧毁整个应用外壳。

404 也有两种来源：Catch-all Route 表示 URL 根本没有匹配；Loader 抛出 404 表示 Route 结构有效，但指定实体不存在。后者应保留当前业务 Layout，给出更贴近上下文的返回路径。

## 鉴权 Loader 改善导航体验，但后端才执行授权

会话 Service：

<<< ../../../examples/frontend/react-router-data/auth-service.ts

Protected Layout 读取会话：

<<< ../../../examples/frontend/react-router-data/ProtectedLayout.tsx

未登录时，`protectedLoader` 把目标 Path 和 Query 编码到登录地址，登录 Action 完成后再跳回：

<<< ../../../examples/frontend/react-router-data/LoginPage.tsx

这里有两个必须分开的概念。

第一，前端 Loader 的 Redirect 只是用户体验边界。攻击者可以绕过前端直接请求 API，所以 `/api/lessons`、更新和发布接口必须在服务器再次认证并授权。

第二，同一匹配 Branch 的 Loader 可以并行运行。不能假设父 `protectedLoader` 完成后，子 `lessonsLoader` 才开始；因此父 Loader 不是传统串行中间件。React Router v8 已提供 Middleware，可在匹配处理前后执行共享鉴权、日志和上下文逻辑，但它也不能替代后端 API 授权。项目若采用 Middleware，应按 v8 官方契约统一设计，而不是把 Loader 执行顺序当安全保证。

### 登录回跳必须防止开放重定向

隐藏字段仍可由攻击者修改。若服务器或 Action 无条件 `redirect(returnTo)`，`//evil.example`、反斜杠变体或完整外部 URL 可能把用户带到钓鱼站点。

示例用 URL Parser 解析并验证同源，只返回规范化的 Path、Query 和 Hash；否则退回 `/lessons`。更严格的产品可以改成允许路由白名单。

### CSRF、越权与重复写入

Cookie 会话下的写操作必须考虑 SameSite Cookie、Origin 检查和 CSRF Token 等服务端防护。React Router 新版本能提供额外请求来源保护，但应用仍需根据部署和认证方式建立服务端策略。

禁用按钮只改善交互，不能保证写操作只发生一次。发布、购买等操作还要使用版本条件、唯一约束或 Idempotency Key。所有 `lessonId` 权限检查也必须在后端针对当前用户执行。

## 导航取消与竞态

用户从课程 A 快速切到 B 时，A Loader 可能仍在请求。Router 会让失效导航的 `request.signal` Abort，Service 必须把该 Signal 传给 Fetch。

Abort 能减少无用网络与解析，并阻止失效 Loader 正常提交到新分支。登录 Action 的 Catch 也要让取消继续抛出，不能把它误报为“邮箱或密码错误”。

但取消客户端请求不能撤销服务器已经执行的 PUT/POST。写操作的并发正确性仍需要：

- 乐观锁或版本号；
- 幂等键与服务端去重；
- 清晰的冲突响应；
- 必要时在 UI 中提示数据已被他人修改。

Router 负责导航竞态，不等于服务器事务系统。

## 相对导航跟随 Route 层级

`<Link to="edit">` 从当前详情 Route 进入编辑子路径；`<Link to=".." relative="path">` 按 URL Path 返回上一段。相对链接能让父路径重构更容易，但要明确是按 Route 层级还是按 Path Segment 解析，Splat 和 Pathless Layout 中尤其需要测试。

普通跳转优先使用 Link/NavLink，因为它保留新标签页、复制链接、键盘访问和浏览器语义。`useNavigate` 适合非链接式流程，例如计时结束或完成命令后跳转，不要把所有 `<a>` 都改成 Button + Navigate。

`location.state` 只存在当前 History Entry，刷新、直接访问和分享链接都不可靠。它适合返回焦点位置、背景页面等短期导航上下文，不适合权限、订单或必须恢复的业务状态。

## Data Mode 与 Framework Mode 的边界

Data Mode 很适合已有 Vite SPA：应用自行决定打包、API、部署和类型策略，同时获得 Loader/Action 数据生命周期。

当需求增长到以下范围，应认真评估 Framework Mode：

- SSR、预渲染与流式响应；
- Route Module 类型生成；
- 自动路由级代码分割；
- Server Loader/Action 与部署适配；
- Middleware、Headers、Meta 和数据序列化的统一约定。

手写 Data Router 示例能解释机制，却不应成为重复实现框架基础设施的理由。无论选择哪种模式，URL 状态、输入验证、取消、错误边界和服务器授权原则都不变。

## 如何验证路由行为

Loader 与 Action 可以先作为函数测试：

- 使用带 URL、FormData 和 AbortSignal 的真实 `Request`；
- 验证非法 Params、Query 和 FormData；
- 验证 400/401/404、Redirect 与成功数据；
- Abort 后底层 Service 收到同一个 Signal；
- `returnTo` 拒绝外部 URL 与编码变体。

集成测试使用 Memory Router 或官方 Route Stub，覆盖：

1. 初始 URL 匹配正确 Layout 和 Loader；
2. Link 导航期间出现恰当 Pending UI；
3. GET Form 更新 URL 并重新加载列表；
4. 编辑校验错误保留输入；
5. Fetcher 发布不改变 URL，完成后数据重新验证；
6. 未登录导航到 Login，成功后安全回跳；
7. 子 Route 错误被最近边界接住；
8. 快速导航会取消旧 Loader。

可访问性测试还应确认当前 NavLink 状态、表单 Label、字段错误关联、焦点恢复和导航完成后的页面标题。不要只断言内部 Hook 返回值。

## 完整示例与验证边界

示例目录包含 15 个文件，前文的源码引用已覆盖全部实现：

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

仓库当前没有 React Router、React 类型与测试运行时，本专题也不修改根 `package.json`。因此纯 TypeScript 文件接受仓库严格检查，TSX 接受源码、类型契约与引用审查；不会把未执行的 Router 集成测试描述为已通过。

## 本节小结

数据路由把一次页面切换组织成可解释的管线：Route Tree 确定页面身份与边界，Loader 读取进入页面所需的数据，Form 调用 Action 执行写操作，Router 暴露真实 Pending 状态，并在写入后重新验证 Loader。错误、Redirect 和取消都沿同一条管线处理。

URL 是可持久、可分享的导航状态；HTTP 与 FormData 是不可信输入；前端鉴权只改善体验，服务器授权、CSRF、幂等和并发控制仍不可省略。Data Mode 展示这些底层契约，Framework Mode 则在此基础上提供服务端和工程化约定。

下一课进入 [React 表单架构、Action 与复杂交互](./form-architecture-actions-and-complex-interactions.md)，进一步讨论字段状态、客户端与服务端校验、可访问性、异步提交和复杂表单所有权。

## 延伸阅读

- [React Router：Picking a Mode](https://reactrouter.com/start/modes)
- [React Router：Data Mode](https://reactrouter.com/start/data/installation)
- [React Router：Route Object](https://reactrouter.com/start/data/route-object)
- [React Router：Actions](https://reactrouter.com/start/data/actions)
- [React Router：Pending UI](https://reactrouter.com/start/framework/pending-ui)
- [React Router：Middleware](https://reactrouter.com/how-to/middleware)
- [React Router：Security](https://reactrouter.com/how-to/security)
- [React Router：Testing](https://reactrouter.com/start/data/testing)
- [React Router：Changelog](https://reactrouter.com/start/start/changelog)
