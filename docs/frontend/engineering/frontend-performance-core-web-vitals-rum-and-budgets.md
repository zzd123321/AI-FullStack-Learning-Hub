---
title: 前端性能工程：Core Web Vitals、RUM 与持续性能预算
description: 从真实用户指标和浏览器流水线出发，系统诊断 LCP、INP、CLS、资源加载、主线程、内存与构建体积，并在 CI 建立性能预算
---

# 前端性能工程：Core Web Vitals、RUM 与持续性能预算

前端性能优化最容易陷入两个误区：凭感觉改代码，或者只追求某次 Lighthouse 的绿色分数。真正的性能工程需要形成闭环：

```text
定义用户体验目标
  → 在真实用户环境测量
  → 按阶段归因瓶颈
  → 实施针对性改动
  → 用实验室测试快速验证
  → 用真实用户数据确认收益
  → 用预算阻止回退
```

本节不会重复浏览器专题里已经详讲的事件循环、布局抖动和 Worker 基础，而会把这些原理放进一套生产治理体系：如何区分现场数据和实验室数据，如何拆解 LCP、INP、CLS，如何安全采集 RUM，如何分析 Vite 产物，以及如何把性能要求变成持续执行的 CI 门禁。

> 指标和浏览器 API 会演进。本节以当前稳定的 Core Web Vitals 定义和官方 `web-vitals` attribution build 为基线；具体依赖版本仍应由项目锁文件与官方迁移指南确定。

## 一、性能不是单一数字，而是用户任务的时间成本

“页面打开快”至少包含不同阶段：

- 用户是否很快看见主要内容；
- 页面出现后是否真的能响应输入；
- 点击后多久出现下一帧视觉反馈；
- 内容加载过程中是否意外移动；
- 长时间使用后是否因内存增长越来越慢；
- 弱网、低端手机、后台恢复和长会话是否仍可用。

同一页面可能 LCP 很好，却在启动时执行大量 JavaScript，用户点击按钮后几百毫秒没有反馈；也可能实验室首屏很快，但真实用户因为 CDN 区域、登录态和个性化内容而变慢。

性能目标应围绕关键用户任务建立，例如：

| 用户任务 | 体验信号 | 技术指标 |
| --- | --- | --- |
| 打开课程页 | 主要内容尽快出现 | LCP、TTFB、资源瀑布 |
| 点击立即报名 | 很快看见 Pending/成功 | INP、Event Timing、LoAF |
| 阅读内容 | 页面不突然跳动 | CLS、Layout Shift attribution |
| 打开编辑器 | 功能按需可用 | Route Chunk、执行时间、内存 |
| 长时间学习 | 不逐渐卡顿或崩溃 | Heap 趋势、Listener、Cache 上限 |

技术指标服务于任务，而不是替代任务。

## 二、先区分现场数据与实验室数据

### 2.1 现场数据：真实用户监控 RUM

Real User Monitoring 采集真实访问中的设备、网络、缓存、登录状态和交互结果。它能回答：

- 第 75 百分位用户是否达到目标；
- 哪个路由、设备或版本变慢；
- 低端设备和弱网是否被平均值掩盖；
- 优化上线后真实分布是否改善；
- 长会话中的最慢交互是什么。

代价是数据有噪声、需要足够样本，并且必须治理隐私、采样、上报失败与版本维度。

### 2.2 实验室数据：受控环境中的合成测试

Lighthouse、DevTools Performance Trace 和 CI 浏览器运行适合：

- 在提交阶段快速发现回退；
- 用固定设备与网络条件做前后对比；
- 查看主线程、网络瀑布和渲染阶段；
- 在真实流量出现前验证假设；
- 定位具体函数与资源。

但它只代表某个固定场景。单次冷启动无法覆盖真实缓存、全部交互、后台恢复和长会话。

### 2.3 两者不是竞争关系

```text
RUM / CrUX：哪里、多少用户、问题有多严重？
                   ↓
DevTools / Trace：具体时间花在哪个阶段？
                   ↓
本地与 CI：改动是否改善，并且不会明显回退？
                   ↓
RUM：上线后真实分布是否确认收益？
```

只看 RUM 难以快速定位，只看实验室可能优化了一个不存在于真实用户中的场景。

## 三、Core Web Vitals 的当前基线

当前三项稳定 Core Web Vitals 是：

| 指标 | 体验维度 | 良好 | 需改进 | 较差 |
| --- | --- | ---: | ---: | ---: |
| LCP | 加载与主要内容呈现 | `≤ 2.5s` | `2.5s–4.0s` | `> 4.0s` |
| INP | 整次访问的交互响应 | `≤ 200ms` | `200ms–500ms` | `> 500ms` |
| CLS | 视觉稳定性 | `≤ 0.1` | `0.1–0.25` | `> 0.25` |

页面或站点的判断使用真实访问分布的第 75 百分位。换句话说，至少 75% 的访问应达到“良好”阈值。平均值可能把一批体验极差的用户隐藏起来，因此不能代替 p75。

还要按设备、国家/网络、路由模板、应用版本等维度分组。把桌面和低端移动设备混成一个总体数字，通常无法产生可执行结论。

## 四、LCP：主要内容什么时候真正呈现

Largest Contentful Paint 关注视口中最大候选文本块或图像何时绘制。它不是“所有资源加载完成”，也不是 DOMContentLoaded。

### 4.1 把 LCP 拆成四段

对包含外部资源的 LCP 元素，可以用以下模型定位：

```text
LCP = TTFB
    + Resource Load Delay
    + Resource Load Duration
    + Element Render Delay
```

| 子阶段 | 含义 | 常见瓶颈 |
| --- | --- | --- |
| TTFB | 导航到收到 HTML 首字节 | 服务端、CDN、重定向、连接 |
| 资源发现延迟 | HTML 首字节后多久开始请求 LCP 资源 | JS 动态插入、CSS 背景、错误 lazy-load |
| 资源下载 | LCP 资源传输耗时 | 图片过大、远端连接、缓存策略 |
| 元素渲染延迟 | 资源完成到元素绘制 | 阻塞 CSS、字体、主线程、客户端渲染 |

只有先判断哪一段长，优化才有方向。若图片请求很早且下载只需 80ms，继续压缩几 KB 不会解决 1.5s 的渲染延迟。

### 4.2 让 LCP 资源尽早可发现

理想情况下，首屏图像的 `src` / `srcset` 出现在初始 HTML 中，让浏览器 preload scanner 在 JavaScript 执行前就能发现。

以下做法会推迟发现：

- 等客户端 JavaScript 运行后才创建 `<img>`；
- 把真实 URL 藏在 `data-src`；
- 把关键图像只放进较晚解析的 CSS background；
- LCP 图像错误使用 `loading="lazy"`；
- 客户端先请求 JSON，再从 JSON 得知图片 URL。

SSR/SSG 的价值之一，就是让关键内容和资源引用出现在初始 HTML，而不只是“服务器生成了一些标签”。

### 4.3 preload 与高优先级必须克制

关键加载页面示例：

<<< ../../../examples/frontend/performance-engineering/critical-loading.html

几个关键点：

- `preconnect` 只给首屏必需的少量跨源连接；
- responsive image 的 preload 与最终 `srcset`、`sizes` 保持一致；
- LCP 候选可使用 `fetchpriority="high"`，但不要给许多资源都设高优先级；
- 首屏 LCP 图像不 lazy-load；
- 非首屏图像才使用 `loading="lazy"`；
- `width` 和 `height` 建立固有宽高比，减少布局偏移。

preload 是“无论如何都尽早下载”的强提示。误 preload 不会免费：它会抢占连接、带宽和内存，甚至下载当前设备根本不会使用的资源。

### 4.4 图片优化不是只换格式

完整策略包括：

- 根据实际显示尺寸生成多个候选；
- 使用 `srcset`/`sizes` 让浏览器选择；
- 选择适合内容的 AVIF、WebP、JPEG、PNG 或 SVG；
- CDN 缓存与不可变 URL；
- 避免解码超大像素图后再用 CSS 缩小；
- 首屏与非首屏采用不同优先级；
- 测量压缩质量对业务内容的影响。

传输字节、解码成本和视觉质量必须一起权衡。

## 五、INP：从输入到下一次绘制的完整响应

Interaction to Next Paint 观察点击、触摸和键盘等交互，从用户输入到浏览器呈现下一帧反馈的延迟。它关注整次页面访问中的交互，不只看第一次输入。

交互可以拆成：

```text
INP candidate = Input Delay
              + Processing Duration
              + Presentation Delay
```

### 5.1 Input Delay：事件处理器为什么还没开始

输入发生时，主线程可能正在：

- 解析、编译、执行启动 JavaScript；
- 运行第三方脚本；
- 处理 Timer 或轮询；
- 序列化大型对象；
- 执行另一个长任务。

此时即使当前按钮的 Handler 只有 3ms，用户仍要等待前面的工作完成。优化方向是减少主线程总工作、延后非关键脚本、拆分长任务，而不只是重写 Click Handler。

### 5.2 Processing Duration：Handler 实际做了多少同步工作

交互处理器应该优先做产生即时反馈所需的最少工作：

```text
点击
  → 立即更新 Pending / 乐观反馈
  → 让浏览器有机会绘制
  → 后续校验、统计、非关键计算分阶段执行
```

需要注意：

- `await Promise.resolve()` 只进入 Microtask，通常不会产生绘制机会；
- 递归 Microtask 可能饿死渲染；
- 大数组过滤、Markdown 解析等 CPU 工作应拆分或移入 Worker；
- 同步 Storage、JSON 序列化和第三方 SDK 也会计入处理时间；
- Debounce 适合减少高频非即时工作，但不能让按钮反馈延迟到 debounce 结束。

长任务拆分与 `scheduler.yield()` 的兼容策略已在“事件循环、渲染流水线与长任务诊断”中详细讲解。

### 5.3 Presentation Delay：Handler 返回后为什么还没画出来

Handler 结束并不等于像素已经出现。浏览器还可能需要：

- Vue/React 批量更新和生成 DOM 变更；
- Style Recalculation；
- Layout；
- Paint 与 Composite；
- 等待被前序 Microtask 占用的渲染机会。

大型 DOM、一次更新过多组件、复杂 CSS、同步布局读取和大量节点创建都会增加 presentation delay。此时只优化 Handler 的 JavaScript 算法不够。

### 5.4 INP 不是“最慢按钮的平均时间”

INP 会从访问期间的多个交互中选择具有代表性的高延迟值；交互非常多时会对极端值做相应处理。它不是所有交互的平均，也不是 FID 的新名字。

生产诊断必须记录交互类型和三段 attribution，才能判断应该处理输入前的长任务、Handler，还是渲染阶段。

## 六、CLS：意外位移，而不是所有动画

Cumulative Layout Shift 衡量页面生命周期中意外布局位移的累计影响。它是无单位分数，不是毫秒。

常见原因：

- 图片、视频、iframe 没有预留尺寸；
- 广告或推荐位加载后插入已有内容上方；
- Web Font 替换造成文字尺寸变化；
- 异步 Banner 在页面顶部突然出现；
- Hydration 前后 DOM 或样式不一致；
- Skeleton 与真实内容尺寸差异很大。

### 6.1 用户预期内变化与意外变化

用户点击“展开详情”后紧接发生的布局变化，和页面无操作时突然插入广告并不相同。Layout Shift API 会用近期用户输入等信息帮助排除一部分预期变化。

但不要依赖“有点击就随便跳”。如果异步结果在点击很久后才插入，仍可能产生位移。更可靠的是提前预留容器空间或在不推动现有内容的位置呈现。

### 6.2 transform 动画通常比布局属性更合适

动画 `transform` 和 `opacity` 通常不改变文档流，能避免布局位移并更容易由合成器处理。动画 `top`、`left`、`width`、`height` 可能触发布局和绘制。

这不是要求给所有元素加 `will-change`。长期创建大量合成层会消耗内存和栅格资源；只有测量证明需要时，才在动画前后有生命周期地使用。

### 6.3 CLS 是长生命周期指标

SPA 首次渲染之后的路由、懒加载和无限滚动仍可能贡献 CLS。只测一次初始加载的实验室报告，无法覆盖用户停留十分钟后的变化，这正是 RUM 不可替代的原因。

## 七、其他指标是诊断信号，不是次要分数

| 指标 | 用途 | 与 Core Web Vitals 的关系 |
| --- | --- | --- |
| TTFB | 文档首字节、服务端与连接 | LCP 的前置阶段 |
| FCP | 首次任意内容绘制 | 判断白屏，但不代表主要内容 |
| TBT | 实验室主线程阻塞总量 | 常作为 INP 风险代理，不是 INP |
| Speed Index | 视觉填充速度 | 合成实验室信号 |
| Resource Timing | 单资源网络阶段与字节 | 定位图片、脚本、接口 |
| User Timing | 应用自定义操作 | 对齐业务阶段 |
| Long Task / LoAF | 主线程与渲染阻塞 | 归因 INP、动画卡顿 |

Lighthouse 不能在一次固定导航里代表真实用户整次访问的 INP，因此 CI 示例使用 TBT 作为启动阻塞报警，同时靠 RUM 评估 INP。不能把 TBT 和 INP 数值直接互换。

## 八、RUM：安全采集真实 Core Web Vitals

### 8.1 为什么优先使用官方 `web-vitals` 库

自己从 PerformanceObserver 拼 LCP、INP、CLS 容易遗漏：

- 页面进入后台时如何结算；
- bfcache 恢复产生的新访问；
- Layout Shift session window；
- 多事件组成一次 Interaction；
- 浏览器 API 差异；
- metric id 和 delta 的更新语义。

`web-vitals` 库封装了与 Chrome/Google 工具一致的测量逻辑，并提供 attribution build 帮助归因。

安装入口：

<<< ../../../examples/frontend/performance-engineering/src/install-web-vitals.mts

每个 `onLCP`、`onINP`、`onCLS` 在一次页面生命周期中只安装一次。重复在组件 mount 时注册会创建多组 Observer 和 Listener，造成重复上报甚至内存泄漏。

示例中的 `routeTemplate` 表示这次 Document Navigation 的初始路由。传统 Core Web Vitals 不会因为 SPA 客户端路由切换就自动重置；不要在每次虚拟路由切换时重新安装三组 Observer。SPA 内部导航应另外用 User Timing、路由就绪标记和交互数据衡量，并把“文档级指标”和“软导航指标”分开存储。

### 8.2 Reporter 为什么在初始化时做一次采样

<<< ../../../examples/frontend/performance-engineering/src/performance-reporter.ts

示例在创建 Reporter 时决定本次页面访问是否采样，而不是为每个指标分别 `Math.random()`。这样一次访问的 LCP、INP、CLS 要么一起进入分析，要么一起跳过，便于关联。

采样率不是越低越好。高流量路由可以低采样，低流量关键流程可能需要更高采样；后端聚合时必须知道采样策略，避免错误解释总量。

### 8.3 `id`、`value` 和 `delta` 的后端语义

某些 metric callback 可能在页面隐藏或 bfcache 恢复时多次报告。后端需要按访问 metric `id + name`：

- 更新为最新 `value`；或
- 累加每次 `delta`。

不能把每次 callback 都当成独立页面访问，否则 CLS/INP 分布会重复计算。bfcache 恢复会产生新的 metric id，应视为新的页面访问体验。

还要接受浏览器能力差异：部分指标在部分引擎中不可用，后台打开的页面也可能不产生 LCP/CLS。`web-vitals` 在页面内部无法直接观察 iframe 内容，而 CrUX 的页面级数据可能包含 iframe 影响，因此两套现场数据不一定完全相同。

### 8.4 为什么不上传完整 attribution

attribution 可能包含元素选择器、脚本 URL、事件 Entry 和大量对象。完整上传会带来：

- 用户输入或 DOM 标识泄露风险；
- Payload 和内存膨胀；
- 高基数字段让聚合失控；
- 第三方 URL Query 中的敏感信息进入日志。

示例只选取有限数值字段，并要求传入路由模板 `/courses/:courseId`，而不是完整 URL、标题或用户 ID。生产设计要经过隐私和数据保留审查。

### 8.5 遥测不能反过来伤害性能

Reporter 优先使用 `sendBeacon`，失败时才用 `fetch(..., { keepalive: true })`，并吞掉发送失败，避免影响用户任务。

这不代表可以忽略遥测可靠性。上报成功率、采样配置和后端丢弃率应由独立指标观察，但不能在主流程同步重试或阻塞导航。

## 九、PerformanceObserver：观察最坏主线程帧

Long Tasks API 能发现超过 50ms 的长任务，但对渲染归因有限。Long Animation Frames（LoAF）从整个动画帧观察脚本与渲染工作，能发现多个较短任务共同拖慢一帧的情况。

示例优先使用 LoAF，不支持时回退 Long Task：

<<< ../../../examples/frontend/performance-engineering/src/observe-main-thread.ts

设计要点：

- 使用 `PerformanceObserver.supportedEntryTypes` 做能力检测；
- `buffered: true` 获取 Observer 安装前已记录的 Entry；
- 只保留本次访问最慢的五个样本；
- 页面隐藏时上报并清空；
- cleanup 时断开 Observer 和 Listener；
- 不上传庞大的完整 Script Entry。

LoAF 当前并非所有浏览器都提供相同支持，因此它适合渐进增强的诊断，不应成为业务功能前置条件。

## 十、Navigation、Resource 与 Server Timing

导航摘要示例：

<<< ../../../examples/frontend/performance-engineering/src/navigation-summary.ts

它从 `PerformanceNavigationTiming` 提取：

- DNS；
- 连接与 TLS；
- Request 到首字节；
- Response 下载；
- DOM Interactive；
- Transfer Size；
- 服务端通过 `Server-Timing` 暴露的阶段。

### 10.1 不要继续使用已废弃的 `performance.timing`

旧 `PerformanceTiming` 使用绝对时间戳，字段和精度模型较旧。现代实现应读取 `performance.getEntriesByType('navigation')` 的 `PerformanceNavigationTiming`。

Performance API 使用相对 `performance.timeOrigin` 的高精度单调时钟，适合计算持续时间，不会像 `Date.now()` 一样受系统时钟调整直接影响。

### 10.2 Server-Timing 打通前后端归因

服务端可以返回：

```http
Server-Timing: db;dur=42, cache;dur=3, render;dur=18
```

浏览器在 Navigation/Resource Timing 的 `serverTiming` 中暴露这些值。这样 TTFB 变慢时，不必只知道“后端慢”，而能区分数据库、缓存、模板或上游服务。

名称和 description 不能包含用户标识、SQL 或内部机密。Server-Timing Header 对客户端可见。

### 10.3 跨源 Resource Timing 为什么很多字段是 0

浏览器为防止跨源信息泄露，会隐藏未授权资源的详细 timing。资源服务端需要发送合适的：

```http
Timing-Allow-Origin: https://app.example.com
```

这与 CORS 是否允许读取响应正文不是同一件事。不要看到 `transferSize === 0` 就直接推断命中缓存；它也可能是跨源 timing 被保护。

### 10.4 Performance Entry Buffer 有上限

Resource、Event、Layout Shift、LoAF 等 Entry Buffer 不是无限的。长会话或资源密集页面可能丢 Entry。Observer callback 可以获得 dropped entries 信息，资源场景也可按需调整 Buffer 大小。

生产采集应该尽早消费、聚合后丢弃细节，而不是把所有 Entry 永久保存在内存。

## 十一、User Timing：给业务阶段命名

浏览器只知道某个 Task、Fetch 或 Render 多久，不知道“加载课程编辑器”由哪些步骤组成。User Timing 用 `mark` 和 `measure` 给业务阶段建立时间线。

<<< ../../../examples/frontend/performance-engineering/src/user-timing.ts

示例为并发操作生成唯一 Mark，避免两次同名操作互相覆盖，并在 `finally` 中完成 Measure 和清理 Mark。

调用方式：

```ts
const lesson = await measureOperation('lesson:load', () => repository.getLesson(id))
```

命名应稳定、低基数，例如：

- `route:catalog:ready`；
- `editor:hydrate`；
- `search:results-render`。

不要把用户 ID、课程 ID、搜索词拼进 measure name；这既泄露数据，又让聚合无法收敛。

## 十二、网络加载：优化依赖链，而不只是压缩单个文件

浏览器获取首屏通常经历：

```text
HTML
  ├─ CSS → Font / Background Image
  ├─ JS → 动态 import → Chunk → API → 图片
  └─ 直接可发现的 Image
```

性能问题经常来自串行依赖链：HTML 下载后才发现 JS，JS 执行后才知道 API，API 返回后才知道 LCP 图片。即使每个资源单独都不大，瀑布链仍然很长。

优化顺序：

1. 让关键内容和 URL 尽早出现在 HTML；
2. 删除不必要的重定向与跨源连接；
3. 缩短关键依赖链；
4. 为真正关键的资源设置正确优先级；
5. 压缩与缓存；
6. 把非关键资源延后。

HTTP/2/3 支持并发不代表可以无限增加请求。每个资源仍有 Header、调度、解析、内存和主线程成本。

## 十三、JavaScript 性能：传输只是第一笔成本

一段 JavaScript 至少产生：

```text
下载 → 解压 → 解析 → 编译 → 执行 → 创建对象/Listener → 后续更新与 GC
```

gzip 只有 100 KiB 的脚本，在低端设备上仍可能因为解析、编译和执行产生长任务。因此构建预算既看压缩字节，也要用 TBT、LoAF、INP 等运行时指标验证。

### 13.1 路由与功能级代码分割

适合动态 `import()` 的边界：

- 很少访问的管理页；
- 大型编辑器、图表、地图；
- 登录后才需要的功能；
- 用户明确触发后才使用的导出器。

不适合机械地“每个组件一个 Chunk”。过细分割可能增加网络调度、模块初始化和瀑布；共享依赖被错误切分也可能导致重复或首屏仍加载大量代码。

Vite 会处理动态 import 及相关 preload 优化，但无法替你决定业务边界。先分析真实路由和 Chunk，再决定是否手工分组。

### 13.2 Tree Shaking 依赖可分析的模块边界

要让 bundler 删除未使用代码：

- 使用静态 ESM import/export；
- 包正确声明副作用；
- 避免入口 import 触发大量全局注册；
- 从可 tree-shake 的子路径导入时确认库官方支持；
- 检查产物，而不是仅凭源码 import 写法猜测。

错误的 `sideEffects: false` 会删除真实副作用代码；它不是无风险的压缩开关。

### 13.3 第三方脚本有自己的性能预算

Analytics、客服、A/B、广告与风控可能同时：

- 延迟网络关键资源；
- 执行长任务；
- 注册高频 Listener；
- 修改 DOM 引发 CLS；
- 发送大量请求并占用内存。

第三方脚本要有业务 Owner、加载阶段、超时/失败策略和退出机制。`async`/`defer` 只改变加载执行时机，不会消除执行成本。

## 十四、渲染性能：减少无效工作并控制更新范围

框架优化的共同原则是：

1. 不创建不需要的状态；
2. 让状态靠近真正消费它的组件；
3. 保持列表 Key 与对象身份语义正确；
4. 避免每次更新触发大范围订阅；
5. 对长列表使用窗口化；
6. 把计算缓存建立在测量和稳定依赖上；
7. 用 Framework Profiler 确认谁在更新以及为什么。

Vue 的 computed、`v-memo`、`shallowRef`，React 的 memo、transition 等只是表达这些原则的工具。缓存本身也有依赖比较、内存与失效成本；没有测量就给所有组件加 memo，可能让代码更复杂而没有收益。

### 14.1 DOM 数量和 CSS 范围

- 长列表窗口化比给几万个节点逐个优化更有效；
- `content-visibility: auto` 可跳过视口外渲染，但要处理可访问性、查找和固有尺寸；
- CSS containment 能缩小布局/绘制影响范围，但错误 containment 会改变布局语义；
- 读写布局属性分批，避免 Forced Synchronous Layout；
- 动画优先 transform/opacity，但要观察 Layer 和显存。

性能优化不能破坏可访问性、搜索、打印和 SEO；每项浏览器优化都要验证功能边界。

## 十五、内存性能：长会话中的另一条时间轴

内存泄漏不一定立即崩溃，常见表现是：

- 页面使用越久越卡；
- GC 更频繁且停顿增长；
- 切换路由后旧组件仍被引用；
- 移动端后台恢复后被系统杀死；
- 图像、Canvas、ArrayBuffer 占用持续增加。

常见保留链：

- 未移除的全局 Event Listener；
- 未停止的 Timer、Observer、Subscription；
- 闭包捕获大对象；
- 无上限 Map/Query Cache；
- Detached DOM 被第三方库或数组引用；
- Object URL 未 revoke；
- Worker、WebSocket 和媒体流未关闭。

### 15.1 正确的验证方式是看趋势和保留路径

一次 Heap 数字高不等于泄漏。诊断流程通常是：

1. 建立基线；
2. 重复执行进入/离开路由或打开/关闭弹窗；
3. 在可比时机触发/等待 GC；
4. 比较多次 Heap Snapshot；
5. 查看增长对象的 Retainer Path；
6. 修复所有权后重复实验。

WeakMap 只在 Key 没有其他强引用时帮助回收，不是“用了 WeakMap 就不会泄漏”。

## 十六、性能预算：把期望变成可执行约束

预算至少有三层：

| 层级 | 示例 | 优点 | 局限 |
| --- | --- | --- | --- |
| 构建产物 | 首屏 JS gzip ≤ 170 KiB | 稳定、快速、适合每个 PR | 不代表运行时 |
| 实验室体验 | LCP、TBT、CLS、Score | 能发现执行和渲染问题 | 环境合成、有波动 |
| 现场 SLO | 移动端 p75 INP ≤ 200ms | 代表真实用户 | 反馈慢、需足够流量 |

只做 Bundle Budget 会漏掉算法和第三方运行时问题；只做 RUM SLO 又会等到回退上线后才知道。三层应共同存在。

### 16.1 预算必须来自产品场景

预算不是从网上复制一个数字：

- 核心首屏要考虑目标设备、网络和业务转化；
- 编辑器型应用可以允许按需 Chunk 大，但不能污染目录页首屏；
- 字体、图像和脚本分别管理；
- 新功能若必须突破预算，应说明用户价值和补偿措施；
- 预算调整必须作为可审查变更，不由脚本自动抬高。

示例预算：

<<< ../../../examples/frontend/performance-engineering/performance-budget.json

这些数字是教学起点，不是所有项目的通用答案。

## 十七、从 Vite Manifest 检查真实入口依赖

完整预算脚本：

<<< ../../../examples/frontend/performance-engineering/scripts/check-performance-budget.mts

它不是简单统计 `dist/assets` 总大小，而是：

1. 读取 `dist/.vite/manifest.json`；
2. 找到 `src/main.ts` 对应入口；
3. 递归遍历入口的静态 `imports`；
4. 计算首屏 JS 与其 CSS；
5. 扫描整个 `dist`，检查任意 JS、全部 JS 和静态资源，包括从 `public` 原样复制的文件；
6. 使用 gzip level 9 给出稳定近似值；
7. 任一预算超限时退出码为 1。

这能发现“某次 import 让编辑器库进入首屏”之类的依赖图回归。

### 17.1 为什么 gzip 仍只是近似

真实 CDN 可能使用 Brotli、不同压缩等级、HTTP Header 和缓存命中。文件压缩大小也不包含解析执行成本。

构建预算的价值是对同一仓库提供稳定、快速、可比较的代理；真实传输和体验仍由 Resource Timing、Lighthouse 与 RUM 验证。

### 17.2 Vite Manifest 必须在构建中启用

真实项目需要在 Vite build 配置中开启 manifest 输出，或让现有 SSR/后端构建已经生成它。预算脚本不能凭空分析不存在的 Manifest。

不要为了课程示例直接修改所有项目配置；先确认当前构建系统、入口 key 和输出目录，再接入。

## 十八、Lighthouse CI：快速实验室门禁

<<< ../../../examples/frontend/performance-engineering/lighthouserc.json

配置做了这些选择：

- 对生产 preview 而不是 dev server 测量；
- 运行三次，降低单次噪声影响；
- 使用固定 desktop preset；
- 对 Performance Score、LCP 和 CLS 建立 error；
- TBT 先作为 warning，便于遗留项目渐进治理；
- 报告保存在仓库外的临时输出目录。

### 18.1 为什么不能只卡 Performance Score

综合分数的权重和算法会随 Lighthouse 版本变化；两个完全不同的瓶颈可能得到相同分数。门禁应同时保留：

- 少量综合报警；
- 与用户任务直接相关的指标阈值；
- Bundle/资源预算；
- 原始报告用于诊断。

### 18.2 合成测试有方差

共享 CI 机器的 CPU 调度、浏览器冷启动和网络会产生波动。治理方式包括：

- 固定 Node、Chrome、Lighthouse 版本；
- 多次运行并使用工具规定的聚合结果；
- 使用专用 runner 或校准环境处理关键预算；
- 阈值留出合理噪声空间；
- 对接近阈值的变化查看趋势，而不是不断 rerun 到绿色。

提高阈值来消除 flaky，只是在删除门禁。

## 十九、CI 性能流水线

公共 scripts：

<<< ../../../examples/frontend/performance-engineering/package-scripts.json

Node 版本入口：

<<< ../../../examples/frontend/performance-engineering/.node-version

CI 工作流：

<<< ../../../examples/frontend/performance-engineering/.github/workflows/performance.yml

流程是：

```text
npm ci
  → production build
  → Vite manifest bundle budget
  → Lighthouse CI
  → 无论成功失败都保留报告（取消除外）
```

报告与构建输出不进入 Git：

<<< ../../../examples/frontend/performance-engineering/.gitignore.example

示例为了可读性使用官方 Action 主版本 tag。高安全要求仓库应固定完整 commit SHA，并通过依赖更新 PR 升级。

### 19.1 PR 门禁和定时基准各自负责什么

PR 门禁适合稳定、快速的相对回退检查。定时任务可以：

- 在固定设备环境执行更完整路由矩阵；
- 跑移动设备与多个网络配置；
- 采集趋势和基准分支对比；
- 执行成本较高的浏览器与内存场景。

生产 RUM SLO 则需要发布版本维度和告警窗口，避免一次流量异常就误报，也避免长期退化被周平均掩盖。

## 二十、从数据到根因的诊断 Runbook

### 20.1 LCP 变差

1. 按路由、设备、版本确认 RUM p75 回退范围；
2. 找到真实 LCP 元素和 attribution；
3. 拆分 TTFB、发现延迟、下载、渲染延迟；
4. 查看 HTML 中资源是否可发现；
5. 查看 Network Priority、缓存、尺寸和解码；
6. 查看 LCP 前的 CSS/JS 主线程阻塞；
7. 在实验室复现并部署小范围验证；
8. 上线后确认现场分布，而不只确认本地 Trace。

### 20.2 INP 变差

1. 找到慢交互的路由、目标类型与设备；
2. 分解 input delay、processing、presentation；
3. Input delay 高：查看之前的长任务和第三方脚本；
4. Processing 高：Profile Handler 调用树；
5. Presentation 高：查看组件更新、Style、Layout、Paint；
6. 用 LoAF、Framework Profiler 和 User Timing 对齐；
7. 先做即时反馈，再拆分/延后非关键工作；
8. 验证功能、可访问性和真实低端设备。

### 20.3 CLS 变差

1. 找到最大 Layout Shift session window；
2. 查看 shift source，而不是凭截图猜；
3. 区分图片、广告、字体、异步插入和 Hydration；
4. 预留尺寸或调整呈现位置；
5. 验证不同响应式宽度和登录态；
6. 用长会话 RUM 确认 SPA 后续路由位移。

### 20.4 Bundle 变大但体验暂时没变

不要忽略。它可能因为当前设备快、缓存命中或实验室场景未访问功能而未立即表现。检查：

- 新代码进入初始还是异步 Chunk；
- 是否重复依赖或同时打入多个版本；
- Tree Shaking 是否失效；
- 是否只对少量路由有必要；
- 低端设备解析执行是否回退；
- 缓存失效后的首次访问成本。

## 二十一、常见无效优化及原因

### 21.1 只看一次 Lighthouse 100 分

无法代表真实设备、交互和长会话，也没有版本趋势。应结合 RUM p75、Trace 与持续预算。

### 21.2 给所有资源 preload / high priority

所有资源都高优先级等于没有优先级，并会抢占真正关键资源。只提升已确认的关键链。

### 21.3 LCP 图片使用 lazy-load

把首屏主要内容故意延后发现，通常直接增加 LCP。Lazy-load 应用于视口外资源。

### 21.4 只按 gzip 包大小判断 JavaScript

忽略解析、编译、执行、对象创建与后续主线程工作。必须结合 TBT、LoAF、INP 和设备分布。

### 21.5 给每个组件添加缓存

Memoization 有比较、内存和失效成本，且可能掩盖状态边界问题。先用 Profiler 找到真实高频昂贵更新。

### 21.6 用 `setTimeout` 猜交互完成

无法保证下一帧已经绘制，也无法消除竞态。应等待明确状态，并用 Performance/Event Timing 测量真实阶段。

### 21.7 把所有工作移到 Worker

Worker 仍要支付脚本下载、启动、消息序列化或 Transfer 所有权成本，DOM 操作也不能直接移入。适合大计算，不适合细碎任务。

### 21.8 预算超限就提高阈值

阈值失去治理意义。应先解释业务变化、评估真实用户成本，并寻找删除或延迟其他资源的补偿方案。

## 二十二、完整示例目录

```text
examples/frontend/performance-engineering/
├── .github/workflows/performance.yml
├── .gitignore.example
├── .node-version
├── critical-loading.html
├── lighthouserc.json
├── package-scripts.json
├── performance-budget.json
├── scripts/
│   └── check-performance-budget.mts
└── src/
    ├── install-web-vitals.mts
    ├── navigation-summary.ts
    ├── observe-main-thread.ts
    ├── performance-reporter.ts
    └── user-timing.ts
```

迁入真实项目时还需要：

- 安装与锁文件兼容的 `web-vitals`、Lighthouse CI；
- 开启 Vite manifest，并修改真实入口名称；
- 建立接收 RUM 的同源或正确 CORS 端点；
- 设计采样、版本、路由模板、去重和数据保留；
- 根据目标设备和用户任务重新制定预算；
- 将 Lighthouse URL 扩展为真实关键路由。

## 二十三、上线前检查清单

### 指标与数据

- Core Web Vitals 使用真实访问 p75，而不是平均值；
- 移动/桌面、路由和版本能分组；
- RUM metric id 的多次回调不会重复计算访问；
- attribution 字段经过隐私与高基数审查；
- 遥测失败不会阻塞用户流程。

### 加载

- LCP 元素和四段耗时已确认；
- LCP 资源可从初始 HTML 尽早发现；
- 首屏图片没有错误 lazy-load；
- 图片响应式尺寸和宽高比正确；
- preload、preconnect、fetchpriority 数量克制；
- 跨源 Resource Timing 配置了必要的 TAO。

### 交互与渲染

- 慢 INP 已区分 input、processing、presentation；
- 用户操作会先产生即时视觉反馈；
- 长任务已删除、拆分或移出主线程；
- Framework Profiler 证明更新范围合理；
- 长列表、Observer、Timer 和第三方脚本有生命周期；
- LoAF/Long Task 采集有能力检测和数量上限。

### 预算与 CI

- 首屏与总包预算分开；
- 压缩字节与运行时指标同时存在；
- Lighthouse 在生产构建上运行多次；
- 阈值调整必须评审，不能自动抬高；
- 报告保留足够诊断信息但不泄露数据；
- 上线后仍由 RUM 确认真实收益。

## 二十四、总结

性能工程的核心不是记住若干 API，而是建立可归因、可验证、可持续的反馈系统：

- LCP 用四段模型定位主要内容为什么晚；
- INP 用输入延迟、处理时长和呈现延迟定位交互；
- CLS 用真实位移来源治理长生命周期稳定性；
- RUM 告诉你真实用户哪里慢，实验室 Trace 告诉你为什么慢；
- Performance、Resource、Server 和 User Timing 打通前后端阶段；
- Vite Manifest 预算阻止关键依赖图回退；
- Lighthouse CI 提供快速合成报警；
- 现场 p75 SLO 最终确认用户是否真正受益。

下一节将进入大型前端架构，讨论模块边界、领域分层、依赖规则、微前端适用条件，以及如何让 Vue、React 和遗留系统可渐进演进。

## 参考资料

- [web.dev：Web Vitals](https://web.dev/articles/vitals)
- [web.dev：Core Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds)
- [web.dev：Optimize LCP](https://web.dev/articles/optimize-lcp)
- [web.dev：Optimize INP](https://web.dev/articles/optimize-inp)
- [web.dev：Optimize CLS](https://web.dev/articles/optimize-cls)
- [GoogleChrome/web-vitals](https://github.com/GoogleChrome/web-vitals)
- [MDN：Performance API](https://developer.mozilla.org/docs/Web/API/Performance_API)
- [MDN：Performance data](https://developer.mozilla.org/docs/Web/API/Performance_API/Performance_data)
- [MDN：Long animation frame timing](https://developer.mozilla.org/docs/Web/API/Performance_API/Long_animation_frame_timing)
- [MDN：Resource timing](https://developer.mozilla.org/docs/Web/API/Performance_API/Resource_timing)
- [MDN：Server timing](https://developer.mozilla.org/docs/Web/API/Performance_API/Server_timing)
- [MDN：Timing-Allow-Origin](https://developer.mozilla.org/docs/Web/HTTP/Reference/Headers/Timing-Allow-Origin)
- [Vite：Building for Production](https://vite.dev/guide/build)
- [web.dev：Use Lighthouse for performance budgets](https://web.dev/articles/use-lighthouse-for-performance-budgets)
