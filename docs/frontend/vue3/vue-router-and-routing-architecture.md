---
title: Vue Router 4 与前端路由架构
description: 设计 URL 状态、嵌套路由、路由 Props、数据加载、导航守卫、权限边界与代码分割
---

# Vue Router 4 与前端路由架构

> 适用环境：Vue 3、Vue Router 4、TypeScript、Vite。本节以稳定的 Vue Router 4 API 为主，不依赖实验性的文件路由或 Data Loaders。

## 1. 学习目标

完成本节后，你应该能够：

- 把 URL 设计成可分享、可刷新、可前进后退的页面状态。
- 选择 params、query、hash 和 history state 的正确边界。
- 使用命名路由、动态参数和嵌套路由设计页面结构。
- 通过路由 Props 降低视图组件与 Router 的耦合。
- 处理参数变化时组件复用和异步请求竞态。
- 理解全局、路由级和组件级导航守卫的职责。
- 区分前端访问控制与后端授权。
- 使用动态 `import()` 做路由级代码分割。
- 正确处理 History 模式、404、滚动与导航失败。

## 2. Router 管理的不是“页面切换动画”

客户端路由建立三者映射：

```text
URL ↔ 匹配到的路由记录 ↔ 渲染的组件树
```

一个可靠 URL 应满足：

- 刷新后仍能还原页面。
- 可复制给另一个有权限的用户。
- 浏览器前进/后退符合预期。
- 搜索引擎或服务端能理解入口（若业务需要）。
- 不暴露敏感信息。

路由不是把组件名放进字符串；它是应用的公开导航协议。

## 3. 哪些状态应该进入 URL

| 状态 | 推荐位置 | 示例 |
| --- | --- | --- |
| 资源身份 | path params | `/lessons/vue-router` |
| 可分享筛选、分页 | query | `?keyword=vue&page=2` |
| 页面内锚点 | hash | `#guards` |
| 短暂且不适合展示的数据 | history state 或本地状态 | 返回来源、临时 UI 信息 |
| 敏感凭证 | 不进入 URL | Token、密码、隐私数据 |

URL 会进入浏览器历史、服务器日志、分析系统和 Referer。不要把 Token 或敏感表单数据放进 params/query。

## 4. 创建并安装 Router

```ts
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

createApp(App).use(router).mount('#app')
```

插件必须在 `mount()` 前安装。安装过程会注册 `RouterLink`、`RouterView`，并提供 `$router`、`$route`、`useRouter()` 与 `useRoute()`。

完整入口：

<<< ../../../examples/frontend/vue3-router/main.mts

<<< ../../../examples/frontend/vue3-router/App.vue

## 5. History 模式怎么选

### `createWebHistory()`

生成正常 URL，如 `/lessons/vue-router`，通常是生产项目首选。服务器必须把未命中静态资源的应用路由回退到 `index.html`，否则直接刷新会返回服务器 404。

回退规则不能吞掉真实 API 和静态文件 404。部署平台应按路径范围配置，而不是无条件返回 HTML。

### `createWebHashHistory()`

生成 `/#/lessons/vue-router`。服务器不接收 `#` 后内容，因此一般不需要 history fallback，但 URL 表达和 SEO 较弱。

### `createMemoryHistory()`

不读取浏览器 URL，适合 SSR、测试或非浏览器环境。SSR 中服务端必须先把请求 URL push 到 Router，并等待 `router.isReady()` 后渲染。

## 6. 路由记录是应用信息架构

按页面结构组织路由，而不是按组件文件随意平铺：

```text
App
├── /lessons                 课程列表
├── /lessons/:lessonId       课程详情
├── /lessons/:lessonId/edit  课程编辑
├── /login                   登录
└── /:pathMatch(.*)*         404
```

每条路由应有稳定名称。路径可能因产品文案、国际化或层级调整而变化，业务跳转使用路由名能减少硬编码。

```ts
router.push({
  name: 'lesson-detail',
  params: { lessonId: lesson.id }
})
```

Vue Router 会负责参数编码；不要手工拼接未经编码的路径。

## 7. Params 与 Query 的运行时类型

浏览器 URL 本质上只有字符串。即使业务认为 `page` 是数字，`route.query.page` 仍可能是：

- `undefined`。
- 一个字符串。
- 重复 query 形成的字符串数组。
- 非法数字、负数或超大值。

因此要在路由边界解析和归一化：

```ts
props: (route) => ({
  page: Math.max(1, Number(route.query.page) || 1)
})
```

TypeScript 只描述 Router API 的可能类型，不能保证用户地址栏输入符合业务规则。

## 8. 路由 Props 解耦视图

直接在页面深处读取：

```ts
const lessonId = useRoute().params.lessonId
```

会让组件只能在特定路由中使用。配置 `props: true` 后，动态 params 会作为 Props 传入：

```ts
{
  path: '/lessons/:lessonId',
  component: LessonDetailView,
  props: true
}
```

组件只声明：

```ts
defineProps<{ lessonId: string }>()
```

它更容易单测、Storybook 展示和复用。对于 query，应使用 Props 函数完成解析，不要把整个 Route 对象传给组件。

路由视图仍可使用 `useRouter()` 执行导航；解耦目标是让数据输入清晰，不是禁止所有 Router API。

## 9. 嵌套路由对应嵌套布局

父路由组件中的 `<RouterView />` 是子路由出口：

<<< ../../../examples/frontend/vue3-router/AppShell.vue

子路由的相对 path 不以 `/` 开头：

```ts
{
  path: '/',
  component: AppShell,
  children: [
    { path: 'lessons', component: LessonListView }
  ]
}
```

若子 path 以 `/` 开头，它会成为根路径，但仍可利用组件嵌套。Vue Router 4.1+ 也允许无 component 的父记录，用于只分组 path、meta 或守卫。

嵌套层级应表达真实布局与导航关系，不要仅为了目录结构制造多层空 RouterView。

## 10. 动态参数变化会复用组件

从 `/lessons/a` 导航到 `/lessons/b` 时，两条 URL 匹配同一记录，Vue Router 会复用组件实例。结果是：

- `onMounted()` 不会重新执行。
- 组件本地状态可能被保留。
- 必须观察相关 param/prop 的变化。

不要 watch 整个 `route`，只观察真正依赖的字段：

```ts
watch(() => props.lessonId, load, { immediate: true })
```

如果参数变化还需要决定能否离开当前状态，使用 `onBeforeRouteUpdate()`；纯数据刷新通常用 watch 更直接。

## 11. 路由级数据获取的两种时机

### 导航后获取

先完成导航并渲染 loading，再由组件加载数据：

- 页面反馈快。
- 易实现骨架屏和局部错误。
- 必须处理旧请求取消、空态和内容闪烁。

### 导航前获取

在 `beforeResolve` 或框架数据加载机制中先取数据，再确认导航：

- 用户不会先看到空页面。
- 慢请求会让导航保持 pending。
- 需要全局进度、错误跳转和取消策略。

没有一种方案适合所有页面。详情内容通常可导航后加载；进入前必须验证的核心数据或权限可导航前处理。

## 12. 数据请求必须跟随路由生命周期

下面的详情页同时解决组件复用和请求竞态：

<<< ../../../examples/frontend/vue3-router/LessonDetailView.vue

`onWatcherCleanup()` 会在参数变化或 watcher 停止时取消旧请求。旧请求的 `finally` 也不能关闭新请求的 loading，因此示例先检查 `signal.aborted`。

Vue 3.4 及更早版本可使用 watch 回调的第三个 `onCleanup` 参数实现相同目的。

## 13. URL 是筛选状态的事实来源

列表的已提交筛选应该来自 URL，输入中的临时草稿可以留在本地：

```text
draftKeyword：用户正在输入，尚未提交
props.keyword：URL 中已提交、可分享的筛选
```

完整列表页：

<<< ../../../examples/frontend/vue3-router/LessonListView.vue

`router.push()` 创建一条历史记录，适合用户明确提交的新查询；输入每个字符都同步时通常使用节流后的 `router.replace()`，避免污染后退历史。

不要同时让 Store 和 URL 都成为筛选条件的独立事实来源。可以由 Store 缓存结果，但查询键应从规范化 URL 产生。

## 14. 完整数据服务

示例服务与 Vue Router 解耦，并接受 `AbortSignal`：

<<< ../../../examples/frontend/vue3-router/lesson-api.mts

真实服务还应区分 404、未授权、验证错误与网络失败。404 是资源不存在，不一定等于路由记录不存在：`/lessons/missing` 匹配详情路由，但 API 可能返回资源 404。

产品可选择在详情页展示“课程不存在”，或导航到专用资源 404 页面；不要把所有 API 异常都重定向到通用 404。

## 15. 导航守卫的执行结果

现代守卫通过返回值表达结果：

```ts
router.beforeEach((to) => {
  if (!canAccess(to)) return { name: 'login' }
  if (!isValid(to)) return false
})
```

- 返回 `undefined` 或 `true`：继续。
- 返回 `false`：取消，并在需要时恢复来源 URL。
- 返回路由位置：取消当前导航并发起重定向。
- 抛出错误：取消导航并交给 `router.onError()`。

旧式第三参数 `next` 仍受支持，但每条逻辑路径必须恰好调用一次，容易重复或遗漏。新代码优先返回值。

## 16. 三类守卫的职责

### 全局守卫

`beforeEach` 适合身份与全局访问策略；`beforeResolve` 在异步组件和组件内守卫完成后、确认导航前运行；`afterEach` 不能改变导航，适合标题、分析和可访问性通知。

### 路由级 `beforeEnter`

适合某条记录独有的输入约束。注意只改变 params、query 或 hash 且仍匹配同一条记录时，它不会重新运行。

### 组件内守卫

`onBeforeRouteLeave()` 适合未保存草稿；`onBeforeRouteUpdate()` 适合复用组件时对参数变化做可取消处理。

守卫越全局，越应只包含真正全局的规则。

## 17. Meta 是声明，不是权限本身

```ts
meta: {
  title: '编辑课程',
  requiresAuth: true,
  roles: ['editor']
}
```

`route.meta` 是所有匹配记录 meta 的非递归合并结果，适合让全局守卫统一解释访问策略。可以通过模块扩展为 `RouteMeta` 增加类型。

但 meta 只是一段客户端配置。用户可以修改前端代码、直接调用 API，因此后端必须再次验证身份和资源级权限。

“有 editor 角色”也不代表可以编辑任意课程；对象所有权、租户和记录状态属于后端授权。

## 18. 登录重定向安全

受保护页面常跳转到：

```text
/login?redirect=/lessons/vue-router/edit
```

登录成功后用 `replace()` 返回目标，避免后退再次进入登录页。但 `redirect` 来自不可信 URL，不能直接接受 `https://evil.example` 或 `//evil.example`，否则形成开放重定向。

示例只允许以单个 `/` 开头的站内路径，并提供安全默认值。

## 19. 完整 Router、守卫与 Meta 类型

<<< ../../../examples/frontend/vue3-router/router.mts

会话接口：

<<< ../../../examples/frontend/vue3-router/session.mts

示例为了聚焦 Router 使用同步会话对象。接入 Pinia 时，应确保 `app.use(pinia)` 已执行，或显式把正确 Pinia 实例传给 `useSessionStore(pinia)`；SSR 尤其不能使用跨请求全局 Store。

## 20. 编辑页离开保护

<<< ../../../examples/frontend/vue3-router/LessonEditView.vue

离开守卫只负责“是否允许导航”，保存行为仍属于组件/Store/服务层。还要结合 `beforeunload` 处理关闭标签页或整页刷新；浏览器原生提示文本通常不可自定义。

不要在多个嵌套组件分别弹确认框。由草稿所有者统一维护 dirty 状态和离开策略。

## 21. 代码分割

路由组件使用动态导入：

```ts
component: () => import('./LessonDetailView.vue')
```

不要写成：

```ts
component: defineAsyncComponent(() => import('./LessonDetailView.vue'))
```

Vue Router 自己支持懒加载函数。构建工具会形成异步 chunk，首次进入路由时加载。

分包不是越碎越好：

- 同一页面必须同时出现的小组件通常随页面打包。
- 高频相邻页面可由构建工具手动分组。
- 大型编辑器、图表等适合独立异步加载。
- 用真实网络和缓存条件衡量，不只看 chunk 数量。

动态导入失败可能来自发布后旧 HTML 引用已删除 chunk，应通过版本化静态资源、合理缓存和错误恢复策略处理。

## 22. `RouterLink` 与原生链接

应用内部导航优先 `RouterLink`：它能生成正确 href、处理编码、阻止无修饰键的整页加载，并提供 active 状态。

仍应使用真实 `<a>` 的场景：

- 外部网站。
- 文件下载。
- 需要浏览器完整文档导航。
- 非 SPA 管理的路径。

不要把普通按钮伪装成链接。导航用链接，提交或改变当前页面状态用按钮。

## 23. `push` 与 `replace`

`push` 增加历史记录：

- 打开详情。
- 提交新筛选。
- 用户明确进入下一页。

`replace` 替换当前记录：

- 登录成功离开登录页。
- 修正规范化 query。
- 高频同步、不希望后退逐条经过的状态。

两者都返回 Promise。程序化导航后有依赖顺序的逻辑应 `await`，并识别导航失败，而不是假设调用即成功。

## 24. 导航失败与错误

用户被离开守卫取消、重复导航或重定向，不等同于应用崩溃。`router.push()` resolve 后可使用 `isNavigationFailure()` 判断结果。

`router.onError()` 用于未预期错误，例如异步路由组件加载失败。不要把正常取消都记录成错误告警。

`afterEach` 的第三参数也会收到 navigation failure，发送页面浏览分析前应确认没有失败。

## 25. 404 路由

Vue Router 4 的 catch-all：

```ts
{
  path: '/:pathMatch(.*)*',
  name: 'not-found',
  component: NotFoundView
}
```

放在配置末尾便于阅读。History 模式下还需服务器先回退到 SPA，客户端才能渲染这条 404；服务端若直接返回自己的 404，Router 不会启动。

完整简单页面：

<<< ../../../examples/frontend/vue3-router/NotFoundView.vue

<<< ../../../examples/frontend/vue3-router/ForbiddenView.vue

## 26. 滚动行为

`scrollBehavior` 只在浏览器 History 导航中生效：

```ts
scrollBehavior(to, from, savedPosition) {
  return savedPosition ?? { top: 0 }
}
```

浏览器后退时恢复 `savedPosition`，新页面回到顶部。锚点页面可返回 `{ el: to.hash }`，但要验证选择器和等待异步内容渲染。

焦点管理与滚动不是一回事。SPA 导航后应让读屏软件获知新页面，可在 `afterEach` 更新标题，并由布局把焦点移动到主标题或提供 live region。

## 27. 登录页完整示例

<<< ../../../examples/frontend/vue3-router/LoginView.vue

登录页通过已经归一化的 Prop 接收返回地址，不直接解析原始 query。真实登录成功还应等待会话 Store 更新，再执行 replace，避免目标页守卫看到旧身份后再次重定向。

## 28. SSR 边界

SSR 每个请求需要新的 Router 实例：

1. 使用 memory history 创建 Router。
2. `router.push(requestUrl)`。
3. 等待 `router.isReady()`。
4. 加载当前路由数据并渲染。
5. 客户端用浏览器 history 创建新 Router 并水合。

不能把服务器 Router 做成模块单例，否则当前 URL、导航和守卫上下文会跨请求污染。

守卫与组件数据加载也不能无条件访问 `window`、`document` 或 `localStorage`。把客户端专属逻辑放进挂载后生命周期或环境分支。

## 29. 路由配置拆分

小应用集中配置更易看清全局信息架构。大型应用可按领域导出 route records：

```ts
export const lessonRoutes: RouteRecordRaw[] = [/* ... */]
```

根 Router 仍统一负责：

- History 实例。
- 全局守卫顺序。
- 全局 404。
- 滚动与错误处理。

避免每个 feature 自己偷偷注册全局守卫，导入顺序会变成不可见行为依赖。动态 `addRoute()` 适合插件或运行时能力，不应成为普通权限过滤的默认手段。

## 30. 常见反模式

### 所有页面都读取整个 `route`

组件难复用，watch 范围过大。用路由 Props 和精确字段依赖。

### 在 URL 与 Store 各存一份查询状态

刷新、后退和分享后出现冲突。选择 URL 为事实来源，Store 只缓存结果或草稿。

### 只在 `onMounted` 根据 param 加载

参数变化会复用实例，页面保留旧资源。watch 对应 Prop/param 并清理请求。

### 把鉴权全部交给前端守卫

守卫只能改善导航体验，不能保护数据。后端必须授权每次请求。

### 每条路由都放相同 `beforeEnter`

规则重复且易漂移。公共策略用 meta + 全局守卫，资源特有约束留在路由或数据层。

### 使用 `next()` 后继续执行

可能调用两次并导致导航悬挂。新守卫优先 return。

### 强制给 RouterView 加动态 key

`<RouterView :key="$route.fullPath">` 会让每次 query/hash 变化都销毁页面，掩盖生命周期设计问题并丢失状态。只有确实需要重建时使用精确 key。

## 31. Vue Router 3 / Vue 2 迁移提示

- Vue Router 4 通过 `createRouter()` 和明确 history 工厂创建实例。
- catch-all 从旧 `*` 改为 `/:pathMatch(.*)*`。
- 组合式组件使用 `useRoute()`、`useRouter()` 和组件守卫函数。
- 守卫优先返回值，不再围绕 `next()` 组织代码。
- `router.push()` 返回 Promise，应处理异步结果。
- `append` 等旧导航行为需改为明确路径或命名路由。
- 重新检查全局 mixin 中的路由依赖，把输入改成 Props 或组合式函数。

## 32. 工程检查清单

- URL 是否能独立还原页面核心状态？
- params/query 是否在边界完成解析和校验？
- 业务跳转是否优先使用命名路由？
- 路由视图能否通过 Props 接收资源 ID？
- 参数变化时是否处理组件复用？
- 数据请求是否会在路由变化时取消或失效？
- 守卫是否用返回值且避免重定向循环？
- 前端权限判断是否有后端授权配套？
- 登录 redirect 是否防止开放重定向？
- 路由组件是否正确使用动态 import？
- History 模式是否配置服务器 fallback？
- 404、资源不存在、无权限是否被区分？
- 页面标题、焦点和滚动是否支持 SPA 导航？
- SSR 是否为每个请求创建独立 Router？

## 33. 概念辨析与因果回顾

### `$route` 和 `$router` 有什么区别？

`route` 是当前规范化路由位置，是响应式读取对象；`router` 是执行导航、注册守卫和解析地址的实例。

### 为什么动态参数变化不会重新挂载组件？

两条 URL 匹配同一路由记录和组件，Router 为效率复用实例。应 watch 参数或使用 `onBeforeRouteUpdate()`。

### `beforeEach` 与 `beforeResolve` 的区别？

两者都可拦截导航；`beforeResolve` 在组件内守卫和异步路由组件解析后、导航确认前执行，适合避免对最终无法进入页面的数据预取。

### 为什么路由 Props 更易测试？

组件依赖显式输入，不需要构造完整 Router/Route 环境即可测试资源 ID 对应的渲染与加载逻辑。

### History 模式刷新为什么可能 404？

浏览器会向服务器请求真实路径。服务器若没有对应文件或回退规则，就不会把 SPA 的 `index.html` 返回给客户端。

### 前端守卫能保证安全吗？

不能。它只能控制客户端导航体验，攻击者可绕过前端直接调用 API；安全边界必须在服务端。

## 34. 本节总结

- Router 把 URL、路由记录与组件树连接为应用导航协议。
- 资源身份用 params，可分享筛选用 query，敏感信息不进入 URL。
- 命名路由减少路径硬编码，路由 Props 降低视图耦合。
- 参数变化会复用组件，数据加载必须观察精确字段并清理旧请求。
- 全局、路由级、组件级守卫分别承担不同范围的决策。
- Meta 适合声明访问需求，但真正授权必须由后端执行。
- 路由组件使用动态 import，实现页面级代码分割。
- History fallback、404、导航失败、滚动和焦点都属于完整路由架构。
- SSR 必须为每个请求创建独立 Router 和状态上下文。

## 35. 下一步学习

下一节建议学习：**Vue 3 表单架构与复杂交互状态**。

将继续讲解受控字段、校验时机、异步校验、动态表单、草稿与服务端错误、可访问性以及大型表单性能。

## 36. 参考资料

- [Vue Router 官方指南：Getting Started](https://router.vuejs.org/guide/)
- [Vue Router：Dynamic Route Matching](https://router.vuejs.org/guide/essentials/dynamic-matching.html)
- [Vue Router：Nested Routes](https://router.vuejs.org/guide/essentials/nested-routes.html)
- [Vue Router：Passing Props to Route Components](https://router.vuejs.org/guide/essentials/passing-props.html)
- [Vue Router：Navigation Guards](https://router.vuejs.org/guide/advanced/navigation-guards.html)
- [Vue Router：Route Meta Fields](https://router.vuejs.org/guide/advanced/meta.html)
- [Vue Router：Data Fetching](https://router.vuejs.org/guide/advanced/data-fetching.html)
- [Vue Router：Lazy Loading Routes](https://router.vuejs.org/guide/advanced/lazy-loading.html)
- [Vue Router：History Modes](https://router.vuejs.org/guide/essentials/history-mode.html)
- [Vue Router：Navigation Failures](https://router.vuejs.org/guide/advanced/navigation-failures.html)
