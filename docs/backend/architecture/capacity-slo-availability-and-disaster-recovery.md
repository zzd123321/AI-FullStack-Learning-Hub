---
title: 容量规划、SLO、可用性与灾难恢复
description: 从请求率、服务时间和错误预算计算容量，并区分冗余、备份、RTO、RPO、PITR 与恢复演练
outline: deep
---

# 容量规划、SLO、可用性与灾难恢复

“服务要高可用”“数据库要有备份”“流量大了自动扩容”都不是可验证的设计。要做工程决策，必须把它们变成数字和故障场景：峰值每秒多少请求、每个请求占资源多久、最多允许多少失败、一个 zone 消失还剩多少容量、数据最多能丢几分钟、业务多久必须恢复。

容量规划回答“正常与峰值负载下需要多少资源和余量”；SLO 回答“用户可接受的服务质量目标”；高可用设计减少常见故障中断；灾难恢复则假设主要系统真的不可用或数据已损坏，如何从另一份可信状态恢复。

主线是：**先定义用户结果与业务不变量，再根据 workload、故障域和恢复目标设计容量、冗余与备份，并通过演练证明。**

> 示例环境为 Python 3.11+。SLO/error budget 依据 Google SRE 公开资料；Kubernetes 行为依据 topology spread/PDB 官方文档；数据库恢复依据 PostgreSQL 17/18 的 WAL/PITR 文档。云服务 SLA、复制与备份能力需按实际地区和版本核对。

## 1. workload 不是一个 QPS 数字

至少描述：

- average、peak、p95 request/event rate；
- daily/weekly/seasonal pattern 与营销峰值；
- request mix：read/write/search/export/model inference；
- payload/response size；
- service time 与 CPU/IO/memory/network cost；
- concurrency 与 connection/session duration；
- tenant/key/partition skew；
- cache hit/miss；
- background job、retry、replay、backup traffic；
- growth 与 retention。

同样 1000 req/s，1ms cached read 与 5s AI inference 的容量完全不同。只报平均 QPS 会掩盖 burst 和热点。

## 2. Little's Law 提供第一层直觉

稳定系统中，平均在途数量近似：

```text
L = λ × W

arrival rate 200/s
mean service time 0.1s
expected concurrency ≈ 20
```

<<< ../../../examples/python/backend-capacity-recovery/reliability_learning/model.py{7-22}

如果一个 worker 同时只处理一个请求，目标 utilization 为 50%，模型给约 40 workers。留余量是因为 arrival/service time 有波动，资源还需应对 failover 与发布。

这个公式不是精确 autoscaling 配方：系统必须稳定，mean 会掩盖 tail，worker 也可能异步复用。它帮助发现数量级，再用 load test、queueing/production data 校准。

## 3. utilization 接近 100% 时延迟为何陡增

当资源几乎一直忙，新请求更常等待；少量 service-time 波动就形成 queue。CPU 100%、DB connections 全满、disk IOPS 上限都可能出现“吞吐不再增加，latency 快速上升”。

所以 capacity target 通常低于理论最大值，保留：

- burst headroom；
- instance/zone failure capacity；
- rolling deployment 双版本重叠；
- autoscaling detection/provision/warm-up 延迟；
- retry、replay、backup 和 maintenance；
- workload prediction error。

headroom 是故障和增长策略，不是固定“永远 30%”。

## 4. 找到真正 bottleneck

应用 replicas 增加不代表整体容量增加。可能瓶颈在：

- database CPU/locks/connections/IOPS；
- Redis memory/hot shard/network；
- broker partitions/consumer/downstream；
- third-party quota；
- NAT/ephemeral ports/load balancer connections；
- thread/connection pool；
- JVM heap/GC 或 Python worker；
- object storage/API rate；
- per-tenant serialization lock。

对每个 resource 画 demand → saturation → queue → rejection。扩前端应用而不扩数据库，只会更快把数据库压满。

## 5. load test 要模拟真实工作，而非只打一个 GET

测试应包含真实 mix、payload、数据量/index、cache warm/cold、auth、写冲突和下游 latency。逐步：

1. baseline 单实例；
2. step load 找 knee point；
3. peak/soak 看 leak、GC、fragmentation；
4. burst 看 queue/autoscaling；
5. dependency slow/failure 看 retry amplification；
6. instance/zone loss 看剩余容量；
7. recovery/backlog replay 看二次过载。

load generator 自己不能成为瓶颈。客户端 timeout 后若不记录迟到响应，可能出现 coordinated omission，低估最差 latency。

## 6. autoscaling 不是即时无限容量

闭环：

```text
metric changes
→ collection/window
→ autoscaler decision
→ scheduler/node capacity
→ image pull/process startup
→ startup/readiness/warm cache
→ endpoint receives traffic
```

这可能持续几十秒或更久。突然 burst 在新实例 ready 前仍靠 headroom、queue 或 shedding。

CPU 不是所有 workload 的好 signal：IO wait、queue depth、in-flight、oldest message age、requests per replica 或 custom saturation 可能更直接。metric lag 与 oscillation 需 cooldown/stabilization。

## 7. scale out 与 scale up

- vertical：单机更多 CPU/memory/IO，简单但有上限和重启/成本；
- horizontal：更多 replicas/shards，提高吞吐/容错，但需要 stateless/partition、load balance 和数据一致性；
- concurrency tuning：在同资源内增加并发，过高会增加 context switch、GC、DB contention；
- work reduction：cache、batch、index、压缩、算法优化，经常比加机器有效。

容量方案要记录 cost per business unit，例如每千订单、每百万 token，而非只看总账单。

## 8. SLI、SLO 与 SLA

- **SLI**：实际测量，例如成功的 good requests / valid requests、p99 latency；
- **SLO**：内部/产品目标，例如 30 天内 99.9% 合格读取成功且 <300ms；
- **SLA**：对客户的合同与赔偿/责任，通常不是内部工程目标的同义词。

先问用户关心什么，再选接近用户体验的 indicator。server 200 但 body 错误不是 good；client 已放弃后 server 迟到成功也不一定是 good。

## 9. SLO 必须写完整 measurement contract

示例：

```text
窗口：rolling 30 days
population：authenticated GET /orders/{id}，排除明确无效请求
good：status 200/404 且 total latency < 300ms，response schema valid
target：99.9%
source：edge/gateway request metrics
```

要明确 maintenance、429、dependency error、client cancel、region、tenant 和低流量处理。只写“availability 99.9%”无法计算。

## 10. error budget 是允许的 bad 比例

```text
SLO 99.9%
error budget = 0.1%
```

100 万合格 events 允许约 1000 bad；已有 500 bad，消耗一半：

<<< ../../../examples/python/backend-capacity-recovery/reliability_learning/model.py{25-55}

error budget 把可靠性与变更速度连接起来：budget 充足可继续受控发布；快速燃烧时暂停高风险变化，优先修复。它不是“故意制造错误的额度”。

## 11. 时间型“几个 9”只是直觉换算

30 天窗口：

```text
99%    ≈ 432 minutes unavailable
99.9%  ≈ 43.2 minutes
99.99% ≈ 4.32 minutes
```

<<< ../../../examples/python/backend-capacity-recovery/reliability_learning/model.py{52-55}

event-based SLO 通常更准确，因为部分租户/route failure 不等于整站停机。短时大面积故障与长期少量错误可能消耗相同 events，却有不同业务影响，可再设置 window/burn alerts。

## 12. burn rate 比“月底剩多少”更早告警

burn rate 1 表示按刚好耗完 budget 的速度失败；10 表示十倍速度。多窗口告警可同时发现快速大故障与慢性泄漏，例如短窗口高 burn + 长窗口确认。

不要只对 CPU 告警；CPU 高可能是健康利用率，SLO burn 才直接表示用户结果恶化。资源 saturation 告警作为原因/前兆配合。

## 13. end-to-end availability 会被串联依赖降低

若一个请求必须同时依赖三个各 99.9% 且故障独立的组件：

```text
0.999 × 0.999 × 0.999 ≈ 99.7003%
```

<<< ../../../examples/python/backend-capacity-recovery/reliability_learning/model.py{58-70}

现实故障往往相关，共享 region/network/config/identity 会使简单乘法过于乐观。这个模型提醒：consumer SLO 不能高于所有强制依赖组合而没有 cache/fallback/redundancy。

## 14. replicas 只有独立故障时才增加可用性

两个各 99% 且真正独立、任一可服务的 replicas 理论并联可用性：

```text
1 - (1 - 0.99)² = 99.99%
```

但如果它们在同 node、zone、database、deployment config 下，故障不独立。自动 failover 还可能失败，检测/切换也有时间。

<<< ../../../examples/python/backend-capacity-recovery/reliability_learning/model.py{63-70}

## 15. failure domain 必须物理落地

replicas 应根据目标分散到 node/rack/zone/region。Kubernetes topology spread/anti-affinity 能帮助调度，但要检查：

- label 与 selector 正确；
- 每个 zone 实际有 node/capacity；
- `DoNotSchedule` 会不会让 Pod Pending；
- scale-down 后 constraint 不保证自动再平衡；
- data layer/LB/secret/control plane 是否同样多区；
- 一个 zone loss 后其余 zone 是否有 N+1 容量。

“replicas: 3”不等于“三个故障域”。

## 16. PDB 只覆盖部分 voluntary disruptions

PodDisruptionBudget 限制通过 eviction API 的 voluntary disruption 同时使多少 replicas 不可用，帮助 node drain/upgrade。

它不创建额外 Pod、不保证 zone failure、不限制所有删除方式；Kubernetes 官方明确某些直接删除会绕过 PDB。PDB 与 Deployment strategy、readiness、graceful shutdown、cluster capacity 一起测试。

quorum 系统设置 PDB 时要理解成员数与故障容忍，不能阻止必要维护到无法升级，也不能让自动操作破坏 quorum。

## 17. HA 与 DR 不同

- High Availability：常见组件/实例/zone 故障中自动或快速继续服务；
- Disaster Recovery：region、账号、控制面、数据损坏、勒索、重大误操作后，从独立能力恢复业务。

HA replica 会实时复制好数据，也会实时复制误删/逻辑损坏；因此它不是 backup。backup 提供历史恢复点和隔离保留，但 restore 较慢。

## 18. RTO 与 RPO

- **RTO**：灾难发生后，业务最多多久必须恢复到可接受服务；
- **RPO**：恢复后，最多能接受丢失灾难前多久的数据。

```text
incident at 10:00
RPO 15 min → recovery data 应至少接近 09:45
RTO 60 min → 11:00 前恢复业务目标
```

它们是业务目标，不是 backup frequency 的别名。RTO 包括发现、决策、权限、基础设施、restore、校验、traffic/DNS 切换和沟通。

## 19. backup 类型与恢复能力

- logical dump：跨版本/对象灵活，规模大时慢，transaction/global object 要规划；
- physical/base backup：快速恢复完整数据库，依赖兼容布局/版本；
- snapshots：快，但一致性、应用 quiesce、跨账号复制和保留要验证；
- WAL/binlog continuous archive：base backup + 连续日志，可做 PITR；
- application export：按业务对象恢复，但可能不含全部关系/metadata。

选择基于 RTO/RPO、数据量、版本升级和恢复粒度。只记录“每天备份成功”没有证明 restore。

## 20. PostgreSQL PITR 的因果链

PostgreSQL 持续归档 WAL，并配合 base backup：

```text
restore base backup
→ replay continuous archived WAL
→ stop at target time/name/transaction boundary
→ validate and promote new timeline
```

这能恢复到误删前，而不是只能回到昨晚全量。前提是 base backup 可用且从其开始所需 WAL 连续存在；缺一个 segment 可能阻断后续 replay。

PITR 需要实际版本的 runbook、archive monitoring、timeline 管理、extension/roles/tablespaces/keys 等全套依赖。

## 21. backup 的 3-2-1 与故障隔离思路

常用思路：至少三份副本、两种介质、一份异地/独立。现代云环境更应具体写：

- 与生产不同 account/project/credential boundary；
- immutable/object lock 防攻击者删除；
- cross-region copy；
- encryption key 备份与独立恢复权限；
- retention tiers 与 legal hold；
- inventory/checksum/完整性；
- 生产删除不会级联删除所有恢复点。

数量不是目的，关键是相同事故不能同时摧毁生产与恢复能力。

## 22. 最新 backup 不一定是最佳恢复点

逻辑损坏在 09:30 开始，10:00 被发现；09:55 snapshot 可能已经损坏。需要根据 incident timeline 选择损坏前 point，再用 WAL/event reconciliation 恢复后续合法操作。

示例 catalog 只选择 incident 前、checksum valid 且 restore-tested 的最新 point：

<<< ../../../examples/python/backend-capacity-recovery/reliability_learning/model.py{73-112}

未演练不代表一定不可恢复，但不能用它作为“已证明满足 RPO”的证据。模型故意保守。

## 23. RTO 是多阶段总和

```text
detect 5
+ decide 5
+ provision 10
+ restore 20
+ validate 10
+ shift traffic 5
= 55 minutes
```

<<< ../../../examples/python/backend-capacity-recovery/reliability_learning/model.py{115-152}

只测数据库 restore 20 分钟就宣称 RTO 20 分钟，漏掉了人和系统的其他阶段。自动化能减少 provision/restore，但 decision、安全审批和业务 validation 同样要演练。

## 24. recovery validation 不能只看进程启动

恢复后检查：

- schema/version/migration 与应用兼容；
- row/count/checksum 与 domain invariant；
- latest valid business transaction；
- identity/secret/certificate/config；
- object storage/search/cache/queue projection；
- outbox/inbox/Saga 是否重复或缺失；
- external payment/fulfillment reconciliation；
- read/write smoke 与 SLO；
- replication/backup 在新 primary 上重新建立。

cache/search 可重建，但重建会消耗容量并延长业务 RTO，要计入。

## 25. multi-zone 与 multi-region

multi-zone 通常共享 region control/services，延迟低，适合常见 zone failure。multi-region 能覆盖更大故障域，但带来：

- data replication lag/conflict；
- global routing/DNS/failover；
- active-active write ownership；
- consistency/latency trade-off；
- secret/config/schema rollout；
- cost 与更复杂演练。

active-passive 更简单但 standby 可能长期腐化；active-active 持续使用两边却要求明确 conflict/invariant。不要为了图上对称采用双写。

## 26. failover 与 failback 都要设计

failover 到备用后，原 region 恢复并不意味着立刻切回：数据 timeline 已变化，可能存在 split brain/未同步写入。

failback 步骤包括重新建立复制、reconcile、验证容量、冻结/迁移 writer、灰度切流。若 runbook 只写“DNS 指回去”，恢复可能制造第二次事故。

## 27. degraded mode 与业务优先级

灾难时未必能恢复全部功能。定义 minimum viable service：

- 保留订单状态读取和关键写入；
- 暂停推荐、报表、批量导出；
- 限制低优先级 tenant/job；
- 使用静态公告与有界 stale public content；
- 财务/权限不能用不安全 fallback。

容量规划要为这个模式计算依赖和流量，不是临时现场决定。

## 28. 完整教学实现

<<< ../../../examples/python/backend-capacity-recovery/reliability_learning/model.py

模型把容易混淆的数字分开：

- λW 是平均在途数量；
- target utilization 推导 worker 数；
- error budget 按 events 计算；
- series/parallel availability 明确 independent 假设；
- recovery point 同时要求时间、checksum 和 restore test；
- RTO 累加 detection 到 traffic shift 的所有阶段。

它不是 queue simulator、autoscaler 或 backup 软件；计算结果必须用真实分布和演练校准。

## 29. 自动化测试

<<< ../../../examples/python/backend-capacity-recovery/tests/test_model.py

七项测试覆盖容量数量级、SLO/error budget、串并联系统、损坏/未验证 backup 排除、无可用恢复点显式失败，以及完整 RTO 阶段。

## 30. 运行示例

<<< ../../../examples/python/backend-capacity-recovery/pyproject.toml

```bash
cd examples/python/backend-capacity-recovery
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[test]'
python -m pytest
```

## 31. Vue / JavaScript 对照

- 前端 synthetic/RUM latency 更接近用户体验，server metrics 不含 DNS/CDN/browser；
- SPA chunk 加载失败、API 成功但 schema 错也应进入合适 SLI；
- retry/offline queue 会增加恢复后的 burst，容量测试需包含；
- 灾备切 region 时 public origin/session/cookie/CORS/WebSocket resume 要验证；
- UI degraded mode 明确哪些功能只读/暂停，不把按钮失败留给用户猜；
- 202 workflow 在 failover 后仍需按 operation id/status 恢复，不只恢复页面；
- static assets 多 CDN/region 不代表 API/data 已恢复。

## 32. 演练层级

- tabletop：逐步走 runbook、角色和决策；
- component restore：定期从 backup 建隔离数据库并校验；
- dependency/instance/zone game day；
- region failover drill；
- full business recovery，包括 identity、config、data、traffic 和 external reconciliation。

每次记录实际 RTO/RPO、人工步骤、权限缺失、文档漂移和 remediation owner/date。演练不能破坏生产数据，需 isolation、approval、abort criteria。

## 33. 观测与告警

容量：arrival/mix、service time、in-flight、queue age、saturation、headroom、autoscale lag、per-zone capacity。

可靠性：SLI good/valid events、multi-window burn、dependency contribution、degraded mode。

数据保护：last successful backup、WAL/archive lag、copy age、checksum、retention/immutability、last successful restore drill、restore duration。

DR：replication lag、standby readiness、DNS/route/cert expiry、runbook/credential age、actual RTO/RPO。

backup job green 但 restore drill 失败，应视为数据保护未达标。

## 34. 工程检查清单

- workload 有 peak/mix/payload/service time/concurrency/skew/growth；
- Little's Law 只作基线，使用 tail/load test 校准；
- 每层 bottleneck、queue 与 saturation metric 明确；
- target utilization 留出 burst/failure/deploy/autoscale 余量；
- autoscaling signal、lag、cold start、node capacity 已测试；
- SLI 从用户 good event 定义，population/window/exclusion 完整；
- SLO 与 SLA 未混用，error budget 有发布/修复 policy；
- multi-window burn 告警覆盖快速与慢性故障；
- dependency availability composition 与 fallback 现实；
- replicas 分散真实 failure domains，并有 zone-loss 剩余容量；
- topology/PDB/readiness/graceful rollout 联合测试；
- HA replica 与历史 backup/PITR 明确区分；
- RTO/RPO 由业务批准并映射到架构；
- backup 跨账号/region、immutable、加密且 key 可恢复；
- base backup + 连续 log 完整性/lag 可见；
- 恢复点选择避开逻辑损坏，保留 timeline；
- RTO 包含 detect/decide/provision/restore/validate/traffic；
- restore 验证 domain invariant 和外部系统；
- failover/failback、split-brain 和 writer ownership 清楚；
- degraded minimum service 与容量预先定义；
- 定期演练证明实际 RTO/RPO，发现项有 owner/date。

## 35. 本课结论

- 容量由 arrival rate、service time、请求 mix、资源瓶颈和波动共同决定，不是一个平均 QPS。
- λW 给平均 concurrency 直觉；高 utilization 下 queue/latency 会急剧增长，需要故障与扩容 headroom。
- SLI 是测量，SLO 是目标，SLA 是合同；error budget 把允许失败与发布决策连接。
- 串联强依赖降低 end-to-end availability；replicas 只有跨独立故障域并能正确 failover 才增加可用性。
- PDB 主要约束部分 voluntary disruptions，不是复制、zone 容错或绝对可用性保证。
- HA 处理常见故障；DR 假设系统/region/data 已严重受损。replica 会复制误删，不等于 backup。
- RPO 限数据损失，RTO 限业务恢复时间；RTO 必须包含发现到切流的完整过程。
- backup 成功不证明可恢复；checksum、隔离、PITR、业务校验和定期 restore drill 才能提供证据。
- multi-region 提高故障覆盖也引入复制、冲突、路由、成本和 failback 复杂度。

至此，后端架构专题完成从 HTTP 合同、缓存、消息、Saga、弹性、Gateway、服务边界到容量与灾备的主路线。下一阶段应进行全专题术语、链接、示例和前后衔接复核，而不是继续堆新 pattern。

## 36. 参考资料

- [Google SRE Book：Service Level Objectives](https://sre.google/sre-book/service-level-objectives/)
- [Google SRE Workbook：Implementing SLOs](https://sre.google/workbook/implementing-slos/)
- [Google SRE Book：Handling Overload](https://sre.google/sre-book/handling-overload/)
- [Kubernetes：Pod Topology Spread Constraints](https://kubernetes.io/docs/concepts/scheduling-eviction/topology-spread-constraints/)
- [Kubernetes：Disruptions 与 PodDisruptionBudget](https://kubernetes.io/docs/concepts/workloads/pods/disruptions/)
- [Kubernetes：Horizontal Pod Autoscaling](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
- [PostgreSQL：Continuous Archiving and PITR](https://www.postgresql.org/docs/current/continuous-archiving.html)
- [PostgreSQL：Backup and Restore](https://www.postgresql.org/docs/current/backup.html)
- [AWS Well-Architected：Disaster Recovery](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/plan-for-disaster-recovery-dr.html)
