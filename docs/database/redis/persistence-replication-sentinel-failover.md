---
title: RDB、AOF、复制、Sentinel 与故障转移
description: 从 RPO/RTO 理解 Redis RDB、AOF、fork 与 rewrite、异步复制、PSYNC、WAIT，以及 Sentinel 的 SDOWN、ODOWN、quorum、选主和客户端恢复
prev:
  text: TTL、内存淘汰、大 key 与热 key 治理
  link: /database/redis/ttl-memory-eviction-big-hot-keys
---

# RDB、AOF、复制、Sentinel 与故障转移

Redis 进程存活时数据在内存里，不代表机器断电后还能恢复；有副本也不代表写入已经落盘；Sentinel 能自动选出新主节点，也不代表故障期间零丢失、零重复。

生产设计需要先回答两个指标：最多允许丢多少已接受的数据，以及服务最长允许不可用多久。前者是 RPO（Recovery Point Objective，恢复点目标），后者是 RTO（Recovery Time Objective，恢复时间目标）。RDB、AOF、复制和 Sentinel 分别作用于不同阶段，必须组合推理。

## 四个概念先分开

| 能力 | 解决的问题 | 典型机制 | 不自动解决 |
| --- | --- | --- | --- |
| 持久化 | 进程或机器重启后从哪里恢复数据 | RDB、AOF | 节点在线、自动选主、异地备份 |
| 复制 | 一份内存状态如何复制到其他 Redis | primary → replica | 强一致、历史备份、客户端切换 |
| 高可用 | primary 故障后怎样恢复服务 | Sentinel 或 Cluster failover | 零数据丢失、业务幂等 |
| 备份 | 误删、逻辑污染、勒索或灾难后回到历史点 | 异地、不可变、保留多版本 | 自动低 RTO 切换 |

副本会忠实复制 DEL、FLUSH、错误覆盖和过期，因此不是历史备份。AOF 也会记录错误写入。只有独立保存、能按时间选择并经过恢复验证的副本文件，才是备份体系的一部分。

## 从数据等级定义目标

先给 Redis 中不同数据分类：

| 数据 | 可重建性 | 示例目标 | 可能方案 |
| --- | --- | --- | --- |
| 普通页面缓存 | 可从数据库重建 | RPO 可为全部丢失，RTO 数分钟 | 无持久化或轻量 RDB，配合回源保护 |
| 会话/短期登录态 | 部分可重建，丢失影响用户 | RPO 数秒，RTO 数十秒 | AOF everysec + 副本 + Sentinel |
| Stream 待处理任务 | 重建成本高，不能轻易丢 | 明确秒级或更小 RPO | AOF、复制、WAIT/WAITAOF、Outbox 源事实 |
| 余额、库存账本 | 不应以 Redis 为唯一事实 | RPO 0 由数据库负责 | 数据库事务为真相，Redis 只做派生/协调 |

如果业务只说“Redis 不能丢”，仍无法选择配置。必须明确是单进程崩溃、整机损坏、可用区故障、误删，还是区域灾难；每种故障需要不同副本位置、磁盘和备份。

## RDB：某个时间点的数据快照

RDB 把某个时间点的数据集序列化为紧凑文件。自动快照通常按“经过时间 + 至少发生多少次变更”的条件触发。下面只是说明语义的配置片段，不应直接覆盖目标实例配置：

```conf
save 3600 1
save 300 100
save 60 10000
```

任一条件满足都可能触发后台保存。例如 60 秒内至少 10,000 次变更，或 300 秒内至少 100 次变更。

### BGSAVE 的过程

简化时间线：

```text
父进程当前数据集
      │ fork
      ├──────── 子进程读取 fork 时视图 → 写临时 RDB → 原子替换旧文件
      │
      └─ 父进程继续处理新命令
```

操作系统通过 copy-on-write 让父子进程初始共享内存页。快照期间，父进程修改某个页时会复制该页，所以高写入率、大对象频繁修改会显著增加额外内存。

两个不同的延迟风险：

- `fork()` 本身可能让主线程短暂停顿，数据集越大、页表越多，暂停越明显。
- 子进程写盘会争用磁盘、内存带宽和 CPU，影响主进程尾延迟。

因此不能只监控“上次 BGSAVE 成功”，还要看 fork 耗时、写时复制字节、保存时长、磁盘吞吐和保存期间 P99。

### RDB 的优点

- 文件紧凑，适合周期备份、传输和归档。
- 恢复时加载单个快照，通常比重放很长的 AOF 快。
- 主进程正常请求路径不需要为每条命令 fsync。
- 可以保留多个历史时间点用于灾难恢复。

### RDB 的数据丢失窗口

崩溃后只能恢复最后一次成功快照：

```text
12:00 RDB 成功
12:04 写入 W1、W2、W3
12:05 机器和内存同时损坏
恢复到 12:00，W1～W3 丢失
```

触发规则不是 RPO 的绝对上限：快照可能正在运行、失败、磁盘已满，或写入量未达到触发条件。RPO 必须结合最后成功时间告警，而不是看到配置里有 `save 300 ...` 就断言最多丢 5 分钟。

## AOF：重放写命令恢复状态

AOF 记录改变数据集的写操作，重启时按顺序重放，重建内存状态：

```conf
appendonly yes
appendfsync everysec
```

这里要区分三个阶段：

```text
客户端命令执行
    ↓
写入用户态/OS 缓冲
    ↓
fsync 确认写入持久存储
```

“命令已经追加”与“断电后一定还在磁盘”不是同一时刻。`appendfsync` 决定同步策略：

| 策略 | 含义 | 性能与典型风险 |
| --- | --- | --- |
| `always` | 尽量每批写后 fsync | 延迟和磁盘压力最高，数据安全更强 |
| `everysec` | 通常每秒 fsync | 常用折中，灾难时可能丢约 1 秒数据 |
| `no` | 交给 OS 决定何时刷盘 | 性能高，丢失窗口取决于 OS，可能明显更大 |

“always”也不能替代可靠硬件、文件系统和备份；磁盘损坏、整机丢失和错误命令仍可能破坏数据。`everysec` 的“约 1 秒”也不是跨区域灾难的完整保证。

### AOF rewrite 为什么必要

持续追加会让 AOF 越来越大。许多历史命令可以折叠为当前状态，例如同一个 key 被 SET 1,000 次，恢复只需最终值。AOF rewrite 生成表示当前数据集的紧凑 base，再接上 rewrite 期间的新增写入。

Redis 7 起采用 multi-part AOF：通常包含一个 base 文件、若干 incremental 文件和描述它们的 manifest。不能只复制目录中某个看起来最新的文件就当完整备份，必须按目标版本文档处理整个 AOF 集合和 manifest。

rewrite 也会 fork，存在与 RDB 类似的 fork、copy-on-write、磁盘和延迟峰值。还要预留旧 AOF、新 base、incremental 文件同时存在时的磁盘空间。磁盘只剩“一个 AOF 大小”通常不够。

### AOF 文件异常

进程可能在写最后一条命令时崩溃，文件尾部不完整；磁盘满也可能造成截断。目标 Redis 版本对截断尾部的默认处理需要核对。

恢复原则：

1. 先复制原始文件和 manifest，保留证据。
2. 检查磁盘、Redis 日志、版本和校验工具输出。
3. 在隔离环境验证修复会丢哪些尾部命令。
4. 恢复后核对业务不变量，而不只看 Redis 能否启动。

不要直接在唯一生产副本上运行带 `--fix` 的修复工具。

## RDB 与 AOF 怎样组合

| 模式 | 重启恢复 | 主要优点 | 主要缺点 |
| --- | --- | --- | --- |
| 无持久化 | 空数据集 | 最简单，适合完全可重建缓存 | 重启全部丢失，冷缓存冲击下游 |
| 仅 RDB | 最近成功快照 | 文件紧凑、恢复快、易做历史备份 | 快照后的写可能丢失 |
| 仅 AOF | 重放已保留日志 | RPO 通常更小 | 写盘和 rewrite 成本、文件更大 |
| RDB + AOF | 通常优先用更完整的 AOF 恢复 | 兼顾快速快照备份与更小写入窗口 | CPU、内存、磁盘和运维复杂度更高 |

同时启用时，Redis 重启通常使用 AOF 重建数据，因为它预期包含更完整的写入历史。RDB 仍可用于备份、全量同步基础和灾难恢复。具体启动优先级、文件格式和托管服务行为应以目标版本为准。

持久化选择要做故障压测：高写负载下测 fork pause、copy-on-write、fsync P99、rewrite 时长、磁盘峰值和重启加载时间。只在空测试库测出的数字没有生产意义。

## 持久化不等于备份

AOF/RDB 通常和 Redis 节点一起存放，节点磁盘损坏或人为删除可能同时失去。可靠备份至少考虑：

- 跨主机、跨可用区或跨账号保存。
- 多个时间点和明确保留周期。
- 加密、访问控制与不可变保护。
- 文件与 manifest 一致性。
- 定期校验和实际恢复演练。
- 恢复后的 key 数、抽样值、Stream pending、业务不变量和应用可用性。

“每天上传成功”只能证明复制任务没有报错，不能证明文件可启动、版本兼容或业务一致。

## 复制：默认异步传播内存状态

Redis primary 把写命令形成复制流发送给 replica。默认是异步复制：primary 在正常写路径中不等待每个 replica 确认，就可以向客户端返回。

```text
客户端 → primary 执行 W1 → 返回 OK
                   │
                   ├── replica A 已收到 W1
                   └── replica B 尚未收到 W1
```

如果此刻 primary 永久故障，而 B 被提升，W1 可能丢失。客户端收到 OK 表示旧 primary 已接受，不代表所有副本、磁盘和未来新主都拥有这条写入。

### replication ID 与 offset

每个 primary 用 replication ID 标识一段数据历史，并为复制流维护递增 offset。`replication ID + offset` 可以定位这一历史中的数据版本。

replica 断线重连时发送旧 replication ID 和已处理 offset：

- primary 的 backlog 仍保存缺失区间，且历史匹配时，可以 PSYNC 部分重同步，只发送差量。
- offset 太旧、backlog 已覆盖，或 replication ID 不兼容时，需要全量同步。

全量同步通常要生成数据快照、传输整个数据集、在 replica 加载，再追赶期间新增命令。它会消耗 fork/COW、磁盘、网络和 replica 内存；多个 replica 同时全量同步可能形成故障放大。

backlog 越大，越能覆盖长断线并提高部分同步概率，也会占更多内存。容量应根据峰值复制字节率 × 希望容忍的断线时长估算，而不是只填一个固定模板值。

### 复制状态怎样看

```redis
INFO replication
ROLE
```

重点观察：

- 当前角色与 primary 地址。
- 已连接 replica 数量和连接状态。
- primary/repl offset 差距及其增长趋势。
- full sync、partial sync 成功/失败次数。
- backlog 大小、当前历史范围。
- replica link down 时长。

`ROLE` 属于管理类命令，应通过最小权限监控账号调用。单次 offset 差值需要结合每秒复制字节率换算为时间和数据风险。

### 副本读取不是强一致读取

replica 默认通常只读，但复制有延迟。写 primary 后立刻读 replica，可能看不到刚写的数据；故障切换期间还可能读到不同时间点。

适合副本读：允许短时陈旧的报表、缓存查询。权限撤销、锁状态、库存扣减后的读和 read-your-writes 接口不能未经设计就随机走副本。

应用可在写后一段路径固定读 primary、携带业务版本等待副本追上，或直接从权威数据库确认。每种方法都要定义超时和故障行为。

## WAIT：等待复制确认，但不是强一致事务

同一客户端连接在执行写命令后可以：

```redis
SET learning:important:key value
WAIT 1 1000
```

`WAIT 1 1000` 表示最多等待 1,000 毫秒，希望至少 1 个 replica 确认已处理该连接此前写入对应的 replication offset。返回值是实际确认的 replica 数量，即使超时也会返回，应用必须比较是否达到要求。

关键边界：

- WAIT 关联当前连接此前的写，连接池不能在 SET 与 WAIT 之间随意切到另一连接。
- 返回不足时，原写可能已经在 primary 成功，不能简单当作“没有执行”并无脑重试非幂等命令。
- WAIT 证明 replica 接收/处理到 offset，不默认等于 replica AOF 已 fsync。
- 即使达到数量，也可能在复杂故障转移中选出没有该写的 replica。
- 它降低数据丢失概率，但不会让 Redis 变成强一致 CP 系统。

Redis 7.2+ 提供 `WAITAOF`，可等待当前连接此前写入在本地和/或 replica 的 AOF 上完成 fsync：

```redis
WAITAOF 1 1 1000
```

调用者必须检查返回的“本地 fsync 数”和“replica fsync 数”是否达到目标。该命令要求相应节点启用 AOF，客户端与服务端版本也要支持；它仍不能消除所有故障切换和拓扑选择问题。

对高价值写单独使用 WAIT/WAITAOF 会增加延迟，应把超时、降级与幂等协议一起设计。不能给所有缓存 SET 机械加 WAIT。

## 最少健康副本写入约束

Redis 可配置 primary 仅在至少若干 replica 的确认延迟处于阈值内时接受写入，配置名通常为：

```conf
min-replicas-to-write 1
min-replicas-max-lag 10
```

这能缩小“primary 与所有 replica 长期断开却继续接受大量写入”的风险窗口，但仍是基于异步确认的 best effort，不保证某条具体写已在新主上。

可用性代价也很明确：健康 replica 数不足时，primary 会拒绝写，即使它自己仍正常。参数应根据故障域、业务 RPO 和可接受写停机时间制定，并监控被拒绝命令。

## 一个危险组合：无持久化 primary 自动重启

如果 primary 和 replicas 都依赖复制但没有持久化，primary 崩溃后被进程管理器迅速自动重启为空数据集，Sentinel 可能尚未来得及判定故障。replicas 随后把这个重新出现的空 primary 当作复制源，原有数据可能被清空。

因此官方文档强调：数据安全重要、primary 未配置持久化时，应谨慎对待自动重启。更根本的做法是按数据价值配置持久化、独立备份和经过验证的高可用流程，而不是把复制当成磁盘恢复机制。

## Sentinel 提供非 Cluster Redis 的高可用控制面

Sentinel 的主要职责：

- 持续监控 primary、replicas 和其他 Sentinels。
- 发出状态与故障转移通知。
- primary 被判定故障后自动选择 replica 提升。
- 向 Sentinel-aware 客户端提供当前 primary 地址。

Sentinel 不承载业务数据，也不是 Redis 请求代理。应用仍直接连接数据节点；故障转移后，客户端必须发现并连接新 primary。

一个常见最小拓扑：

```text
数据面：1 primary + 2 replicas
控制面：3 Sentinels，分布在独立故障域
客户端：配置多个 Sentinel 地址和 master name
```

官方建议稳健部署至少使用 3 个 Sentinel，并放在被认为能独立故障的机器或虚拟机上。把三个进程都放在同一宿主机，只增加进程数，没有增加故障域。

### Sentinel 配置片段怎样理解

下面仅解释字段，不用于直接修改生产：

```conf
sentinel monitor mymaster 10.0.0.10 6379 2
sentinel down-after-milliseconds mymaster 5000
sentinel failover-timeout mymaster 180000
sentinel parallel-syncs mymaster 1
```

- `mymaster` 是客户端和 Sentinel 共同使用的逻辑主节点组名称。
- `2` 是判定 ODOWN 需要同意的 quorum，不是 replica 数。
- `down-after-milliseconds` 控制单 Sentinel 多久收不到有效响应后判为主观下线。
- `failover-timeout` 参与故障转移重试和状态控制，不简单等于最终 RTO。
- `parallel-syncs` 控制故障转移后多少 replica 同时跟随新 primary 做同步，影响恢复速度和可用副本数量。

Sentinel 会自动发现 replicas 和其他 Sentinels，并会重写自己的配置保存拓扑状态，因此配置文件必须可写且持久保存。容器使用只读临时配置而不设计状态持久化，会导致重启后认知丢失。

### SDOWN 与 ODOWN

判障分两层：

```text
Sentinel S1 长时间收不到 primary 有效响应
    → S1 标记 SDOWN（Subjectively Down，主观下线）

至少 quorum 个 Sentinels 都认为 primary 下线
    → ODOWN（Objectively Down，客观下线）
```

一个 Sentinel 的网络故障不应立刻触发切换。ODOWN 需要达到配置 quorum；真正执行 failover 还需要可达 Sentinel 的多数授权并选出一个 failover leader。

例如 5 个 Sentinel、quorum=2：两个同意可达到 ODOWN，但仍至少需要 3 个可达才能获得多数授权并开始切换。quorum 和 majority 是两个门槛，不能混为一谈。

在只有少数 Sentinel 的网络分区中不执行 failover，是为了减少两个分区各自选主。代价是该分区即使看不到 primary，也可能无法自动恢复写服务。

### 故障转移过程

简化过程：

1. 多个 Sentinel 达到 ODOWN。
2. Sentinels 选出本轮执行 failover 的 leader。
3. leader 从合格 replicas 中选择候选。
4. 候选执行提升，成为新 primary。
5. 其他 replicas 被重配置跟随新 primary。
6. 旧 primary 恢复后被重配置为新 primary 的 replica。
7. 客户端从 Sentinel 获得新地址并重连。

候选选择会考虑 replica 是否长时间断联、`replica-priority`、复制 offset 和稳定的 tie-break 信息。priority 为 0 的 replica 不会被提升；数字更小的 priority 通常更优先。最新 offset 很重要，但不是唯一条件。

Sentinel 选的是它能观察到的最佳副本，不是数学上保证包含每条客户端已确认写入的副本。异步复制仍允许丢失窗口。

### 判障参数的两难

`down-after-milliseconds` 太小：短暂 GC、CPU 饱和、网络抖动可能触发误判和不必要切换。太大：真实故障检测变慢，RTO 增加。

真实 RTO 大致包含：

```text
故障检测
+ ODOWN 交流与 leader 选举
+ replica 提升
+ 客户端发现、DNS/连接池更新和重试
+ 缓存/应用恢复
```

所以“down-after=5 秒”不表示接口 5 秒恢复。必须在真实网络、客户端库和数据量下演练端到端 RTO。

## 网络分区与旧 primary 写入

设 primary P 与一部分客户端留在少数分区，多数 Sentinels 和 replica R 在另一分区：

```text
少数分区：P 仍接受客户端 A 写入 W-old
多数分区：Sentinels 提升 R 为新 primary，接受 W-new
网络恢复：P 被改为 R 的 replica，W-old 被丢弃
```

Redis + Sentinel 是最终一致高可用系统，不能自动合并两个历史。`min-replicas-to-write` 可以让失去健康 replica 的旧 primary 在一段 lag 后停止写，缩小分叉窗口，但不能完全消除。

因此：

- 客户端写必须幂等，超时和切换时结果属于“未知”。
- 业务关键事实用数据库唯一约束、版本和账本保护。
- 分布式锁在 failover 后可能出现两个持有者，仍需 fencing。
- 不把 Redis 自增序列当作跨故障零回退的永久版本，除非持久化与资源端验证满足要求。

## 客户端是故障转移的一部分

Sentinel 完成选主不代表应用自动恢复。客户端库必须原生支持 Sentinel，并配置：

- master name 与多个 Sentinel 地址。
- Sentinel 认证/TLS及数据节点认证/TLS。
- 连接、命令和总体请求超时。
- 新 primary 发现、旧连接关闭和连接池重建。
- 只读请求是否走 replicas，以及角色变化后的路由。
- 拓扑刷新与重试退避。

故障期间一次写可能出现：

1. 旧 primary 根本没执行。
2. 已执行但响应丢失。
3. 已复制到候选并保留。
4. 已执行但未复制，切换后丢失。

网络错误无法告诉客户端是哪一种。只有幂等键、业务查询、唯一约束和版本状态才能安全决定是否重试。对 `INCR`、List push 等非幂等写直接重试，可能重复产生副作用。

读连接也要验证角色。旧 primary 被降级为 replica 后，遗留连接可能收到 READONLY 错误；新 primary 尚未对外可用时可能短暂连接失败。客户端应有有界重试和总截止时间，而不是无限循环。

## 部署与安全边界

- Sentinel 默认端口通常为 26379，Sentinels 之间、Sentinel 与数据节点之间必须网络可达。
- NAT、容器端口映射和多网卡会让节点通告不可达地址；上线前从每个故障域验证发现结果。
- Sentinel 与 Redis 数据节点都要配置最小权限认证和 TLS（目标版本支持时）。
- Sentinel 配置会被重写，文件权限与持久卷必须正确。
- 不把 Sentinel 与它监控的唯一 Redis 节点全部放在同一故障域。
- 两个 Sentinel 难以同时获得稳健多数和容忍一个故障，通常至少三个。
- 定期执行 `SENTINEL CKQUORUM <master-name>` 等只读健康检查，确认 quorum 与 majority 当前可达。

托管 Redis 的高可用接口、持久化和故障语义可能与开源 Sentinel 不同，应以供应商文档和实际演练为准，不能照搬自建参数。

## 监控：同时看数据安全与可用性

### 持久化

- `rdb_last_bgsave_status`、上次成功时间和保存耗时。
- `aof_enabled`、`aof_last_write_status`、rewrite 状态与时长。
- fork 耗时、copy-on-write 字节、磁盘空间和 fsync 延迟。
- RDB/AOF 文件增长、备份成功和最近恢复验证时间。

### 复制

- connected replicas、link 状态和 down 时间。
- primary 与 replica offset 差距。
- backlog 覆盖的时间窗口。
- partial/full resync 次数和全量同步耗时。
- WAIT/WAITAOF 达标率、超时和额外延迟。
- 因最少 replica 约束被拒绝的写。

### Sentinel 与客户端

- SDOWN/ODOWN、切换次数和切换阶段耗时。
- CKQUORUM 是否通过、可达 Sentinel 数。
- 候选 replica lag 与 priority。
- 客户端拓扑刷新、连接错误、READONLY、重试和请求失败。
- 端到端不可用时间与切换后数据差异。

告警不能只看“有两个 replica”。两个副本都延迟很大、正在 full sync 或与 primary 断开时，数量仍是 2，数据安全却已下降。

## 故障矩阵

| 故障 | 仅 RDB | AOF everysec | 加异步 replica | 加 Sentinel |
| --- | --- | --- | --- | --- |
| Redis 进程崩溃、磁盘完好 | 回到最近快照 | 通常丢约秒级尾部 | replica 可能继续有更新状态 | 可自动提升 replica |
| primary 主机永久损坏 | 本机文件可能一并丢 | 本机文件可能一并丢 | replica 保存已收到部分 | 自动切换，但未复制写可能丢 |
| 网络分区 | 无自动处理 | 无自动处理 | 可能产生陈旧读 | 多数侧切换，旧主写可能丢 |
| 误执行错误写/删除 | 错误可能未进旧快照 | 错误也会进入 AOF | 错误复制到 replicas | Sentinel 不会识别业务错误 |
| 整个可用区丢失 | 同区文件丢失 | 同区文件丢失 | 跨区 replica 才有帮助 | Sentinels/replicas 必须跨故障域 |
| 数据逻辑污染数小时后发现 | 需要历史 RDB | 当前 AOF 已包含污染 | replicas 同样污染 | 需要独立历史备份 |

表中的丢失窗口是典型情况，不是无条件 SLA。磁盘、配置、版本、写负载和故障组合都会改变结果。

## 演练与恢复流程

### 故障转移演练

在隔离或预生产环境记录：

1. 故障发生时间和最后确认写的业务 ID。
2. SDOWN、ODOWN、leader 选举和提升时间。
3. 候选 replica 的 offset 与选择原因。
4. 客户端第一次错误、发现新主和恢复成功时间。
5. 切换前后数据差异、重复写和丢失写。
6. 其他 replicas 重新同步期间的延迟与资源峰值。

不要通过生产实例上的破坏性调试命令“验证高可用”。演练应有批准的故障注入方式、回滚、停止条件和观察负责人。

### 备份恢复演练

1. 在独立环境使用与生产兼容的 Redis 版本。
2. 恢复完整 RDB 或 multi-part AOF 集合。
3. 检查启动日志、文件校验与 keyspace 汇总。
4. 验证 TTL、Stream/group、抽样业务对象和不变量。
5. 用应用只读流量验证 schema 和序列化兼容。
6. 记录真实恢复时间、人工步骤和缺失权限。

恢复演练测得的时间才接近可承诺 RTO。没有演练的备份只是“可能可用的文件”。

## 配套状态模型

`examples/database/redis/07-persistence-replication-failover.mjs` 不连接 Redis，使用 offset 和事件时间线验证：

- RDB 只能恢复快照 offset，AOF 只能恢复已经 fsync 的 offset。
- primary 已接受但 replica 未收到的写，在该 replica 被提升后会丢失。
- WAIT 式判断必须检查实际确认副本数，超时不代表原写未执行。
- replication ID 匹配且缺失区间仍在 backlog 才能部分重同步，否则需要全量同步。
- Sentinel 的 quorum 用于 ODOWN，多数授权用于真正开始 failover。

运行：

```bash
node examples/database/redis/07-persistence-replication-failover.mjs
```

模型省略了网络、磁盘、真实 Sentinel 选举和 Redis 版本细节，只用于建立推理框架。生产保证必须通过目标拓扑故障演练验证。

## 常见误区

### “有 replica 就不会丢数据”

复制默认异步。primary 返回 OK 时，未来被提升的 replica 可能还没收到写；副本也会复制误删，不能替代备份。

### “AOF everysec 就严格最多丢 1 秒”

它描述常见本机 fsync 窗口，不覆盖磁盘损坏、整个故障域丢失、文件异常和故障切换选择。RPO 要端到端定义。

### “WAIT 返回成功就是强一致”

WAIT 提高指定写到达 replica 的概率保证，但不控制所有拓扑选主和磁盘持久化。官方明确说明它不会把 Redis 变成强一致系统。

### “Sentinel quorum=2，所以两个 Sentinel 就够”

ODOWN 达到 quorum 后，真正执行 failover 仍需要 Sentinel 多数授权。稳健部署通常至少三个独立故障域实例。

### “Sentinel 切换完成，应用就恢复了”

客户端必须发现新主、关闭旧池、重新认证并正确处理未知结果。端到端 RTO 通常长于 Sentinel 内部提升时间。

### “持久化文件每天上传，备份就可靠”

未验证 manifest 完整性、版本兼容和业务恢复的文件不能证明可用。必须定期从备份实际启动并校验。

## 本课小结

- RDB/AOF 解决重启恢复，复制提供在线副本，Sentinel 提供自动故障转移，备份负责历史灾难恢复。
- RDB 是时间点快照，可能丢失最后成功快照后的写；BGSAVE 需要关注 fork、COW、磁盘和尾延迟。
- AOF 记录写命令，fsync 策略决定典型本机丢失窗口；rewrite 和 multi-part AOF 需要额外内存、磁盘与完整 manifest。
- replication ID + offset 标识复制历史；backlog 覆盖缺失区间时可 PSYNC 部分同步，否则进行昂贵全量同步。
- Redis 默认异步复制，客户端收到 OK 不表示副本或磁盘已经持有写入。
- WAIT/WAITAOF 必须在同一连接使用并检查实际返回数量，它们提高数据安全但不提供强一致。
- Sentinel 用 SDOWN 表示单节点判断、ODOWN 表示 quorum 判断，真正 failover 还需要多数授权。
- 故障转移仍可能丢失旧 primary 未复制的写；旧主分区、锁和非幂等重试都需业务保护。
- Sentinel 不是代理，客户端的拓扑发现、连接池重建、超时和幂等决定端到端 RTO。
- replica 和当前 AOF 都会复制逻辑错误，独立多版本备份与恢复演练不可替代。

## 官方资料

- [Redis：Persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)
- [Redis：Replication](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/)
- [Redis：High availability with Sentinel](https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/)
- [Redis：WAIT](https://redis.io/docs/latest/commands/wait/)
- [Redis：WAITAOF](https://redis.io/docs/latest/commands/waitaof/)
- [Redis：INFO](https://redis.io/docs/latest/commands/info/)
- [Redis：ROLE](https://redis.io/docs/latest/commands/role/)
