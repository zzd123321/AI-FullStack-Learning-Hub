---
title: React 渲染性能、并发与 Suspense
description: 从真实成本和测量证据出发，理解 Memo、Transition、Deferred Value、虚拟列表、Suspense 与流式 Hydration
outline: deep
---

# React 渲染性能、并发与 Suspense

> 资料基线：React 19.2，只使用稳定 API。React Compiler 已有正式文档，但是否启用取决于构建配置；安装 React 19 不会自动让任意项目获得编译器优化。

性能课程很容易变成“记住 `memo`、`useMemo` 和 `useCallback`”。但页面慢可能发生在网络、JavaScript、React Render、DOM Commit、Layout 或 Paint 中。没有先定位成本，缓存很可能只增加复杂度，Transition 也可能只是把同样昂贵的工作推迟。

本课遵循一个顺序：

```text
用户真的感到慢吗？
      ↓
时间花在哪一层？
      ↓
能否直接删除工作和 DOM？
      ↓
是否有重复计算值得复用？
      ↓
工作无法删除时，是否需要调整优先级与展示顺序？
```

## 先建立一张成本地图

从一次访问到下一帧显示，可能经过：

```text
Network / Server
  ↓ HTML、JS、CSS、数据到达
JavaScript
  ↓ Event Handler、解析、领域计算
React Render
  ↓ 调用组件、计算下一棵 UI
React Commit
  ↓ DOM Mutation、Ref、Layout Effect
Browser Rendering
  ↓ Style、Layout、Paint、Composite
Next Paint
```

“某组件 Render 了十次”只是线索，不是结论。十次很小的纯组件可能不足 1ms；一次 Markdown 解析、10,000 行排序、强制同步布局或 5,000 个 DOM 节点就可能让交互明显卡顿。

优化手段可以分成三类：

- 删除工作：减少请求、计算、DOM、Effect 链和不必要的组件范围；
- 复用工作：缓存数据、纯计算、组件结果或已经加载的模块；
- 调度工作：让紧急输入先显示，把非紧急 Render 放到可中断的后台。

Transition 和 Deferred Value 属于第三类。它们能改善响应性，却不会自动把 200ms 算法变成 20ms。

## React 在 Render 和 Commit 之间做了什么

State、Reducer、Context、外部 Store 或 Router 变化后，React 安排一次更新。

### Render 是可重试的纯计算

Render 阶段调用组件和 Hooks，生成下一棵 UI 描述。并发模式下，这段工作可以：

- 被更紧急的输入打断；
- 从最新 State 重新开始；
- 完成后仍被丢弃，不进入 DOM；
- 在开发 Strict Mode 中额外执行以检查纯度。

所以组件函数、`useMemo` 计算和 State Updater 中不能发送订单、修改模块全局对象或注册订阅。相同输入必须得到相同结果，副作用属于 Event、Action 或 Effect。

### Commit 是不可中断的宿主更新

React 选定一份已完成结果后，同步提交 DOM 变化、更新 Ref，并执行 Layout Effect。Commit 不能被另一按键从中打断。大量 DOM Mutation 或沉重 `useLayoutEffect` 会直接推迟 Paint。

普通 Effect 的精确时机可能受更新来源影响，业务代码不应把“必定在某次 Paint 后”当协议。只有必须在下一次 Paint 前测量和修正视觉布局时，才使用会阻塞绘制的 Layout Effect。

```text
Event
  → Schedule
  → Render（可中断、重试、丢弃）
  → Commit（同步）
  → Layout Effect
  → Browser Paint
  → Effect（不要依赖绝对时序）
```

并发渲染不是多线程同时修改 DOM。React 仍只提交一份一致结果，它只是能暂停或放弃尚未提交的 Render 工作。

## 测量要从用户问题逐层下钻

三类工具回答不同问题：

| 证据 | 回答的问题 |
| --- | --- |
| RUM / Field Data | 哪些真实用户、设备、页面和交互慢 |
| Browser Performance Trace | 主线程时间在 JS、Layout、Paint 还是网络 |
| React DevTools Profiler | 哪棵 React 子树在某次 Commit 中重新 Render，成本多大 |

Core Web Vitals、Long Task 和用户任务完成时间能帮助确定真实影响。平均值经常掩盖低端设备和尾部延迟，应按页面、设备、版本和交互切分分布。

### React Profiler 读什么

性能指标类型与有上限缓冲区：

<<< ../../../examples/frontend/react-performance-concurrency/types.ts

<<< ../../../examples/frontend/react-performance-concurrency/profiler-metrics.ts

`<Profiler onRender>` 常用字段：

| 字段 | 含义 |
| --- | --- |
| `phase` | `mount`、`update` 或嵌套更新 |
| `actualDuration` | 本次确实执行的子树 Render 时间 |
| `baseDuration` | 最近各组件成本汇总出的未优化最坏估计 |
| `startTime` | React 开始当前 Render 的时间 |
| `commitTime` | 本次 Commit 时间，同一 Commit 的 Profiler 可据此分组 |

若 `actualDuration` 长期显著低于 `baseDuration`，说明 Memo Bailout 跳过了部分工作。但 Profiler 回调本身也有成本，不应每次同步上传；示例只放入有限缓冲区并返回副本，避免外部修改内部数组。

开发模式包含 Strict Mode、警告和 Source Map，不能直接当生产结论。普通生产构建通常不包含 Profiler 计时能力，需要专用 Profiling Build。优化前后还应保持设备、数据和操作路径一致。

## 先删除工作，再谈缓存

组件重新执行可能因为自身 State、父组件 Render、Context 更新、外部 Store Snapshot 变化、Suspense 重试或开发检查。重新 Render 不等于 DOM 必然修改，但 Render 计算已经发生。

在加 Memo 前先检查：

1. 临时 State 是否被提升到整个页面根部；
2. 派生值是否被重复存进 State，再用 Effect 同步；
3. 是否存在 `Effect → setState → Render → Effect` 链；
4. Context 是否塞入每次新建的大对象；
5. Wrapper 是否可接收 `children`，让自身 State 不必重建子内容；
6. 不可见的大量 DOM 是否应分页或窗口化；
7. 昂贵工作是否可以预计算、移到服务器或 Web Worker。

React 只能在自己的 Fiber 工作单元之间让出。如果单个组件函数执行一个连续 200ms 的普通 JavaScript 循环，Transition 无法在循环内部暂停它。必须拆分算法、减少数据、分块处理或移出主线程。

静态数据也是例子。延迟分析模块中的目录从不变化，所以统计结果直接在模块首次加载时计算一次：

<<< ../../../examples/frontend/react-performance-concurrency/HeavyAnalytics.tsx

这比每个组件实例各自维护 `useMemo(..., [])` 更直接，也让所有权更清楚。

## Memo 只在“跳过比重算便宜”时有价值

### `memo` 跳过 Props 未变的组件

`memo(Component)` 默认逐项使用 `Object.is` 比较 Props。它是性能提示，不是正确性边界：组件自己的 State 和读取的 Context 变化仍会让它 Render，React 也可能在其他框架流程中重新执行。

Memo 较可能有效，需要同时满足：

- 组件确实昂贵或更新频繁；
- 大多数父更新中 Props 引用不变；
- 比较成本低于重算成本；
- Render 完全纯净。

```tsx
// 每次 Parent Render 都创建两个新引用，会破坏子组件 Memo。
<Chart options={{ theme: 'dark' }} onSelect={() => select(id)} />
```

优先传更小的 Primitive Props、把常量移到模块外、让 State 靠近使用处。测量仍证明昂贵时，再稳定对象或 Callback。

自定义比较器风险更高。返回 `true` 表示新旧 Props 的所有可观察行为都等价，函数 Props 也必须比较，否则回调可能继续捕获旧 State。无边界深比较还可能比 Render 更慢。

### `useMemo` 缓存纯计算结果

```tsx
const visible = useMemo(
  () => filter(items, query),
  [items, query],
)
```

它适合已经测量为昂贵、且依赖经常保持不变的纯计算。React 可能因为热更新、首次挂载 Suspend 等原因丢弃缓存，所以缓存不能承担资源生命周期或业务正确性。

### `useCallback` 缓存函数身份

它主要用于：

- 传给确实依赖稳定 Props 的 Memo 子组件；
- 作为另一个 Hook 无法移除的依赖；
- 自定义 Hook 对外提供身份稳定的 Action。

给每个 Handler 套 `useCallback` 会增加依赖和比较成本，并不自动减少子组件 Render。先确认函数身份变化正是被测量到的原因。

### React Compiler 改变手写 Memo 的数量，不改变原则

React Compiler 可以在构建期自动 Memo 化组件和值，但需要安装、配置并验证输出。即使启用，组件和 Hook 仍必须纯，State 所有权、DOM 数量和算法复杂度也不会被自动修复。应通过 Compiler 诊断、DevTools 标记和 Profiler 确认收益，而不是同时保留所有手写缓存作为“保险”。

## 紧急输入与昂贵结果不必同一优先级

用户打字时，输入框必须立即显示最新字符；庞大结果列表可以稍后追上。这里不是要少算一次，而是先提交紧急反馈。

目录数据和纯搜索函数：

<<< ../../../examples/frontend/react-performance-concurrency/catalog.ts

<<< ../../../examples/frontend/react-performance-concurrency/search-lessons.ts

### `useDeferredValue` 延迟消费方

调用方只有一个最新 `query`，没有“结果 State Setter”可以包进 Transition。这时把消费方使用的值延迟：

```tsx
const deferredQuery = useDeferredValue(query)
```

完整搜索实验：

<<< ../../../examples/frontend/react-performance-concurrency/PerformanceLab.tsx

一次输入大致发生：

```text
紧急 Render：input 使用新 query，列表仍使用旧 deferredQuery
      ↓ Commit，按键立即可见
后台 Render：尝试用新 deferredQuery 计算结果
      ├─ 又有新输入 → 放弃并从最新值重试
      └─ 完成 → Commit 新列表
```

Deferred Value 没有固定 Debounce 时间，紧急 Render 后会尽快开始背景工作。它也不会减少网络请求；若查询驱动 Fetch，仍需要缓存、取消或真正的请求防抖。

`query !== deferredQuery` 表示列表暂时陈旧，应给出文字或视觉反馈，不能让用户误以为旧结果已匹配新输入。传入的值最好是 Primitive 或 Render 外创建的稳定对象；每次新建 `{ query }` 会制造无意义背景更新。

如果当前更新本身已经在 Transition 中，Deferred Value 会直接使用新值，不再额外产生一轮延迟。

### `useTransition` 延迟你拥有的更新

当组件拥有目标 State Setter 时，可以标记这次更新为非紧急：

```tsx
const [isPending, startTransition] = useTransition()

startTransition(() => {
  setTab(nextTab)
})
```

传入函数会立即执行，但其中同步安排的 State Update 是可中断的 Transition。它适合 Tab、大面板、复杂图表和支持 Suspense 的导航，不适合受控输入、焦点反馈或必须立即读取新 DOM 的操作。

React 19.2 会让 `startTransition(async () => ...)` 的 Pending 覆盖异步 Action，但当前在 `await` 之后直接调用 Setter，仍需再包一层 `startTransition` 才能把该 Setter 标成 Transition。自建异步命令也仍要处理响应乱序。多个同时发生的 Transition 可能共享 Pending，不能把一个 Boolean 当成每个领域请求的精确状态机。

## 虚拟列表从根本上减少 DOM

Memo 只能跳过部分 React 计算，无法消除 10,000 个真实 DOM 节点带来的 Style、Layout、Paint、内存和辅助技术成本。大列表通常先考虑分页或窗口化。

固定行高的最小实现：

<<< ../../../examples/frontend/react-performance-concurrency/VirtualLessonList.tsx

```text
requestedStart = floor(scrollTop / rowHeight) - overscan
start = clamp(requestedStart, 0, maxStart)
end = start + viewportRows + 2 × overscan
offset = start × rowHeight
```

外层容器保留总滚动高度，内层只渲染视口附近的行。Overscan 避免快速滚动时暴露空白；当筛选让列表突然变短时，还必须把旧滚动位置限制到新数据的有效窗口，否则会出现“明明有结果却一片空白”。

生产虚拟化还要处理动态行高、ResizeObserver、键盘焦点、读屏集合信息、滚动锚定、反向列表和 SSR 初始窗口。优先使用经过验证的库；本例的价值是看清算法和边界。

## Suspense 协调“尚未准备好”的子树

`<Suspense fallback={...}>` 只会响应支持 Suspense 的等待源。稳定来源包括：

- `lazy()` 加载组件代码；
- `use()` 读取缓存 Promise；
- Relay、Next.js 等支持 Suspense 的框架或数据源。

Effect 中 Fetch 发生在 Commit 后，Suspense 不会自动发现它。React 官方仍不建议业务项目自行实现依赖“Render 时 Throw Promise”的无框架数据源协议；优先使用框架提供的缓存和失效机制。

### Boundary 是产品的 Reveal 边界

```text
Page Shell（立即显示）
├── Header（立即显示）
└── Suspense：主要内容 Skeleton
    ├── Summary
    └── Suspense：推荐内容 Skeleton
        └── Recommendations
```

同一 Boundary 内的内容一起 Reveal，嵌套 Boundary 可以逐步展示。Fallback 应保持近似布局，避免 CLS，也不能依赖同一未完成资源。

首次挂载前 Suspend 的树没有已提交 State，准备好后从头重试。已经显示的树再次 Suspend 时，如果更新不是 Transition 或 Deferred Value，边界可能重新显示 Fallback；React 隐藏它时会清理 Layout Effect，恢复后再运行。

Suspense 只表示等待，不处理 Reject 或 Lazy Chunk 失败。错误需要 Error Boundary：

<<< ../../../examples/frontend/react-performance-concurrency/ErrorBoundary.tsx

典型组合是：

```tsx
<ErrorBoundary>
  <Suspense fallback={<PanelSkeleton />}>
    <LazyPanel />
  </Suspense>
</ErrorBoundary>
```

## Lazy、预加载与 Transition 怎样协作

延迟模块与工作区：

<<< ../../../examples/frontend/react-performance-concurrency/ConcurrentWorkspace.tsx

`lazy(load)` 必须在模块顶层声明。在组件内调用会让每次 Render 得到新组件类型，导致子树 State 重置。动态 Import 通常需要模块 Default Export，React 会缓存加载 Promise 与解析结果。

示例在 Pointer Enter 或键盘 Focus 时调用同一个 Import，让用户表达意图后提前下载。预加载不能越多越好：过早加载所有 Chunk 等于没有代码分割，还会竞争关键网络资源；Chunk 过碎也增加请求和调度开销。

分析模块第一次尚未加载时，Tab State 更新放入 Transition。React 可以继续显示已揭示的概览内容，并用 Pending 文案反馈切换，等顶层分析模块准备好后再提交。嵌套的新 Suspense Boundary 仍可显示自己的局部 Skeleton。

部署还要考虑内容哈希、长期缓存、旧 HTML 请求已删除 Chunk 的恢复策略。Chunk 加载失败不能永久停在 Skeleton，应进入 Error Boundary 并提供安全恢复路径。

## 完整客户端应用

组合入口：

<<< ../../../examples/frontend/react-performance-concurrency/App.tsx

<<< ../../../examples/frontend/react-performance-concurrency/main.tsx

这里每个工具解决不同层的问题：

| 工具 | 解决的问题 |
| --- | --- |
| `useMemo` | Deferred Query 未变时复用搜索计算 |
| `useDeferredValue` | 输入优先，昂贵消费方稍后追上 |
| Virtualization | 限制真实 DOM、Layout 与 Paint 工作量 |
| `memo` | 窗口移动时尝试跳过 Props 未变的行 |
| Profiler | 验证 React 子树实际成本 |
| Transition | 非紧急视图切换可中断 |
| Lazy/Suspense | 按需加载并组织等待界面 |

它们不能互相替代。对同一问题同时堆上所有 Hook，通常说明尚未定位成本。

## Streaming SSR 让 Shell 不必等待整页

传统 `renderToString` 必须一次生成字符串，无法利用 Suspense 分段 Reveal。Streaming SSR 可以先发送 Shell 和 Fallback，随后把已准备好的 Boundary 内容继续写入流。

Node 流式示例：

<<< ../../../examples/frontend/react-performance-concurrency/streaming-server.tsx

关键回调：

- `onShellReady`：Shell 可以开始发送给浏览器；
- `onAllReady`：全部内容完成，适合某些爬虫或非流式客户端；
- `onShellError`：Shell 本身失败，需要返回替代错误文档；
- `onError`：记录流式子树错误并影响状态策略；
- `abort()`：超时或连接关闭时停止服务端工作，让未完成边界交给客户端恢复。

React 19.2 会短暂批处理服务端 Suspense Boundary 的 Reveal，使服务端与客户端展示行为更一致。这不是业务可依赖的固定毫秒延迟，Boundary 仍应按产品展示顺序设计。

生产 SSR 还要处理 Backpressure、CSP Nonce、Asset Manifest、代理缓冲、压缩、Bot、请求级日志和安全序列化。框架通常已经协调这些细节，不应只为“用上 Streaming”搭一个不完整服务器。

### Selective Hydration 让交互区域先可用

流式 HTML 到达后可以先显示，但事件处理需要对应 JavaScript Hydrate。React 能结合 Suspense Boundary、代码资源和用户交互优先 Hydrate 某些区域，而不必等待整页 Chunk。

客户端入口：

<<< ../../../examples/frontend/react-performance-concurrency/hydrate-client.tsx

`hydrateRoot` 要求客户端首次 Render 与服务端 HTML 匹配。常见破坏来源：

- Render 中调用 `Date.now()`、`Math.random()` 或 UUID；
- 服务端与客户端 Locale、Timezone 不同；
- Render 直接读取 `window`、LocalStorage 或屏幕宽度；
- Bootstrap Data 不是服务端渲染使用的同一 Snapshot；
- 无效 HTML 被浏览器自动修正；
- CDN 或扩展改写 HTML。

`suppressHydrationWarning` 只是已知、不可避免的浅层文本差异逃生口，不会递归修复结构。`onRecoverableError` 应接入监控并附带 Route、Release 和 Component Stack；“可恢复”也可能意味着 React 放弃服务端 DOM 并重建，不能统一忽略。

### 不要把几个服务端概念混为一谈

- SSR：服务器把 React Tree 生成 HTML，客户端通常 Hydrate 同一 UI；
- Streaming SSR：HTML 分段发送，与 Suspense Reveal 协作；
- Server Component：组件逻辑只在服务端执行，以特殊 Payload 组合客户端树；
- Code Splitting：按需加载客户端 JavaScript Module；
- Suspense：定义等待子树的展示边界，本身不定义数据缓存协议。

实际项目优先使用 Router/Framework 整合方案，因为缓存、路由、错误、Status、Head、Asset 与 Hydration 必须共同设计。

## React Profiler 看不到全部浏览器成本

Commit 很快但页面仍卡，常见原因可能在 React 之后：

- 深层 DOM 和昂贵 CSS Selector；
- 读 Layout、写 Style、再读 Layout 造成强制同步布局；
- 大面积阴影、滤镜和透明层；
- 图片缺少尺寸引起 Layout Shift；
- 动画频繁修改几何属性；
- 过多合成层占用 GPU 内存。

使用浏览器 Performance、Rendering、Layers 和 Paint 工具，把 React Commit 与 Style/Layout/Paint 对齐。`content-visibility: auto` 可以跳过部分离屏渲染，但 DOM、Fiber 和内存仍存在，不等价于虚拟列表。

## 怎样验证优化没有只改变代码外观

正确性先覆盖：

- 快速输入时 Input 永远显示最新 Query；
- Deferred 结果最终追上最新值，陈旧期间有明确提示；
- 列表筛选后即使旧滚动位置很深，也不会出现错误空白；
- 连续切换视图后最终选择正确，Pending 不阻塞紧急操作；
- Lazy Chunk Reject 进入 Error Boundary；
- 服务端 HTML 与 Hydration 首帧一致。

性能回归再固定用户路径、设备/限速和数据规模，记录：

- 真实用户交互延迟分布；
- 指定 Profiler 子树的 `actualDuration`；
- 同一场景最大 DOM 节点数；
- 初始与异步 Chunk 体积；
- Lazy Boundary 可见时间与失败率；
- Hydration Recoverable Error 数量。

单次微基准很容易受 JIT、后台进程和 DevTools 影响。应多次运行、保留优化前基线，并确认浏览器 Layout/Paint 和真实用户指标也改善。Render 次数更少并不自动等于体验更好。

## 本节小结

React 性能优化首先是定位问题，而不是背缓存 Hook。Render 是可中断、可重试的纯计算，Commit 和浏览器绘制仍可能同步阻塞。最有效的优化往往是缩小 State、删除 Effect 链、减少算法工作和限制 DOM 数量。

Memo 复用已经证明昂贵的重复计算；Transition 与 Deferred Value 调整紧急和非紧急更新的顺序，却不减少总工作；Suspense 定义受支持等待源的 Reveal Boundary；Streaming SSR 与 Selective Hydration利用这些边界改善内容和交互到达顺序。所有收益都必须由 Profiler、浏览器 Trace 和真实用户数据共同证明。

下一课进入 [React 测试策略与可测试架构](./testing-strategy-and-testable-architecture.md)，把纯逻辑、组件交互、Router/Action、异步稳定性、可访问性和端到端关键路径组织成分层验证体系。

## 延伸阅读

- [React：`<Profiler>`](https://react.dev/reference/react/Profiler)
- [React：`memo`](https://react.dev/reference/react/memo)
- [React：`useMemo`](https://react.dev/reference/react/useMemo)
- [React：`useCallback`](https://react.dev/reference/react/useCallback)
- [React：`useTransition`](https://react.dev/reference/react/useTransition)
- [React：`useDeferredValue`](https://react.dev/reference/react/useDeferredValue)
- [React：`<Suspense>`](https://react.dev/reference/react/Suspense)
- [React：`lazy`](https://react.dev/reference/react/lazy)
- [React：React Compiler](https://react.dev/learn/react-compiler/introduction)
- [React：`renderToPipeableStream`](https://react.dev/reference/react-dom/server/renderToPipeableStream)
- [React：`hydrateRoot`](https://react.dev/reference/react-dom/client/hydrateRoot)
- [web.dev：Interaction to Next Paint](https://web.dev/articles/inp)
