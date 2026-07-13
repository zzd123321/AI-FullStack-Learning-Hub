---
title: React Effect、Ref、异步竞态与自定义 Hook
description: 正确同步外部系统，管理依赖与清理，处理请求竞态，并以 Effect Event 和自定义 Hook 建立可靠边界
---

# React Effect、Ref、异步竞态与自定义 Hook

> 适用环境：React 19.2、TypeScript 严格模式。`useEffectEvent` 是 React 19.2 API，使用前应确认项目 React、类型包和 `eslint-plugin-react-hooks` 版本一致；其余 Effect/Ref 核心原则适用于更早的现代 React 版本。

## 1. 学习目标

完成本节后，你应该能够：

- 判断逻辑属于 Render、Event Handler 还是 Effect。
- 把 Effect 理解为外部系统同步过程，而非通用生命周期回调。
- 根据 Effect 代码推导依赖，而不是手工“选择触发时机”。
- 为订阅、Timer、连接和请求实现对称 Cleanup。
- 解释 Strict Mode 的 Setup → Cleanup → Setup 探测。
- 识别对象、函数依赖造成的无意义重连。
- 使用 `useEffectEvent` 分离响应式同步条件和非响应式通知逻辑。
- 使用 AbortController 与 ignore 标志共同阻止异步竞态。
- 理解组件内 Effect Fetch 的缓存、SSR 和瀑布局限。
- 区分 State 与 Ref，安全操作 DOM 和命令式 API。
- 判断 `useEffect`、`useLayoutEffect` 和 Event Handler 的边界。
- 设计表达业务能力、可清理且类型可靠的自定义 Hook。
- 测试 Effect 的同步、重同步、清理和异常路径。

## 2. Effect 是逃生口，不是默认工具

React 代码可以先分为三类：

| 逻辑 | 为什么发生 | 放在哪里 |
| --- | --- | --- |
| UI 计算 | 组件需要描述当前界面 | Render |
| 用户动作 | 用户点击、输入、提交 | Event Handler |
| 外部同步 | 组件当前可见状态需要与外部系统一致 | Effect |

外部系统包括：

- 浏览器原生 API、DOM、Media、Storage。
- WebSocket、EventSource、Timer、网络请求。
- 非 React Widget、地图、图表、编辑器。
- 全局 Event Listener、Observer、外部 Store。

如果没有外部系统，通常不需要 Effect。React 官方把 Effect 定义为“由 Render 本身导致、在 Commit 后执行的同步逻辑”。

### Event 与 Effect 的关键差异

“购买课程”应在 Submit Handler 发送 POST，因为它由一次明确的用户动作造成。如果写成：

```tsx
useEffect(() => {
  if (shouldBuy) void buyLesson()
}, [shouldBuy])
```

页面恢复、重新挂载或开发 Strict Mode 都可能重复购买。

“页面显示期间连接某聊天室”没有唯一点击来源：刷新、链接、Back 都可能让它出现。连接属于 Effect，因为只要组件以某个 roomId 出现在屏幕上，外部连接就应与之同步。

## 3. 先问：真的需要 Effect 吗

以下场景不需要 Effect。

### 从 Props/State 推导值

```tsx
// 错误：旧 fullName 先 Render，再触发第二次 Render
useEffect(() => setFullName(`${firstName} ${lastName}`), [firstName, lastName])

// 正确：Render 期间直接计算
const fullName = `${firstName} ${lastName}`
```

### 过滤和转换列表

```tsx
const visibleLessons = filterLessons(lessons, filters)
```

计算昂贵且已测量成瓶颈时才使用 `useMemo`，不要用 Effect + State 做缓存。

### 响应一次用户动作

```tsx
async function handleSubmit() {
  await publishLesson(draft)
  showToast('发布成功')
}
```

Toast 是这次提交的结果，放在 Handler 中；不要设置 `published=true` 后让另一个 Effect 猜测“为什么变成 true”。

### 根据 Props 重置整个子树

优先使用表达身份的 Key：

```tsx
<LessonEditor key={lessonId} lessonId={lessonId} />
```

而不是 Effect 先用旧草稿 Render，再清空 State。

### 调整部分 State

先检查 State 是否冗余、是否能在 Event 中同时更新、是否应改成 Reducer。Effect 同步组件内 State 往往形成额外 Render 和竞态链。

## 4. Effect 的真实生命周期：开始与停止同步

组件常被描述为 Mount、Update、Unmount，但每个 Effect 更适合独立理解为：

```text
开始同步(setup) → 停止同步(cleanup) → 用新依赖开始同步 → ... → 最终停止
```

当依赖变化时，React 会：

1. 使用旧 Render 闭包运行旧 Cleanup。
2. 使用新 Render 闭包运行新 Setup。

Unmount 时只运行最后一次 Cleanup。

聊天室从 `general` 切到 `react` 不只是“组件 Update”，而是旧 Effect 停止同步 general，然后新 Effect开始同步 react。这种思路比猜测 mounted/updated 更准确。

## 5. Effect 的基本结构

```tsx
useEffect(() => {
  const connection = createConnection(serverUrl, roomId)
  connection.connect()

  return () => {
    connection.disconnect()
  }
}, [serverUrl, roomId])
```

三个部分：

- Setup 描述如何与当前依赖同步。
- Dependency List 声明该同步读取的所有响应式值。
- Cleanup 撤销 Setup 的外部影响。

没有依赖数组：每次 Commit 后重同步。空数组：该 Effect 不读取任何会随 Render 改变的响应式值。带依赖：任一依赖与上次不满足 `Object.is` 相等时重同步。

“空数组等于 mounted”只是一种粗略表象。它仍会在 Unmount Cleanup，开发环境还可能执行额外 Setup/Cleanup 探测；未来隐藏/恢复或缓存模型也不应由一次性思维推断。

## 6. Cleanup 必须与 Setup 对称

常见配对：

| Setup | Cleanup |
| --- | --- |
| `addEventListener` | `removeEventListener`，同一类型、函数、Capture |
| `setInterval` | `clearInterval` |
| `observe` | `unobserve` / `disconnect` |
| `subscribe` | `unsubscribe` |
| `connect` | `disconnect` |
| 发起可取消请求 | `abort`，并忽略失效结果 |
| 创建第三方 Widget | `destroy` / `dispose` |

Cleanup 不应只在 Unmount 正确。它还会在每次依赖变化、下一次 Setup 之前执行。

错误做法是用 Ref 阻止第二次 Setup：

```tsx
const connected = useRef(false)
useEffect(() => {
  if (connected.current) return
  connected.current = true
  connection.connect()
}, [])
```

这让开发日志少一次，却没有解决真实的离开页面再返回、roomId 变化或资源释放。正确目标是用户无法分辨“只 Setup 一次”与“Setup → Cleanup → Setup”。

## 7. Strict Mode 是清理压力测试

开发 Strict Mode 会对 Effect 执行额外的 Setup → Cleanup → Setup。这模拟用户进入页面、离开再返回，提前暴露：

- Socket 只连不关。
- Listener 注册两次。
- Timer 泄漏。
- Widget 重复初始化。
- 请求旧结果覆盖新页面。

生产环境不会因为 Strict Mode 固定执行这套开发探测，但应用必须能承受任意真实的重挂载。不要以“生产只执行一次”为理由忽略 Cleanup。

入口继续保留 Strict Mode：

<<< ../../../examples/frontend/react-effects-and-refs/main.tsx

## 8. 依赖不是优化选项，而是代码事实

组件体中定义的 Props、State、Context、函数和变量都是响应式值。如果 Effect 读取它们，依赖列表必须反映这种关系。

```tsx
function ChatRoom({ roomId }: { roomId: string }) {
  const serverUrl = 'https://chat.example.com'

  useEffect(() => {
    const connection = createConnection(serverUrl, roomId)
    connection.connect()
    return () => connection.disconnect()
  }, [roomId])
}
```

这里 `serverUrl` 是每次 Render 都得到相同 Primitive，也可以移到模块外证明它不响应 Render。`roomId` 必须是依赖。

不能通过注释 Lint 强迫 Effect 说谎：

```tsx
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

这会把首次 Render 的 roomId 永久封进闭包。UI 显示 react 房间，Socket 却仍连接 general。

依赖由 Effect 代码决定。想减少依赖，应重构代码，让 Effect 真正不再读取那个响应式值，而不是删数组项。

## 9. 对象与函数身份为什么造成重跑

每次 Render 创建的新对象不满足 `Object.is`：

```tsx
const options = { serverUrl, roomId }

useEffect(() => {
  const connection = createConnection(options)
  return () => connection.disconnect()
}, [options])
```

即使字段没变，options 每次都是新引用，输入框键入也会重连。

优先把对象放进 Effect：

```tsx
useEffect(() => {
  const options = { serverUrl, roomId }
  const connection = createConnection(options)
  connection.connect()
  return () => connection.disconnect()
}, [serverUrl, roomId])
```

其他策略：

- 让组件接收 Primitive，而不是一个每次重建的 Config 对象。
- 把与 Render 无关的常量移到模块外。
- 把用户动作逻辑移回 Event Handler。
- 由调用方仅在身份具有语义时使用 `useCallback` / `useMemo`。
- 使用 Effect Event 表达“读取最新值但不需要重同步”的非响应式部分。

不要为了让 Lint 安静给所有函数套 `useCallback`。Memoization 也有依赖，且会扩大 API 复杂度。

## 10. Effect Event：把响应式同步与非响应式通知分开

需求：roomId 变化必须重连；muted 变化只影响下一次连接通知，不应重连。

自定义 Hook：

<<< ../../../examples/frontend/react-effects-and-refs/useChatRoom.tsx

`notifyConnected` 是 Effect Event：

- 它只能由 Effect 或另一个 Effect Event 调用。
- 它读取最近一次已提交 Render 的 muted 和 onNotification。
- 它不放进 Dependency List。
- 它不是跳过依赖的通用工具。

完整页面：

<<< ../../../examples/frontend/react-effects-and-refs/ChatRoom.tsx

切换 roomId 会断开旧连接并连接新房间；切换 muted 不会重连，但下一次 connected 回调会读取最新 muted。

错误使用：

```tsx
const logVisit = useEffectEvent(() => log(pageUrl))
useEffect(() => logVisit(), []) // 错：pageUrl 本来就应触发新访问日志
```

若某值代表同步条件，就必须保留为依赖。Effect Event 只隔离一次 Effect 内“发生某外部事件时读取最新值”的部分。

## 11. 一个连接对象的完整边界

教学用连接实现：

<<< ../../../examples/frontend/react-effects-and-refs/chat-service.ts

它与 React 无关，只暴露 connect、disconnect 和 onConnected。这个结构比 Hook 内直接写 WebSocket 细节更容易测试：

- Hook 测试注入记录调用的 ConnectionFactory。
- 服务测试验证连接协议和错误。
- 页面只处理 roomId、muted 和通知 UI。

真实 WebSocket 还需要建模 connecting/open/retrying/closed、心跳、鉴权刷新、指数退避和网络切换。不要在每个页面各写一套重连 Effect；把连接所有权放在明确的服务或上层 Provider。

## 12. Fetch Effect 的竞态是什么

用户先搜索 `React`，很快改成 `Vue`：

```text
请求 A: React ──────────────── 完成（慢）
请求 B: Vue   ─────── 完成（快）
```

如果两个 Promise 都直接 `setState`，A 最后完成会把 UI 错误覆盖成 React 结果。

组件 Unmount、路由切换、重试、Strict Mode 探测也会制造同类失效请求。问题不是 Promise “线程冲突”，而是旧异步工作在新的 UI 身份中仍有写权限。

## 13. Abort 与 Ignore 要解决不同层面

完整 Hook：

<<< ../../../examples/frontend/react-effects-and-refs/useLessonSearch.tsx

它同时使用：

```ts
const controller = new AbortController()
let ignore = false
```

Cleanup：

```ts
ignore = true
controller.abort()
```

- Abort 尽量停止网络、解析和服务端无用工作，节约资源。
- Ignore 保证即使底层不支持 Abort、请求已完成、Promise 链仍继续，也不能写入失效 UI。

只检查 `AbortError` 不够，因为自定义 Client 可能抛不同错误；示例先检查 `ignore || signal.aborted`。真正的业务错误才进入 error 状态。

每次 Effect Setup 有自己的 ignore 闭包。旧 Cleanup 把旧闭包标记为 true，不会影响新请求。

## 14. 异步状态必须区分 Empty 与 Idle

类型契约：

<<< ../../../examples/frontend/react-effects-and-refs/types.ts

状态含：

- idle：没有查询条件，未发请求。
- loading：请求进行中。
- success：请求成功，data 可以为空数组。
- error：请求失败。

“成功但零条数据”不是 idle，也不是 error。使用判别联合避免 `data?`、`loading`、`error?` 产生互相矛盾组合。

页面按状态穷举渲染：

<<< ../../../examples/frontend/react-effects-and-refs/LessonSearchPage.tsx

Gateway 封装 HTTP 边界：

<<< ../../../examples/frontend/react-effects-and-refs/lesson-gateway.ts

生产代码不应直接断言 JSON 类型；应使用 Schema Validator 在网络边界校验。这里聚焦 Effect，沿用最小类型断言。

## 15. 为什么组件 Effect Fetch 不是完整数据架构

手写 Fetch Effect 能解释同步与竞态，但有明显限制：

- Effect 不在服务端渲染执行，首屏 HTML 没有数据。
- 父组件先取数据、子组件挂载后再取，容易形成瀑布。
- Unmount 后再返回会重复请求，没有 Cache/Dedup。
- 预加载、路由切换、错误恢复和失效策略都要自建。
- Strict Mode 开发探测可能看到额外请求，虽然旧结果会被正确忽略。

生产应用优先考虑：

- 框架/Router Data Loader。
- 支持 SSR、缓存、去重、重试和失效的数据层。
- React Server Components/服务端数据 API（取决于框架）。

即便使用数据框架，本课原则仍适用于 WebSocket、DOM Widget、订阅以及数据库内部的 Observer 生命周期。

## 16. Gateway 身份必须稳定

`useLessonSearch` 把 gateway 放进依赖。如果父组件每次 Render 都执行：

```tsx
<LessonSearchPage gateway={createLessonGateway()} />
```

每次都是新对象，会触发请求重跑。

本课 Gateway 没有组件级配置，可以在模块顶层创建。应用装配：

<<< ../../../examples/frontend/react-effects-and-refs/App.tsx

若 Gateway 依赖当前 Token/Locale，可以：

- 把 Primitive 参数传给 Hook，由 Effect 建立本次 Client。
- 在 Provider/外部服务中维护稳定接口并显式更新认证。
- 仅在依赖确有变化时 Memoize Client。

“对象稳定”不能以捕获陈旧 Token 为代价。身份策略和数据新鲜度都要明确。

## 17. Ref 是稳定、可变、但不触发 Render 的容器

```tsx
const ref = useRef(initialValue)
```

同一组件身份内，React 每次 Render 返回同一个 Ref 对象。修改 `ref.current`：

- 不会触发 Render。
- 不属于 State 快照。
- 适合保存不参与 JSX 的可变值。

典型用途：

- DOM 节点。
- Timer/Observer/第三方实例句柄。
- 上一次值或请求序号等命令式元数据。
- 不影响 UI 的临时外部资源。

需要显示到 UI 的值必须用 State。如果 Ref 改了但页面应该更新，选择 Ref 就错了。

## 18. Render 期间不要随意读写 Ref

错误：

```tsx
ref.current += 1
return <p>Render {ref.current}</p>
```

它让 Render 不纯，重试和 Strict Mode 会改变结果。一般只在 Event Handler 或 Effect 中读写 Ref。

允许的特殊模式是可预测的惰性初始化：

```tsx
const playerRef = useRef<Player | null>(null)
if (playerRef.current === null) {
  playerRef.current = new Player()
}
```

前提是初始化结果稳定、没有外部副作用。涉及 DOM、订阅、网络或注册的实例仍应在 Effect 中创建和销毁。

## 19. DOM Ref 在 Commit 后才可用

聚焦输入框：

<<< ../../../examples/frontend/react-effects-and-refs/FocusField.tsx

初次 Render 时 DOM 还不存在，`inputRef.current` 为 null；Commit 后 React 把节点赋给 Ref；节点移除时恢复 null。因此类型是 `HTMLInputElement | null`，应使用空值检查或可选链。

聚焦由用户点击直接触发，所以放 Event Handler，不需要 Effect。常见反模式是：设置 `shouldFocus=true`，再用 Effect 观察它；这把一个明确事件变成间接同步。

适合 DOM Ref 的操作：

- Focus、Scroll、Selection。
- 测量布局。
- 调用原生媒体或 Canvas API。
- 初始化只提供命令式接口的第三方 Widget。

能用 Props/JSX 表达的属性仍交给 React，不要手动 `setAttribute` 与 React 争夺同一 DOM 所有权。

## 20. `useEffect` 与 `useLayoutEffect`

`useEffect` 通常在浏览器完成 Paint 后运行，不阻塞首屏绘制，适用于大多数订阅、网络和非视觉同步。

`useLayoutEffect` 在 DOM Commit 后、浏览器 Paint 前执行；它可以测量 DOM 并同步更新布局，避免用户看到一次错误位置，但会阻塞绘制。

使用 `useLayoutEffect` 的典型条件：

- 必须先测量 Tooltip 高度才能确定首帧位置。
- Paint 前必须同步滚动或 Selection，避免闪烁。

不要为了“更快”把全部 Effect 换成 Layout Effect。网络、日志和订阅不需要阻塞 Paint。Effect 在服务端都不执行，Layout Effect 还需考虑 SSR 警告与 Client-only 边界。

## 21. 类型安全的 Window 订阅 Hook

完整实现：

<<< ../../../examples/frontend/react-effects-and-refs/useWindowEvent.tsx

设计点：

- EventName 约束为 `keyof WindowEventMap`。
- Listener 参数根据事件名推断，例如 pointermove → PointerEvent。
- Effect 只对 eventName 和 capture 响应。
- Effect Event 让 Listener 总能读取最新 State，而不重复注册。
- Cleanup 使用同一 handleEvent 与 capture，正确移除。

使用页面：

<<< ../../../examples/frontend/react-effects-and-refs/PointerTracker.tsx

切换 enabled 不会重新注册 Window Listener；下一次 PointerEvent 读取最新 enabled。

如果事件频率很高，仍要测量每次 State 更新成本，可考虑 requestAnimationFrame 节流、CSS/Pointer Capture 或外部 Store。Effect Event 解决闭包与订阅身份，不自动解决性能。

## 22. 自定义 Hook 应封装能力，不是生命周期别名

好的 Hook 名表达业务或外部同步：

- `useLessonSearch(keyword, gateway)`
- `useChatRoom(options)`
- `useWindowEvent(name, listener)`

低价值封装：

```tsx
useMount(() => { ... })
useUpdateEffect(() => { ... }, deps)
```

它们隐藏依赖和 Cleanup，继续强化“模拟生命周期”思维。

自定义 Hook 的原则：

- 名称以 `use` 开头并遵守 Hook 规则。
- 输入尽量是语义稳定的 Primitive、接口和回调。
- 返回领域状态和命令，不泄漏内部 Setter/AbortController。
- Cleanup 完全封装在 Hook 内。
- 错误、重试、取消和并发行为写进契约。
- 不声称共享 State；每次调用默认独立。
- Hook 层数越深，依赖来源越要清晰。

## 23. Effect 不应吞掉错误

异步 Effect 不能直接写成：

```tsx
useEffect(async () => { ... }, [])
```

Effect Callback 必须返回 `undefined` 或 Cleanup Function；async 函数返回 Promise，不是 Cleanup。

使用内部 async 函数或 Promise Chain，并处理错误：

```tsx
useEffect(() => {
  let ignore = false

  async function load() {
    try {
      const data = await api.load()
      if (!ignore) setState({ status: 'success', data })
    } catch (cause: unknown) {
      if (!ignore) setState({ status: 'error', message: toMessage(cause) })
    }
  }

  void load()
  return () => { ignore = true }
}, [api])
```

Event Handler 中也要 Await/Catch。Error Boundary 不会自动捕获任意异步回调中的错误；数据层应把错误转换为可渲染状态或交给框架的错误通道。

## 24. 外部 Store 不应手写订阅 Effect

如果 React 需要订阅一个可在组件外变化、支持读取快照的 Store，优先使用 `useSyncExternalStore`。它为并发渲染、一致快照和 SSR 提供专门契约。

```tsx
const online = useSyncExternalStore(
  subscribe,
  getSnapshot,
  getServerSnapshot
)
```

`useEffect(() => subscribe(setState), [])` 容易在 Render 与 Effect 订阅之间漏掉更新，也可能出现撕裂。自定义 Window Event Hook 适用于事件通知；真正的外部状态源应实现 Snapshot 协议。

## 25. Timer 与最新值

Interval 通常只应在 delay 变化时重建，但 Tick Callback 要读取最新 Props/State。React 19.2 可以在自定义 Hook 内使用 Effect Event：

```tsx
function useInterval(callback: () => void, delay: number | null) {
  const onTick = useEffectEvent(callback)

  useEffect(() => {
    if (delay === null) return
    const id = setInterval(onTick, delay)
    return () => clearInterval(id)
  }, [delay])
}
```

不要把 Effect Event 传给子组件、普通 Event Handler 或放进依赖数组。它只属于定义它的组件/Hook 中的 Effect 逻辑。

旧版本 React 常用“latest callback Ref”实现类似行为，但手写 Ref 更难被 Lint 理解，也更容易在 Render 写入。升级前按项目版本使用官方支持的模式，不要复制 React 19.2 API 到旧运行时。

## 26. 测试 Effect 的方式

### 不断言实现次数

Strict Mode、并发调度和未来优化可能改变 Setup 次数。断言对称行为：

- 指定 roomId 创建连接。
- roomId 改变时旧连接断开、新连接建立。
- muted 改变不重连。
- Unmount 后连接断开且 Listener 退订。

### 异步竞态

用可控 Promise：

1. 发起 React 请求 A。
2. 改关键词，发起 Vue 请求 B。
3. 先完成 B，确认显示 Vue。
4. 再完成 A，确认仍显示 Vue。
5. 检查 A Signal 已 Abort。

### Timer

使用 Fake Timer 并在 React 测试工具的 `act()` 边界推进时间；每例恢复真实 Timer，避免污染。

### DOM Ref

从用户点击出发，断言 `document.activeElement` 是输入框，不读取组件内部 Ref。

### 网络

优先在 HTTP 边界使用 Mock Server，而不是 Mock `useLessonSearch` 内部实现。覆盖 200 空列表、4xx、5xx、Abort、慢响应和无效 JSON。

## 27. 调试依赖重跑

Effect 重跑异常时：

1. 记录 Dependency Array 中每个值。
2. 在 DevTools 保存两次数组。
3. 用 `Object.is(old[i], next[i])` 找出身份变化项。
4. 追踪它为何每次创建。
5. 重构所有权，而不是禁用 Lint。

常见原因：

- 父组件内联对象/函数。
- Effect 自己更新某个依赖 State，形成循环。
- Context Provider Value 每次是新对象。
- 组件 Key 不稳定导致重新挂载，而不是普通重跑。
- Strict Mode 开发探测被误认成依赖变化。

React DevTools Profiler 能区分 Render；网络面板和自定义连接日志能观察外部资源。不要只靠 `console.log('effect')` 猜原因。

## 28. 常见失败模式

### 用 Effect 同步所有 State

造成级联 Render、短暂旧 UI 和循环。先删派生 State。

### 空依赖数组配 Lint Disable

把首帧 Props/State 永久冻结到闭包，形成陈旧数据。

### 只 Abort，不阻止旧 Promise 写入

底层不一定完全支持取消。Abort 节约资源，ignore 保护 UI 写权限。

### 用 Ref 绕过依赖

每次 Render 把值写到 Ref，让 Effect 永远空依赖，隐藏了同步条件。React 19.2 的 Effect Event 只用于真正非响应式部分。

### Cleanup 使用另一个函数

```tsx
window.addEventListener('resize', () => resize())
return () => window.removeEventListener('resize', () => resize())
```

两个箭头函数身份不同，Listener 永远不会移除。

### Effect 中执行 POST 业务动作

重挂载会重复动作。由用户触发的写操作放 Event Handler 或框架 Action。

### 把自定义 Hook 当共享 Store

两个组件调用 `useLessonSearch()` 得到两份独立 State 和请求。共享 Cache 需要外部数据层或提升所有权。

## 29. 完整示例结构

```text
examples/frontend/react-effects-and-refs/
├── App.tsx
├── ChatRoom.tsx
├── FocusField.tsx
├── LessonSearchPage.tsx
├── PointerTracker.tsx
├── chat-service.ts
├── lesson-gateway.ts
├── main.tsx
├── types.ts
├── useChatRoom.tsx
├── useLessonSearch.tsx
└── useWindowEvent.tsx
```

前文已展示所有核心文件。每个文件都通过页面源码引用完整呈现，不需要离开课程页查找被省略的实现。

示例没有 React 依赖配置；本专题不得修改根 `package.json`。当前仓库也没有 React 19.2 类型，因此只进行 TSX 语法与纯 TypeScript 检查，不会把未执行的 React 类型构建描述为已通过。

## 30. 生产检查清单

### 是否需要 Effect

- 逻辑确实在同步 React 外部系统。
- 用户动作放 Event Handler，派生数据在 Render 计算。
- 没有用 Effect 维护冗余 State。

### 依赖与清理

- 所有响应式读取都在依赖中，Hooks Lint 无禁用。
- 对象/函数身份不会导致无意义重连。
- Setup 与 Cleanup 对称，可重复执行。
- Strict Mode 下无用户可见差异和资源泄漏。

### 异步

- 失效请求会 Abort 且旧结果被 Ignore。
- Idle/Loading/Empty/Error/Success 可区分。
- Error、Retry、Unmount 和快速切换已测试。
- 评估过 Router/Framework Data API，而非默认手写 Effect Fetch。

### Ref 与命令式边界

- Ref 保存的值不参与 UI 渲染。
- Render 期间不随意读写 Ref。
- DOM 操作只覆盖 React 无法声明表达的部分。
- Layout Effect 只用于 Paint 前必须完成的视觉同步。

### 自定义 Hook

- Hook 名表达能力，输入输出契约明确。
- Effect Event 没有被当成依赖逃生口。
- Cleanup、取消和错误封装完整。
- Hook 测试覆盖重同步和 Unmount。

## 31. 进一步阅读

- [React：Synchronizing with Effects](https://react.dev/learn/synchronizing-with-effects)
- [React：You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- [React：Lifecycle of Reactive Effects](https://react.dev/learn/lifecycle-of-reactive-effects)
- [React：Separating Events from Effects](https://react.dev/learn/separating-events-from-effects)
- [React：Removing Effect Dependencies](https://react.dev/learn/removing-effect-dependencies)
- [React：Referencing Values with Refs](https://react.dev/learn/referencing-values-with-refs)
- [React：Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)
- [React：useEffectEvent](https://react.dev/reference/react/useEffectEvent)
- [React：useLayoutEffect](https://react.dev/reference/react/useLayoutEffect)

## 32. 本节小结

Effect 的正确问题不是“什么时候执行这段代码”，而是“当前 Props/State 要与哪个外部系统保持什么同步关系，以及如何停止旧同步”。Dependency List 是这段关系的事实描述，Cleanup 是其逆操作，Strict Mode 则验证它能否安全重复。

Ref 提供不触发 Render 的命令式容器；Effect Event 在 React 19.2 中把同步条件与只需读取最新值的外部回调分开；Abort 与 Ignore 共同守住异步请求的资源和写权限。自定义 Hook 最终应封装一个清晰能力，而不是隐藏一堆生命周期技巧。

下一课将进入 Reducer、Context 与跨组件状态架构，讨论本地 State、提升状态、Context、外部 Store 和服务端数据各自应该拥有哪类信息。
