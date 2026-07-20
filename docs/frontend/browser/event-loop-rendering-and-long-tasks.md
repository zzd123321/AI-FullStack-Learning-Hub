---
title: 事件循环、渲染流水线与长任务诊断
description: 系统理解浏览器 Task、Microtask、Rendering Opportunity、requestAnimationFrame、布局与绘制、长任务拆分、Worker 和性能观测
outline: deep
---

# 事件循环、渲染流水线与长任务诊断

> 本节讨论的是浏览器中的 HTML Event Loop。Node.js 有自己的阶段与队列模型，不能把浏览器的 `requestAnimationFrame`、Rendering Opportunity 或 Task Source 规则直接套到 Node.js。

先从一个熟悉的现象开始：用户点击“筛选课程”，按钮样式已经在代码里改成 Loading，页面却过了半秒才真正显示；接口其实只用了 30ms。问题不一定在网络，而可能是 Click Handler 后面紧接着做了大数组转换，Promise Continuation 又排出一串 Microtask，主线程一直没有机会处理渲染。

要解释这半秒，需要沿一条因果链观察：

```text
输入到达
  → Task 何时开始执行
  → Microtask 何时清空
  → 浏览器是否获得 Rendering Opportunity
  → Style / Layout / Paint 做了多少工作
  → 新像素何时呈现
```

本课先建立这条主线，再讨论 rAF、分片、Worker 和性能工具。这样每个 API 都是在解决链路中的某个具体阻塞点，而不是一组“异步技巧”。

## 浏览器到底在协调哪些工作

“JavaScript 是单线程的”太粗糙。浏览器至少包含三层协作：

```text
ECMAScript Engine
├─ Execution Context Stack
├─ Heap
└─ Job / Promise Reaction 语义

HTML Host Environment
├─ Event Loop
├─ Task Sources
├─ Microtask Queue
├─ Timers、Events、Networking
└─ Update the Rendering

Browser Processes / Threads
├─ Main Thread
├─ Compositor / Raster Threads（实现相关）
├─ Network / Storage
└─ Worker Agents
```

ECMAScript 定义语言、执行上下文和 Promise Job；HTML Standard 定义浏览器如何把 Script、Event、Timer、Networking Completion 等工作放进 Event Loop。网络请求不需要主线程一直等待，但网络完成后的 JavaScript Callback 仍要回到相应执行环境排队。

一个 Window Event Loop 可能服务多个可同步访问的同源 Window；Worker 通常拥有自己的 Agent、Stack、Heap 和 Event Loop。具体浏览器的 Process/Thread 分配属于实现细节，不要把“一个 Tab 永远对应一个主线程”当规范保证。

### Run-to-completion：任务不会被 JavaScript 抢占

当一个 Callback 开始执行，它会持续运行到调用栈清空。另一个 Click Handler、Timer Callback 或 Promise Reaction 不会在任意语句中间抢占它：

```ts
let balance = 100

button.addEventListener('click', () => {
  const before = balance
  balance = before - 10
  // 另一个普通 JS Task 不会插进这两句之间
})
```

这使单线程代码比共享内存多线程容易推理。但代价也很直接：如果 Callback 执行 300ms，浏览器不能在这段 JavaScript 中间自动暂停它去处理下一次输入。用户输入、Timer 和很多渲染工作只能等待。

`async/await` 没有改变 Run-to-completion。函数只在真正遇到未完成 Await 时返回控制权，后续部分成为 Continuation；在 Await 前的同步循环仍会完整阻塞。

### Task 不是“唯一宏任务队列”

教学中常把 Script、Timer、Event 都画进一个 Macro Task Queue。这有助于入门，却不是 HTML 模型的精确描述。

HTML 定义 Task，并让 Task 带有 Task Source。Timer、DOM Manipulation、Networking 等可以来自不同 Source。同一个 Source 内需要维持规定的顺序；User Agent 可以在不同 Source 之间选择，借此优先响应用户输入。规范并不承诺所有来源严格按全局入队时间 FIFO。

常见 Task 来源包括：

- 初始 Script Evaluation。
- 用户输入的 Event Dispatch。
- `setTimeout` / `setInterval` 到期后的 Callback。
- Message Channel、`postMessage`。
- 一部分网络、存储和媒体完成事件。
- `scheduler.postTask()` 调度的工作。

“宏任务”不是 HTML Standard 当前核心术语。工程沟通可以使用，但设计执行顺序时应说清楚究竟是 Task、Microtask 还是 Rendering Callback。

## 从一个 Task 走到下一次渲染

知道单段 JavaScript 不会被抢占后，下一步是理解调用栈清空时浏览器做什么。这里最常见的误解，是把 Promise 当成“让浏览器先渲染”的通用工具。

### Microtask Checkpoint 会清空队列

Promise Reaction、`queueMicrotask()` 和 Mutation Observer Delivery 使用 Microtask 机制。简化理解：当前 Task 返回、调用栈清空后，浏览器执行 Microtask Checkpoint，并持续处理，直到 Microtask Queue 为空。

```text
选择并运行一个 Task（Run-to-completion）
           ↓
Perform a Microtask Checkpoint
  ├─ 运行已有 Microtask
  ├─ 它加入的新 Microtask 也继续运行
  └─ 直到队列为空
           ↓
如果出现 Rendering Opportunity，可能更新渲染
           ↓
选择后续 Task / 进入 Idle
```

规范还会在其他需要的时点执行 Microtask Checkpoint，因此这张图是主线模型，不是完整算法的逐步抄写。

### 用代码观察顺序，同时接受边界的不确定性

<<< ../../../examples/frontend/browser-event-loop/event-order.ts

稳定部分通常是：

1. 两条同步日志先执行。
2. 当前 Task 结束后，已排入的 Microtask 按顺序运行。
3. Microtask 新加入的 Microtask 也会在下一 Task 前完成。
4. Timer Callback 与 `requestAnimationFrame` 都不能打断当前 Task/Microtask Checkpoint。

不应仅凭这段代码声称 `setTimeout(0)` 永远早于或晚于 `requestAnimationFrame`。Timer 只是达到可运行条件，rAF 取决于 Rendering Opportunity、刷新节奏、页面可见性和 User Agent 调度。不同启动时点、设备和浏览器可能出现不同结果。

完整实验页面如下，经过 TypeScript 编译后由原生 ES Module 加载：

<<< ../../../examples/frontend/browser-event-loop/index.html

<<< ../../../examples/frontend/browser-event-loop/styles.css

### `Promise.then`、`queueMicrotask` 与 `async/await`

以下代码的 Continuation 都会使用 Microtask 语义：

```ts
queueMicrotask(() => console.log('microtask'))

Promise.resolve().then(() => console.log('promise reaction'))

async function run() {
  await Promise.resolve()
  console.log('async continuation')
}
```

`queueMicrotask` 适合不需要创建 Promise Result、又要明确进入 Microtask Queue 的场景。与用 `Promise.resolve().then(callback)` 模拟相比，它表达意图更直接；异常报告行为也可能不同：普通 Microtask 抛错作为异常报告，Promise Reaction 抛错会拒绝派生 Promise。

`await` 的关键不是语法看起来“异步”，而是 Awaited Value 如何 Settled。`await Promise.resolve()` 只把 Continuation 放到 Microtask，不会跳到未来 Task，也就通常不会让浏览器在两段工作之间 Paint。

### Microtask 适合做什么

Microtask 适合同一轮同步变更后的收尾与批处理：

- 把一次 Task 中的多次通知合并为一次 Flush。
- 让同步 Cache Hit 和异步分支保持一致的通知时机。
- 在当前调用栈退出后修复内部不变量。
- Framework 在确定性边界内批量刷新更新。

<<< ../../../examples/frontend/browser-event-loop/microtask-batcher.ts

这个 Batcher 在第一次 `add()` 时只安排一个 Microtask，把当前 Task 中后续 `add()` 合并。Flush 前先替换内部数组，Flush 内若再次 `add()`，会安排后续 Microtask，避免修改正在迭代的 Snapshot。

Microtask 不适合大计算、递归轮询和“尽快执行所有后台工作”。这些工作会阻止下一 Task 和渲染。

### Microtask Starvation

因为 Microtask Checkpoint 会持续到队列为空，递归加入 Microtask 可以饿死 Timer、输入和渲染：

```ts
function starve() {
  queueMicrotask(starve)
}

starve()
```

即使每个 Callback 很短，永不为空的队列仍会长期占用主线程。类似风险还可能来自无限 Promise Chain、Observer 回调互相触发，或框架插件不断在 Flush 中排新 Flush。

诊断时不要只看单个 Function Duration；Performance Trace 中连续 Promise/Microtask 链也可能组成一段无法渲染的长占用。

### Rendering Opportunity 不是每个 Task 后必然 Paint

“Task → Microtask → Render”中的 Render 是**可能**发生。User Agent 根据刷新率、页面可见性、是否有必要更新以及资源策略决定 Rendering Opportunity。

这意味着：

- 连续多个 Task 之间不保证每次都 Paint。
- DOM Mutation 只会让相关渲染状态变脏，不等于立即显示到屏幕。
- 浏览器可以合并多次 Style/DOM 更新。
- Background Tab 的帧回调可能暂停或大幅降频。
- 60Hz 约 16.7ms 只是常见示例，120Hz 约 8.3ms，设备也可能动态调整刷新率。

所谓“帧预算”还要包含 Browser 的 Style、Layout、Paint、Composite 准备等工作，不能把完整 16.7ms 全留给业务 JavaScript。

### `requestAnimationFrame` 的正确心智模型

`requestAnimationFrame(callback)` 请求浏览器在下一次合适的 Rendering Update 中、绘制前调用 Callback。它不是精确 Timer，也不是保证每秒 60 次。

正确动画必须使用 rAF 提供的 High Resolution Timestamp 计算经过时间，而不是每帧固定移动 1px：

<<< ../../../examples/frontend/browser-event-loop/frame-loop.ts

实现细节：

- `start()` 幂等，避免创建多条 Animation Loop。
- `stop()` 对称调用 `cancelAnimationFrame`。
- 第一帧只建立时间基线。
- 对超大 Delta 设置上限，避免页面从后台恢复时对象瞬移。
- 每帧末尾重新申请下一帧；rAF 是 One-shot Callback。

页面不可见时，应根据业务选择暂停、恢复、按墙钟跳到正确状态，或把非视觉任务交给其他机制。不要依赖 Background rAF 维持计费、会话或网络心跳。

## JavaScript 结束后，像素还要经历什么

主线程把控制权还给浏览器，只说明渲染终于“有机会”发生，不说明新像素已经出现。DOM 和 CSS 的变化还可能触发样式、布局与绘制成本。

### 浏览器渲染流水线

从 DOM/CSS 变化到屏幕像素，常用抽象是：

```text
JavaScript / DOM Mutation
          ↓
Style Recalculation：选择器匹配、Cascade、Computed Style
          ↓
Layout：计算盒子的尺寸与位置
          ↓
Paint：生成绘制指令、决定画什么
          ↓
Raster：把绘制内容栅格化成像素/Tile
          ↓
Composite：组合图层并提交显示
```

浏览器会增量失效和优化，并非每次修改都完整经过所有阶段：

- 改 `width` 常影响 Layout，继而 Paint/Composite。
- 改背景或阴影可能跳过 Layout，但需要 Paint。
- 合适图层上的 `transform` / `opacity` 动画可能主要由 Composite 完成。

“只触发 Composite”不是永久保证；图层选择、内存压力、属性组合和浏览器实现都会影响结果。`will-change` 只是 Hint，滥用会创建过多图层、增加显存和管理成本。

### DOM 写入为什么通常不会立刻 Layout

浏览器倾向先记录 Invalidation，等 Rendering Update 统一计算：

```ts
element.style.width = '400px'
element.classList.add('expanded')
// 浏览器通常可合并这些失效
```

但如果后续 JavaScript 立刻读取依赖几何的属性，浏览器为了返回最新值，可能被迫同步计算 Style/Layout：

```ts
element.style.width = '400px'
console.log(element.getBoundingClientRect().width)
// 读取需要最新几何，可能触发 Forced Synchronous Layout
```

常见几何读取包括 `getBoundingClientRect()`、`offsetWidth/Height`、`clientWidth/Height`、部分 `getComputedStyle()` 使用。是否真正强制 Layout 取决于此前是否有相关 Dirty State，不能只凭 API 名称断定。

### Layout Thrashing：读写交错的隐性循环

危险模式是在循环里写一个元素，再读另一个元素：

```ts
for (const card of cards) {
  card.style.width = `${containerWidth}px` // write
  total += card.offsetHeight               // read：可能迫使前面的写入布局
}
```

每轮都可能打断浏览器合并优化。更好的顺序是先完成所有 Measure，再完成所有 Mutate：

<<< ../../../examples/frontend/browser-event-loop/dom-batcher.ts

Batcher 在一帧中先执行 Reads，后执行 Writes。Flush 期间新加入的操作留到下一帧，避免在本帧 Write 后又进入 Read。生产实现还需：

- 处理某个 Operation 抛错，避免后续队列永久丢失。
- 按 Component 生命周期取消。
- 防止大量低价值 Operation 占满一帧。
- 结合 Resize Observer，避免轮询尺寸。

框架的 Virtual DOM 可以合并 DOM Writes，但组件代码在 Effect/Hook 中交错读取几何，仍会触发 Forced Layout。

### Observer Callback 处在什么位置

不同 Observer 有不同交付语义，不应笼统称为“异步所以不阻塞”：

- `MutationObserver` 的通知与 Microtask 机制关联，Callback 应保持短小。
- `ResizeObserver` 在 Rendering Update 中提供尺寸变化；回调再次修改尺寸可能形成 Resize Loop。
- `IntersectionObserver` 适合可见性和懒加载，通知时间不等于每个像素变化的动画时钟。
- `PerformanceObserver` 异步交付 Performance Entry，Callback 内仍在主线程执行。

Observer 用来避免低效主动轮询，不代表 Callback 可以进行大计算。把 Entry 复制成最小数据后批量上报，避免 Observer 自身成为性能问题。

## 主线程工作太多时，怎样选择解法

到这里可以把卡顿分成两类：一类是工作本身不必要，应该删除或降复杂度；另一类是工作确实需要，但一次执行太久。只有第二类才进入“让出主线程还是移到 Worker”的选择。

### 什么是 Long Task

在性能工程语境中，主线程连续占用超过 50ms 的 Task 通常被称为 Long Task。它的问题不只在自身耗时：用户若恰好在期间输入，Event Handler 必须等待；DOM 更新也可能等到 Task 和 Microtask 完成后才有机会显示。

Long Task 的 50ms 是诊断阈值，不是“49ms 就优秀”。高刷新率设备一帧预算可能远低于它；一次交互还包含：

```text
Input Delay
  + Event Handler Processing Duration
  + Presentation Delay（直到下一次 Paint）
  = 用户感受到的交互延迟
```

优化顺序通常是：删除工作 → 减少数据量/算法复杂度 → 延迟非关键工作 → 分片让出主线程 → Worker 并行计算。分片不是对低效算法的免责。

### 为什么 `setTimeout(0)` 不是“立即执行”

Timer Delay 表示达到阈值后 Callback **可以被排为 Task**，不是截止时间保证。它还要等待当前 Task、Microtask、调度选择和主线程空闲。嵌套 Timer、Background Page 和省电策略可能增加最小延迟。

因此 `setTimeout(fn, 0)` 可以用于粗略让出当前 Task，但不适合精确 Animation、音视频同步或 Deadline。Timer 排队期间还可能被其他 Task Source 插入工作。

### 使用 `scheduler.yield()` 主动让出主线程

`scheduler.yield()` 专为把 Continuation 放到未来 Task，并尽量保持 Continuation 优先级而设计。截至本课资料基线，它仍不是所有主流浏览器都具备的 Baseline API，因此必须 Feature Detect 并提供回退：

<<< ../../../examples/frontend/browser-event-loop/yield-to-main.ts

这里必须 `await yieldToMain()`。只调用而不 Await，会创建 Promise，却不会暂停当前函数的同步执行。Fallback `setTimeout(0)` 能让出主线程，但不提供同等的 Prioritized Continuation 语义。

不要用 `await Promise.resolve()` 作为回退：它只进入 Microtask，浏览器通常仍无法在两段代码之间处理下一个 Task 或 Paint。

### 按时间预算拆分可中断工作

<<< ../../../examples/frontend/browser-event-loop/chunked-work.ts

示例使用约 8ms Slice Budget，而不是每处理一个元素 Yield：频繁 Yield 自身有调度成本。真实 Budget 要用低端设备和 RUM 调整。

重要边界：

- 每次循环检查 `AbortSignal`，路由离开或新请求到来可停止旧工作。
- Progress 只在 Slice 边界更新，避免 20,000 次 DOM Update。
- Predicate 必须是同步且足够短；若单个 Item 就耗时 100ms，外层分片无法在 Item 中间抢占。
- 分片期间其他代码可以修改共享状态。应处理 Snapshot、一致性或 Version Check。
- `performance.now()` 是适合测 Duration 的单调高精度时钟，不要用可被系统时钟调整的 `Date.now()` 做这类预算。

### 分片还是 Worker

| 方案 | 优势 | 成本 | 适用情况 |
| --- | --- | --- | --- |
| 主线程同步 | 最简单、无通信 | 阻塞输入和渲染 | 极短工作 |
| 主线程分片 | 可直接访问 DOM、渐进显示 | 总 CPU 未减少，状态可能交错 | 可增量、每块很短 |
| Dedicated Worker | 真正离开主线程计算 | 启动、消息、序列化、协议 | 大型纯 CPU 工作 |
| Server | 客户端负担低、数据靠近后端 | 网络延迟、成本、隐私 | 可服务端集中计算 |

Worker 不会让算法自动更快；它的主要价值是释放主线程响应输入和渲染。若每次都复制数百 MB 数据，Structured Clone 成本可能抵消收益。大二进制数据考虑 Transferable，跨线程共享内存则需要更严格的并发与安全设计。

### Worker 消息协议也要运行时校验

<<< ../../../examples/frontend/browser-event-loop/worker-protocol.ts

协议包含 Discriminated Union、`requestId` 和输入上限。类型只约束编译期，Worker Boundary 的消息在运行时仍是 `unknown`，所以两端都校验。

Worker 实现完全不访问 DOM：

<<< ../../../examples/frontend/browser-event-loop/prime-worker.ts

计算本身仍是同步的，但只阻塞 Worker Agent，不阻塞 Window Main Thread。输入上限防止意外或恶意消息创建无限工作。

### Worker 生命周期与取消

<<< ../../../examples/frontend/browser-event-loop/prime-client.ts

这个 Client 为每次独立重计算创建 Worker，并通过 `terminate()` 实现强制取消，适合低频、较重任务。高频任务应复用 Worker/Pool，并在协议中增加 Cancel Message；但 Worker 内的同步大循环要主动检查取消标志，否则 Cancel Message 也要等循环结束才能处理。

资源清理包括：

- 成功、失败和取消都移除 Abort Listener。
- 结束后 Terminate，避免 Worker 常驻。
- 使用 `requestId` 忽略不属于当前请求的响应。
- 同时监听 Message Error/Runtime Error。
- 页面导航或组件 Unmount 时 Abort。

Cross-origin Worker、CSP、Module Worker 支持与 Bundler URL 转换要在目标部署环境验证。

### 把动画、分片与 Worker 组合成实验页

<<< ../../../examples/frontend/browser-event-loop/main.ts

入口把各模块组合成可观察实验。动画每帧读取 Track/Dot 尺寸，再写 `transform`；Transform 不改变 Layout Geometry，因此下一帧读取通常不会像写 `width` 那样制造布局反馈，但正式组件仍可用 Resize Observer 缓存最大距离，减少重复读取。

Chunked Work 更新 `<progress>`，Worker 计算保持主线程可交互。建议在性能较弱设备或 DevTools CPU Throttling 下运行，对比分片、Worker 与刻意同步循环的 Main Track。

## 从症状定位到具体阻塞点

优化不能从“感觉是 React 慢”开始。先把一次真实交互拆成等待、处理和呈现，再选择能回答问题的工具。

### 使用 PerformanceObserver 采集线索

<<< ../../../examples/frontend/browser-event-loop/performance-monitor.ts

示例按 `PerformanceObserver.supportedEntryTypes` Feature Detect：并非所有浏览器都支持 `longtask`、`long-animation-frame` 或 `event`。每种 Entry Type 单独 Observer，避免一个不支持的类型让整个初始化失败。

不同 Entry 回答不同问题：

- **Long Task**：主线程哪段 Task 长时间不可用。
- **Long Animation Frame（LoAF）**：一帧为何过长，并可在支持实现中提供 Script Attribution；相关 API 仍有实验性与兼容性边界。
- **Event Timing**：Interaction 的 Input Delay、Processing 和 Presentation 相关时间线索。
- **User Timing Measure**：业务主动标记的阶段耗时。

真实 Telemetry 不要上传每条原始 Entry。应采样、聚合、限制基数，补齐 Route/Release/Device Context，并遵循隐私政策。Observer Callback 自身也必须短。

### INP 与 Long Task 不是同一个指标

INP 关注页面生命周期中用户交互到下一次绘制的响应表现，并选取具有代表性的慢交互。Long Task 是主线程 Task Duration 诊断信号。

关系是：Long Task 经常造成 Input Delay 或推迟 Paint，所以会伤害 INP；但没有 >50ms Long Task 也可能有差的 INP，例如多个较短 Task 排队、Handler + Layout + Paint 累积、复杂 Presentation Delay。反过来，页面加载阶段的 Long Task 若没有阻挡交互，也不一定成为该次 INP 的直接样本。

优化 INP 要定位具体 Interaction：

1. 用户何时输入？
2. Handler 为什么晚开始？
3. Handler/框架更新做了什么？
4. Microtask 链是否继续占用？
5. Style/Layout/Paint 为什么晚？
6. 是否有第三方 Script 插队或占用？

### Chrome DevTools Performance 诊断流程

一次可复现分析建议：

1. 使用接近用户的 CPU/Network 条件，关闭会污染结果的扩展。
2. 开始 Performance Recording，执行一次明确交互，立即停止。
3. 从 Interactions/Event Timing 或 Main Track 找到交互。
4. 区分 Input Delay、Handler、Microtask、Rendering、Paint。
5. 展开 Long Task 的 Bottom-up/Call Tree，找 Self Time 与重复调用。
6. 查看红色 Forced Reflow/Layout 标记及 Initiator。
7. 检查第三方 Script、GC、Script Parse/Compile 和框架 Commit。
8. 做一个最小改动后重新录制，对比同一交互，而不是凭体感宣布优化。

DevTools 是受控实验，RUM 才反映真实设备分布。两者闭环：Field Data 找页面与人群，Trace 复现根因，发布后再用 Field Data 验证。

### 网络异步不代表回调免费

`fetch()` 等待网络时不持续占用 JavaScript Main Thread：

```ts
const response = await fetch('/api/lessons')
const data = await response.json()
renderThousandsOfRows(data)
```

但 Promise Continuation、JSON 处理、数据转换和 Render 仍在相应 JavaScript Agent 执行。大响应可能在下载结束后造成明显 CPU 峰值。优化需要同时考虑：

- 后端 Pagination/Filtering，减少根本数据量。
- Streaming Parser/Incremental UI 是否真正被技术栈支持。
- 避免在多个 Layer 重复 Clone/Normalize。
- Virtualization 只渲染可见部分。
- 大型纯计算放 Worker。

不要把所有卡顿归因于“接口慢”；Network Waterfall 和 Main Thread Timeline 是两个维度。

### 映射到 Vue 和 React

Vue `nextTick()`、React Batching/Concurrent Rendering 都建立在宿主调度之上，但不要根据某个版本的内部实现编写依赖顺序的业务逻辑。

- Vue `nextTick()` 适合等待 Vue 把响应式变更 Flush 到 DOM，不等于像素已经 Paint。
- React Effect 通常在 Commit 后运行，但具体与交互、并发和框架集成有关；它不是通用“下一帧”API。
- React Transition 可以让更新可中断/降低优先级，但组件 Render 中的单次巨型同步循环仍无法被任意语句抢占。
- Framework Batching 减少重复 DOM Commit，不会自动优化你的 O(n²) 算法、Forced Layout 或第三方 Script。
- 若必须测量 DOM，明确使用框架提供的 Layout Phase Hook，并把读取/写入范围降到最小。

业务需要“Paint 后执行”时，先问真实目标：Analytics 通常不需等 Paint；Screenshot/Visual Measurement 可能需要专用 API；双 rAF/Timer 只是调度近似，不能被当成规范化 Paint Completion Promise。

## 用常见误区校准心智模型

### 用 Microtask 拆长任务

Microtask Queue 会在下一 Task/渲染前排空。改为 `scheduler.yield()`、Timer/MessageChannel 回退或 Worker。

### 把 rAF 当 16ms Interval

高刷屏、后台页和掉帧都会破坏假设。使用 Callback Timestamp 计算 Delta。

### 每帧无条件做所有工作

没有变化就不要重算；缓存不变量，根据 Dirty Flag 更新，Animation 结束后停止 rAF Loop。

### 看到 Long Task 就机械切成 49ms

50ms 不是体验预算。先删除、降复杂度，再按设备与交互目标确定更短 Slice。

### 到处添加 `will-change`

图层占用内存，也有创建与合成成本。只对已验证热点短期提示，并在动画结束后考虑移除。

### Worker 里继续频繁传大对象

Structured Clone 和消息频率会成为新瓶颈。传最小输入，批量消息，二进制数据评估 Transferable。

### 只在开发机测性能

高端电脑掩盖 CPU、内存和热限制问题。结合 CPU Throttling、真实低端设备和生产分位数。

## 生产诊断清单

- 最慢交互的 Input Delay、Processing、Presentation 各占多少？
- 主线程是否存在 >50ms Task、连续 Microtask Chain 或 Long Animation Frame？
- 是否有同步几何读取触发 Forced Layout？
- DOM Reads/Writes 是否能按帧分组？
- 一次交互是否解析/映射/渲染了不必要的大数据？
- 非关键工作能否延迟、分片或移到 Worker？
- 分片是否支持 Abort，组件销毁后会不会继续更新？
- rAF Loop 是否可停止、基于 Timestamp、处理后台恢复？
- Observer、Timer、Worker 和 Event Listener 是否对称清理？
- Third-party Script 的 CPU、Interval 和加载时机是否纳入 Budget？
- Performance Entry 是否 Feature Detect、采样并保护隐私？
- 优化是否在相同场景复测，并由生产 RUM 验证？

## 完整示例文件

本页已展示实验目录中的全部源码：

```text
examples/frontend/browser-event-loop/
├─ index.html
├─ styles.css
├─ main.ts
├─ event-order.ts
├─ microtask-batcher.ts
├─ yield-to-main.ts
├─ chunked-work.ts
├─ frame-loop.ts
├─ dom-batcher.ts
├─ performance-monitor.ts
├─ worker-protocol.ts
├─ prime-worker.ts
└─ prime-client.ts
```

## 延伸阅读

- [WHATWG HTML：Web application APIs / Event Loops](https://html.spec.whatwg.org/multipage/webappapis.html)
- [MDN：JavaScript execution model](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Execution_model)
- [MDN：Using microtasks with queueMicrotask()](https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide)
- [MDN：requestAnimationFrame()](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
- [MDN：Prioritized Task Scheduling 与 `scheduler.yield()`](https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield)
- [MDN：How browsers work](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/How_browsers_work)
- [MDN：Performance API](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API)
- [MDN：Long animation frame timing](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Long_animation_frame_timing)
- [web.dev：Optimize long tasks](https://web.dev/articles/optimize-long-tasks)
- [web.dev：Optimize input delay](https://web.dev/articles/optimize-input-delay)

## 本节小结

浏览器响应性取决于主线程是否经常把控制权还给 Event Loop。Task 遵循 Run-to-completion；每次 Microtask Checkpoint 会持续清空队列；只有 Rendering Opportunity 到来时，浏览器才可能执行帧回调、Style/Layout/Paint 等更新。因此 Promise 和 Microtask 不能用来给渲染“喘气”。

优化的首选永远是少做工作。剩余工作按用户价值排序：视觉更新使用时间戳驱动的 rAF；可增量计算按短预算分片并支持取消；大型纯 CPU 工作放 Worker；DOM 几何先读后写；最后用 Trace、Performance Entry 和真实用户数据验证，而不是依靠调度口诀。

下一节将继续浏览器与网络模块，系统学习[从 URL 到响应：DNS、TLS、HTTP 缓存与 Fetch](./url-dns-tls-http-cache-and-fetch.md)，理解一次 `fetch()` 从发起到响应可用的完整路径。
