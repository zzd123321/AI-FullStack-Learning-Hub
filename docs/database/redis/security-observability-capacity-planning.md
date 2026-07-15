---
title: 安全、ACL、TLS、监控与容量规划
description: 从网络隔离、Redis ACL、TLS 和密钥轮换建立安全基线，再用 INFO、SLOWLOG、LATENCY、ACL LOG、应用指标与故障余量完成监控、告警和容量规划
prev:
  text: Redis Cluster、分片、hash slot 与多 key 限制
  link: /database/redis/cluster-sharding-hash-slots-multi-key
next:
  text: 客户端连接、超时、重试与优雅停机
  link: /database/redis/client-connections-timeouts-retries-shutdown
---

# 安全、ACL、TLS、监控与容量规划

Redis 上线生产，不只是把密码加到连接字符串、再配置一个内存告警。真正的生产基线需要同时回答：谁能从网络连接；连接后能执行哪些命令、访问哪些 key；链路是否加密；凭据如何轮换；发生慢请求、淘汰、复制延迟或认证攻击时怎样发现；增长和单节点故障后是否仍有容量。

本课把安全、可观测性和容量规划放在一起，因为它们相互约束。TLS 会增加 CPU 成本，监控命令需要 ACL 权限，连接数影响内存，持久化和故障副本影响容量余量。孤立配置任一项都可能在生产故障时失效。

## 先建立威胁模型和数据分级

在写 ACL 前先列出：

- 哪些应用、运维人员、监控和备份程序需要连接。
- 连接来自哪些网络、主机、命名空间或账号。
- Redis 保存缓存、会话、个人信息、令牌、队列还是锁。
- 哪些 key 可丢、可陈旧、可被其他租户读取会造成什么影响。
- 是否存在第三方插件、Lua/Function、模块和共享运维工具。
- 攻击者可能拥有互联网访问、应用 SSRF、泄漏凭据还是某个低权限账号。

同一个 `GET` 权限，对公共商品缓存和密码重置令牌的风险不同。安全策略要从数据与业务后果推导，不能只从 Redis 命令表推导。

## 第一层永远是网络隔离

Redis 官方安全模型假设可信客户端位于可信环境，不应把 Redis 端口直接暴露到互联网或不受信网络。推荐多层限制：

```text
互联网
  │
  × 不可直接访问 Redis
  │
应用入口 / API
  │ 认证、授权、限流
  ▼
应用私有网络
  │ 安全组 / 防火墙 / NetworkPolicy
  ▼
Redis 数据端口、Cluster bus、Sentinel 端口
```

需要分别控制：

- 客户端访问 Redis 数据端口。
- Cluster 节点间 cluster bus。
- Primary 与 replica 复制链路。
- Sentinel 之间及 Sentinel 到数据节点。
- 运维、监控和备份平面。

只在 Redis 上设密码，却让全网能反复连接和暴力尝试，仍然扩大攻击面。网络规则应按来源身份和最小端口开放，并定期从允许与禁止的网络实际验证。

### bind 与 protected mode

Redis 可以只监听指定接口；protected mode 会在默认裸配置、无认证等危险条件下限制远程访问。它是避免误部署的安全网，不是正式网络边界。

生产不能通过“关闭 protected mode 让连接成功”解决网络问题。应明确监听地址、防火墙、ACL、TLS 和客户端来源，再验证配置。

Redis 进程应以无特权专用 OS 用户运行，配置、RDB、AOF、ACL 文件和私钥只授予必要文件权限。容器也不应默认以 root 运行或挂载主机敏感目录。

## Redis ACL：身份、命令、key 和 channel 四层权限

Redis 6 起推荐使用 ACL named users，而不是让所有应用共享 legacy `requirepass`。连接认证后绑定一个用户，ACL 可以限制：

1. 用户是否启用、使用哪些凭据。
2. 允许哪些命令或命令类别。
3. 允许访问哪些 key pattern。
4. 允许订阅或发布哪些 Pub/Sub channel。

默认配置为兼容旧版本，`default` 用户可能是 `on nopass ~* &* +@all`，即无需显式认证、所有 key/channel/命令都可访问。生产必须检查实际 `ACL LIST`/`ACL GETUSER`，不能假设“Redis 6+ 自动安全”。

### 每个工作负载独立身份

不要让 order-api、worker、监控和管理员共享一个用户。独立身份带来：

- 某服务泄漏时只影响它的 key 和命令。
- ACL LOG 能定位哪个工作负载违规。
- 轮换单个服务凭据无需同时重启全部应用。
- 监控不需要业务写权限，业务应用不需要 CONFIG/ACL 权限。

用户命名应稳定并映射到服务身份，例如 `order-api-prod`，而不是个人姓名或会随 Pod 重启改变的 ID。

### 从 deny-all 开始显式放行

下面是说明规则结构的 ACL 文件片段，密码 hash 为占位符，不能直接用于部署：

```conf
user order-api-prod on #<sha256-password-hash> \
  resetkeys ~learning:order:* \
  resetchannels \
  -@all +get +set +del +pttl
```

含义：

- `on` 允许该用户认证。
- `#...` 表示预先计算的密码 SHA-256 hash；`>plaintext` 形式会把明文带进配置命令、审计或终端历史，生产应通过安全秘密流程管理。
- `resetkeys` 后只允许 `learning:order:*` key。
- `resetchannels` 不允许 Pub/Sub channel。
- `-@all` 先拒绝全部命令，再明确允许四条命令。

ACL 规则按从左到右应用，`reset`、`resetkeys`、`resetchannels` 的位置会改变最终权限。维护 ACL 时应生成完整期望状态，而不是多年只追加规则，避免旧权限残留。

`+@all -@dangerous` 看似方便，但 `+@all` 会包含未来新增命令和模块命令；分类也可能随版本演进。普通应用优先显式 allowlist，升级 Redis 或加载模块后重新审计 `ACL CAT` 和实际用户权限。

### key pattern 不是业务授权

`~learning:tenant-42:*` 只能限制命令中的 Redis key 名，不能理解 JSON 内的 `tenantId`，也不能验证接口调用者是否真的属于 tenant-42。业务认证与授权仍由应用完成。

多 key 命令要求每一个 key 都匹配 ACL。Lua/Function 也必须受 key 与命令权限约束；脚本不要根据不可信 value 动态构造未声明 key。

Redis 7+ 可以用 `%R~pattern`、`%W~pattern` 区分读、写 key pattern，但客户端和服务端版本必须确认。若部署包含旧版本，使用通用 `~pattern` 并通过命令 allowlist 分离读写用户更稳妥。

### Pub/Sub channel 权限

key pattern `~*` 不会自动授予 channel。channel 使用独立 `&pattern` 规则。Redis 7 起默认 Pub/Sub ACL 行为更严格，升级时必须测试订阅与发布用户。

通知服务可以只允许：

```text
命令：SUBSCRIBE / PSUBSCRIBE 或 PUBLISH 中所需部分
channel：learning:events:order:*
key：无
```

不要因为订阅失败就授予 `+@all ~* &*`。

### 用 DRYRUN 验证，不靠人工阅读

管理员可用 `ACL DRYRUN` 检查某用户是否能执行给定命令，而不真正执行命令：

```redis
ACL DRYRUN order-api-prod GET learning:order:1001
ACL DRYRUN order-api-prod CONFIG SET maxmemory 1gb
```

预期第一条允许，第二条拒绝。为每个服务维护允许与必须拒绝的 ACL 回归矩阵，在 Redis 升级、模块变更和 ACL 发布前执行。

`ACL DRYRUN` 本身需要管理员权限，只应在受控运维通道使用。它验证 Redis ACL 决策，不验证网络、TLS、密码或应用业务授权。

## 密钥与凭据生命周期

Redis 密码、TLS 私钥和证书不能硬编码在仓库、镜像、命令行参数、Shell 历史或日志中。连接 URI 中的用户名密码也必须在异常、APM 和配置页面脱敏。

凭据管理至少包含：

- 由 secret manager 或受控文件注入。
- 传输和静态存储加密。
- 按服务独立、足够随机，不重复使用个人密码。
- 定期轮换和泄漏后的紧急轮换。
- 旧凭据撤销时间与已建立连接处理。
- 审计谁读取和修改过秘密。

轮换不能只改 Redis 后立即删除旧密码。安全流程通常是：

1. 为同一用户增加新凭据或创建新用户。
2. 部署客户端，使新连接使用新凭据。
3. 观察认证成功率和旧凭据连接数。
4. 让连接池滚动重连。
5. 撤销旧凭据，并处理仍存活的旧认证连接。
6. 验证回滚和告警。

官方 ACL 语义中，把用户设为 `off` 不会自动终止已经认证的连接。紧急响应必须包含连接处置，而不能只看新 AUTH 已失败。

## TLS：保护传输内容与端点身份

没有 TLS 时，Redis 协议中的 AUTH、key、value 和命令都可能被能观察网络的人读取或篡改。Redis Open Source 6 起支持可选 TLS，构建方式和部署形态需要支持。

说明语义的配置片段：

```conf
port 0
tls-port 6379
tls-cert-file /run/secrets/redis/server.crt
tls-key-file /run/secrets/redis/server.key
tls-ca-cert-file /run/secrets/redis/ca.crt
```

`port 0` 关闭非 TLS 监听，避免应用误连明文端口。实际证书路径、协议版本、cipher 和轮换方式应由安全基线决定。

Redis TLS 默认可要求客户端提供受信 CA 签发的证书，即 mutual TLS。若关闭客户端证书认证，仍应使用 ACL 用户密码完成应用身份认证。mTLS 证明持有证书的工作负载身份，ACL 决定它在 Redis 内能做什么，两者可以组合。

客户端必须：

- 校验服务端证书链和主机名/SAN。
- 使用正确 CA，不设置“跳过验证”。
- 保护客户端私钥。
- 支持证书过期前滚动加载与连接池重建。
- 监控握手失败、证书过期和协议版本错误。

### 不要只加密客户端端口

完整拓扑还包括：

- Replica 到 primary：配置并验证 replication TLS。
- Redis Cluster：配置并验证 cluster bus TLS。
- Sentinel：Sentinel 间及 Sentinel 到数据节点的 TLS。
- 备份上传和管理 API。

某个数据端口能用 `rediss://` 连接，不代表节点间流量已经加密。

TLS 有握手、加解密和完整性校验成本。长连接可摊薄握手，但吞吐、CPU 和尾延迟仍应在启用 TLS、真实 payload、连接池和持久化配置下压测。不要用明文 benchmark 结果规划 TLS 生产容量。

## 应用侧安全边界

### 不拼接脚本和命令文本

正常 Redis 客户端使用长度前缀协议参数，value 中包含空格或换行不会变成额外命令。风险通常来自应用自己拼接 Lua 源码、Shell 命令或不安全代理协议。

Lua 脚本保持静态，把不可信输入放进 `ARGV`，key 放进 `KEYS`。禁止用户上传任意 Lua/Function，也不要授予普通服务 EVAL/FUNCTION 权限，除非确实需要并审计过脚本。

### 限制输入和资源成本

ACL 允许 `SET` 不代表允许写任意大小 value；允许 `ZRANGE` 也不代表允许无界返回。应用仍需限制：

- key 和 value 最大字节。
- 集合单次新增和查询数量。
- pipeline/batch 大小。
- Lua 参数和执行路径。
- 用户可控制的 TTL 范围。
- 连接、请求和重试速率。

ACL 是权限控制，不是资源配额和 DoS 防护。

### 多租户隔离

key prefix + ACL 可以减少误访问，但同实例租户仍共享 CPU、内存、连接、淘汰和故障域。一个租户制造 big key 或热 key，其他租户仍受影响。

高合规、强噪声隔离或不同数据保留要求应使用独立实例/集群、独立密钥和网络边界。ACL 不是硬资源隔离或加密租户容器。

## 可观测性从四个黄金信号开始

| 信号 | Redis 示例 |
| --- | --- |
| 延迟 | 客户端 P50/P95/P99、连接池等待、server command latency、fork/fsync |
| 流量 | ops/sec、命令调用、请求/响应字节、每节点/slot QPS |
| 错误 | timeout、connection reset、OOM、READONLY、CROSSSLOT、认证和 ACL 拒绝 |
| 饱和度 | CPU、内存/RSS、网络、连接、磁盘、replication lag、队列积压 |

单独监控 Redis `PING` 只能证明某条连接此刻收到回复，不能证明业务 key 可读、写权限正确、Cluster slot 完整、持久化成功或容量充足。

## 延迟必须分层测量

应用看到的耗时可以近似拆成：

```text
总耗时 = 连接池排队
       + DNS/TCP/TLS
       + 请求网络传输
       + Redis 排队与命令执行
       + 响应网络传输
       + 客户端解码/应用调度
```

Redis SLOWLOG 只记录命令在服务端实际执行且阻塞其他命令的时间，不包含客户端网络 I/O、响应传输和连接池等待。一个 10 MB GET 可能服务端取值很快，却因网络和反序列化让接口很慢；它不一定出现在 SLOWLOG。

因此要同时拥有：

- 应用 Redis span/metric，包含池等待和总耗时。
- Redis commandstats/latencystats。
- SLOWLOG 的服务端执行样本。
- 主机 CPU、网络、磁盘和调度延迟。

不要把完整 key、参数或 value 作为 trace 标签。使用命令名、逻辑操作、节点、结果类型等低基数维度；单 key 排查走受控采样和脱敏日志。

## INFO：按 section 采集，不是定期抓 everything

```redis
INFO clients
INFO memory
INFO stats
INFO persistence
INFO replication
INFO commandstats
INFO errorstats
INFO keyspace
```

不同版本会新增 section 和字段，监控解析器应忽略未知字段、容忍缺失字段，并记录 Redis 版本。不要依赖固定行号。

### 累计 counter 要转换为 rate

`total_commands_processed`、`keyspace_hits`、`evicted_keys`、`expired_keys` 等通常是进程生命周期累计值。每秒速率需要相邻采样做差：

```text
rate = (current_counter - previous_counter) / elapsed_seconds
```

Redis 重启后 counter 可能归零。若 current < previous，应标记 reset 并从新基线开始，不能计算出负 QPS。采样也要使用真实经过时间，不能假设监控永远准时每 10 秒执行。

命中率可按同一窗口 delta 计算：

```text
hit_rate = Δhits / (Δhits + Δmisses)
```

用 Redis 启动以来累计比值，会掩盖刚发生的命中率骤降。

### commandstats

按命令提供 calls、总执行微秒、平均每次耗时、failed/rejected 等字段。关注 delta 后的调用率与 CPU 时间率：

```text
command_cpu_seconds_per_second = Δusec / elapsed_seconds / 1,000,000
```

平均 `usec_per_call` 会掩盖尾部，需结合 SLOWLOG 和 latency percentile。命令名还可能包含模块或子命令，监控系统要限制标签集合。

## SLOWLOG、LATENCY 与 ACL LOG

### SLOWLOG

```redis
SLOWLOG LEN
SLOWLOG GET 20
```

读取需要管理权限，entry 可能包含命令参数、客户端地址和名称，导出到日志系统前要脱敏和控制访问。不要常规执行 `SLOWLOG GET -1`；按递增 ID 增量采集有限条目。

阈值 `slowlog-log-slower-than` 使用微秒，最大保留由 `slowlog-max-len` 控制。阈值太高看不到问题，太低会快速覆盖且增加噪声；应按延迟目标在配置管理中设定，而不是事故中随意 CONFIG SET。

### LATENCY

Redis latency monitor 按 command、fast-command、fork、AOF、eviction 等事件记录超过阈值的尖峰，可使用只读报告：

```redis
LATENCY LATEST
LATENCY HISTORY command
LATENCY DOCTOR
```

该监控默认可能关闭，需要事先按业务阈值配置。它是抽样诊断，不替代持续客户端 P99。`LATENCY RESET` 会清除历史，不属于普通监控读取流程。

### ACL LOG

```redis
ACL LOG 20
```

它记录近期 AUTH 失败、禁止命令、禁止 key 和禁止 channel 等事件，并聚合短时间重复。用途包括发现错误部署、凭据攻击和 ACL 回归缺口。

ACL LOG 含用户名、客户端信息和被拒对象，需要安全权限和脱敏。`ACL LOG RESET` 会清空证据，事故调查中不能随意执行。托管产品对 ACL LOG 的支持可能不同。

## 从指标到可行动告警

一个好的告警说明用户影响、可能原因和下一步证据，而不是“Redis 指标超过 80”。

### 推荐组合

- **延迟告警**：应用 Redis P99 持续超标 + timeout 上升；关联 SLOWLOG、CPU、fork、网络。
- **内存告警**：数据集预计耗尽时间缩短；关联 RSS、eviction、增长前缀和大 key。
- **缓存雪崩**：命中率窗口骤降 + fallback QPS 上升 + DB 连接池饱和。
- **持久化风险**：最后成功 RDB 过旧，或 AOF write/rewrite 状态失败。
- **复制风险**：健康 replica 数下降 + offset lag/断链持续。
- **Cluster 风险**：slot coverage 异常、CLUSTERDOWN/MOVED 突增、单分片资源倾斜。
- **安全告警**：AUTH 失败按来源突增、管理员命令被拒、未知用户访问敏感 prefix。

瞬时尖峰与持续饱和应分级。短尖峰可记录事件，持续多个采样窗口再 page；但认证攻击、持久化失败等高风险信号可能需要立即通知。

告警中不要放密码、完整连接 URI、敏感 key/value。Runbook 链接、节点 ID、集群名和安全事件类别通常足够定位。

## 容量规划从真实工作负载开始

QPS 不是唯一容量单位。同样 100,000 QPS，1 KB GET、100 KB GET、ZUNION 和短 Lua 的资源成本完全不同。工作负载画像至少包含：

- 每种命令的比例、复杂度和 key 基数。
- key/value 字节的 P50/P95/P99/最大值。
- 读写比例、pipeline/batch 大小。
- 并发连接、阻塞连接和连接 churn。
- TLS、ACL、持久化和复制配置。
- 命中率、回源与故障重试。
- 日峰值、活动峰值和年增长率。
- RDB/AOF rewrite、resharding、failover 等后台阶段。

用生产采样构造脱敏数据，在隔离的同版本环境压测。`redis-benchmark` 默认 payload、单 key、连接和命令组合不能代表真实业务，也绝不能直接对生产实例压测或先清空数据。

## 吞吐与 CPU 预算

假设单分片在真实配置下测得：P99 达标时最大可持续 120,000 ops/s。不能把生产峰值直接顶到 120,000，应预留：

- 突发与流量预测误差。
- replica 提升后承担 primary 负载。
- fork、AOF rewrite、TLS 和碎片整理。
- 热 key 与命令混合变化。
- 一个节点维护/故障时的 N+1 容量。

若目标稳态利用率 60%，单分片规划容量约为 72,000 ops/s；峰值 200,000 ops/s 至少需要：

```text
primary_shards = ceil(200,000 / 72,000) = 3
```

但还要按内存、网络和热点分别计算，最终取要求最多的分片数。三个分片只满足算术下限，不代表已经满足一个分片故障后的余量。

CPU 看整体利用率还不够。Redis 命令主执行路径通常受单核约束；机器有 16 核、总 CPU 10%，某 Redis 主线程仍可能接近 100%。要看进程/线程、command CPU、iowait 和 steal。

## 内存预算

第六课的基础模型可以扩展为：

```text
未来数据集 = 当前数据集
          × 业务增长系数
          × 编码/版本变化系数
          + 新功能数据

单 primary 总需求 = 未来数据集
                 + allocator/碎片
                 + 客户端缓冲
                 + replication/AOF 缓冲
                 + fork/COW 峰值
                 + 安全余量
```

副本也需要容纳完整分片数据和恢复峰值。failover 后 replica 成为 primary，还要能处理写入、AOF/RDB 和新 replica 全量同步。

不能把 `maxmemory` 设到容器限制，再说“还有 replica”。每个进程都需要自己的 headroom；同宿主机多个 Redis 还会争用物理内存和 page cache。

按 key 类型、业务 prefix 和 size percentile 预测，单独列出 Stream/队列增长、无 TTL key、大 key 和 dead letter。平均 value 大小无法覆盖尾部。

## 网络预算

粗略估算单向 payload：

```text
业务网络 ≈ 每秒请求数 × 平均请求字节
         + 每秒响应数 × 平均响应字节
```

还要加入协议、TLS、复制、Cluster bus、全量同步、备份和 resharding。读取 10 KB value 的 50,000 QPS，仅响应 payload 就约 500 MB/s，已经可能超过单网卡安全预算。

网络看 bytes/s、packets/s、重传和连接队列。小命令高 QPS 可能受包率限制，大 value 受带宽和客户端缓冲限制。

## 连接与客户端容量

每个应用实例若创建 100 个连接，500 个实例就是 50,000 个连接；Sentinel、Cluster 每节点连接池还会乘以节点数。连接消耗 Redis 和应用内存、文件描述符、TLS 状态与心跳流量。

规划：

- 每实例连接池最小/最大、等待队列和空闲回收。
- Cluster 每节点连接数与拓扑扩容倍数。
- Pub/Sub、BLPOP/XREAD BLOCK 等专用阻塞连接。
- replica/monitor/backup 管理连接。
- `maxclients`、OS fd 和客户端输出缓冲。

连接池不是越大越快。过多并发只会把排队从应用转移到 Redis，并增加超时和重试风暴。应以达到吞吐且 P99 可控的最小连接数为起点。

## 磁盘、持久化与恢复容量

启用 RDB/AOF 后还要规划：

- 当前 RDB/AOF 大小和增长率。
- AOF rewrite 同时保留旧、新文件和 incremental 的峰值。
- fork/COW 内存峰值。
- fsync IOPS 与延迟。
- 全量复制快照和网络时间。
- 备份暂存、上传失败重试和保留空间。
- 重启加载时间是否满足 RTO。

磁盘空间告警必须早于写满。磁盘满不仅影响持久化，也可能让 AOF 写失败并改变可用性。恢复容量通过实际加载生产规模文件测量，不能只按 SSD 标称吞吐推算。

## N+1 与故障容量

正常状态 CPU 50% 不代表能承受一台 primary 故障。Replica 提升后，数据不会自动均匀重分配；剩余节点还可能承担客户端重连、同步和缓存回源。

容量验收至少模拟：

- 一个 primary 故障并由 replica 提升。
- 一个可用区失去其节点。
- 一个 replica 全量同步。
- RDB/AOF rewrite 与流量峰值重叠。
- Cluster resharding 与业务流量重叠。
- Redis 不可用导致数据库 fallback。

目标是在这些场景下仍满足明确的降级 SLO，而不是所有指标都和正常时一样。

## 安全与监控账号本身也要最小权限

监控通常需要 INFO、SLOWLOG GET、LATENCY、ROLE/CLUSTER 等只读诊断命令，但其中一些属于 `@admin`、`@slow` 或 `@dangerous` 分类。不要因此授予监控 `+@all`。

为监控建立独立用户，逐条允许确实调用的子命令和无业务 key 访问；抓取 SLOWLOG/ACL LOG 的安全采集器与普通指标采集器还可分离，因为日志可能含敏感参数。

托管服务可能不开放某些命令，应使用平台指标/API，而不是尝试绕过限制。

## 事件响应 Runbook

### 延迟升高

1. 确认是应用池等待、网络/TLS 还是 Redis server execution。
2. 按节点/slot 找到影响范围。
3. 关联 SLOWLOG、LATENCY、commandstats、CPU、fork/AOF、big/hot key。
4. 控制重试和低优先级流量，避免雪崩。
5. 修复根因后验证 P99、错误和下游，而非只看 CPU。

### 内存或 eviction

1. 对比 used_memory、RSS、maxmemory、evicted/expired rate。
2. 判断数据集增长、碎片、缓冲还是 COW。
3. 先修复无界写入，再受控扫描和迁移存量。
4. 观察命中率与数据库 fallback，避免删缓存转移故障。

### 认证与 ACL 异常

1. 从 ACL LOG/平台审计确认 reason、用户、来源与时间。
2. 区分错误发布、凭据过期、权限回归和攻击。
3. 泄漏时轮换凭据、处置已有连接、收紧网络。
4. 检查日志和配置是否暴露秘密。
5. 用 ACL DRYRUN 与真实 canary 验证恢复。

### 证书异常

1. 检查到期、SAN、CA 链、节点时间和客户端信任库。
2. 区分数据端口、replication、Cluster bus、Sentinel 哪条链路失败。
3. 使用重叠信任窗口滚动证书，避免一次替换全部节点。
4. 验证旧证书撤销与所有连接池重建。

## 上线检查清单

### 安全

- Redis 不可从互联网直接访问，网络规则经过正反向验证。
- default 用户和 legacy 密码状态已审计。
- 每服务独立 ACL 用户，deny-all 后显式 allowlist。
- key/channel pattern 与业务租户边界一致。
- TLS 覆盖客户端、复制、Cluster/Sentinel 所需链路。
- 密钥不在仓库、镜像、参数和日志中，轮换流程已演练。
- Redis 以无特权用户运行，持久化和私钥文件权限最小。

### 可观测性

- 应用端有池等待、总延迟、timeout 和业务 fallback。
- INFO counter 按 delta/rate 采集并处理重启 reset。
- 内存、持久化、复制、Cluster、Stream/队列指标齐全。
- SLOWLOG/LATENCY 阈值按 SLO 设置，敏感参数不外泄。
- ACL/auth/TLS 安全事件有审计和告警。
- Dashboard 能按节点、slot、命令和业务操作定位。

### 容量与恢复

- 使用真实命令、payload、TLS、AOF/RDB 做隔离压测。
- CPU、内存、网络、连接、磁盘分别计算，取最大分片需求。
- 有增长预测、N+1/故障域余量和扩容提前量。
- big key、hot key、无 TTL 和 Stream backlog 有上限。
- failover、full sync、rewrite、resharding 和恢复演练达标。
- Redis 故障时数据库和外部依赖有回源保护。

## 配套安全与容量模型

`examples/database/redis/09-security-observability-capacity.mjs` 不连接 Redis，验证：

- ACL 用户只有命令、key mode 和 channel 同时允许时才通过。
- 累计 counter 转 rate 时能识别 Redis 重启归零，不产生负速率。
- 命中率使用采样窗口 delta，而不是进程生命周期累计值。
- 吞吐、内存和网络分别计算所需 primary 分片，最终取最大值。
- “eviction + 命中率下降 + 数据库 fallback 饱和”的组合告警比单独内存阈值更可行动。

运行：

```bash
node examples/database/redis/09-security-observability-capacity.mjs
```

模型只解释决策逻辑，不是完整 ACL 解析器、监控系统或容量测试工具。生产必须用目标 Redis/客户端版本和真实数据压测验证。

## 常见误区

### “Redis 有密码，可以暴露公网”

认证不能替代网络隔离、TLS、限流和补丁管理。公网暴露会扩大暴力尝试、漏洞和配置错误风险。

### “protected mode 已开启，所以生产安全”

它是默认误配置保护，不是可审计的网络与身份架构。正式环境仍需 bind/防火墙、ACL 和 TLS。

### “`+@all -@dangerous` 就是最小权限”

它先允许所有现有、未来和模块命令，再依赖分类排除。普通应用应从 `-@all` 开始逐条放行。

### “SLOWLOG 没内容，所以 Redis 很快”

SLOWLOG 不含网络、连接池等待和大响应传输；阈值也可能未正确配置。要结合应用 P99、LATENCY 和系统指标。

### “INFO counter 直接画图就是每秒值”

许多字段是累计值，必须按真实时间求 delta，并处理重启归零。累计命中率会掩盖短期雪崩。

### “压测达到 20 万 QPS，生产就按 20 万部署”

必须保持 P99、错误率和后台任务达标，并预留 TLS、持久化、增长、流量突发和 N+1 故障余量。

## 本课小结

- Redis 的第一安全边界是可信网络，不应直接暴露互联网；protected mode 只是误配置安全网。
- 每个服务使用独立 named ACL user，从 `-@all` 开始显式允许命令、key 和 channel。
- ACL key pattern 不是业务授权，也不提供租户 CPU/内存隔离；强隔离需要独立实例或集群。
- 凭据需要安全注入、审计、双凭据轮换和已有连接处置，不能只改密码配置。
- TLS 应校验证书链和主机名，并覆盖客户端、复制、Cluster bus 与 Sentinel 所需链路。
- SLOWLOG 只测服务端命令执行，应用总延迟还包含池等待、网络、TLS、传输和解码。
- INFO 累计 counter 必须按窗口 delta 转 rate，并处理进程重启归零。
- 告警应组合用户影响与原因信号，例如 eviction、命中率、fallback 和数据库饱和。
- 容量规划按真实命令、payload、连接、TLS、持久化和后台阶段测量，CPU、内存、网络、磁盘分别计算。
- 稳态容量必须保留增长和 N+1 故障余量，并用 failover、full sync、rewrite 与恢复演练验证。

## 官方资料

- [Redis：Security](https://redis.io/docs/latest/operate/oss_and_stack/management/security/)
- [Redis：ACL](https://redis.io/docs/latest/operate/oss_and_stack/management/security/acl/)
- [Redis：TLS](https://redis.io/docs/latest/operate/oss_and_stack/management/security/encryption/)
- [Redis：INFO](https://redis.io/docs/latest/commands/info/)
- [Redis：SLOWLOG GET](https://redis.io/docs/latest/commands/slowlog-get/)
- [Redis：Latency monitoring](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/latency-monitor/)
- [Redis：ACL LOG](https://redis.io/docs/latest/commands/acl-log/)
- [Redis：Diagnosing latency](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/latency/)
- [Redis：Benchmarking](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/benchmarks/)
