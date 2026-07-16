---
title: TTL、内存淘汰、大 key 与热 key 治理
description: 理解 Redis 过期删除、maxmemory、淘汰策略、容量与碎片，并掌握大 key、热 key 的低风险诊断、拆分和运行治理
prev:
  text: Redis 分层导航
  link: /database/redis/
---

# TTL、内存淘汰、大 key 与热 key 治理

Redis 把数据主要放在内存中，低延迟的代价是容量和单线程命令耗时必须受到严格约束。一个接口即使逻辑完全正确，也可能因为 key 没有过期、淘汰策略选错、一个 Hash 无限增长，或全部流量集中到一个 key 而让 Redis 延迟突增。

本课从 key 的完整内存生命周期展开：创建、更新、设置 TTL、逻辑过期、物理回收、达到 `maxmemory` 后淘汰，以及大 key、热 key 对主线程、网络、复制和下游的影响。重点是建立可验证的容量模型和低风险排查流程，而不是在线上看到内存高就立即删 key 或改配置。

## 先区分四个概念

| 概念 | 判断依据 | 典型原因 | 主要风险 |
| --- | --- | --- | --- |
| expiration / 过期 | key 的绝对到期时间已到 | TTL 设计 | 陈旧窗口结束、批量回源、物理清理滞后 |
| eviction / 淘汰 | 内存超过 `maxmemory`，按策略选择牺牲者 | 容量不足或策略设计 | 热点被挤出、循环回填、写命令失败 |
| big key / 大 key | 单个 key 的 value、成员数或单次操作成本过大 | 无界集合、大对象缓存 | 主线程阻塞、网络尖峰、迁移和删除抖动 |
| hot key / 热 key | 单个 key 的访问流量远高于其他 key | 流量倾斜、全局状态 | 单分片 CPU、网卡或连接成为瓶颈 |

大 key 和热 key 是两个维度：10 MB 的冷归档对象是大 key，但不一定热；一个 20 字节的全站开关可能非常热；又大又热的 key 最危险，因为每次访问都同时消耗主线程和网络。

## TTL 是数据生命周期契约

TTL 不只是“省内存”的参数。它同时表达：这个 Redis 状态最长可存在多久、多久必须重新确认真相来源、租约何时自动失效，以及临时数据何时应清理。

设置字符串和 TTL 应尽量用一条命令：

```redis
SET learning:cache:user:1001 '{"name":"Alice"}' EX 300
```

已有 key 可以使用：

```redis
EXPIRE learning:cache:user:1001 300
PTTL learning:cache:user:1001
```

`TTL` 以秒返回剩余时间，`PTTL` 以毫秒返回。常见特殊返回值：

- `-2`：key 不存在。
- `-1`：key 存在，但没有过期时间。

监控“漏 TTL”时必须区分这两种情况，不能把所有负数都当成永久 key。

### TTL 更新不是自动保持

命令对 TTL 的影响取决于它是否替换整个 value：

- `SET key newValue` 覆盖 key 时，原 TTL 通常会被移除，除非显式使用相应保留选项。
- `INCR`、`LPUSH`、`HSET` 等原地修改通常不会移除已有 TTL。
- `PERSIST` 会主动删除 TTL，使 key 永久存在。
- `RENAME` 会把原 key 的 TTL 一起转移到新名称。

因此，写缓存的公共封装应把 value 与 TTL 作为同一契约处理。一次代码重构若从 `SET ... EX` 变成 `SET` 后再异步 EXPIRE，中间崩溃就会留下永久 key。

较新 Redis 的 EXPIRE 支持 `NX`、`XX`、`GT`、`LT` 等条件，但部署版本和客户端必须匹配。例如只想延长租期而不缩短，可以评估 `GT`；这仍不能替代 owner token 检查，因为任何客户端都可能延长别人的 key。

### 过期时间使用绝对时间保存

Redis 把过期信息保存为绝对 Unix 时间戳。服务停止期间，现实时间仍会前进；把 RDB 移到时钟差异很大的机器，或系统时钟突然跳跃，都可能导致大量 key 立即过期或延后。

生产环境需要可靠的时间同步，并监控时钟漂移。业务上要求精确截止时刻的令牌、会话和租约，还应在应用或权威数据库中验证业务时间，不能只凭“Redis key 还存在”判断安全。

### 被动过期与主动过期

Redis 用两种方式清理到期 key：

1. **被动过期**：客户端访问 key 时发现已到期，Redis 将其删除并按不存在处理。
2. **主动过期**：Redis 周期性从带 TTL 的 key 中抽样，清理已经到期但不再被访问的 key。

Redis 不会为每个 key 启动一个独立定时器并在到期毫秒精确执行删除。这样做会产生巨大的定时器和调度成本。

要区分逻辑可见性与物理回收：到期 key 在访问时不会继续作为有效值返回，但某些尚未被抽样的过期对象可能短暂占着内存。大量 key 同时到期时，主动清理也会消耗 CPU；上一课提到的 TTL 抖动可以分散这种相关性和数据库回源。

`expired_keys` 表示因过期删除的累计数量；它与 `evicted_keys` 含义不同。前者说明 TTL 生命周期结束，后者说明内存压力迫使 Redis 提前牺牲 key。

### 不要依赖过期事件完成关键业务

过期可以触发 keyspace notification，但通知不是持久任务队列：配置可能未开启，订阅者可能离线，物理过期时间也不等于业务截止的精确时刻。

例如“30 分钟未支付就取消订单”，正确做法是数据库保存 `expires_at`，由可重试调度器按条件 UPDATE 订单；Redis TTL 可以帮助快速查找或减少扫描，不能作为订单取消的唯一事实和唯一触发器。

## `maxmemory` 与进程内存不是一个数字

`maxmemory` 是 Redis 执行内存淘汰判断时使用的数据集上限，不等于容器或主机可以全部交给 Redis 的内存。进程还需要：

- Redis 自身结构和 allocator 开销。
- 内存碎片。
- 客户端连接与输出缓冲。
- 复制 backlog 和副本传输缓冲。
- AOF 缓冲与重写期间开销。
- RDB/AOF rewrite 的 copy-on-write 峰值。
- OS、监控 agent 和其他进程内存。

Redis 官方说明，某些复制和 AOF 缓冲不会计入用于比较 `maxmemory` 的数值，避免淘汰产生的新传播命令形成反馈循环。`INFO memory` 中的 `mem_not_counted_for_evict` 可帮助估算这部分当前开销。

如果容器限制 8 GiB，却把 `maxmemory` 直接设为 8 GiB，进程可能在 Redis 开始有效保护前就被内核 OOM kill。应该从总限制中减去系统、非淘汰缓冲、碎片和故障峰值余量，再得到数据集预算。

### 常用内存指标怎样读

```redis
INFO memory
INFO stats
MEMORY STATS
```

重点不是记住所有字段，而是按关系判断：

| 指标 | 要回答的问题 |
| --- | --- |
| `used_memory` | Redis allocator 当前管理多少内存 |
| `used_memory_dataset` | 数据集本身大约占多少 |
| `used_memory_rss` | OS 看到的 Redis 常驻内存是多少 |
| `maxmemory` | 数据集触发淘汰的配置上限是什么 |
| `mem_not_counted_for_evict` | 哪些缓冲未计入淘汰判断 |
| `allocator_frag_ratio` | allocator 分配与实际使用是否有碎片迹象 |
| `mem_fragmentation_ratio` | RSS 与 Redis 统计内存差异是否异常 |
| `evicted_keys` | 是否正因内存压力淘汰 key |
| `expired_keys` | TTL 清理是否显著增长 |
| `current_eviction_exceeded_time` | 是否持续处于超过上限状态 |

比率在数据量很小时容易失真，不能看到 `mem_fragmentation_ratio > 1` 就直接重启。要结合绝对字节、运行时长、负载、fork 状态和趋势。

`used_memory_rss` 明显高于 `used_memory` 可能是碎片或内存尚未归还 OS；RSS 低于 used_memory 可能涉及 swap，通常会严重伤害延迟。容器环境还要同时看 cgroup working set 和 OOM 事件，不能只看 Redis 内部指标。

## 淘汰策略决定“内存满时牺牲谁”

达到 `maxmemory` 后，写入或其他增加内存的命令触发淘汰检查。策略分成三类：

| 策略族 | 候选范围 | 适用思路 |
| --- | --- | --- |
| `noeviction` | 不自动淘汰 | 读仍可进行，增加内存的写命令报错；数据不可随意丢时使用 |
| `allkeys-*` | 所有 key | 实例整体都是可重建缓存时使用 |
| `volatile-*` | 只有带 TTL 的 key | 同实例混有不可淘汰 key 时使用，但候选不足会退化为写失败 |

常见选择维度：

- `lru`：倾向淘汰最近最少访问的 key。
- `lfu`：倾向淘汰访问频率较低的 key，并让频率随时间衰减。
- `random`：随机选择，访问分布均匀或不值得维护热点信息时可评估。
- `ttl`：在 volatile 候选中倾向剩余 TTL 更短的 key。
- 较新版本还可能提供基于最近修改时间的策略，必须核对目标版本。

Redis 的 LRU/LFU 是近似算法，不维护全量 key 的精确全序。它抽样一部分候选并选择较合适的牺牲者，以更少内存和 CPU 换取近似效果。`maxmemory-samples` 会影响精度和成本，但不应在未压测时盲目调大。

### 如何选择

1. **纯缓存实例**：通常从 `allkeys-lru` 或 `allkeys-lfu` 评估。热点稳定、希望长期高频 key 留存时 LFU 有优势；访问热点快速变化时要验证衰减行为。
2. **有明确 TTL 的缓存**：仍可使用 allkeys 策略；TTL 负责新鲜度，淘汰负责容量，两者职责不同。
3. **缓存与不可丢状态混放**：`volatile-*` 看似能保护永久 key，但 TTL 候选耗尽时写会失败，永久数据还会持续挤压缓存。更好的做法通常是拆实例和容量边界。
4. **任何 key 都不能提前丢**：使用 `noeviction` 并做好写失败和扩容；同时重新确认 Redis 持久化是否满足事实存储要求。

策略不能仅凭名称决定。应在真实访问分布下观察命中率、淘汰速率、回源负载和 P99 延迟。命中率略高但频繁淘汰导致数据库过载，也不是好策略。

### 淘汰循环

工作集大于内存时会形成：

```text
miss → 数据库回源 → SET 大 value → 淘汰其他热点
   → 其他热点 miss → 更多回源和回填 → 更多淘汰
```

这不是把 TTL 调长能解决的问题。要减少缓存对象、缩小 value、提高容量、隔离工作集或降低回填速率。持续增长的 `evicted_keys`、下降的命中率和上升的数据库 QPS 是典型组合信号。

`noeviction` 下也不能只监控实例存活。读可能正常，而 SET、XADD、SADD 等需要增加内存的命令报错；应用必须记录 Redis 写失败，不能把缓存回填或幂等记录写入假定为成功。

## 容量规划：平均值会掩盖尾部

一个初步模型：

```text
数据集预算 ≈ key 数量 × 单 key 平均分配字节
          + 大型集合与 Stream
          + 过期字典等结构开销

实例内存需求 ≈ 数据集预算
            + 非淘汰缓冲
            + 内存碎片
            + fork/copy-on-write 峰值
            + 安全余量
```

但不能只乘平均值。若 99.9% key 是 1 KB，0.1% key 是 10 MB，少数尾部可能占据绝大多数内存。容量报告至少按 key 类型和业务前缀统计：

- key 数量与增长率。
- value 分配字节的 P50/P95/P99/最大值。
- TTL 覆盖率与剩余 TTL 分布。
- 每小时新增、过期、淘汰数量。
- 集合成员数和 Stream 长度分位数。
- 峰值流量下客户端/复制/AOF 缓冲。

`MEMORY USAGE key` 返回 key 与 value 的分配字节，包含管理开销。对嵌套类型默认抽样少量成员估算；`SAMPLES 0` 会检查全部成员，在大集合上成本可能很高。线上应先用默认小样本，再在测试副本或受控窗口提高样本数。

不同 Redis 版本、编码、allocator、托管形态和 Active-Active 元数据都会改变单 key 开销。开发机测得“每条 80 字节”不能直接乘到生产；应在目标版本、类似数据分布上采样并保留增长余量。

## 什么算大 key

“超过 10 MB 才算大 key”不是通用标准。大 key 至少有四种定义：

1. **字节大**：一个 String/JSON 数 MB，每次 GET 都产生网络和序列化尖峰。
2. **成员多**：一个 Hash/Set 有百万成员，即使单成员很小，全量遍历和删除也昂贵。
3. **单命令返回大**：`HGETALL`、`SMEMBERS`、`LRANGE 0 -1` 返回巨大响应。
4. **操作复杂度大**：超大集合上的交集、排序、脚本循环长期占用主线程。

阈值应该从服务延迟预算推导。例如接口 P99 目标 20 ms，单个 key 的读取、传输、反序列化若已消耗 15 ms，它对这个系统就是大 key，即使只有 500 KB。

### 大 key 为什么伤害整台实例

Redis 的命令执行路径主要串行。一个长命令占用主线程时，其他无关的小 GET 也要排队。影响包括：

- 大请求和响应占用网卡、客户端缓冲和事件循环。
- 序列化/反序列化增加应用 CPU 和 GC。
- DEL 大复合对象释放大量内存，阻塞后续命令。
- 复制和 AOF 传播大写入，增加延迟与缓冲。
- RDB/AOF rewrite 期间频繁修改大对象放大 copy-on-write。
- Cluster 迁移大 key 时阻塞更久，单 slot 负载不均。
- 备份、恢复和故障转移耗时增加。

因此，大 key 治理不能只看它占总内存百分比；一个只占 1% 但每秒全量读取 100 次的对象，可能已经是主要延迟来源。

## 低风险发现大 key

### 第一步：先看全局趋势

先获取只读汇总：

```redis
INFO memory
INFO stats
INFO commandstats
MEMORY STATS
```

先回答是数据集增长、碎片、客户端缓冲、淘汰，还是某类命令变慢。不要一上来全库扫描。

### 第二步：检查已知可疑 key

```redis
TYPE learning:cache:catalog
MEMORY USAGE learning:cache:catalog SAMPLES 5
OBJECT ENCODING learning:cache:catalog
PTTL learning:cache:catalog
```

再按类型看基数，不读取全部内容：

```redis
STRLEN learning:string:payload
LLEN learning:list:jobs
HLEN learning:hash:users
SCARD learning:set:members
ZCARD learning:zset:ranking
XLEN learning:stream:orders
```

基数小不代表字节小，成员本身可能很大；MEMORY USAGE 小样本也可能错过极端成员，所以要结合业务 schema 和响应字节指标。

### 第三步：受控扫描

`SCAN` 每次只做一部分工作，完整扫描总复杂度仍是 O(N)：

```redis
SCAN 0 MATCH learning:* COUNT 100
```

正确循环必须：

1. 从 cursor `0` 开始。
2. 使用 Redis 返回的新 cursor 继续。
3. 即使本批返回 0 个 key，也不能提前结束。
4. 只有返回 cursor 再次为 `0` 才算完成。
5. 接受重复 key；若统计要求唯一，要在客户端去重。
6. 扫描期间新增或删除的 key 可能出现也可能不出现。

`COUNT` 是工作量提示，不保证每批恰好返回这么多。SCAN 比 KEYS 更适合生产诊断，但完整扫描仍会消耗 CPU 和网络，多个节点、多个分析任务并发扫描也会形成负载。

当前 redis-cli 提供 `--bigkeys`、`--memkeys`、`--keystats` 等扫描工具，并可用 `-i` 在若干 SCAN 调用之间暂停。使用前应：

- 核对 redis-cli 与服务端版本支持的选项。
- 先在副本或测试快照验证，但理解副本数据可能滞后。
- 在低峰、变更审批和延迟停止阈值下运行。
- 按业务前缀缩小范围，不把 key 名和敏感数据输出到不安全终端。
- Cluster 对每个分片分别分析，不能只扫一个节点。

不要在大库用 `KEYS *`，也不要为了判断大小执行 `HGETALL`、`SMEMBERS`、`LRANGE 0 -1` 或把整个 key DUMP 到本地。

## 大 key 的结构性治理

### 从无界改为有界

- List 只保留最近 N 条，或用 Streams 的明确保留策略。
- 日志和事件按时间归档，不在 Redis 无限积累。
- 排行榜按业务周期拆分，并清理过期周期。
- 缓存分页结果，而不是把全量目录装进一个 JSON。
- 为每个集合定义最大成员数、最大成员字节和最大生命周期。

### 拆 key 要按访问模式

一个百万字段 Hash 可以按稳定业务维度拆分：

```text
learning:profile:{tenant-42}:bucket:00
learning:profile:{tenant-42}:bucket:01
...
learning:profile:{tenant-42}:bucket:3f
```

按用户 ID hash 到桶能限制单 key 大小，但 `{tenant-42}` hash tag 会让所有桶仍落在同一 Cluster slot。如果目标是分散分片负载，就不能给所有桶使用相同 hash tag；如果需要同 slot 多 key 原子操作，又必须接受集中。两者不能同时免费获得。

拆分后要解决：

- 怎样定位成员，避免广播查询所有桶。
- 跨桶统计是否允许近似或异步汇总。
- TTL 是每桶独立还是由索引统一管理。
- 扩容改变桶数时如何迁移且不漏读。
- 多 key 更新是否仍需要原子性。

不要只把一个大 JSON 切成 100 个随机片段，让每次请求又 MGET 全部片段；那只是把单 key 大响应改成多 key 大响应。

### 删除与缩减

删除整个大 key 时，`UNLINK` 会先从 keyspace 取消关联，再异步回收底层内存，通常比 `DEL` 对主线程更友好：

```redis
UNLINK learning:obsolete:large-key
```

这仍是写操作，必须确认 key 所有权、业务影响、复制与异步释放队列容量。`UNLINK` 不是“零成本”，只是把主要释放工作移出主线程。

需要保留 key、只缩减集合时，使用 `HSCAN`/`SSCAN`/`ZSCAN` 与小批量删除，或按分数/索引做有界裁剪。边扫描边修改集合时 SCAN 可能重复或对变化元素结果未定义，删除逻辑必须幂等并可能多轮收敛。先在影子 key 或测试数据验证，设置每批数量、间隔和停止条件。

对线上大 key 的一次性迁移应采用“双读/新写新结构/后台搬迁/校验/切换/延迟删除”流程，而不是在请求线程一次转换全部数据。

## 热 key：频率造成的单分片瓶颈

第三课已从缓存击穿介绍热点保护；这里从运行层深入。热 key 可能是：

- 高频 GET 的全站配置。
- 高频写的计数器或库存状态。
- 高频读取的大排行榜。
- hash tag 设计让许多逻辑 key 集中到同一 slot。
- 一个热门租户远超其他租户流量。

即使 Cluster 有很多分片，一个 key 仍只属于一个 slot、由一个主分片处理。加节点不会自动拆开单 key 的命令流量。

### 怎样发现热 key

优先从应用侧建立低基数聚合：资源类型 QPS、响应字节、Redis 节点、命令类型和业务租户等级。客户端知道“哪个逻辑操作”导致访问，比 Redis 只看到 key 字符串更容易定位根因。

Redis 侧结合：

- 每分片 ops/sec、CPU、网络和延迟。
- `INFO commandstats` 的命令调用与耗时。
- 客户端连接池等待和超时。
- 托管平台的 Top key/热 key 能力。
- 受控抽样工具。

`redis-cli --hotkeys` 依赖 LFU 淘汰策略提供的频率信息，只在 `maxmemory-policy` 为 `*lfu` 时工作。不要为了临时诊断直接修改生产淘汰策略，因为策略改变本身会影响缓存行为。当前新版本可能提供额外热点检测能力，也要先核对服务端、redis-cli 和托管平台版本。

`MONITOR` 会输出服务器处理的全部命令，生产高流量实例上开销和敏感数据风险都很高，不应作为常规热 key 诊断手段。

### 治理方式与代价

| 方法 | 适用场景 | 代价/边界 |
| --- | --- | --- |
| 应用 L1 短缓存 | 极热、读多、允许短陈旧 | 多实例失效与内存复制 |
| 副本读 | 允许复制延迟的读取 | 写后读和强一致不适合 |
| 请求合并 | 同实例同 key 并发 | 只减少重叠请求，不减少长期稳态全部 QPS |
| 缩小 value | 大且热的对象 | schema 和多次读取复杂度 |
| 可合并计数分片 | 高频 INCR 等交换操作 | 读取聚合、瞬时不一致 |
| 按业务分区 | 多租户、实体可独立 | 再均衡与热点租户仍可能倾斜 |
| CDN/边缘缓存 | 公共静态结果 | 失效传播、权限数据不能共享 |

普通对象复制成多个随机 key 会引入多副本一致性；库存和锁不能为了分流随意分片。治理前先明确数据能否陈旧、操作是否可交换、最终资源是否支持版本检查。

## 内存碎片与编码变化

Redis 删除 key 后，allocator 不一定立刻把内存还给 OS；不同大小对象频繁创建和删除可能留下难以复用的空洞。此时 `used_memory` 下降，但 RSS 下降较少。

小 Hash、Set、ZSet 等会使用紧凑内部编码；成员数或成员大小超过阈值后，可能转换为更通用的编码，内存占用会出现台阶式增长。可用只读命令检查：

```redis
OBJECT ENCODING learning:hash:users
```

内部编码属于版本和配置相关实现细节，不能让业务依赖某个固定返回值。它用于解释容量变化，不是 API 契约。

主动碎片整理可以在部分版本/配置下降低碎片，但会消耗 CPU。不能看到比率升高就直接 `CONFIG SET`；应先确认绝对浪费字节、allocator 指标、业务低峰和目标版本能力，并设置 CPU/延迟监控。

重启能让进程重新布局内存，但它是有可用性和冷缓存代价的操作，不是日常碎片治理。优先修复无界 churn、超大对象和错误容量模型。

## 一套生产排查顺序

### 1. 明确影响范围

- 单实例、单分片还是整个集群？
- 内存高、RSS 高、延迟高、eviction 高，还是写命令报错？
- 从哪个版本、活动或数据批次开始？

### 2. 保存低成本证据

收集同一时刻的 `INFO memory`、`INFO stats`、`INFO commandstats`、慢日志摘要、客户端池和主机内存。记录时间与节点，不先改配置。

### 3. 分类

```text
used_memory_dataset 持续增长
  → key 数量、value、集合或 Stream 无界？

used_memory 较稳定但 RSS 很高
  → 碎片、fork、客户端/复制缓冲？

evicted_keys 快速增长
  → 工作集超过 maxmemory 或策略不合适？

写报错但 eviction 很低
  → noeviction / volatile 候选耗尽 / 命令错误？

单分片 CPU/网络高
  → 热 key、big key 或 hash tag 倾斜？
```

### 4. 再做受控 key 分析

先按已知前缀和业务指标缩小范围，再用 MEMORY USAGE、基数命令和限速 SCAN。设置停止阈值：例如 Redis P99、CPU 或复制延迟超过约定值就终止扫描。

### 5. 修复来源，再处理存量

如果生产者仍在每秒写入无界集合，只删存量会很快复发。先发布上限、TTL、裁剪或新结构，再分批迁移/删除旧数据。

### 6. 验证恢复而非只看内存下降

检查接口延迟、命中率、数据库回源、复制延迟、AOF/RDB、eviction 和客户端错误是否恢复。删掉缓存可能让 Redis 内存下降，却把故障转移到数据库。

## 告警与容量基线

不要为所有实例使用同一个“内存 80%”规则。纯缓存与消息 Stream、`noeviction` 与 LRU、是否有持久化、容器限制和故障恢复目标都不同。

至少建立：

- 数据集占 `maxmemory` 比例与预计耗尽时间。
- RSS 占容器/主机限制比例。
- 非淘汰缓冲与复制/AOF 峰值。
- evicted/expired key 每秒速率。
- 命中率与数据库 fallback。
- key 数量、无 TTL 数量和 TTL 分布抽样。
- 大 key 数量、最大字节、最大成员数。
- 分片 CPU/网络倾斜与热点 Top-N。
- lazy free backlog、fork 时长与 copy-on-write 字节（目标版本支持时）。

告警要能关联结果。例如 `evicted_keys` 增长但命中率和数据库负载稳定，优先级可能低于“eviction 增长 + DB 连接池 90% + P99 上升”。

## 配套容量与淘汰模型

`examples/database/redis/06-memory-eviction-key-governance.mjs` 不依赖 Redis 或第三方包，使用可控状态验证：

- key 到期后在访问或主动抽样时清理，逻辑不可见和物理占用是两个时刻。
- 相同访问序列下，精确 LRU 与 LFU 会选择不同牺牲者；真实 Redis 使用近似算法。
- 容量预算必须从总内存扣除系统、非淘汰缓冲、碎片/fork 和安全余量。
- SCAN 批次可能为空或包含重复 key，只有 cursor 返回 0 才结束。
- 把百万成员拆成有界批次能限制单次处理规模，但不会减少总工作量。

运行：

```bash
node examples/database/redis/06-memory-eviction-key-governance.mjs
```

模型用于解释关系，不模拟 Redis allocator、近似抽样、主动过期 CPU、复制或真实内存字节。容量结论必须在目标版本与真实数据分布上测量。

## 常见误区

### “TTL 到了，内存就会在那一毫秒下降”

访问时会按过期处理，但物理清理由被动访问和主动抽样共同完成。大批 key 同时到期可能在一段时间内持续消耗清理 CPU。

### “内存满了 Redis 会自动删，不用规划”

eviction 会降低命中率、制造回源和写放大；`noeviction` 或 volatile 候选不足还会直接让写失败。淘汰是最后保护，不是容量计划。

### “LRU 一定删全库最久没访问的 key”

Redis 使用近似抽样，不维护全量精确顺序。策略效果取决于样本、访问分布和版本。

### “SCAN 不阻塞，所以可以无限并发扫描”

单次工作有界不等于完整扫描免费。完整遍历仍是 O(N)，COUNT 是提示，还可能返回重复和空批次。

### “UNLINK 是异步的，所以没有成本”

keyspace 取消关联很快，但底层释放仍消耗后台 CPU/队列，并产生复制传播。大批 UNLINK 也需要限速和监控。

### “扩容 Cluster 就能解决热 key”

一个 key 仍只在一个 slot。必须复制读取、拆分可合并状态、缩小 value 或改变业务访问路径。

### “内存碎片高就重启”

比率需要结合绝对字节和运行阶段。重启会带来故障转移、冷缓存与回源冲击，必须先找出 churn 和大对象来源。

## 本课小结

- TTL 是生命周期和陈旧边界；覆盖 value 的命令可能移除 TTL，写入与过期应在同一原子命令中完成。
- Redis 通过访问时被动过期和周期性主动抽样清理，不为每个 key 启动精确定时器。
- expiration 是 TTL 到期，eviction 是超过 `maxmemory` 后的容量牺牲，两者指标和治理方式不同。
- `maxmemory` 不等于进程/容器总内存，必须为复制/AOF 缓冲、碎片、客户端和 fork 峰值留余量。
- allkeys、volatile、noeviction 的候选范围不同；Redis LRU/LFU 是近似算法。
- 大 key 由字节、成员数、响应大小和单命令耗时共同定义，会影响主线程、网络、复制、持久化和迁移。
- 诊断先看 INFO 趋势，再查已知 key，最后受控 SCAN；MEMORY USAGE 和 COUNT 都有抽样/提示边界。
- 大 key 要从数据模型改成有界、按访问模式拆分，并以限速迁移和 UNLINK/批处理治理存量。
- 热 key 是频率倾斜，一个 key 不会因 Cluster 扩容自动分散；L1、副本、合并和分片都有一致性代价。
- 内存下降不是唯一恢复标准，还要确认命中率、数据库回源、延迟和复制状态。

## 官方资料

- [Redis：EXPIRE 与过期实现](https://redis.io/docs/latest/commands/expire/)
- [Redis：Key eviction](https://redis.io/docs/latest/develop/reference/eviction/)
- [Redis：INFO](https://redis.io/docs/latest/commands/info/)
- [Redis：MEMORY STATS](https://redis.io/docs/latest/commands/memory-stats/)
- [Redis：MEMORY USAGE](https://redis.io/docs/latest/commands/memory-usage/)
- [Redis：SCAN](https://redis.io/docs/latest/commands/scan/)
- [Redis：redis-cli 大 key 与内存分析](https://redis.io/docs/latest/develop/tools/cli/)
- [Redis：OBJECT ENCODING](https://redis.io/docs/latest/commands/object-encoding/)
- [Redis：UNLINK](https://redis.io/docs/latest/commands/unlink/)
