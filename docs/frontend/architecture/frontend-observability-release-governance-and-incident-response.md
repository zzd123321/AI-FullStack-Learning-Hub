---
title: 前端可观测性与生产治理：从错误采集到灰度和事故响应
description: 建立浏览器错误、日志、指标、Trace、Source Map、Release、Feature Flag、自动门禁、告警和事故响应的完整生产闭环
outline: deep
---

# 前端可观测性与生产治理：从错误采集到灰度和事故响应

开发环境里，我们可以打开 DevTools、打断点、查看本地源码；生产环境却完全不同：代码经过压缩和拆包，用户设备与网络不可控，问题可能只发生在某个浏览器、地区、路由、Release 或灰度 Cohort，而且开发者通常无法复现用户当时的状态。

因此，生产治理不是“接入一个报错 SDK”。它要回答一条完整因果链：

```text
用户遇到了什么
  → 哪个 Release、路由和 Cohort 受到影响
  → 前端内部发生了什么
  → 请求经过哪些后端服务
  → 影响了多少用户和业务结果
  → 是否应暂停、关闭 Flag 或回滚
  → 恢复以后如何防止同类事故
```

这节课不绑定具体厂商。示例先定义稳定的应用契约，再让 SDK、Collector 和后端成为可替换 Adapter。这样即使遥测平台变化，业务代码中的事件语义、Release 维度和隐私策略仍然稳定。

## 先定义生产证据能回答什么

### Monitoring 与 Observability 不完全相同

Monitoring 通常验证已知问题，例如：

- JavaScript 错误率是否超过 2%；
- LCP 的第 75 百分位是否超过 2.5 秒；
- 结算成功率是否低于基线；
- 最新 Release 是否产生大量 Chunk 加载失败。

Observability 更强调能否利用系统外部输出解释未知内部状态。生产事故往往不会严格匹配预先写好的一个阈值，所以需要把错误、事件、指标、Trace、Release、配置和业务结果关联起来。

二者不是替代关系：Monitoring 负责及时发现，Observability 负责形成证据和解释。

### 浏览器可观测性的根本限制

前端与后端的运行环境不同：

1. 页面随时可能关闭、冻结或被操作系统回收，最后一批数据不保证送达；
2. 用户网络可能正是故障来源，遥测请求也会失败；
3. 浏览器扩展、广告拦截器、CSP 和隐私设置会干预采集；
4. 客户端数据不可信，不能直接作为计费、安全审计或权限依据；
5. URL、DOM、输入内容和错误上下文很容易包含个人信息；
6. 自动插桩本身会增加 JavaScript、CPU、网络和故障面。

由此得到一个重要原则：

> 遥测是尽力而为的诊断证据，不是业务事务的一部分；不能为了“保证上报”阻塞用户操作。

### 先定义统一 Envelope，再选择 SDK

如果每个 Feature 直接调用某个厂商 SDK，事件命名、上下文、隐私和采样会逐渐失控。统一 Envelope 负责回答每条数据最基本的问题：

- 它是什么信号；
- 何时发生；
- 属于哪个服务、环境和 Release；
- 属于哪个会话、路由和 Cohort；
- 能否通过 Trace ID 与后端关联；
- Schema 如何演进。

<<< ../../../examples/frontend/production-observability/contracts.ts

`schemaVersion` 是数据契约版本，不是应用 Release。前者用于演进 Envelope，后者定位是哪次构建产生了数据。

#### Release 必须是不可变身份

`release: "production"` 或 `release: "latest"` 没有诊断价值。Release 应唯一对应一组静态产物和 Source Map，例如 Git SHA 或 CI 生成的不可变版本号。

同一个 Release 可以被逐步放量，但不能在内容变化后继续使用旧 ID，否则错误堆栈会映射到错误源码，回滚和对比也失去意义。

### 五类信号各自回答什么

#### Error：一次具体失败

Error 适合保留堆栈、异常类型、机制、Release 和有限上下文，用于定位“哪里坏了”。同一错误需要通过规范化堆栈和关键信息形成 Fingerprint，避免每次发生都成为独立问题。

#### Log：带上下文的离散记录

结构化日志可记录状态转换和诊断信息，但浏览器端不应复制服务端所有 Debug Log。自由文本难以聚合，也更容易泄露数据。生产日志应有等级、事件名、固定字段和容量上限。

#### Event：用户或系统发生的事实

例如 `checkout.submitted`、`feature_flag.evaluated`、`resource.load_failed`。事件名应表达已经发生的事实，属性用于稳定维度，不应把整个对象序列化进去。

#### Metric：可聚合的数值

Metric 回答“多大、多少、多久”，例如错误率、成功率、延迟分布和丢弃量。它适合告警和趋势，却通常不能单独解释一次具体失败。

#### Trace：一次操作经过的因果路径

Trace 将页面交互、前端 Fetch、网关和下游服务连接为一条路径。Span 表示其中一个有开始、结束、状态和耗时的工作单元。

这些信号互补：Metric 发现异常，Trace 缩小链路范围，Error 定位代码，Event 和 Log 补充业务上下文。

### 遥测流水线要有明确阶段

```text
捕获 → 规范化 → 清洗 → 补充上下文 → 采样 → 批处理 → 传输
                                                    ↓
查询/聚合 ← 存储与保留策略 ← Collector/接收端 ← 验证与限流
```

将这些阶段分开有三个好处：

1. 隐私规则不会散落在业务调用点；
2. 采样和传输策略可以调整，而不改变事件语义；
3. 可以单独观测遥测系统自身的丢弃、延迟和错误。

## 在浏览器端建立安全、有限的遥测流水线

### 数据最小化要发生在浏览器端

数据到达服务端后再脱敏已经太迟：它可能已经经过代理、日志、Collector 和第三方平台。

示例只允许字符串、数值和布尔值进入 Attributes，按 Key 屏蔽明显敏感字段，限制字符串长度，并把实际 URL 归一化为路由模板：

<<< ../../../examples/frontend/production-observability/sanitize.ts

#### 为什么不能直接记录完整 URL

以下 URL 都可能泄露数据：

```text
/users/483921
/reset-password?token=...
/search?q=疾病名称
/orders/8e7c.../invoice
```

可观测维度应使用 `/users/:id`、`/orders/:id/invoice` 这样的模板。Query、Hash、DOM 文本、表单值、Cookie、Token 和请求体默认不采集，只有经过隐私评审的字段才进入白名单。

#### Redaction 不是完整隐私方案

正则只能作为最后防线。更可靠的设计是：

- API 从类型上只接受允许的 Primitive；
- 每类事件定义字段白名单；
- 数据保留期与访问权限按信号分类；
- 在 CI 和测试中扫描敏感字段；
- 对 Session Replay 单独授权、遮罩并控制采样。

### 高基数会让指标失去可用性

Cardinality 是某个维度可能拥有的不同值数量。`browser = chrome|safari|firefox` 基数有限；`userId`、完整 URL、Error Message、Trace ID 几乎每条都不同。

高基数属性适合放在可检索的 Error 或 Trace 中，不适合直接作为 Metric Label。否则时间序列数量、存储成本和查询延迟会快速膨胀。

一个实用划分是：

| 数据 | 适合用途 |
| --- | --- |
| Release、环境、路由模板、浏览器大版本 | Metric 维度 |
| Trace ID、Span ID、Session ID | 单条事件关联 |
| User ID、邮箱、Token | 默认不采集 |
| 原始 Error Stack | 错误系统中受限存储 |

### 采样必须保持统计和因果一致性

简单地对每条事件调用 `Math.random()` 会让一次会话中的页面事件、错误和 Trace 互相脱节。稳定会话采样用 Session ID 计算固定 Bucket，同一会话始终作出相同决定：

<<< ../../../examples/frontend/production-observability/sampling.ts

示例保留所有错误、只采样一部分常规信号。这仍需服务端限流，因为攻击者或错误循环可能制造无限错误。

常见策略包括：

- Head Sampling：操作开始时决定，成本可控，但可能丢掉后来才知道很重要的慢请求；
- Tail Sampling：Collector 看到完整 Trace 后决定，可保留错误和慢 Trace，但需要更复杂的后端缓冲；
- Adaptive Sampling：高频普通事件降低采样，稀有错误提高采样；
- Rate Limit：每个 Session、Release、错误指纹设硬上限。

采样率必须随数据一起保存，聚合时才能正确估算总体；错误数不能直接与不同采样率的访问量相除。

### 客户端 Telemetry API 要保持小而稳定

下面的实现集中处理 Release、Runtime、时间、采样、清洗、Span 生命周期和异常规范化：

<<< ../../../examples/frontend/production-observability/telemetry.ts

业务层只依赖 `Telemetry` 接口，因此测试可以使用内存 Sink，生产可以接 OpenTelemetry 或其他后端。

#### Span 必须只结束一次

一个 Span 重复 `end()` 会产生错误耗时或重复数据。示例用闭包保护结束状态。真实 SDK 通常已有保护，但应用 Adapter 仍应明确生命周期。

#### `unknown` 比 `Error` 更诚实

JavaScript 可以 `throw "failed"`，Promise 也可以用任意值拒绝。错误入口应接收 `unknown`，再统一转换为 `Error` 语义，而不是假设所有原因都有 `message` 和 `stack`。

### 全局错误捕获不是一个监听器

浏览器至少有三类不同入口：

1. 同步脚本执行错误触发 `window` 的 `error`；
2. 未处理 Promise 拒绝触发 `unhandledrejection`；
3. Script、Image、Stylesheet 等资源加载失败产生元素 `error`，且不会像普通事件一样冒泡。

<<< ../../../examples/frontend/production-observability/global-errors.ts

资源失败需要捕获阶段监听。同步异常与资源错误虽然事件名相同，但 Event 类型、字段和处理方式不同。

跨源脚本若没有合适的 `crossorigin` 属性和 CORS 响应头，浏览器可能只暴露模糊的 `Script error.`，不提供原始文件、行列和 Error 对象。这不是错误 SDK 能绕过的限制；需要让脚本加载方式、CDN CORS 和 Source Map 策略共同配合，同时避免对不受信任 Origin 放宽读取权限。

#### Framework Error Boundary 仍然必要

Vue 的 `app.config.errorHandler`、`onErrorCaptured`，React Error Boundary 和路由错误边界可以补充组件树、路由和用户可见降级信息。它们不能替代全局监听；全局监听也不能替代局部恢复 UI。

正确分工是：

```text
局部边界：决定用户看到什么、哪些子树可以恢复
全局捕获：兜住未被局部处理的运行时错误
Telemetry Adapter：统一清洗、关联、采样和发送
```

捕获到错误不代表应该吞掉错误。开发环境仍应保留控制台和框架行为；生产也不能用空 `catch` 假装成功。

### 错误去重要基于稳定 Fingerprint

只按 Message 聚合会把不同调用点合并，只按完整 Stack 又可能被 Chunk Hash、浏览器差异拆散。通常需要：

- 异常类型；
- Source Map 后的顶层若干业务 Frame；
- 经过归一化的 Message；
- 可选的 Feature 或操作名。

时间戳、用户 ID、随机参数、Bundle Hash 不应进入 Fingerprint。聚合后仍要保留 First Seen、Last Seen、受影响 Session、Release 分布和样本事件。

### 传输必须批处理且不阻塞业务

每条事件单独 Fetch 会消耗连接、Header 和电量。批处理减少开销，但队列也必须有数量和字节上限，防止错误风暴占用内存。

<<< ../../../examples/frontend/production-observability/batch-transport.ts

页面进入 `hidden` 时比依赖 `unload` 更可靠。`sendBeacon()` 适合发送少量分析数据，但只支持 POST 且能力有限；需要自定义方法、读取响应或更多控制时可使用带 `keepalive` 的 Fetch。

示例故意不无限重试。遥测失败时应增加内部丢弃计数，但不能形成“上报失败 → 再上报错误 → 再失败”的递归风暴。

示例还分别限制单批条数、待发送队列条数和序列化 Payload 字节数。慢网络期间超过队列上限的新事件会被丢弃；单条事件若已超过 Payload 上限也不会反复阻塞队列。`onDrop` 只连接独立计数器，不能再次进入同一遥测队列。

### Trace Context 如何连接前后端

W3C Trace Context 使用 `traceparent` 传播 Trace ID、Parent ID 和采样标记。前端发出请求时创建 Client Span，将 Header 传给受信任 API；服务器继续同一 Trace：

<<< ../../../examples/frontend/production-observability/instrumented-fetch.ts

#### 为什么不能向所有 Origin 注入 Header

自定义 Header 可能触发 CORS Preflight，也会把关联标识发送给第三方。示例只对明确 Allowlist 中的 Origin 传播。

此外还要考虑：

- CDN、网关是否转发 `traceparent`；
- 后端是否创建 Server Span 并继续上下文；
- Sampling 标记是否跨服务一致；
- Trace ID 是否被错误地当作认证或用户身份；
- 第三方请求是否应完全排除。

Trace Context 只传播关联信息，不提供认证、完整性或访问控制。

### OpenTelemetry 应放在 Adapter 边界

OpenTelemetry 提供跨厂商的 Trace、Metric、Log 语义和 OTLP，但使用时需要区分规范、语言 SDK 和浏览器自动插桩各自的成熟度。截至本课核对时，JavaScript Trace 与 Metric 状态稳定，Log 仍在开发，浏览器 Client Instrumentation 仍标为 Experimental。

因此更稳妥的结构是：

```text
Feature → 应用 Telemetry 接口 → OpenTelemetry Adapter → Collector → Backend
```

业务事件名和字段属于产品契约，不应由 SDK 自动命名决定。自动插桩适合补充 Document Load、Fetch 等基础 Span，但要评估 Bundle 大小、上下文传播、隐私、CSP、CORS 和采样成本。

## 用 Release、Source Map 和 Flag 控制发布风险

### Source Map 是生产调试资产

压缩后的堆栈可能只有：

```text
TypeError: Cannot read properties of undefined
  at a (assets/app-D7x9.js:1:18422)
```

Source Map 将生成代码的位置映射回 TypeScript、Vue SFC、TSX 或原始 CSS。ECMA-426 已正式定义 Source Map 格式及其调试和服务端堆栈还原目标。

#### Source Map 必须与 Release 精确对应

映射至少依赖：

```text
Release ID + Artifact 文件名 + 行 + 列
```

如果 CDN 已发布新 Bundle，错误平台却只有旧 Map，即使文件名相似也会还原出错误源码。因此上传 Source Map 应发生在部署或放量之前，并在上传失败时阻止发布。

#### Hidden Source Map

下面的构建片段生成 Map，但不在公开 Bundle 中写 `sourceMappingURL`：

<<< ../../../examples/frontend/production-observability/vite-build-fragment.ts

Map 上传到受控错误平台后，不应作为普通静态资源公开部署。Source Map 可能包含 `sourcesContent`，近似暴露原始源码、内部路径和注释；它不是凭据，却仍是敏感调试资产。

#### 上传脚本必须失败即终止

<<< ../../../examples/frontend/production-observability/upload-source-maps.mts

示例在目录中没有任何 `.map` 时也会失败，避免把“什么都没上传”误报成成功。生产实现通常还要递归扫描 Chunk、校验 Release、上传 Debug ID、设置保留期，并在成功后从公开产物目录删除 `.map`。

### Release Marker 贯穿所有信号

Release Marker 不只出现在 Error：

- RUM 指标按 Release 对比；
- Trace Resource 带 Release；
- Feature Flag 曝光记录 Release；
- 前端入口、Remote 和 Service Worker 各自有版本；
- 部署事件写入时间线和 Dashboard；
- 告警能直接链接本次 Commit、变更和 Owner。

没有 Marker 时，“错误率从 1% 升到 3%”只能说明系统变差，不能快速证明与哪次发布相关。

### Feature Flag 分离部署与发布

部署把代码送到生产环境；发布让用户开始走新路径。Feature Flag 可以让两者分开，从而支持小流量验证和快速 Kill Switch。

<<< ../../../examples/frontend/production-observability/feature-flags.ts

#### 稳定分桶

随机分桶会让用户刷新后在新旧体验之间跳动，也污染实验和错误对比。稳定 `targetingKey` 加 Flag Key 形成固定 Bucket，同一个用户对同一个 Flag 保持一致。

Targeting Key 应是稳定、非敏感的服务端标识。匿名用户可以使用有生命周期说明的设备或会话标识，但需符合隐私策略。

#### 曝光发生在真正读取时

配置下载包含某个 Flag，不代表用户真的进入了对应代码路径。示例向业务返回读取函数，在真正读取时发送 `feature_flag.evaluated`，并在 Reader 生命周期内对相同决策去重；这样重复渲染不会虚增 Cohort 分母。

#### Flag 不是权限系统

客户端 Flag 可以被查看和篡改。它适合控制 UI 和发布路径，不能决定用户是否有权读取数据、执行支付或访问管理能力；权限必须由服务端验证。

#### Flag 有生命周期

每个 Flag 应有 Owner、创建原因、预期删除日期和最终状态。完成放量后删除旧分支和 Flag，否则每个永久布尔值都会使可测试状态空间成倍增长。

### 灰度不是“先发 5% 看看”

可靠灰度需要预先定义：

1. Cohort 如何选择并保持稳定；
2. 每一步的流量比例和最短观察时间；
3. 最小样本量；
4. 技术 SLI 与业务 SLI；
5. Promote、Pause、Rollback 的机器判定条件；
6. Kill Switch 与回滚权限；
7. 谁值班、谁确认下一步。

<<< ../../../examples/frontend/production-observability/release-policy.json

观察窗口过短可能错过低频操作和缓存过期，单看错误率也可能在“页面不报错但用户无法完成结算”时误判健康。

### 门禁要同时看绝对值、相对基线和业务结果

只有绝对阈值会遗漏显著回归：基线错误率 0.1%，新版本升到 0.8%，虽然低于 2%，却增加了八倍。只有相对比值又会在极低基线下对少量噪声过度敏感。

下面的纯函数同时比较：

- 最小样本量；
- 绝对错误率；
- 相对基线倍数；
- LCP 与 INP；
- 结算成功率回归。

<<< ../../../examples/frontend/production-observability/release-gate.ts

严重技术失败或业务转化回归直接 Rollback；证据不足继续 Collect；一般性能回归先 Pause。这些只是示例策略，真实阈值要来自历史基线、业务风险和 SLO。

健康数据本身也可能损坏。示例遇到 `NaN`、负耗时或超出 `0–1` 的比率时选择 Pause，而不是让 JavaScript 的比较结果全部为 `false` 后错误 Promote；策略配置非法则直接抛错，阻止发布脚本继续。

门禁本身也需要测试：

<<< ../../../examples/frontend/production-observability/release-gate.test.mts

## 用 SLO、告警和门禁做发布决策

### SLI、SLO 与 Error Budget

#### SLI：实际测量值

例如：

```text
页面可用率 = 成功完成关键页面初始化的 Session / 尝试初始化的 Session
结算成功率 = 成功创建订单的有效尝试 / 所有有效结算尝试
```

分母必须表达真实机会。只用 Page View 做分母可能掩盖用户根本没走到关键步骤的问题。

#### SLO：目标范围

例如“滚动 28 天内，99.9% 的关键页面初始化成功”。SLO 是团队对可靠性的工程目标，不一定等于对外合同 SLA。

#### Error Budget：允许失败的空间

如果 SLO 是 99.9%，允许失败比例是 0.1%。预算消耗过快说明需要停止高风险发布并投入可靠性工作。

Burn Rate 表示错误预算被消耗的速度。多窗口告警能同时捕捉“短时间严重事故”和“长时间缓慢退化”，比单个瞬时错误率阈值更稳健。

### 告警必须可行动

“发生了 100 个错误”缺少流量分母和用户影响。高质量告警应包含：

- 影响的 SLI/SLO 与当前值；
- 首次出现和持续时间；
- 受影响 Session、路由、地区或浏览器；
- Release、Flag Cohort 与最近部署；
- 错误 Fingerprint 或代表 Trace；
- Dashboard、变更记录和 Runbook 链接；
- 建议的止损动作与 Owner。

#### Page 与 Ticket 的区别

需要立即人工介入、正在明显影响用户、且有可执行动作时才 Page。容量趋势、单个低频错误和非紧急清理通常创建 Ticket。

如果每个异常都叫醒值班人员，最终会产生 Alert Fatigue：人开始忽略告警，真正事故反而响应更慢。

### Dashboard 应围绕决策组织

一个有用的 Release Dashboard 至少让值班人员回答：

1. 新 Release 覆盖多少用户；
2. 与 Control/上一 Release 相比，错误率是否上升；
3. Core Web Vitals 是否回归；
4. 登录、搜索、结算等关键业务成功率是否变化；
5. 哪些路由、浏览器、区域和 Flag Variant 最异常；
6. 遥测接收率和采样是否正常。

图表数量不是目标。没有明确决策用途、Owner 和查询说明的 Dashboard 很快会失真。

### 自动化发布流水线的正确顺序

<<< ../../../examples/frontend/production-observability/release-workflow.yml

关键顺序是：

```text
检查 → 构建不可变产物 → 上传 Source Map → 部署 → 小流量灰度 → 健康门禁
```

真实流水线还应：

- 对部署环境使用受保护审批；
- 记录 Deployment Marker；
- 逐步执行 1% → 5% → 20% → 50% → 100%；
- 每一步等待足够样本和观察窗口；
- 自动暂停或回滚，并通知值班人员；
- 保留旧入口和兼容资产直到回滚窗口结束。

前端回滚不只是重新部署旧文件。HTML、CDN、Service Worker、Chunk 和 API Schema 可能分别缓存不同版本。必须验证真实客户端能重新加载到一组兼容产物。

### 完整 Bootstrap 展示依赖关系

<<< ../../../examples/frontend/production-observability/bootstrap.ts

这里的装配顺序体现架构边界：

```text
Release + Runtime Context
        ↓
Transport ← Telemetry ← Global Error Capture
                      ← Instrumented Fetch
                      ← Observable Feature Flags
                      ← Feature 业务事件
```

Feature 不应拿到 Transport、Token 或厂商 Client；它只依赖小型 `Telemetry` 接口。

### 遥测系统也需要被观测

如果 SDK 初始化失败、采样配置错误或 Collector 丢数据，Dashboard 可能看起来“异常健康”。因此要监控：

- 客户端创建、采样、丢弃和发送数量；
- Batch 大小与队列溢出；
- Beacon/Fetch 失败率；
- Collector 接收、拒绝、排队和导出数量；
- Source Map 上传覆盖率；
- 未知 Release 和未知 Schema 数量；
- 每个 Release 的活跃 Session 与业务事件基线。

应用页面不应因为遥测初始化失败而白屏。Telemetry Adapter 必须 Fail Open，并防止自身错误递归上报。

浏览器 Reporting API 还能汇集 CSP、弃用、崩溃或网络错误等浏览器生成的报告，但不同报告类型和浏览器支持并不一致。接入时应把它视为额外信号源：接收端验证 Schema、限制容量，并与应用 Error 分开命名，不能假设它替代应用插桩。

## 事故发生后先止损，再改进系统

### 事故响应先止损，再追根因

事故发生时最重要的是缩短用户受影响时间。调查 Root Cause 很重要，但不应延迟关闭 Flag、停止灰度或回滚。

<<< ../../../examples/frontend/production-observability/incident-runbook.md

#### 明确角色

- Incident Commander：协调和决策，不同时沉入每个技术细节；
- Operations/Technical Lead：执行止损与诊断；
- Communications：向相关方同步影响、进展和下一次更新时间；
- Scribe：维护统一时间线、假设、证据和决策。

小团队可以一人兼任多个角色，但职责仍要明确，避免多人同时操作发布系统或没有人记录关键决策。

#### 恢复必须用用户指标验证

“回滚命令成功”只说明控制面接受了操作。还要验证：

- CDN 和 HTML 是否指向旧入口；
- Service Worker 是否继续缓存坏版本；
- 用户错误率和业务成功率是否恢复；
- 队列、缓存和 API 数据是否留下不兼容状态；
- 新会话与已打开页面是否表现不同。

### Postmortem 关注系统条件

高质量复盘不是寻找“谁写错了”，而是解释：

- 什么系统条件允许缺陷到达用户；
- 哪些检测、灰度或回滚防线缺失；
- 为什么当时的决策在已有信息下看起来合理；
- 哪些修复能降低发生概率或缩短恢复时间；
- Action Item 是否有 Owner、截止日期和验证方式。

“以后更小心”“加强测试”不可验证。更具体的改进是“结算 Flag 超过 5% 前，自动比较 Control 与 Treatment 的成功率，下降 2 个百分点即关闭 Flag”。

### 常见反模式

#### 只接错误 SDK，不记录 Release

能看到异常，却无法判断是否由最新发布引入，也无法可靠匹配 Source Map。

#### 把 `console.log` 当生产日志

无法集中查询、没有统一上下文、字段不可控，也容易泄露数据。

#### 捕获所有 DOM 和请求体

数据越多不代表越可观测；这会制造隐私、成本和噪声风险。

#### 每条事件独立随机采样

同一用户旅程无法关联，漏斗、错误和 Trace 互相失去上下文。

#### Metric Label 使用 User ID 或完整 URL

高基数导致时间序列爆炸。需要用路由模板和有限 Cohort 聚合。

#### Source Map 和 Bundle 公开放在一起

调试方便，却无意公开原始源码内容。应上传到受控平台并关联 Release。

#### Flag 只负责打开，不负责删除

永久分支增加认知负担和测试组合，最终没人知道 Control 是否还能工作。

#### 只看技术指标

页面没有抛异常不代表用户完成了目标。发布门禁必须包含业务成功率。

#### 所有异常都 Page

造成告警疲劳。Page 应同时满足用户影响、紧迫性和可行动性。

#### 遥测失败阻塞业务

诊断系统反而成为生产故障来源。上报应有超时、容量边界和 Fail Open 策略。

### 完整示例目录

```text
examples/frontend/production-observability/
├── batch-transport.ts
├── bootstrap.ts
├── contracts.ts
├── feature-flags.ts
├── global-errors.ts
├── incident-runbook.md
├── instrumented-fetch.ts
├── release-gate.test.mts
├── release-gate.ts
├── release-policy.json
├── release-workflow.yml
├── sampling.ts
├── sanitize.ts
├── telemetry.ts
├── upload-source-maps.mts
└── vite-build-fragment.ts
```

迁入真实项目时需要替换：遥测端点、Release 注入方式、事件 Schema、隐私白名单、采样率、Flag Provider、SLO、灰度脚本和事故联系人。示例中的 API Origin、阈值与业务名只是可执行结构，不是通用生产配置。

### 生产就绪检查清单

#### 数据契约与隐私

- Envelope 有 Schema Version；
- Release 唯一对应不可变产物；
- URL 使用路由模板，不采集 Query 和 Hash；
- Token、Cookie、表单、DOM 文本默认排除；
- 事件字段有白名单、保留期和访问控制；
- Metric Label 经过基数评审。

#### 捕获与传输

- 同步异常、Promise 拒绝和资源失败分别处理；
- Vue/React/Router 局部边界提供用户降级；
- 队列有数量、字节、时间和重试上限；
- 页面隐藏时尽力 Flush；
- 遥测失败不会阻塞业务或递归上报；
- 遥测流水线自身有接收和丢弃指标。

#### Trace 与 Source Map

- 只向受信任 Origin 传播 Trace Context；
- 网关和后端继续同一 Trace；
- Source Map 在部署前上传并严格匹配 Release；
- `.map` 不作为普通静态资源公开；
- Error Fingerprint 使用还原后的稳定 Frame。

#### 发布治理

- Feature Flag 使用稳定分桶并记录真实曝光；
- Flag 不承担服务端权限；
- Flag 有 Owner 和删除日期；
- 灰度步骤、观察时间和最小样本预先定义；
- 门禁同时比较绝对值、基线、性能与业务结果；
- Kill Switch、回滚和 CDN/Service Worker 策略经过演练。

#### 告警与事故响应

- 告警对应用户影响和可执行动作；
- 告警包含 Release、Cohort、Dashboard 和 Runbook；
- Incident Commander、沟通和记录职责明确；
- 恢复使用真实用户和业务指标验证；
- Postmortem Action Item 有 Owner、期限和验证条件。

## 小结

完整的前端生产闭环可以概括为：

```text
稳定事件契约
  → 浏览器端最小化与清洗
  → 一致采样、批处理和尽力传输
  → Release、Source Map 与 Trace 关联
  → 技术 SLI + 业务 SLI 发现影响
  → Feature Flag 与灰度限制爆炸半径
  → 自动门禁决定 Promote/Pause/Rollback
  → 告警与 Runbook 驱动止损
  → Postmortem 改进系统防线
```

可观测性的目标不是收集最多数据，而是在风险、成本和隐私边界内，快速回答生产问题。生产治理的目标也不是保证永不失败，而是尽早发现、限制影响、快速恢复，并让每次事故都改善下一次发布的防线。

## 参考资料

- [MDN：Window error event](https://developer.mozilla.org/en-US/docs/Web/API/Window/error_event)
- [MDN：Window unhandledrejection event](https://developer.mozilla.org/en-US/docs/Web/API/Window/unhandledrejection_event)
- [MDN：Navigator.sendBeacon](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon)
- [MDN：PerformanceObserver](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver)
- [MDN：Reporting API](https://developer.mozilla.org/en-US/docs/Web/API/Reporting_API)
- [W3C：Trace Context](https://www.w3.org/TR/trace-context/)
- [OpenTelemetry：JavaScript](https://opentelemetry.io/docs/languages/js/)
- [OpenTelemetry：Browser](https://opentelemetry.io/docs/languages/js/getting-started/browser/)
- [OpenTelemetry：Exporters](https://opentelemetry.io/docs/languages/js/exporters/)
- [OpenFeature：Evaluation Context](https://openfeature.dev/specification/sections/evaluation-context/)
- [Ecma International：ECMA-426 Source Map Format](https://ecma-international.org/publications-and-standards/standards/ecma-426/)

下一节：[前端设计系统与跨框架组件平台](./design-system-tokens-accessibility-and-cross-framework-components.md)
