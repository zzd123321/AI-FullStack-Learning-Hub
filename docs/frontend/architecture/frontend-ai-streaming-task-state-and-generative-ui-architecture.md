---
title: 前端 AI 应用的流式交互、任务状态与生成式 UI 架构
description: 从浏览器流解析、任务状态机和会话模型出发，掌握工具审批、结构化输出、生成式 UI、安全、可访问性与生产治理
---

# 前端 AI 应用的流式交互、任务状态与生成式 UI 架构

AI 产品的前端不只是“输入框 + Markdown”。一次回答可能持续几十秒，期间会产生文本增量、工具调用、引用、结构化数据、审批请求和错误；用户还会停止、重试、切换会话、刷新页面或在生成中继续输入。

如果把所有事情都表示成一个不断追加的字符串，很快会遇到：

- 旧请求的迟到 chunk 写进新回答；
- 点击停止后浏览器停了，但后端任务仍在执行；
- 工具调用被当成文本，无法展示审批与执行结果；
- 未完成回答被当作正式消息持久化；
- Markdown、链接或生成组件造成 XSS 与越权操作；
- 每个 token 都触发框架渲染，页面掉帧且读屏器持续播报；
- 页面刷新后无法判断任务完成、失败还是仍在后台运行。

本课建立供应商无关的前端核心，并以 OpenAI Responses API 的流式事件作为一个适配案例。供应商事件只进入 adapter，组件、状态机和生成式 UI 不直接依赖具体 SDK。

## 学习目标

完成本课后，你应该能够：

- 设计浏览器 → 自有后端 → 模型服务的安全边界；
- 正确解析被任意网络 chunk 切分的 SSE/文本流；
- 用显式状态机表示提交、流式、工具等待、完成、失败和取消；
- 用请求 ID 阻止旧任务结果污染新界面；
- 区分停止读取、取消后端任务和供应商任务终止；
- 将文本、引用、工具与错误建模为有类型的消息 parts；
- 为工具调用设计审批、幂等和权限边界；
- 用结构化输出与组件白名单实现安全生成式 UI；
- 处理 Markdown、链接、引用、Prompt Injection 与数据泄露；
- 建立流式性能、可访问性、测试、观测和成本治理。

## 一、先画清信任边界

生产架构不应让浏览器直接持有模型供应商的长期密钥：

```text
浏览器
  ├─ 用户身份、输入、取消、审批 UI
  └─ 只访问自有后端
          ↓
应用后端 / BFF
  ├─ 身份与权限
  ├─ 配额、限流、审计
  ├─ Prompt/工具编排
  ├─ 供应商 API 密钥
  ├─ 内容安全与数据策略
  └─ 将规范化事件流返回浏览器
          ↓
模型与工具服务
```

把密钥放进 Vite 环境变量并不安全。任何打进浏览器 bundle 的值都可以被用户读取，变量名前缀只控制构建工具是否暴露，不提供秘密存储。

前端提交的是产品级请求，例如：

```json
{
  "requestId": "req_01...",
  "conversationId": "conv_42",
  "input": "解释事件循环",
  "attachments": ["upload_7"]
}
```

它不应自由指定系统 Prompt、任意工具端点、其他用户文件 ID、供应商密钥或无限输出预算。后端根据已认证用户和服务端策略构造真正的模型请求。

配套契约：

<<< ../../../examples/frontend/ai-streaming-ui/frontend-ai-contract.md

## 二、流式响应不是“打字动画”

非流式请求只有等待与完整结果；流式请求将首个可用信息提前交给用户：

```text
request accepted
→ response created
→ output item added
→ text delta × N
→ tool call / structured item
→ response completed 或 error
```

流式改善的是感知延迟，并不必然降低总耗时或成本。它还增加部分输出安全、取消、断流恢复和 UI 一致性的复杂度。

### OpenAI Responses API 的事件边界

OpenAI 官方流式指南说明，Responses API 通过 SSE 提供带 `type` 的语义事件。文本场景常见事件包括：

- `response.created`；
- `response.output_text.delta`；
- `response.completed`；
- `error`。

工具与其他输出项还会产生额外事件。前端不能假设每个 SSE frame 都是文本 delta，也不应把未知事件直接显示为 `[object Object]`。

示例 adapter 把供应商事件转换为应用内部小协议：

<<< ../../../examples/frontend/ai-streaming-ui/provider-event-adapter.ts

adapter 有三个价值：

1. 供应商升级时只修改一个边界；
2. reducer 测试不需要构造庞大的供应商对象；
3. 产品可以统一多供应商或 Mock 的事件语义。

示例只实现本课需要的事件子集。生产代码应依据当前官方 schema 完整校验，并决定未知事件是忽略、记录还是终止请求。

## 三、网络 chunk 与语义事件不是一回事

Fetch 的 `ReadableStream` 返回任意大小的字节 chunk：

- 一个 UTF-8 字符可能跨两个字节 chunk；
- 一条 SSE event 可能跨多个文本 chunk；
- 一个 chunk 也可能同时包含多条 event；
- `data:` 可以有多行；
- `\r\n` 和 `\n` 都可能出现；
- 注释行可用于 heartbeat。

因此不能这样解析：

```ts
const { value } = await reader.read()
JSON.parse(new TextDecoder().decode(value)) // 错误：chunk 不是完整 JSON
```

正确流程是：

```text
Uint8Array chunks
→ TextDecoderStream（保留跨 chunk UTF-8 状态）
→ SSE frame parser（保留不完整 frame）
→ JSON runtime validation
→ provider adapter
→ application event
```

完整的增量 SSE parser：

<<< ../../../examples/frontend/ai-streaming-ui/sse-parser.ts

测试故意把中文 JSON 从中间拆开，并覆盖 CRLF、多行 data、注释和不完整结尾：

<<< ../../../examples/frontend/ai-streaming-ui/sse-parser.test.mts

若自有后端使用 NDJSON、自定义 length-prefix 或 WebSocket，替换 parser 即可；任务 reducer 不应改变。

## 四、请求客户端：取消、错误和资源所有权

浏览器流客户端负责：

- 发出带稳定 `requestId` 的自有后端请求；
- 检查 HTTP 状态与 body 是否可流；
- 将 `AbortSignal` 传递给 fetch；
- 顺序读取、解析并投递应用事件；
- 在结束时释放 reader；
- 将网络失败与业务 error event 区分。

<<< ../../../examples/frontend/ai-streaming-ui/stream-client.ts

### `AbortController` 真正保证了什么

`controller.abort()` 可以中止浏览器 Fetch 与 body 读取，但不能单独证明：

- 自有后端已经停止工作；
- 后端向供应商发出的请求已取消；
- 工具副作用已经回滚；
- 已产生的 token 不再计费。

若产品需要端到端取消，应设计明确协议：浏览器中止读取，同时调用取消端点或让连接关闭信号传播；后端记录任务状态并尽力取消下游。界面应说“已停止显示”还是“任务已取消”，取决于真实保证。

### 组件卸载不一定应该取消任务

短回答可能由页面组件拥有，离开页面就取消；长研究任务可能由应用级任务中心拥有，路由切换后继续运行。先决定 ownership，再决定 AbortController 放在组件、Store、Provider 还是后台任务服务。

## 五、任务状态机：不要堆叠布尔值

`isLoading`、`isStreaming`、`isError`、`isToolRunning` 四个布尔值能组成大量非法状态。显式状态更可靠：

| 状态 | 含义 | 允许操作 |
| --- | --- | --- |
| idle | 没有活动任务 | 提交 |
| submitting | 后端尚未确认开始 | 取消 |
| streaming | 正在接收可见增量 | 取消、复制已生成部分 |
| waiting-tool | 等待审批或工具结果 | 审批、拒绝、取消 |
| completed | 完整结果已确认 | 复制、反馈、重试 |
| failed | 任务失败 | 查看原因、重试 |
| cancelled | 用户或系统停止 | 重新生成 |

消息内容也不应只有一个字符串：

<<< ../../../examples/frontend/ai-streaming-ui/types.ts

### 请求身份比“当前 loading”更重要

用户提交 A，立即取消并提交 B；A 的网络错误稍后到达。如果 reducer 不比较请求身份，A 会把 B 标成失败。

<<< ../../../examples/frontend/ai-streaming-ui/task-reducer.ts

该 reducer：

- `submit` 原子建立新身份与空输出；
- 相同 request 的相邻 text delta 合并成一个 part；
- 迟到的其他 request 事件保持 state 引用不变；
- 工具出现时转入 `waiting-tool`；
- 时间由 action 注入，纯 reducer 不读取系统时钟。

<<< ../../../examples/frontend/ai-streaming-ui/task-reducer.test.mts

框架层只把 state 映射到 Vue/React 模板。网络、计时和工具执行都是 Effect，不写进 reducer。

## 六、批量提交增量，避免逐 token 重渲染

供应商 delta 不一定等于 token，但频率仍可能很高。每个 delta 都触发整棵消息树 diff、Markdown 解析、代码高亮和滚动，会占满主线程。

推荐两阶段：

```text
网络事件 → 内存 accumulator（立即、轻量）
                  ↓ requestAnimationFrame / 20~50ms batch
             UI state commit → 渲染
```

优化原则：

- 每次 batch 合并文本，而非保留上万个碎片；
- 代码高亮延迟到代码块闭合或生成完成；
- Markdown AST 可增量缓存，但先测量；
- 历史长会话虚拟化，当前流式消息保持稳定 DOM 身份；
- 大型结构化结果交给 Worker 解析前先证明主线程有长任务；
- 记录首事件、首文本、完成时间和渲染延迟。

不要人为一个字符一个字符播放已经到达的文本，这会增加积压并让用户更慢看到内容。

## 七、会话模型：UI 消息不等于模型上下文

至少区分：

- UI conversation：用户在产品中看到的消息、状态和反馈；
- model context：真正发送给模型的输入、工具结果和压缩摘要；
- provider state：供应商 response/conversation ID；
- audit record：权限、版本、用量和安全决策。

<<< ../../../examples/frontend/ai-streaming-ui/conversation-model.ts

未完成流可能只存在于临时状态。若要支持部分结果恢复，应明确保存为 `interrupted`，不能伪装成 `confirmed`。

### OpenAI 会话延续只是后端适配

Responses API 支持使用 `previous_response_id` 延续上下文，也可以由应用手动管理输入；官方文档同时说明相关存储和 token 计费语义。前端不应据此把供应商 ID 当作自己的会话主键。

产品数据库仍应保存自己的 conversation/turn ID、用户权限、供应商适配元数据和迁移策略。更换模型、禁用供应商存储或重建上下文时，应用身份必须稳定。

### 编辑、重试与分支

“重新生成”不是覆盖原消息，最好建立分支：

```text
user turn U1
  ├─ assistant A1（原回答）
  └─ assistant A2（重新生成）
```

编辑旧用户消息同样创建新分支。这样才能正确审计、反馈、恢复和比较，而不是让后端上下文与界面历史悄悄分叉。

## 八、工具调用是状态化工作流

模型提出工具调用，不代表浏览器应该立即执行。完整生命周期是：

```text
arguments streaming
→ arguments complete + runtime validation
→ permission/policy check
→ optional user approval
→ running
→ success / failure / timeout
→ result returned to model
→ model continues response
```

OpenAI function calling 使用 `call_id` 关联 `function_call` 与后续 `function_call_output`。这个 ID 是调用协议身份，不是业务幂等键；产生真实副作用时，后端还要有自己的 idempotency key。

前端只展示经过后端校验的 proposal，并返回审批决定：

<<< ../../../examples/frontend/ai-streaming-ui/tool-approval.ts

### 审批界面必须让人理解影响

不要只显示“是否允许工具？”。至少展示：

- 工具的产品名称，而非内部函数名；
- 将读取/修改的对象与范围；
- 关键参数的可读摘要；
- 是否可撤销、是否对外发送；
- 当前登录身份；
- 允许一次还是会话内持续允许。

删除、支付、发送邮件、发布内容等高影响操作应在执行前确认最终参数。模型文本中的“用户已经同意”不是授权证据。

### 工具结果也不可信

网页、文档、邮件和第三方 API 可能包含 Prompt Injection。工具结果应标记来源、限制长度、按权限裁剪；模型基于工具结果建议动作时，后端仍要独立授权。

## 九、结构化输出与生成式 UI

生成式 UI 不应让模型输出任意 HTML、Vue template 或组件 import。更安全的方式是让模型输出一个受限、版本化的 UI AST：

```json
{
  "type": "course-card",
  "courseId": "ts-01",
  "title": "TypeScript 类型系统"
}
```

前端只从白名单 registry 选择本地受信组件：

<<< ../../../examples/frontend/ai-streaming-ui/generative-ui.ts

示例为了聚焦架构只检查 discriminant；生产环境必须按每种 block 完整校验字段、长度、枚举、数组上限和引用 ID，并拒绝额外属性。

OpenAI 官方结构化输出指南区分：

- function calling：连接模型与应用工具/数据；
- Structured Outputs：让模型面向用户的输出符合 JSON Schema。

它们能提高 schema 一致性，但不能证明内容真实、引用有权限或动作安全。Schema validation 之后仍要做领域校验。

### 组件白名单为什么重要

白名单保证模型只能组合产品预先实现的能力：

- 组件本身经过可访问性、安全和响应式测试；
- 事件回调由应用注入，模型不能提供 JavaScript；
- 数据 ID 经过当前用户权限查询；
- 未知 block 可降级为文本/错误卡，而不是崩溃整个回答；
- schema 与 registry 有共同版本，支持灰度与历史回放。

## 十、把模型输出当作不可信输入

### 1. Markdown 不自动安全

风险包括原始 HTML、`javascript:` URL、事件属性、SVG、Data URL、外链跟踪像素和超大内容。最安全基线是纯文本：

<<< ../../../examples/frontend/ai-streaming-ui/safe-content.ts

需要 Markdown 时：

1. 使用维护良好的 parser；
2. 禁用原始 HTML，或使用严格 sanitizer；
3. URL 只允许明确协议；
4. 外链使用 `noopener noreferrer` 并清晰标识；
5. 代码只作为文本高亮，不执行；
6. CSP 作为纵深防御，不代替 sanitization；
7. 对超长表格、嵌套列表和代码块设置渲染预算。

Vue 的插值和 React 文本节点默认会转义；一旦使用 `v-html` 或 `dangerouslySetInnerHTML`，这个保护就被主动绕过。

### 2. 引用是结构化证据，不是模型写出的脚注字符串

引用 part 应包含来源 ID、标题、URL、片段定位和权限信息，由后端根据工具结果建立。前端要能打开原文、显示来源不可用状态，并避免把模型编造的 `[1]` 当作可信证据。

### 3. Prompt Injection 不是前端 XSS

XSS 试图让浏览器执行恶意代码；Prompt Injection 试图让模型忽略指令、泄露数据或调用工具。二者防线不同，但可能串联：不可信工具内容诱导模型生成危险链接，前端再不安全渲染。

需要同时实施：浏览器输出编码、后端工具权限、数据最小化、审批、来源隔离和安全评估。

## 十一、滚动体验：不要和用户争夺视口

每次 delta 都无条件 `scrollIntoView()` 会让正在阅读上文的用户被拖到底部。正确策略：

- 用户原本接近底部时保持跟随；
- 用户向上滚动后暂停自动跟随；
- 显示“回到最新内容”按钮；
- 内容完成或工具卡展开时仍尊重用户位置；
- 不依赖平滑滚动制造持续动画。

<<< ../../../examples/frontend/ai-streaming-ui/scroll-controller.ts

真实组件应监听容器滚动，并在 DOM batch commit 后调用 `onContentCommitted`。路由切换还要保存/恢复每个会话的阅读位置。

## 十二、可访问的流式输出

若把整个回答放进 `aria-live`，每次 delta 都可能让读屏器从头朗读。推荐：

- 消息列表使用正常语义结构与清晰角色标签；
- 独立、简短的 live region 节流播报“正在生成”“调用工具”“回答完成”；
- 不逐 token 播报正文；
- 停止按钮在生成期间可通过键盘访问并有稳定名称；
- 工具审批使用对话框语义、初始焦点和焦点返回；
- 错误与内容过滤说明下一步，而非只用红色；
- 动画遵守 `prefers-reduced-motion`。

节流 announcer：

<<< ../../../examples/frontend/ai-streaming-ui/live-announcer.ts

组件卸载必须 `dispose`，否则旧会话 timer 会继续修改隐藏区域。

## 十三、错误不是一个字符串

至少区分：

| 类型 | 是否适合自动重试 | UI |
| --- | --- | --- |
| 输入校验 | 否 | 指向具体输入 |
| 未认证/无权限 | 否 | 登录或申请权限 |
| 限流/容量 | 按 Retry-After | 倒计时与稍后重试 |
| 网络中断 | 视幂等性 | 保留输入和部分输出 |
| 供应商暂时失败 | 有预算退避 | 重试或降级模型 |
| 内容安全拒绝 | 通常否 | 清晰边界与改写建议 |
| 工具失败 | 视工具语义 | 重试工具、跳过或终止 |
| 解析/协议错误 | 否，先观测 | 通用失败并上报版本 |
| 用户取消 | 否 | 显示已停止，可重新生成 |

### 部分输出怎么处理

网络在回答中途断开时，产品可：

- 保留并标记“回答未完成”；
- 若后端任务仍存在，通过任务 ID 重新订阅；
- 从服务端确认的最终消息替换临时投影；
- 重新生成新分支，而不是无条件把新文本接到旧半句后。

HTTP 流通常不能从任意 token 自动续传。恢复能力必须由后端任务日志、事件序列或最终结果查询提供。

## 十四、并发与输入策略

产品要明确用户在生成中再次提交时的行为：

- 禁止并提示先停止；
- 自动取消旧请求再开始新请求；
- 排队为同一会话下一 turn；
- 创建并行分支；
- 作为 steering 输入影响当前 agent 任务。

不要让按钮行为由竞态偶然决定。每种策略都要定义 request ID、上下文基线、取消和持久化语义。

附件上传也应与生成解耦：文件先获得服务端 upload ID并通过权限/扫描，生成请求只引用当前用户有权访问的 ID。对象 URL 在预览销毁时释放。

## 十五、内容安全与高风险操作

OpenAI 官方安全指南建议使用内容审核和人类监督，尤其在高风险领域和代码生成场景。流式输出更难审核，因为部分文本在完整语义形成前已经展示。

产品需要按风险选择：

- 输入先审核，输出完成后审核；
- 高风险场景缓冲句子/完整输出，审核后再展示；
- 低风险场景允许流式，但可中断、遮罩或事后处理；
- 对医疗、法律、金融或执行代码提供原始来源与人工确认；
- 工具副作用始终由权限与审批控制，而非只靠 Prompt。

不要在前端公开内部安全规则、系统 Prompt 或可被利用的详细拦截原因。界面应对用户透明到足以纠正输入，同时避免泄露防御实现。

## 十六、性能、成本与上下文治理

### 1. 前端性能指标

- Time to request accepted；
- Time to first semantic event；
- Time to first visible text；
- inter-delta gap；
- UI commit/render latency；
- long task 与掉帧；
- complete/cancel 端到端延迟；
- 长会话 DOM、内存与滚动性能。

首字节快不等于首个有用文本快：created、reasoning 或工具准备事件可能先到。指标名称必须准确。

### 2. 成本不是只在后端看账单

前端可影响：

- 用户重复点击导致并发生成；
- 隐藏页面继续生成；
- 失败重试没有幂等与预算；
- 每一轮无上限附带完整历史；
- 自动工具循环没有最大步数；
- 生成结果未缓存或无法复用。

界面应防重复提交、显示长任务状态并提供停止；真正的 token、工具、用户和租户预算由后端强制执行。

### 3. 上下文窗口不是数据库

长对话需要选择：裁剪旧轮次、结构化摘要、检索相关信息或开启新会话。摘要是有损派生数据，应保留来源范围和版本；用户可见历史也不必全部进入每次模型上下文。

## 十七、缓存、SSR 与页面生命周期

生成 POST 响应通常不应被共享 HTTP/CDN 缓存。需要确保：

- 认证用户流不会被中间层错误复用；
- Service Worker 不把私有生成响应缓存为公共资源；
- 页面离开/刷新时 pending 状态有明确恢复策略；
- SSR 只渲染已确认历史，客户端临时流不参与 Hydration 基线；
- 后台标签页降频 UI 更新，但不要仅因 `visibilitychange` 就宣称任务取消；
- `pagehide` 不是可靠的“发送最终消息”时机。

长任务推荐后端任务 ID + 查询/订阅恢复，而非要求一条 HTTP 连接永不间断。

## 十八、测试策略

### 1. Parser 与 adapter

覆盖：

- UTF-8 与 event 在所有可能边界拆分；
- 一个 chunk 多个 frame；
- CRLF、注释、多行 data；
- 不完整 JSON、不完整 frame、未知事件；
- 超大 frame 和容量上限；
- OpenAI adapter 的文本、工具、完成与错误映射。

### 2. 状态机属性

- 旧 request 事件永不改变当前 state；
- cancel 后迟到 delta 被忽略或由终态规则拒绝；
- completed/failed 只能进入合法终态；
- 相邻文本合并不改变最终内容；
- 工具调用 ID 唯一且结果关联正确；
- 重试创建新分支而不覆盖审计历史。

示例 reducer 已验证连续 delta、迟到事件、工具等待与取消。

### 3. 集成与 E2E

用可控测试服务分段发送真实流，测试：

- 首事件前取消；
- 中文字节中间断开；
- 生成一半网络失败；
- 工具审批、拒绝、超时和重复点击；
- 切换会话后旧流继续到达；
- Markdown 恶意 HTML/URL；
- 用户向上滚动时不被拉回；
- 键盘停止、审批和 live region；
- 刷新后恢复后台任务。

不要在普通 CI 中依赖真实模型的自然语言逐字快照。协议层使用 fixture，少量供应商契约测试验证真实事件 schema，产品质量另用 evals。

### 4. AI Evals 与前端测试互补

- 前端测试：状态、渲染、权限交互、取消和无障碍；
- schema/契约测试：事件和结构化输出可解析；
- evals：回答质量、工具选择、引用正确性和安全行为；
- 线上观测：真实延迟、失败、成本和用户反馈。

DOM 测试通过不能证明答案正确，模型 eval 通过也不能证明审批按钮不会重复提交。

## 十九、可观测性与隐私

建议用关联 ID连接：

```text
frontend requestId
→ backend taskId / traceId
→ provider responseId
→ tool callId + business idempotency key
```

前端记录状态转换、时间点、事件计数、渲染延迟、取消来源和错误类别，但默认不记录完整 Prompt、模型输出、附件文本和工具秘密。

隐私治理要明确：

- 哪些数据发送给模型/工具；
- 会话和供应商对象保存多久；
- 用户能否删除、导出；
- 日志与回放是否脱敏；
- 反馈按钮是否连同内容上传；
- 多租户缓存、引用和文件权限是否隔离。

OpenAI 的 `previous_response_id`、conversation 与 `store` 是供应商状态能力；具体保留与数据策略应以当前官方文档和组织配置为准，不能靠前端假设。

## 二十、渐进落地路线

### 阶段一：可靠文本流

- 自有后端保管密钥；
- request ID + AbortController；
- 正确 parser + typed adapter；
- 显式任务状态与安全纯文本；
- 错误、取消和性能指标。

### 阶段二：产品级会话

- confirmed/pending 消息；
- 服务端会话与分支；
- 刷新恢复、反馈、引用；
- Markdown sanitizer、长会话虚拟化；
- 配额、安全和隐私策略。

### 阶段三：工具与生成式 UI

- 工具 registry、运行时 schema、权限；
- 审批、幂等、审计与结果状态；
- Structured Output + UI AST；
- 组件白名单与版本兼容；
- 故障注入、evals 与灰度。

不要一开始就让模型生成任意组件和执行写工具。先建立可取消、可追踪、可安全失败的文本流。

## 二十一、常见失败模式

### 失败一：在浏览器调用供应商并打包 API Key

密钥对用户可见，权限、成本和安全策略也无法可靠执行。请求必须经过自有后端。

### 失败二：按网络 chunk `JSON.parse`

chunk 不等于 frame。使用增量 TextDecoder 和协议 parser。

### 失败三：只有 `isLoading`

无法表达工具等待、部分完成、取消与恢复。使用带请求身份的状态机。

### 失败四：停止按钮只隐藏 spinner

任务继续消耗资源。至少中止读取，并建立后端取消/状态确认协议。

### 失败五：每个 delta 全量 Markdown 高亮

主线程被解析、DOM 与滚动占满。合并 delta、按帧提交并延迟昂贵增强。

### 失败六：模型输出直接 `innerHTML`

模型和工具内容均不可信。文本编码、Markdown 限制、sanitizer、URL allowlist 与 CSP 分层防御。

### 失败七：模型提出工具就自动执行

Prompt Injection 可转化为真实副作用。后端校验权限，高风险操作展示最终参数并审批。

### 失败八：Structured Output 等于可信数据

它约束形状，不保证事实、权限和业务不变量。schema 后继续领域校验。

### 失败九：把所有历史每轮重发

延迟和成本持续增长，旧恶意内容也永久留在上下文。建立裁剪、摘要、检索和会话重启策略。

### 失败十：流式内容逐 token 播报

辅助技术用户无法阅读。节流状态播报，正文完成后提供普通可导航内容。

## 二十二、上线检查清单

- [ ] 供应商密钥只存在于可信后端；
- [ ] 前端不能自由选择任意工具、系统 Prompt 或无限预算；
- [ ] 网络 chunk、SSE frame、供应商 event 和应用 action 已分层；
- [ ] 每个任务有 request ID，迟到事件不会污染当前任务；
- [ ] submitting、streaming、waiting-tool、completed、failed、cancelled 可区分；
- [ ] 停止读取、取消后端和下游终止的真实保证已写清；
- [ ] 流式增量按批提交，不逐 token 重跑昂贵渲染；
- [ ] 未完成、失败与确认消息的持久化语义明确；
- [ ] 工具参数运行时校验，副作用有权限、审批和幂等；
- [ ] 生成式 UI 只使用版本化 schema 与组件白名单；
- [ ] Markdown、URL、代码、引用和附件按不可信输入处理；
- [ ] 滚动不抢夺用户视口，读屏器不逐 delta 播报；
- [ ] 限流、安全拒绝、工具失败、断流与部分结果有独立 UI；
- [ ] 刷新、路由切换和后台任务有恢复策略；
- [ ] 测试覆盖任意 chunk 切分、取消竞态、旧请求和恶意内容；
- [ ] 延迟、渲染、成本、安全和隐私指标可观测。

## 总结

AI 前端的核心抽象不是聊天气泡，而是一个长期、异步、可能调用工具的任务系统：

- 自有后端守住密钥、权限、预算和供应商差异；
- parser 把任意网络 chunk 还原为语义事件；
- adapter 把供应商事件变成稳定应用协议；
- request-aware 状态机保护并发、取消和迟到结果；
- typed parts 表达文本、引用、工具和错误；
- Schema 与组件白名单让生成式 UI 保持可控；
- 安全渲染、审批和领域校验阻止模型输出变成越权代码；
- 批渲染、滚动控制和节流播报保障真实用户体验；
- 测试、eval、观测与隐私治理共同支撑生产运行。

先把任务生命周期和信任边界设计正确，再增加 Markdown、工具、语音或炫目的生成组件，系统才不会随着能力增加而失控。

## 参考资料

- [MDN：Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API)
- [MDN：TextDecoderStream](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoderStream)
- [MDN：AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
- [WHATWG HTML：Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [OpenAI：Streaming API responses](https://developers.openai.com/api/docs/guides/streaming-responses)
- [OpenAI：Conversation state](https://developers.openai.com/api/docs/guides/conversation-state)
- [OpenAI：Function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [OpenAI：Structured model outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI：Safety best practices](https://developers.openai.com/api/docs/guides/safety-best-practices)
- [OpenAI Help：Best practices for API key safety](https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety)
