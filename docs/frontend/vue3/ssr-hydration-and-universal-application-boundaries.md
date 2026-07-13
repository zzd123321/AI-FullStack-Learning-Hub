---
title: Vue 3 SSR、Hydration 与同构应用边界
description: 从请求级应用工厂、路由与数据预取，到安全状态序列化、Hydration 一致性、缓存及生产架构
---

# Vue 3 SSR、Hydration 与同构应用边界

> 适用环境：Vue 3、Vue Router 4、Pinia、Vite SSR，以及采用相同原理的 Nuxt 应用。SSR、Vite 与框架 API 会持续演进；工程配置应以项目锁定版本和官方文档为准。

## 1. 学习目标

完成本节后，你应该能够：

- 区分 CSR、SSR、SSG、流式 SSR、混合渲染与边缘渲染。
- 解释服务端渲染和客户端 Hydration 的完整时间线。
- 为每个请求创建独立的 App、Router、Pinia 和服务上下文。
- 使用服务端 memory history 与客户端 web history 建立统一路由。
- 在渲染前解析路由数据，并通过状态载荷避免浏览器重复请求。
- 安全地把 Pinia 状态嵌入 HTML，避免 `</script>` 注入和用户数据泄漏。
- 识别随机数、时区、非法 HTML、浏览器 API 等 Hydration 不一致来源。
- 正确处理生命周期、副作用、Teleport、指令和只支持浏览器的库。
- 设计状态码、重定向、Head、缓存、超时、日志和降级策略。
- 判断何时手写 Vite SSR，何时使用 Nuxt 等上层框架。

## 2. SSR 到底解决什么问题

传统客户端渲染（CSR）返回近乎空的 HTML。浏览器下载、解析和执行 JavaScript 后，Vue 才请求数据并生成内容：

```text
请求 HTML → 下载 JS → 执行 Vue → 请求数据 → 生成 DOM → 页面可读
```

服务端渲染（SSR）先在服务器执行组件，直接返回包含内容的 HTML：

```text
请求 → 路由匹配 → 数据加载 → Vue 渲染 HTML → 浏览器展示
                                      ↓
                         下载 JS → Hydration → 可交互
```

它主要改善：

- **首屏内容到达时间**：浏览器无需等待应用 JavaScript 执行才看到正文。
- **搜索与分享抓取**：爬虫、预览机器人能直接读取标题、描述和主体内容。
- **弱设备体验**：把一部分首屏计算转移到服务器。

SSR 不自动等于“更快”。它会增加服务器计算、TTFB、HTML 大小、状态载荷和 Hydration 工作量。页面可能很早“看见”，但在 JavaScript 下载和 Hydration 完成前仍不能交互。应同时观察 TTFB、FCP/LCP、INP、客户端长任务和服务器资源，而不是只看 HTML 是否提前出现。

## 3. 渲染模式不是二选一

| 模式 | HTML 何时生成 | 适合场景 | 主要代价 |
| --- | --- | --- | --- |
| CSR | 浏览器运行时 | 后台系统、强交互且 SEO 不重要 | 首屏依赖 JS，抓取能力较弱 |
| SSR | 每次请求 | 个性化或高时效公开页面 | 服务器成本、缓存和同构复杂度 |
| SSG/预渲染 | 构建时 | 文档、营销页、更新不频繁内容 | 内容更新需要重建或增量机制 |
| ISR/SWR | 构建或首次请求后缓存 | 内容站、商品详情 | 新旧版本窗口和缓存失效复杂度 |
| 混合渲染 | 按路由决定 | 大型产品同时包含官网与后台 | 规则和部署链路更多 |
| 流式 SSR | 请求中分段输出 | 数据延迟不同的大页面 | 状态码、错误和脚本协调更复杂 |

如果所有用户看到相同内容，SSG 通常比每次 SSR 更便宜、更稳定。登录后的管理后台通常保留 CSR 即可。成熟项目常按路由混合选择，而不是用一种模式覆盖全部页面。

“边缘渲染”描述运行位置，不是新的 Vue 渲染语义。它能缩短网络距离，但运行时可能没有完整 Node.js API，冷启动、数据库连接、包体和区域一致性也要重新评估。

## 4. Hydration 不是重新渲染

浏览器拿到 SSR HTML 后，Vue 不应清空 DOM 再创建一遍。`createSSRApp()` 会遍历现有 DOM 与客户端虚拟 DOM，把事件监听器、组件实例和响应式副作用连接到已有节点，这个过程叫 Hydration。

正确的首次渲染必须满足：

```text
服务端根据 URL + 初始状态得到的 VNode
                     ≈
客户端在 Hydration 第一帧根据同一状态得到的 VNode
```

等 Hydration 完成后，客户端可以读取本地时区、窗口尺寸、存储和实时数据，再触发正常更新。关键不是服务端与客户端永远相同，而是**第一次客户端渲染要能解释服务端留下的 DOM**。

Vue 能从部分不一致中恢复，但恢复意味着丢弃或重建 DOM，可能导致布局抖动、事件绑定异常和额外计算。开发期的 mismatch 警告应当作为缺陷处理。

## 5. 一次请求的完整时间线

1. HTTP 适配层解析 URL，并创建 request ID、可信 origin 和允许转发的凭据。
2. 应用工厂创建全新的 App、Pinia、Router 与请求级服务。
3. 服务端 Router 使用 `createMemoryHistory()`，执行 `push(url)` 并等待 `isReady()`。
4. 根据已匹配路由加载数据，写入当前请求的 Pinia。
5. `renderToString()` 执行组件的 SSR 渲染，并收集 Teleport 等上下文。
6. 读取最终 Pinia 状态、安全序列化，组合 Head、HTML、资源链接和状态码。
7. 浏览器立刻解析并展示 HTML，同时加载客户端入口。
8. 客户端创建结构相同但全新的应用，使用 `createWebHistory()`。
9. 在任何组件读取 Store 之前恢复状态，等待 Router 就绪，再 `mount('#app')`。
10. Vue Hydration 现有 DOM；后续导航转入普通 SPA 流程。

顺序错误会形成真实 Bug。例如先挂载再恢复 Store，会让客户端第一帧渲染空状态；未等待 Router，则可能用错误页面 Hydration；在 `renderToString()` 前读取状态，会漏掉 `onServerPrefetch()` 写入的数据。

## 6. 最重要的安全规则：每个请求独立实例

下面的模块级单例在 SPA 中很常见，但在 SSR 服务进程中会被所有用户共享：

```ts
// 错误：整个服务进程只有一份可变状态
export const pinia = createPinia()
export const router = createRouter(/* ... */)
```

请求 A 写入的用户资料可能被请求 B 读取，路由也会互相覆盖。这不只是偶发 UI 错误，而是跨用户数据泄漏。

正确结构是无状态模块导出工厂，每个请求调用一次：

<<< ../../../examples/frontend/vue3-ssr/app.mts

以下对象通常必须是请求级的：

- Vue App、Pinia、Router。
- 包含用户认证或租户信息的 API 客户端。
- 本次请求的数据加载缓存、错误收集、Head 管理器。
- request ID、AbortSignal、Locale 等上下文。

数据库连接池、编译产物和只读配置可以进程级复用。判断标准不是“是不是对象”，而是它是否包含请求可变状态。

## 7. 服务端和客户端路由必须同构

服务端没有地址栏和浏览器历史，因此使用 memory history；浏览器使用 web history。路由表必须一致：

<<< ../../../examples/frontend/vue3-ssr/router.mts

服务端必须主动导航并等待异步路由解析：

```ts
await router.push(url)
await router.isReady()
```

应用服务器还必须把所有前端路由交给 SSR handler，静态资源和 API 除外。直接访问 `/lessons/vue3-ssr` 若被 Web Server 当作磁盘文件查找，Vue Router 根本没有机会执行。

路由渲染不是 HTTP 语义。匹配 NotFound 组件后仍需把响应状态设为 404；权限守卫重定向也应转换为 3xx 与 `Location`，而不是返回一个状态为 200 的登录页。避免在流式响应已经发送头部后才发现重定向或致命错误。

## 8. 路由数据加载是一等边界

组件各自在 `onMounted()` 请求数据会让服务端没有内容，也会形成瀑布请求。更稳妥的首屏方案是在路由确定后、渲染开始前统一加载关键数据：

<<< ../../../examples/frontend/vue3-ssr/route-data.mts

Store 的 `loadedId` 同时承担去重契约：

<<< ../../../examples/frontend/vue3-ssr/lesson-store.mts

完整服务端入口：

<<< ../../../examples/frontend/vue3-ssr/entry-server.mts

实际项目可以选择：

- 路由 `meta` 对应加载器。
- 页面组件导出约定的 loader。
- `onServerPrefetch()` 让数据与组件共置。
- Nuxt 的 `useFetch()` / `useAsyncData()` 等框架级机制。

集中路由 loader 更容易设置超时、并行加载和状态码；`onServerPrefetch()` 更接近组件但全局协调较弱。无论哪种方式，都要解决载荷传输和浏览器去重。

在 Nuxt 中，直接于 `setup()` 使用 `$fetch()` 可能在服务端和客户端各执行一次；框架的数据 Composable 会把服务端结果放入 payload，Hydration 时复用。不要绕开框架已有的去重通道。

## 9. 服务上下文与请求头转发

SSR 数据请求常需要当前用户 Cookie，但绝不能把原始请求的所有头部无差别转发到任意 URL。否则可能产生：

- Cookie、Authorization 泄漏到第三方。
- Host、Forwarded 等头部污染。
- 用户输入 URL 导致 SSRF。
- 缓存错误地混合不同用户响应。

示例只对固定同源 API 转发 Cookie 和 request ID，并校验课程 ID：

<<< ../../../examples/frontend/vue3-ssr/lesson-service.ts

生产中还应：

- 由服务端配置 API origin，不信任客户端传入的 Host。
- 使用允许列表转发 Header，区分服务端与浏览器 API Client。
- 为上游请求设置超时、取消、重试上限和请求体大小限制。
- 不在日志中记录 Cookie、Token 或完整个人数据。
- 让 request ID 贯穿 SSR、内部 API 和日志。

## 10. 初始状态必须先恢复，再 Hydration

浏览器入口如下：

<<< ../../../examples/frontend/vue3-ssr/entry-client.mts

恢复状态的三个要点：

1. 使用本次 SSR 返回的状态，而不是重新请求同一数据。
2. 在组件和守卫读取 Store 之前赋给当前 Pinia。
3. 恢复后删除临时全局变量，缩小误用范围。

示例把后续导航的 loader 注册为 `beforeResolve`。首屏时服务端状态已经含 `loadedId`，重复调用会立即返回；浏览器导航到新 ID 时则会真正请求。

真实系统还要为并发导航增加 AbortController 或序列号，避免慢的旧请求覆盖快的新请求。该问题与 CSR 相同，只是 SSR 又多了一次初始状态交接。

## 11. 状态序列化是安全边界

危险做法：

```ts
`<script>window.__STATE__ = ${JSON.stringify(state)}</script>`
```

如果用户内容含 `</script><script>...`，HTML 解析器会提前结束原脚本。JSON 本身合法并不代表嵌入 HTML 安全。

本课对纯 JSON 状态转义 `<`、`>`、`&`、U+2028 和 U+2029：

<<< ../../../examples/frontend/vue3-ssr/safe-serialize.ts

HTML 模板还分别处理文本属性和状态脚本两个上下文：

<<< ../../../examples/frontend/vue3-ssr/html-template.ts

`escapeHtml()` 与状态序列化器不可互换。前者用于 HTML 文本/属性，后者必须生成仍能被 JavaScript 解析的表达式。

生产 Pinia 状态可能含 `Date`、`Map`、`Set`、`BigInt`、`undefined` 或循环引用，单纯 JSON 会丢失语义。Pinia 官方指南建议采用 `devalue` 等安全序列化方案。无论选哪个库，都要确认当前版本的安全公告，并限制载荷只包含客户端确实需要的数据。

绝不要把以下内容序列化给浏览器：

- 密码哈希、访问令牌、刷新令牌。
- 内部权限判断细节与服务端密钥。
- 用户无权查看的完整数据库记录。
- 仅用于服务端渲染的中间数据。

## 12. 常见 Hydration 不一致来源

### 非法 HTML 被浏览器纠正

服务端字符串看起来相同，但浏览器解析时会修改 DOM，例如把 `<div>` 放进 `<p>`。Vue Hydration 看到的已不是服务端 VNode 对应结构。应使用 HTML 校验和真实浏览器测试。

### 随机数和递增 ID

`Math.random()`、进程级计数器和随机 UUID 在两端结果不同。可在服务端生成种子或值并随状态传输，客户端首帧复用。表单控件的 `id` 与 `for` 尤其需要确定性。

### 时间、时区和 Locale

服务器可能是 UTC，用户浏览器是 Asia/Shanghai；同一 `Date` 会格式化成不同文本。首帧使用固定时区或原始 ISO 字符串，挂载后再转换成本地显示：

<<< ../../../examples/frontend/vue3-ssr/ClientClock.vue

### 只存在于浏览器的状态

`window.innerWidth`、`localStorage`、媒体查询、扩展注入 DOM 都可能改变首帧。用 SSR 安全默认值，放到 `onMounted()` 后更新；对纯装饰内容可用 CSS 响应式能力。

### 数据在两端分别请求

服务端请求结果与客户端第二次请求之间可能发生更新。传输初始状态并去重，才能保证同一快照。

### 权限和 Cookie 读取方式不同

服务端从请求 Cookie 识别用户，客户端若初始 Store 仍是访客，会渲染不同分支。把最小、非敏感的会话视图状态放入 payload。

Vue 3.5 提供 `data-allow-mismatch`，可对已知且不可避免的差异选择性压制警告。它不是通用修复：业务内容、表单结构或权限分支不一致仍应修正数据流。

## 13. 生命周期与副作用

SSR 会执行组件创建和 `setup()`，但不会挂载真实 DOM：

| 位置 | 服务端 | 客户端 Hydration | 适合内容 |
| --- | --- | --- | --- |
| 模块顶层 | 会，且可能跨请求复用 | 会 | 只读定义，禁止请求状态 |
| `setup()` | 会 | 会 | 确定性状态和纯计算 |
| `onServerPrefetch()` | 会并等待 | 不用于客户端首帧 | SSR 数据预取 |
| `onMounted()` | 不会 | Hydration 后会 | DOM、Storage、浏览器库 |
| 事件处理器 | 不触发 | 用户交互时触发 | 客户端行为 |
| `onUnmounted()` | SSR 不会执行 | 卸载时执行 | 客户端资源清理 |

不要在 `setup()` 直接启动永久 Timer、订阅或监听器，再指望 `onUnmounted()` 清理；SSR 组件不会挂载，也不会按浏览器组件生命周期卸载。服务端副作用应由请求 handler 管理，并在请求完成或中止时清理。

Vue 为性能会在 SSR 阶段关闭不必要的响应式追踪。SSR 不是长期运行的响应式界面，而是给定状态的一次性 HTML 计算。

## 14. 浏览器专用库的隔离

有些编辑器、图表或旧库在模块加载时就访问 `window`。仅把调用放入 `onMounted()` 仍可能太晚，因为静态 `import` 已在服务端求值。

```ts
onMounted(async () => {
  const { createEditor } = await import('./browser-only-editor')
  createEditor(container.value!)
})
```

更完整的策略包括：

- 选择明确支持 SSR 的依赖。
- 在挂载后动态导入。
- 把组件标记为 client-only，并提供尺寸稳定的 fallback。
- 在 Vite SSR 配置中正确处理 external/noExternal，但不要把配置当作运行时兼容性的替代品。

避免在共享业务模块中到处写 `typeof window !== 'undefined'`。把环境差异集中到适配器、入口和少数组件边界，代码更容易测试。

## 15. Teleport、自定义指令与 Suspense

### Teleport

SSR 无法直接把 Teleport 插入浏览器目标节点。Vue 会把内容收集到 SSR context 的 `teleports`，模板层再放入对应容器。示例读取 `#teleports`：

```ts
const teleportHtml = page.teleports['#teleports'] ?? ''
```

使用独立空容器，避免以 `<body>` 作为目标；body 内其他 SSR 节点会让 Hydration 起点难以确定。

### 自定义指令

多数指令是 DOM 行为，SSR 会忽略。若指令必须输出服务端属性，可实现 `getSSRProps()`。纯展示属性通常更适合直接用模板绑定，减少双环境隐式逻辑。

### Suspense 与流

异步组件和 Suspense 能与服务端渲染协作。流式 API 可以先发送外壳，再发送较慢内容，但需要明确：

- 何时确定状态码和响应头。
- 中途失败返回 fallback 还是终止流。
- CDN 是否缓冲响应，导致流式优势消失。
- 客户端何时拥有对应状态与脚本。
- 首块更快是否换来了更多布局变化。

先建立正确的字符串 SSR，再根据真实测量引入流式复杂度。

## 16. Head、SEO、状态码和重定向

SSR 页面至少应按路由生成：

- 唯一且转义后的 `<title>` 与 description。
- canonical、robots、Open Graph 等必要标签。
- 正确的 HTML `lang`。
- 200、404、401/403、5xx 等真实状态码。
- 服务端可执行的 301/302/307/308 重定向。

组件直接拼接 Head 字符串会造成重复标签、转义和优先级问题。生产项目应使用框架内置 Head 管理或支持 SSR 的专用库，并从 SSR context 收集结果。

Head 内容仍是不可信输出。课程标题来自用户时，必须像正文一样转义，不能因为它位于 `<head>` 就放松安全要求。

## 17. HTTP Handler：最后一道系统边界

完整 Web Standard handler：

<<< ../../../examples/frontend/vue3-ssr/server-handler.mts

它展示了四个容易遗漏的职责：

- URL 与请求上下文进入渲染函数。
- 页面元数据决定响应状态码。
- request ID 同时写入日志和响应头。
- 有 Cookie 的响应使用私有、不可共享缓存策略。

示例的 `clientEntryUrl` 是开发形态。Vite 生产构建后文件名通常带 Hash，应从 manifest 解析客户端入口、CSS 和 module preload，而不是硬编码源文件 URL。

## 18. 缓存：性能工具，也是数据泄漏风险

SSR 缓存至少分三层：

| 层 | 可缓存内容 | 关键风险 |
| --- | --- | --- |
| 数据层 | API/数据库查询结果 | 权限与租户键遗漏 |
| 页面层 | 完整 SSR HTML | 个性化内容被共享 |
| CDN/边缘层 | 公共响应和静态资源 | `Vary` 与 Cache-Control 配置错误 |

页面缓存键必须包含所有影响输出的维度，例如 pathname、query、locale、发布版本；但把完整 Cookie 加入键会造成高基数并泄漏信息。通常选择：

- 公共匿名页允许 CDN/SWR。
- 登录或个性化页 `private, no-store`，或只缓存不含个人数据的片段。
- 静态 Hash 资源长期 immutable。

不要仅凭“当前页面看起来没有用户名”就共享缓存。权限按钮、实验分组、地区价格、CSRF Token 都可能让 HTML 个性化。缓存决策应由明确的页面契约决定。

## 19. 错误、超时和取消

SSR 位于多个系统之间：浏览器、渲染服务器、API 和数据库。没有截止时间，一个慢接口会占住渲染资源并拖垮整个实例。

生产策略通常包括：

- 整体渲染 deadline 与单个上游请求 timeout。
- 客户端断开后传播 AbortSignal，取消无用工作。
- 关键数据失败返回正确 4xx/5xx；非关键区域提供稳定 fallback。
- 重试只用于幂等操作，并限制次数与总时间。
- 错误页本身不依赖同一个失败服务。
- 日志记录 route、request ID、阶段和耗时，不记录秘密。

错误分类应至少区分：未找到、未授权、上游超时、程序缺陷。把所有错误都变成 200 + “暂无数据”会污染 SEO、缓存和监控。

## 20. 性能与可观测性

建议拆分测量：

```text
路由解析 → 数据等待 → Vue renderToString → 模板与序列化 → 网络发送
```

服务端关注：

- p50/p95/p99 TTFB 与各阶段耗时。
- 每秒请求、CPU、内存、事件循环延迟。
- 上游调用次数、超时率和缓存命中率。
- HTML、状态载荷与 Teleport 大小。

浏览器关注：

- LCP 是否真正提前。
- Hydration 的主线程长任务。
- INP 和 Hydration 前点击是否延迟。
- JavaScript 数量是否因 SSR 反而增加。
- mismatch、客户端异常和布局变化。

SSR 仍会把组件 JavaScript 发到浏览器。若主要瓶颈是巨大的交互包，仅增加服务端 HTML 不会解决 Hydration 成本；还需要路由拆包、延迟 Hydration/岛屿架构或减少客户端功能。

## 21. Vite SSR 的开发与生产边界

Vite SSR 是底层 API，不是完整服务器框架。典型开发流程由服务器以 middleware mode 使用 Vite：

- 转换 HTML 模板。
- 通过 `ssrLoadModule` 加载最新服务端入口。
- 提供 HMR 和源码映射。

生产通常构建两份产物：

- 客户端构建：浏览器入口、CSS、静态资源和 manifest。
- SSR 构建：服务器可执行的入口与依赖边界。

生产服务器加载 SSR 产物，通过 manifest 注入带 Hash 的 JS/CSS/preload。还要自行实现安全头、压缩、静态资源、日志、健康检查和部署适配。Vite 官方明确把示例定位为低层级用法，生产应用通常优先采用上层 SSR 框架。

## 22. 手写 Vite SSR 还是使用 Nuxt

适合手写：

- 学习底层机制或迁移现有特殊服务。
- 已有成熟服务器平台，需要精准接入。
- 页面少、团队愿意长期维护双构建和运行时。

适合 Nuxt：

- 需要文件路由、数据载荷去重、Head、错误页、预渲染和混合 route rules。
- 需要 Node、Serverless、Edge 等部署适配。
- 希望把精力放在业务与性能，而非重复搭建 SSR 基础设施。

使用框架不会消除本课原则。模块单例污染、Hydration 不一致、状态泄漏和错误缓存，在 Nuxt 中仍然成立；框架只是提供更成熟的默认通道。

## 23. 测试策略

### 纯函数测试

- 状态序列化能否安全处理 `</script>`、`&`、U+2028。
- HTML 标题和描述是否转义。
- URL 与路由到状态码、缓存策略的映射。

### SSR 集成测试

对 `renderPage(url, context)` 断言：

- HTML 包含目标课程正文。
- Pinia 状态和 HTML 来自同一数据快照。
- 未找到路由返回 404 metadata。
- Teleport 被收集到正确目标。
- 两个并发请求不会读取彼此状态。

“并发请求隔离测试”非常重要：为 A/B 返回不同用户或课程，交错完成请求，再确认 HTML 和 state 都没有串线。

### 浏览器测试

- 记录控制台，任何 Hydration mismatch 都使测试失败。
- 禁用 JavaScript时关键公开内容仍可读。
- 启用 JavaScript后按钮和路由可交互。
- 首屏同一 API 没有重复请求。
- 直接访问深层 URL 返回正确正文和状态码。
- 模拟慢 API、404、500 与断线。

仅用 jsdom 无法完整验证浏览器 HTML 修正与 Hydration，关键路径应在 Playwright 等真实浏览器中执行。

## 24. 生产检查清单

### 正确性

- 每个请求创建 App、Router、Pinia 和请求级服务。
- 服务端 `push(url)` 后等待 Router，再加载数据和渲染。
- 客户端先恢复状态，再等待 Router 和 mount。
- 首屏没有重复数据请求。
- 404、重定向与错误使用真实 HTTP 语义。

### Hydration

- 首帧不依赖随机数、本地时区、窗口和 Storage。
- HTML 结构合法，列表 Key 和 ID 确定。
- 浏览器专用库延迟导入且有稳定 fallback。
- CI 捕获控制台 mismatch。

### 安全与缓存

- 状态使用适合脚本上下文的安全序列化器。
- Payload 不含 Token、秘密和越权字段。
- Header 只向可信上游按允许列表转发。
- 个性化 HTML 不进入共享缓存。
- Head、属性和正文都按各自上下文转义。

### 运行

- 有超时、取消、错误降级和请求关联日志。
- 分阶段测量数据等待与 Vue 渲染耗时。
- 生产资源通过 manifest 注入。
- 容量规划包含 CPU、内存、冷启动和缓存命中率。

## 25. 完整示例结构

```text
examples/frontend/vue3-ssr/
├── App.vue
├── ClientClock.vue
├── HomeView.vue
├── LessonView.vue
├── NotFoundView.vue
├── app.mts
├── entry-client.mts
├── entry-server.mts
├── html-template.ts
├── lesson-service.ts
├── lesson-store.mts
├── route-data.mts
├── router.mts
├── safe-serialize.ts
├── server-handler.mts
└── ssr-types.ts
```

前文已展示核心文件。下面补齐其余文件，保证不用离开页面也能看到全部源码。

### 类型契约

<<< ../../../examples/frontend/vue3-ssr/ssr-types.ts

### 根组件

<<< ../../../examples/frontend/vue3-ssr/App.vue

### 首页

<<< ../../../examples/frontend/vue3-ssr/HomeView.vue

### 课程页

<<< ../../../examples/frontend/vue3-ssr/LessonView.vue

### 404 页

<<< ../../../examples/frontend/vue3-ssr/NotFoundView.vue

这组文件聚焦 SSR 的应用边界，因此未包含具体 Node/Edge 平台启动器、Vite 双构建配置和依赖安装。`handleRequest()` 使用 Web Standard `Request` / `Response`，平台适配层只需把原生请求转换后调用它。生产项目优先采用框架官方模板，不要直接把教学 handler 当成完整服务器。

## 26. 进一步阅读

- [Vue：服务端渲染（SSR）](https://vuejs.org/guide/scaling-up/ssr.html)
- [Vue：服务端渲染 API](https://vuejs.org/api/ssr.html)
- [Vite：Server-Side Rendering](https://vite.dev/guide/ssr)
- [Pinia：Server Side Rendering](https://pinia.vuejs.org/ssr/)
- [Vue Router：不同 History 模式](https://router.vuejs.org/guide/essentials/history-mode.html)
- [Nuxt：Rendering Modes](https://nuxt.com/docs/4.x/guide/concepts/rendering)
- [Nuxt：Data Fetching](https://nuxt.com/docs/4.x/getting-started/data-fetching)

## 27. 本节小结

SSR 的核心不是把 `renderToString()` 接到服务器，而是维护一次安全、确定、可观测的状态交接：服务端按请求创建隔离应用，路由和数据产生 HTML 与状态快照；浏览器用同一结构和同一快照 Hydration，再接管后续交互。

工程中最危险的错误通常位于边界：模块单例导致跨请求污染，原始 JSON 导致 XSS，个性化 HTML 进入公共缓存，客户端重复请求造成 mismatch，浏览器 API 混入服务端执行。把这些边界设计清楚，SSR 才能从“能跑的 Demo”变成可靠的生产架构。
