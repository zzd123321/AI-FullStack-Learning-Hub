---
title: Vue Router 4 与前端路由架构
description: 从 URL 状态出发，理解路由匹配、数据加载、导航守卫、权限与浏览器历史
outline: deep
---

# Vue Router 4 与前端路由架构

> 适用环境：Vue 3、Vue Router 4、TypeScript、Vite。本课使用稳定 API，不把实验性的 Data Loaders 当成默认方案。

上一课把 Pinia 定位为“应用运行期间共享的业务状态”。这一课先解决一个很容易混淆的问题：

> 课程关键词和页码应该放在 Store，还是放在 Router？

判断标准不是“有几个组件要用”，而是：

- 刷新页面后，状态是否应该保留？
- 复制链接给别人，对方是否应该看到同一个页面？
- 点击浏览器后退，是否应该回到上一个值？

如果答案是“应该”，它通常属于 URL。Router 管理的正是这种**公开、可恢复的导航状态**。

## 先建立全局图景

客户端路由不是简单地“点击后换一个组件”。它持续维护三者之间的关系：

```text
浏览器 URL
   ↓ 匹配
路由记录（route records）
   ↓ 决定布局与出口
渲染的组件树
```

例如：

```text
/lessons?keyword=vue&page=2
   ↓
课程列表路由 + keyword/page
   ↓
AppShell → LessonListView
```

一次导航还会经过守卫、异步组件解析、滚动恢复等步骤。因此 Router 同时连接了：

- 产品的信息架构；
- 浏览器历史；
- 页面组件的生命周期；
- 登录与访问控制；
- 页面数据的加载时机。

学 Router 的主线应该是“URL 如何驱动页面”，而不是背 API 名称。

## URL 和普通状态有什么本质区别

假设课程列表有以下状态：

- 搜索词 `vue`；
- 当前第 2 页；
- 搜索框是否聚焦；
- 删除确认框是否打开；
- 当前登录用户的访问令牌。

它们不应该放在同一个地方：

| 状态 | 推荐位置 | 原因 |
| --- | --- | --- |
| 资源身份 | path params | `/lessons/vue-router` 能稳定指向一项资源 |
| 可分享的筛选、排序、分页 | query | 不改变资源层级，但应该随链接恢复 |
| 文档内位置 | hash | `#navigation-guards` 表示页面内锚点 |
| 弹窗、焦点、悬停 | 组件本地状态 | 短暂 UI 细节不应污染历史 |
| 跨页面业务数据 | Pinia | 需要共享，但未必是公开导航协议 |
| Token、密码、隐私数据 | 安全存储或内存 | URL 会进入历史、日志和 Referer |

### URL 是公开输入，不是可信配置

用户可以手改地址栏，旧书签也可能保留过期值。下面这些地址都可能出现：

```text
/lessons?page=-1
/lessons?page=abc
/lessons?page=999999999999999999999
/lessons?page=2&page=3
```

所以 query 和 params 到达应用时都只是**未经验证的字符串输入**。TypeScript 能告诉你 `route.query.page` 可能是什么类型，却不能证明它是合法业务页码。

## 从路由表看应用的信息架构

完整示例使用下面的页面结构：

```text
App
├── /                         重定向到课程列表
├── /lessons                  课程列表
├── /lessons/:lessonId        课程详情
├── /lessons/:lessonId/edit   课程编辑
├── /forbidden                无权访问
├── /login                    登录
└── /:pathMatch(.*)*          应用内 404
```

路由配置不是组件清单，而是应用的信息架构。父子路由应表达真实的布局关系：

```ts
{
  path: '/',
  component: AppShell,
  children: [
    {
      path: 'lessons',
      name: 'lesson-list',
      component: () => import('./LessonListView.vue')
    }
  ]
}
```

子路径 `lessons` 没有以 `/` 开头，因此会和父路径组合。父组件中的 `<RouterView />` 是子页面的渲染出口：

<<< ../../../examples/frontend/vue3-router/AppShell.vue

不要为了文件夹整齐而制造很多空布局。只有父层确实共享导航、页头、侧栏或守卫时，嵌套路由才有价值。

### 命名路由比手工拼路径稳定

业务代码推荐按名称导航：

```ts
router.push({
  name: 'lesson-detail',
  params: { lessonId: lesson.id }
})
```

Vue Router 会完成路径匹配和参数编码。以后即使产品把路径改成 `/courses/:lessonId`，调用方也不必到处替换字符串。

路由名是应用内部契约，因此应稳定、唯一，并表达页面含义。

## Router 如何接入应用

入口只需要先创建 Router，再作为插件安装：

<<< ../../../examples/frontend/vue3-router/main.mts

<<< ../../../examples/frontend/vue3-router/App.vue

`app.use(router)` 必须发生在 `mount()` 前。安装过程会：

- 注册 `RouterLink` 与 `RouterView`；
- 向组件提供 `useRouter()` 和 `useRoute()`；
- 启动首次 URL 匹配。

### `route` 和 `router` 不要混淆

- `route` 是“当前导航结果”，包含 params、query、hash、meta、matched 等信息；
- `router` 是“路由器实例”，负责 push、replace、守卫注册等操作。

可以把它们理解为：

```text
route  = 当前在哪里
router = 如何去别处
```

## History 模式决定 URL 如何与浏览器协作

### HTML5 History

`createWebHistory()` 生成普通 URL：

```text
https://example.com/lessons/vue-router
```

这是常见生产项目的首选，但它要求服务器配合。用户直接刷新该地址时，请求先到服务器；服务器若只寻找 `/lessons/vue-router` 这个真实文件，就会返回 404。

正确策略是：

1. API 和真实静态资源按原规则处理；
2. 未匹配到文件的前端页面路径回退到 `index.html`；
3. Vue Router 接管后，再判断显示哪一个页面。

### Hash History

`createWebHashHistory()` 的地址类似：

```text
https://example.com/#/lessons/vue-router
```

井号后的内容通常不会发送到服务器，所以部署简单；代价是 URL 表达较弱，也不适合依赖搜索引擎理解页面的场景。

### Memory History

`createMemoryHistory()` 不自动读取或修改浏览器地址，适用于 SSR、测试或非浏览器环境。服务端渲染时，需要由服务端把本次请求 URL 推入 Router，并等待初始导航完成。

这里最重要的不是死记三种函数，而是理解：

> History 是 Router 与运行环境之间的适配层。

## 在 Router 边界解析 params 和 query

示例把 query 解析集中在路由配置附近：

```ts
function firstQueryValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function positivePage(value: unknown): number {
  const page = Number(firstQueryValue(value))
  return Number.isSafeInteger(page) && page > 0 ? page : 1
}
```

为什么不能只写：

```ts
Math.max(1, Number(route.query.page) || 1)
```

因为 `Infinity` 仍可能通过，重复 query 也没有明确策略。一个边界解析函数应该明确回答：

- 缺失时用什么默认值；
- 重复值接受还是拒绝；
- 是否只接受安全整数；
- 值超出业务范围后在哪里收敛。

路由层能校验“是不是正整数”；总页数只有服务返回结果后才知道，所以示例会再把过大页码收敛，并用 `router.replace()` 规范化 URL。

### 为什么要让 URL 与屏幕保持一致

假设地址栏是 `?page=99`，接口告诉你实际只有 2 页。如果屏幕显示第 2 页但地址仍是第 99 页：

- 复制链接会继续传播错误状态；
- 刷新后还要重复纠正；
- 分页按钮和统计文字的语义互相矛盾。

因此规范化之后应替换当前历史项：

```ts
await router.replace({
  name: 'lesson-list',
  query: { page: '2' }
})
```

这里用 `replace`，是因为修正非法 URL 不应该额外增加一条“可后退”的历史记录。

## 路由 Props：让输入关系可见

详情页可以直接读取：

```ts
const route = useRoute()
const lessonId = route.params.lessonId
```

但这样一来，组件的数据输入藏在 Router 这个外部依赖里。更清楚的做法是：

```ts
{
  path: 'lessons/:lessonId',
  component: () => import('./LessonDetailView.vue'),
  props: true
}
```

然后页面声明：

```ts
const props = defineProps<{
  lessonId: string
}>()
```

`props: true` 会把 params 作为组件 Props。对于 query，使用函数模式可以顺便完成边界转换：

```ts
props: (route) => ({
  keyword: firstQueryValue(route.query.keyword),
  page: positivePage(route.query.page)
})
```

收益不是“完全消灭 Router 依赖”。页面仍可以用 `useRouter()` 导航。真正的收益是：

- 数据输入写进 Props 契约；
- 组件测试不必伪造完整 Route 对象；
- params/query 的解析集中在入口；
- 页面内部拿到的是业务类型，而不是 Router 的联合类型。

官方文档也提醒：Props 函数应保持无状态。它只负责把一次路由结果转换成 Props，不适合读取会独立变化的响应式状态。

## 参数变化不会自动重新挂载页面

从 `/lessons/vue-reactivity` 导航到 `/lessons/vue-router` 时，两者命中同一条路由记录。Vue Router 会复用 `LessonDetailView` 实例，因为这样更高效。

这意味着：

- `onMounted()` 不会再次执行；
- 组件本地状态可能继续保留；
- 依赖 `lessonId` 的数据必须主动更新。

因此详情页观察的是输入，而不是只在挂载时取数：

```ts
watch(
  () => props.lessonId,
  (lessonId) => loadLesson(lessonId),
  { immediate: true }
)
```

不要为了方便而 watch 整个 `route`。那会让无关的 hash、query 变化也触发请求，读者也看不出真正依赖了什么。

如果参数变化前需要询问“是否放弃未保存内容”，才使用 `onBeforeRouteUpdate()` 或 `onBeforeRouteLeave()` 一类守卫。纯粹的数据同步，用精确 watch 更直接。

## 页面数据何时加载

Router 官方文档给出两种都合理的时机。

### 先完成导航，再加载数据

页面先出现，然后展示 loading、骨架屏或局部错误：

```text
确认导航 → 渲染新页面 → 发请求 → 展示结果
```

适合：

- 详情页和列表页；
- 希望用户立即看到导航反馈；
- 错误可以在页面内解释和重试。

代价是页面必须认真管理 loading、error、空态和请求竞态。

### 先加载关键数据，再确认导航

可以在路由守卫或上层框架的数据机制中完成：

```text
开始导航 → 加载/验证 → 确认导航 → 渲染页面
```

适合：

- 没有数据就不能进入的页面；
- 进入前必须确认的权限或前置条件；
- SSR 需要首屏携带数据的场景。

代价是等待期间旧页面仍在屏幕上，所以应用需要全局进度反馈、失败去向和取消策略。

选择依据是用户体验，不是哪个 API 看起来更高级。

## 路由变化与异步请求必须共享生命周期

用户可能快速点击第 1、2、3 页。网络返回顺序却可能是 3、1、2。如果直接把每次结果赋值给同一个 ref，旧请求就会覆盖新页面。

完整列表页同时使用两层保护：

<<< ../../../examples/frontend/vue3-router/LessonListView.vue

第一层是 `AbortController`：

- 下一次 watch 执行前，`onWatcherCleanup()` 取消上一次请求；
- 已经没用的网络和解析工作可以尽早停止。

第二层是递增序号：

```ts
const requestId = ++latestRequestId

const result = await request()

if (requestId !== latestRequestId) return
```

序号解决的是“所有权”问题：只有最新请求拥有当前页面状态。即使某个请求实现不支持真正取消，旧结果也无法提交。

`finally` 也必须检查所有权：

```ts
if (requestId === latestRequestId) {
  loading.value = false
}
```

否则旧请求稍后进入 `finally`，会错误地关闭新请求的 loading。

详情页遵循同样规则：

<<< ../../../examples/frontend/vue3-router/LessonDetailView.vue

服务层则要正确响应已经取消和执行中取消两种情况：

<<< ../../../examples/frontend/vue3-router/lesson-api.mts

## push、replace 和浏览器历史

两者都会导航，但历史语义不同：

- `push` 新增一条记录，后退会回到旧页面；
- `replace` 替换当前记录，后退不会经过被替换的地址。

一般规律：

| 操作 | 常见选择 | 原因 |
| --- | --- | --- |
| 打开详情 | `push` | 用户期望后退到列表 |
| 切换筛选或分页 | `push` | 前进/后退应恢复浏览过程 |
| 纠正非法页码 | `replace` | 错误地址不值得保留 |
| 登录成功离开登录页 | `replace` | 后退不应再次回登录页 |
| 保存后回详情 | 视流程选择，示例用 `replace` | 编辑页已完成，不必留在历史中 |

完整编辑页还展示了未保存离开确认：

<<< ../../../examples/frontend/vue3-router/LessonEditView.vue

导航方法返回 Promise。`await router.push(...)` 表示等待导航结束，不等同于“必然成功”。导航可能被守卫取消、重定向或判定为重复导航；需要区分时，可结合 `isNavigationFailure()` 检查返回结果。

## 导航守卫应该保护什么

守卫的核心职责是决定：

> 这次导航是否可以继续、应该取消，还是应该去另一个地址？

常见层级：

- 全局 `beforeEach`：登录、统一访问策略；
- 路由记录 `beforeEnter`：某一页面族的进入条件；
- 组件内守卫：和组件状态紧密相关的离开或更新判断；
- `beforeResolve`：异步组件和组件守卫完成后、导航确认前的最后检查；
- `afterEach`：导航完成后的标题、分析上报等副作用，不能阻止导航。

现代 Vue Router 守卫推荐通过返回值表达结果：

```ts
router.beforeEach((to) => {
  if (cannotEnter(to)) return false
  if (mustLogin(to)) return { name: 'login' }
  // undefined 表示继续
})
```

避免混合旧式 `next()` 和返回值，否则很容易在分支中调用两次或漏调。

## meta 是路由策略声明，不是业务数据库

路由记录可以声明：

```ts
meta: {
  title: '编辑课程',
  requiresAuth: true,
  roles: ['editor']
}
```

全局守卫再统一解释这些声明。这样页面配置表达“需要什么”，守卫负责“如何判断”。

嵌套路由匹配时，`to.matched` 包含从父到子的记录；`to.meta` 是这些记录 meta 的**非递归合并结果**。非递归意味着嵌套对象不会深合并，因此复杂权限最好设计成明确、扁平的字段。

TypeScript 可以通过模块扩展约束 meta：

```ts
declare module 'vue-router' {
  interface RouteMeta {
    title: string
    requiresAuth?: boolean
    roles?: readonly Role[]
  }
}
```

这能防止某条新路由漏写标题，也能避免角色字段拼错。

## 前端访问控制不等于后端授权

完整路由配置如下：

<<< ../../../examples/frontend/vue3-router/router.mts

守卫检查了两层：

1. 没登录时去登录页；
2. 已登录但角色不匹配时去无权访问页。

这改善了交互，也避免用户误入不适合的界面。但浏览器代码和前端状态都由用户控制，攻击者完全可以绕过守卫直接请求 API。

所以：

- 前端守卫负责导航体验；
- 后端必须独立验证身份、角色和资源归属；
- 隐藏按钮也不是安全边界。

### 登录回跳为什么要校验

应用常把原地址放进：

```text
/login?redirect=/lessons/vue-router/edit
```

登录后再回到原页面。但如果任意接受：

```text
/login?redirect=https://evil.example
```

应用就可能成为开放重定向入口。因此示例只接受以单个 `/` 开头、且不含反斜杠的站内路径，其余一律回首页。

更复杂的系统可以解析目标后，再用 Router 的已知路由或业务白名单校验。不要因为 redirect “只是 query” 就信任它。

## 懒加载解决的是代码到达时间

```ts
component: () => import('./LessonDetailView.vue')
```

动态 `import()` 让构建工具把路由组件拆成独立 chunk，用户访问时才加载。它适合页面级边界，因为页面天然对应导航时机。

注意三个区别：

- 路由懒加载减少首屏 JavaScript，不会自动减少接口数据；
- 过度拆分会产生大量小请求，需要结合实际构建产物判断；
- Vue Router 的 route component 函数不是要求你再套一层 `defineAsyncComponent()`。

常访问且很小的首页可以静态导入；后台、编辑器和低频大页面更适合懒加载。

## 404 其实有两层

应用内 catch-all：

```ts
{
  path: '/:pathMatch(.*)*',
  name: 'not-found',
  component: () => import('./NotFoundView.vue')
}
```

它只在 `index.html` 已经加载、Vue Router 已启动后生效。

而用户直接请求 `/unknown` 时，首先面对的是服务器。因此 HTML5 History 还需要服务器回退。两层职责是：

```text
服务器：让前端应用有机会启动
Router：在应用内部展示正确的 404 页面
```

SSR 系统还可能根据匹配结果真正返回 HTTP 404 状态；纯静态 SPA 的服务器通常先返回 `index.html`，再由客户端显示 404。

## 滚动、焦点和页面标题也是导航体验

示例的滚动策略：

```ts
scrollBehavior(_to, _from, savedPosition) {
  return savedPosition ?? { top: 0 }
}
```

- 浏览器前进/后退时恢复 `savedPosition`；
- 普通新页面从顶部开始。

真实项目还可能处理 hash 锚点和固定头部偏移。

滚动位置恢复不等于无障碍完成。单页应用切页后，还应该根据产品结构：

- 更新 `document.title`；
- 把焦点移到页面主标题或主内容区；
- 用可感知方式宣布加载错误；
- 保留合理的键盘操作顺序。

`afterEach` 适合在导航成功后更新标题。示例检查 `failure`，避免失败导航修改标题。

## 把完整示例串起来

路由配置：

<<< ../../../examples/frontend/vue3-router/router.mts

入口与顶层出口：

<<< ../../../examples/frontend/vue3-router/main.mts

<<< ../../../examples/frontend/vue3-router/App.vue

共享布局：

<<< ../../../examples/frontend/vue3-router/AppShell.vue

列表、分页与查询：

<<< ../../../examples/frontend/vue3-router/LessonListView.vue

详情与参数复用：

<<< ../../../examples/frontend/vue3-router/LessonDetailView.vue

编辑离开保护：

<<< ../../../examples/frontend/vue3-router/LessonEditView.vue

登录回跳：

<<< ../../../examples/frontend/vue3-router/LoginView.vue

会话与服务边界：

<<< ../../../examples/frontend/vue3-router/session.mts

<<< ../../../examples/frontend/vue3-router/lesson-api.mts

## 做路由设计时的推理顺序

遇到新页面时，可以按以下顺序判断：

1. 哪些状态需要分享、刷新和前进后退？先设计 URL。
2. path、query、hash 各自表达什么？不要把临时 UI 状态都塞进 URL。
3. 页面之间共享什么布局？据此设计父子路由。
4. params/query 在哪个边界解析成业务类型？
5. 同一记录的参数变化会不会复用组件？数据如何同步？
6. 请求由谁取消？旧请求如何失去提交结果的资格？
7. 导航前必须满足什么条件？放在哪一层守卫？
8. 这是交互限制还是安全授权？后端是否独立校验？
9. push 还是 replace 才符合浏览器历史语义？
10. 直接刷新、404、滚动、焦点和标题是否完整？

这套顺序比“先写路由表，再到处补守卫”更容易得到可维护的结构。

## 常见误区

### 把所有共享状态放进 Pinia

分页若只在 Store，刷新和复制链接都会丢失。先问它是否属于导航状态。

### 只在 `onMounted()` 取路由数据

参数变化时组件可能复用，挂载钩子不会重跑。观察真正依赖的 prop。

### 认为取消请求就彻底没有竞态

不是所有底层任务都能真正取消。取消用于节省资源，序号或其他所有权校验用于保证结果正确。

### 在每个页面复制登录判断

重复代码容易产生策略差异。路由 meta 声明需求，全局守卫统一执行。

### 把前端守卫当成权限系统

守卫可被绕过。后端授权才是资源安全边界。

### 配了 catch-all 就认为刷新不会 404

应用内 404 只有前端启动后才工作。HTML5 History 仍需服务器回退。

## 本课小结

Vue Router 的核心不是 API 数量，而是把 URL 当成一份公开导航协议：

- params 表达资源身份，query 表达可分享的视图状态；
- URL 输入必须在边界解析、校验和规范化；
- 路由 Props 让页面输入明确，命名路由让跳转契约稳定；
- 参数变化可能复用组件，异步数据必须跟随路由生命周期；
- `AbortController` 与请求序号分别解决资源浪费和结果所有权；
- meta 与守卫组织前端访问体验，后端仍负责真正授权；
- push、replace、History 回退、404 和滚动都属于浏览器导航语义。

下一节是[表单架构与复杂交互状态](/frontend/vue3/form-architecture-and-complex-interaction-state)。路由解决“用户在哪个页面”，表单则要继续解决“页面内的草稿、校验、提交与离开保护由谁拥有”。

## 官方资料

- [Vue Router：动态路由匹配](https://router.vuejs.org/guide/essentials/dynamic-matching.html)
- [Vue Router：向路由组件传递 Props](https://router.vuejs.org/guide/essentials/passing-props.html)
- [Vue Router：History 模式](https://router.vuejs.org/guide/essentials/history-mode.html)
- [Vue Router：数据获取](https://router.vuejs.org/guide/advanced/data-fetching.html)
- [Vue Router：导航守卫](https://router.vuejs.org/guide/advanced/navigation-guards.html)
- [Vue Router：Route Meta](https://router.vuejs.org/guide/advanced/meta.html)
- [Vue Router：路由懒加载](https://router.vuejs.org/guide/advanced/lazy-loading.html)
