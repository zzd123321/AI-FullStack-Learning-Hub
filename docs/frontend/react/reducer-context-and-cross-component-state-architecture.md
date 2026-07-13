---
title: React Reducer、Context 与跨组件状态架构
description: 从状态所有权、纯 Reducer 和 Context 边界，到异步 Command、并发保护及 useSyncExternalStore 细粒度订阅
---

# React Reducer、Context 与跨组件状态架构

> 适用环境：React 19.x、TypeScript 严格模式。本课使用 React 内置能力解释状态架构原则，不把所有问题都归结为“选哪个状态库”。

## 1. 学习目标

完成本节后，你应该能够：

- 按所有权、持久性和数据来源分类前端状态。
- 判断状态应留在组件、提升到父级、进入 URL、Context、外部 Store 或服务端缓存。
- 设计最小、规范化且不矛盾的 State Shape。
- 判断 `useState` 与 `useReducer` 的适用边界。
- 编写纯 Reducer 与可穷举的 TypeScript Action 联合。
- 把 Event、Command、Reducer 和 Effect 的职责分开。
- 使用 requestId 防止陈旧异步完成覆盖新状态。
- 用 Provider 与自定义 Hook 建立明确 Context 边界。
- 解释 Context 的传播和重新渲染成本。
- 通过 State/Dispatch 双 Context 缩小不必要订阅。
- 理解为什么 Context 不自动提供 Selector 和外部 Store 能力。
- 使用 `useSyncExternalStore` 建立并发安全、可 SSR 的外部订阅协议。
- 测试 Reducer、Provider、异步 Command 和 Store Snapshot 契约。

## 2. “全局状态”不是一个精确分类

开发者常说“这个值很多地方要用，放全局”。但位置只是表象，先问它是什么数据：

| 类型 | 示例 | 常见所有者 |
| --- | --- | --- |
| 瞬时 UI | Dialog 开关、Hover、输入草稿 | 最近使用它的组件 |
| 共享 UI | 当前选中课程、Workspace 布局 | 最近共同父级 / Reducer |
| 导航状态 | Tab、筛选、分页、实体 ID | URL / Router |
| 会话状态 | 当前用户最小视图、Theme、Locale | 上层 Provider / 外部会话 Store |
| 服务端状态 | 课程列表、订单、权限 | Router/数据缓存层，服务端为 Source of Truth |
| 外部系统状态 | Online、媒体查询、浏览器 Store | `useSyncExternalStore` 适配器 |
| 表单状态 | 当前输入、Touched、Validation | Form/字段子树，提交后进入服务端 |

同一个值被十个组件读取，不代表它应该成为进程级 Singleton。Provider 可以只包裹某个路由，路由卸载时状态自然释放。状态提升到刚好覆盖消费者的最低层，通常比“应用顶部全局 Store”更容易推理。

## 3. 状态所有权的五个问题

为每个候选状态回答：

1. **谁读取？** 找最近共同父级。
2. **谁修改？** 修改意图是否来自明确用户事件？
3. **生命周期多长？** 切路由、刷新、换账号后是否保留？
4. **谁是 Source of Truth？** DOM、URL、服务器还是 React？
5. **是否可推导？** 能从其他 State/Props 算出就不存。

例如“选中课程”只需保存 `selectedId`。保存整个 `selectedLesson` 会复制 `lessons` 中的实体，编辑列表后两份对象容易不同步。

```ts
const selectedLesson = lessons.find((lesson) => lesson.id === selectedId) ?? null
```

这是 Render 派生值，不是另一个 State。

## 4. State Shape 比状态库更重要

React 官方给出五项稳定原则：

- 相关且总一起更新的 State 可分组。
- 避免互相矛盾的字段。
- 避免可推导的冗余 State。
- 避免同一实体重复存储。
- 避免难以不可变更新的深层嵌套。

错误：

```ts
interface FormState {
  isPublishing: boolean
  isPublished: boolean
  error: string | null
}
```

它允许 publishing、published 同时为 true。使用判别联合：

```ts
type PublishState =
  | { status: 'idle' }
  | { status: 'publishing'; requestId: string }
  | { status: 'success' }
  | { status: 'error'; message: string }
```

完整领域类型：

<<< ../../../examples/frontend/react-state-architecture/types.ts

类型能排除大量非法组合，但仍要由 Reducer 保证跨字段不变量，例如成功发布后更新课程、清除草稿、结束 Publishing 必须是一个原子转换。

## 5. `useState` 还是 `useReducer`

继续使用 `useState`：

- 状态少且彼此独立。
- 更新规则非常直接。
- State 只在一个小组件内使用。
- 事件到 Setter 的关系一眼可见。

考虑 `useReducer`：

- 多个字段必须在一次事件中一致变化。
- 更新散落在许多 Handler。
- 下一个状态取决于复杂规则。
- 需要记录“发生了什么”而非“把字段设成什么”。
- 希望纯函数单测覆盖大量转换。
- State/Dispatch 需要通过 Context 深层共享。

Reducer 不会自动提升性能，也不是小型 Redux。一个 Boolean Toggle 使用 Reducer 只会增加 Action、Switch 和文件数量。

## 6. Reducer 是纯状态转换

```text
nextState = reducer(previousState, action)
```

Reducer 必须：

- 输入相同，输出相同。
- 不修改 previousState 或 Action。
- 不发请求、不写 Storage、不导航、不弹 Toast。
- 不读取当前时间、随机数或外部可变 Singleton。
- 对未知 Action 有明确失败或穷举保证。

完整 Reducer：

<<< ../../../examples/frontend/react-state-architecture/lesson-reducer.ts

它可以安全地被 React 重试，也可以脱离 React 做表格测试、回放 Action 和验证不变量。

## 7. Action 应描述领域事件

弱 Action：

```ts
{ type: 'setState', payload: { ... } }
```

调用方必须知道 State 内部结构，Reducer 只剩浅合并，规则散回组件。

更好的 Action：

```ts
{ type: 'draftChanged', lessonId, title }
{ type: 'publishStarted', lessonId, requestId }
{ type: 'publishSucceeded', lesson, requestId }
```

它们回答“发生了什么”。Reducer 决定该事件如何改变 State。Action Payload 应包含做出纯转换所需的事实，不让 Reducer偷偷访问 API Client 或当前 URL。

命名建议使用过去式事件或清晰命令式，但一个项目内保持一致。比命名形式更重要的是 Action 不暴露任意 State Patch。

## 8. TypeScript 判别联合与穷举

`WorkspaceAction` 以 `type` 为判别字段。Switch 进入某个 Case 后，Payload 自动收窄。

```ts
function assertNever(value: never): never {
  throw new Error(`未知 Action：${JSON.stringify(value)}`)
}
```

新增 Action 却忘记 Case 时，`assertNever(action)` 会产生编译错误。运行时仍抛错也能帮助发现外部反序列化的非法 Action。

不要写：

```ts
interface Action {
  type: string
  payload?: any
}
```

它放弃了 Action 和 Payload 的对应关系，Reducer 每个分支都要断言。

## 9. Lazy Initializer 与初始 Props

Provider 使用：

```tsx
const [state, dispatch] = useReducer(
  workspaceReducer,
  initialLessons,
  createInitialWorkspaceState
)
```

第三个参数是 Lazy Initializer，负责复制初始课程、选择第一项并建立空索引。它只用于创建 Reducer 初始 State。

`initialLessons` 后续 Prop 改变不会自动重置 Reducer。这与 `useState(initialValue)` 相同。必须明确语义：

- 如果 Prop 只是初始快照，使用 `initial*` 命名正确。
- 如果上层是持续 Source of Truth，不应复制进 Reducer。
- 若实体切换应重建整个 Workspace，可给 Provider 使用实体 Key。
- 若要合并服务器新数据，应定义显式 `dataReceived` Action 和冲突规则。

不要用 Effect 默默覆盖用户草稿。

## 10. 不可变更新与结构共享

Reducer 返回新对象，但应保留未变化分支引用：

```ts
return {
  ...state,
  drafts: { ...state.drafts, [lessonId]: title }
}
```

没有变化时直接返回原 State：

```ts
if (state.selectedId === action.lessonId) return state
```

这称为结构共享。它让 `Object.is`、Memo、Selector 和 DevTools 能识别变化范围。

可以修改 Reducer 内刚创建的 Copy：

```ts
const copy = { ...record }
delete copy[key]
return copy
```

不能修改传入的 record。局部新对象 Mutation 与修改既存 State 是不同概念。

嵌套非常深时，优先规范化 State 或拆分所有权，而不是一开始就引入复杂更新库。规范化结构通常是 `byId + allIds` 或实体数组 + selectedId/draftById 索引。

## 11. Reducer 不执行异步请求

发布是用户点击产生的 Command，因此流程位于 Event Handler：

```text
Click
→ dispatch publishStarted
→ await service.publish
→ dispatch publishSucceeded / publishFailed
```

完整 HTTP Service：

<<< ../../../examples/frontend/react-state-architecture/lesson-service.ts

完整 Command 组件：

<<< ../../../examples/frontend/react-state-architecture/PublishButton.tsx

这样职责清晰：

- Service 负责 HTTP 协议。
- Event Handler 编排异步流程。
- Reducer 负责纯状态转换。
- Component 渲染当前状态。

不要为了“把所有逻辑放 Store”让 Reducer 返回 Promise。React 要求 Reducer 同步返回下一个 State。

## 12. 异步完成也可能陈旧

即使按钮在 Publishing 时 Disabled，真实系统仍可能因重试、跨组件 Command、网络恢复或服务端推送产生多个请求。每次发布生成 requestId：

```ts
const requestId = crypto.randomUUID()
dispatch({ type: 'publishStarted', lessonId, requestId })
```

Success/Failure 带回相同 ID。Reducer 只有在当前 Lesson 仍处于该 requestId 的 Publishing 状态时接受结果：

```ts
if (current.status !== 'publishing' || current.requestId !== action.requestId) {
  return state
}
```

这把“谁有权写入当前 State”变成纯规则。Abort 可以节约资源，requestId 则保护状态正确性；二者可同时使用。

若操作不可幂等，还需要服务端 Idempotency Key。客户端忽略旧结果不能阻止服务器已经创建两个订单。

## 13. Context 解决的是深层传递

Context 让组件读取最近祖先 Provider 的 Value，不必每层透传 Props。适合：

- Theme、Locale、认证视图。
- 路由级 Workspace State/Dispatch。
- 表单、Tabs、Compound Components。
- 注入稳定服务或外部 Store 实例。

Context 不等于全局变量：同一个 Context 可以有多个 Provider，每个子树读取最近一个，状态彼此隔离。这对多 Workspace、Storybook 和测试非常有价值。

Context 默认值只在上方没有匹配 Provider 时使用，是静态 Fallback，不会动态变化。业务 Context 常使用 null 默认并由自定义 Hook 抛出明确错误，避免组件在错误位置静默使用假数据。

## 14. Provider 与双 Context

完整 Provider：

<<< ../../../examples/frontend/react-state-architecture/LessonWorkspaceContext.tsx

它拆为：

- `WorkspaceStateContext`
- `WorkspaceDispatchContext`

`dispatch` 身份由 React 保证稳定。只消费 Dispatch 的组件不会因为 State Value 改变而接收新的 Dispatch Context Value。

如果把它们合成：

```tsx
<Context.Provider value={{ state, dispatch }}>
```

每次 State 变化都会创建新对象，所有 Context Consumer 都收到新 Value，包括只需要 dispatch 的按钮。

双 Context 是低成本改进，但读取 State Context 的组件仍会在任何 Workspace State 对象变化时 Render。它不是细粒度 Selector 系统。

React 19 支持直接写 `<SomeContext value={value}>`；`.Provider` 形式仍清晰表达 Provider，并兼容既有代码。项目选择一种风格即可。

## 15. 自定义 Context Hook 是契约边界

```tsx
export function useWorkspaceState(): WorkspaceState {
  const state = useContext(WorkspaceStateContext)
  if (state === null) {
    throw new Error('必须在 LessonWorkspaceProvider 内使用')
  }
  return state
}
```

优势：

- Consumer 不知道 Context 实例和 null 细节。
- Provider 缺失时立即得到可定位错误。
- 将来可以调整 Context 拆分而不改所有调用方。
- 测试有统一 Wrapper 边界。

不要写一个 `useAppContext()` 返回几十个无关域。Context 按变化频率和业务所有权拆分，不只是按 TypeScript 文件拆分。

## 16. 完整 Workspace 数据流

侧边栏读取课程并派发选择事件：

<<< ../../../examples/frontend/react-state-architecture/LessonSidebar.tsx

编辑器读取选中 ID，派发草稿事件，并组合发布 Command：

<<< ../../../examples/frontend/react-state-architecture/LessonEditor.tsx

页面组合：

<<< ../../../examples/frontend/react-state-architecture/LessonWorkspace.tsx

数据流：

```text
User Event
  → dispatch(Action)
    → reducer(previousState, action)
      → nextState
        → Context publishes new State
          → consumers render derived UI
```

HTTP Command 在 Event 与 Dispatch 之间执行，不进入 Reducer。所有组件都以同一 Workspace State 为 Source of Truth。

## 17. Context 更新如何传播

Provider Value 用 `Object.is` 比较。Value 变化时，读取该 Context 的 Consumer 会重新 Render；祖先使用 `memo` 不能阻止 Context 的新值传给 Consumer。

因此要避免：

```tsx
<AuthContext.Provider value={{ user, logout }}>
```

如果 Provider 因无关 State Render，每次新对象都会通知 Consumer。可以：

- 把 Provider 移到合适边界，隔离无关更新。
- 把 State 与 Actions 拆 Context。
- 让 Value 只包含该域必要内容。
- 在身份确有语义时 Memoize Value。
- 高更新频率且需要 Selector 时使用外部 Store。

Memoize Provider Value 只能避免“字段都没变但对象新建”的通知；真正字段变化仍应传播。

## 18. Context 不是性能优化工具

Prop Drilling 有时反而让依赖显式、更新局部。只有当中间层不关心数据且层级很深时 Context 才更自然。

在引入 Context 前考虑：

- 直接传 Props 是否只有两三层？
- 能否把需要数据的组件作为 Children 传进来？
- 状态是否应更靠近使用处？
- 它是否其实属于 URL 或服务器缓存？

Context 降低调用处参数噪声，但增加隐式环境依赖。组件必须在特定 Provider 下才能工作，测试和复用都要提供环境。

## 19. 为什么需要 `useSyncExternalStore`

当状态源存在 React 外部，并且：

- 多个组件需要不同 Selector。
- 更新频率较高。
- Store 自己管理订阅。
- 需要在并发 Render 中读取一致快照。
- 需要 SSR Client/Server Snapshot 对齐。

使用 `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)`，不要手写 Effect 订阅 + State 镜像。

手写 Effect 订阅可能在 Render 读取旧值到 Effect 注册之间漏掉更新；并发 Render 还可能出现同一界面不同组件读到不同版本的撕裂。

## 20. 外部 Store 的三个契约

### Subscribe

接收 Callback，返回 Unsubscribe。函数身份应稳定，Store 更新后通知所有 Listener。

### Get Snapshot

返回 Store 当前不可变快照。Store 没变时必须返回与上次 `Object.is` 相同的值，不能每次 `{ ...state }`，否则 React 会认为永远变化。

### Get Server Snapshot

SSR/Hydration 时返回服务端快照。客户端首次 Snapshot 必须与服务器生成 HTML 的数据一致，通常通过序列化载荷恢复。

本课 Store：

<<< ../../../examples/frontend/react-state-architecture/progress-store.ts

它缓存 Snapshot；只有进度真的变化才创建新对象并通知。

## 21. Context 注入 Store，External Store 负责订阅

完整适配：

<<< ../../../examples/frontend/react-state-architecture/ProgressContext.tsx

Context Value 是稳定的 `ProgressStore` 实例，不随每次进度变化替换。Consumer 使用：

```tsx
useSyncExternalStore(
  store.subscribe,
  () => store.getSnapshot()[lessonId] ?? 0,
  () => 0
)
```

Selector 返回 Primitive。其他 Lesson 进度变化后 React 会调用 Snapshot，但该 Lesson 的选中值仍相同，可以跳过不必要 Commit。

进度控件：

<<< ../../../examples/frontend/react-state-architecture/ProgressSlider.tsx

这种“Context 负责依赖注入，Store 负责订阅”是很多状态库 React Binding 的底层形态。

## 22. SSR Snapshot 不能随便返回 0

教学示例 `getServerSnapshot` 返回 0，适用于进度只在客户端存在、服务器也渲染 0 的情况。若服务器已知道用户进度，则必须：

1. 服务端用该进度创建 Store Snapshot。
2. HTML 输出同一值。
3. 安全序列化 Initial Snapshot。
4. 客户端 Provider 用载荷恢复 Store。
5. `getServerSnapshot` 返回恢复后的同一快照语义。

否则 Hydration 首帧不一致。外部 Store 的 SSR 设计与上一模块 SSR 课程中的状态交接原则相同。

## 23. Context、External Store 与数据缓存的边界

| 方案 | 擅长 | 不擅长 |
| --- | --- | --- |
| State + Props | 局部、显式 UI 状态 | 很深跨层共享 |
| Reducer | 复杂同步转换与事件建模 | 自己处理网络缓存 |
| Context | 低中频环境/域状态传递 | 细粒度 Selector、高频更新 |
| External Store | 细粒度订阅、跨根状态 | 自动解决服务器数据一致性 |
| Router/URL | 可分享导航状态 | 瞬时草稿与秘密数据 |
| Server Data Cache | Fetch、Cache、Dedup、Invalidation | 本地 Hover/Dialog 等 UI |

不要把服务器返回的所有课程复制进 Context 后手写 Loading、Cache、Retry、Invalidation。服务端状态仍由数据层拥有；Reducer 可以保存选中 ID、未提交草稿和当前工作流状态。

## 24. URL 是经常被遗漏的状态容器

筛选、分页、排序、当前实体 ID 若需要：

- 刷新保留。
- Back/Forward 正常。
- 复制链接分享。
- 服务端直接渲染相同页面。

它们通常属于 URL。把它们只放 Context，会让导航语义丢失；再用 Effect 双向同步 URL 和 Context 又容易循环。

优先让 Router Search Params 成为 Source of Truth，在 Render 中解析为领域值。临时输入草稿可本地保存，用户 Apply 后一次性更新 URL。

## 25. Reducer 与有限状态机

Reducer 能表达状态转换，但并不自动成为严格状态机。若工作流有：

- 大量互斥状态。
- 允许/禁止转换。
- 并行状态。
- Guard、Timeout、重试。
- 需要可视化与形式化测试。

应把 State 建模为明确的判别联合，并在 Reducer 中拒绝非法转换；复杂到一定程度可评估专用状态机工具。

不要保留十几个 Boolean 再称其为 Reducer 架构。Reducer 的价值正是集中不变量。

## 26. 与 Pinia/Vuex 经验对照

| Vue 状态经验 | React 对应理解 |
| --- | --- |
| Pinia Store State | Reducer State 或外部 Store Snapshot |
| Getter | Render Selector/派生值 |
| Action | Event/Command 编排，可能 Dispatch 多个 Action |
| `$patch` | 不推荐作为领域 Reducer 的通用外部 API |
| `storeToRefs` | Context 无内置细粒度 Selector；外部 Store Binding 处理 |
| Provide/Inject | Context，最近 Provider 决定 Value |

React 内置 Reducer 没有全局注册表、DevTools 插件协议、持久化或异步 Action 约定。Context 也不提供 Selector。不要期待 `useReducer + Context` 自动等于 Pinia；规模扩大后需根据实际需求选择数据层或外部 Store。

## 27. App 装配与 Provider 顺序

完整装配：

<<< ../../../examples/frontend/react-state-architecture/App.tsx

Provider 顺序表达依赖。如果 Workspace 需要 Progress Store，它必须位于 Progress Provider 内；如果互不依赖，顺序只决定覆盖范围。

避免“Provider Hell”的方法不是创建一个万能 AppContext，而是：

- 按路由懒加载只需要的 Provider。
- 提取语义化 `AppProviders` / `WorkspaceProviders` 组合组件。
- 删除可以回到 Props、URL 或模块 Service 的 Context。
- 明确 Provider 生命周期，避免导航时意外重建 Store。

## 28. Reducer 测试

Reducer 是纯函数，直接测试，无需渲染 React：

```ts
const initial = createInitialWorkspaceState(lessons)
const changed = workspaceReducer(initial, {
  type: 'draftChanged',
  lessonId: 'react-state',
  title: '新的标题'
})

expect(changed.drafts['react-state']).toBe('新的标题')
expect(initial.drafts['react-state']).toBeUndefined()
```

重点测试：

- 每类 Action 的转换。
- 未变化 Action 返回同一引用。
- previousState 未被修改。
- Publish Success 原子更新课程并清草稿。
- 旧 requestId 的 Success/Failure 被忽略。
- 空课程 Initial State 得到 null selectedId。
- 非法 Action 在运行时失败。

表格测试适合覆盖状态 × Action 的合法/非法组合。

## 29. Context 与 Command 测试

### Provider 缺失

渲染使用 Hook 的组件但不提供 Provider，断言得到清晰错误。这验证边界没有静默 Fallback。

### 用户流程

从 DOM 操作：选择课程、修改标题、放弃、发布。断言 UI 与 Service 调用，不直接调用 dispatch 绕过组件。

### 异步并发

使用可控 Service Promise，让请求 B 成为当前 requestId 后再完成 A，断言 A 被 Reducer 忽略。

### Provider 隔离

渲染两个 Provider，各自编辑同一 Lesson ID，确认状态不串线。这验证 Context 不是 Singleton。

## 30. External Store 契约测试

对 `ProgressStore` 直接测试：

- 未变化值不通知。
- 更新时 Snapshot 引用变化。
- 未更新时 `getSnapshot()` 返回同一引用。
- Unsubscribe 后不再收到通知。
- 值被限制在 0—100 且取整。

React 集成测试：

- 更新 Lesson A 只改变 A 显示值。
- Provider Unmount 后订阅被释放。
- Server Snapshot 与首次 Client Snapshot 一致。
- Strict Mode 下无重复 Store 实例泄漏。

不要在 `getSnapshot()` 每次返回新对象；React 会警告结果应缓存，并可能形成循环。

## 31. 常见失败模式

### 所有状态放 App 顶层

更新面巨大，路由卸载后数据仍驻留。把所有权下移到最近边界。

### 用 Context 保存每次键入

整个 Consumer 子树频繁 Render。表单草稿留在 Form，提交或明确共享时再提升。

### Reducer 中执行 Fetch

破坏纯度、无法重试与单测。Fetch 是 Command/数据层职责。

### Action 直接传 Setter Function

Reducer 行为不可序列化、不可回放，调用方仍控制内部结构。Action 传事实数据。

### Provider Value 每次新建

无关父 Render 也通知 Consumer。移动 Provider、拆 Context 或稳定 Value。

### 把 Context 默认值当测试替身

生产忘记 Provider 也静默运行假数据。业务 Context 使用 null + Guard Hook。

### 外部 Store Snapshot 每次新建

违反缓存契约，导致无穷变化。Store 更新时才创建新不可变 Snapshot。

### 客户端状态复制服务器缓存

两套 Source of Truth 产生失效与覆盖。服务器实体交给数据层，本地只保存 UI/草稿/工作流。

## 32. 完整示例结构

```text
examples/frontend/react-state-architecture/
├── App.tsx
├── LessonEditor.tsx
├── LessonSidebar.tsx
├── LessonWorkspace.tsx
├── LessonWorkspaceContext.tsx
├── ProgressContext.tsx
├── ProgressSlider.tsx
├── PublishButton.tsx
├── lesson-reducer.ts
├── lesson-service.ts
├── main.tsx
├── progress-store.ts
└── types.ts
```

前文已经展示核心文件。下面补齐入口，保证 13 个文件都能在页面直接看到完整源码。

### 浏览器入口

<<< ../../../examples/frontend/react-state-architecture/main.tsx

示例不包含 React 依赖与构建配置，因为本专题不得修改根 `package.json`。当前工作树没有 React 类型包，验证会区分纯 TypeScript 严格检查与 TSX 语法检查，不声称执行了完整 React 类型构建。

## 33. 生产检查清单

### 所有权

- 每个 State 有唯一 Source of Truth 和明确生命周期。
- URL、服务器数据、表单草稿与 UI 状态没有混为一体。
- 可推导值不重复存储。
- Provider 范围不超过实际消费者。

### Reducer

- Reducer 纯、同步、不可变且可穷举。
- Action 描述领域事件，不接受任意 Patch。
- 复杂异步完成有 requestId/版本保护。
- Side Effect 位于 Event/Command/数据层。

### Context

- 缺失 Provider 会明确失败。
- State 与 Dispatch 按需要拆分。
- Value 身份和变化频率经过检查。
- 没有用万能 Context 隐藏所有依赖。

### External Store

- Subscribe 返回正确 Cleanup。
- Snapshot 未变化时引用稳定。
- SSR Snapshot 与 Hydration 数据一致。
- Selector 粒度与更新频率有测试和测量。

### 验证

- Reducer 不变量由纯单测覆盖。
- Provider 隔离、用户流程和异步竞态已测试。
- React Profiler 验证实际更新范围。
- 不以“Render 次数越少”代替正确性和用户性能指标。

## 34. 进一步阅读

- [React：Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure)
- [React：Sharing State Between Components](https://react.dev/learn/sharing-state-between-components)
- [React：Extracting State Logic into a Reducer](https://react.dev/learn/extracting-state-logic-into-a-reducer)
- [React：Passing Data Deeply with Context](https://react.dev/learn/passing-data-deeply-with-context)
- [React：Scaling Up with Reducer and Context](https://react.dev/learn/scaling-up-with-reducer-and-context)
- [React：useReducer](https://react.dev/reference/react/useReducer)
- [React：useContext](https://react.dev/reference/react/useContext)
- [React：useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)

## 35. 本节小结

状态架构的起点不是选库，而是确定所有权和 Source of Truth。局部交互留在组件，需要共同协调时提升；复杂同步转换交给纯 Reducer；Context 负责在明确子树中传递依赖；URL 保存导航状态；服务器实体由数据缓存层拥有；真正外部、高频且需细粒度订阅的数据实现 `useSyncExternalStore` 契约。

Reducer 把“发生了什么”和“状态如何变化”集中起来，异步 Command 留在 Event 边界，并用 requestId 守住并发写权限。Context 与 External Store 各自解决不同问题，组合时也应保持边界清晰。

下一课将进入 React Router 与数据路由架构，讨论嵌套路由、Loader、Action、Pending UI、错误边界、URL 状态和鉴权为什么应由路由层统一协调。
