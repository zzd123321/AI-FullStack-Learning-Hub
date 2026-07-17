---
title: Vue 3 SSR、Hydration 与同构应用边界
description: 从一次请求的两端执行出发，理解请求隔离、数据预取、安全状态传输与 Hydration 一致性
outline: deep
---

# Vue 3 SSR、Hydration 与同构应用边界

> 适用环境：Vue 3、Vue Router 4、Pinia、Vite SSR，以及采用相同原理的 Nuxt。生产 SSR 涉及构建、缓存、安全和运行平台，优先采用成熟框架；本课用底层示例解释它们替你解决的问题。

CSR 应用的组件只在浏览器运行。SSR 应用中，同一页面至少执行两次：

```text
第一次：服务器根据本次 HTTP 请求生成 HTML
第二次：浏览器用同一份初始状态 Hydrate 这段 HTML
```

几乎所有 SSR 难点都来自这句话：

- 两次执行怎样得到可对应的首帧？
- 服务器怎样保证不同用户的状态不混在一起？
- 第一次取到的数据怎样安全交给第二次，而不重复请求？
- 只存在于浏览器或服务器的副作用放在哪里？

## SSR 先解决“内容何时到达”，不保证一切更快

纯客户端渲染通常是：

```text
请求 HTML
  ↓
下载并执行应用 JavaScript
  ↓
创建 Vue 应用
  ↓
请求首屏数据
  ↓
生成内容 DOM
```

SSR 把首屏组件和数据请求提前到服务器：

```text
HTTP 请求
  ↓
匹配路由并加载数据
  ↓
服务器生成带内容 HTML
  ↓
浏览器先展示内容
  ↓
下载 JavaScript 并 Hydrate
  ↓
页面可交互
```

它可能改善：

- 慢网络和弱设备上的首屏内容到达；
- 搜索引擎和分享机器人读取正文、标题与描述；
- 首屏数据请求与后端之间的网络距离。

它也增加：

- 服务器 CPU 和内存；
- TTFB；
- HTML 与状态载荷；
- 两套构建产物；
- Hydration 主线程成本；
- 请求隔离、缓存和同构代码复杂度。

页面可能很早可见，却在 Hydration 完成前不能响应点击。因此不能只看“view source 有内容”，还要同时测 TTFB、LCP、INP、Hydration 长任务和服务器资源。

## 先选择渲染模式，再写 SSR 代码

| 模式 | 内容何时生成 | 常见场景 |
| --- | --- | --- |
| CSR | 浏览器运行时 | 登录后台、强交互工具 |
| SSR | 每次请求 | 个性化或高时效公开页 |
| SSG / 预渲染 | 构建时 | 文档、博客、营销页 |
| 缓存再生 / SWR | 请求结果缓存并更新 | 商品、内容详情 |
| 混合渲染 | 每条路由独立选择 | 官网、内容与后台共存 |
| 流式 SSR | 请求中分段输出 | 数据到达时间差异大的页面 |

所有用户看到相同内容时，SSG 通常更便宜、更稳定。本学习站本身就是 VitePress 生成的静态站点，不需要为每次访问运行 Vue SSR。

“边缘渲染”描述运行位置，不是另一套 Hydration 语义。边缘运行时可能没有完整 Node API，还要考虑包体、冷启动、数据库连接与区域一致性。

## Hydration 不是把页面重新画一遍

服务器返回的 DOM 已经存在。浏览器端使用 `createSSRApp()` 挂载时，Vue 会把组件实例、事件监听器和响应式更新能力连接到这些节点，这一步是 Hydration。

首帧必须大致满足：

```text
服务器：URL + 请求状态 + 数据快照 → VNode / HTML
客户端：URL + 传输状态 + 同一代码 → 首次 VNode

两边结果能够一一对应
```

Hydration 后，浏览器当然可以读取 localStorage、窗口尺寸、本地时区或实时数据并正常更新。要求相同的是**客户端第一次用于认领服务端 DOM 的渲染**，不是之后永远相同。

Vue 遇到 mismatch 会尝试恢复，但可能丢弃或重建节点，带来布局变化、状态丢失和额外成本。开发环境的 mismatch 警告应该先调查，而不是习惯性忽略。

## 一次 SSR 请求的时间线

1. HTTP 适配层生成 request ID，并读取可信运行配置。
2. 为本次请求创建新的 App、Router、Pinia 和服务上下文。
3. Memory Router 主动 `push(url)`，再等待 `router.isReady()`。
4. 根据最终匹配路由加载首屏数据。
5. `renderToString()` 执行组件，生成应用 HTML 并收集 Teleport。
6. 渲染结束后读取 Pinia 状态，安全序列化。
7. 组合 title、meta、资源链接、状态码、HTML 和状态载荷。
8. 浏览器解析 HTML，并加载客户端入口。
9. 客户端创建结构相同但全新的 App、Router 和 Pinia。
10. 在任何 Store 被组件读取前恢复状态，等待 Router，再 mount。
11. Vue Hydrate 已有 DOM；后续导航转成普通 SPA 更新。

这个顺序包含多个正确性条件：

- 未等 Router 就渲染，可能生成错误页面；
- render 前读取 Store，会漏掉 `onServerPrefetch()` 写入；
- 客户端先 mount 再恢复状态，首帧会按空 Store 渲染；
- 不传输服务器数据，客户端二次请求可能拿到不同快照。

## 最重要的隔离：每个请求创建一套可变实例

SPA 中常见的模块单例：

```ts
export const pinia = createPinia()
export const router = createRouter(/* ... */)
```

放到常驻 SSR 进程里会被所有请求共享。请求 A 写入用户资料后，请求 B 可能读取到它；两个 Router 的当前地址也会互相覆盖。这是跨用户数据泄漏，不只是偶发 UI 问题。

正确做法是工厂：

<<< ../../../examples/frontend/vue3-ssr/app.mts

服务端每个请求调用一次。通常属于请求级：

- Vue App、Router、Pinia；
- 用户或租户相关 API Client；
- 本次数据加载缓存与 AbortSignal；
- Head、错误与状态码收集；
- request ID、Locale、认证视图。

可以进程级共享的通常是：

- 数据库连接池；
- 编译产物；
- 不变配置；
- 不含用户状态的只读缓存。

判断标准不是“它是不是对象”，而是它是否保存了请求可变状态。

## 服务端和浏览器共享路由表，不共享 History 实例

路由工厂：

<<< ../../../examples/frontend/vue3-ssr/router.mts

服务器没有地址栏和前进后退，使用 `createMemoryHistory()`；浏览器使用 `createWebHistory()`。

服务端必须主动导航：

```ts
await router.push(url)
await router.isReady()
```

Web Server 也要把应用路由交给 SSR Handler，静态资源和 API 例外。若 `/lessons/vue3-ssr` 被当成磁盘文件查找，Vue Router 根本没有运行机会。

路由组件不自动决定 HTTP 语义：

- NotFound 页面应返回 404；
- 真正重定向应返回 3xx 和 Location；
- 服务端故障应返回合适 5xx；
- 流式响应一旦发出响应头，再发现重定向就太迟了。

## 首屏数据要在渲染前准备，并交给浏览器复用

如果页面只在 `onMounted()` 请求，服务器渲染时不会执行该钩子，HTML 只能得到 loading。

示例先根据路由决定数据：

<<< ../../../examples/frontend/vue3-ssr/route-data.mts

Store 保存数据和 loadedId：

<<< ../../../examples/frontend/vue3-ssr/lesson-store.mts

服务端入口：

<<< ../../../examples/frontend/vue3-ssr/entry-server.mts

可选组织方式包括：

- 路由 meta 对应 loader；
- 页面模块导出 loader；
- `onServerPrefetch()`；
- Nuxt `useFetch()`、`useAsyncData()`。

集中 loader 便于并行、超时、状态码和重定向；组件级预取更靠近消费位置。无论选哪种，都必须解决：

```text
服务端取数
  ↓ 写入请求级 Store
render 得到 HTML
  ↓ 安全序列化同一快照
浏览器恢复 Store
  ↓ loadedId 去重
Hydration 不再重复首屏请求
```

在 Nuxt 中，`useFetch/useAsyncData` 会把服务端结果放入 payload，Hydration 时复用。直接在 setup 中随意使用 `$fetch` 可能让同一读取在两端各执行一次；浏览器事件触发的写操作则适合 `$fetch`。

## 客户端恢复必须发生在 Store 第一次消费之前

<<< ../../../examples/frontend/vue3-ssr/entry-client.mts

顺序是：

1. 创建 Pinia；
2. 赋入服务端初始状态；
3. 等 Router 初始导航；
4. 注册后续客户端导航的数据加载；
5. mount 并 Hydrate。

后续从课程 A 快速导航到 B、C 时仍会出现普通异步竞态。示例 Store 同时使用：

- AbortController 尽早停止旧请求；
- 递增序号禁止旧结果提交；
- 只有最新请求可以关闭 loading。

SSR 只多了首屏交接，并没有让 CSR 的异步所有权问题消失。

## SSR 服务调用是安全边界

服务端往往要带当前会话访问内部 API。危险做法是：

```ts
const apiOrigin = new URL(request.url).origin
fetch(new URL(path, apiOrigin), {
  headers: request.headers
})
```

在某些部署中 Host 可被外部控制，这会把 Cookie 或 Authorization 转发到攻击者 Origin，也可能形成 SSRF。复制全部请求头还会传播 Host、Forwarded 等不适合的值。

示例服务：

<<< ../../../examples/frontend/vue3-ssr/lesson-service.ts

HTTP Handler：

<<< ../../../examples/frontend/vue3-ssr/server-handler.mts

它们建立了几条明确规则：

- API Origin 由可信部署配置传入，不从请求 Host 推导；
- 课程 ID 先按允许格式验证；
- 只转发指定的 `__Host-session` Cookie 和 request ID；
- 上游 JSON 作为 unknown 做运行时结构校验；
- 用户可控 URL 不能决定请求目标；
- 含 Cookie 的页面不进入共享缓存。

生产环境还要设置上游超时、取消、有限重试、响应体大小和日志脱敏。request ID 应贯穿 SSR、内部 API 和错误日志。

## TypeScript 类型不能替代上游响应校验

```ts
return (await response.json()) as Lesson
```

只是告诉编译器“相信我”，不会检查网络返回。上游部署错误、网关 HTML、旧 API 字段或攻击输入都可能破坏假设。

完整服务使用 `parseLesson(unknown)` 验证必需字符串字段，再返回 Lesson。大型项目可以用 schema 库，但原则相同：

```text
网络数据 unknown
  ↓ 运行时验证
可信领域类型
```

SSR 在服务端访问内部 API，也不能因为“都是我们自己的服务”就省略边界检查。

## 初始状态序列化同时面对数据语义和 XSS

危险模板：

```ts
`<script>window.__STATE__ = ${JSON.stringify(state)}</script>`
```

若用户内容包含 `</script><script>...`，HTML 解析器会提前结束脚本。JSON 合法不代表把它嵌入 HTML 就安全。

本课限定状态只能是 JSON 值，并转义会破坏脚本上下文的字符：

<<< ../../../examples/frontend/vue3-ssr/safe-serialize.ts

文档模板：

<<< ../../../examples/frontend/vue3-ssr/html-template.ts

注意不同输出上下文不能共用一个转义函数：

- title、meta 属性使用 HTML 转义；
-内联状态使用脚本安全序列化；
- `appHtml` 来自 Vue SSR Renderer；
- headTags、Teleport 和资源 URL 必须来自可信框架/Manifest，不能直接拼用户输入。

真实 Pinia 状态可能含 Date、Map、Set、BigInt、undefined 或循环引用。JSON 会丢失语义。Pinia 官方建议考虑 `devalue` 等安全序列化方案；选择库时要检查当前安全公告，并让服务端与客户端使用匹配解析协议。

更重要的是控制载荷内容。绝不能把以下状态发给浏览器：

- Token、密码哈希和服务端密钥；
- 用户无权查看的完整记录；
- 内部权限判断依据；
- 只为服务器计算使用的中间数据。

序列化做得安全，不代表不该公开的数据可以公开。

## Hydration mismatch 的原因不是“Vue 随机出错”

### 浏览器修正了非法 HTML

```html
<p><div>错误嵌套</div></p>
```

服务器字符串可以生成，浏览器解析时却会自动关闭 p，实际 DOM 结构已改变。应使用 HTML 校验并在真实浏览器测试。

### 两边生成了不同随机值

`Math.random()`、无种子 UUID、进程级递增 ID 在服务器和客户端不会自然相同。可以：

- 服务端生成值并随状态传输；
- 使用同一随机种子；
- 挂载后才显示纯客户端内容。

### 时区和 Locale 不同

服务器可能运行在 UTC，用户位于上海。两边对同一 Date 格式化会得到不同文本。

<<< ../../../examples/frontend/vue3-ssr/ClientClock.vue

示例首帧渲染确定性占位，挂载后才读取用户本地时区。

### 首帧读取浏览器状态

`window.innerWidth`、localStorage、媒体查询只存在于客户端。使用 SSR 安全初值，在 `onMounted()` 后更新；纯响应式布局优先交给 CSS。

### 两端各自请求了一次

两次请求可能返回不同版本。应传输服务端快照并在 Hydration 去重。

### 会话初值不一致

服务器从 Cookie 得到已登录用户，客户端 Store 却从访客开始，会渲染不同权限分支。传输最小、非敏感的会话视图状态。

Vue 3.5+ 的 `data-allow-mismatch` 可以选择性压制确实不可避免的差异。它只隐藏警告和特定恢复噪声，不会修复错误的数据流；权限、表单和业务内容不应靠它掩盖。

## Universal Code 不能假设自己运行在哪里

服务端会执行 setup 和用于 SSR 的创建逻辑，但没有真实 DOM。`onMounted/onUpdated/onUnmounted` 不在 SSR 阶段执行。

因此不要在 setup 顶层启动需要 unmount 清理的计时器：

```ts
// SSR 中可能创建后永远没有 onUnmounted 清理
const timer = setInterval(refresh, 1000)
```

浏览器副作用放到 `onMounted()`：

```ts
onMounted(() => {
  const timer = window.setInterval(refresh, 1000)
  onUnmounted(() => window.clearInterval(timer))
})
```

模块顶层同样会在服务进程加载时执行，不能读取 window/document，也不能创建用户相关状态。

### 浏览器专用库

有些编辑器、图表库在 import 时就访问 document。仅在 mounted 中调用仍不够，因为静态 import 已经在服务器求值。

可在客户端生命周期中动态 import：

```ts
onMounted(async () => {
  const { createEditor } = await import('./browser-only-editor')
  editor = createEditor(element.value)
})
```

同时处理卸载前 import 尚未完成的竞态，并在 unmount 销毁实例。成熟框架通常提供 ClientOnly 边界。

## Teleport、指令和流式输出需要专门协议

SSR Teleport 不在主 appHtml 中，Renderer 把结果放入 SSRContext。示例读取 `ssrContext.teleports`，再注入专用 `#teleports` 容器。

不要把 SSR Teleport 直接指向 body。body 中混有其他服务端节点，Hydration 很难确定目标范围。

自定义指令通常操作 DOM，SSR 会忽略这部分。若服务端必须输出对应属性，指令需实现 `getSSRProps()`，并保证客户端结果一致。

流式 SSR 能更早发送部分 HTML，但响应头一旦发送，后续才发现的 404、重定向和致命错误无法再正常修改状态。关键权限和状态码判断应尽量在开始流之前完成。

## Head、状态码和缓存都属于渲染结果

组件树只生成主体 HTML，不自动完成：

- title、description、canonical；
- Open Graph；
- html lang；
- HTTP status；
- redirect；
- preload/modulepreload；
- CSP nonce。

这些信息应由路由与数据结果汇总，再由可信 Head 管理器和服务器适配层输出。用户内容必须按对应 HTML 上下文转义。

缓存前先回答：

```text
这份 HTML 是否因 Cookie、Authorization、语言、地区、
实验分组、设备或权限不同？
```

若答案是“会”，共享缓存键必须包含这些维度，或者直接标记 private/no-store。最危险的错误是把用户 A 的个性化 SSR HTML 缓存后交给用户 B。

匿名公开页面可以 CDN 缓存或 SWR，但 HTML、状态载荷和 Head 必须来自同一个快照。接口数据缓存也不能跨越租户或权限边界。

## 错误、取消和超时必须在请求范围内结束

浏览器断开连接后，SSR 和上游请求若继续运行会浪费资源。生产 Handler 应把请求取消信号向下传递到：

- 路由数据 loader；
- fetch；
- 数据库或内部 RPC；
- 可中止的渲染任务。

上游请求必须有超时。重试仅针对明确可恢复且幂等的读取，并设置次数和退避；盲目重试会放大故障。

错误输出不能包含 stack、Token、Cookie 或内部地址。客户端看到稳定错误页，日志通过 request ID 保留诊断上下文。

## Vite SSR 是底层能力，生产通常需要上层框架

Vite 开发期可用 `ssrLoadModule()` 转换并加载服务端入口。生产需要两份构建：

1. 客户端资源和 Manifest；
2. 可由服务器运行的 SSR Bundle。

服务器使用生产 Manifest 注入带哈希资源、modulepreload 和样式，不能把示例中的 `/src/entry-client.mts` 当成生产 URL。

完整系统还需要：

- 开发与生产模块加载；
- Head 与资源提示；
- 路由数据协议；
- 安全状态传输；
- 404/redirect/error；
- 流式与缓存；
- 部署适配；
- 可观测性。

Vue 官方建议真实 SSR 项目优先使用 Nuxt 等上层方案。手写 Vite SSR 适合学习原理、框架研发或确有特殊运行环境的团队，不代表业务项目应重复建设这些基础设施。

## 测试应覆盖“两次执行的交接”

纯函数：

- safe serializer 能否阻断 `</script>`；
- HTML 文本转义；
- 上游 JSON 解析；
- 状态码和缓存策略；
- Cookie allowlist。

SSR 集成：

- 两个并发请求得到独立 Pinia 与 Router；
- URL 匹配正确页面；
- 首屏数据进入 HTML 和 payload；
- NotFound 返回 404；
- 用户 A 状态不出现在用户 B HTML；
- Teleport 注入正确容器。

浏览器：

- 控制台没有意外 Hydration warning；
- 首屏数据不重复请求；
- SSR HTML 能成功 Hydrate 并交互；
- 客户端导航加载新数据；
- 本地时区内容只在挂载后更新；
- 慢旧导航不能覆盖新页面。

还应对 SSR 响应做 XSS 用例，把 `</script>`、HTML 字符和 Unicode 分隔符放进标题、描述与状态中。

## 完整示例阅读路线

类型契约：

<<< ../../../examples/frontend/vue3-ssr/ssr-types.ts

应用和路由工厂：

<<< ../../../examples/frontend/vue3-ssr/app.mts

<<< ../../../examples/frontend/vue3-ssr/router.mts

请求级数据：

<<< ../../../examples/frontend/vue3-ssr/lesson-service.ts

<<< ../../../examples/frontend/vue3-ssr/lesson-store.mts

<<< ../../../examples/frontend/vue3-ssr/route-data.mts

两端入口：

<<< ../../../examples/frontend/vue3-ssr/entry-server.mts

<<< ../../../examples/frontend/vue3-ssr/entry-client.mts

安全文档输出：

<<< ../../../examples/frontend/vue3-ssr/safe-serialize.ts

<<< ../../../examples/frontend/vue3-ssr/html-template.ts

<<< ../../../examples/frontend/vue3-ssr/server-handler.mts

页面组件：

<<< ../../../examples/frontend/vue3-ssr/App.vue

<<< ../../../examples/frontend/vue3-ssr/HomeView.vue

<<< ../../../examples/frontend/vue3-ssr/LessonView.vue

<<< ../../../examples/frontend/vue3-ssr/NotFoundView.vue

因果主线：

```text
每个 HTTP 请求创建独立应用
  ↓
根据 URL 加载一份数据快照
  ↓
生成 HTML、Head、状态码
  ↓
只传输必要状态并安全序列化
  ↓
浏览器先恢复同一快照
  ↓
Hydrate 已有 DOM
  ↓
后续导航按普通 SPA 管理取消与竞态
```

## 常见误区

### 在服务端复用 Pinia 单例

会让请求和用户状态串线。每个请求创建新实例。

### 认为 SSR HTML 出现就已可交互

事件需要客户端 JavaScript 和 Hydration。测量可见与可交互两个阶段。

### 在两端分别请求首屏数据

结果快照可能不同并浪费请求。传输状态并去重。

### 用 JSON.stringify 直接拼进 script

JSON 合法不等于 HTML 安全。使用适合脚本上下文的安全序列化。

### 从 Host 推导内部 API Origin

可能形成 SSRF 或凭据泄漏。Origin 由可信部署配置提供。

### 用 data-allow-mismatch 压掉所有警告

它不会修复权限、状态和结构不一致，只用于确实不可避免的局部差异。

### 把所有页面都改成 SSR

后台和静态内容可能更适合 CSR 或 SSG。按路由的内容、SEO和时效需求选择。

## 本课小结

- SSR 让内容更早到达，Hydration 让已有 DOM 获得交互能力；
- 同一页面在服务端和客户端执行两次，首帧必须共享同一 URL 与状态快照；
- App、Router、Pinia 和用户相关服务必须每请求创建，防止跨用户泄漏；
- 首屏数据在渲染前加载，并通过安全 payload 交给浏览器复用；
- API Origin、Header 转发和网络响应解析都是服务端安全边界；
- 随机数、时区、非法 HTML 和浏览器状态是常见 mismatch 根因；
- 浏览器副作用放在 mounted，浏览器专用库还要延迟 import；
- 状态码、Head、Teleport、缓存、超时和日志都是完整 SSR 输出的一部分；
- 手写 Vite SSR 能解释原理，生产业务通常应采用 Nuxt 等成熟框架。

下一节是[Vue 2 到 Vue 3 的渐进式迁移与大型应用架构](/frontend/vue3/vue2-to-vue3-progressive-migration-and-architecture)。SSR 强调请求级边界，迁移课会把前面所有组件、状态、路由、测试和构建边界放回真实大型 Vue 2 系统中，解释如何逐步替换而不是一次重写。

## 官方资料

- [Vue：服务端渲染](https://vuejs.org/guide/scaling-up/ssr.html)
- [Vue：SSR API](https://vuejs.org/api/ssr.html)
- [Pinia：Server Side Rendering](https://pinia.vuejs.org/ssr/)
- [Vue Router：Memory History](https://router.vuejs.org/guide/essentials/history-mode.html#memory-mode)
- [Vite：Server-Side Rendering](https://vite.dev/guide/ssr.html)
- [Nuxt：数据获取](https://nuxt.com/docs/4.x/getting-started/data-fetching)
