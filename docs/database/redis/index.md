---
title: Redis 与缓存
description: 从 Redis 数据结构走向缓存一致性、并发协调、消息流、持久化、集群和性能治理
prev:
  text: 从业务需求到表结构：实体、关系、范式与约束
  link: /database/database-design-and-normalization
next:
  text: Redis 基础与核心数据类型
  link: /database/redis/fundamentals-and-data-types
---

# Redis 与缓存

Redis 不只是给 SQL 查询加速的键值缓存。它同时提供内存数据结构、原子命令、过期机制、消息流、持久化、复制与集群能力。不同能力解决的问题不同，也带来不同的一致性、容量和故障边界。

本专题从后端接口视角出发：先学会选择数据类型和原子命令，再设计数据库与缓存之间的一致性，最后进入分布式协调、消息处理和生产运维。

## 为什么独立成专题

关系数据库的核心问题是长期保存事实、约束关系和支持事务查询；Redis 的核心问题则是按键组织内存状态，并在低延迟、容量、过期与故障之间取舍。

把 Redis 只作为数据库章节中的几个命令，会漏掉以下工程问题：

- 缓存与 MySQL/PostgreSQL 谁是真相来源。
- 更新数据库后，缓存删除或更新失败怎么办。
- 热点键过期时，如何避免大量请求同时回源。
- Redis 超时后重试写命令会不会产生重复副作用。
- 分布式锁怎样验证持有者、续期和释放。
- Stream 消费确认后，业务数据库写入失败怎么办。
- 内存淘汰、RDB、AOF、复制、Sentinel 和 Cluster 分别解决什么。

因此，本专题既讲命令，也讲数据生命周期、并发协议和故障恢复。

## 学习路线

1. Redis 基础、键空间与核心数据类型。
2. Cache-Aside、读写路径与缓存一致性。
3. 缓存穿透、击穿、雪崩与热点治理。
4. 分布式锁、幂等、计数器和限流。
5. List、Pub/Sub 与 Streams 消息模型。
6. TTL、内存淘汰、大键与热键治理。
7. RDB、AOF、复制、Sentinel 与故障转移。
8. Redis Cluster、分片、hash slot 与多键限制。
9. 安全、ACL、TLS、监控与容量规划。

课程会逐步补充；每一课都明确哪些数据可丢失、哪些操作具备原子性，以及 Redis 不可用时接口如何处理。

## 当前课程

- [Redis 基础与核心数据类型](/database/redis/fundamentals-and-data-types)
- [Cache-Aside 与缓存一致性](/database/redis/cache-aside-and-consistency)
- [缓存穿透、击穿、雪崩与热点治理](/database/redis/cache-penetration-breakdown-avalanche)
- [分布式锁、幂等、计数器与限流](/database/redis/distributed-locks-idempotency-counters-rate-limiting)
- [List、Pub/Sub 与 Streams 消息模型](/database/redis/lists-pubsub-streams-messaging)
- [TTL、内存淘汰、大 key 与热 key 治理](/database/redis/ttl-memory-eviction-big-hot-keys)
- [RDB、AOF、复制、Sentinel 与故障转移](/database/redis/persistence-replication-sentinel-failover)

第一课建立数据结构、键命名、TTL、事务、流水线和运行边界；第二课把 Redis 与关系数据库组合起来，分析缓存读写路径、竞态窗口与最终一致性方案；第三课分析 miss 和流量倾斜怎样被并发放大，并用负缓存、布隆过滤器、请求合并、逻辑过期、TTL 抖动与过载保护逐层治理；第四课区分并发互斥、重复请求、原子计数和流量配额，建立租约、fencing token、幂等状态机及限流算法的正确性边界；第五课比较 List、Pub/Sub 和 Streams 的保留、分发、确认与重放语义，并建立 consumer group 的故障恢复流程；第六课进入内存生命周期和生产诊断，区分过期与淘汰，并治理大 key、热 key、碎片和容量风险；第七课用 RPO/RTO 串联 RDB、AOF、异步复制、Sentinel 判障和客户端故障恢复。

## 与数据库主线的关系

```text
MySQL / PostgreSQL：业务事实、约束、事务、复杂查询
             ↓ 读取或变更后派生
Redis：缓存副本、临时状态、计数、排序、协调与消息流
             ↓ 失效、过期、淘汰或故障
应用：回源、降级、重试、幂等与可观测性
```

最常见架构仍是关系数据库作为真相来源，Redis 保存可过期、可重建的派生数据。Redis 也可以承担主存储角色，但那需要单独证明持久化、复制、备份、恢复与数据约束满足业务目标。

## 学习约定

- 示例只使用 `learning` 前缀，不操作其他业务键。
- 写入示例设置短 TTL，不使用 FLUSH、全量删除或生产配置修改。
- 不把 KEYS、无界集合读取和长脚本放进正常请求路径。
- 不把 Redis 的 MULTI/EXEC 描述成关系数据库式事务。
- 涉及并发协议时，明确超时、重试、幂等和部分成功。
- 涉及运维配置时，以目标 Redis 版本和官方资料为准。

## 建议环境

使用独立本地学习实例或专用测试实例，不连接共享生产 Redis。客户端使用与服务端版本匹配的 redis-cli；应用代码则使用支持连接池、超时、TLS、ACL 和 Cluster 拓扑的成熟客户端。

不要把认证密码直接写进示例文件、Shell 历史或仓库。需要连接远端测试实例时，通过安全配置和密钥注入提供凭据。

## 官方入口

- [Redis 官方文档](https://redis.io/docs/latest/)
- [Redis 数据类型](https://redis.io/docs/latest/develop/data-types/)
- [Redis 命令参考](https://redis.io/docs/latest/commands/)
- [Redis 运维管理](https://redis.io/docs/latest/operate/oss_and_stack/management/)
- [Redis 安全](https://redis.io/docs/latest/operate/oss_and_stack/management/security/)
