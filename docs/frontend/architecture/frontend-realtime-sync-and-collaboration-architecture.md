---
title: 前端实时同步与多人协作架构
description: 系统掌握实时传输、顺序与幂等、快照增量、乐观更新、断线恢复、冲突合并、Presence、OT、CRDT 与生产治理
outline: deep
---

# 前端实时同步与多人协作架构

“接上 WebSocket”只解决服务器和浏览器之间存在一条双向连接，并没有解决状态一致性。真实协作系统还必须回答：

- 消息重复、乱序或丢失时，客户端怎样发现并恢复？
- 本地乐观修改尚未确认时，远端更新到达，界面应该显示什么？
- 两个人同时改标题、移动卡片或编辑同一段文字，结果由谁决定？
- 标签页休眠、网络切换、服务端部署或鉴权过期后，怎样安全重连？
- “Alice 正在输入”为什么不能当作文档事实？
- 什么时候版本号和服务端仲裁已经足够，什么时候才需要 OT 或 CRDT？

这节课不重复 IndexedDB 与 Outbox 的存储细节，而是从多客户端并发和实时协议出发，建立一条可验证的“本地意图 → 服务端确认 → 多副本收敛”流水线。

## 学习目标

完成本课后，你应该能够：

- 根据通信方向、延迟、兼容性和流量选择轮询、SSE、WebSocket 或 WebRTC；
- 区分连接状态、同步状态、持久化状态和用户可见状态；
- 用命令 ID、revision、流序列、快照和幂等建立可恢复协议；
- 在远端更新到达后重新应用仍待确认的乐观命令；
- 设计有上限、有抖动、能停止的断线重连策略；
- 区分业务冲突、传输重复、并发编辑和权限拒绝；
- 理解 OT 与 CRDT 的核心保证、代价和适用边界；
- 正确处理 presence、跨标签页所有权、安全、测试和可观测性。

## 先把实时协作当作分布式状态机

最关键的认知变化，是从“收到消息就更新页面”转向“多个副本通过不可靠网络推进状态”。连接只是输入来源，真正要维护的是哪些事实已确认、哪些意图仍在途，以及断线后凭什么恢复。

### 浏览器里已经有一个小型分布式系统

打开同一文档的两个浏览器标签页，加上服务端数据库，至少已经存在三份状态副本：

```text
客户端 A：confirmed + pending commands + visible projection
客户端 B：confirmed + pending commands + visible projection
服务端：authoritative document + accepted command IDs + event history
```

网络不保证你期待的时间关系：发送成功不等于服务端处理成功；服务端处理成功不等于确认消息已经到达；连接关闭也不能证明最后一条命令失败。

因此不要把 `socket.send()` 后的状态称为“已保存”。更准确的状态可能是：

| 状态 | 含义 | UI 示例 |
| --- | --- | --- |
| local | 只修改了内存视图 | 正在编辑 |
| queued | 意图已进入可靠本地队列 | 等待网络 |
| sent | 字节已交给传输层 | 正在同步 |
| confirmed | 服务端以命令 ID 确认 | 已同步 |
| rejected | 权限、校验或版本冲突 | 需要处理 |
| uncertain | 连接中断，不知道服务端是否接受 | 正在确认 |

最后一种状态解释了为什么重连后应以同一个命令 ID 重试，而不是生成新命令：服务端可能已经执行第一次发送，只是确认丢失。

### 先定义权威来源与一致性目标

“实时”描述延迟，“一致”描述副本关系，二者不是同一个维度。

#### 常见权威模型

**服务端权威**：客户端提交命令，服务端负责权限、校验、顺序和持久化。适合订单、工作流、看板和大多数业务表单。

**多主复制**：多个副本可离线接受写入，之后自动合并。适合本地优先笔记和去中心化协作，但需要 CRDT 等严格合并模型。

**混合模型**：文档内容可多主合并，成员权限、计费、发布状态仍由服务端权威决定。这往往比“所有东西都 CRDT”更符合业务。

#### 先写不变量

在选技术前写出不能被破坏的事实，例如：

- 已发布课程不能被无权限用户改回草稿；
- 同一个付款命令最多产生一笔业务效果；
- 文档内容最终收敛，但在线成员列表允许短暂过期；
- 用户的本地文字不能被无提示静默丢弃；
- 客户端不能自行宣布权限或服务端 revision。

可用性、延迟和自动合并不能凌驾于业务不变量之上。

配套协议契约集中记录这些边界：

<<< ../../../examples/frontend/realtime-collaboration/sync-contract.md

## 从传输通道建立可恢复协议

知道谁有权决定最终状态后，才能设计消息怎样到达。SSE、WebSocket 只负责运送数据；版本、顺序、幂等、快照和增量共同回答“这份状态能否被证明和恢复”。

### 选择传输：方向和语义比“实时感”重要

| 方式 | 方向 | 优势 | 主要限制 | 适合 |
| --- | --- | --- | --- | --- |
| 定时轮询 | 客户端请求/服务端响应 | 最简单，HTTP 基础设施成熟 | 空轮询、延迟与惊群 | 低频状态 |
| 长轮询 | 一次请求等待变化 | 兼容普通 HTTP | 连接轮换、实现复杂 | 兼容性场景 |
| SSE / EventSource | 服务端 → 客户端 | 文本事件、自动重连、事件 ID | 原生单向，主要是文本 | 通知、进度、行情 |
| WebSocket | 全双工 | 低开销双向消息 | 自定义协议、无原生背压 | 聊天、协作、游戏 |
| WebRTC DataChannel | 点对点为主 | 可绕过中心数据路径 | 信令、NAT、拓扑和安全复杂 | 音视频伴随数据、特定 P2P |

#### SSE 并不是低配 WebSocket

如果客户端写操作仍适合普通 HTTP，而服务器只需持续推送状态，SSE 可以保持更清晰的职责：

```text
POST /documents/:id/commands   客户端发送命令
GET  /documents/:id/events    EventSource 接收事件
```

SSE 使用 `text/event-stream`，可携带 `event`、`data`、`id` 和 `retry` 字段。服务端提供事件 ID 后，重连请求可使用 `Last-Event-ID` 帮助恢复，但历史保存与裁剪策略仍由应用定义。

<<< ../../../examples/frontend/realtime-collaboration/sse-client.ts

原生 `EventSource` 不能像 `fetch` 那样任意设置请求头。认证通常使用同源 Cookie或短期、受约束的连接凭据；设计前还要验证代理缓冲、空闲超时和 HTTP/1.1 每域连接限制。

#### WebSocket 只是字节/消息通道

浏览器 `WebSocket` API 提供 open、message、error、close 与 send。它不提供：

- 业务消息 schema；
- 请求/响应关联；
- 权限和幂等；
- 丢失事件回放；
- 心跳语义；
- 端到端背压；
- 自动重连和状态恢复。

经典 WebSocket API 对接收侧没有可用的背压机制。发送侧可以观察 `bufferedAmount`，但这只说明浏览器待发送字节，并不等于服务端处理能力。

示例在连接边界校验消息、声明子协议并设置待发送字节上限：

<<< ../../../examples/frontend/realtime-collaboration/websocket-transport.ts

`WebSocketStream` 使用 Streams 提供背压，但截至本课核对时仍是实验性、非标准能力，浏览器支持有限，不能作为通用生产基线。

#### Transport 与 Sync Engine 分离

推荐接口只暴露连接事件、接收消息、发送结果和关闭，不让 Vue/React 组件直接操作 socket。Sync Engine 负责：

```text
Transport：连接、字节、关闭原因
Protocol：解析、版本、消息类型
Ordering：重复、缺口、顺序
State：confirmed、pending、visible
Persistence：outbox、last sequence、snapshot
UI Adapter：状态展示、用户冲突恢复
```

这样更换 SSE/WebSocket 不会重写业务 reducer，组件卸载也不会意外销毁由应用级 Provider 共享的连接。

### 协议设计：TypeScript 类型不是网络校验

一个可靠命令至少需要：

- `protocolVersion`：支持灰度、回滚和拒绝不兼容客户端；
- `commandId`：关联确认并实现幂等；
- `documentId`：明确作用域；
- `baseRevision`：说明客户端基于哪个版本产生意图；
- 可判别的业务 patch，而非任意对象覆盖。

可回放的文档事件还需要流序列和规范化后的文档；命令拒绝按 `commandId` 关联，临时 Presence 则使用自己的短期版本，不占用文档流序列：

<<< ../../../examples/frontend/realtime-collaboration/protocol.ts

示例按可判别联合逐一校验文档、序列、拒绝原因和 Presence 字段，对应测试还会证明非法变体不能进入状态层：

<<< ../../../examples/frontend/realtime-collaboration/protocol.test.mts

生产环境仍应使用客户端与服务端共享的正式 Runtime Schema，并补充字符串长度、对象深度和业务约束。`as ServerEvent` 本身不会在运行时检查对象；消息可能来自旧服务、攻击者、损坏缓存或部署中的不同版本。

#### 协议兼容策略

- 新接收方先忽略明确可忽略的新可选字段；
- 不认识的消息类型不得直接进入状态 reducer；
- 改字段含义时提升协议版本，而非复用旧名称；
- 客户端和服务端至少跨一个发布窗口兼容；
- 快照 schema 与增量事件 schema 分别版本化；
- 记录客户端版本、协议版本和拒绝原因，便于灰度定位。

不要把数据库行结构直接作为实时协议。数据库迁移、权限裁剪和客户端兼容具有不同生命周期。

### 投递语义：不存在免费的 exactly once

网络超时后，客户端无法仅凭连接状态判断命令是否执行。实践中通常组合：

1. 客户端生成稳定 `commandId`；
2. 重试复用同一个 ID；
3. 服务端在业务事务内记录已处理 ID 与结果；
4. 重复命令返回原结果，不再次产生业务效果；
5. 客户端收到确认后才从 Outbox 移除。

这提供的是业务层幂等效果，不是传输层神奇地“只送一次”。命令 ID的保留期必须覆盖最大离线与重试窗口，否则很旧的重复请求可能再次执行。

#### 幂等与可交换不同

- 幂等：同一操作执行多次，效果与一次相同；
- 可交换：A 后 B 与 B 后 A 的结果相同；
- 可重放：从基线按日志重建时能得到确定结果。

“设置标题为 B”天然更接近幂等；“余额加 10”需要命令去重；“在索引 5 插入字符”在并发编辑中既不天然幂等，也不天然可交换。

### 流序列、revision 与因果关系

这些编号回答不同问题：

| 标识 | 回答的问题 |
| --- | --- |
| command ID | 这是同一个用户意图吗？ |
| document revision | 这份实体状态是哪一版？ |
| document stream sequence | 我是否漏掉或重复收到可恢复的文档事件？ |
| client sequence | 同一客户端意图的本地顺序是什么？ |
| vector/logical clock | 分布式更新之间有何因果或并发关系？ |

不要用客户端墙上时钟替代这些标识。设备时间会漂移、跳变和被用户修改；`updatedAt` 可用于显示，不足以证明全局顺序。

#### 检测乱序和缺口

即使单条 WebSocket 连接通常保持消息顺序，重连、多个网关、历史回放与实时事件切换仍可能制造重复和接缝问题。客户端应按应用流序列检测：

<<< ../../../examples/frontend/realtime-collaboration/ordered-event-buffer.ts

对应测试先收到 12、再收到 11，并验证连续应用和重复抑制：

<<< ../../../examples/frontend/realtime-collaboration/ordered-event-buffer.test.mts

缓冲不能无限增长。缺口超过数量或时间预算时，应停止继续猜测，请求缺失区间或新快照。

#### 流序列不必是全局整数

单一全局序列容易成为吞吐瓶颈。生产系统通常按租户、房间、文档或分片维护顺序。客户端只需知道当前订阅流的顺序边界；跨文档的全局先后往往没有业务意义。

### 快照与增量：恢复靠协议，不靠运气

完整事件历史会持续增长，因此系统通常使用：

```text
snapshot(document state, coveredSequence = 8000)
+ events(sequence > 8000)
= current state
```

快照必须说明覆盖到哪个事件位置。否则客户端在“拉快照”和“订阅实时流”的间隙可能漏事件。

常见安全握手：

1. 客户端携带最后确认序列连接；
2. 服务端判断历史是否仍保留；
3. 可回放时发送后续增量；
4. 不可回放时发送带覆盖序列的新快照；
5. 客户端原子替换 confirmed 基线，再重放未确认本地意图；
6. 之后继续消费严格连续的实时事件。

不要先清空界面再拉快照。可以保留旧视图并显示“正在重新同步”，直到新基线可原子切换。

## 用三层状态处理乐观更新与并发冲突

协议能恢复权威基线后，客户端才有条件安全地“先改界面”。乐观体验不是直接修改唯一 Store，而是在 confirmed 之上重放本地意图；冲突策略则决定哪些意图可以自动组合，哪些必须交还用户或服务端。

### 乐观更新：三层状态而不是一个对象

可靠的客户端状态可表示为：

```text
confirmed：服务端最后确认的权威状态
pending：本地尚未确认的命令序列
visible = replay(confirmed, pending)
```

远端更新到达时，不应直接覆盖 `visible`，而应更新 confirmed，再重放仍 pending 的命令：

<<< ../../../examples/frontend/realtime-collaboration/optimistic-store.ts

测试验证两个本地命令、服务端规范化标题，以及后一个命令被拒绝后的回滚：

<<< ../../../examples/frontend/realtime-collaboration/optimistic-store.test.mts

#### 这种重放何时不安全

示例 patch 是“设置某字段”，易于重放。如果命令依赖旧结构位置，例如“删除数组第 5 项”，远端插入后索引语义已经变化。更可靠的命令使用稳定实体 ID，或交给 OT/CRDT 变换。

服务端规范化、权限、唯一性和工作流规则仍是权威。乐观 UI 改善延迟感受，不是绕过服务端约束。

#### 冲突 UI 是产品能力

不能自动合并时，应保存：

- 用户本地版本；
- 服务端当前版本；
- 冲突字段及基线；
- 可执行动作：保留本地、采用远端、手动合并、另存副本。

“保存失败，请刷新”会丢失用户输入；静默最后写入获胜又可能丢掉另一位用户的工作。

### 冲突策略：从简单模型开始

#### 乐观锁与服务端仲裁

命令带 `baseRevision`。服务端仅在当前 revision 匹配时接受，否则返回 409/结构化 reject 和当前文档。它适合并发较低、冲突可由用户处理的表单与工作流。

#### 字段级合并

若两人修改不同字段，可按字段版本自动合并；同一字段并发修改再进入冲突流程。但字段并不总是独立：`startAt < endAt`、总额与明细等跨字段不变量仍需整体校验。

#### Last-Writer-Wins

LWW 按服务器序列或逻辑时间选一个赢家，简单但会丢更新。若依赖客户端时间，还会受时钟漂移影响。它适合低价值偏好或明确接受覆盖的字段，不应被包装成“无冲突”。

#### 领域命令

“把状态设为 published”不如“发布课程”表达业务意图。服务端可以验证权限、前置条件和幂等，并产生规范事件。领域命令通常比通用 JSON Patch 更适合业务系统。

### OT 与 CRDT：解决的是并发语义，不是连接问题

#### Operational Transformation

OT 在操作相对于旧文档产生后，根据并发操作变换位置/范围。例如 A 在位置 3 插入，B 在位置 5 删除；服务器确定顺序后，需要把 B 的位置转换到包含 A 插入的新文档上。

OT 的工程难点包括：

- 明确所有操作及变换对；
- 保证收敛、意图保持与因果顺序；
- 处理 ack 前本地缓冲的操作；
- 支持富文本、树结构、撤销和组合输入；
- 客户端/服务端算法版本兼容。

不要凭几条字符串 splice 规则自研生产级 OT。

#### CRDT 的核心保证

CRDT 让副本可在不事先协调的情况下接受更新，并通过满足数学性质的状态或操作合并最终收敛。当副本收到相同更新集合时，它们应确定性达到相同状态。

状态型 CRDT 的 merge 通常要求：

- 交换律：`merge(a, b) = merge(b, a)`；
- 结合律：分组不影响结果；
- 幂等律：重复合并同一状态不改变结果。

示例 G-Counter 为每个副本保存只增分量，合并取逐副本最大值，最终值为分量之和：

<<< ../../../examples/frontend/realtime-collaboration/g-counter-crdt.ts

<<< ../../../examples/frontend/realtime-collaboration/crdt-and-reconnect.test.mts

这个示例用于理解收敛定律，不是文本编辑器。文本序列 CRDT 还需要稳定位置标识、删除墓碑/版本向量、垃圾回收、光标映射、撤销和紧凑编码。

#### CRDT 不保证业务结果合理

“两个副本最终相同”不等于“不变量正确”。并发预订最后一个座位、库存扣减或权限变更不能仅靠自动 merge；这些约束通常需要服务端串行化、事务、Escrow 或其他协调机制。

CRDT 还会带来元数据、历史压缩、成员身份、离线周期和 schema 演进成本。优先使用经过验证的实现，并对真实文档规模、长时间编辑和恶意输入测试。

#### 什么时候选择什么

| 场景 | 起点 |
| --- | --- |
| 低并发表单 | revision + 409 + 冲突 UI |
| 看板/任务状态 | 服务端权威领域命令 + 字段/实体合并 |
| 中心化多人文本 | 成熟 OT 或 CRDT 引擎，依团队能力选择 |
| 长期离线、本地优先、多设备 | CRDT 更值得评估 |
| 金融、库存、权限 | 强服务端约束，不因实时 UI 放弃协调 |

## 把临时状态与连接恢复放在正确边界

文档事实需要持久、可回放，Presence 和连接状态却允许过期或丢失。把两者混在一条状态与顺序链上，会让一次光标丢包升级成文档故障，也会让崩溃用户永久“在线”。

### Presence 是可过期的提示

在线成员、光标和“正在输入”具有以下特点：

- 高频、临时、允许丢失；
- 不应进入永久文档 revision；
- 客户端崩溃时不会可靠发送“离开”；
- 旧消息晚到可能让离线用户重新出现；
- 精确光标可能泄露不必要的行为信息。

因此 presence 使用租约/TTL：客户端周期续约，超过服务端或客户端认可的过期时间即消失。

<<< ../../../examples/frontend/realtime-collaboration/presence-store.ts

实际过期时间最好由服务端生成，避免客户端时钟差异。每个客户端还应携带独立递增的 Presence Version，以忽略晚到旧位置。不要让可丢失的光标更新占用文档持久序列，否则丢一条光标也会触发文档缺口恢复。光标事件应节流或按帧合并，并按房间限制广播规模；presence 不是权限依据。

### 断线重连：恢复连接只是第一步

连接可能因 Wi-Fi/蜂窝切换、休眠、代理空闲超时、服务器滚动发布、令牌过期或网络分区而关闭。

#### 指数退避与 Full Jitter

立即无限重连会在服务恢复时形成惊群。常用 full jitter：

```text
cap = min(maxDelay, baseDelay × 2^attempt)
delay = random(0, cap)
```

<<< ../../../examples/frontend/realtime-collaboration/reconnect-policy.ts

策略还应：

- 正常关闭、策略违规和明确无权限时停止；
- 设置最大尝试或进入用户可见的手动恢复；
- 页面隐藏时降低非关键流频率；
- 网络恢复事件只作为“可以尝试”的提示，不当作在线证明；
- 新一次连接开始时取消旧 timer、listener 和握手。

#### 重连后的恢复顺序

```text
建立传输
→ 重新鉴权/确认会话
→ 携带 last confirmed sequence 和客户端能力订阅
→ 回放增量或安装快照
→ 重放/重发 pending commands（相同 command ID）
→ 收敛后标记 synced
```

只执行第一步然后显示“已连接”会误导用户。UI 应区分 connecting、resyncing、synced、offline、auth-required 和 conflict。

#### 心跳的真正作用

浏览器 JavaScript 通常无法直接发送协议级 WebSocket Ping，因此应用可使用轻量 heartbeat 消息。它帮助发现半开连接、维持部分代理活跃并估算延迟，但要避免所有客户端同一时刻发送；服务端也要有超时与容量控制。

### 多标签页：不要无意创建 N 条连接

同一用户打开十个标签页，若每页都建立连接、续约 presence 和刷新 token，会放大服务器压力，还可能让同一设备显示十个在线成员。

可选策略：

- 简单场景允许每标签页一条连接，以隔离换简单；
- SharedWorker 作为同源标签页连接中心，但需检查支持范围；
- Web Locks 选出连接所有者，BroadcastChannel 在标签页间转发事件；
- Service Worker 不适合假定永久运行的 WebSocket 所有者，其生命周期由浏览器控制。

<<< ../../../examples/frontend/realtime-collaboration/cross-tab-connection-owner.ts

Web Locks 保证的是同一 origin 执行上下文间的互斥，不是跨设备分布式锁。BroadcastChannel 没有历史回放，接任者仍必须从持久 last sequence/服务端快照恢复。

### 生命周期与框架集成

在 Vue/React 中应避免“每个组件各自 new WebSocket”。推荐：

```text
应用/工作区 Provider 拥有连接与 Sync Engine
领域 Store 订阅规范化状态
页面组件声明所需文档并派发命令
组件只拥有局部 focus、selection、draft 等 UI 状态
```

清理应与创建对称：

- 取消重连 timer 和 heartbeat；
- 移除 socket/EventSource 监听并主动 close；
- 中止快照 fetch；
- 关闭 BroadcastChannel；
- 释放 Web Lock 和 Worker；
- 取消 store 订阅；
- 清理 presence 续约。

开发模式的重复挂载会暴露所有权问题。不要用全局布尔值压制重复连接，而应把连接放到正确生命周期边界并让 connect/dispose 可重复调用。

## 让安全、背压与服务端拓扑进入设计

实时连接存活更久、消息更密集，因此普通 Web 安全和容量问题只会被放大，不会消失。前端必须理解认证如何续期、服务端怎样排序和扇出，以及慢消费者什么时候应降级或重新同步。

### 安全：长连接不会绕过 Web 安全

#### 鉴权与授权

- 建连时验证会话，但长期连接中凭证可能过期或被撤销；
- 每个命令仍按当前用户、租户、文档和动作授权；
- 加入房间不代表之后所有操作都合法；
- 服务端生成 actor 身份，不能相信客户端传来的 userId；
- 日志和错误不得广播敏感文档内容。

浏览器 WebSocket 构造器不能任意添加 `Authorization` 请求头。常见方案是安全 Cookie，或先通过 HTTPS 获取极短期、单用途连接票据。长期 token 放在查询字符串可能进入代理、监控和历史日志。

#### Origin 与跨站 WebSocket 劫持

Cookie 可能随跨站发起的握手携带。服务端应验证 `Origin`、使用合适的 Cookie 属性，并要求不可伪造的会话/连接凭据。CORS 响应头本身不是 WebSocket 授权机制。

#### 输入、容量和滥用

- 限制消息字节、频率、嵌套深度和批量大小；
- 运行时验证消息，不执行来自网络的任意表达式；
- 每房间、用户和连接设置速率与队列上限；
- 慢消费者应降采样、断开或重新快照，不能无限缓存；
- 文本协作需防止恶意构造导致算法/内存退化；
- presence、光标和显示名同样需要转义、权限和隐私控制。

### 服务端拓扑如何影响前端协议

即使本课聚焦前端，也必须理解服务端部署边界：

```text
浏览器
  → Gateway（鉴权、连接、限流）
  → Room/Document Owner（排序、应用命令）
  → Database / Event Log
  → Pub/Sub（向其他 Gateway 扇出）
```

多实例后，连接 A 接到节点 1、连接 B 接到节点 2。若仅在进程内广播，它们看不到彼此。服务端需要共享事件流、房间所有者或可验证的 pub/sub，并保证快照与实时事件接缝。

Sticky session 可以减少迁移，不会自动提供持久顺序和故障恢复。节点崩溃后仍要靠命令去重、事件日志和快照恢复。

前端协议不应依赖“这条连接永远落在同一台机器”。

### 性能与背压

实时系统有两类压力：

- 入站：事件到达快于解析、reducer 和渲染；
- 出站：用户/设备产生命令快于网络和服务端处理。

治理手段包括：

- 有界队列，超过预算触发快照或明确错误；
- 合并可覆盖事件，例如同一用户的旧光标位置；
- 文档操作不可随意丢弃，必须持久化或阻止继续编辑；
- 批量解析和按帧提交 UI，避免每条 presence 都重渲染；
- 大快照使用紧凑编码、Worker 解析和增量安装，但先测量；
- 观察 `bufferedAmount`、事件积压、apply 延迟和内存；
- 慢消费者与服务端协商降级，而非无限堆积。

对不同消息设优先级：权限撤销和文档命令高于光标动画；presence 可以丢，财务命令不可以。

## 用故障测试与治理证明系统能够恢复

正常网络上的 Happy Path 不能证明同步系统正确。测试要主动制造重复、乱序、缺口、确认丢失和权限变化；生产治理则要观察系统是否最终恢复，而不只是连接是否重新变绿。

### 测试：主动制造不可靠环境

#### 纯状态与协议测试

验证：

- 未知协议版本和非法 variant 被拒绝；
- 重复命令只产生一次业务效果；
- 乱序事件等待缺口，重复事件被忽略；
- 快照覆盖位置与增量衔接；
- ack、reject、远端更新后 pending 重放；
- presence TTL 和旧更新；
- 退避上限、随机边界和停止条件；
- CRDT merge 的交换、结合、幂等与多种排列收敛。

#### 确定性多客户端模拟

用内存传输建立 A、B、Server 三个副本，由测试控制：

- 延迟某条消息；
- 重复或打乱消息；
- 在服务端确认后丢失 ack；
- 断开 A，让 B 连续修改，再恢复 A；
- 在快照和实时订阅接缝插入事件；
- 权限在连接期间被撤销。

最终既断言副本收敛，也断言用户未确认输入是否仍可恢复。

#### 浏览器与端到端测试

使用两个独立 BrowserContext 表示两个用户，而不是两个共享所有 Cookie 的 page。验证可见协作、重连 UI、标签页休眠、刷新、身份隔离和无障碍公告。

端到端环境应能注入断网、延迟和服务端重启。只在 localhost 的稳定低延迟下测试，无法证明恢复协议。

#### 长时间和属性测试

CRDT/OT、压缩和 presence 泄漏常在数小时或数万次操作后出现。使用随机操作序列、不同交付排列和长时间 soak test，并把失败种子保存为回归用例。

### 可观测性与发布治理

客户端建议记录不含敏感正文的指标：

- connect、auth、resync 各阶段耗时；
- 连接关闭 code/reason 与重连次数；
- 最后确认序列、事件 lag、缺口和快照次数；
- pending 命令数量、最老年龄、reject 分类；
- `bufferedAmount`、入站队列与 apply 耗时；
- presence 数量和更新频率；
- 协议版本、客户端版本、文档/房间哈希标识。

不要把每次正常网络切换都当成错误事故。应按失败阶段和恢复结果分类，例如“首次连接失败”“恢复成功”“历史裁剪导致快照”“持续无法收敛”。

发布协议变更时：

1. 服务端先兼容旧/新读取；
2. 灰度新客户端并观察未知消息和拒绝率；
3. 再开始产生新格式；
4. 覆盖最大客户端存活窗口后移除旧协议；
5. 保留强制快照/只读/关闭协作的降级开关。

### 常见失败模式

#### onmessage 直接覆盖 Store

它没有协议校验、顺序检测、pending 重放和冲突语义。应让网络消息依次通过 Protocol、Ordering 和 Sync Engine。

#### close 就把所有 sent 命令标为失败

服务端可能已执行。应进入 uncertain，重连后以相同 ID 查询或重试。

#### 每次重连都从空状态开始

会闪烁、丢 pending，并反复下载大快照。应保留 confirmed、last sequence 与本地意图，再按服务端恢复响应更新。

#### 用 updatedAt 决定所有冲突

客户端时钟不可作为可靠全序；LWW 也会丢失并发意图。使用服务端 revision/sequence 或真正的逻辑时钟与合并算法。

#### 把 presence 写入文档

高频临时事件会污染持久日志与 revision，并让崩溃用户永久在线。presence 使用独立可过期通道。

#### 盲目承诺 exactly once

没有命令 ID、服务端去重事务和保留窗口，这只是营销语。应描述端到端业务效果和失败后的具体行为。

#### 自己写“简化 CRDT”上线

几个 happy-path 合并测试不能证明收敛、意图与元数据生命周期。使用成熟算法/库，并做领域不变量与长时间验证。

#### 无上限重连和缓冲

故障期间会制造惊群和内存增长。所有 retry、pending、gap、buffered bytes 和历史都要有预算与降级。

### 从普通 Vue 2 应用渐进演进

1. 先把 HTTP 写操作改成带 command ID 和 base revision；
2. 服务端返回规范化实体，前端分开 confirmed 与 draft/pending；
3. 引入事件订阅，只用于失效通知并重新查询；
4. 加入流序列和增量回放，逐步减少全量查询；
5. 抽出无框架 Sync Engine，Vuex/Pinia 仅做适配；
6. 增加离线 Outbox、冲突 UI 和恢复观测；
7. 只有真实需求证明必要时，再引入 OT/CRDT 与复杂 presence。

这条路线先提高正确性，再提高实时感，且每一步都可回滚和度量。

### 落地检查清单

- [ ] 权威来源、允许的短暂不一致和业务不变量已定义；
- [ ] Transport、Protocol、Ordering、State 与 Persistence 已分层；
- [ ] 所有网络消息有版本并经过运行时校验；
- [ ] 命令 ID、revision、流序列各自职责明确；
- [ ] 重试复用命令 ID，服务端在业务事务中去重；
- [ ] 快照说明覆盖序列，历史裁剪后能安全恢复；
- [ ] confirmed、pending 和 visible 分离并可重放；
- [ ] 冲突有自动策略或可恢复 UI，不静默丢用户输入；
- [ ] presence 独立、节流、可过期且不参与授权；
- [ ] 重连有退避、抖动、停止条件和状态恢复；
- [ ] 入站、出站、乱序和离线队列都有容量上限；
- [ ] Origin、鉴权、逐命令授权、输入限制与速率限制已落实；
- [ ] 多标签页连接策略及所有资源清理路径已验证；
- [ ] 测试包含重复、乱序、丢失、断网、重启和权限变化；
- [ ] 发布具有协议兼容窗口、指标和降级开关。

## 回到主线：允许连接失败，仍能证明状态如何恢复

可靠实时协作的核心不是保持一条永不断开的连接，而是允许连接随时断开后仍能证明状态如何恢复：

- Transport 负责传递，不负责业务一致性；
- command ID 解决重复意图，revision 保护状态前提，sequence 检测流缺口；
- 快照与增量共同提供可裁剪的恢复历史；
- confirmed + pending 重放让乐观体验不牺牲服务端权威；
- OT/CRDT 处理特定并发数据语义，但不能替代权限和业务不变量；
- presence、重连、跨标签页和背压必须有生命周期与容量边界；
- 故障注入、可观测性和协议灰度决定系统能否进入生产。

当这些边界明确后，WebSocket、SSE 或具体协作库才是可替换的实现选择，而不是架构本身。

下一节：[前端 AI 应用的流式交互、任务状态与生成式 UI 架构](./frontend-ai-streaming-task-state-and-generative-ui-architecture.md)，把可恢复消息流进一步应用到模型流式输出、长任务、工具调用和不可信生成内容。

## 参考资料

- [MDN：WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [WHATWG：WebSockets Standard](https://websockets.spec.whatwg.org/)
- [MDN：Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- [WHATWG HTML：Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [MDN：Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)
- [MDN：Broadcast Channel API](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API)
- [Preguiça、Baquero、Shapiro：Conflict-free Replicated Data Types（2018）](https://arxiv.org/abs/1805.06358)
- [Shapiro 等：Conflict-free Replicated Data Types（2011）](https://www.cs.tufts.edu/~nr/cs257/archive/marc-shapiro/CRDTs_SSS-2011.pdf)
