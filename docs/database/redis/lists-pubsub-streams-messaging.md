---
title: List、Pub/Sub 与 Streams 消息模型
description: 从消息保留、竞争消费、广播、确认和重放出发，掌握 Redis List 队列、Pub/Sub、Streams、consumer group、PEL、XACK、XAUTOCLAIM、毒消息和 Outbox
prev:
  text: 分布式锁、幂等、计数器与限流
  link: /database/redis/distributed-locks-idempotency-counters-rate-limiting
next:
  text: TTL、内存淘汰、大 key 与热 key 治理
  link: /database/redis/ttl-memory-eviction-big-hot-keys
---

# List、Pub/Sub 与 Streams 消息模型

Redis 的 List、Pub/Sub 和 Streams 都能把数据从生产者传给消费者，但它们不是同一种“消息队列”的三种写法。核心差异在于：消费者不在线时消息是否保留；多个消费者是竞争一份任务还是各收一份；处理失败后能否确认、重试和重放。

如果不先定义这些语义，只看“能不能发消息”，很容易把订单事件放进断线即丢的 Pub/Sub，或把 List 的弹出操作误认为可靠确认。

本课从一次消息的生命周期推理：产生业务事实、写入消息载体、交付给消费者、提交业务副作用、确认完成、按保留策略清理。每一步都可能失败，也可能与相邻步骤不能原子提交。

## 先回答五个选择问题

| 问题 | 可能的答案 |
| --- | --- |
| 消费者不在线时是否保留？ | 不保留、保留到消费、保留一段时间 |
| 多个消费者怎样收到？ | 竞争一份任务、每个订阅者各一份、每个消费组各一份 |
| 处理失败后怎样恢复？ | 无法恢复、放回队列、pending 后重新认领 |
| 是否需要历史重放？ | 不需要、从应用自己保存的位置读、按 Stream ID 读 |
| 数据库写入与发消息怎样保持一致？ | 允许丢、Outbox/CDC、专用消息事务协议 |

三种机制的第一轮对比：

| 能力 | List | Pub/Sub | Streams |
| --- | --- | --- | --- |
| 消息是否保存在 Redis key 中 | 是，元素留在 List 中直到弹出或删除 | 否，只推给当前订阅者 | 是，entry 留到显式删除或裁剪 |
| 离线消费者能否补收 | 普通队列可稍后竞争剩余元素 | 不能 | 可以，只要 entry 仍在保留范围内 |
| 多消费者默认语义 | 竞争弹出，每条给一个消费者 | 广播给当前订阅者 | XREAD 各自读取；group 内竞争、group 间广播 |
| 内建确认/待处理列表 | 没有 | 没有 | consumer group 有 PEL 和 XACK |
| 历史范围读取 | 只能按 List 位置，不适合日志游标 | 没有 | XRANGE/XREVRANGE 与 ID 游标 |
| 典型用途 | 简单工作队列、短任务缓冲 | 在线通知、实时刷新提示 | 可恢复任务、事件流、多个独立下游 |

这里的“保存在 Redis”不等于“绝不会丢”。Redis 的持久化、复制、故障转移和内存策略仍决定节点故障后的数据保证，后续运维课程会单独展开。

## 先设计消息信封

无论使用哪种载体，都不应只发送一个含义不明的 JSON。建议把业务消息设计成可演进的信封：

```json
{
  "eventId": "01J2Y7Z5VZC1YQYQW0D4M1T9J0",
  "eventType": "OrderCreated",
  "schemaVersion": 2,
  "occurredAt": "2026-07-15T12:34:56.789Z",
  "producer": "order-service",
  "aggregateType": "order",
  "aggregateId": "order-1001",
  "aggregateVersion": 7,
  "traceId": "4f3c...",
  "payload": {
    "tenantId": "tenant-42",
    "amountCents": 19900
  }
}
```

字段职责：

- `eventId` 是业务事件的稳定唯一标识，用于消费去重；它不能每次重试都重新生成。
- `eventType` 与 `schemaVersion` 让消费者选择解析器和兼容策略。
- `occurredAt` 表示业务事件发生时间，不等于 Redis 收到时间。
- `aggregateId` 和 `aggregateVersion` 可用于检测同一实体的乱序与重复。
- `traceId` 用于链路关联，不能替代 eventId。
- payload 只放消费者需要的事实，避免密码、令牌和无关个人信息。

消息过大时，可以只发送资源 ID 和版本，让消费者查询权威存储；但这样会增加查询压力，且消费者读到的可能是比事件更新的状态。发送快照还是引用，需要根据业务语义选择。

## List：简单队列的两个故障窗口

Redis List 支持两端常数时间的 push/pop，适合简单 FIFO 工作队列。保持方向一致即可，例如生产者从右侧写入，消费者从左侧取出：

```redis
RPUSH learning:queue:email '{"eventId":"evt-1","type":"SendEmail"}'
BLPOP learning:queue:email 5
```

`BLPOP` 在 List 为空时阻塞，最长等待 5 秒；有元素时原子删除并返回最左元素。使用有限阻塞时间便于进程响应关闭、检查健康状态和刷新配置。阻塞命令通常使用专用连接，不能占住普通命令连接池中的唯一连接。

### 弹出即删除：消费者崩溃会丢任务

```text
List: [M1, M2]
消费者 A 执行 BLPOP，Redis 删除并返回 M1
消费者 A 在发送邮件前崩溃
List: [M2]，M1 不再存在
```

Redis 已完成弹出，却不知道业务是否完成。这个模式适合允许偶尔丢失、能从其他事实重建，或业务副作用本身非常短且有额外补偿的任务；不能因为用了阻塞读取就称为可靠队列。

### 原子移动到 processing List

`BLMOVE` 可以在一个原子命令中把元素从 ready List 移到 processing List：

```redis
BLMOVE learning:queue:{email}:ready learning:queue:{email}:processing LEFT RIGHT 5
```

消费者成功后再从 processing List 删除对应消息：

```redis
LREM learning:queue:{email}:processing 1 '{"eventId":"evt-1","type":"SendEmail"}'
```

若消费者崩溃，消息还留在 processing，恢复任务可把超时元素重新放回 ready。这比 BLPOP 可恢复，但 Redis List 本身没有提供以下信息：

- 谁正在处理。
- 从什么时候开始处理。
- 已投递多少次。
- 何时算超时。
- 哪些消息应进入死信队列。

应用需要另存 owner、开始时间和重试次数，并保证这些元数据与 List 移动协调。只看 processing List 无法判断任务是卡死还是确实需要运行一小时。

`LREM` 按 value 匹配。如果两条消息序列化后完全相同，确认可能删错实例，所以信封中必须有唯一 eventId，最好删除完整的唯一信封或使用能按 ID 确认的数据结构。

在 Redis Cluster 中，`LMOVE/BLMOVE` 涉及两个 key；使用 `{email}` hash tag 可让 ready 与 processing 落在同一 slot。hash tag 也会把这组队列负载集中到同一 slot，不能无限扩展单队列吞吐。

### 生产者也可能重复入队

生产者执行 RPUSH 成功后，响应可能在网络中丢失。生产者不知道是否写入，再次 RPUSH 会产生重复元素。List 没有内建生产幂等，消费者仍要按稳定 eventId 去重，或生产者用额外原子去重结构。

若“数据库提交”和“RPUSH”是两次独立操作，还会出现数据库成功但消息未入队的双写窗口。换成 Streams 也不会自动解决跨系统原子性；需要 Outbox 或 CDC。

### List 适用边界

适合：

- 需求简单、只有一组竞争消费者。
- 不需要历史重放和多个独立消费组。
- 消息可从数据库扫描重建，或允许较弱交付保证。
- 团队愿意实现 processing 回收、去重和死信逻辑。

随着确认、重试、可观测性和多下游需求增加，自行维护 List 元数据通常会逐步重造 Streams 或专业消息系统。

## Pub/Sub：只通知当前在线订阅者

生产者向 channel 发布：

```redis
PUBLISH learning:notification:price-changed '{"productId":"42"}'
```

消费者先订阅：

```redis
SUBSCRIBE learning:notification:price-changed
```

Redis Pub/Sub 的交付语义是至多一次：发布时在线且连接正常的订阅者可能收到一次；断线、处理错误或客户端来不及消费时，Redis 不会在重连后重发。channel 不是保存消息的 key，也没有历史、offset、PEL 或 XACK。

`PUBLISH` 返回接收到消息的订阅客户端数量，这不是业务确认。订阅者收到消息后可能立即崩溃，也可能只是某个实例收到但尚未更新本地状态。

### 广播与竞争消费不同

假设三个 WebSocket 网关都订阅同一 channel：

```text
PUBLISH
  ├─ 网关 A 收到
  ├─ 网关 B 收到
  └─ 网关 C 收到
```

这适合让每个在线网关刷新本地连接、通知本机用户。它不适合“一封邮件只能由一个 worker 发送”，因为所有订阅 worker 都可能执行。

如果只有一个订阅者在线，消息也不是为它持久排队；订阅者维护期间发布的内容永久错过。重连后应从数据库或缓存重新构建完整状态，而不能假设收齐了所有增量通知。

### 适合与不适合

适合：

- 在线状态、实时 UI 提示、非关键指标刷新。
- “有变化，请重新读取权威状态”的失效通知。
- 可容忍偶尔遗漏，或订阅者能定期全量校准。

不适合直接承载：

- 订单创建、支付成功、库存扣减等不可遗漏事实。
- 需要重试、确认、审计、重放的任务。
- 慢消费者需要按自身速度积压的流。

Pub/Sub 必须监控订阅连接、重连次数、客户端输出缓冲和消息处理延迟。慢订阅者不会把 channel 变成持久 backlog；超过客户端缓冲限制时可能被断开，未处理消息无法恢复。

## Streams：保留 entry，并独立记录消费进度

Redis Stream 是追加日志。`XADD` 写入字段和值：

```redis
XADD learning:stream:orders * \
  eventId evt-1001 \
  eventType OrderCreated \
  schemaVersion 1 \
  orderId order-1001
```

`*` 让 Redis 生成唯一 ID，形如 `1721046896789-0`：第一部分通常与毫秒时间相关，第二部分用于同毫秒内排序。Stream ID 是 Redis entry 的位置，不应替代业务 eventId。

原因有三：

1. 生产者超时重试 XADD 可能获得新的 Stream ID，形成两个 entry，但它们代表同一个业务事件。
2. 业务事件可能从 Outbox 重放到另一个 Stream，位置 ID 会变化。
3. 跨 Stream 或跨系统不能仅凭 ID 推断统一业务顺序。

### XREAD：每个读取者管理自己的游标

不使用 consumer group 时，可以从指定 ID 之后读取：

```redis
XREAD COUNT 10 BLOCK 5000 STREAMS learning:stream:orders 0-0
```

消费者保存最后成功处理的 ID，下次从该位置继续。多个消费者各自使用游标时，每个都能读取全部 entry，适合每个订阅方都要处理一份的场景。

特殊 ID `$` 表示“命令执行时 Stream 的最新位置”，适合只监听未来消息。它只应在首次建立游标时使用；若每次循环都传 `$`，两次调用之间到达的消息可能被跳过。稳定消费者应把上次返回的最后 ID 作为下一次游标。

XREAD 本身不维护服务端确认状态。客户端游标保存在哪里、业务成功与游标推进能否一起提交，仍由应用决定。

### Consumer group：组间广播，组内分工

创建消费组：

```redis
XGROUP CREATE learning:stream:orders email-workers 0-0 MKSTREAM
```

- `0-0` 表示组可以从已有历史开始处理。
- `$` 表示创建后只处理新 entry。
- `MKSTREAM` 在 key 不存在时创建空 Stream。

消费者读取从未投递给该组的新消息：

```redis
XREADGROUP GROUP email-workers worker-01 \
  COUNT 10 BLOCK 5000 \
  STREAMS learning:stream:orders '>'
```

`>` 表示该组中尚未交付过的新 entry。组维护一个 last-delivered ID；每条 entry 在这个组内交给某个 consumer，并加入 Pending Entries List，简称 PEL。

同一个 Stream 可以有多个 group：

```text
learning:stream:orders
  ├─ email-workers：A、B、C 竞争发送邮件
  ├─ analytics：D、E 竞争更新分析数据
  └─ fraud-check：F、G 竞争执行风控
```

每个 group 独立收到每条 entry；group 内多个 consumer 分担工作。一个 group 的 XACK 不会确认其他 group 的处理。

consumer name 应稳定且在组内唯一。所有副本都叫 `worker` 会把 pending 归属混在一起；每次重启都生成永不复用的随机名字，又会留下大量旧 consumer 元数据。常见做法是实例身份加进程槽位，并配套清理空闲 consumer。

## PEL 与 XACK：收到不等于完成

消息被 XREADGROUP 返回后进入 PEL。业务成功后显式确认：

```redis
XACK learning:stream:orders email-workers 1721046896789-0
```

XACK 的含义是“当前 group 已正确处理这个 ID”，它把引用从该 group 的 PEL 移除。它不会删除 Stream 中的 entry，也不会影响其他 group。

正确顺序通常是：

```text
读取 entry → 执行业务事务 → COMMIT → XACK
```

如果先 XACK，再提交数据库：

```text
XACK 成功
进程崩溃
数据库事务未提交
```

消息已不在 PEL，group 不会自动重投，业务效果丢失。

如果先提交数据库，再 XACK：

```text
数据库 COMMIT 成功
进程在 XACK 前崩溃
消息仍在 PEL，之后会重投
```

业务可能重复执行。因此 consumer group 常实现至少一次交付：宁可重投，也不能先确认丢任务；消费者必须用 eventId 做幂等。

### 用 Inbox 把去重和业务变更放进同一事务

消费者可建立 Inbox 表，eventId 唯一：

```sql
BEGIN;

INSERT INTO consumer_inbox (consumer_name, event_id, processed_at)
VALUES ('email-projection', :event_id, CURRENT_TIMESTAMP)
ON CONFLICT (consumer_name, event_id) DO NOTHING;

-- 只有 INSERT 确实插入时，才执行业务更新。
-- 业务更新与 Inbox 记录在同一数据库事务中。

COMMIT;
```

若唯一冲突，说明业务效果已经提交，可跳过副作用并 XACK。具体 SQL 要根据 MySQL/PostgreSQL 方言实现，并检查受影响行数；不能无条件执行后续更新。

调用外部邮件或支付 API 时，本地 Inbox 事务仍不能与外部副作用原子提交。应优先使用对方幂等键、状态查询和可对账记录，必要时把外部调用建模为独立状态机。

## 消费者崩溃后的恢复

PEL 中的消息不会因为 consumer 断线自动回到“新消息”队列。恢复通常包含两条路径：

1. consumer 重启后读取属于自己的 pending 历史。
2. 专门恢复器把长时间空闲的 pending 转交给健康 consumer。

`XPENDING` 可以查看 pending 数量、ID 范围、owner、空闲时间和投递次数。Redis 6.2 起，`XAUTOCLAIM` 可以扫描达到最小空闲时间的 entry，并把所有权转给新 consumer：

```redis
XAUTOCLAIM learning:stream:orders email-workers worker-recovery \
  60000 0-0 COUNT 100
```

这里的 60,000 毫秒不是随便设置的“重试间隔”。如果正常任务 P99 需要 90 秒，60 秒就认领会让两个消费者并发执行同一任务。最小空闲时间应覆盖正常处理时间、暂停和网络余量，长任务还需要心跳、分段执行或业务 fencing。

XAUTOCLAIM 返回下一次扫描起点，恢复器应继续迭代，而不是永远从 `0-0` 扫全部 PEL。COUNT 是尝试返回数量，不应假设一次处理完所有积压。

被认领并不等于原 consumer 已停止。旧 consumer 可能从暂停中恢复，因此业务幂等和版本条件仍是最终保护。

### 重试次数与毒消息

消息可能因为代码 bug、schema 不兼容或永久业务错误每次都失败。无限认领会形成毒消息循环，持续占用 CPU 和下游容量。

应用应定义：

- 哪些错误可以重试，哪些是永久错误。
- 指数退避和下一次可执行时间怎样保存。
- 最大投递次数或最大消息年龄。
- 超限后写入哪个 dead-letter Stream。
- 死信中保留原 eventId、原 Stream ID、错误分类、尝试次数和必要 payload。
- 修复后如何安全重放并保持幂等。

不同 Redis 版本提供的负确认、确认并删除以及 consumer-group-aware trimming 能力不同。为了兼容常见部署，不应假设 Redis 自动拥有完整死信队列；先核对目标版本，再决定使用新命令还是由应用基于 XPENDING/XAUTOCLAIM 实现。

把消息写入 dead-letter Stream 和确认原消息最好形成明确原子边界；若跨 key 使用 Lua，在 Cluster 中还要让 key 位于同一 slot。即使发生“死信已写、原消息未确认”，稳定 eventId 也能让死信消费者去重。

## 保留、确认与删除是三件事

Stream entry 默认会持续存在，XACK 只清理某个 group 的 PEL 引用。若不设置保留策略，Stream 会无界增长。

写入时可近似裁剪：

```redis
XADD learning:stream:orders MAXLEN '~' 1000000 '*' \
  eventId evt-1001 eventType OrderCreated
```

`~` 允许近似长度，通常比精确裁剪更高效，但最终长度不保证恰好 1,000,000。也可以按最小 ID 或独立 XTRIM 管理时间保留，具体能力取决于 Redis 版本。

保留策略必须同时考虑：

- 最慢 group 的处理延迟。
- 最大故障恢复时间。
- 审计与重放窗口。
- 平均 entry 大小和峰值写入速率。
- PEL 中仍引用但正文可能被裁剪的边界。

如果 entry 在 consumer 处理前已被裁剪，pending 元数据与消息正文的关系会因版本和裁剪选项而不同，恢复可能只看到 ID 而拿不到原字段。Redis 8.2 起提供更细的 group 引用处理选项，但部署前必须核对命令与客户端支持。通用安全原则仍是：保留窗口要大于可接受的最大处理与恢复延迟，并监控最慢 group，而不是只按总长度拍脑袋裁剪。

若消息需要保存数月审计，应评估把事实归档到关系数据库、对象存储或专门日志系统，不能让 Redis 内存无限承担历史库职责。

## 顺序：Stream 有序不等于业务完成有序

单个 Stream entry 有递增 ID，读取新消息可按 ID 顺序交付。但 consumer group 并行处理后，完成顺序可能改变：

```text
M1 分给 worker-A，处理 10 秒
M2 分给 worker-B，处理 1 秒
M2 先提交并 XACK
```

如果同一订单的 `OrderCreated v1` 与 `OrderCancelled v2` 必须顺序应用，可采用：

- 按 aggregateId 路由到固定分区/Stream，并让每分区单线程处理。
- 在数据库用 aggregateVersion 条件更新，拒绝或暂存越序版本。
- 让事件携带最终状态，消费者按版本只接受更新数据。
- 减少同一实体的并行度，而不是把整个系统全局串行化。

Redis Cluster 不会自动按业务 aggregate 分区多个 Stream。key 的 hash tag、分区数、再均衡和热点实体都需要应用设计。全局严格顺序成本很高，通常只要求单实体或单分区顺序。

## 数据库与消息的双写：Outbox

直接写数据库再 XADD：

```text
BEGIN
INSERT order
COMMIT
XADD stream   ← 在这里崩溃，订单存在但没有事件
```

先 XADD 再提交也不安全：数据库回滚时消费者可能已处理一个不存在的订单。

Transactional Outbox 把业务事实和待发送事件写进同一个数据库事务：

```text
数据库事务：
  INSERT orders
  INSERT outbox_events(event_id, type, payload, published=false)
COMMIT

独立 dispatcher：
  读取未发布 Outbox
  XADD Redis Stream，携带稳定 event_id
  标记 published
```

dispatcher 在 XADD 成功后、标记 published 前崩溃，会再次发送同一 eventId，所以消费者仍需 Inbox/幂等处理。Outbox 解决“业务已提交但事件永久漏发”，不保证物理消息只有一份。

Redis 新版本可能提供生产端幂等能力，但不能把版本特性当作所有部署的默认，也不能替代数据库和 Redis 之间的事务边界。先核对目标版本、故障模型和去重保留期。

Outbox 表需要索引、批量领取、并发 dispatcher 协调、失败重试、积压告警和归档。published 标记也不能在 XADD 之前提交。

## 端到端交付语义

不能只根据 Redis 命令给整个业务贴标签。端到端结果由生产、Redis、消费和业务提交共同决定：

| 阶段 | 典型失败 | 对策 |
| --- | --- | --- |
| 数据库提交 → 生产消息 | 事实存在但消息缺失 | Outbox/CDC |
| XADD 成功 → 生产者收到响应 | 响应丢失导致重复 XADD | 稳定 eventId、生产去重 |
| 交付 → 业务提交 | consumer 崩溃 | PEL、认领重投 |
| 业务提交 → XACK | 重投导致重复副作用 | Inbox、唯一约束、外部幂等键 |
| XACK → entry 裁剪 | 历史长期占内存 | 保留和归档策略 |
| Redis 写入 → 节点故障 | 未持久化/未复制数据可能丢失 | 按 RPO 配置持久化、复制与确认策略 |

常见目标是至少一次交付加幂等消费，使业务效果等价于一次。不要把 XACK 称为“exactly once”；它只确认一个 group 的处理状态。

## 背压与容量

队列的本质是用空间吸收生产与消费速率差。若长期生产速率大于消费速率，任何队列最终都会耗尽内存：

```text
积压增长速率 = 生产速率 - 成功消费速率
预计积压字节 = 积压条数 × 平均 entry 字节
```

治理手段包括：

- 在入口限流，不能把 Redis 当无限缓冲。
- 批量读取但限制单批大小和处理时间。
- 增加 consumer 前先确认下游数据库能承受并发。
- 按业务 key 分区，隔离毒消息和超大消息。
- 设定最大积压年龄与容量告警。
- 对低优先级流量降级或拒绝。

Pub/Sub 没有可查询 backlog，不代表没有背压；压力会进入客户端输出缓冲、网络和订阅者内存，最终表现为延迟或断线。List 可看 LLEN，Streams 可看 XLEN、group lag、PEL 与最老 pending 年龄，但单一长度仍不足以反映消息大小和处理成本。

## Schema 演进与安全

消费者和生产者通常不会同时发布，因此 schema 必须支持滚动升级：

1. 新增可选字段，旧消费者忽略未知字段。
2. 需要破坏性变更时提升 schemaVersion，并保持一段双读或双写兼容期。
3. consumer 遇到未知版本不能无限重试，应分类进入兼容性死信。
4. eventType 表示已经发生的事实，命名通常用过去式，不把“命令”和“事件”混为一谈。

Redis ACL 应限制生产者和消费者只能访问需要的 key/channel/命令。Pub/Sub 的 channel 权限与普通 key 权限需要分别核对。消息中不要携带长期凭据；日志和死信也要脱敏，因为失败 payload 往往保留更久。

反序列化必须限制大小、深度和允许类型。消费者不能信任消息一定来自“内部安全系统”，错误 ACL、共享实例和供应链代码都可能写入异常 payload。

## 可观测性

### List

- ready 与 processing 的 LLEN。
- 最老任务年龄、处理时间和回收次数。
- 成功、失败、重复、死信数量。
- 阻塞读取超时和消费者在线数。

### Pub/Sub

- 发布速率、订阅连接数、重连与断开。
- 客户端处理延迟和输出缓冲压力。
- 定期全量校准发现的遗漏数量。
- 发布返回的订阅数只能作连接信号，不能作业务成功率。

### Streams

- XLEN、写入速率和 entry 字节分布。
- 每个 group 的 lag、PEL 数量、最老 pending 年龄。
- 每个 consumer 的 pending、空闲时间和处理速率。
- XACK 成功率、认领次数、投递次数和死信数量。
- Outbox 未发布数量、最老事件年龄和 dispatcher 延迟。
- Inbox 去重命中与业务版本冲突。

指标标签不要直接放 eventId、订单号等高基数或敏感值。排查单消息用受控日志与 trace，聚合监控用 group、eventType、结果分类等有限维度。

## 故障测试清单

消息系统测试必须控制崩溃位置：

1. BLPOP 返回后、业务处理前崩溃，确认普通 List 任务确实丢失。
2. BLMOVE 后崩溃，确认 processing 中仍有任务并能恢复。
3. Pub/Sub 订阅者离线期间发布，确认重连不会补发。
4. XREADGROUP 后、业务提交前崩溃，确认消息留在 PEL。
5. 业务 COMMIT 后、XACK 前崩溃，确认重投但 Inbox 阻止重复副作用。
6. consumer 暂停超过 min-idle，确认 XAUTOCLAIM 后两个实例并行的业务保护。
7. 连续投递不可解析消息，确认达到上限后进入死信而非无限重试。
8. dispatcher 在 XADD 后、标记 published 前崩溃，确认稳定 eventId 可去重。
9. retention 小于消费延迟，观察正文被裁剪后的恢复行为。
10. 生产速率长期超过消费速率，验证限流和容量告警。

只在专用测试实例与 `learning` 前缀中演练，不清空共享 Redis，也不通过生产 channel 发送测试消息。

## 配套状态模型

`examples/database/redis/05-messaging-models.mjs` 使用内存结构和假时钟，不依赖 Redis 或第三方包，验证：

- 普通 List pop 后崩溃会丢任务；原子移入 processing 后可以重新排队。
- Pub/Sub 只向当前在线订阅者广播，离线消息不会补发。
- Streams group 交付后进入 PEL，消费者崩溃后可由其他消费者认领。
- 业务提交后、ACK 前崩溃会重复交付，但 Inbox eventId 去重可避免重复副作用。
- 两个独立 group 各自收到同一 entry，而组内只分给一个 consumer。

运行：

```bash
node examples/database/redis/05-messaging-models.mjs
```

模型只解释状态转换，不模拟 Redis 持久化、复制、Cluster、客户端缓冲和真实网络。生产实现应使用目标版本客户端，并做真实故障注入。

## 常见误区

### “BLPOP 是阻塞的，所以消息可靠”

阻塞只表示 List 为空时等待；元素返回时已经从 List 删除。消费者随后崩溃，Redis 不会自动重投。

### “PUBLISH 返回 3，说明三个服务处理成功”

返回值只表示当时有多少订阅客户端接收发布，不表示业务处理、数据库提交或用户收到通知。

### “XREADGROUP 返回消息后，其他消费者就永远看不到”

消息进入 PEL，空闲后可被 XCLAIM/XAUTOCLAIM 转交。原 consumer 也可能恢复，因此副作用必须幂等。

### “XACK 会删除消息”

XACK 只移除当前 group 的 pending 引用。entry 仍在 Stream，其他 group 不受影响，历史清理由保留策略负责。

### “Streams 天然 exactly once”

业务提交后、XACK 前崩溃会重投；生产者响应丢失也可能重复 XADD。需要 Outbox、稳定 eventId、Inbox 和业务唯一约束组合。

### “有 MAXLEN 就不需要容量规划”

近似裁剪不保证精确长度，过短保留还可能删除慢 consumer 需要的正文。容量要按消息字节、速率、group 延迟和恢复窗口估算。

## 本课小结

- List、Pub/Sub 和 Streams 的关键差异是保留、分发、确认与重放，不是命令写法。
- BLPOP 弹出即删除；BLMOVE 可保留 processing 副本，但 owner、超时、重试和死信仍需应用维护。
- Pub/Sub 是至多一次在线广播，没有历史、ACK 和断线补发，适合可校准的实时通知。
- Stream entry 与业务 eventId 不同；生产重试可能为同一业务事件产生多个 entry。
- XREAD 由读取者维护游标；consumer group 在组内分工、组间独立消费。
- XREADGROUP 后消息进入 PEL，业务提交后才能 XACK；先确认会丢，后确认会重复。
- XPENDING 与 XAUTOCLAIM 支持崩溃恢复，但认领不保证旧 consumer 已停止，消费者仍须幂等。
- XACK 不删除 entry，保留和裁剪必须覆盖最慢 group 的处理与恢复窗口。
- 单 Stream 的交付顺序不等于并行消费者的完成顺序，关键实体需要版本条件或分区串行。
- Outbox 解决数据库事实与消息发送的漏发窗口；Inbox/唯一约束处理重复交付。
- Redis 中保存了消息也不等于零丢失，最终 RPO 取决于持久化、复制和故障转移配置。

## 官方资料

- [Redis：Lists](https://redis.io/docs/latest/develop/data-types/lists/)
- [Redis：BLMOVE](https://redis.io/docs/latest/commands/blmove/)
- [Redis：Pub/Sub 与至多一次语义](https://redis.io/docs/latest/develop/pubsub/)
- [Redis：Streams](https://redis.io/docs/latest/develop/data-types/streams/)
- [Redis：XADD](https://redis.io/docs/latest/commands/xadd/)
- [Redis：XREAD](https://redis.io/docs/latest/commands/xread/)
- [Redis：XREADGROUP](https://redis.io/docs/latest/commands/xreadgroup/)
- [Redis：XACK](https://redis.io/docs/latest/commands/xack/)
- [Redis：XPENDING](https://redis.io/docs/latest/commands/xpending/)
- [Redis：XAUTOCLAIM](https://redis.io/docs/latest/commands/xautoclaim/)
