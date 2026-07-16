---
title: Redis 与缓存
description: 面向全栈工程师的 Redis 两课入门路线，以及按需查阅的并发、消息、高可用与集群专题
prev:
  text: 数据库测试、测试数据与 CI 发布门禁
  link: /database/core/testing-test-data-ci-release-gates
next:
  text: Redis 基础与核心数据类型
  link: /database/redis/core/fundamentals-and-data-types
---

# Redis 与缓存

Redis 专题共有多篇生产实践文档，但**全栈主线只要求前两课**。其余页面用于出现缓存热点、分布式协调、消息、高可用或集群需求时查阅。

```text
redis/
├── core/          全栈必修
├── advanced/      后端工程进阶
└── reference/     架构与运维参考
```

::: tip Redis 学习停止点
掌握核心数据类型和 Cache-Aside 后即可停止 Redis 主线。不要为了“学完 Redis”提前引入分布式锁、Streams、Sentinel 或 Cluster。
:::

## Redis 与关系数据库的分工

```text
MySQL / PostgreSQL：长期业务事实、关系、约束和事务
             ↓ 按明确读取需求派生
Redis：可过期、可淘汰、可重建的缓存或临时状态
             ↓ 未命中、过期或不可用
应用：安全回源数据库、限流或受控降级
```

最常见的全栈项目中，关系数据库仍是真相来源，Redis 只是性能和临时状态工具。如果一个功能不用 Redis 也能满足延迟和容量目标，就不必为了技术栈完整而加入它。

## 第一层：全栈必修，两课结束

[进入 Redis 全栈必修目录](/database/redis/core/)

### 1. Redis 基础与核心数据类型

- [Redis 基础与核心数据类型](/database/redis/core/fundamentals-and-data-types)

重点掌握：

- Redis 以 key 组织内存数据，不提供关系数据库同等的关系约束。
- String、Hash、Set、Sorted Set 的基本选择方法。
- TTL 表示逻辑过期，不是精确定时任务。
- 单命令原子性、pipeline 和 MULTI/EXEC 的基本边界。
- value 大小、无界集合和危险全量命令的风险。

第一次学习可略读 List、Pub/Sub、Stream、模块和复杂并发协议。

### 2. Cache-Aside 与缓存一致性

- [Cache-Aside 与缓存一致性](/database/redis/core/cache-aside-and-consistency)

重点掌握：

- 读路径：查缓存 → miss 后查数据库 → 回填缓存。
- 写路径：先提交数据库，再失效缓存。
- 缓存只保存已脱敏、可重建的数据。
- Redis 不可用时有界回源，不能无限重试或压垮数据库。
- TTL、失效和并发竞态意味着缓存通常不是强一致事实。

完成这两课后，能为一个热点读取接口安全加入缓存，就已经满足普通全栈项目需要。

## 第二层：后端按需进阶

[进入 Redis 后端工程进阶目录](/database/redis/advanced/)

### 缓存故障与热点

- [缓存穿透、击穿、雪崩与热点治理](/database/redis/advanced/cache-penetration-breakdown-avalanche)
- [TTL、内存淘汰、大 key 与热 key 治理](/database/redis/advanced/ttl-memory-eviction-big-hot-keys)

什么时候学：出现大量无效查询、热点 key 同时过期、内存淘汰、单 key 过大或单分片过热时。

### 客户端稳定性

- [客户端连接、超时、重试与优雅停机](/database/redis/advanced/client-connections-timeouts-retries-shutdown)

什么时候学：Redis 已进入生产请求链路，需要处理连接、deadline、拓扑变化、结果不确定性和进程停机时。

## 第三层：架构与运维参考

[进入 Redis 架构与运维参考目录](/database/redis/reference/)

### 分布式协调

- [分布式锁、幂等、计数器与限流](/database/redis/reference/distributed-locks-idempotency-counters-rate-limiting)

只在确实需要跨进程协调时阅读。普通数据库事务不需要 Redis 锁；能用唯一约束、条件更新或数据库锁解决时优先使用数据库。

### 消息能力

- [List、Pub/Sub 与 Streams 消息模型](/database/redis/reference/lists-pubsub-streams-messaging)

只在评估轻量队列、通知或 Stream 消费时阅读。Redis 消息能力不能自动替代成熟消息系统，也不能让业务数据库写入与消息确认原子提交。

### 持久化与高可用

- [RDB、AOF、复制、Sentinel 与故障转移](/database/redis/reference/persistence-replication-sentinel-failover)

适合自运维 Redis 或 Redis 中存在不可轻易丢失状态的团队。只使用托管缓存的全栈开发者先知道 RPO、故障切换和数据丢失窗口即可。

### Cluster 与分片

- [Redis Cluster、分片、hash slot 与多 key 限制](/database/redis/reference/cluster-sharding-hash-slots-multi-key)

只在单实例/主从容量不够，或项目已经使用 Cluster 时阅读。不要为小型项目提前设计 hash tag 和跨 slot 协议。

### 安全与容量

- [安全、ACL、TLS、监控与容量规划](/database/redis/reference/security-observability-capacity-planning)

适合平台、运维和生产 owner 查阅。应用开发者需要掌握不暴露 Redis、使用 TLS/ACL、最小权限和基本延迟/内存监控，不必一次理解完整容量模型。

## 如何判断要不要用 Redis

先回答：

1. 当前接口的瓶颈是否真的在重复数据库读取？
2. 正确索引、减少返回字段和消除 N+1 后是否已经达标？
3. 数据允许陈旧多久，缓存错了能否安全回源？
4. Redis 不可用时，系统应回源、降级还是拒绝？
5. 缓存收益是否覆盖连接、序列化、失效、监控和故障复杂度？

无法回答时，先不加缓存。缓存是数据副本，会增加一种需要治理的一致性状态。

## 学习约定

- 示例只使用 `learning` 前缀，不操作其他业务 key。
- 写入示例设置短 TTL，不使用 `FLUSH*`、生产配置修改或无界删除。
- 不把 `KEYS`、无界集合读取和长脚本放进正常请求路径。
- 不把 Redis 的 MULTI/EXEC 描述成关系数据库式回滚事务。
- 涉及并发协议时，明确超时、重试、幂等和部分成功。
- 涉及运维配置时，以目标 Redis 版本和官方资料为准。

## 建议环境

使用独立本地学习实例或专用测试实例，不连接共享生产 Redis。数据库凭据、Redis 密码和 TLS key 不写入示例、Shell 历史或仓库。

## 官方入口

- [Redis 官方文档](https://redis.io/docs/latest/)
- [Redis 数据类型](https://redis.io/docs/latest/develop/data-types/)
- [Redis 命令参考](https://redis.io/docs/latest/commands/)
- [Redis 运维管理](https://redis.io/docs/latest/operate/oss_and_stack/management/)
- [Redis 安全](https://redis.io/docs/latest/operate/oss_and_stack/management/security/)
