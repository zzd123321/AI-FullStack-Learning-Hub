---
title: React Effect、Ref、异步竞态与自定义 Hook
description: 从外部同步的因果关系出发，理解 Effect 生命周期、依赖、清理、请求竞态、Ref 与自定义 Hook
outline: deep
---

# React Effect、Ref、异步竞态与自定义 Hook

> 适用环境：React 19.2、TypeScript 严格模式。文中的 `useEffectEvent` 是 React 19.2 API；使用前需要让 React、类型包与 `eslint-plugin-react-hooks` 保持兼容。其余 Effect 与 Ref 原则同样适用于更早的现代 React。

上一课建立了 React 的核心模型：组件在一次 Render 中读取 Props 和 State 快照，返回 UI 描述；React 随后把差异提交到真实环境。

但应用不可能永远只做纯计算。它还要连接聊天室、监听窗口事件、调用网络接口、聚焦输入框。这些操作都越过了 React 的声明式边界。本课要解决的不是“背下几个 Hook”，而是一个更根本的问题：

> 当 React 管理的界面需要接触外部世界时，谁拥有资源，何时开始同步，何时必须停止，旧异步任务何时失去写权限？

理解这条因果链后，依赖数组、Cleanup、AbortController、Ref 和自定义 Hook 就不再是零散技巧。

## 先判断代码为什么执行

遇到一段逻辑时，先不要急着写 `useEffect`。先问它为什么发生。

| 原因 | 应放的位置 | 例子 |
| --- | --- | --- |
| 为了描述当前界面 | Render | 拼接姓名、过滤列表、选择空状态文案 |
| 因为用户刚做了某个动作 | Event Handler | 提交订单、保存草稿、点击后聚焦 |
| 因为组件正在以某种状态显示，需要和外部系统保持一致 | Effect | 连接指定房间、订阅事件、同步第三方组件 |

这三类代码最重要的差异是触发原因，而不是它们是不是异步。

### Render：根据输入计算结果

假设 `firstName` 和 `lastName` 已经是 State。完整姓名可以在 Render 中直接得到：

```tsx
const fullName = `${firstName} ${lastName}`
```

不要把计算结果再存进另一份 State：

```tsx
// 不推荐：第一次会带着旧 fullName 提交，Effect 之后又触发一次 Render。
useEffect(() => {
  setFullName(`${firstName} ${lastName}`)
}, [firstName, lastName])
```

后一种写法同时制造了冗余数据、额外 Render 和短暂不一致。列表过滤、排序、状态文案也遵循同一原则。只有昂贵计算经过测量确实成为瓶颈时，才考虑 `useMemo`；`useMemo` 是性能优化，不是保持数据正确的工具。

### Event Handler：处理已经发生的用户动作

购买课程是用户点击提交按钮造成的，因此请求应留在提交处理函数中：

```tsx
async function handlePurchase(): Promise<void> {
  await purchaseLesson(lessonId)
  showToast('购买成功')
}
```

如果先设置 `shouldBuy`，再让 Effect 观察它并发送请求，组件重新挂载、页面恢复或开发环境检查都可能重复购买。Effect 不知道这个状态是由哪一次业务动作造成的；Handler 知道。

### Effect：让外部系统跟上当前界面

聊天室连接不同。用户可能点击进入，也可能刷新页面、打开收藏链接或使用浏览器后退到这里。只要 `ChatRoom` 正以 `roomId="react"` 显示，外部连接就应该指向 `react` 房间。

它表达的不是“一次点击”，而是一段持续关系：

```text
当前已提交 UI：roomId = react
               ↓ 要保持一致
外部聊天室连接：roomId = react
```

这才是 Effect 的用武之地。

## Effect 是一段可开始、可停止的同步过程

把 Effect 只理解成 Vue 2 的 `mounted` 或 `updated` 替代品，很快会遇到依赖和清理问题。更准确的模型是：每个 Effect 都是一段独立同步过程。

```tsx
useEffect(() => {
  const connection = createConnection(serverUrl, roomId)
  connection.connect()

  return () => {
    connection.disconnect()
  }
}, [serverUrl, roomId])
```

这段代码可以读成：

1. 使用本次 Render 的 `serverUrl` 和 `roomId` 建立连接；
2. 只要这两个同步条件没有变化，就继续使用该连接；
3. 条件变化或组件离开时，先断开旧连接；
4. 条件变化时，再按新值建立新连接。

例如房间从 `general` 切到 `react`，实际顺序是：

```text
general Setup
    ↓ roomId 改变并提交
general Cleanup
    ↓
react Setup
    ↓ 组件离开
react Cleanup
```

旧 Cleanup 读取的是创建它的那一次 Render 快照，因此它能准确释放旧房间资源。React 不会拿新 `roomId` 去猜旧资源是什么。

### 依赖数组描述同步条件

Effect 有三种常见形式：

```tsx
useEffect(setup)             // 每次 Commit 后都重新同步
useEffect(setup, [])         // 没有读取会随 Render 改变的响应式值
useEffect(setup, [roomId])   // roomId 改变时需要重新同步
```

空数组的表面效果接近“挂载后执行”，但概念上仍不是生命周期暗号。它的含义是：这段同步过程不依赖任何 Props、State、Context 或组件体内会变化的值。它仍然需要在离开时清理，也可能在开发环境接受额外的启停检查。

### Cleanup 是 Setup 的逆操作

常见的资源都有明确配对：

| Setup | Cleanup |
| --- | --- |
| `addEventListener` | 用同一函数和捕获选项 `removeEventListener` |
| `setInterval` | `clearInterval` |
| `observe` | `unobserve` 或 `disconnect` |
| `subscribe` | `unsubscribe` |
| `connect` | `disconnect` |
| 创建第三方实例 | `destroy` 或 `dispose` |
| 发起可取消请求 | `abort`，并阻止过期结果写入 |

Cleanup 不只是“组件销毁时执行”。依赖变化后，React 会在新 Setup 前执行旧 Cleanup。因此一个只在最终卸载时才正确的 Cleanup，本身就不完整。

## Strict Mode 为什么会让 Effect 多执行一次

开发环境的 Strict Mode 会额外执行一次：

```text
Setup → Cleanup → Setup
```

这不是生产业务流程，也不是 React 随机重复代码。它是一项压力测试：如果用户进入页面、离开、再回来，应用是否仍然正确？

它很容易暴露这些问题：

- Socket 建立后没有关闭；
- Window Listener 注册了两份；
- Timer 一直存活；
- 第三方 Widget 重复初始化；
- 第一次请求比第二次晚返回，并覆盖新结果。

入口应保留 Strict Mode：

<<< ../../../examples/frontend/react-effects-and-refs/main.tsx

不要用 Ref 阻止第二次 Setup：

```tsx
// 错误方向：日志少了，但资源仍没有正确释放。
const didConnect = useRef(false)

useEffect(() => {
  if (didConnect.current) return
  didConnect.current = true
  connection.connect()
}, [])
```

真正的目标是：用户无法分辨“只启动一次”和“启动、停止、再启动”。如果做不到，问题在 Setup/Cleanup 不对称，而不在 Strict Mode。

## 依赖不是手工选择的触发开关

组件体内的 Props、State、Context，以及基于它们创建的变量和函数，都是响应式值。Effect 读取哪些响应式值，依赖数组就必须反映哪些值。

```tsx
function ChatRoom({ roomId }: { roomId: string }) {
  useEffect(() => {
    const connection = createConnection(roomId)
    connection.connect()
    return () => connection.disconnect()
  }, [roomId])
}
```

如果强行写成空数组，首次 Render 的 `roomId` 会留在闭包里。页面标题可能已经显示 `react`，外部连接却仍停在 `general`。

```tsx
// 不要用关闭 Lint 的方式让 Effect 对依赖说谎。
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

一个很实用的原则是：

> 依赖由 Effect 内部代码决定。想减少依赖，就改变代码与数据的所有权，让 Effect 真正不再读取它，而不是直接删除数组项。

### 为什么对象和函数容易造成无意义重连

React 使用 `Object.is` 比较新旧依赖。每次 Render 创建的对象，即使字段相同，也不是同一个引用：

```tsx
const options = { serverUrl, roomId }

useEffect(() => {
  const connection = createConnection(options)
  connection.connect()
  return () => connection.disconnect()
}, [options])
```

页面中任意 State 更新都会创建新 `options`，于是连接被无意义地断开再重连。更直接的写法是让 Effect 读取真正的 Primitive 同步条件：

```tsx
useEffect(() => {
  const options = { serverUrl, roomId }
  const connection = createConnection(options)
  connection.connect()
  return () => connection.disconnect()
}, [serverUrl, roomId])
```

常用重构顺序如下：

1. 把纯计算移回 Render；
2. 把一次用户动作移回 Handler；
3. 在 Effect 内创建只属于这次同步的对象和函数；
4. 把与组件无关的常量移到模块外；
5. 让 API 接收语义明确的 Primitive；
6. 只有引用身份本身确实是契约时，才使用 `useMemo` 或 `useCallback`。

不要为了“让依赖稳定”给所有函数套 `useCallback`。Memoization 自己也有依赖和认知成本，它不能修复错误的所有权。

## 一个 Effect 中可能有两种不同读取

现在给聊天室增加“静音连接通知”功能：

- `roomId` 改变时，必须断开旧房间并连接新房间；
- `muted` 改变时，只影响下一条通知，不应该重连；
- 收到 connected 事件时，需要读取最近一次已提交的 `muted`。

这里包含两种语义：

| 读取 | 是否应让 Effect 重同步 |
| --- | --- |
| `roomId`、`serverUrl` | 是，它们定义连接本身 |
| `muted`、通知回调 | 否，只在外部事件到来时读取最新值 |

React 19.2 的 `useEffectEvent` 可以把后一部分提取为 Effect Event：

<<< ../../../examples/frontend/react-effects-and-refs/useChatRoom.tsx

`notifyConnected` 会读取最近一次已提交 Render 的 `muted` 和 `onNotification`，但它不属于连接的同步条件，所以不放入依赖数组。

完整使用页面：

<<< ../../../examples/frontend/react-effects-and-refs/ChatRoom.tsx

切换房间会重连；切换静音不会重连，但连接回调下一次执行时能看到最新静音值。

### Effect Event 不是依赖逃生口

如果页面地址变化本来就应该记录一次访问，那么地址必须是同步条件：

```tsx
// 错误：pageUrl 本来就应该决定何时记录一次访问。
const logVisit = useEffectEvent(() => log(pageUrl))
useEffect(() => logVisit(), [])
```

Effect Event 适合“在 Effect 管理的外部事件发生时读取最新值”，不能用来隐藏本来应该引起重同步的值。它只能从 Effect 或另一个 Effect Event 调用，也不应传给子组件或普通 Event Handler。

连接服务本身不需要知道 React：

<<< ../../../examples/frontend/react-effects-and-refs/chat-service.ts

Hook 拥有“何时连接和清理”，服务拥有“怎样实现连接协议”，页面拥有“显示哪个房间和通知”。这种边界让三部分可以分别测试。真实 WebSocket 还要处理心跳、鉴权刷新、重试退避和网络切换；这些策略应集中在服务或 Provider，而不是散落在每个页面的 Effect 中。

## 异步请求真正争夺的是 UI 写权限

假设用户先搜索 `React`，马上又改成 `Vue`：

```text
请求 A：React ─────────────────── 返回（慢）
请求 B：Vue   ──────── 返回（快）
```

Promise 并没有同时修改一块内存，问题也不是传统多线程数据竞争。真正的问题是：当 A 返回时，界面已经代表新的关键词，但旧任务 A 仍然拥有 `setState` 权限。

同类情况还包括：

- 路由参数快速变化；
- 组件已经卸载；
- 用户点击重试；
- Strict Mode 启停检查；
- 服务端不支持或没有及时响应取消。

### Abort 与 ignore 各管一层

完整搜索 Hook：

<<< ../../../examples/frontend/react-effects-and-refs/useLessonSearch.tsx

每一轮 Setup 都创建自己的控制器与 `ignore` 闭包：

```tsx
const controller = new AbortController()
let ignore = false

return () => {
  ignore = true
  controller.abort()
}
```

它们的职责不同：

- `abort()` 尽量让 Fetch、响应解析和后续工作尽早停止，减少资源浪费；
- `ignore` 立即收回旧任务更新当前 UI 的权限，即使底层 Client 不支持取消，旧 Promise 也不能写入。

因此只判断 `AbortError` 并不充分。自定义请求库可能用不同错误表示取消，请求也可能已进入后续 Promise 链。示例先判断 `ignore` 或 `signal.aborted`，只有仍有效的真实失败才进入错误状态。

旧 Cleanup 只会把旧闭包中的 `ignore` 改为 `true`，不会影响新请求。这个局部所有权正是它可靠的原因。

### 异步状态不要用几个互相独立的布尔值拼装

搜索有四种互斥状态：

<<< ../../../examples/frontend/react-effects-and-refs/types.ts

判别联合避免了这些不合理组合：

- `loading === true`，同时已经有 `error`；
- 没有数据，却分不清“尚未搜索”还是“搜索成功但结果为空”；
- 请求失败后还误用上一轮结果。

`success` 携带空数组表示“请求成功，没有匹配项”；`idle` 表示“没有查询条件，尚未请求”。页面可以按状态穷举渲染：

<<< ../../../examples/frontend/react-effects-and-refs/LessonSearchPage.tsx

### 网络边界必须校验运行时数据

TypeScript 只检查编译期代码，无法保证服务器真的返回声明的 JSON。Gateway 应把外部 `unknown` 转换为应用可信类型：

<<< ../../../examples/frontend/react-effects-and-refs/lesson-gateway.ts

这里使用小型类型守卫便于看清边界；字段更多、契约更复杂时，可以改用 Schema Validator。不要直接写 `response.json() as LessonSummary[]`，因为类型断言不会生成任何运行时检查。

Gateway 对象也需要稳定身份。本例在模块顶层装配一次：

<<< ../../../examples/frontend/react-effects-and-refs/App.tsx

如果父组件每次 Render 都调用 `createLessonGateway()`，`gateway` 依赖每次都会变化，请求也会重跑。若 Gateway 依赖 Token 或 Locale，则要显式设计更新策略；不能为了引用稳定而永久捕获过期认证信息。

### 为什么手写 Fetch Effect 不是完整数据架构

这个例子非常适合学习竞态，却不代表生产应用应该默认手写数据获取 Effect。它缺少：

- SSR 首屏数据；
- 路由级预加载；
- 缓存、去重与失效；
- 父子请求瀑布治理；
- 统一的重试、错误恢复和导航取消。

真实项目优先评估框架或 Router 的 Data API，以及支持缓存和 SSR 的数据层。即使数据请求被框架接管，本课的同步模型仍适用于 WebSocket、Observer、DOM Widget 和其他外部资源。

## Ref 保存不参与 UI 的可变信息

State 的变化会请求一次新 Render；Ref 不会。

```tsx
const valueRef = useRef(initialValue)
```

同一组件身份中，React 会返回同一个 Ref 对象。修改 `valueRef.current`：

- 不触发 Render；
- 不产生新的 State 快照；
- 适合保存命令式句柄或不参与 JSX 的元数据。

常见用途包括 DOM 节点、Timer ID、Observer、第三方实例和请求序号。如果某个值变化后页面应该显示新内容，它就应该是 State，而不是 Ref。

### DOM Ref 在 Commit 后才有值

聚焦输入框的完整例子：

<<< ../../../examples/frontend/react-effects-and-refs/FocusField.tsx

初次 Render 时 DOM 还没有创建，`inputRef.current` 是 `null`。Commit 后 React 才把真实节点写入 Ref；节点移除后又恢复为 `null`。因此类型是 `HTMLInputElement | null`，使用前必须处理空值。

这里聚焦由点击直接造成，所以放在 Event Handler 中，不需要 Effect。不要先设置 `shouldFocus`，再让另一个 Effect 间接完成点击动作。

DOM Ref 适合 React 声明式 Props 难以表达的能力，例如：

- Focus、Scroll 和 Selection；
- 测量布局；
- Canvas 与媒体 API；
- 只提供命令式接口的第三方组件。

普通属性仍应通过 JSX 管理。不要一边让 React 设置属性，一边用 Ref 手工修改同一属性，否则两个所有者会互相覆盖。

### Render 期间不要随意读写 Ref

```tsx
// 错误：Render 次数会改变输出，组件不再是纯计算。
renderCount.current += 1
return <p>{renderCount.current}</p>
```

React 可能因为 Strict Mode、并发调度或错误恢复而重试 Render。Render 中修改 Ref 会让相同输入得到不同结果。一般只在 Handler 或 Effect 中读写 Ref。

一种有限的例外是结果稳定且没有外部副作用的惰性初始化：

```tsx
const cacheRef = useRef<LocalCache | null>(null)

if (cacheRef.current === null) {
  cacheRef.current = new LocalCache()
}
```

如果构造过程涉及 DOM、订阅、网络或全局注册，它就不再是纯初始化，应在 Effect 中创建并清理。

## `useEffect` 与 `useLayoutEffect` 的分界是 Paint

大多数外部同步使用 `useEffect`。对于并非由交互直接触发的 Effect，React 通常会先让浏览器 Paint，再运行 Effect；由交互触发的 Effect 在某些情况下也可能提前运行。业务代码不应依赖它与 Paint 的绝对先后，网络、日志和订阅也不需要占用 Paint 前的同步阶段。

`useLayoutEffect` 在 DOM 已提交但浏览器 Paint 前运行。它适合“如果等到 Paint 后才执行，用户会看到错误首帧”的视觉同步，例如先测量 Tooltip 高度，再决定最终位置。

```text
Render → Commit DOM → useLayoutEffect → Paint → useEffect
```

Layout Effect 以及其中触发的更新会阻塞绘制，所以不要把它当成“更快的 Effect”。只有当普通 Effect 会产生可见闪烁，并且确实需要在下一次 Paint 前测量或修正布局时，才使用它。两类 Effect 都不在服务端执行，SSR 项目还需要明确 Client-only 边界。

## 自定义 Hook 应表达一种能力

当同步过程已经讲清楚，才适合提取自定义 Hook。好的名字描述调用者获得的能力：

- `useLessonSearch(keyword, gateway)`：搜索课程；
- `useChatRoom(options)`：维持聊天室连接；
- `useWindowEvent(name, listener)`：订阅窗口事件。

不建议用 `useMount`、`useUpdateEffect` 之类名称重新包装生命周期。它们隐藏依赖和 Cleanup，却没有告诉调用者到底管理什么资源。

类型安全的 Window 订阅 Hook：

<<< ../../../examples/frontend/react-effects-and-refs/useWindowEvent.tsx

它有三个值得注意的边界：

1. `EventName extends keyof WindowEventMap` 让事件名决定回调类型；`pointermove` 自动得到 `PointerEvent`；
2. `eventName` 和 `capture` 定义订阅身份，所以变化时重新注册；
3. `listener` 只负责处理下一次事件，Effect Event 让它读取最新 State 而不重复注册。

Cleanup 使用 Setup 中同一个 `handleEvent` 和同一个 `capture`。下面这种写法无法移除 Listener，因为两个箭头函数不是同一引用：

```tsx
window.addEventListener('resize', () => resize())
return () => window.removeEventListener('resize', () => resize())
```

使用页面：

<<< ../../../examples/frontend/react-effects-and-refs/PointerTracker.tsx

切换 `enabled` 不会重新订阅 Window，但下一次 Pointer Event 能读取最新开关。若事件频率造成性能问题，还需按测量结果使用 `requestAnimationFrame` 节流、Pointer Capture 或外部 Store；Effect Event 只解决闭包与订阅身份，不自动解决高频更新成本。

### 一个可靠 Hook 通常明确这些契约

- 输入中哪些值会重建外部资源；
- 哪些回调只读取最新值；
- 谁拥有 Cleanup 和取消；
- 错误、重试、并发如何表现；
- 返回的是领域状态和命令，而不是内部 Setter 或 AbortController；
- 每次调用默认拥有独立状态，不假装自己是共享 Store。

两个组件分别调用 `useLessonSearch`，会得到两份 State 和两次请求。共享缓存需要提升所有权或使用真正的数据层，不能靠“自定义 Hook”这个名字自动实现。

## 几个容易混淆的边界

### Effect 回调本身不能是 async

```tsx
// 错误：async 函数返回 Promise，但 React 只接受 undefined 或 Cleanup 函数。
useEffect(async () => {
  await loadData()
}, [])
```

应在 Effect 内声明异步函数或使用 Promise 链，并显式处理失效结果和错误。Error Boundary 不会自动捕获任意异步回调中的错误；需要把错误转换为可渲染状态，或交给框架规定的错误通道。

### 外部 Store 使用专用快照协议

如果一个 Store 会在组件外变化，并能提供当前快照，优先使用 `useSyncExternalStore`：

```tsx
const online = useSyncExternalStore(
  subscribe,
  getSnapshot,
  getServerSnapshot
)
```

手写 `useEffect(() => subscribe(setState), [])` 可能漏掉 Render 与订阅建立之间的更新，也缺少并发渲染和 SSR 的一致快照契约。Window Event 是一次通知；外部 Store 是可随时读取的状态源，二者不要混为一谈。

### Timer 也要区分重建条件与最新回调

Interval 的 `delay` 改变时需要重建 Timer，但回调往往只需读取最新 State：

```tsx
function useInterval(callback: () => void, delay: number | null): void {
  const onTick = useEffectEvent(callback)

  useEffect(() => {
    if (delay === null) return

    const timer = window.setInterval(onTick, delay)
    return () => window.clearInterval(timer)
  }, [delay])
}
```

在旧 React 版本中，项目常用“latest callback Ref”实现类似效果。不要把 React 19.2 API 直接复制到旧运行时，应根据项目实际版本采用受支持的方案。

## 如何验证一段 Effect 是否可靠

不要只断言“Setup 恰好执行一次”。Strict Mode、重新挂载和依赖变化都会让次数不同。应验证对用户有意义的资源行为。

聊天室需要覆盖：

- 初次显示时按指定 `roomId` 建立连接；
- `roomId` 变化时先断开旧连接，再建立新连接；
- `muted` 变化不会重连；
- Unmount 后退订 Listener 并断开连接。

异步竞态可以使用可控 Promise：

1. 发起 React 请求 A；
2. 改关键词并发起 Vue 请求 B；
3. 先完成 B，确认页面显示 Vue；
4. 再完成 A，确认页面仍显示 Vue；
5. 确认 A 的 Signal 已被 Abort。

DOM Ref 测试应从用户点击出发，最后断言 `document.activeElement`，不要读取组件内部 Ref。Timer 测试使用 Fake Timer，并在测试框架要求的 `act()` 边界推进时间。网络边界除正常响应外，还应覆盖空数组、4xx、5xx、取消、慢响应和无效 JSON。

### Effect 意外重跑时怎样定位

1. 列出依赖数组中的每一个值；
2. 保存前后两次数组；
3. 用 `Object.is(previous[i], next[i])` 找出变化项；
4. 追踪它为什么每次创建；
5. 重构所有权，而不是关闭 Lint。

常见原因包括父组件内联对象、Context Provider 每次创建新 Value、Effect 更新自己的依赖形成循环，以及不稳定 Key 导致整个组件重新挂载。Strict Mode 的开发检查也要与真实依赖变化区分开。

## 把本课压缩成一条判断链

以后写 Effect 前，可以按这个顺序思考：

```text
这段代码为什么发生？
├─ 为了算出 UI → Render
├─ 因为一次用户动作 → Event Handler
└─ 为了同步外部系统 → Effect
       ↓
   外部资源是什么？谁拥有它？
       ↓
   哪些值改变时必须停止旧同步并开始新同步？
       ↓
   Setup 的精确逆操作是什么？
       ↓
   外部回调是否只需读取最新值？
       ↓
   旧异步任务何时失去写权限？
```

只要第一问没有外部系统，通常就不需要 Effect。只要 Setup 无法回答如何停止，设计通常还没完成。

## 本节小结

Effect 不是“组件渲染后随便运行代码”的容器，而是让一个外部系统持续符合当前已提交 UI 的同步过程。依赖数组描述同步条件，Cleanup 撤销旧同步，Strict Mode 检查这段过程能否安全重复。

Ref 保存不参与 UI 的命令式信息；Effect Event 把“需要重同步的值”与“外部事件发生时只读取最新值”分开；Abort 尽量停止工作，ignore 则收回过期任务的 UI 写权限。自定义 Hook 最终应该封装一项边界清楚的能力，而不是掩盖生命周期细节。

下一课将进入 [Reducer、Context 与跨组件状态架构](./reducer-context-and-cross-component-state-architecture.md)：当状态转移变复杂、多个组件需要协作时，如何判断应该保留本地 State、提升状态、使用 Reducer、提供 Context，还是交给外部数据层。

## 延伸阅读

- [React：Synchronizing with Effects](https://react.dev/learn/synchronizing-with-effects)
- [React：You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- [React：Lifecycle of Reactive Effects](https://react.dev/learn/lifecycle-of-reactive-effects)
- [React：Separating Events from Effects](https://react.dev/learn/separating-events-from-effects)
- [React：Removing Effect Dependencies](https://react.dev/learn/removing-effect-dependencies)
- [React：Referencing Values with Refs](https://react.dev/learn/referencing-values-with-refs)
- [React：Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)
- [React：useEffectEvent](https://react.dev/reference/react/useEffectEvent)
- [React：useLayoutEffect](https://react.dev/reference/react/useLayoutEffect)
- [React：useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)
