---
title: Web Worker、SharedWorker、WebAssembly 与前端计算架构
description: 系统掌握主线程预算、Worker 协议、结构化克隆、Transferable、取消、线程池、共享内存、Wasm 边界、性能与生产治理
---

# Web Worker、SharedWorker、WebAssembly 与前端计算架构

把函数移进 Worker 不会自动更快：启动、消息克隆、序列化、排队和结果合并都有成本。WebAssembly 也不是“比 JavaScript 快”的按钮；它擅长可编译、计算密集且数据边界稳定的工作，却可能被 JS/Wasm 频繁调用和内存复制抵消收益。

本课从主线程响应预算出发，建立可取消、可背压、可降级和可测量的前端计算系统。

## 学习目标

- 区分 DedicatedWorker、SharedWorker、Service Worker 与 Worklet；
- 设计版本化任务协议和结构化错误；
- 理解结构化克隆、Transferable 和所有权转移；
- 实现取消、有限并发、背压、超时与资源清理；
- 理解 SharedArrayBuffer、Atomics 与跨源隔离；
- 选择 JS、Worker、Wasm、服务端计算的正确边界；
- 正确加载、缓存、测量和发布 Wasm；
- 建立真实设备测试、内存预算和故障治理。

## 一、先判断为什么主线程卡

主线程同时承担输入、JavaScript、样式、布局、绘制和部分浏览器回调。一个 200ms 同步循环不仅“计算慢”，还让点击、滚动和渲染无法及时处理。

先用 Performance 面板、Long Tasks、真实用户 INP 和 CPU profile 找到工作，而不是看到数组大就创建 Worker。常见原因包括算法复杂度、重复计算、巨大 JSON 解析、同步布局、第三方脚本和一次处理过多数据。

优化顺序通常是：减少工作 → 改善算法/数据结构 → 分块让出主线程 → Worker 并行 → Wasm/服务端。Worker 不会修复 O(n²)。

## 二、四类后台执行原语

| 原语 | 共享范围 | 适合工作 |
| --- | --- | --- |
| Dedicated Worker | 一个创建者 | 搜索、解析、图片、计算任务 |
| SharedWorker | 同源多个 browsing context | 多标签共享连接/协调 |
| Service Worker | origin/scope 事件驱动 | 网络代理、Push、后台同步 |
| Worklet | 特定渲染/音频流水线 | Audio/Paint 等受限实时处理 |

Service Worker 会被随时终止，不是通用 CPU worker。SharedWorker 现在已进入较新的 Baseline，但旧设备仍需能力检测和 fallback；它的存活时间也由浏览器决定，不能作为永久服务器。

## 三、Worker 没有 DOM

Worker 有独立全局环境和事件循环，不能读取 document、操作组件或直接复用依赖 DOM 的模块。UI 状态留在主线程；Worker 接收纯数据并返回纯结果。

创建 module worker 通常使用构建工具可分析的静态 URL：

```ts
new Worker(new URL('./compute.worker.ts', import.meta.url), { type: 'module' })
```

不要让用户输入决定 Worker script URL。Worker 构造属于代码加载入口，应受同源、CSP、Trusted Types 和供应链控制。

## 四、消息协议先于业务实现

<<< ../../../examples/frontend/worker-wasm-architecture/task-protocol.ts

协议包含版本、request ID、有限任务类型和输入上限。不要 postMessage 任意函数或 class instance：结构化克隆不支持函数和 DOM 节点，也不会保留自定义 prototype、getter 和属性描述符语义。

响应要区分 invalid、cancelled、failed，不能把 Worker 内部 Error 对象和堆栈直接当跨边界稳定协议。协议升级遵循 API 兼容原则。

## 五、结构化克隆不是免费

postMessage 默认通过结构化克隆复制可克隆数据。大数组双向复制会占用时间和峰值内存；深对象还会增加遍历成本。

测量端到端：排队、克隆、执行、返回和 UI 应用，而不只测 Worker 内核。一个 2ms 计算配 10ms 消息成本不值得迁移。

尽量发送紧凑 typed array、索引和增量，而不是完整响应式 store。批量消息减少固定开销，但批次太大又增加延迟，需要按体验目标调节。

## 六、Transferable 是所有权移动

ArrayBuffer、MessagePort、ImageBitmap 等可转移对象可以转移底层资源而不是复制。示例 client 发送 Float64Array 时转移其 buffer：

<<< ../../../examples/frontend/worker-wasm-architecture/worker-client.ts

转移后发送端 buffer 会 detach，不能继续读取。代码评审必须明确 owner：调用 `sum(values)` 后，调用方已放弃 values。如果 UI 仍需要数据，应保留另一份、改变协议或接受复制成本。

transfer list 中的资源也必须出现在消息对象中，否则可能被 detach 却无法在接收端取得。

## 七、取消必须协作

主线程 AbortSignal 不能神奇中断 Worker 中正在运行的同步循环。取消消息只有在 Worker 事件循环重新取得控制权后才能处理。

<<< ../../../examples/frontend/worker-wasm-architecture/cooperative-sum.ts

示例分块、检查 cancel flag，并通过定时任务让出 worker event loop。chunk 太大导致取消迟钝；太小增加调度开销。生产中按目标取消延迟和设备性能测量。

`worker.terminate()` 是强制终止整个 worker，会丢掉所有进行中任务和内存状态，适合销毁或失控恢复，不是共享池中取消单任务的默认方式。

## 八、Worker handler 的生命周期

<<< ../../../examples/frontend/worker-wasm-architecture/worker-handler.ts

handler 先做 runtime schema，再执行任务；finally 清除取消记录。真实系统还需：

- 每任务 deadline 与内存/输入上限；
- 未捕获 error、messageerror 观测；
- 恶意/损坏输入不会让 worker 永久崩溃；
- worker 崩溃后决定重建、重试还是失败；
- 有副作用任务使用幂等键。

## 九、队列与背压

如果用户拖动滑块每帧提交任务，而 Worker 每个任务需 100ms，队列会不断增长，最终显示几秒前结果。

策略包括：

- latest-wins：搜索、预览取消旧任务；
- bounded FIFO：队列满后拒绝或合并；
- priority：用户交互优先于预取；
- keyed coalescing：同实体只保留最新任务；
- producer throttling：上游降低生成速率。

进度消息也要节流，例如每 50ms 或每完成一定比例发送，而不是循环每步 postMessage。

## 十、Worker 池不是按核数全开

<<< ../../../examples/frontend/worker-wasm-architecture/worker-pool.ts

示例展示有限并发和结果顺序。浏览器已有渲染、网络、解码和其他线程；`navigator.hardwareConcurrency` 只是提示，移动设备、节能模式和热限制都会变化。

从 1～2 个 worker 测量，设置全应用预算。多个组件各建 `hardwareConcurrency` 个 worker 会导致过度订阅、内存膨胀和调度抖动。

池需要 idle 回收、崩溃替换、队列上限、任务超时和版本隔离。不同 Wasm module 的实例/内存成本也要纳入 worker 数量。

## 十一、SharedWorker 的正确用途

SharedWorker 通过 MessagePort 连接同源多个窗口/iframe，适合多标签共享 WebSocket、协调缓存或主节点选举。

每个 port 都是不可信客户端：握手版本、分配 client ID、验证消息、在 messageerror/close/心跳超时清理。SharedWorker 内存仍不是持久存储，浏览器可在无客户端或策略需要时终止它。

能力不可用时可退化为每 tab 独立连接，或用 BroadcastChannel + IndexedDB 协调。不要为了节省一个连接让核心功能依赖新平台能力。

## 十二、共享内存改变并发模型

SharedArrayBuffer 允许多个线程访问同一内存，避免复制，但引入 data race、可见性和死锁。Atomics 提供原子读写、等待与通知；普通读写不能代替同步协议。

浏览器中使用 SharedArrayBuffer 通常要求页面 cross-origin isolated，部署 COOP/COEP 等响应头，并确保所有子资源满足 CORS/CORP。引入隔离会影响 popup、OAuth 和跨源资源，必须在预发布验证整站。

只在复制确实是瓶颈且团队能维护并发协议时采用。消息传递的所有权模型通常更容易证明正确。

## 十三、WebAssembly 适合什么

适合：编解码、压缩、图像/音频、密码学实现、仿真、数值计算，以及复用 Rust/C/C++ 库。未必适合：DOM 密集业务、频繁字符串/对象操作、小函数调用和普通表单逻辑。

Wasm 提供接近底层的线性内存和可预测计算，不自动拥有 DOM/文件/网络权限。它的 imports 是宿主授予的能力，仍需最小化。

## 十四、JS/Wasm 边界成本

字符串、对象和数组通常需要编码进线性内存；频繁跨边界调用会抵消内核收益。设计粗粒度 API：一次传一批数据，在 Wasm 内完成完整阶段，再返回紧凑结果。

管理 allocator、指针、长度和释放；memory.grow 后旧 TypedArray view 可能引用旧 buffer，应重新创建。任何来自 Wasm 的 pointer/length 在 JS 读取前验证边界。

Wasm 不是安全处理不可信媒体的万能沙箱：模块自身仍可能有逻辑/内存缺陷并耗尽 CPU/内存，应放 Worker、限制输入并可 terminate。

## 十五、流式加载与 MIME

<<< ../../../examples/frontend/worker-wasm-architecture/wasm-loader.ts

`instantiateStreaming(fetch(...))` 可边下载边编译，是首选路径。服务器应返回 `application/wasm`；示例只在 MIME 不正确时回退 arrayBuffer，避免把真实编译错误错误地重试为另一条路径。

Wasm 文件使用内容 hash、长期 immutable cache；胶水 JS 与 Wasm 必须版本匹配。CSP 可能限制 Wasm 编译，部署头要在真实环境测试，不要通过放宽所有 script 来源解决。

## 十六、Wasm 与 Worker 组合

CPU 密集 Wasm 通常放 Dedicated Worker，避免主线程编译和执行阻塞。可先 fetch/compile WebAssembly.Module，再在支持结构化克隆的环境发给 worker 实例化，或让各 worker 自行加载并依赖 HTTP cache；用测量选择。

多线程 Wasm 依赖 shared memory、Atomics 和 cross-origin isolation，并增加构建、部署和调试复杂度。单 Worker Wasm 已满足目标时不要过早引入线程版。

## 十七、内存与资源预算

计算系统峰值可能同时包含：主线程原数据、clone 副本、Worker 数据、Wasm linear memory、输出和渲染副本。只看文件大小会低估内存。

使用分块/流式处理、transfer、复用 buffer 和有界队列。不要池化无限大 buffer；页面隐藏或任务结束释放引用，空闲 worker 按策略 terminate。

## 十八、错误与恢复

区分 worker-load、message-clone、invalid-input、timeout、cancelled、out-of-memory、wasm-compile/link/runtime 和 worker-crash。错误码稳定，内部细节只进受控日志。

Worker 崩溃后只自动重试纯计算；有副作用任务先确认幂等。Wasm 加载失败可降级 JS/服务端实现，UI 说明能力受限，不保持永久 spinner。

## 十九、测试策略

纯逻辑和并发顺序测试：

<<< ../../../examples/frontend/worker-wasm-architecture/worker-logic.test.mts

还需测试 transfer 后发送端 detach、DataCloneError、取消响应、队列上限、乱序、worker crash、dispose、错误 Wasm MIME、编译失败和内存增长。

E2E 使用真实 module worker 与构建产物，覆盖 CSP、跨源隔离、旧浏览器 fallback 和低端移动设备。单元测试 mock Worker 不能验证真实克隆/transfer 语义。

## 二十、性能测量

比较基线主线程、分块 JS、单 Worker、Worker 池、Worker+Wasm，记录：总时延、主线程阻塞、INP、启动/编译、消息成本、吞吐、取消延迟、内存和能耗。

预热和稳态分开；开发模式、DevTools 和首次 Wasm 编译会影响结果。用真实数据分布和设备分位数，不只在高端桌面跑 microbenchmark。

## 二十一、框架集成

Worker client/service 拥有实例、pending map 与 dispose；Pinia/Redux 只保存 task ID、阶段、进度和结果。Vue composable/React hook 不应每次 render 创建 Worker。

路由离开按任务语义取消或提升到应用级队列。SSR 环境没有 Worker，动态初始化必须在客户端并提供一致占位。

## 二十二、安全与供应链

- Worker/Wasm URL 静态可审计并受 CSP 约束；
- 消息双向 runtime 校验并限制大小；
- Wasm imports 只给必要能力；
- 第三方 module 固定版本、验证来源并及时更新；
- COOP/COEP 改动经过 OAuth/popup/资源兼容审计；
- 不在日志记录原始敏感计算数据；
- 防止用户输入触发无上限 CPU/内存拒绝服务。

## 二十三、常见失败模式

1. 每次点击新建 Worker；2. 小任务克隆成本大于计算；3. transfer 后继续读原 buffer；4. 取消消息无法打断同步死循环；5. 无界队列显示陈旧结果；6. 按 CPU 核数为每组件建池；7. SharedWorker 当永久存储；8. SharedArrayBuffer 无同步协议；9. Wasm 高频跨边界；10. MIME/CSP 错误被吞掉；11. 只测 Worker 内核不测端到端；12. 没有 JS/服务端降级。

## 二十四、渐进落地路线

先 profile 并优化算法；再以单 Dedicated Worker、版本协议、transfer、取消和有界队列拆出最重纯计算；随后依据数据决定池化或 Wasm；只有复制成为明确瓶颈且部署允许时再引入 shared memory/多线程。

## 二十五、上线检查清单

- [ ] 有 profile/真实指标证明迁移价值；
- [ ] 协议版本化、runtime 校验且输入有上限；
- [ ] clone/transfer 所有权和峰值内存明确；
- [ ] 任务支持取消、超时、背压和 dispose；
- [ ] Worker 数量属于全应用预算；
- [ ] SharedWorker 有兼容 fallback 和持久化边界；
- [ ] SharedArrayBuffer 的隔离头和并发协议已验证；
- [ ] Wasm MIME、CSP、缓存、胶水版本和 fallback 正确；
- [ ] JS/Wasm 调用批量化，内存增长后 view 会更新；
- [ ] 崩溃、OOM、编译失败和旧浏览器可恢复；
- [ ] 低端设备的时延、内存、能耗和取消均达标。

## 总结

前端计算架构的目标不是使用更多线程，而是在主线程响应、吞吐、内存和复杂度之间建立可证明的预算。Worker 提供隔离事件循环，消息协议提供所有权和背压，Wasm 提供适合特定内核的执行模型，共享内存则以更高正确性成本换取更少复制。每一层都应由端到端测量驱动，并保留简单可靠的降级路径。

## 参考资料

- [MDN：Using Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)
- [MDN：Structured clone algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)
- [MDN：Transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)
- [MDN：SharedWorker](https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker)
- [MDN：SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)
- [MDN：WebAssembly.instantiateStreaming](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/instantiateStreaming_static)
- [MDN：Using the WebAssembly JavaScript API](https://developer.mozilla.org/en-US/docs/WebAssembly/Guides/Using_the_JavaScript_API)
- [WebAssembly Specification](https://webassembly.github.io/spec/)
