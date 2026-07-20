---
title: Web Worker、SharedWorker、WebAssembly 与前端计算架构
description: 系统掌握主线程预算、Worker 协议、结构化克隆、Transferable、取消、背压、线程池、共享内存、Wasm 边界、性能与生产治理
outline: deep
---

# Web Worker、SharedWorker、WebAssembly 与前端计算架构

把函数移进 Worker 不会自动更快：启动脚本、结构化克隆、队列等待、上下文间通信和结果应用都有成本。WebAssembly 也不是“比 JavaScript 快”的开关；它适合可编译、计算密集、数据边界稳定的内核，却可能被频繁 JS/Wasm 调用、线性内存复制和初始化成本抵消。

前端计算架构真正优化的是一组相互制约的目标：主线程响应、任务总时延、吞吐、内存、取消速度、能耗和故障恢复。本课从“是否真的应该离开主线程”开始，再把 Dedicated Worker 设计成有界任务服务；之后才讨论 SharedWorker、共享内存和 Wasm。

## 学习目标

完成本课后，你应该能够：

- 用 profile、Long Task 和真实交互指标定位主线程阻塞；
- 区分分片、Dedicated Worker、SharedWorker、Service Worker 与 Worklet；
- 设计双向 runtime 校验的版本化任务协议；
- 理解结构化克隆、Transferable、detach 和内存峰值；
- 实现协作取消、deadline、局部背压、有限并发和确定性销毁；
- 解释 SharedArrayBuffer、Atomics 与 cross-origin isolation 的代价；
- 判断 JS、Worker、Wasm 和服务端计算的正确边界；
- 正确加载 Wasm、验证 pointer/length，并处理 memory growth；
- 用真实构建与设备证明性能收益和恢复能力。

## 先证明工作应该离开主线程

浏览器主线程同时处理输入事件、JavaScript、样式计算、布局、绘制提交以及许多框架回调。一个连续 200ms 的 JavaScript 循环不仅“函数耗时 200ms”，还意味着这段时间内点击、键盘、滚动和下一次渲染都无法及时获得执行机会。

### 先找到阻塞来源

不要看到“大数组”就创建 Worker。先使用 Performance 面板、CPU profile、Long Tasks、真实用户 INP/交互延迟和业务埋点回答：

- 时间花在计算、JSON parse、框架 diff，还是同步布局？
- 是否因为 O(n²)、重复计算或一次处理过多数据？
- 输入和输出有多大，是否需要频繁往返？
- 用户需要低延迟单次结果，还是高吞吐批处理？
- 任务是否依赖 DOM、闭包、组件实例或浏览器主线程 API？

常见优化顺序是：

```text
删除无价值工作
→ 改善算法和数据结构
→ 缓存/增量计算
→ 主线程分片并主动让出
→ 单 Dedicated Worker
→ 有证据后池化或 Wasm
→ 设备不适合时交给服务端
```

Worker 不会修复 O(n²)，只会把错误算法搬到另一个事件循环。若任务总共 2ms，消息成本可能比计算更贵；若任务必须每一步读写 DOM，也无法原样迁移。

### 分片与并行解决的问题不同

把大循环分成多个 chunk 并在 chunk 间让出主线程，可以改善输入与渲染响应，但不会增加 CPU 吞吐；总计算仍在同一线程。Dedicated Worker 让计算与主线程并发，适合持续时间足够长、输入输出边界清楚的纯计算。

如果用户只需要避免一个偶发 20ms 峰值，增量处理可能比维护 Worker 协议更简单。如果连续图像处理使主线程长期饱和，Worker 才更可能带来净收益。

### 四类 Worker 不是强弱等级

| 原语 | 生命周期与共享范围 | 适合工作 | 不适合 |
| --- | --- | --- | --- |
| Dedicated Worker | 由创建者拥有 | 解析、搜索、图片、数值计算 | 多标签共享状态 |
| SharedWorker | 精确同源多个 browsing context 连接 | 多标签共享连接与协调 | 永久存储、跨 origin 服务 |
| Service Worker | scope 内事件驱动、可随时终止 | fetch、Push、后台同步 | 常驻 CPU 线程 |
| Worklet | 某个音频/渲染流水线的受限上下文 | Audio/Paint 等低延迟处理 | 通用业务队列 |

SharedWorker 在 2026 年刚进入新的 Baseline，最新浏览器覆盖改善，但旧设备和嵌入环境仍需要能力检测与 fallback。Service Worker 为事件而启动，浏览器可以随时终止；Worklet 的接口和执行约束由对应流水线决定，它们都不能当“更高级的 Dedicated Worker”。

### Worker 中没有 DOM，也不该伪造 DOM

Dedicated Worker 有自己的 global scope、事件循环和模块实例，不能访问 `document`、组件或布局。UI 状态留在主线程，Worker 接收可验证的纯数据并返回纯结果。依赖 DOM 的第三方库不能只因为 bundler 编译成功就安全迁入。

module worker 通常使用构建工具可静态分析的 URL：

```ts
const worker = new Worker(
  new URL('./compute.worker.ts', import.meta.url),
  { type: 'module', name: 'lesson-search' },
);
```

Worker 构造是代码加载入口。URL 不应来自用户输入，并要纳入同源/CORS、CSP、Trusted Types、依赖与发布审计。开发环境能启动不代表生产 CSP 和资源路径正确，必须用真实构建产物测试。

## 把 Dedicated Worker 设计成有界任务服务

页面写下 `worker.postMessage(data)` 时，很容易把 Worker 当作“会自动后台执行的函数”。更准确的模型是：主线程与另一个运行时通过异步消息协议协作。协议、所有权、队列和故障语义必须先于计算内核。

### 双向消息都要运行时校验

<<< ../../../examples/frontend/worker-wasm-architecture/task-protocol.ts

协议包含版本、request ID、有限任务类型、稳定错误码和输入上限。示例不会直接把 `event.data as ComputeRequest` 交给内核，而是逐字段解析并重建 envelope；客户端也不信任 Worker 响应，拒绝未知错误码、非有限数值和畸形 ID。

这是必要的，因为 TypeScript 不存在于运行时，旧页面可能连接新 worker，第三方代码可能直接 postMessage，worker bug 也可能返回意外结构。只校验进入 Worker 的请求、却不校验回主线程的结果，仍会把错误带进 store 和 UI。

结构化克隆支持许多内建数据与循环引用，但不等于“复制整个 JavaScript 世界”：函数和 DOM node 会触发 `DataCloneError`；自定义 prototype、getter、setter 和 property descriptor 语义不会按原对象保留。跨边界应该发送领域 DTO、TypedArray 和 ID，而不是 class instance、响应式 store 或闭包。

### 克隆成本必须进入端到端预算

`postMessage()` 默认使用结构化克隆。深对象需要遍历，大 ArrayBuffer 双向复制会同时增加时间和峰值内存。端到端时延至少包含：

```text
客户端排队
→ 请求 clone/transfer
→ Worker 队列等待
→ 内核执行
→ 结果 clone/transfer
→ 主线程校验、合并和渲染
```

只在 Worker 内打一个 `performance.now()` 会漏掉最关键的通信和 UI 成本。一个 2ms 内核配 10ms 数据搬运通常不值得迁移。

优化方向包括：发送紧凑 TypedArray、索引和增量；批量合并固定开销；减少往返次数；把完整计算阶段留在 Worker。批次也不能无限大，否则首个结果延迟、内存和取消粒度都会恶化。

### Transferable 是所有权转移

ArrayBuffer、MessagePort、ImageBitmap 等对象可以通过 transfer list 转移底层资源，避免普通 clone。转移后发送端资源被 detach，调用方不能继续读取。

<<< ../../../examples/frontend/worker-wasm-architecture/worker-client.ts

示例把方法命名为 `sumTransferred()`，让所有权契约出现在调用点。发送前拒绝 SharedArrayBuffer，因为共享内存不是 transferable，需要另一套同步协议。调用成功后，原 `Float64Array.byteLength` 会变成 0；如果 UI 仍需要原数据，就应改变所有权、保留副本或接受 clone 成本。

transfer list 中的资源必须同时出现在消息对象中。transfer list 只说明“怎样移动”，不会替你把资源挂到消息；遗漏时发送端仍可能被 detach，而接收端拿不到引用。

所有权决策还影响失败语义：一旦 buffer 成功转移，Worker 即使返回 `busy` 或失败，主线程也不再拥有原数据。因此示例客户端在 transfer 前执行本地单槽背压，避免把明知无法接收的任务交给 Worker。

### Abort 不能抢占同步 JavaScript

主线程的 AbortSignal 不能强制跳进 Worker 正在执行的同步循环。cancel 消息要等 Worker 事件循环重新取得控制权后才能处理。如果内核运行 10 秒不 yield，取消消息也会等 10 秒。

<<< ../../../examples/frontend/worker-wasm-architecture/cooperative-sum.ts

示例按 chunk 计算，在边界检查取消并让出 Worker 事件循环。最后一次 yield 返回前还会再次检查，避免“用户已经取消，但最后一个 chunk 恰好算完”时错误发布成功。

chunk 越大，吞吐固定开销越低，但取消延迟越高；越小则调度开销更多。它不是一个固定魔法数，应在目标低端设备上同时测吞吐和取消 P95。

客户端收到 Abort 后立即结束调用方 Promise，并向 Worker 发 cancel；但 Worker 槽位仍保持占用，直到收到该任务的终态响应。这样下一次 transfer 不会撞上仍在退出的旧任务。取消还有独立宽限期：Worker 若不确认终态，同样会被 terminate。deadline 更强：若正常任务在预算内没有终态，示例直接终止这个单任务 worker，把它视为失去可信进度，池可以创建新实例替换。

`worker.terminate()` 会立即停止整个 worker，不执行应用级 finally。它适合 owner 销毁、崩溃或 deadline 恢复，不是共享 worker/池里取消单项任务的默认手段。

### Worker 自己也要执行背压

<<< ../../../examples/frontend/worker-wasm-architecture/worker-handler.ts

一个 Dedicated Worker 只有一个 JavaScript 事件循环。启动两个 async CPU 函数只会在 yield 点交错，不会变成两个 CPU 核并行。因此 handler 默认只允许一个 active compute task，并对额外任务返回 `busy`；真正并行要使用多个 Worker 实例。

handler 只为当前 active ID 记录取消，避免任意“先取消未知任务”的消息永久堆积。`finally` 删除 active/cancel 状态；重复 ID、非有限结果和内核异常都有稳定响应。

生产 handler 还应设置输入/内存预算、任务 deadline、进度节流、`messageerror`/未捕获 error 观测，并决定纯计算崩溃后是否可重试。包含副作用的任务需要幂等键，不能因 worker 重建盲目执行两次。

### 全局队列决定用户最终看到什么

如果滑块每帧提交一个 100ms 任务，无界队列最终会展示几秒前的结果。队列策略来自产品语义：

- latest-wins：搜索、滤镜预览取消或替换旧任务；
- bounded FIFO：导入任务队列满后拒绝新任务；
- keyed coalescing：同一实体只保留最新版本；
- priority：用户可见交互优先于预取；
- producer throttling：源头降低事件产生速率。

进度也会制造背压。不要循环每一步 postMessage；按时间（如几十毫秒）或进度增量节流，并保证完成/失败终态不被节流丢掉。

### Worker 池是全应用预算

<<< ../../../examples/frontend/worker-wasm-architecture/worker-pool.ts

示例并发映射在第一个失败后停止分配排队项，并用内部 AbortSignal 请求正在运行的任务协作退出。Abort 仍不是强制抢占：`run` 实现必须响应 signal，真正失控的 Worker 由池 terminate 并替换。

不要按 `navigator.hardwareConcurrency` 为每个组件创建同样数量的 Worker。它只是提示，还可能因隐私而被粗化；浏览器已有渲染、网络、解码、GC 和其他页面线程。移动设备会受内存、热量和节能策略影响。

从 1～2 个 worker 测量，建立全应用上限。池还需要：队列容量、idle 回收、worker crash 替换、每任务 deadline、版本隔离和 Wasm 实例内存预算。更多 worker 可能降低吞吐，因为内存带宽、缓存和调度已成为瓶颈。

## 共享生命周期不等于更多计算能力

SharedWorker 和 SharedArrayBuffer 都带“Shared”，但解决完全不同的问题：前者让多个精确同源 context 连接同一个 worker；后者让多个线程读写同一块内存。它们都增加协调复杂度，不应只是为了显得更高性能。

### SharedWorker 适合多标签协调

SharedWorker 通过 `MessagePort` 接受来自相同协议、host、port 的窗口或 iframe。适合多标签共享 WebSocket、协调缓存、限制同时同步数量或选举主 tab。

每个 port 都是不可信客户端：连接后先握手协议版本和 client ID，运行时校验消息，限制速率，在显式离开、`messageerror`、心跳超时和页面消失后清理。使用 `addEventListener('message', ...)` 时记得 `port.start()`。

SharedWorker 存活取决于浏览器和连接 context，不是永久服务器，也不是持久存储。重要状态写入 IndexedDB/服务端，并设计 worker 重启后的重建流程。

fallback 可以是每个 tab 独立连接，或 BroadcastChannel + IndexedDB 协调。核心业务不能因为旧浏览器没有 SharedWorker 就完全不可用。

### SharedArrayBuffer 改变的是正确性模型

普通 postMessage + transfer 强调单一 owner；SharedArrayBuffer 允许多线程同时访问同一内存，于是引入 data race、内存可见性、伪共享、死锁和活锁。普通 TypedArray 读写不能替代同步协议，Atomics 才提供规定的原子操作、等待和通知。

不要在主线程使用阻塞式等待。同步设计应让 Worker 等待/计算，让主线程保持事件循环响应。即使每个字段都原子，也不代表多个字段组成的业务状态具有一致快照；需要明确状态机、版本或 ring buffer 协议。

浏览器向 Worker 暴露 SharedArrayBuffer 通常要求安全上下文和 cross-origin isolation。常见部署基线包括：

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

并用 `crossOriginIsolated` 做运行时确认。COEP 要求跨源子资源通过 CORS/CORP 等方式明确许可；COOP 还会改变 opener/窗口关系，可能影响 OAuth popup、支付和第三方嵌入。隔离是整站部署决策，不是给某个函数加 header。

只有 profile 证明 clone/transfer 仍是瓶颈、团队能维护并发协议、整站资源满足隔离时，才值得引入共享内存。多数业务消息用所有权转移更容易证明正确。

## WebAssembly 优化内核，不替代架构

Wasm 提供紧凑的可移植二进制格式、线性内存和适合编译语言的执行模型。它不会自动创建线程、访问 DOM，也不会让普通业务代码必然更快。宿主通过 imports 明确授予函数、memory 等能力，因此 imports 同样是安全边界。

### 先判断任务是否适合

常见合适场景：编解码、压缩、图像/音频处理、经过审查的密码学实现、仿真、数值计算，以及复用 Rust/C/C++ 库。

常见不合适场景：DOM 密集逻辑、表单状态、频繁字符串/对象操作、很小且只调用一次的函数，以及算法本身仍未优化的代码。

选择时比较四个实现，而不是只比较 JS 与 Wasm：

- 优化后的主线程/分片 JS；
- Dedicated Worker 中的 JS；
- Worker + Wasm；
- 服务端任务（考虑网络、隐私、离线和成本）。

Wasm 可能提高内核吞吐，却不一定改善首次交互：下载、编译、实例化和胶水初始化都进入冷启动预算。

### JS/Wasm 边界要粗粒度

普通 JS 字符串、对象和数组需要编码进线性内存。高频“JS 调一个很小 Wasm 函数，再把一个对象拿回来”会被边界成本吞噬。更好的 API 一次传一批紧凑数据，在 Wasm 内完成一个完整阶段，最后返回索引、统计或小型 TypedArray。

Wasm 线性内存使用 pointer + length。JS 在读取前必须验证二者都是非负安全整数，验证 `pointer + length` 没有溢出且不超过当前 `memory.buffer.byteLength`。不能因为 pointer 来自“自己的模块”就省略边界检查，模块 bug 或不可信输入仍可能产生错误范围。

<<< ../../../examples/frontend/worker-wasm-architecture/wasm-memory-view.ts

`WebAssembly.Memory.grow()` 后应重新读取 `memory.buffer`；对普通线性内存，旧 buffer/view 会失效。示例每次读取当前 buffer，检查范围和单次复制预算后返回 copy，使调用结果不依赖后续 growth。高性能代码也可以返回短生命周期 view，但必须在 API 中明确“下一次 Wasm 调用或 grow 后不可保留”。

allocator、释放、alignment、endianness 和最大 memory 都属于胶水协议。Wasm 内存是 little-endian；跨语言 struct layout 需要固定 ABI，不能依赖某编译器偶然布局。

### 正确加载比盲目 fallback 更重要

<<< ../../../examples/frontend/worker-wasm-architecture/wasm-loader.ts

`WebAssembly.instantiateStreaming()` 可以边下载边编译，服务器应返回 `application/wasm`。示例只在 MIME 不正确或运行时没有 streaming API 时使用 ArrayBuffer fallback；如果 MIME 已正确，编译、link 或 runtime 错误会原样抛出，不会被第二次加载掩盖。

生产环境应修复 MIME，而不是把 fallback 当长期配置。Wasm 文件名使用内容 hash 和 immutable cache，胶水 JS、module 与 worker 协议必须版本匹配。严格 CSP 可能阻止 Wasm 编译，需要按目标策略配置并验证，不要为解决一个模块而放宽所有脚本来源。

加载 URL 应来自构建产物或明确 allowlist。第三方 Wasm 与第三方 JS 一样属于供应链代码：固定版本、审查 imports/exports、及时更新并限制输入。

### CPU 密集 Wasm 通常仍应放 Worker

Wasm 在主线程执行同样会阻塞输入与渲染。CPU 内核通常在 Dedicated Worker 中加载和实例化。可以比较两种策略：主线程 `compileStreaming()` 后把可克隆的 `WebAssembly.Module` 发给 worker；或每个 worker 自行加载并依赖 HTTP cache。哪种更快取决于浏览器、池大小和冷启动，必须测量。

Wasm 也不是处理不可信文件的完美安全沙箱：模块可能死循环、耗尽 linear memory、触发逻辑漏洞，imports 还可能把宿主能力暴露进去。放入可 terminate 的 Worker、限制输入/内存/时间，并把高风险解析与主 UI 隔离。

多线程 Wasm 通常依赖 shared memory、Atomics 和 cross-origin isolation，叠加构建与调试复杂度。单 Worker Wasm 已达目标时，不要为了“用满核心”升级到共享内存。

## 用端到端证据守住生产计算系统

一套计算方案只有在真实数据、真实构建和目标设备上同时改善用户体验、没有突破内存与能耗预算，并能从崩溃和取消中恢复，才算成功。

### 峰值内存不等于输入文件大小

任务执行时可能同时存在：

```text
主线程原始数据
+ clone 副本或待转移 buffer
+ Worker 中间数据
+ Wasm linear memory/allocator 预留
+ 输出
+ 主线程渲染副本
+ 队列中尚未开始的任务
```

一个 80MB 输入很容易产生数倍峰值。使用分块/流式处理、transfer、复用有上限的 buffer 和有界队列；不要池化无限大 buffer。页面隐藏、任务结束和 worker idle 时按策略释放引用/terminate，并在低内存设备上测试恢复。

### 错误码决定是否可以重试

至少区分：worker-load、message-clone、invalid-input、busy、timeout、cancelled、out-of-memory、worker-crash、wasm-fetch、compile、link 和 runtime。

纯计算且输入仍可重建时可以有限重试；已经 transfer 的唯一 buffer、产生外部副作用或未知部分完成状态时，不能盲目重放。Worker crash 后重建实例，Wasm 加载失败可以降级 JS/服务端，UI 不应永久停在 spinner。

内部 stack、用户数据和 pointer 不作为跨边界稳定错误。日志用 request/correlation ID 连接客户端、worker 和服务端，但遵守数据最小化。

### 测试协议、所有权和真实运行时

纯逻辑、协议和并发映射测试：

<<< ../../../examples/frontend/worker-wasm-architecture/worker-logic.test.mts

真实 detachment、客户端生命周期、handler 背压/取消与 Wasm memory growth 测试：

<<< ../../../examples/frontend/worker-wasm-architecture/worker-runtime.test.ts

还需要覆盖：

- `DataCloneError` 与 `messageerror`；
- Abort、deadline、迟到响应和重复 ID；
- latest-wins/有界队列的顺序；
- worker error、脚本加载失败、dispose 与池替换；
- SharedWorker 多 port、断线和旧浏览器 fallback；
- COOP/COEP、CORS/CORP、OAuth popup 与第三方资源；
- Wasm 错误 MIME、CSP、compile/link/runtime failure；
- pointer/length 越界、memory grow 和 OOM；
- 页面隐藏、bfcache、路由离开和账号切换。

单元 mock 不能证明真实 structured clone、transfer detach、module worker 路径、CSP 或 cross-origin isolation。E2E 必须运行生产构建，并包含低端移动设备或等效 CPU/内存限制。

### 性能实验比较完整方案

至少比较：优化主线程、分片 JS、单 Worker、Worker 池、Worker+Wasm。记录：

- 用户可见总时延与结果新鲜度；
- 主线程 Long Task、INP 和帧稳定性；
- Worker 启动、Wasm 下载/编译/实例化；
- clone/transfer 往返成本；
- 吞吐和队列等待；
- Abort 到终态的 P95；
- 峰值内存、GC、设备温度/能耗；
- crash、timeout 与降级率。

冷启动与预热稳态分开。开发模式、DevTools 和 microbenchmark 会改变 JIT/调度，不应成为上线证据。使用真实数据分布和设备分位数，并确认更快内核没有让主线程结果合并变得更慢。

### 框架只保存任务投影

Worker service 拥有实例、pending/in-flight、队列和 dispose；Pinia/Redux 只保存 task ID、阶段、进度、可序列化结果和错误码。Vue composable/React hook 不应每次 render 创建 Worker。

路由离开时按任务语义决定 Abort、继续后台运行或提升到应用级队列。SSR 没有 Worker/Wasm 浏览器环境，客户端动态初始化并提供稳定占位。worker crash 后 store 要进入明确失败/恢复状态，而不是保持旧的 `running`。

### 安全与供应链基线

- Worker/Wasm URL 静态可审计并受 CSP 约束；
- 双向消息 runtime 校验，输入、输出、CPU、内存和队列都有上限；
- Wasm imports 只提供必要宿主能力；
- 第三方 module 固定版本、验证来源并及时更新；
- COOP/COEP 变更经过 popup、嵌入和资源兼容审计；
- 日志不记录原始敏感计算数据；
- 用户输入不能触发无上限 CPU/内存拒绝服务；
- 线程池、Wasm module 和 buffer 预算由应用统一治理。

### 常见失败模式及原因

#### 每次点击都创建 Worker

启动、模块加载和内存反复发生，事件 listener 还容易泄漏。由 service 复用或按 idle 策略回收。

#### 小任务的消息成本高于计算

只测 Worker 内核会得到虚假结论。比较完整端到端路径。

#### transfer 后继续读取原 buffer

所有权已经移动，发送端 view 被 detach。用方法名、类型和代码评审标明 owner。

#### 取消消息无法打断同步死循环

Worker 没有机会处理 cancel。内核分块检查，失控时 owner terminate。

#### 无界队列显示陈旧结果

吞吐跟不上生产速度。使用 latest-wins、合并、优先级或拒绝。

#### 同一个 Worker 里启动多个 async 计算

它们只在一个事件循环交错，不会并行，还会争抢取消和内存。一个计算槽对应一个 Worker；并行由池提供。

#### 每个组件按核数建池

全应用过度订阅，内存和调度抖动。池与硬件提示都由统一预算控制。

#### SharedWorker 当永久存储

最后一个 context 消失或浏览器回收后内存丢失。使用 IndexedDB/服务端并支持重建。

#### SharedArrayBuffer 没有同步协议

共享不代表一致。用 Atomics、状态机和边界证明正确，或回到消息所有权。

#### Wasm 高频跨边界

编码、allocator 和调用开销抵消内核收益。批量化完整阶段。

#### MIME/CSP 错误被 fallback 吞掉

生产配置长期错误，真正编译异常也被误判。正确 MIME 时直接暴露真实错误。

### 渐进落地路线

第一阶段 profile、减少工作并优化算法；需要响应性但不需要并行时先采用主线程分片。

第二阶段用一个 Dedicated Worker 拆出最重的纯计算：版本协议、双向校验、transfer 所有权、协作取消、deadline、本地背压和 dispose 同时落地。

第三阶段根据数据选择池化或 Wasm，并建立全应用 worker/内存预算。SharedWorker 仅用于确有多标签协调的场景；只有复制明确成为瓶颈且部署兼容时才引入 SharedArrayBuffer/多线程 Wasm。

### 上线检查清单

- [ ] profile 与真实用户指标证明主线程问题和迁移价值；
- [ ] 已先评估减少工作、算法、增量和分片；
- [ ] 请求与响应版本化、runtime 校验且有长度/数值上限；
- [ ] clone/transfer 选择、buffer owner 和失败后的数据命运明确；
- [ ] Abort 有协作 yield，deadline 能终止失控 Worker；
- [ ] 单 worker 计算槽、全局队列和池并发都有界；
- [ ] 进度节流且终态不会丢失；
- [ ] SharedWorker 有精确同源协议、port 清理、持久化与 fallback；
- [ ] SharedArrayBuffer 的隔离头、子资源和并发状态机已验证；
- [ ] Wasm MIME、CSP、缓存、胶水/协议版本与 fallback 正确；
- [ ] pointer/length 验证，memory grow 后不复用旧 view；
- [ ] 峰值内存包含主线程、Worker、Wasm、输出和队列副本；
- [ ] crash、messageerror、OOM、编译失败和旧浏览器可恢复；
- [ ] 生产构建与低端设备的时延、取消、内存和能耗达标。

## 总结

前端计算架构的目标不是“使用更多线程”，而是让主线程响应、总时延、吞吐、内存和复杂度处于可证明预算内：

- 先减少工作和改善算法，再决定分片或并行；
- Worker 是另一个事件循环，任务要通过版本化协议和所有权模型交付；
- clone、transfer、队列和 UI 合并都属于端到端成本；
- Abort 依赖协作 yield，deadline/崩溃由 owner terminate 和替换；
- 一个 Worker 的多个 async 计算不会多核并行，池必须是全应用有界资源；
- SharedWorker 解决多 context 协调，SharedArrayBuffer 则引入真正并发正确性问题；
- Wasm 优化适合的粗粒度内核，不替代 Worker、边界检查和故障治理；
- 最终选型由真实构建、真实数据和真实设备证明，并始终保留降级路径。

下一节：[前端身份认证、会话、Token 与授权架构](./frontend-authentication-session-token-and-authorization-architecture.md)，会从计算边界转向身份边界，系统处理 Cookie、Token、刷新、CSRF、XSS 与前端授权状态。

## 参考资料

- [MDN：Using Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)
- [MDN：Structured clone algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)
- [MDN：Transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)
- [MDN：SharedWorker](https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker)
- [MDN：SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)
- [MDN：WebAssembly.instantiateStreaming](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/instantiateStreaming_static)
- [MDN：WebAssembly.Memory](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Memory)
- [MDN：Using the WebAssembly JavaScript API](https://developer.mozilla.org/en-US/docs/WebAssembly/Guides/Using_the_JavaScript_API)
- [WebAssembly Specification](https://webassembly.github.io/spec/)
