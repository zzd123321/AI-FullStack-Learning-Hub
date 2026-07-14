---
title: 渲染性能、并发特性与 Suspense
description: 从测量、Render 与 Commit 成本出发，掌握 Memo、Transition、Deferred Value、Suspense、代码分割、虚拟列表、Streaming SSR 与 Hydration
---

# 渲染性能、并发特性与 Suspense

> 资料基线：React 19.2。本文只使用稳定版 API；`<ViewTransition>`、Transition Type 等 Canary/Experimental 能力不作为生产基线。React Compiler 已有正式文档，但是否启用取决于项目构建配置，不能假设所有 React 19 项目都会自动编译优化。

## 1. 学习目标

完成本节后，你应该能够：

- 区分调度、Render、Commit、Layout Effect、Paint 与 Passive Effect。
- 用 React DevTools、`<Profiler>` 和浏览器性能工具定位瓶颈。
- 区分“减少工作量”和“降低更新优先级”。
- 判断 `memo`、`useMemo`、`useCallback` 是否真正有效。
- 避免对象、函数、Context 和错误比较器破坏 Memo 化。
- 用 `useTransition` 分离紧急输入与非紧急界面更新。
- 用 `useDeferredValue` 让消费方显示可中断的滞后值。
- 理解并发渲染的可中断、可丢弃与纯渲染要求。
- 正确放置 Suspense、Error Boundary 与嵌套 Skeleton。
- 用 `lazy` 和动态 Import 建立代码分割与预加载策略。
- 用虚拟列表减少大量 DOM、布局和绘制成本。
- 理解 Streaming SSR、Selective Hydration 和 Hydration 一致性。
- 建立从真实用户指标到 Profiler Commit 的性能治理闭环。

## 2. 性能优化先建立成本模型

React 页面慢可能来自不同层：

```text
Network / Server
  ↓ HTML、JS、CSS、Data 到达
JavaScript
  ↓ 事件处理、数据转换、React Render
React Commit
  ↓ DOM Mutation、Ref、Layout Effect
Browser Rendering
  ↓ Style、Layout、Paint、Composite
Next Paint
```

“组件 Render 次数多”只是线索，不等于问题。一个返回两行 JSX 的重复 Render 可能不到 0.1ms；一次大数组排序、Markdown 解析、同步 JSON 处理、Layout Thrashing 或 5,000 个 DOM 节点才可能真正阻塞交互。

优化动作分为三类：

1. **删除工作**：减少请求、计算、组件、DOM、样式和 Effect 链。
2. **复用工作**：缓存数据、计算、组件输出或已加载模块。
3. **调度工作**：Transition/Deferred Value 允许紧急交互先完成。

第三类不会减少 CPU 总量。它改善的是响应性和展示顺序，而不是把 200ms 计算变成 20ms。

## 3. React 更新流水线

### 3.1 Schedule

State、Reducer、Context、外部 Store 或 Router 更新让 React 安排工作。自动批处理可把同一任务中的多个更新合并，减少不必要的 Commit，但业务不能依赖某个中间 DOM 状态一定出现。

### 3.2 Render Phase

React 调用组件和 Hooks，生成下一棵 UI 描述并进行 Reconciliation。Render 必须是纯计算：

- 可以被调用多次。
- 可以在提交前被更高优先级工作打断。
- 被打断的结果可能直接丢弃。
- Strict Mode 开发环境会额外调用以暴露不纯逻辑。

因此不能在组件函数、`useMemo` 计算或 State Updater 里发送请求、修改全局对象、记录不可重复订单。副作用属于事件、Action 或 Effect。

### 3.3 Commit Phase

React 把已完成结果一次性提交到宿主环境：更新 DOM、处理 Ref，并运行 Layout Effect。Commit 不是可中断的；过多 DOM Mutation 或同步 Layout Effect 会直接推迟浏览器 Paint。

### 3.4 Paint 与 Effect

浏览器随后进行 Style、Layout、Paint 和 Composite。`useLayoutEffect` 在 Paint 前运行，适合必须同步测量/修正布局的少数场景；重计算会阻塞 Paint。`useEffect` 通常在 Paint 后运行，但其精确时机不应作为业务协议。

```text
Event
→ Schedule
→ Render（并发工作可中断/重试）
→ Commit（同步）
→ Layout Effect
→ Browser Paint
→ Passive Effect
```

## 4. 先测量，再优化

### 4.1 三层证据

- **Field/RUM**：真实用户、真实设备和真实网络，回答“谁在什么场景慢”。
- **Browser Performance**：主线程 Long Task、Event、Style/Layout/Paint、Network，回答“时间花在哪里”。
- **React Profiler**：Commit、组件 Render 和交互，回答“React 子树为什么更新、成本多大”。

Core Web Vitals 当前关注 LCP、INP、CLS。INP 在真实页面生命周期中观察交互到下一次 Paint 的延迟；“良好”阈值是第 75 百分位不超过 200ms。平均值会掩盖低端设备和尾部延迟，应按页面、设备与交互维度切分。

### 4.2 `<Profiler>` 指标

本课建立一个有上限的内存缓冲区：

<<< ../../../examples/frontend/react-performance-concurrency/types.ts

<<< ../../../examples/frontend/react-performance-concurrency/profiler-metrics.ts

`onRender` 的核心字段：

| 字段 | 含义 |
| --- | --- |
| `phase` | `mount`、`update` 或 `nested-update` |
| `actualDuration` | 这次实际 Render 子树耗时 |
| `baseDuration` | 不考虑优化时整棵子树最近成本估计 |
| `startTime` | React 开始本次 Render 的时间 |
| `commitTime` | 本次 Commit 的时间；同一 Commit 的 Profiler 相同 |

若 `actualDuration` 显著低于 `baseDuration`，说明 Memo 化跳过了一部分工作。不要把每次回调直接同步上传；回调本身也有成本，应采样、缓冲并批量发送。

开发模式含 Strict Mode、Source Map 和额外检查，时间不能当作生产结论。标准生产构建默认禁用 Profiler，需要专门的 Profiling Build 才能采集相应数据。

## 5. 组件为什么重新 Render

函数组件会在以下情况重新执行：

- 自身 State/Reducer 更新。
- 父组件重新 Render，且没有有效 Memo Bailout。
- 读取的 Context Value 改变。
- 订阅的外部 Store Snapshot 改变。
- Suspense 重试、错误恢复、开发 Strict Mode 等框架流程。

重新 Render 不等于 DOM 一定变化。React 可能算出相同结果，Commit 时不修改 DOM；但 Render 计算成本已经发生。

State Setter 传入与当前值 `Object.is` 相同的值通常可跳过更新，但不能把这种优化当业务语义。更重要的是避免错误的源状态和 Effect 循环。

## 6. 先做结构性优化

在手动 Memo 前优先检查：

1. 临时 State 是否被不必要地提升到页面根部。
2. Wrapper 是否可以接收 `children`，让自己的 State 更新不必重建 Child JSX。
3. 是否存在 `Effect → setState → Render → Effect` 链。
4. 派生值是否被重复存进 State，再用 Effect 同步。
5. Context 是否放入每次都新建的大对象，导致所有消费者更新。
6. 大量不可见 DOM 是否应该分页或虚拟化。
7. 单个组件内部是否有无法让出的巨大同步循环。

React 的可中断调度发生在 Fiber 工作单元之间。若一个组件函数内部执行 200ms 同步解析，React 不能在这段普通 JavaScript 中途让出；应拆分、预计算、分块，或移动到 Web Worker/服务端。

## 7. `memo`：跳过 Props 未变的组件

`memo(Component)` 默认逐项使用 `Object.is` 比较 Props。它只是性能提示：React 仍可能重新 Render；组件自身 State 和读取的 Context 更新也不会被 `memo` 挡住。

有效 Memo 化需要同时满足：

- 组件 Render 确实昂贵或更新非常频繁。
- 多数更新中 Props 保持引用稳定。
- 比较成本低于重新 Render 成本。
- 组件 Render 纯净，跳过执行不影响正确性。

一个每次新建的对象、数组、函数或 JSX `children` 足以破坏整层 Memo：

```tsx
// 每次 Parent Render 都创建新引用
<Chart options={{ theme: 'dark' }} onSelect={() => select(id)} />
```

优先把常量移到模块级、传递更小的 Primitive Props、把 State 放到更局部的位置。只有测量确认需要时，再用 `useMemo/useCallback` 稳定引用。

### 自定义比较器的风险

`memo(Component, arePropsEqual)` 返回 `true` 意味着“新旧 Props 产生完全等价的可观察行为”。必须比较函数，因为函数可能闭包捕获旧 State。漏掉 Callback 会产生“界面是新的、事件读取旧值”的幽灵 Bug。

无边界深比较可能比 Render 更慢，也会随数据结构增长突然冻结页面。应在生产性能面板中比较“比较器耗时”和“被跳过的 Render 耗时”。

## 8. `useMemo` 与 `useCallback`

### `useMemo`

缓存计算结果：

```ts
const visible = useMemo(() => filter(items, query), [items, query])
```

依赖使用 `Object.is` 比较。计算必须纯；Strict Mode 开发环境可能调用两次。React 也可能因热更新、首次挂载 Suspense 等原因丢弃缓存，所以它不能承担业务正确性和资源生命周期。

### `useCallback`

缓存函数引用，本质上类似 `useMemo(() => fn, deps)`。它主要在以下情况有价值：

- 传给被 `memo` 包装且确实昂贵的子组件。
- 作为另一个 Hook 的依赖且无法移除。
- 自定义 Hook 需要给调用者稳定 Action。

给所有函数套 `useCallback` 不会减少函数书写或闭包创建的概念成本，还增加依赖维护和比较工作。

### React Compiler

React Compiler 能在构建期自动 Memo 化值与组件，通常减少手写 `memo/useMemo/useCallback`。但需要明确安装、配置和验证；React 版本号本身不会自动开启它。

启用 Compiler 后仍需：

- 遵守组件与 Hook 纯度规则。
- 用 React DevTools 的 Memo 标记和 Profiler 验证结果。
- 保留有语义价值的 State/Ref，不把 `useMemo` 当持久存储。
- 仅在 Annotation Mode 等需要时使用 `"use memo"`，默认 Infer Mode 通常不需要到处标记。

## 9. `useDeferredValue`：让消费方滞后

完整搜索数据与纯函数：

<<< ../../../examples/frontend/react-performance-concurrency/catalog.ts

<<< ../../../examples/frontend/react-performance-concurrency/search-lessons.ts

输入框必须用紧急 State 立即更新；把 Query 本身放进 Transition 会导致受控输入无法及时反映按键。`useDeferredValue(query)` 返回供昂贵消费方使用的滞后版本：

<<< ../../../examples/frontend/react-performance-concurrency/PerformanceLab.tsx

一次输入更新大致经历：

```text
Urgent Render：input = 新 query，结果仍使用旧 deferredQuery
→ Commit，让按键立即可见
→ Background Render：尝试使用新 deferredQuery 计算结果
   ├─ 又有输入：丢弃并从最新值重试
   └─ 无更高优先级工作：Commit 新结果
```

它没有固定 Debounce 延迟；浏览器空闲后立即尝试背景 Render。它也不会阻止网络请求，若 Query 驱动 Fetch，仍需缓存、防抖或取消策略。

`query !== deferredQuery` 可显示“结果稍旧”的非阻塞反馈，例如降低透明度。不要让用户误以为旧列表已经匹配当前输入。

传给 `useDeferredValue` 的对象应保持稳定。若 Render 时立即创建 `{ query }`，每次引用都不同，会制造无意义的背景更新；优先传 Primitive 或组件外创建的稳定对象。

## 10. 虚拟列表：不创建看不见的 DOM

Memo 只能减少 React 计算，不能消除已有 10,000 个 DOM 节点的 Layout、Style、内存和辅助技术负担。大列表通常需要分页或窗口化。

本课实现固定行高、Overscan 的最小窗口算法：

<<< ../../../examples/frontend/react-performance-concurrency/VirtualLessonList.tsx

```text
start = floor(scrollTop / rowHeight) - overscan
end   = start + viewportRows + 2 × overscan
offset = start × rowHeight
```

外层滚动容器保留总高度，内层只渲染视口附近行并平移到正确位置。Overscan 避免快速滚动看到空白。

生产场景还要处理：

- 动态行高的测量和缓存。
- ResizeObserver 与容器尺寸变化。
- 键盘导航、焦点移出窗口后的策略。
- `aria-setsize/aria-posinset`、读屏与查找行为。
- 滚动锚定、反向列表、追加数据。
- SSR 初始窗口与 Hydration 一致性。

应优先采用经过验证的虚拟化库；本实现用于看清算法和可访问性边界。

## 11. `useTransition`：标记非紧急更新

```ts
const [isPending, startTransition] = useTransition()

startTransition(() => {
  setTab(nextTab)
})
```

传入函数会立即执行，但其中同步安排的 State Update 被标记为 Transition。Background Render 可被输入、点击等更紧急更新打断并重新开始。

Transition 适合：

- Tab、路由和大面板切换。
- 更新复杂图表或筛选结果。
- 希望保留已显示内容、避免突然切回大 Spinner 的 Suspense 更新。

不适合：

- 控制文本输入的 State。
- 需要 DOM 已同步更新后马上测量的操作。
- 掩盖 500ms 单函数同步计算。

React 19.2 中，`startTransition(async () => { await ... })` 可以跟踪异步 Action 的 Pending，但 `await` 之后直接安排的 State 目前仍需再包一层 `startTransition` 才会被标记为 Transition。自行编写并发请求还必须处理乱序；常见 Form/Action 抽象会替你处理一部分排序问题。

多个同时进行的 Transition 当前可能被批在一起，不能用单个 `isPending` 精确表达每个领域请求。

## 12. Suspense 是“等待边界”

`<Suspense fallback={...}>` 在子树 Render 时遇到支持 Suspense 的等待源后展示 Fallback。稳定版支持的典型来源包括：

- `lazy()` 加载组件代码。
- 使用 `use()` 读取缓存 Promise。
- Relay、Next.js 等集成 Suspense 的框架/数据源。

Suspense **不会**自动发现 `useEffect` 或事件处理器里的 Fetch。官方也明确指出，无框架的数据源集成协议仍不稳定、未文档化；不要在业务项目随意实现“Throw Promise 缓存库”。

### Boundary 设计

Boundary 应跟产品认可的加载顺序一致，不应机械地包住每个组件：

```text
Page Shell（立即显示）
├─ Header（立即显示）
└─ Suspense：主要内容 Skeleton
   ├─ Summary
   └─ Suspense：次要推荐 Skeleton
      └─ Recommendations
```

同一 Boundary 内的子树一起 Reveal；嵌套 Boundary 可逐步 Reveal。Fallback 应保持近似布局，避免 CLS，也不能自己依赖同一未完成资源。

首次挂载前发生 Suspend 时，React 不保留那次未提交的 State；资源准备好后从头重试。已显示子树再次 Suspend 时，除非更新来自 Transition/Deferred Value，否则最近 Boundary 可能重新显示 Fallback。隐藏已显示内容时，React 会清理 Layout Effect，恢复后重新运行。

### Suspense 不处理错误

Promise Reject 或 Lazy Import 失败需要 Error Boundary，Fallback 只表达“尚未准备好”。代码分割边界应通常组合：

```tsx
<ErrorBoundary>
  <Suspense fallback={<Skeleton />}>
    <LazyPanel />
  </Suspense>
</ErrorBoundary>
```

本课 Error Boundary：

<<< ../../../examples/frontend/react-performance-concurrency/ErrorBoundary.tsx

## 13. `lazy`、代码分割与预加载

延迟分析模块：

<<< ../../../examples/frontend/react-performance-concurrency/HeavyAnalytics.tsx

Transition、Lazy、Suspense 和 Error Boundary 的完整组合：

<<< ../../../examples/frontend/react-performance-concurrency/ConcurrentWorkspace.tsx

`lazy(load)` 必须在模块顶层声明。若在组件内声明，每次 Render 都会创建新的组件类型，导致 State 重置。React 会缓存 Load Promise 及其解析后的 Module；动态导入模块通常需要 Default Export。

`onPointerEnter/onFocus` 提前调用同一个 Import，可在用户表达意图后开始下载。预加载策略要有证据：

- 过早加载所有 Chunk 等同于没有分割，还竞争关键网络资源。
- Chunk 太碎会增加调度和请求开销。
- 登录后高概率访问的下一页面可在空闲或意图时预取。
- Chunk 文件名应内容哈希、长期缓存；HTML/Manifest 更新要兼容旧 Chunk。
- 部署后旧页面请求已删除 Chunk 时，需要可恢复的刷新/版本策略。

Transition 会尽量保留已经显示的 Overview，直到 Analytics 顶层内容准备好，同时 `isPending` 在 Tab 上反馈。新出现的嵌套 Boundary 仍可立即显示自己的 Skeleton，这让页面能渐进 Reveal。

## 14. 完整客户端应用

应用组合：

<<< ../../../examples/frontend/react-performance-concurrency/App.tsx

纯客户端入口：

<<< ../../../examples/frontend/react-performance-concurrency/main.tsx

这套示例刻意同时使用：

- `useDeferredValue`：调用方只有 Value，没有结果 State Setter。
- `useMemo`：避免 Deferred Query 未变时重复搜索。
- `memo`：滚动窗口移动时跳过 Props 未变的 Row。
- Virtualization：从根本上限制 DOM 数量。
- Profiler：验证优化是否真的降低 Actual Duration。
- Transition：把 Tab 切换标记为非紧急。
- Lazy/Suspense：按需加载并协调等待界面。

每个工具解决不同问题，不能互相替代。

## 15. Streaming SSR 与 Selective Hydration

传统 `renderToString()` 必须等整棵树完成才返回 HTML，也不支持等待数据的流式 Reveal。Streaming SSR 让服务器先发送 Shell，再把 Suspense 子树的 HTML 和替换指令逐段发送。

Node 流式入口：

<<< ../../../examples/frontend/react-performance-concurrency/streaming-server.tsx

关键回调：

- `onShellReady`：Shell 已可输出，适合面向浏览器尽快开始流。
- `onAllReady`：所有内容完成，适合爬虫、静态生成或不希望流式输出的客户端。
- `onShellError`：Shell 本身无法生成，只能返回替代错误页。
- `onError`：记录子树/流式错误，并设置最终状态策略，不能把 Stack 返回用户。
- `abort()`：超时或客户端断开时停止工作，让未完成 Boundary 交给客户端恢复。

生产服务器还必须处理 Backpressure、CSP Nonce、Asset Manifest、Bot 策略、代理缓冲、压缩刷新和请求级日志。框架通常已经处理这些细节，业务团队不应只为“用上流式”而自建不完整 SSR Server。

### Selective Hydration

流式 HTML 到达后页面可先展示，但事件处理要等对应 JavaScript Hydrate。React 借助 Suspense 边界按资源与用户交互优先级 Hydrate：用户先点击的区域可优先获得交互能力，而不必等待整页所有 Chunk。

客户端 Hydration 入口：

<<< ../../../examples/frontend/react-performance-concurrency/hydrate-client.tsx

`hydrateRoot` 要求客户端首次 Render 与服务端 HTML 匹配。以下内容常造成不一致：

- Render 中读取 `Date.now()`、`Math.random()`、随机 UUID。
- 服务端/客户端 Locale、Timezone 不同。
- Render 中直接读取 `window`、LocalStorage 或屏幕宽度。
- 服务端数据与客户端 Bootstrap Data 不是同一 Snapshot。
- 无效 HTML 嵌套被浏览器自动修正。
- CDN/扩展改写 HTML。

`suppressHydrationWarning` 只适合已知且不可避免的单层文本差异，是逃生口，不会递归修复结构，也不应掩盖普通 Bug。`onRecoverableError` 应接入监控并附带 Route、Release 和 Component Stack。

## 16. 服务端组件、SSR 与 Suspense 不要混淆

- **SSR**：服务器把 React Tree 变为 HTML，客户端通常还要 Hydrate 同一组件逻辑。
- **Streaming SSR**：HTML 分段发送，配合 Suspense 渐进 Reveal。
- **Server Component**：组件逻辑只在服务端运行，结果以特殊 Payload 交给客户端树；不是普通 HTML SSR 的同义词。
- **Code Splitting**：按需加载客户端 JS Module；不等于按需获取数据。
- **Suspense**：协调“子树尚未准备好”的展示边界；本身不规定数据缓存协议。

实际项目应优先采用 Router/Framework 提供的整合方案，因为缓存、路由、错误、Head、Status Code、Asset 和 Hydration 必须一致协作。

## 17. 浏览器渲染成本仍然存在

React Profiler 看不到全部成本。一次 Commit 很快，随后 Layout/Paint 很慢，可能来自：

- 深层 DOM 和复杂 CSS Selector。
- 读取 Layout 后写 Style，再读 Layout 的强制同步布局。
- 大面积阴影、滤镜、透明层和 Paint。
- 图片没有尺寸导致 Layout Shift。
- 动画修改 `top/left/width` 而非优先使用 Transform/Opacity。
- 过多合成层占用 GPU 内存。

使用 Chrome Performance 的 Main、Rendering、Layers 和 Paint Profiler 对照 React Commit。不要仅凭 React DevTools 宣布问题解决。

`content-visibility: auto` 可跳过离屏子树的部分渲染工作，但 DOM、React Fiber 和内存仍存在，也需要合理的 Intrinsic Size。它不是完整虚拟化的等价替代。

## 18. 常见反模式

### 到处 Memo

比较和缓存也有成本，依赖错误还会制造旧值。没有 Profiler 证据时，先保持代码简单和状态局部。

### 用 Transition 包住一切

用户输入、焦点、展开按钮等即时反馈应紧急更新。过度 Transition 会让界面像“没点上”，也让 Pending 状态难以归因。

### 用 `setTimeout` 模拟优先级

Timeout 只是把任务放到未来队列，没有 React Pending、可中断 Render 和 Suspense 协调语义。Debounce 可用于减少请求，但不等于 Transition。

### Effect Fetch 期待触发 Suspense

Effect 在 Commit 后才运行，Suspense 只响应 Render 阶段的受支持等待源。两套模型不要混用。

### 一个根级 Spinner 包住所有内容

任何局部 Suspend 都让导航、标题和旧内容消失，导致闪烁与布局跳变。Boundary 应对齐产品的 Reveal Sequence。

### Hydration Error 统一忽略

不一致可能导致 React 放弃部分服务端 DOM、重建客户端树、事件绑定错位或性能退化。开发和生产监控都应追踪。

## 19. 测试与性能预算

### 正确性测试

- 快速连续输入时，Input 始终显示最新 Query。
- Deferred 结果最终与最新 Query 一致，旧结果有明确 Stale 标识。
- 连续切换 Tab 时最终选择正确，Pending 不阻塞按钮。
- Lazy Chunk 失败进入 Error Boundary，而非永久 Skeleton。
- 虚拟列表滚动后位置、Key 和可访问集合信息正确。
- 服务端 HTML 与 Hydration 首帧一致。

### 性能回归

在稳定硬件/限速下记录固定用户路径：

1. 输入搜索词。
2. 滚动结果列表。
3. 首次进入 Analytics。
4. 返回并再次进入，验证 Chunk Cache。

预算应绑定用户结果，例如：

- 搜索交互的 P75 INP。
- 指定 Profiler 子树的 Update Actual Duration。
- 同一查询最大 DOM 节点数。
- Route 初始/异步 Chunk 大小。
- Lazy Boundary 可见时间和失败率。
- Hydration Recoverable Error 数量必须为零或有明确白名单。

单次微基准易受 JIT、开发工具和后台进程影响；应多次运行、比较分布并保留变更前基线。

## 20. 决策清单

遇到卡顿时按顺序确认：

1. Field Data 证明哪个页面、设备和交互慢？
2. 时间在 Network、JS、React Render、Commit、Layout 还是 Paint？
3. 能否删除 Effect 链、缩小 State、分页或减少 DOM？
4. 昂贵工作是否集中在单个不可让出的同步函数？
5. Memo 的 Props 在多数更新中是否稳定，比较是否更便宜？
6. 输入等紧急 State 是否与昂贵消费方分离？
7. 应使用 Setter 范围的 Transition，还是消费 Value 的 Deferred Value？
8. Suspense 数据源是否真的受支持，Boundary 是否对齐 Reveal 设计？
9. Lazy Chunk 的加载、错误、预取和部署版本是否可恢复？
10. SSR Snapshot 是否确定且能与客户端首帧完全一致？
11. React Profiler 改善后，浏览器 Layout/Paint 是否也改善？
12. 优化是否在真实设备与 P75/P95 指标中成立？

## 21. 官方资料

- [React `<Profiler>`](https://react.dev/reference/react/Profiler)
- [React `memo`](https://react.dev/reference/react/memo)
- [React `useMemo`](https://react.dev/reference/react/useMemo)
- [React `useCallback`](https://react.dev/reference/react/useCallback)
- [React `useTransition`](https://react.dev/reference/react/useTransition)
- [React `useDeferredValue`](https://react.dev/reference/react/useDeferredValue)
- [React `<Suspense>`](https://react.dev/reference/react/Suspense)
- [React `lazy`](https://react.dev/reference/react/lazy)
- [React Compiler Introduction](https://react.dev/learn/react-compiler/introduction)
- [React `renderToPipeableStream`](https://react.dev/reference/react-dom/server/renderToPipeableStream)
- [React `hydrateRoot`](https://react.dev/reference/react-dom/client/hydrateRoot)
- [web.dev Interaction to Next Paint](https://web.dev/articles/inp)

## 22. 下一节预告

下一节进入 **React 测试策略与可测试架构**：系统设计纯逻辑单测、组件交互测试、Router/Action 集成测试、Mock 边界、异步稳定性、可访问性断言与端到端关键路径。
