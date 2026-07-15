---
title: Redis Cluster、分片、hash slot 与多 key 限制
description: 理解 Redis Cluster 的 16384 个 hash slot、hash tag、cluster-aware 客户端、MOVED/ASK、同 slot 多 key 原子边界、resharding、分片故障转移和容量倾斜
prev:
  text: RDB、AOF、复制、Sentinel 与故障转移
  link: /database/redis/persistence-replication-sentinel-failover
next:
  text: 安全、ACL、TLS、监控与容量规划
  link: /database/redis/security-observability-capacity-planning
---

# Redis Cluster、分片、hash slot 与多 key 限制

单个 Redis primary 即使有 Sentinel，也仍受一台节点的内存、CPU 和网络上限约束。Redis Cluster 通过把 key 分散到多个 primary 实现水平扩展，并为每个分片配置 replica，在部分节点故障时自动转移。

Cluster 的代价是：客户端必须知道 key 属于哪个分片；涉及多个 key 的命令、事务和脚本不再天然可执行；增加节点也不会自动把一个热 key 拆开。数据模型需要在写代码之前考虑 slot，而不是上线后遇到 `CROSSSLOT` 再给所有 key 随手加同一个 hash tag。

## Cluster 与 Sentinel 的职责差异

| 能力 | Sentinel 管理的主从拓扑 | Redis Cluster |
| --- | --- | --- |
| 数据分片 | 不提供，全部 key 在一个 primary | 16,384 个 slot 分布到多个 primary |
| primary 故障转移 | Sentinel 作为独立控制面 | Cluster 节点通过 cluster bus 协调 |
| 客户端路由 | 发现当前单一 primary | 按 slot 直接连接多个 primary |
| 多 key 操作 | 单实例内通常不受 slot 限制 | Redis Open Source Cluster 通常要求同 slot |
| 扩容方式 | 提升单 primary 规格 | 加节点后迁移 slot |
| 单热 key 扩展 | 仍受单 primary 限制 | 仍受单 slot/单 primary 限制 |

Cluster 同时提供分片和一定程度的高可用，但不等于强一致数据库。每个分片内部仍使用异步复制，故障切换可能丢失尚未到达候选 replica 的写；上一课关于幂等、WAIT、持久化和 RPO 的结论仍然成立。

## 16,384 个 hash slot

Redis Cluster 不直接把“某个 key 固定给某台机器”，而是先把 key 映射到 0～16,383 的 slot，再由集群拓扑决定 slot 当前属于哪个 primary：

```text
key
  │ CRC16(key) mod 16384
  ▼
hash slot
  │ slot map
  ▼
primary node
```

例如三个 primary 可大致拥有：

```text
node-A: slots 0      ～ 5460
node-B: slots 5461   ～ 10922
node-C: slots 10923  ～ 16383
```

范围不必连续，也不要求每个节点恰好相同数量。resharding 后，一个节点可能拥有多个不连续 slot 范围。

使用 slot 中间层有两个好处：

- 扩容时移动有限个 slot，不需要改变 hash 算法或重新计算全部 key 的目标节点。
- 客户端维护 16,384 个 slot 到节点的映射，比为每个 key 保存路由简单。

可以在目标 Cluster 上只读检查 keyslot：

```redis
CLUSTER KEYSLOT learning:user:1001
CLUSTER KEYSLOT learning:cart:{user-1001}:items
```

不要在应用里自创另一个不兼容的 hash 算法。成熟 cluster-aware 客户端已经实现 Redis 使用的 CRC16 与重定向协议。

## hash tag：只 hash 花括号中的一段

需要让相关 key 落入同一 slot 时，可以使用 hash tag：

```text
learning:order:{order-1001}:summary
learning:order:{order-1001}:items
learning:order:{order-1001}:events
```

这些 key 都只对 `order-1001` 计算 slot，因此可以在同一分片上执行支持的多 key 命令或事务。

Redis 按第一个有效的非空 `{...}` 模式解析 tag。以下细节值得由公共 key builder 统一处理：

- `foo{bar}one` 与 `x{bar}two` 使用 `bar`，落入同一 slot。
- `foo{}{bar}` 的第一对花括号为空，不形成有效 tag，按完整 key 计算。
- `foo{bar}{zap}` 使用第一段 `bar`，后面的花括号不改变 slot。
- 缺少右花括号时按完整 key 计算。

不要直接把未经编码的用户输入插进 `{}`，否则输入中的花括号可能改变路由或造成不可预测的热点。tag 应来自规范化、受长度限制的业务 ID，并由服务端构造。

### tag 粒度决定原子范围和热点范围

下面两种设计都“能同 slot”，结果却不同：

```text
# 整个租户同 slot
learning:{tenant-42}:order:1001
learning:{tenant-42}:order:1002

# 每个订单各自同 slot
learning:order:{tenant-42:order-1001}:summary
learning:order:{tenant-42:order-1001}:items
```

第一种允许租户内任意 key 做多 key 操作，却把大租户的全部内存和 QPS 压在一个 slot；第二种只保证单订单相关 key 同 slot，可以把不同订单分散到集群。

原则是选择“业务所需的最小原子聚合边界”。不要为了将来可能需要的 MGET，把全站 key 都 tag 成 `{global}`，那会把 Cluster 退化为单分片。

## slot 均匀不等于负载均匀

将 16,384 个 slot 平均分给三个节点，只能让 hash 空间数量接近。实际 key 数、字节和 QPS 可能严重倾斜：

| slot | key 数 | 内存 | QPS | 现象 |
| --- | ---: | ---: | ---: | --- |
| 100 | 500,000 | 30 GiB | 2,000 | 大量冷小 key |
| 200 | 1 | 10 MiB | 80,000 | 单个又大又热的 key |
| 300 | 10,000 | 1 GiB | 100 | 普通工作集 |

移动相同数量的 slot 不能保证移动相同数据量或流量。扩容规划要同时查看：

- 每个 primary 的 slot 数。
- key 数与 `used_memory_dataset`。
- 每 slot 或业务前缀的字节分布。
- 每节点 CPU、网络、命令和 QPS。
- big key、hot key 和 hash tag 聚集。
- replica 同步与持久化峰值。

Cluster 扩容可以分散许多独立 key，不能自动拆分一个 key。单个排行榜、全局计数器或大租户 tag 仍需按上一课方法重构数据模型。

## Cluster 客户端直接路由

Redis Cluster 没有为所有命令提供一个中心代理。cluster-aware 客户端通常：

1. 连接一个或多个 seed 节点。
2. 获取 slot → primary/replica 拓扑。
3. 为相关节点建立连接池。
4. 对 key 计算 slot，直接把命令发给 owner。
5. 收到重定向时刷新局部或完整拓扑并重试。

稳定状态下，请求是客户端到正确节点的一跳，不需要每次先问路。seed 只用于启动发现，不应只配置一个不可用即无法启动的地址。

当前版本可通过 `CLUSTER SHARDS` 获取更结构化的分片、角色、端点和 slot 信息；旧客户端可能使用 `CLUSTER SLOTS`。选择由客户端库与 Redis 版本决定，不应在业务代码手工解析协议文本。

### 每个节点有两类端口

Redis Cluster 节点需要：

- 数据端口供客户端执行 Redis 命令，例如 6379。
- cluster bus 端口供节点间 gossip、故障检测、配置传播和 failover 使用；默认常为数据端口加 10,000，也可以配置。

只开放数据端口而阻断 cluster bus，客户端可能还能短暂访问某些节点，但拓扑无法正常收敛和故障转移。防火墙、容器端口、NAT、TLS 和节点通告地址都要在每个故障域验证。

## MOVED：稳定 owner 已变化

客户端把 key 发给错误节点时，可能收到：

```text
-MOVED 3999 10.0.0.12:6379
```

含义是 slot 3999 当前由新地址负责。正确客户端会：

1. 把当前命令重发到目标节点。
2. 更新该 slot 映射，通常重新获取完整拓扑，因为一次 failover/resharding 可能改变一批 slot。
3. 对重试设置次数和总截止时间，避免拓扑抖动时无限重定向。

`MOVED` 不是普通业务错误，也不应把返回文本直接交给接口用户。若应用频繁看到 MOVED，说明拓扑缓存过旧、节点通告地址不可达或客户端不是完整 Cluster 客户端。

命令是否能安全重发仍取决于客户端是否确定原节点没有执行。MOVED 表示该节点不负责 slot，通常命令未执行；网络超时则不同，结果可能未知，非幂等写不能统一重试。

## ASK：迁移期间只重定向当前命令

在线迁移一个 slot 时，旧 owner 标记为 MIGRATING，新节点标记为 IMPORTING。slot 内的 key 会逐个移动，因此一段时间内：

- 尚未迁移的 key 仍在旧节点。
- 已迁移或在旧节点不存在的 key 需要去新节点。

旧节点可能返回：

```text
-ASK 3999 10.0.0.13:6379
```

客户端应在目标连接上先发送 `ASKING`，紧接着只重试这条命令：

```text
ASKING
原命令
```

ASK 是临时例外，不能立即把 slot 3999 永久映射到新节点；后续其他 key 可能仍在旧节点。迁移完成、slot owner 正式切换后，客户端会收到 MOVED，再更新稳定映射。

完整 Cluster 客户端必须同时支持 MOVED 与 ASK。只实现“看到任意重定向就改 slot 表”，在 resharding 中会让请求在新旧节点之间反复跳转。

## 多 key 命令的同 slot 限制

Redis Open Source Cluster 的许多多 key 命令要求所有 key 属于同一 slot：

```redis
MGET learning:user:1001 learning:user:1002
# 如果 slot 不同，可能返回 CROSSSLOT

MGET learning:user:{1001}:profile learning:user:{1001}:settings
# tag 相同，可以在一个 slot 内执行
```

常见受影响操作：

- MGET、MSET、DEL 多 key 等命令。
- SUNION、SINTER、ZUNION 等集合运算涉及的 key。
- `MULTI/EXEC` 事务中的所有 key。
- WATCH 的 key 与事务访问 key。
- Lua/EVAL/Function 访问的 key。
- LMOVE/BLMOVE 的 source 与 destination。

具体命令在 Redis Open Source、Redis Software、Active-Active 和不同版本中的 cross-slot 能力并不完全相同。课程基线是 Redis Open Source Cluster；使用托管或企业形态时应查目标产品的 multi-key 兼容表。

### 同 slot 只解决路由，不扩大事务能力

把 key 放到同 slot 后，MULTI/EXEC 仍是 Redis 事务语义：命令排队后连续执行，没有关系数据库式回滚；它也不能把 MySQL/PostgreSQL 或 HTTP 副作用纳入原子边界。

hash tag 不是分布式事务协议，只是让相关 key 由同一 primary 处理。

### Lua 与 Function

脚本应通过 `KEYS` 显式声明所有 key，不根据 value 在脚本中动态拼接未知 key。所有相关 key 使用同一 tag，并在上线前通过 `CLUSTER KEYSLOT` 或客户端测试验证。

脚本迁移到 Cluster 常见失败：开发环境只有单实例，所以跨 key 脚本正常；生产 key 没有统一 tag，EVAL 才返回 CROSSSLOT。静态扫描脚本中的 key 构造并做集成测试，比运行时补 tag 安全。

### Pipeline 不等于事务

pipeline 只减少网络往返，不提供原子性。cluster-aware 客户端可以按目标节点把一批独立命令拆成多个子 pipeline 并行发送；结果可能来自不同节点、部分成功，错误顺序也要映射回原请求。

如果一个业务批次要求全有或全无，跨 slot pipeline 不能满足。应重新设计为单实体同 slot、数据库事务、Saga/补偿或异步状态机。

## 跨 slot 读取的应用层组合

用户首页要读取 20 个分散商品时，不一定要给 20 个商品加同一 tag。应用可以：

1. 计算每个 key 的 slot/节点。
2. 按节点分组并行 MGET 或 pipeline。
3. 设置总体截止时间和每节点超时。
4. 把结果按原 key 顺序合并。
5. 明确部分节点失败时是部分响应、回源数据库还是整体失败。

这种 scatter-gather 会放大连接数和尾延迟：整体耗时接近最慢分片，任一节点失败都可能影响接口。批量上限必须有限，不能让用户一次提交百万 key 做跨集群 fan-out。

若某个聚合每次都跨很多 slot，考虑预计算结果、按聚合边界建专用缓存，或让数据库承担查询，而不是强行用 Redis 做临时 join。

## 在线 resharding 实际移动的是 key

添加空 primary 后，它还没有 slot，也没有业务数据；不会自动分担流量。必须把一部分 slot 从旧节点迁移给新节点。

单 slot 迁移的简化过程：

```text
目标节点 B：slot 3999 标记 IMPORTING from A
源节点 A：slot 3999 标记 MIGRATING to B
循环取出 slot 内小批 key
把 key 从 A 原子迁移到 B
全部完成后：所有节点确认 slot 3999 owner=B
```

Redis 的集群管理工具会编排底层命令。不要在生产手工拼 `CLUSTER SETSLOT`/`MIGRATE`，除非已有经验证的恢复手册；中途错误可能让各节点 slot 认知不一致。

迁移可在线进行，但不是零影响：

- MIGRATE 需要序列化、网络传输和目标写入。
- big key 会延长单次阻塞并造成延迟尖峰。
- ASK 增加客户端往返与重试。
- 源/目标 CPU、网络、内存和复制压力上升。
- 迁移期间多 key 操作可能暂时返回 TRYAGAIN。
- AOF/RDB 和 replica 也要处理迁移产生的数据变化。

应在迁移前治理 big key，按字节和 QPS选择 slot，限制每批速率，设置延迟/复制 lag/错误率停止阈值，并确保工具支持中断后安全继续。

### rebalance 不能只按 slot 数

假设 node-A 有 5,000 slots、40 GiB 和 80% QPS，node-B 有 5,500 slots、10 GiB 和 10% QPS。把“500 个任意 slot”从 A 移到 B 可能几乎不改变负载。

迁移计划至少有三张视图：

- **容量**：每 slot 字节、key 数、增长率。
- **流量**：每 slot QPS、带宽、命令复杂度。
- **风险**：big key、关键 tag、复制和故障域。

流量会随活动变化，迁移后要持续观察而不是一次性认为均衡完成。

## Cluster 故障检测与分片 failover

Cluster 节点通过 cluster bus 交换 gossip、配置 epoch、PING/PONG 和故障信息。某 primary 不可达时，其他 primary 达到故障判断条件后将其标记 FAIL；合格 replica 可以发起选举并获得多数 primary 投票后提升。

一个常见生产拓扑是至少三个 primary，每个有一个或更多 replica，并把 primary 与其 replica 放在不同故障域。具体副本数取决于故障目标和容量，不能只满足“进程数量”。

Cluster 能在以下条件下容忍部分故障：多数 primary 仍可达，并且失效 primary 有可提升的可达 replica。若多数 primary 不可用，集群会停止正常服务以避免少数分区继续形成不受控历史。

### full coverage

`cluster-require-full-coverage` 决定有 slot 暂时无人服务时是否让整个集群停止接受请求。默认常为 yes：任一 slot 无覆盖时，整体进入失败状态。设为 no 可让仍有 owner 的 slot 继续服务，但应用会面对部分 key 可用、部分 key CLUSTERDOWN/失败。

这不是简单的“no 更高可用”。若一个订单请求需要多个分片，部分服务可能产生半完成；选择前要定义应用如何识别缺失 slot、怎样降级和补偿。

`cluster-allow-reads-when-down` 等参数也会改变失败状态下的读取行为，并可能暴露陈旧数据。所有这类配置都应在目标版本和故障模型下评估，不能为了通过健康检查临时修改。

### 故障转移仍会丢写

每个分片内部是异步复制。primary 接受 W 后在复制前故障，被提升的 replica 没有 W，写就丢失。WAIT 能降低概率但不能提供强一致；网络分区中的旧 primary 还可能在一段时间内接受写。

因此 Cluster 解决横向容量与部分故障可用性，不改变资金、订单等业务事实应由数据库约束和幂等协议维护的原则。

## replica 读取

Cluster replica 默认不会像 primary 一样服务普通 key 请求。客户端在 replica 连接上发送 `READONLY` 后，可以读取它负责 primary slots 的 key；成熟客户端通常提供 replica-read 路由策略。

副本读的代价：

- 异步复制导致陈旧。
- 故障转移和拓扑变化时要更新映射。
- 同一请求从不同 replica 读取可能不满足 read-your-writes。
- 热读可以分散，但大 value 仍消耗每个副本网卡。

权限、锁、刚写后的状态不能只为降低 primary QPS 就随机走 replica。业务要定义最大陈旧时间和回退 primary 的条件。

## 数据模型设计清单

### 需要原子更新的单实体

把真正需要一起操作的 key 使用实体级 tag：

```text
learning:order:{order-1001}:summary
learning:order:{order-1001}:items
learning:order:{order-1001}:idempotency
```

同时控制单实体 key 数和总字节，避免一个订单演变成大 slot 热点。

### 可独立访问的数据

不要加共享 tag，让 CRC16 自然分散：

```text
learning:product:1001
learning:product:1002
learning:product:1003
```

批量读取由客户端按节点分组，接受非原子部分结果。

### 全局计数与排行榜

先判断能否分区后汇总。若必须单 key 精确更新，它就是天然单 slot 热点，Cluster 节点数再多也不扩展该操作。可改为分桶计数、周期聚合或用更适合的分析系统，但会牺牲即时精确性。

### 队列与 Streams

一个 Stream key 属于一个 slot，consumer group 元数据随它在同一分片。多分区事件流需要多个 Stream key，并由应用决定 aggregate 路由、consumer 分配、跨分区顺序和再均衡。

List reliable queue 的 ready/processing key 必须同 slot才能 BLMOVE，例如：

```text
learning:queue:{email}:ready
learning:queue:{email}:processing
```

一个 `{email}` 队列仍是单 slot；提高吞吐需要多个明确分区，而不是多个同 tag key。

## 从单实例迁移到 Cluster

迁移前先做兼容审计：

1. 列出 MGET/MSET、集合运算、RENAME、LMOVE 等多 key 命令。
2. 找出 MULTI/WATCH/Lua/Function 访问的所有 key。
3. 检查应用是否使用多个逻辑 database；Redis Cluster 只支持 database 0，不提供 SELECT 分库模式。
4. 统计大 key、热 key、key 字节和 QPS，设计 tag 粒度。
5. 确认客户端真正支持 Cluster、MOVED、ASK、拓扑刷新和 TLS/ACL。
6. 为跨 slot 批量设计部分失败与超时。
7. 在测试 Cluster 做 resharding、failover 和扩缩容演练。

不要只把连接地址从单机改成 Cluster seed。单实例测试无法暴露 CROSSSLOT、ASK、节点级连接池和部分分片故障。

迁移数据时要明确双写/停写窗口、TTL 保留、Stream/group、Lua 脚本、持久化和回滚。校验不仅比较 key 数，还要按 slot、类型、TTL、抽样值和业务不变量检查。

## 常见错误与排查方向

| 错误/现象 | 含义 | 排查方向 |
| --- | --- | --- |
| `CROSSSLOT` | 一次操作涉及不同 slot | key builder、tag 粒度、多 key 命令 |
| `MOVED` | 稳定 owner 不是当前节点 | 客户端拓扑、通告地址、failover/迁移 |
| `ASK` | slot 正在迁移，当前命令临时去目标 | 客户端 ASKING 支持、resharding 状态 |
| `TRYAGAIN` | 迁移期间操作暂时无法完成 | 有界退避、同 slot 多 key、迁移负载 |
| `CLUSTERDOWN` | 集群失败或 slot 无覆盖 | `CLUSTER INFO`、节点/slot/多数状态 |
| `READONLY` | 写发到了 replica 或旧 primary 已降级 | 客户端角色刷新、旧连接池 |
| 单节点持续过载 | slot/key/QPS 不均 | hot key、big key、hash tag、reshard |

网络超时、连接重置与这些明确 Redis 错误不同。明确 MOVED/ASK 通常说明命令未在错误节点执行；超时可能发生在执行前或执行后，非幂等写仍需业务查询确认。

## 可观测性

### 集群状态

```redis
CLUSTER INFO
CLUSTER SHARDS
CLUSTER KEYSLOT learning:order:{order-1001}:summary
```

在授权的运维账号下观察：

- `cluster_state` 与已分配/失败 slot。
- known nodes、primary/replica 角色和配置 epoch。
- 每分片复制 offset、lag 与 failover 状态。
- MOVED、ASK、TRYAGAIN、CROSSSLOT、CLUSTERDOWN 速率。
- 客户端拓扑刷新次数与重定向重试耗时。

### 容量与负载

- 每 primary slot 数、key 数、数据集字节、RSS。
- CPU、网络、ops/sec、命令延迟和客户端数。
- 每业务 tag/key 的 Top-N QPS 与响应字节。
- big key、hot key 和单 slot 数据量。
- resharding 的 key/字节进度、源/目标延迟和 replica lag。

`SCAN`、DBSIZE 等在 Redis Open Source Cluster 中通常是节点局部视图。做全局统计需要遍历所有 primary 并处理迁移与重复，不能只连一个 seed 就把结果当集群总量。

## 故障与变更演练

测试环境至少验证：

1. 相同 tag key 的 slot 相同，不同聚合能分散。
2. 跨 slot MGET/MULTI/Lua 按预期失败，应用有替代路径。
3. 客户端收到 MOVED 后刷新稳定拓扑。
4. resharding 中收到 ASK 时只临时重试并发送 ASKING。
5. 迁移 big key 时延迟停止阈值有效。
6. primary 故障后 replica 提升，旧连接出现 READONLY 时能恢复。
7. 某 slot 无覆盖时，full coverage 配置符合业务降级设计。
8. 网络分区和异步复制下，幂等协议能处理丢失/重复写。
9. 新增节点后，迁移计划确实改善字节和 QPS，而不只改变 slot 数。
10. 节点通告地址从应用所在网络真实可达。

Cluster 管理命令会改变拓扑和数据位置，只能在隔离环境或经审批的变更流程中执行。本课不提供可直接复制到生产的建群、删节点或迁移命令。

## 配套路由与迁移模型

`examples/database/redis/08-cluster-routing-resharding.mjs` 不连接 Redis，使用 CRC16 和内存拓扑验证：

- Redis hash tag 提取规则与 16,384 slot 计算。
- 相同业务 tag 的 key 同 slot，跨 slot 多 key 操作被拒绝。
- MOVED 会更新稳定 slot map；ASK 只重试当前命令，不永久更新。
- 相同 slot 数仍可能有不同内存和 QPS，rebalance 要按负载而非只按数量。
- full coverage 开启时，一个 slot 无 owner 会让集群整体不可用；关闭时只能继续服务有覆盖的 slot。

运行：

```bash
node examples/database/redis/08-cluster-routing-resharding.mjs
```

模型没有模拟真实 gossip、配置 epoch、MIGRATE、复制和选举，只用于验证路由决策。生产客户端应使用成熟 Cluster 库，不复制教学 CRC16 代码作为连接实现。

## 常见误区

### “三台节点平均分 slot，负载就均匀”

slot 只均分 hash 空间，不均分 key 字节、命令成本和 QPS。热 key、大 key 和 hash tag 会让单节点过载。

### “给所有 key 加同一个 `{app}` 就不会 CROSSSLOT”

它确实让多 key 操作同 slot，也让所有数据和流量只使用一个分片，完全失去水平扩展。

### “ASK 与 MOVED 都是改地址后重试”

ASK 是迁移中的单次临时路由，要先 ASKING 且不永久改 slot 表；MOVED 表示稳定 owner 改变，应刷新映射。

### “Pipeline 能让跨 slot 写原子提交”

pipeline 只批量网络发送。cluster-aware 客户端可能拆到多个节点，任一子批失败会造成部分成功。

### “加新节点后数据会自动均衡”

空节点没有 slot 就不承载 key。必须执行受控 resharding，并按字节与 QPS选择迁移对象。

### “Cluster 有副本，所以写不会丢”

分片内部默认异步复制，failover 仍可能丢未复制写。Cluster 解决分片和部分可用性，不提供业务强一致。

## 本课小结

- Redis Cluster 先用 CRC16 把 key 映射到 16,384 个 slot，再由拓扑把 slot 分配给 primary。
- hash tag 让相关 key 同 slot；tag 粒度应是业务所需的最小原子边界，过大会制造热点。
- slot 数均匀不代表 key 数、内存、QPS 和网络均匀，容量与流量必须分别观测。
- cluster-aware 客户端维护 slot map 并直连 owner；MOVED 更新稳定映射，ASK 只处理迁移中的当前命令。
- Redis Open Source Cluster 的多 key 命令、事务和脚本通常要求所有 key 同 slot；同 slot 也不会获得跨数据库事务。
- cluster pipeline 可以按节点拆批，但不原子，必须处理部分成功。
- 添加节点后要迁移 slot；在线 resharding 实际逐 key 移动，big key 会显著放大延迟。
- Cluster failover 依赖多数 primary 与可提升 replica，异步复制仍有数据丢失窗口。
- full coverage 是整体停止与部分 slot 继续服务之间的业务选择，不是单纯开关高可用。
- 从单实例迁移前必须审计多 key、Lua、逻辑 database、key tag 和客户端协议支持。

## 官方资料

- [Redis：Redis Cluster specification](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)
- [Redis：Scale with Redis Cluster](https://redis.io/docs/latest/operate/oss_and_stack/management/scaling/)
- [Redis：Multi-key operations](https://redis.io/docs/latest/develop/using-commands/multi-key-operations/)
- [Redis：Keyspace 与 hash tags](https://redis.io/docs/latest/develop/using-commands/keyspace/)
- [Redis：CLUSTER KEYSLOT](https://redis.io/docs/latest/commands/cluster-keyslot/)
- [Redis：CLUSTER SHARDS](https://redis.io/docs/latest/commands/cluster-shards/)
- [Redis：CLUSTER INFO](https://redis.io/docs/latest/commands/cluster-info/)
