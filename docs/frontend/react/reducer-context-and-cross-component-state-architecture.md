---
title: React Reducer、Context 与跨组件状态架构
description: 从状态所有权出发，逐步理解 State Shape、Reducer、Context、异步命令与外部 Store
outline: deep
---

# React Reducer、Context 与跨组件状态架构

> 适用环境：React 19.x、TypeScript 严格模式。本课先建立状态架构的判断方法，再介绍 React API；不会把所有共享问题都归结为“选哪个状态库”。

上一课讨论了 React 怎样和外部世界同步。这一课把视线移回应用内部：组件越来越多、更新规则越来越复杂时，状态究竟应该放在哪里？

很多项目从“Props 传得麻烦”直接跳到 Context，或者从“Setter 太多”直接跳到 Reducer。结果只是把状态搬了家，原来的矛盾仍然存在。更可靠的顺序是：

```text
先确认谁拥有数据
    ↓
设计不会互相矛盾的 State
    ↓
更新规则复杂时集中到 Reducer
    ↓
深层组件确实需要时再用 Context 传递
    ↓
状态本来就在 React 外部时，使用外部 Store 订阅协议
```

## 状态架构先回答“谁拥有它”

“很多组件都要用，所以放全局”不是充分理由。同一个值被十个组件读取，也可能只属于某个路由页面；页面离开后，它就应该释放。

面对一个候选 State，可以连续问五个问题：

1. 谁读取它？这些组件最近的共同祖先是谁？
2. 谁修改它？修改由哪一个用户事件或外部事件造成？
3. 它应该存活多久？切路由、刷新、退出账号后还要保留吗？
4. 谁是唯一事实来源：React、URL、服务器、DOM，还是浏览器 API？
5. 它能否由其他 Props 或 State 直接计算出来？

这些答案通常会把状态带到不同位置：

| 数据 | 更自然的所有者 |
| --- | --- |
| Dialog 开关、Hover、局部输入 | 最近使用它的组件 |
| 兄弟组件共同编辑的草稿 | 最近共同父级，必要时配合 Reducer |
| 当前 Tab、筛选、分页、实体 ID | URL / Router |
| Theme、Locale、会话视图 | 有限范围的 Provider 或会话 Store |
| 课程列表、订单、权限 | 服务端数据层，服务器是事实来源 |
| Online 状态、媒体查询、浏览器 Store | `useSyncExternalStore` 适配器 |

### 提升状态不是把状态放到应用顶层

如果两个兄弟组件需要协调，把 State 提升到它们最近的共同父级即可。Provider 也可以只包住某个路由子树。同一个 Context 甚至可以有多个 Provider，每棵子树各自拥有独立状态。

所有权范围越大，生命周期越长，潜在更新面也越大。默认从最小正确范围开始，需要共享时再上移。

### 可推导值不要保存第二份

课程列表已经包含完整实体时，只保存 `selectedId`：

```tsx
const [selectedId, setSelectedId] = useState<string | null>(null)
const selectedLesson =
  lessons.find((lesson) => lesson.id === selectedId) ?? null
```

如果同时保存 `selectedLesson` 对象，列表更新后，选中对象可能还是旧副本。Render 中查找虽然每次都会执行，却始终基于同一份事实来源。

URL 和服务器数据也不要轻易复制进 Context。复制之后就必须解释双向同步、冲突和失效策略；很多 Effect 循环正是由两份事实来源造成的。

## State Shape 决定系统能否保持一致

状态库只能存储你设计的数据结构，无法自动修复矛盾结构。例如：

```ts
interface PublishState {
  isPublishing: boolean
  isPublished: boolean
  error: string | null
}
```

它允许 `isPublishing` 和 `isPublished` 同时为 `true`，也允许成功状态仍携带错误。把互斥阶段建模成判别联合更准确：

```ts
type PublishState =
  | { status: 'idle' }
  | { status: 'publishing'; requestId: string }
  | { status: 'success' }
  | { status: 'error'; message: string }
```

此时每个分支只能携带属于自己的字段，组件按 `status` 判断后，TypeScript 也会同步收窄类型。

完整领域类型：

<<< ../../../examples/frontend/react-state-architecture/types.ts

设计 State 时优先遵守这些原则：

- 总是一起变化的字段可以组合；
- 互斥状态用联合类型，不用多个 Boolean；
- 能从现有数据计算的值不存；
- 同一实体只保存一份，其他位置保存 ID；
- 避免难以不可变更新的深层嵌套；
- 每个字段都能说清生命周期和事实来源。

本例把课程实体、选中 ID、按课程 ID 保存的草稿和发布状态分开。草稿没有覆盖原课程，发布成功前仍可比较“已保存标题”和“正在编辑标题”。

## 什么时候 `useState` 已经不够清晰

`useState` 很适合少量、直接、彼此独立的更新：

```tsx
const [open, setOpen] = useState(false)
```

当多个字段必须在一个事件中保持一致，或者相同更新规则散落在多个 Handler 中，Reducer 会更清楚。例如“发布成功”需要同时：

- 用服务器结果更新课程；
- 删除这门课程的草稿；
- 把发布阶段改成成功。

如果三个 Setter 分散执行，中间状态和遗漏都更难控制。Reducer 把它们变成一个原子转换：

```text
nextState = reducer(previousState, action)
```

Reducer 并不会自动提升性能，也不是所有 Boolean 的必经之路。它的价值是集中复杂的状态转换和跨字段不变量。

## Reducer 只负责纯状态转换

完整 Reducer：

<<< ../../../examples/frontend/react-state-architecture/lesson-reducer.ts

一个 Reducer 应满足：

- 相同 State 与 Action 得到相同结果；
- 不修改传入的 State 或 Action；
- 不发请求、不导航、不写 Storage、不显示 Toast；
- 不读取当前时间、随机数或外部可变单例；
- 没有变化时可以返回原对象；
- 一个 Action 涉及的跨字段规则在一次返回中完成。

因为它是普通纯函数，React 可以安全地重试它，测试也不需要渲染组件。

### Action 描述“发生了什么”

下面的 Action 把内部结构泄漏给所有调用者：

```ts
{ type: 'setState', patch: { /* 任意字段 */ } }
```

更好的 Action 记录领域事实：

```ts
{ type: 'draftChanged', lessonId, title }
{ type: 'publishStarted', lessonId, requestId }
{ type: 'publishSucceeded', lesson, requestId }
```

组件只报告发生的事件，Reducer 决定怎样保持不变量。`WorkspaceAction` 是判别联合，所以 `switch` 进入分支后，Payload 会自动收窄。`assertNever(action)` 还会在新增 Action 却漏写分支时产生编译错误。

不要把 `payload` 写成 `any`，也不要把 Setter 函数塞进 Action；那会失去可穷举、可测试、可回放的优势。

### 不可变更新不等于复制所有内容

```ts
return {
  ...state,
  drafts: { ...state.drafts, [lessonId]: title }
}
```

新 State 只复制发生变化的路径，未变化分支保留原引用，这叫结构共享。没有实际变化时直接返回 `state`，让 `Object.is`、Memo 和订阅层能够识别“什么都没变”。

可以修改刚创建的局部副本：

```ts
const nextDrafts = { ...state.drafts }
delete nextDrafts[lessonId]
return { ...state, drafts: nextDrafts }
```

这里修改的是新对象，不是传入的 State。两者不要混淆。

### 初始 Props 只是初始值

Provider 使用 `useReducer` 的第三个参数延迟创建初始状态：

```tsx
const [state, dispatch] = useReducer(
  workspaceReducer,
  initialLessons,
  createInitialWorkspaceState
)
```

`initialLessons` 后续变化不会自动重置 Reducer，这和 `useState(initialValue)` 一样。如果它只是初始快照，`initial*` 命名是准确的；如果父级才是持续事实来源，就不应再复制一份 Reducer State。

切换实体时确实要全量重建，可以改变 Provider 的 `key`；要合并服务器新数据，则应定义显式 Action 和冲突规则。不要用 Effect 静默覆盖用户草稿。

## 异步工作留在 Event 与 Service 边界

发布由用户点击造成，所以流程是：

```text
Click
  → dispatch publishStarted
  → await service.publish
  → dispatch publishSucceeded 或 publishFailed
```

HTTP Service 只负责请求协议与运行时数据校验：

<<< ../../../examples/frontend/react-state-architecture/lesson-service.ts

Command 组件负责异步编排：

<<< ../../../examples/frontend/react-state-architecture/PublishButton.tsx

Reducer 始终同步，只接收已经发生的事实。让 Reducer 发 Fetch 或返回 Promise 会破坏纯度，也让重试、错误处理和单测变得含糊。

### requestId 阻止旧请求改写新状态

用户可能重试，多个组件也可能触发同一命令。请求 A 晚于请求 B 完成时，A 已经不是当前发布任务。

每次开始发布先生成 ID，完成 Action 带回同一个 ID。Reducer 只有在当前课程仍处于同一 `requestId` 的 publishing 状态时接受结果；否则返回原 State。

这和上一课的 ignore 变量解决同一类“过期任务写权限”问题，只是规则被提升进 Reducer，因此所有 Command 都受到同一约束。Abort 可以节约资源，`requestId` 保证客户端状态正确；不可幂等的服务器操作还需要服务端 Idempotency Key，客户端忽略结果无法撤销已经发生的写入。

## Context 解决深层传递，不负责设计状态

当 State 已经有清晰所有者，但很多深层组件需要读取或 Dispatch 时，逐层透传 Props 可能只是在搬运。Context 让组件直接读取最近祖先 Provider 的 Value。

完整 Provider：

<<< ../../../examples/frontend/react-state-architecture/LessonWorkspaceContext.tsx

这里使用两个 Context：

- `WorkspaceStateContext` 提供会变化的 State；
- `WorkspaceDispatchContext` 提供身份稳定的 Dispatch。

只使用 Dispatch 的组件不需要订阅 State Context。若把两者合成每次新建的 `{ state, dispatch }`，State 一变，所有 Consumer 都会收到新对象，包括只负责派发事件的组件。

自定义 Hook 把 Context 的空值检查集中起来。组件若放在错误的 Provider 外，会立刻得到可定位错误，而不是静默使用一份永不变化的默认假数据。

### Context 不是进程级单例

同一个 Context 可以放置多个 Provider。每个 Consumer 读取离自己最近的那一个，因此两个课程工作台可以各自拥有独立状态。这也是 Provider 测试隔离和组件预览的基础。

Provider 应包住实际消费者的最小稳定子树。按业务域和变化频率拆分，不要创建一个返回几十个无关字段的 `useAppContext()`。

### Context 更新怎样传播

React 用 `Object.is` 比较 Provider 的前后 Value。Value 变化时，读取该 Context 的 Consumer 会重新 Render；给中间祖先加 `memo` 不能挡住 Context 传播。

双 Context 只能隔离 Dispatch 消费者。所有读取整个 Workspace State 的组件仍会在 State 对象变化时得到新 Value。这不是错误，小型或中低频领域状态通常完全足够；但 Context 本身没有 Selector，也不是细粒度性能工具。

可以按以下顺序控制范围：

1. 让 State 靠近实际使用处；
2. 缩小 Provider 覆盖范围；
3. 按领域和变化频率拆 Context；
4. 避免字段没变却每次创建新 Value；
5. 只有经过测量确实需要 Selector 时，再评估外部 Store。

Prop Drilling 并非总是坏事。只有两三层时，Props 让依赖更显式，也让组件更容易独立复用。

## 工作台中的单向数据流

侧边栏读取课程并报告选择事件：

<<< ../../../examples/frontend/react-state-architecture/LessonSidebar.tsx

编辑器从原课程和草稿推导输入值，报告编辑与放弃事件：

<<< ../../../examples/frontend/react-state-architecture/LessonEditor.tsx

页面负责组合这些能力：

<<< ../../../examples/frontend/react-state-architecture/LessonWorkspace.tsx

整个同步路径只有一个方向：

```text
用户事件
  → dispatch(Action)
    → reducer(previousState, action)
      → nextState
        → Context 发布新 State
          → Consumer Render 派生 UI
```

Service 的异步 Command 位于用户事件与完成 Action 之间，不进入 Reducer。所有组件都从同一个 Workspace State 读取结果。

## 什么时候需要 React 外部的 Store

Context 传递的是一个 Value。若状态源本来就在 React 外部，并且自己维护 Snapshot 和订阅，例如浏览器 Online 状态、媒体查询、跨 React Root 的 Store，就不应再用 Effect 把它复制进本地 State。

`useSyncExternalStore` 定义了三项契约：

- `subscribe(listener)`：注册更新通知并返回 Unsubscribe；
- `getSnapshot()`：返回当前不可变快照；
- `getServerSnapshot()`：SSR/Hydration 使用的服务端快照。

手写“Render 读取一次，Effect 再订阅”可能漏掉两者之间发生的更新，并发 Render 也可能让不同组件读到不同版本。

### Snapshot 必须可缓存

Store 没变化时，`getSnapshot()` 必须返回与上次 `Object.is` 相同的值。每次都返回 `{ ...state }` 会让 React 认为状态永远在变化。

本课的进度 Store 只在值真实变化时创建新快照：

<<< ../../../examples/frontend/react-state-architecture/progress-store.ts

Context 可以负责注入稳定 Store 实例，Consumer 再使用专用订阅协议：

<<< ../../../examples/frontend/react-state-architecture/ProgressContext.tsx

`useLessonProgress` 的 Snapshot Selector 返回一个 Number。其他课程的进度变化后，即使 React 重新读取 Snapshot，这门课程的值仍相等，就不必提交无关 UI。

进度控件：

<<< ../../../examples/frontend/react-state-architecture/ProgressSlider.tsx

这种“Context 负责找到 Store，Store 负责细粒度订阅”的组合，是许多状态库 React Binding 的基本形态。

### SSR 快照必须与 Hydration 对得上

示例的 `getServerSnapshot` 固定返回 `0`，表示服务端也把进度渲染为 0，真实进度只在客户端接管后出现。若服务器已知道用户进度，则不能随便返回 0：

1. 服务端用已知进度生成 HTML；
2. 安全序列化同一份初始快照；
3. 客户端 Provider 用该快照恢复 Store；
4. `getServerSnapshot` 在 Hydration 阶段返回同一语义的值。

否则首次客户端内容与服务端 HTML 不一致。外部 Store 解决订阅一致性，不会替你设计 SSR 数据交接。

## 不同状态容器各自解决什么问题

| 方案 | 擅长 | 不应承担 |
| --- | --- | --- |
| State + Props | 局部、显式 UI 状态 | 很深的跨层共享 |
| Reducer | 复杂同步转换和不变量 | 网络缓存与副作用 |
| Context | 在有限子树传递依赖 | 高频细粒度 Selector |
| URL / Router | 可刷新、可分享的导航状态 | 密码、瞬时草稿 |
| External Store | React 外部状态与精细订阅 | 自动管理服务端缓存 |
| Server Data Layer | Fetch、Cache、Dedup、Invalidation | Hover、Dialog 等局部交互 |

筛选、分页、排序和当前实体 ID 如果要支持刷新、Back/Forward 和复制链接，通常应让 URL 成为事实来源。不要先放 Context，再用两个 Effect 双向同步 URL。

服务器返回的课程实体也不应全部复制进 Context 后自己重写缓存系统。数据层拥有服务器状态；Reducer 可以拥有未提交草稿、选中 ID 和客户端工作流阶段。

### 与 Pinia / Vuex 经验对照

| Vue 经验 | React 中更接近的概念 |
| --- | --- |
| Store State | Reducer State 或外部 Store Snapshot |
| Getter | Render 中的派生值或 Selector |
| Action | Event/Command 编排，可 Dispatch 多个 Action |
| Provide/Inject | Context，最近 Provider 决定 Value |
| `storeToRefs` | Context 没有同等 Selector；外部 Store Binding 负责 |

`useReducer + Context` 不会自动得到 Pinia 的全局注册、DevTools、持久化和细粒度订阅。不要为了形式相似而强行一一映射，先判断当前问题需要哪一种能力。

## 完整装配与 Provider 生命周期

应用装配：

<<< ../../../examples/frontend/react-state-architecture/App.tsx

浏览器入口：

<<< ../../../examples/frontend/react-state-architecture/main.tsx

Provider 顺序表达覆盖范围和依赖关系。减少“Provider 堆叠”的方法不是合并成万能 Context，而是按路由装载所需 Provider、提取有语义的组合组件，并删除本来应该属于 Props、URL 或模块 Service 的 Context。

示例目录共 13 个文件，以上源码引用已覆盖全部实现，页面中可以直接查看完整代码。仓库当前没有 React 类型与测试运行时，因此验证会明确区分纯 TypeScript 检查与 TSX 源码审查，不会把未运行的 React 构建描述为已通过。

## 如何验证这套架构

Reducer 是纯函数，最先用表格测试覆盖：

- 每种 Action 的正常转换；
- 未变化或非法目标返回原引用；
- previousState 没有被修改；
- 发布成功会原子更新课程并清理草稿；
- 旧 `requestId` 的成功与失败都被忽略；
- 空课程初始状态得到 `selectedId: null`。

Context 集成测试从用户可见行为出发：选择课程、修改标题、放弃草稿、发布并显示结果。再验证缺少 Provider 时错误清晰，以及两个 Provider 的状态互不串线。

外部 Store 要直接验证契约：

- 值没变时不通知，Snapshot 引用保持不变；
- 值变化时创建新 Snapshot 并通知；
- Unsubscribe 后不再收到通知；
- 进度被限制在 0—100；
- SSR Snapshot 与首次 Hydration Snapshot 一致。

性能判断应使用 React Profiler 和实际交互指标。Render 并不等于 DOM 一定更新，“Render 次数最少”也不是架构正确性的替代品。

## 本节小结

状态架构的起点不是状态库，而是唯一事实来源和生命周期。局部交互留在组件，需要兄弟协作时提升到最近共同父级；更新规则复杂时用纯 Reducer 集中不变量；深层组件确实需要同一领域状态时，用有限范围的 Context 传递；URL、服务器数据和外部 Store 继续由各自擅长的容器拥有。

Reducer 回答“发生一个事件后，状态怎样纯粹地变化”；Event Handler 与 Service 负责异步 Command；`requestId` 收回旧任务的写权限。Context 解决传递，`useSyncExternalStore` 解决 React 外部状态的一致订阅，它们不是同一个层面的工具。

下一课进入 [React Router、数据路由与应用边界](./react-router-data-routing-and-application-boundaries.md)，继续讨论 URL 为什么是状态容器，以及 Loader、Action、Pending UI 和错误边界怎样围绕路由组织。

## 延伸阅读

- [React：Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure)
- [React：Sharing State Between Components](https://react.dev/learn/sharing-state-between-components)
- [React：Extracting State Logic into a Reducer](https://react.dev/learn/extracting-state-logic-into-a-reducer)
- [React：Passing Data Deeply with Context](https://react.dev/learn/passing-data-deeply-with-context)
- [React：Scaling Up with Reducer and Context](https://react.dev/learn/scaling-up-with-reducer-and-context)
- [React：useReducer](https://react.dev/reference/react/useReducer)
- [React：useContext](https://react.dev/reference/react/useContext)
- [React：useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)
