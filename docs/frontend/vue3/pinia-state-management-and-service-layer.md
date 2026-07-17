---
title: Vue 3 Pinia 状态管理与服务层设计
description: 判断状态何时进入 Store，并设计 Setup Store、异步 Action、服务层和 SSR 边界
outline: deep
---

# Vue 3 Pinia 状态管理与服务层设计

[上一课](/frontend/vue3/component-communication-and-reusable-components)比较了 Props、Events、Slots、Provide / Inject 和组合式函数。它们都围绕组件树组织状态。本课继续处理另一种情况：课程列表、筛选条件和选择状态需要跨页面或跨多个不相邻组件使用，而且生命周期不应由某个 Provider 决定。

这时可以考虑 Pinia，但要先避免一个常见误区：

> Store 不是把所有 `ref` 搬到一个文件，而是让跨组件树的业务状态拥有明确生命周期、操作入口和调试边界。

本课围绕一个课程管理页展开：

```text
LessonStorePage：处理表单、按钮、loading 和错误的视觉呈现
        │
        ▼
useLessonStore：保存跨组件业务状态，编排加载与发布流程
        │
        ▼
lesson-api：处理 I/O、查询参数、取消信号和 DTO
```

## 状态什么时候值得进入 Store

适合 Store 的状态通常同时满足两个条件：

1. 多个不相邻组件、页面或流程需要读写；
2. 生命周期应该长于某一个局部组件或 Provider 子树。

典型例子：

- 当前用户、会话与权限；
- 购物车和跨步骤表单草稿；
- 多页面共同使用的实体选择与缓存；
- 需要 DevTools 追踪的跨组件业务操作。

以下状态通常留在使用处：

- 当前菜单是否展开；
- 输入框焦点和悬停状态；
- 只服务一个表单的临时错误；
- 能直接从 Props、路由或其他 state 算出的派生值；
- 仅为了少传一层 Prop 而提升的状态。

状态离 UI 越远，失效、清理、并发、SSR 和测试成本越高。Pinia 让共享更方便，但不会自动让共享更合理。

## 本地状态、上下文与 Store 的区别

| 机制 | 典型范围 | 所有者 | 示例 |
| --- | --- | --- | --- |
| 组件本地状态 | 一个组件实例 | 组件 | 展开、焦点、局部草稿 |
| 组合式函数 | 复用逻辑；是否共享取决于状态创建位置 | 调用方或模块 | 请求逻辑、浏览器能力 |
| Provide / Inject | 一个 Provider 子树 | Provider 实例 | 表单、Tabs、选择上下文 |
| Pinia Store | 一个 Pinia 应用实例 | Store | 用户、购物车、课程缓存 |

组合式函数里的状态若定义在函数内部，每次调用通常独立；若定义在模块顶层，则在客户端成为模块单例，在 SSR 中还可能跨请求泄漏。不要把模块顶层 `ref` 当成不安装 Store 的无成本替代品。

## Store 属于 Pinia 实例

应用入口先创建并安装 Pinia：

```ts
const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.mount('#app')
```

完整入口：

<<< ../../../examples/frontend/vue3-pinia/main.mts

`defineStore` 返回的是一个 `useXxxStore` 函数；第一次在某个 Pinia 实例中调用它时，才取得或创建该实例对应的 Store。

```ts
export const useLessonStore = defineStore('lessons', () => {
  // ...
})
```

`lessons` 是 Store ID，在应用中必须唯一。Pinia 用它连接状态树、插件和 DevTools。

这解释了两个后续规则：

- SPA 中调用 Store 必须发生在 Pinia 安装后；
- SSR 中每个请求必须有自己的 Pinia，否则多个用户会拿到同一个 Store 实例。

## Option Store 与 Setup Store 都是正式选择

Option Store 接近 Vuex 和 Options API：

```ts
export const useCounterStore = defineStore('counter', {
  state: () => ({
    count: 0
  }),
  getters: {
    doubled: state => state.count * 2
  },
  actions: {
    increment() {
      this.count += 1
    }
  }
})
```

Setup Store 使用 Composition API：

```ts
export const useCounterStore = defineStore('counter', () => {
  const count = ref(0)
  const doubled = computed(() => count.value * 2)

  function increment(): void {
    count.value += 1
  }

  return { count, doubled, increment }
})
```

在 Setup Store 中：

```text
ref / reactive → state
computed       → getter
function       → action
```

Option Store 结构更受约束，Setup Store 更容易组合 watcher、composable 和复杂类型。两者没有“初级”和“高级”之分；本课使用 Setup Store，是为了延续 Composition API 并完整展示请求取消。

## Setup Store 必须返回全部业务 state

Pinia 官方要求 Setup Store 返回所有 state：

```ts
export const useLessonStore = defineStore('lessons', () => {
  const items = ref<LessonSummary[]>([])
  const selectedId = ref<string | null>(null)

  return {
    items,
    selectedId
  }
})
```

不能把响应式业务 state 隐藏起来，或只返回其 `readonly` 包装。否则 Pinia 无法完整识别状态树，会破坏 SSR、水合、DevTools 和插件。

可以不返回真正的实现细节：

```ts
let loadSequence = 0
let activeLoadController: AbortController | undefined
```

请求序号和控制器不是需要序列化、恢复或被组件读取的业务状态，因此可以留在 Store 闭包内部。

## State 只保存最小事实

课程 Store 保存：

- 接口返回的 `items`；
- 查询条件 `keyword`、`status`；
- 当前选择 ID；
- 查询与发布各自的 pending 状态；
- 可向界面呈现的错误。

“已发布数量”和“选中的课程对象”都能从现有状态计算：

```ts
const publishedCount = computed(
  () => items.value.filter(
    lesson => lesson.status === 'published'
  ).length
)

const selectedLesson = computed(
  () => items.value.find(
    lesson => lesson.id === selectedId.value
  ) ?? null
)
```

不要再保存一份 `publishedCount` 可变 state，否则每次课程状态变化都要手工同步。

选择状态保存 ID，而不是复制整个对象：

```text
items 更新 → selectedLesson 自动查询最新实体
```

如果保存旧对象副本，列表刷新后详情可能继续展示过期数据。

## 使用 Store 时不要直接解构 state

Pinia Store 本身是 reactive 对象：

```ts
const lessonStore = useLessonStore()

const { loading } = lessonStore
// loading 是当前布尔值，不会继续经过 Store 属性访问。
```

状态和 getters 使用 `storeToRefs`：

```ts
const {
  items,
  loading,
  publishedCount,
  selectedLesson
} = storeToRefs(lessonStore)
```

Actions 已绑定 Store，可以直接解构：

```ts
const {
  load,
  select,
  publishSelected
} = lessonStore
```

`storeToRefs` 与普通 `toRefs` 的区别是：它会提取 Store 的 state、getters 和插件增加的响应式属性，跳过 actions 与非响应式属性。

如果模板只用少量内容，也可以直接写 `lessonStore.loading`，没有必须解构的要求。

## Action 应完成一个业务操作

好的 action 用业务语言表达意图：

```ts
await lessonStore.publishSelected()
```

如果组件必须手工编排：

```ts
lessonStore.publishing = true
const updated = await api.publish(lessonStore.selectedId)
lessonStore.items[index] = updated
lessonStore.publishing = false
```

那么 loading、错误和状态提交仍散落在 UI 中。Action 应把一个业务操作的成功、失败和状态变化放在一起，组件只负责触发与呈现。

Pinia 允许直接修改 state，这对 `v-model` 筛选字段很实用。是否使用 action 取决于操作有没有业务语义：

```text
修改一个简单筛选字段             → 可以直接赋值
同时修改多个字段但没有业务规则     → 可用 $patch
需要校验、异步、回滚或复用         → 命名 action
```

不要为了“所有修改都必须 action”创建大量无意义 setter；也不要把复杂流程复制到多个组件。

## 组件、Store 与服务层各管一层

课程示例按三层分工：

### 组件负责交互和呈现

- 处理提交、点击和键盘交互；
- 展示 loading、错误和空状态；
- 管理 DOM、焦点与无障碍语义；
- 调用 Store 的业务 action。

### Store 负责应用状态和流程

- 当前筛选、选择与实体列表；
- 什么时候发起、取消或忽略请求；
- 成功后如何更新状态树；
- 哪类错误暴露给界面。

### Service 负责 I/O 边界

- URL、HTTP 方法和 Headers；
- 查询参数与 DTO 转换；
- 运行时响应校验；
- AbortSignal、超时与错误归一化；
- 与 Vue 无关的接口调用。

```text
Vue 组件
   ↓ 用户意图
Pinia Store
   ↓ I/O 请求
Service
   ↓
后端 API
```

Store 不应知道具体按钮和 Toast，Service 也不应修改 Vue state 或弹出界面。

## 服务层示例：让取消成为协议的一部分

示例使用内存数据模拟网络，函数签名与真实 fetch 服务相同：

<<< ../../../examples/frontend/vue3-pinia/lesson-api.mts

`fetchLessons` 接受查询对象和可选 AbortSignal；`publishLesson` 接受课程 ID 与 Signal。Store 因而可以取消工作，而不必知道 Service 内部是 fetch、SDK 还是内存实现。

`wait` 处理两个取消时机：

1. 调用前 Signal 已经 aborted，立即拒绝；
2. 等待期间发生 abort，清除 timer 并拒绝。

正常完成后会移除监听器，避免已经无用的回调继续挂在 Signal 上。

真实服务还应解析不可信 JSON。TypeScript 接口只检查开发期代码，不会验证后端响应。

## 异步 Action 是一个状态机

列表请求不是简单的“打开 loading → 请求 → 关闭 loading”：

```text
idle
  ↓ load()
pending
  ├─ success   → 提交 items，关闭 loading
  ├─ failure   → 提交 error，关闭 loading
  ├─ cancelled → 不显示错误
  └─ stale     → 不允许提交任何状态
```

如果用户连续发起两次查询：

```text
请求 A：慢 ─────────────────→ 返回旧结果
请求 B：快 ───────→ 返回新结果
```

旧请求晚完成时不能覆盖 B。

### AbortController 负责停止可取消工作

```ts
activeLoadController?.abort()

const controller = new AbortController()
activeLoadController = controller

const nextItems = await fetchLessons(
  currentQuery(),
  controller.signal
)
```

它能节省网络、解析或定时器工作。但并非所有 Promise 都支持取消，而且取消与完成可能发生在接近的时间点。

### 请求序号负责保护状态提交

```ts
const sequence = ++loadSequence

const nextItems = await fetchLessons(/* ... */)

if (sequence !== loadSequence) return
items.value = nextItems
```

只有最新序号能修改 items、error、loading 和控制器引用。控制器优化执行，序号保护正确性。

### 不同操作需要独立状态

课程 Store 分开保存：

```ts
const loading = ref(false)
const publishing = ref(false)
```

查询和发布可以处于不同阶段。若共用一个 `pending` 布尔值，其中任一请求结束都会错误关闭另一个操作的反馈。

更复杂列表可以按操作或实体保存 pending：

```ts
const pending = reactive({
  list: false,
  publishingIds: new Set<string>()
})
```

粒度由 UI 是否需要独立禁用、重试和反馈决定。

## 完整 Setup Store

<<< ../../../examples/frontend/vue3-pinia/lesson-store.mts

阅读时按以下顺序：

1. state 保存最小业务事实；
2. computed 从 state 派生数量和选中实体；
3. `load` 取消旧查询并保护最新提交；
4. `publishSelected` 阻止重复发布，也有独立控制器与序号；
5. Service 返回新实体后，Store 用它替换列表中的旧实体；
6. `$reset` 取消查询与发布，并同时提升两个序号；
7. 所有业务 state、getter 和 action 被返回，控制器留在内部。

### 为什么发布也需要序号

即使 `publishing` 阻止用户重复点击，以下流程仍会发生：

```text
发布请求开始
  → 用户退出、切换账号或点击重置
  → Store 清空
  → 旧发布请求返回
  → 如果没有失效保护，又把旧状态写回来
```

因此 `$reset` 不能只把 `publishing` 设为 false，还要取消并使旧操作失效。

## 页面组件只负责调用和呈现

<<< ../../../examples/frontend/vue3-pinia/LessonStorePage.vue

组件做了三件事：

- 用 `storeToRefs` 获取响应式 state 与 getters；
- 直接解构绑定好的 actions；
- 在挂载、提交、点击时调用 action。

模板没有导入 Service，也没有手工寻找列表索引或维护请求序号。Store 的实现可以改变，页面仍依赖同一个业务 API。

## `$patch`、直接赋值与 action

Pinia 支持：

```ts
store.keyword = 'Vue'

store.$patch({
  keyword: '',
  status: 'all'
})

store.$patch(state => {
  state.items.push(nextLesson)
})
```

`$patch` 函数形式适合对集合执行多个相关修改，并形成一条 DevTools mutation 记录。但它仍只是状态修改机制，不会自动赋予业务含义。

选择原则：

- 单一筛选值可直接绑定和修改；
- 一次纯状态操作涉及多个字段可使用 `$patch`；
- 发布、结算、退出等业务行为使用 action。

## Setup Store 的 `$reset` 必须自己定义

Option Store 能调用内置 `$reset()`，因为 Pinia 可以重新执行 `state()`。Setup Store 中每个 ref 的初始和资源清理语义由你定义，因此要自己实现。

重置要回答：

- 哪些筛选和用户偏好保留？
- 哪些实体缓存清空？
- 选择状态回到哪里？
- 在途请求是否取消？
- 不能取消的旧任务怎样失效？
- 错误与 pending 是否归零？

退出登录时，多个 Store 的重置可以由会话编排器或 Pinia 插件统一处理。不要让页面组件逐个知道所有 Store。

## Store 之间可以组合，但不能循环初始化

一个订单 Store 可以在 action 中读取会话：

```ts
export const useOrderStore = defineStore('orders', () => {
  const session = useSessionStore()

  async function submit(): Promise<void> {
    await orderService.create({
      token: session.token
    })
  }

  return { submit }
})
```

两个 Setup Store 如果在 setup 顶层互相读取，会形成初始化循环：

```text
Store A setup → 读取 Store B
Store B setup → 读取 Store A
```

把读取放在 computed 或 action 中，并重新审视是否存在应该抽出的第三个领域 Store 或 Service。

异步 action 中要在第一次 `await` 前取得其他 Store。SSR 下，await 后再寻找活动 Pinia 可能绑定到错误应用实例。

## 组件外调用要等待正确实例

下面的模块顶层代码可能早于 `app.use(pinia)`：

```ts
// 危险：执行结果取决于模块导入顺序。
const session = useSessionStore()
```

SPA 路由守卫中延迟到回调执行：

```ts
router.beforeEach(to => {
  const session = useSessionStore()

  if (
    to.meta.requiresAuth &&
    !session.loggedIn
  ) {
    return '/login'
  }
})
```

SSR 或多应用实例中，无法自动注入时显式传入：

```ts
const session = useSessionStore(pinia)
```

问题不是 TypeScript 能否推断，而是 Store 究竟属于哪个应用实例。

## SSR 要做到每请求隔离

服务器进程会同时处理多个用户。若应用和 Pinia 在模块顶层复用，用户 A 的状态可能被用户 B 读取。

正确原则：

```text
每个 HTTP 请求
  → 创建新的 Vue 应用
  → 创建新的 Pinia
  → 加载该请求的数据
  → 渲染并安全序列化状态
```

客户端在第一次调用 Store 前完成水合。把包含用户输入的状态直接拼进 `<script>` 可能产生 XSS，应使用框架提供的机制或安全序列化工具。

以下值不属于可水合 state：

- AbortController、DOM 节点；
- WebSocket、数据库连接；
- 函数、Promise；
- 浏览器专用第三方实例。

这些值应是 Store 内部资源或客户端能力，不应返回为业务 state。

## 持久化和缓存都需要失效策略

Pinia 核心不会自动写 localStorage。使用持久化插件前仍要决定：

- 哪些字段确实值得恢复？
- 是否包含 token、权限或个人资料等敏感信息？
- 数据版本升级怎样迁移？
- 何时过期，退出登录怎样清理？
- 多标签页同时修改如何解决冲突？
- SSR 初值与本地数据谁优先？

“能持久化”不是“应该持久化”。服务端会话通常仍是事实来源，本地只保存最小、低风险、可迁移的数据。

把 API 数据保存进 Store 也形成了缓存，需要回答：

- 数据何时过期？
- 返回路由时复用还是重取？
- 写操作后局部更新还是使查询失效？
- 相同查询是否去重？
- 后台刷新时是否保留旧界面？

如果项目主要处理服务端缓存键、失效、重试和后台刷新，应评估专门的数据请求库。Pinia 更擅长客户端业务状态和明确跨组件流程，不必重造完整查询缓存框架。

## 错误应在层间转换

教学示例使用 `string | null`：

```ts
const error = ref<string | null>(null)
```

复杂项目可以使用可辨识联合：

```ts
type RequestError =
  | { kind: 'unauthorized' }
  | {
      kind: 'validation'
      fields: Record<string, string>
    }
  | {
      kind: 'network'
      retryable: boolean
    }
  | {
      kind: 'unexpected'
      message: string
    }
```

职责仍然分层：

```text
Service：把 HTTP / SDK 异常归一化
Store：决定业务状态是否变化、是否可重试
组件：决定内联提示、Toast、跳转或焦点
```

Service 不直接弹 Toast，Store 不保存无法序列化的未知错误对象。

## 订阅器不应隐藏业务流程

`store.$subscribe()` 可以观察 state mutation，适合持久化适配或审计；`store.$onAction()` 可以观察 action 开始、成功和失败。

如果“发布成功后刷新列表”是明确业务规则，直接写在 action 或编排 Service 中更容易理解和测试。不要把核心流程拆散到全局订阅器。

应用级订阅还要明确生命周期和清理，避免测试、热更新或重复挂载后注册多次。

## Store 测试验证行为而不是实现

每个单元测试创建新的 Pinia：

```ts
beforeEach(() => {
  setActivePinia(createPinia())
})
```

重点验证：

- 初始 state 和 getters；
- load 成功或失败后的可观察状态；
- 新查询能否阻止旧结果覆盖；
- reset 能否取消查询和发布；
- action 是否用正确参数调用 Service；
- Service 失败时是否保留正确业务不变量。

组件测试可使用 `@pinia/testing`。其 actions 可能默认被 stub；要验证真实 action 流程时必须按测试目标配置。依赖 Pinia 插件的 Store，测试应用也要安装对应插件。

## 从常见问题反推边界

### 页面刷新后 Store 数据消失

Pinia 默认是内存状态。先判断是否应重新从服务端加载，再决定哪些最小字段需要持久化。

### 解构后的 loading 不变化

直接解构了 reactive Store。使用 `storeToRefs`，或者在模板中通过 Store 对象访问。

### Action 结束后界面被旧请求覆盖

只有 loading，没有取消和最新任务保护。为每类异步操作建立独立控制器、序号或领域状态机。

### 重置后旧数据又出现

reset 只清空了 state，没有让在途任务失效。取消可取消工作，并提升请求序号。

### Store 越来越像后端 SDK

URL、Headers、DTO 和错误解析已经进入 Store。把 I/O 细节移到与 Vue 无关的 Service。

### 两个 Store 互相 watcher

可能存在两份同一事实和双向同步。建立单一所有者，或抽出共享领域服务 / 规范化实体 Store。

### Store 直接操作路由、DOM 和 Toast

Store 已经承担展示职责。返回领域结果或错误，让组件或应用编排层决定 UI 行为。

## 从 Vuex 迁移时重新设计

- Pinia 不需要 mutations，同步与异步流程都可由 action 表达；
- 不要机械复制一个巨型根 Store，按领域与生命周期拆分；
- Vuex module namespace 不等同于 Pinia Store ID；
- Setup Store 的 ref 在 Store 实例上自动解包，在 Store 内部仍使用 `.value`；
- Options API 组件可以继续使用 map helpers，不必一次性重写；
- Vuex 插件、持久化和审计逻辑要按 Pinia 的实例与插件生命周期复核。

去掉 mutations 不代表去掉业务边界。复杂状态变化仍应有命名 action，只是不再需要额外的同步 mutation 层。

## 设计 Store 的检查顺序

1. 状态真的跨越组件树或页面生命周期吗？
2. 哪些是最小事实，哪些应由 getter 派生？
3. 哪些简单字段允许直接绑定，哪些操作需要 action？
4. Service 是否独立处理 I/O 和运行时数据边界？
5. 每类异步操作是否有独立 pending、error 和失效策略？
6. reset 是否同时处理 state 与在途资源？
7. 组件是否用 `storeToRefs` 保持解构响应式？
8. Store 组合是否存在初始化循环？
9. 组件外调用能否确定正确 Pinia 实例？
10. SSR 是否每请求创建实例并安全序列化？
11. 持久化与缓存是否有过期、迁移和安全策略？
12. 测试是否为每个案例隔离 Pinia 与 Service？

## 本课小结

Pinia 的价值不只是少写 Vuex 样板：

1. Store 服务跨组件树、跨页面的业务状态，不收纳所有局部 ref；
2. Setup Store 的 ref、computed 和函数分别成为 state、getter 和 action；
3. 全部业务 state 必须返回，实现资源应留在闭包内部；
4. state 只保存最小事实，派生值使用 getter；
5. `storeToRefs` 保持解构后的响应式，actions 可直接解构；
6. 组件负责交互，Store 负责业务流程，Service 负责 I/O；
7. AbortController 停止工作，请求序号保护状态提交；
8. reset 必须使所有相关在途任务失效；
9. Store 属于 Pinia 实例，SSR 必须每请求隔离；
10. 持久化、缓存、订阅和 Store 组合都需要明确生命周期。

## 下一课

下一节是[Vue Router 4 与前端路由架构](/frontend/vue3/vue-router-and-routing-architecture)。Store 解决跨组件业务状态，路由则让 URL 成为导航状态和页面边界。下一课会继续解释：

- 哪些状态属于 URL，哪些属于 Store；
- 动态参数、查询字符串和 Meta 怎样建立类型与校验边界；
- 导航守卫为什么不能替代后端权限；
- 路由级数据加载怎样处理取消与过期结果；
- 嵌套路由、代码分割和组件生命周期如何协作。

## 参考资料

- [Pinia 官方指南：Defining a Store](https://pinia.vuejs.org/core-concepts/)
- [Pinia 官方指南：State](https://pinia.vuejs.org/core-concepts/state.html)
- [Pinia 官方指南：Getters](https://pinia.vuejs.org/core-concepts/getters.html)
- [Pinia 官方指南：Actions](https://pinia.vuejs.org/core-concepts/actions.html)
- [Pinia 官方指南：Stores outside of components](https://pinia.vuejs.org/core-concepts/outside-component-usage.html)
- [Pinia 官方指南：Server Side Rendering](https://pinia.vuejs.org/ssr/)
- [Pinia Cookbook：Composing Stores](https://pinia.vuejs.org/cookbook/composing-stores.html)
- [Pinia Cookbook：Testing stores](https://pinia.vuejs.org/cookbook/testing.html)
