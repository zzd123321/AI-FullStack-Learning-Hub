---
title: 数据库事故响应、故障切换与复盘
description: 从告警和接口症状建立事故分级、证据采集、限流隔离、锁与容量处置、未知提交、故障切换 fencing、PITR、业务验证和无责复盘
prev:
  text: 数据库容量规划、SLO 与压测
  link: /database/capacity-planning-slo-load-testing
next:
  text: 数据库版本升级、兼容性与回退设计
  link: /database/version-upgrades-compatibility-rollback
---

# 数据库事故响应、故障切换与复盘

数据库事故中最危险的动作，往往不是“不够快”，而是在证据不足时同时重启、切主、杀会话和回滚版本。短暂慢查询可能被升级成双主写入；一个未知提交被盲目重试，可能造成重复扣款；为了释放磁盘删除日志，又可能破坏 PITR。

有效应急响应遵循稳定顺序：先确认用户影响和正确性风险，冻结额外变化并保存证据；再用可逆措施控制负载和故障域；只有满足前置条件才故障切换或恢复；服务回来后还要验证数据与外部副作用，最后通过复盘改进系统。

本课不是命令清单，而是一套决策框架。它把前面学过的连接池、锁、复制、备份、安全和容量放进一条事故时间线。

## 事故首先按“影响”分类

| 类型 | 典型症状 | 第一优先级 |
| --- | --- | --- |
| 可用性 | 连接失败、primary 不可达 | 恢复最小服务，同时防双主 |
| 延迟/过载 | p99、队列、timeout 上升 | 限制到达率，阻止重试放大 |
| 正确性 | 重复、丢失、跨租户、错误更新 | 停止继续污染，保存恢复位置 |
| 复制 | lag、applier stopped、读旧 | 移出不合格副本，保护日志链 |
| 容量 | 磁盘满、WAL/binlog/slot 膨胀 | 停增长源，保护恢复数据 |
| 安全 | 异常账号、导出、权限提升 | 隔离凭据/网络并保全审计证据 |

“数据库 CPU 100%”只是现象，不是事故类别和根因。先声明哪些用户、接口、区域、租户、分片受影响，是否存在数据错误，才能选择措施。

## 严重等级与触发条件

示例分级：

- **SEV-1**：核心写入不可用、多租户数据错误、安全泄漏、可能双主或 RPO 超限。
- **SEV-2**：重要接口 SLO 大幅失败、单分片/区域受影响、有可靠降级。
- **SEV-3**：内部任务延迟、单个非关键接口退化，尚有充足余量。

级别应由业务影响决定，不由数据库名字或负责人级别决定。达到阈值自动呼叫 incident commander、数据库负责人、应用负责人和沟通角色，避免所有人同时操作生产。

## 建立单一指挥与时间线

基本角色：

- **Incident commander**：明确目标、批准高风险动作、控制并行任务。
- **Operations lead**：执行数据库/基础设施 runbook。
- **Application lead**：限流、feature flag、连接池与业务校验。
- **Scribe**：记录时间、证据、假设、动作、结果和决定。
- **Communications**：向用户和管理方同步影响，不干扰技术处置。

每个动作记录：

```text
UTC 时间 / 操作者 / 目标对象
依据的证据与假设
预期结果与观察窗口
回退条件
实际结果
```

聊天消息不是可靠状态库。使用统一 incident doc/timeline，所有操作者先确认当前 primary、拓扑 epoch、数据库和环境，避免在错误节点执行命令。

## 最初五分钟：稳定现场

1. 宣布事故和级别，指定 commander。
2. 冻结非必要发布、DDL、回填、归档清理和容量任务。
3. 确认告警是否对应真实用户影响，而非采集故障。
4. 检查当前 primary/replica/分片角色与最近变更。
5. 保存易失证据：连接、等待、锁、日志、复制位置、磁盘与指标截图。
6. 设置下一次更新时间和明确的当前目标。

不要先重置统计、清空日志、重启数据库或批量 kill。它们会删除根因证据，并可能触发重连风暴。

## 从接口向下逐层定位

```text
用户请求失败
  ↓ 网关：到达率、限流、重试
应用：线程/事件循环、连接池、timeout
  ↓ 网络/DNS/TLS/代理
数据库连接与角色
  ↓ 当前 SQL、锁、CPU、I/O、磁盘
复制、备份、DDL、批任务
  ↓
最近代码/schema/config/流量变化
```

### 先看连接池

- acquire wait 是否先于查询延迟上升？
- active connection 是否达到上限？
- 应用是否在 timeout 后重复创建连接？
- 某个 shard/replica 池是否单独耗尽？
- failover 后旧连接是否仍指向旧主？

数据库只有 30 个 active query，应用却有 5000 个请求排队，根因可能是池、慢事务或下游，而不是 max_connections 太小。

### 再看数据库等待

按 query fingerprint、wait event、锁 blocker 和资源找主导项：

- 大量 runnable + CPU/run queue 高：计算饱和或计划回归。
- I/O wait + latency 高：缓存 miss、扫描、存储抖动或 checkpoint。
- lock wait 集中到少量 blocker：长事务/热点行/DDL。
- connection wait/认证高：连接风暴、代理或 TLS/身份服务。
- WAL/binlog/replication wait：同步副本、日志磁盘或网络。

平均值会掩盖受影响分片和 fingerprint；始终按节点、角色、租户与 query ID 切分。

## 证据快照要可重复、只读、带时间

采集内容：

- 数据库版本、server/system ID、角色、主机和 UTC 时间。
- process/activity、事务年龄、wait 与锁阻塞图。
- top statement digest、错误与最近 server log。
- CPU、内存、磁盘空间/延迟、网络和文件系统错误。
- GTID/LSN、receive/apply、slot/WAL/binlog 保留。
- 最近部署、DDL、参数、流量和故障切换。

快照脚本要有短 statement timeout 和结果大小上限。诊断本身也可能给过载数据库增加压力；优先用聚合视图和已采集监控，不在事故中首次运行全表诊断查询。

日志和 SQL 可能包含敏感参数，证据存储使用受控权限。不要把完整生产查询复制到公共聊天。

## 控制负载优先于扩大队列

可逆 containment 从应用边缘开始：

- 对非关键接口限流或返回可解释降级。
- 暂停报表、导出、回填、索引和批任务。
- 降低昂贵分页/时间范围/返回字段上限。
- 熔断已失败副本/分片，防止持续 timeout。
- 对关键写入保留独立连接/并发预算。
- 延长 timeout 前先确认不会只增加在途请求。

把连接池从 50 调到 500、把 timeout 从 1 秒调到 30 秒，常把快速失败变成更大的数据库队列。系统饱和时目标是让到达率低于可完成吞吐，使队列开始下降。

### 重试必须有预算

只重试明确可重试且幂等的操作，使用 exponential backoff、jitter、deadline 和全局 retry budget。数据库连接失败、deadlock、serialization failure 的重试语义不同；未知 commit 不能当作普通回滚。

## 处理锁事故

先画 blocker chain：谁等待谁、blocker 事务做了什么、持锁多久、是否仍在进展。终止 blocker 前确认：

- 它是否正在提交/回滚大事务？
- 取消 statement 还是终止 session？
- 回滚需要多久和多少 I/O/undo？
- 应用会不会立即重试相同事务？
- 它是否为 migration、备份或关键账务？

kill 一个修改千万行的事务不会瞬间释放所有压力，回滚可能持续很久。先阻止相同任务再次启动，再按 runbook 取消。

MySQL deadlock 会回滚整个受害事务；默认 lock wait timeout 常只回滚当前 statement，应用必须理解事务是否仍开放。PostgreSQL 取消 query 与终止 backend 的影响也不同。本课 SQL 只诊断，不自动取消任何会话。

## 磁盘满事故

先识别增长来源：业务表/索引、WAL/binlog、replication slot、临时文件、错误日志、DDL 影子对象还是备份。不同来源不能用同一种“删文件”处理。

绝不能从数据库数据目录手工删除未知文件。直接删除 WAL/binlog、redo/undo 或表文件可能让实例和恢复链不可用。

优先措施：

- 停止产生异常增长的批任务/查询。
- 修复 stopped consumer/slot/replica 的保留原因。
- 扩展受支持的存储或迁移非数据库文件。
- 仅通过数据库/备份系统认可的保留流程清理已确认安全对象。
- 持续观察 free space 变化率，而不只当前百分比。

删除业务行不会保证文件系统立即缩小，还会产生更多日志；事故中执行大 DELETE 可能让情况更糟。

## 慢查询与计划回归

若单个新 fingerprint 主导资源：

1. 关联最近应用/schema/statistics/参数变化。
2. 保存实际计划、参数分布和等待证据。
3. 在应用层关闭 feature/限制查询范围，优先可逆 containment。
4. 评估 query cancel 是否安全以及调用方重试行为。
5. 在隔离环境验证 SQL/索引修复，再小流量发布。

不要在高压时直接创建大索引，online/concurrent 仍会消耗 I/O、空间和日志。紧急修复也要先确认 lock、空间和失败路径。

## 复制事故与陈旧读取

副本 lag 时：

- 将其从要求实时的读池移除，但保留证据。
- 判断 receiver、apply、锁、I/O、长查询或大事务阶段。
- 监控位置差和 apply rate，估算追赶时间，而非只看 lag 秒数。
- 防止所有读取同时回 primary 造成二次过载。
- 检查 WAL/binlog/slot 保留磁盘风险。

applier stopped 要读具体 worker error，不能直接 skip transaction。跳过可能破坏数据一致性；应理解事件、修复数据或重建副本。

## 未知提交：timeout 不等于 rollback

客户端发送 COMMIT 后连接断开：

```text
数据库可能已提交，但响应丢失
数据库也可能未提交
客户端只知道结果未知
```

若直接重试“扣款 100 元”，可能重复扣款。业务写入应有幂等键/唯一约束，并提供按 operation ID 查询最终状态：

```text
POST operation_id=abc
→ timeout
GET /operations/abc
→ COMMITTED / FAILED / UNKNOWN
```

UNKNOWN 进入对账/恢复流程，不让客户端无限创建新 operation ID。故障切换时要特别关注旧 primary 上可能确认但未复制的事务。

## 什么时候故障切换

failover 是高风险恢复动作，不是“primary 慢就切”。前置判断：

- primary 确实不可安全继续，还是网络分区让观察者看不到？
- 候选副本数据位置、timeline/GTID、RPO 是否满足？
- 候选容量和配置能承担 primary 角色？
- 旧 primary 能否先被 fencing，确保不能继续写？
- 客户端/代理/连接池如何刷新角色？
- 同步副本、归档、备份和下游复制如何重建？
- 未知提交和数据缺口如何对账？

PostgreSQL 官方明确指出，旧 primary 重启后必须有机制知道自己不再是 primary，常称 STONITH；否则两个节点都认为自己可写会导致混乱和数据丢失。MySQL/代理/编排系统同样需要真实 fencing，而不只是更新 DNS。

### Fencing 必须在写入点生效

可用机制包括：

- 隔离旧节点网络/存储。
- 撤销写角色/租约并使用 topology epoch。
- 代理只允许当前 primary，旧节点拒绝写。
- 云平台电源/实例 fencing。

只在应用缓存中改 primary 地址不够：旧应用、后台任务、长连接或网络分区一侧仍可能写旧主。

### 切换后的验证

- 新节点角色与 epoch 正确，旧节点不可写。
- 核心写入、写后读和唯一约束通过。
- 连接池旧连接排空，错误/重连速率下降。
- replication/archiving/backup 在新 timeline/topology 恢复。
- 容量、checkpoint、日志与 p99 稳定。
- 对切换窗口执行未知提交和账务对账。

## 正确性事故：停止污染再恢复

误更新、跨租户泄漏或应用 bug 持续写坏数据时，首要任务可能是暂停特定写入，而不是保持可用性数字。记录：

- 第一个/最后一个已知坏事件时间和日志位置。
- 受影响表、租户、操作和外部副作用。
- 错误代码/schema/config 版本。
- 当前 binlog/WAL 归档水位和备份。

选择：

- 少量可识别行：隔离恢复后生成精确修复集。
- 大范围逻辑污染：PITR 到错误前，或恢复副本进行差异导回。
- 跨系统副作用：数据库恢复之外执行幂等补偿/对账。

整库回退会丢掉错误之后的正确事务，不能只因为操作简单就采用。恢复必须在隔离环境验证，并保留原现场。

## 重启不是诊断工具

重启可能暂时清除连接、缓存或锁，却会：

- 丢失内存证据和统计。
- 触发 cold cache、crash recovery 和连接风暴。
- 让副本/primary 同时恢复造成拓扑不明。
- 在磁盘/日志不足时无法重新启动。
- 掩盖会再次出现的根因。

只有 runbook 明确重启能解除的故障、证据已保存、恢复时间与容量已评估时才做。逐台、带健康门禁，禁止同时重启整个复制拓扑。

MySQL `innodb_force_recovery` 是极端损坏时尝试导出数据的抢救配置，高等级会限制/跳过恢复工作并带来数据风险；只能按官方文档和专家 runbook 从最低级别评估，不能作为一般启动参数。优先从已验证备份恢复。

## 恢复服务不等于事故结束

进入 monitoring/stabilized 阶段后持续验证：

- SLI 在完整观察窗口内恢复，不只一分钟绿色。
- 队列、连接、锁、磁盘和 replica lag 正在下降。
- 降级/限流可以分阶段撤销，不发生回弹。
- 数据不变量、outbox、消息和外部副作用对账。
- 备份、PITR、审计和监控链路恢复。
- 临时权限、break-glass、手工配置和流量规则被登记。

只有业务验证完成、临时风险有负责人、沟通关闭后才结束事故。

## 沟通要陈述事实与不确定性

有效更新：

```text
影响：订单创建在 10:02 UTC 起约 18% 超时，查询正常
正确性：尚未发现重复订单；10:02–10:09 的提交结果正在对账
当前措施：暂停导出并将创建流量限制在已验证容量内
下一步：观察队列下降并核对 operation_id
下次更新：10:30 UTC
```

避免在证据不足时宣布“无数据丢失”或“数据库已恢复”。区分已知事实、当前假设和待验证事项。

## 无责复盘不是没有责任

复盘聚焦系统条件和决策质量，而不是寻找“谁执行了错误 SQL”。需要回答：

- 预期系统如何工作，实际发生了什么？
- 哪个保护层应阻止/检测问题，为什么没有？
- 告警是否比用户早？runbook 是否可执行？
- 哪些动作有效，哪些扩大影响？
- 组织、权限、工具和时间压力如何影响决策？

行动项必须具体、可验证、有 owner 和截止日期：

```text
差：加强监控
好：为 replica apply stopped 建立 2 分钟告警，附 worker error 与 runbook，负责人 A，8 月 1 日前演练
```

优先消除故障类别：幂等约束、容量门禁、自动 fencing、渐进发布、恢复演练，而不是只写“以后更小心”。

## 示例说明

### 事故状态与安全门禁模型

运行：

```bash
node examples/database/25-incident-response-model.mjs
```

模型验证：保存证据前不能执行高风险变更；failover 必须具备候选健康、RPO 与旧主 fencing；恢复服务后必须完成业务校验和临时措施清理才能关闭。

### MySQL 8.4 只读快照

`examples/database/25-mysql-incident-snapshot.sql` 采集身份/角色、线程、事务、metadata/data lock 等待、复制 worker 错误和最近 error log，不 kill、reset 或修改参数。

### PostgreSQL 18 只读快照

`examples/database/25-postgresql-incident-snapshot.sql` 采集角色/LSN、activity、blocker、复制/slot、数据库统计与 archiver，不 cancel、terminate、promote 或 reload。

## 上线检查清单

### 准备

- SLO、事故级别、on-call 和升级路径明确。
- 只读证据脚本有超时、脱敏和版本验证。
- 限流、feature flag、批任务暂停可独立操作。
- failover/fencing、PITR、break-glass 定期演练。
- operation ID、幂等和未知提交查询路径覆盖关键写入。

### 响应

- 单一 commander、时间线和下一次更新时间建立。
- 冻结变更并确认用户/正确性影响。
- 保存易失证据，不先重启/reset/批量 kill。
- containment 可逆，重试与连接有全局预算。
- 每个高风险动作写明假设、预期、回退和观察窗口。

### 切换与恢复

- 候选位置、RPO、容量、配置和角色验证。
- 旧 primary 在提升前/同时被可靠 fencing。
- 客户端旧连接、代理、任务和 topology epoch 刷新。
- 未知提交、数据缺口和外部副作用对账。
- backup/archive/replication 在新拓扑恢复。

### 关闭与复盘

- 用户 SLI、资源队列和业务不变量稳定。
- 临时限流、权限、配置和手工数据变更登记/清理。
- 事实、假设和未决风险在最终沟通中区分。
- 复盘行动项有 owner、期限和验证方式。
- 修复进入演练，证明同类事故更早检测或自动阻断。

## 常见误区

### “先重启看看，最快”

重启丢证据、触发 cold cache/恢复/重连，可能扩大影响。必须有明确故障机制和恢复门禁。

### “timeout 就说明事务没提交”

COMMIT 响应可能丢失。关键写入必须用 operation ID 查询和幂等约束解决未知结果。

### “切 DNS 后旧主就不会再写”

长连接、旧缓存和网络分区仍可访问旧主。fencing 必须在节点、存储、代理或租约层生效。

### “磁盘满就删除 binlog/WAL”

手工删除可能破坏复制、PITR 和启动。先识别保留原因并使用受支持流程。

### “杀 blocker 会立即恢复”

大事务回滚可能持续消耗 I/O，应用还可能立即重试。先阻止来源、理解事务，再执行取消。

### “副本 lag 就把所有读切 primary”

这可能压垮 primary。需要有界回退、限流、陈旧度分级和容量保护。

### “接口恢复 200，事故就结束”

仍可能存在数据缺口、重复副作用、旧主可写、归档中断和临时高权限。必须业务验证。

## 本课小结

- 事故按用户影响和正确性分类，CPU/lag 只是证据而非结论。
- 单一指挥、冻结变更、保存易失证据是最初稳定现场的关键。
- 从接口、连接池、数据库等待、资源、复制到最近变更逐层定位。
- 过载先限到达率和非关键工作，不通过扩大连接/timeout 增加队列。
- timeout 后 COMMIT 可能未知，关键写入依赖幂等键、状态查询和对账。
- failover 必须验证候选 RPO/容量，并可靠 fencing 旧主以防双写。
- 磁盘、锁、复制和计划事故都有不同 containment，禁止手工删数据库文件或盲目 skip。
- 重启与 force recovery 不是普通诊断工具；优先保留证据和已验证恢复路径。
- 服务恢复后还要校验业务不变量、外部副作用和新拓扑的备份/复制。
- 复盘用具体、可验证行动消除故障类别，而不是要求个人“更小心”。

## 官方资料

- [MySQL 8.4：Accessing the Process List](https://dev.mysql.com/doc/refman/8.4/en/processlist-access.html)
- [MySQL 8.4：Performance Schema Lock Tables](https://dev.mysql.com/doc/refman/8.4/en/performance-schema-lock-tables.html)
- [MySQL 8.4：Performance Schema Replication Tables](https://dev.mysql.com/doc/refman/8.4/en/performance-schema-replication-tables.html)
- [MySQL 8.4：error_log Table](https://dev.mysql.com/doc/refman/8.4/en/performance-schema-error-log-table.html)
- [MySQL 8.4：InnoDB Troubleshooting](https://dev.mysql.com/doc/refman/8.4/en/innodb-troubleshooting.html)
- [PostgreSQL 18：Monitoring Database Activity](https://www.postgresql.org/docs/18/monitoring.html)
- [PostgreSQL 18：System Administration Functions](https://www.postgresql.org/docs/18/functions-admin.html)
- [PostgreSQL 18：Log-Shipping Standby Servers](https://www.postgresql.org/docs/18/warm-standby.html)
- [PostgreSQL 18：Failover](https://www.postgresql.org/docs/18/warm-standby-failover.html)
