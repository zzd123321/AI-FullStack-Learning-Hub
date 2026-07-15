---
title: 客户端连接、超时、重试与优雅停机
description: 从一次接口请求的时间预算出发，理解连接池与 multiplexing、命令结果不确定性、有界重试、pipeline、Sentinel 与 Cluster 拓扑刷新、健康检查和优雅停机
prev:
  text: 安全、ACL、TLS、监控与容量规划
  link: /database/redis/security-observability-capacity-planning
next:
  text: 数据库性能诊断：从慢接口到根因
  link: /database/database-performance-diagnosis
---

# 客户端连接、超时、重试与优雅停机

前面的课程分别讨论了缓存一致性、故障保护、Sentinel 和 Cluster，但这些能力最终都要通过应用里的 Redis 客户端落地。客户端配置不只是一个连接 URL：它管理连接生命周期、并发排队、请求截止时间、失败分类、拓扑发现、重试和进程退出。

这也是接口联调时最容易出现错觉的地方：Postman 收到 504，不代表 Redis 没执行；应用日志显示“连接失败”，不代表命令曾经发出；健康检查 PING 成功，也不代表当前实例仍是可写 primary。

本课不绑定某个客户端库的具体参数名。node-redis、ioredis、Jedis、Lettuce、redis-py 和 go-redis 的 API 不同，但底层问题相同。生产配置必须再对照所选客户端版本的官方文档。

## 从一次接口请求画完整时间线

假设一个 HTTP 接口收到请求后读取 Redis：

```text
HTTP 请求到达
  │
  ├─ 应用事件循环 / 线程池排队
  ├─ 等待 Redis 连接或 multiplexer 可用
  ├─ DNS、TCP、TLS、AUTH、HELLO（新连接时）
  ├─ 命令在客户端发送队列等待
  ├─ 请求字节发送
  ├─ Redis 排队并执行命令
  ├─ 响应字节传回并解码
  └─ 应用组装 HTTP 响应
```

接口总耗时不是 Redis 服务端命令耗时。任何一段缺少上限，都可能让上游已经放弃的请求继续占用连接、CPU 或数据库资源。

### 截止时间与各阶段超时

应先有端到端 deadline，再从剩余预算中分配阶段上限：

```text
HTTP 总预算 300 ms
  ├─ Redis 尝试总预算最多 80 ms
  │    ├─ pool wait 最多 10 ms
  │    ├─ connect 最多 25 ms（只有新建连接时）
  │    └─ command/socket 最多 35 ms
  └─ 为数据库回源、业务计算和响应预留 220 ms
```

这些数字只是推理示例，不是推荐默认值。应根据同地域 RTT、TLS、命令复杂度、接口 SLO 和回源成本测量。

需要区分：

| 名称 | 限制什么 | 超时后能否判断命令未执行 |
| --- | --- | --- |
| pool wait timeout | 等待可复用连接或并发槽位 | 通常能，尚未借到连接 |
| connect timeout | DNS/TCP/TLS 建连 | 通常没有发送业务命令 |
| write timeout | 请求写入 socket | 不一定，可能只发送了部分或全部字节 |
| command/read timeout | 等待 Redis 响应 | 不能，命令可能已执行而响应丢失 |
| request deadline | 整个业务请求 | 不能，需要看具体阶段 |

“通常”仍需以客户端实现为准。例如 multiplexing 客户端可能先把命令放入共享发送队列；调用者取消等待，不一定能从队列中安全撤回命令。

## 长连接不是一个全局永生单例

频繁为每个 HTTP 请求建立 TCP/TLS 连接会反复支付握手、认证和系统调用成本，也会制造端口与连接风暴。生产客户端通常复用长连接，但复用有两类常见模型。

### 连接池

连接池维护若干真实连接。调用者借出一个连接，独占使用后归还：

```text
请求 A ─┐            ┌─ connection 1
请求 B ─┼─ pool ─────┼─ connection 2
请求 C ─┘            └─ connection 3
```

连接池需要明确：

- 最小/最大连接数和每应用实例总预算。
- 池耗尽时等待多久，是立即失败还是排队。
- 空闲连接多久回收，是否发送保活。
- 借出前或归还后如何识别坏连接。
- Sentinel/Cluster 下是每节点一个池还是按角色维护池。
- 阻塞、事务、Pub/Sub 等有连接状态的操作怎样隔离。

最大池大小不能只看单个 Pod。若 300 个应用实例各允许 100 条连接，理论上可产生 30,000 条连接；Cluster 客户端还可能对多个节点分别建连。

池耗尽通常是结果，不一定是池太小。Redis 变慢、请求未设超时、阻塞命令误占普通连接、下游重试放大，都能把连接长期占住。机械增大池会把更多并发推给已经饱和的 Redis。

### Multiplexing

multiplexer 让多个调用共享少量连接，通过响应顺序或请求标识把结果交回对应调用者：

```text
调用 A ─┐
调用 B ─┼─ 共享连接 ─ Redis
调用 C ─┘
```

它减少连接数并能自动形成批量发送，但共享连接上的拥塞会影响多个调用。大响应、网络停顿和客户端解码慢可能造成 head-of-line blocking。

`BLPOP`、`XREAD BLOCK`、订阅模式等会改变连接行为或长期占用读取流程，不能随便放在普通 multiplexed connection 上。成熟客户端通常提供专用连接或专用 API；应用必须按库的约束使用。

### 连接有状态

Redis 某些行为绑定当前连接：

- `MULTI` 到 `EXEC` 的事务队列。
- `WATCH` 的乐观锁状态。
- `SUBSCRIBE`/`PSUBSCRIBE` 的订阅状态。
- `BLPOP`、`XREAD BLOCK` 的阻塞等待。
- `WAIT` 检查当前连接此前写入对应的复制进度。
- `SELECT` 选择的逻辑数据库（Cluster 只使用数据库 0）。
- 客户端名称、跟踪和部分协议状态。

这类操作必须保证相关命令使用同一连接，并在异常后清理或丢弃连接。把处于 MULTI、WATCH 或订阅状态的连接直接归还普通池，会污染下一位调用者。

## 连接建立本身是一段协议

新连接可能依次经历：

1. 解析 DNS 或服务发现结果。
2. 建立 TCP。
3. 完成 TLS 握手并校验证书。
4. 使用 ACL 用户认证。
5. 协商 RESP 版本或发送客户端元数据。
6. 验证角色、数据库或拓扑。

因此“socket 已连接”不等于“业务连接已就绪”。认证失败、证书 SAN 不匹配、连接到了 replica、Cluster 通告地址不可达，都应在就绪前暴露。

DNS 也不是永远正确的常量。运行时、操作系统和客户端可能缓存解析结果；故障切换依赖 DNS 时，要核对 TTL、刷新机制和旧连接处置。Redis Cluster 更依赖节点通告的 endpoint，seed 地址只是发现入口，不是唯一业务连接。

## 命令结果必须分成三类

客户端不能只返回 `success: true/false`。对业务正确性更重要的分类是：

### 明确成功

收到了与请求匹配的合法响应。例如 `SET` 返回 OK、Lua 返回预期状态。此时可以按命令语义继续业务流程。

### 明确未执行或被拒绝

例如本地参数校验失败、pool wait 超时且命令尚未入队、ACL 明确拒绝、WRONGTYPE、CROSSSLOT。不同错误是否可修复不同，但至少有证据表明没有产生预期写入。

某些错误可能由脚本内部或事务中的子命令产生，不能只按错误名称猜测整个批次是否零副作用；需要结合具体命令语义。

### 结果未知

最危险的情况是命令可能已经执行，但客户端没有拿到响应：

```text
客户端              Redis
   │── INCR counter ──>│
   │                   │ counter 已加一
   │<── 响应途中断线 ──×
   │ timeout           │
```

此时再次 `INCR` 可能加两次。HTTP 上游看到 500 或 504 后重试同一接口，又会再放大一次。

结果未知不是 Redis 特例，而是分布式调用的基本事实。解决手段包括：

- 对缓存 `GET` 重试或回源，因为重复读取没有写副作用。
- 对 `DEL cache-key` 有界重试，因为重复删除通常幂等。
- 对创建订单使用稳定幂等键和数据库唯一约束。
- 对计费、扣库存和精确计数使用持久业务事件 ID 去重。
- 对状态更新使用期望版本或条件写，再查询事实确认。

## 不要按“读/写”粗暴决定重试

重试前至少回答四个问题：

1. 错误是否可能是瞬时错误？
2. 原命令是否可能已经执行？
3. 重复执行是否幂等，或是否有业务去重？
4. 请求 deadline 是否还剩足够时间完成下一次尝试？

示例分类：

| 操作 | 超时后直接重试 | 原因 |
| --- | --- | --- |
| `GET` 缓存 | 通常可以，次数仍受限 | 重复读取无写副作用，但会增加负载 |
| `DEL` 缓存 | 通常可以 | 删除同一缓存 key 通常幂等 |
| 固定 value 的 `SET` | 视并发语义 | 值相同不代表不会覆盖更新版本或 TTL |
| `INCR` | 不可以无脑重试 | 可能重复计数 |
| `LPUSH`/`XADD *` | 不可以无脑重试 | 可能产生重复消息或新 Stream ID |
| Lua 业务脚本 | 看整个脚本协议 | 原子不等于幂等 |
| `MOVED`/`ASK` | 按 Cluster 协议重发 | 与普通网络 timeout 的证据不同 |

只把库配置成“任何连接异常重试三次”非常危险。客户端自动重试必须限制到明确允许的命令或失败阶段，并与业务层重试协调，避免一层 3 次、另一层 3 次、网关再 3 次形成 27 次调用。

## 有界重试由 deadline 控制

指数退避的一个常见形式：

```text
cap = min(max_backoff, base × 2^attempt)
sleep = random(0, cap)       # full jitter
```

随机抖动避免大量实例同时恢复并再次冲击 Redis。但退避公式不是完整策略，还必须满足：

```text
now + sleep + next_attempt_budget < request_deadline
```

若剩余时间不够，就应停止重试并执行降级或返回错误。后台任务可以拥有更长 deadline，但仍要设置最大尝试次数、死信或人工处置状态。

重试指标至少记录 operation、error class、attempt、sleep、最终结果和耗尽原因。不要把 key/value 或连接密码放进标签。

## 取消等待不等于取消 Redis 执行

应用的 Promise、Future 或 context 被取消，通常只表示调用者不再等待。若命令已经写入 socket，Redis 不会自动回滚。即使客户端支持从本地队列移除，也只能撤回尚未发送的请求。

因此：

- 上游断开后应停止尚未开始的工作。
- 已发送的非幂等写必须按“可能成功”处理。
- 不应在 HTTP timeout 回调中盲目发送反向补偿命令。
- 补偿必须基于持久状态、业务 ID 和明确的状态机。

## Pipeline：吞吐优化，不是事务

Redis pipeline 连续发送多条命令，再批量读取响应，减少逐条 RTT 和 socket 系统调用：

```text
非 pipeline：请求1 → 响应1 → 请求2 → 响应2
pipeline：   请求1 → 请求2 → 请求3 → 响应1 → 响应2 → 响应3
```

需要牢记：

- pipeline 不保证中间没有其他客户端命令穿插；需要原子性应使用合适的单命令、Lua/Function 或事务。
- 每条响应都要逐一检查，不能只看“批次调用没有抛异常”。
- 网络中断时，前面部分可能已执行、后面部分可能未到达，形成部分成功或结果未知。
- 大 pipeline 会让服务端和客户端排队大量响应，占用内存并放大尾延迟。
- 应按响应字节、命令成本、deadline 和内存测量批大小，而不是只按命令条数。
- Cluster pipeline 需要按 slot/node 分组；跨节点批次存在独立失败，结果汇总必须表达部分成功。

如果第 3 条命令依赖第 2 条响应才能构造，普通 pipeline 无法消除这段依赖 RTT。可以重新设计数据模型，或使用受控的 Lua/Function 在服务端完成有限原子逻辑。

## 背压：让过载在入口显性失败

当到达速率超过 Redis 可持续处理速率，等待队列必然增长。无界队列只会把故障延迟到内存耗尽或所有请求超时。

客户端应有：

- 最大 in-flight 命令数或有限 pool wait queue。
- pool wait timeout 和明确的 overload 错误。
- 按业务优先级的并发隔离。
- 对大响应、阻塞命令和普通缓存命令使用独立预算。
- 熔断、限流和降级，保护数据库回源。

接口层收到过载错误时，应按契约返回可识别状态或降级数据，而不是把所有失败伪装成缓存 miss。否则 Redis 故障会把全量请求悄悄转给数据库。

## Sentinel 客户端不是固定主机列表

Sentinel 是配置提供者，不是请求代理。客户端通常需要：

1. 配置多个 Sentinel 地址与 master name。
2. 连接可用 Sentinel，查询当前 primary 地址。
3. 连接 primary，完成 TLS/ACL 和角色验证。
4. 监听或定期发现拓扑变化。
5. failover 后关闭旧 primary 写连接并连接新 primary。

只把 Redis primary 的 IP 写进环境变量，Sentinel 完成选主后应用仍会继续连旧地址。只配置一个 Sentinel，又会把发现层变成单点。

切换窗口中可能出现连接拒绝、READONLY、旧连接仍存活、新 primary 尚未准备好。客户端需要有界重新发现和重连；非幂等写仍可能结果未知，Sentinel 不会替业务消除重复副作用。

就绪检查若要求写能力，可验证当前发现到的节点角色，但不要用会改变业务数据的探针。托管服务或代理模式要遵循对应平台的发现方式。

## Cluster 客户端维护的是 16,384 个 slot 的路由

Cluster 客户端从 seed 节点获取拓扑，然后把 key 计算到 slot，再选择 owner 节点。seed 只用于启动发现；业务流量会连接多个节点。

客户端至少要正确处理：

- `MOVED`：稳定 owner 变化，重发并刷新 slot map。
- `ASK`：迁移期间仅对下一条命令发送 `ASKING` 后临时重试，不永久修改 owner。
- `TRYAGAIN`、`CLUSTERDOWN`、连接失败：按错误和 deadline 分类。
- 节点通告地址、DNS、TLS SAN 与应用网络可达性。
- 每节点连接池、节点移除后的旧连接回收。

完整刷新常使用 `CLUSTER SHARDS`；旧版本客户端可能使用已弃用的 `CLUSTER SLOTS`。应选择与 Redis 版本兼容并完整实现 Cluster 协议的客户端，不要自己解析错误字符串拼接一个简化版路由器。

跨 slot 的应用批量必须按节点拆分。某节点成功、另一个节点超时后，返回值应保留每个项目的结果，或通过业务幂等协议继续收敛，不能只返回一个模糊的 `batch failed`。

## 读 replica 是一致性选择，不只是减压开关

允许客户端把读取路由到 replica，可以分担某些读流量，但复制异步意味着读到旧值。failover、网络延迟和 replica 重连都会扩大陈旧窗口。

需要明确：

- 哪些接口允许 eventual consistency。
- 写后读是否固定 primary 或验证业务版本。
- replica 不可用时回 primary、失败还是返回旧数据。
- 读负载是否会影响 replica 复制与故障接管能力。

客户端参数名里的 `preferReplica`、`readFromReplica` 不是免费性能优化，它改变了接口一致性契约。

## 健康检查：存活、就绪和业务探针不同

### Liveness

回答“应用进程是否已经不可恢复地卡死”。Redis 短时不可用通常不应立刻让所有应用实例重启，否则会加剧连接风暴。liveness 不宜强依赖外部 Redis。

### Readiness

回答“此实例现在是否适合接收新流量”。若接口完全依赖 Redis 且不能降级，持续无法建立可用连接可以让 readiness 失败；若缓存可绕过，则应结合数据库保护策略决定，而不是一次 PING 失败就摘除。

### 业务 canary

在独立学习/探针 key 上验证 ACL、读写、TTL 或拓扑能力。必须设置短 TTL、低频率、严格前缀，不触碰业务 key。只读服务不应为了探针获得写权限。

PING 成功只说明当前连接收到了 PONG，不证明：

- ACL 允许目标业务命令和 key。
- 当前节点是 primary。
- 所有 Cluster slot 可用。
- replica 延迟满足读一致性。
- pipeline、Lua 或 Stream 消费路径正常。

## 启动时快速失败还是后台重连

两种策略都可能合理：

- Redis 是不可替代的事实存储或队列：启动时无法建立正确拓扑，可以保持 not ready，避免接入无法处理的流量。
- Redis 只是可旁路缓存：应用可以启动并提供降级服务，客户端在后台有界重连。

不要无限阻塞进程启动且没有状态输出。启动日志应说明发现阶段、认证/TLS、目标角色和最后错误，但必须脱敏连接信息。

## 优雅停机的正确顺序

部署滚动更新时，直接关闭 Redis socket 会把正在处理的请求变成结果未知。更稳妥的顺序：

1. 收到终止信号，readiness 先变为失败，停止接收新流量。
2. 停止创建新的 Redis 操作、后台轮询和重试。
3. 在全局 shutdown deadline 内等待 in-flight 请求完成。
4. 取消尚未发送或仍在队列等待的操作。
5. 对已发送但未响应的写按结果未知记录，交给业务恢复机制。
6. 取消阻塞读取、退订 Pub/Sub，按协议处理 pending 消息。
7. 关闭连接池、multiplexer、拓扑刷新器和监控任务。
8. 超过 deadline 后强制退出，并保留未完成工作指标。

shutdown deadline 必须小于容器平台的最终强杀宽限期，还要为日志刷新和进程退出留余量。

Stream consumer 尤其不能在业务副作用完成前为了快速退出而 `XACK`。未确认消息可以由其他 consumer 恢复；错误确认会让任务永久丢失。

## 客户端可观测性

按逻辑操作而不是高基数 key 记录：

| 维度 | 建议指标 |
| --- | --- |
| 连接 | connect/TLS/AUTH 耗时与失败、当前连接数、重连次数 |
| 池/队列 | in-use、idle、waiters、wait time、exhaustion、in-flight |
| 命令 | operation、节点/角色、总延迟、错误分类、响应字节 |
| 重试 | attempt、backoff、最终成功、预算耗尽、未知结果 |
| Sentinel | 发现耗时、primary 变化、READONLY、旧连接关闭 |
| Cluster | topology refresh、MOVED/ASK、slot/node、部分失败 |
| 停机 | drain 时间、取消数量、deadline 强退、pending 工作 |

客户端 P99 要与 Redis SLOWLOG/LATENCY 分开。客户端慢而服务端不慢，常见原因是 pool wait、网络、TLS、大响应、事件循环阻塞或解码。

日志中的 endpoint 可能是必要诊断信息，但用户名、密码、证书内容、完整 key/value 和连接 URI 必须脱敏。

## 与接口联调的对应关系

当接口返回异常时，可以按时间线提问：

1. HTTP 请求是否在进入 Redis 前就耗尽 deadline？
2. 是 pool wait、connect、write 还是 response timeout？
3. 命令是否可能已执行？是否有 requestId/业务幂等键可查询？
4. 客户端是否自动重试？网关或调用方是否又重试？
5. Sentinel/Cluster 是否刚切换，节点角色和 slot map 是否过期？
6. 降级是否把流量转给数据库，数据库还有多少余量？

对于“创建成功但前端显示失败”，不要先让前端再点一次。先用稳定业务 ID 查询数据库事实，再决定返回已有结果、继续处理还是补偿。这条原则同时适用于 Redis、数据库和第三方支付接口。

## 配套客户端状态模型

`examples/database/redis/10-client-lifecycle-retry-shutdown.mjs` 不连接 Redis，验证：

- 阶段预算不会超过 HTTP 总 deadline。
- 命令发出后响应丢失会得到 `unknown`，而不是错误地标成未执行。
- 只有幂等操作和可重试错误才能在剩余预算内退避重试。
- pipeline 会保留逐项成功、失败和未知结果。
- 优雅停机先拒绝新请求，再 drain，最后关闭连接。

运行：

```bash
node examples/database/redis/10-client-lifecycle-retry-shutdown.mjs
```

模型用于解释状态边界，不是生产 Redis 客户端，也不会连接或修改任何 Redis 实例。

## 上线检查清单

### 连接

- 使用成熟且与 Redis/拓扑版本兼容的客户端。
- 每请求不新建连接；pool 或 multiplexer 有明确容量。
- 阻塞、Pub/Sub、事务等状态连接与普通请求隔离。
- TLS、ACL、DNS、endpoint 和角色在就绪前验证。

### 超时与重试

- HTTP deadline 能传播到 pool、connect 和 command 阶段。
- timeout 后区分未发送、明确拒绝和结果未知。
- 自动重试仅覆盖经过审计的操作与错误。
- 重试有最大次数、指数退避、jitter 和总预算。
- 网关、SDK、应用和 worker 的重试次数合并计算。

### 拓扑与故障

- Sentinel 配置多个发现地址和 master name。
- Cluster 客户端完整处理 MOVED、ASK 和 topology refresh。
- replica 读取的陈旧语义写入接口契约。
- failover、网络分区、证书轮换和节点地址变化经过演练。

### 生命周期

- liveness 不因 Redis 短暂故障触发重启风暴。
- readiness 与实际降级能力一致。
- 启动失败可观察，不无限静默等待。
- 停机先摘流量、停止新工作、drain，再关闭连接。
- 已发送但未响应的业务写有恢复与对账机制。

## 常见误区

### “设置 50 ms timeout，命令就一定在 50 ms 停止”

timeout 通常限制客户端等待，不会回滚 Redis 已执行的命令，也不一定能撤回已进入共享发送队列的请求。

### “所有 Redis 错误都重试三次更可靠”

WRONGTYPE、ACL 拒绝等确定错误不会因立即重试恢复；非幂等写超时后重试还会重复副作用。

### “连接池耗尽就把 max connections 调大”

先检查 Redis 延迟、阻塞命令、未设置的 deadline 和重试风暴。扩大池可能只会扩大下游过载。

### “pipeline 等于批量事务”

pipeline 优化传输，不提供原子隔离；批次还可能逐项失败或因断线部分执行。

### “配置 Sentinel 后应用会自动切主”

只有显式支持 Sentinel 的客户端才会查询新 primary、关闭旧连接并重建连接。Sentinel 本身不是数据代理。

### “取消 Promise 就取消了 Redis 命令”

取消通常只停止等待。已发送命令仍可能执行，业务必须处理未知结果。

## 本课小结

- 客户端调用包含 pool wait、建连、发送、执行、响应和解码，必须由端到端 deadline 统一约束。
- 连接池与 multiplexing 都复用连接，但阻塞和有状态命令需要专用连接及清理协议。
- 超时最重要的含义不是“失败”，而是区分明确未执行、明确响应和结果未知。
- 重试必须同时满足错误可恢复、操作可安全重复、剩余预算足够，并使用有界退避和 jitter。
- pipeline 减少 RTT，但不提供事务原子性，网络中断还会产生逐项部分成功。
- Sentinel 客户端负责发现新 primary；Cluster 客户端负责 slot map、MOVED、ASK 和节点连接池。
- liveness、readiness 与业务 canary 回答不同问题，单个 PING 不能证明业务路径健康。
- 优雅停机先停止新流量并 drain，再关闭连接；已发送未响应的写必须进入业务恢复流程。

## 官方资料

- [Redis：Connection pools and multiplexing](https://redis.io/docs/latest/develop/clients/pools-and-muxing/)
- [Redis：Error handling](https://redis.io/docs/latest/develop/clients/error-handling/)
- [Redis：Pipelining](https://redis.io/docs/latest/develop/using-commands/pipelining/)
- [Redis：Sentinel](https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/)
- [Redis：Sentinel client specification](https://redis.io/docs/latest/develop/reference/sentinel-clients/)
- [Redis：Cluster specification](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)
- [Redis：Client handling](https://redis.io/docs/latest/develop/reference/clients/)
- [Redis：Transactions](https://redis.io/docs/latest/develop/using-commands/transactions/)
