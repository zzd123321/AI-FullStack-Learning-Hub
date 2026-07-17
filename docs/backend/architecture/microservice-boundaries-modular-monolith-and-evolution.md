---
title: 微服务边界、模块化单体与渐进式演进
description: 从业务能力、数据所有权和变化模式选择模块边界，并用 Port、契约测试、灰度和 Strangler Fig 安全拆分服务
outline: deep
---

# 微服务边界、模块化单体与渐进式演进

微服务最吸引人的描述是“每个服务可以独立开发、部署和扩缩容”。但把一个函数调用变成 HTTP，并不会自动得到独立性：网络会失败，数据不再能用一个 transaction 更新，API 要长期兼容，测试和发布也需要跨团队协调。

真正的目标不是服务数量，而是**让一个业务能力能在尽量少影响其他能力的情况下变化和交付**。如果两个“微服务”每次都要同时发布、共享同一张表、彼此高频同步调用，它们只是一个被网络切开的分布式单体。

本课先从业务语言、数据所有权和变化模式识别边界，再解释为什么模块化单体常是更好的起点，最后用渐进路由、Port/Adapter、契约测试和数据迁移完成安全拆分。

> 第一次学习的默认答案是模块化单体。只有独立交付、独立扩缩容、故障隔离或组织所有权带来可验证收益，而且团队已经具备可观测、自动化发布和接口治理能力时，才拆一个具体业务能力。服务数量不是架构成熟度指标。

> 微服务没有统一版本规范。本课依据 DDD/bounded context 的公开架构资料、Martin Fowler 的 Monolith First、Microservice Prerequisites 与 Strangler Fig 文章；具体组织决策必须结合团队和系统证据。

## 1. 部署单元与逻辑模块是两个维度

**monolith** 通常指一个部署单元；它内部仍可有清晰模块。

**microservice** 是独立部署、拥有业务能力和数据边界的服务。它不是“一个 controller”“一张表”或“一个 Docker container”。

```text
模块化单体：一个进程 / 多个清晰业务模块
微服务系统：多个进程 / 每个服务仍需内部模块
分布式单体：多个进程 / 边界耦合、必须协同发布
```

模块化与部署拓扑不是二选一。先建立逻辑边界，之后才有低风险物理拆分的可能。

## 2. 单体不是失败的同义词

单体的优势：

- 本地函数调用简单、快速、类型易追踪；
- 一个数据库 transaction 可维护跨模块强不变量；
- 本地调试、测试与部署链更简单；
- 小团队沟通成本低；
- 重构边界时不需要跨网络/API/data migration。

问题通常来自“big ball of mud”，不是一个进程本身：任意模块直接访问任意表、循环依赖、没有 owner、所有代码一起变化。

把泥球拆成多个进程，只会把编译错误变成 runtime timeout，把本地 transaction 变成 Saga。

## 3. 微服务的 premium

每增加一个独立服务，就增加：

- artifact、pipeline、deployment 与 rollback；
- service discovery、TLS/identity、secret/config；
- API/event schema compatibility；
- timeout/retry/circuit breaker；
- logs/metrics/traces 与跨服务调试；
- data ownership、eventual consistency、outbox/Saga；
- on-call、capacity、backup/restore 与安全 patch；
- local development 和 integration environment。

这些不是反对微服务，而是它只有在独立交付、隔离扩展、组织自治或不同可靠性要求的收益超过 premium 时才值得。

## 4. 先问为什么拆

可验证的驱动因素：

- 一个业务能力变化频繁，却被大应用 release train 阻塞；
- 不同团队需要真正独立 owner 和发布节奏；
- 某能力有截然不同的容量/延迟/合规/隔离要求；
- 故障需要明确 blast radius；
- 技术/数据存储差异带来实质收益；
- 当前模块边界与数据交互已稳定，有证据可拆。

薄弱理由：

- “大厂都用”；
- “以后可能有亿级流量”；
- “每张表一个服务看起来整齐”；
- “换 Kubernetes 就是微服务”；
- “代码行数超过某个数字”。

目标要有指标，例如 lead time、deployment coupling、change failure rate、资源热点，而不是抽象“现代化”。

## 5. 按业务能力，不按技术层拆

错误水平分层：

```text
UserController Service
BusinessLogic Service
Database Service
```

一次功能仍要跨所有服务，任何 change 都同步协调，网络调用只是层间方法调用。

业务能力边界更像：

```text
Ordering
Inventory
Payments
Fulfillment
```

每个能力包含自己的 API、application/domain logic 和数据访问，围绕业务结果形成 cohesion。

## 6. bounded context 是模型边界，不自动等于一个服务

同一个词在不同上下文可以有不同含义：

- Ordering 的 Customer 关注下单身份和地址快照；
- Support 的 Customer 关注工单与服务等级；
- Accounting 的 Customer 关注付款主体和税务信息。

bounded context 定义一种 domain model/ubiquitous language 在哪里成立。它是 microservice candidate，不是机械的一对一规则。一个 context 初期可作为单体内模块；极复杂 context 内也可能需要多个部署单元，但必须保留清晰 owner/model。

## 7. aggregate 是 transaction/invariant 边界

aggregate 把必须在一次 local transaction 中保持一致的状态放在一起。跨 aggregate 通常用 identity 引用和 eventual workflow。

如果拆分后一个核心 invariant 每次都要跨两个服务同步 transaction，边界可能切错。先问“哪些数据必须原子改变”，再决定部署位置。

服务不应小于一个 aggregate，也不应把整个企业模型塞进一个 aggregate。边界来自业务不变量与生命周期，不是 class 数量。

## 8. 数据所有权比 API 路径更能暴露真假边界

真正 owner service：

- 是该数据业务规则与 schema 的唯一写入者；
- 对外提供 API/event，而不是让其他服务直接 UPDATE table；
- 负责 migration、retention、backup、authorization；
- 发布下游需要的稳定事实。

多个服务共享 database server 并不一定违规；多个服务随意读写同一 schema/table 才破坏 ownership。物理隔离可以逐步加强：schema、role、database、cluster。

下游为了查询性能保存 projection 是自己的派生副本，不成为源数据 owner。退款决策仍问 Order/Payment 权威历史。

## 9. context map 让依赖显式

记录每对 context：upstream/downstream、API/event、owner、SLA、schema、consistency、团队关系。

常见关系：

- Published Language/Open Host Service：稳定公开合同；
- Anti-Corruption Layer：下游翻译上游/legacy 模型，保护自己的语言；
- Customer/Supplier：双方协商 upstream roadmap；
- Separate Ways：无需集成，各自实现。

示例 legacy 字段不是让新模块到处使用，而集中翻译：

<<< ../../../examples/python/backend-service-evolution/evolution_learning/evolution.py{117-125}

## 10. coupling 不只有代码 import

- runtime coupling：A 请求必须等待 B；
- data coupling：共享 schema/table/internal ID；
- contract coupling：一个字段变化导致多人升级；
- temporal coupling：必须同时在线/按顺序发布；
- operational coupling：共用资源，一个热点拖垮全部；
- organizational coupling：每次 change 要跨多个团队审批；
- semantic coupling：同一个词实际含义不同却共享 model。

异步 event 降低同时在线要求，却可能增加 schema、顺序与 eventual consistency coupling。不存在“完全解耦”，目标是让依赖明确、稳定、符合 owner 关系。

## 11. cohesion 可用“共同变化”观察

查看 version control 与 incident：

- 哪些文件经常一起修改？
- 哪些功能共享同一业务专家和术语？
- 哪些数据必须一起 transaction？
- 哪些服务总要同时发布？
- 哪些调用最 chatty？
- 哪些事故总跨相同组件？

经常共同变化的能力被强拆，协调成本会持续出现；很少共同变化、拥有独立数据/团队/容量的模块可能适合分离。

代码行数只是结果，不是边界证据。

## 12. 团队与服务边界互相影响

一个服务应有清楚 owner，owner 能开发、发布、值班并维护数据。如果一个小团队被迫拥有几十个服务，认知与 on-call 负担会超过自治收益。

共享 platform team 可提供 paved road：CI/CD、telemetry、identity、runtime、secret、template，但不能替 domain team 决定业务边界。过度中央审批又会取消独立交付。

Conway's Law 不是“照组织架构切服务”，而是需要有意识地让沟通结构支持期望边界。

## 13. 模块化单体如何建立可拆边界

建议：

- top-level package 按业务 module，不按 controller/service/repository 全局分层；
- module 只暴露 public application API/events；
- 禁止跨模块访问 internal package/table；
- 每个 module 明确 owned tables/schema；
- 跨模块通过 Port/interface，而非 import implementation；
- architecture tests 检查依赖方向/循环；
- local transaction 保留真正需要的强一致性；
- internal event 与 external integration event 区分。

Port 让调用者依赖业务合同，而不依赖“本地 class 还是远程 HTTP”：

<<< ../../../examples/python/backend-service-evolution/evolution_learning/evolution.py{8-31}

## 14. Port/Adapter 不是为了炫技

示例 `InventoryPort` 有 availability/reserve；本地 adapter 调同进程 kernel，远程 adapter 做 transport DTO mapping：

<<< ../../../examples/python/backend-service-evolution/evolution_learning/evolution.py{34-114}

迁移前：

```text
Ordering → InventoryPort → LocalInventoryAdapter → Inventory module
```

迁移后：

```text
Ordering → InventoryPort → RemoteInventoryAdapter → HTTP → Inventory service
```

业务调用方不应感知 URL/JSON/client exception。adapter 负责 timeout/error/DTO translation，但远程调用新增的 partial failure 仍要让 application policy 明确处理。

## 15. 本地与远程合同不能假装完全相同

本地方法可以传复杂对象、抛任意 exception；远程合同需要序列化、版本、status、deadline、idempotency、auth。

因此 Port 要从一开始保持“可发布”边界：小而稳定的 DTO、明确 error、避免返回 ORM/live object。即便永不拆服务，这也改善模块理解。

但不要为了未来可能远程化，让每个本地函数都 JSON serialize 或异步消息化；只在真实业务边界设计 Port。

## 16. Strangler Fig：按能力渐进替换

大爆炸 rewrite 要等待新系统完整复制旧行为，cutover 风险集中。Strangler Fig 在入口截获一小部分能力/流量，逐步移到新实现：

```text
route old capability → legacy
route extracted capability/cohort → new service
observe/compare
increase traffic
retire old path/data write
```

每一步都交付价值且可暂停/回退。但“双系统共存”有额外成本，必须有迁移终点和清理计划。

## 17. 稳定 cohort 灰度

随机每个请求 10% 会让同一用户一会儿旧、一会儿新，写状态更危险。按稳定 subject hash 分桶：

<<< ../../../examples/python/backend-service-evolution/evolution_learning/evolution.py{128-137}

`tenant/user/order` 哪个作 key 取决于一致性范围。百分比从 0→1→5→25→100，观察 correctness 与 SLO。hash 算法/seed 应稳定，变更会重新洗牌。

## 18. shadow traffic 适合读，不可无脑复制写

读取可让旧实现作为 primary，同时调用新实现做 shadow，将结果 normalize 后比较，但只返回 primary：

<<< ../../../examples/python/backend-service-evolution/evolution_learning/evolution.py{140-162}

要处理 nondeterministic 字段、排序、时间、PII 和双倍负载。shadow request 应标记，禁止发送邮件/计费等副作用。

写请求复制到两个系统会形成 dual write：任一边失败都会分叉。若为了数据迁移需要，使用 outbox/CDC、stable operation id、reconciliation，而不是 gateway 简单 fan-out。

## 19. 写请求不能在 unknown outcome 后自动 fallback

remote reserve timeout 可能已经扣库存。如果 adapter 自动调用 local reserve：

```text
remote 实际成功但 response lost
→ fallback local 也成功
→ 两个系统各扣一次
```

示例对写失败直接返回，不回退：

<<< ../../../examples/python/backend-service-evolution/evolution_learning/evolution.py{164-169}

恢复应复用相同 operation id 查询/retry remote。只有能证明请求未被处理，或两端共享严格幂等 authority，才可安全路由替代。

## 20. 契约测试是迁移护栏

同一 consumer-facing contract suite 应运行在：

- Local adapter/module；
- Remote adapter + service endpoint；
- legacy anti-corruption adapter（适用子集）。

示例用 parameterized test 验证 local/remote 对 reserve、remaining、idempotency 相同：

<<< ../../../examples/python/backend-service-evolution/tests/test_evolution.py{13-34}

还要有 provider schema/behavior tests、backward compatibility、timeout/error/media type 和 production-like network tests。mock 只能证明 consumer 对自己的假设满意。

## 21. 数据迁移比代码路由更困难

常见步骤：

1. 明确源数据 owner 与 target schema；
2. snapshot/backfill 历史数据；
3. 用 CDC/outbox 捕获 backfill 期间增量；
4. reconcile count/hash/domain invariants；
5. shadow/read compare；
6. 切读；
7. 切单一写 owner；
8. 保留回退窗口但避免恢复 dual writer；
9. 删除 legacy write/read/schema。

backfill 不是普通批量 copy：要限速、checkpoint、幂等、处理更新/删除、时区/精度/ID mapping，并验证业务不变量。

## 22. shared database 的渐进退出

立即“database per service”可能阻塞迁移。可以渐进：

```text
同 database，不同 owned tables
→ database roles 禁止跨 owner write
→ schema 分离
→ API/event 替代跨表 read
→ physical database 分离
```

在过渡期追踪每个跨表 query 并设删除计划。把 shared table 包进另一个“data service”只是把 join 变成 chatty API，不一定解决 domain ownership。

## 23. 什么时候应合并服务

拆分不是单向道路。出现以下证据时考虑 merge：

- 两服务必须同时发布；
- 双向 chatty 同步调用；
- 一个业务 transaction 频繁跨两者 Saga；
- 数据 ownership 无法清晰划分；
- 同一小团队维护，独立扩缩容/合规无收益；
- 大量防腐层只是翻译同一模型；
- 故障/值班永远一起处理。

合并不是失败，而是根据新证据修正边界。架构是可演进假设，不是永久组织图。

## 24. microservice 过小的症状

- 每个 UI 页面需要几十个同步 API；
- 一个字段 change 触发多个 repo 发布；
- service 只有 CRUD passthrough，无独立 invariant/owner；
- 每个 request 多次跨网络做细粒度 getter；
- distributed transaction 成为默认路径；
- tracing 中大量短 hop，业务计算很少；
- 团队花更多时间维护 pipeline/dashboard 而非能力。

解决可能是粗粒度 API、CQRS projection、合并服务或重新画 bounded context，而不是再加 gateway aggregation。

## 25. microservice 过大的症状

- 多团队在同一个 deployment queue；
- 不相关模块互相 import/table access；
- 一处热点要求整个系统扩容；
- release blast radius 很大；
- 一个模型词在不同业务中含义冲突；
- owner/on-call 无法理解全部。

先在代码/数据内形成模块与 owner，再物理拆分最独立且收益明确的 seam。

## 26. 微服务 prerequisites

开始扩大服务数量前应具备：

- automated provisioning/deployment/rollback；
- service ownership/catalog；
- centralized logs、metrics、distributed traces；
- API/event compatibility CI；
- secret、workload identity、patch management；
- standard deadline/retry/health；
- incident/on-call 与 SLO；
- local/integration test strategy；
- data migration/backup/restore；
- platform paved road 与成本/容量可见。

没有这些能力，服务数量会放大手工错误和恢复时间。

## 27. 完整教学实现

<<< ../../../examples/python/backend-service-evolution/evolution_learning/evolution.py

模型刻意把 domain kernel、Port、local/remote/legacy adapter、cohort router 和 migration adapter 分开。它不启动 HTTP server，因为要验证的是 boundary/migration semantics；真实 remote adapter 还需 HTTP contract、auth、deadline、retry、serialization 与 telemetry。

## 28. 自动化测试

<<< ../../../examples/python/backend-service-evolution/tests/test_evolution.py

测试覆盖：

- local/remote 同一 reservation contract；
- operation id 重放不重复 effect；
- ACL 翻译 legacy language；
- cohort 对同 subject 稳定，0/100% 边界；
- shadow difference 记录但 primary response 不变；
- remote write failure 不回退 local；
- rollout 选择预期 adapter。

## 29. 运行示例

<<< ../../../examples/python/backend-service-evolution/pyproject.toml

```bash
cd examples/python/backend-service-evolution
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[test]'
python -m pytest
```

## 30. Vue / JavaScript 对照

- Vue component boundary 不等于 backend service boundary；component 更偏 UI reuse/state，service 由 domain/data/team/runtime 驱动；
- micro-frontend 也不会自动要求每块对应一个微服务；
- frontend 不应直接编排大量内部 services，public API/BFF 隔离拓扑；
- API 拆分期间旧/new frontend 会并存，route cohort 与 backward compatibility 要稳定；
- shadow read 不能在浏览器双发敏感请求，否则暴露新 endpoint/token/CORS 并双倍流量；
- 202/eventual state 要在 UI 显示 pending，不靠重复点击；
- TypeScript generated client 是合同工具，不代表 provider 行为已兼容。

## 31. 观测拆分是否成功

架构 outcome 指标：

- deployment frequency/lead time；
- change failure rate/rollback/MTTR；
- 每次 change 涉及 repo/team/service 数；
- synchronous fan-out、chatty calls、distributed transaction 数；
- per-service SLO 与 dependency contribution；
- owner/on-call load 与认知负荷；
- local vs remote/shadow mismatch；
- cohort correctness/latency/error；
- data reconciliation drift；
- legacy traffic/table access 减少；
- infrastructure/unit-of-business cost。

如果服务更多但交付更慢、事故更多、协调不减，目标没有实现。

## 32. 工程检查清单

- 拆分有可测业务/组织/容量目标，不以服务数量为目标；
- boundary 按 capability/model/invariant，不按技术层/table；
- bounded context、aggregate 与 deployable 概念未混淆；
- 每份权威数据有唯一写 owner；
- context map 记录 upstream/downstream/contract/team；
- runtime/data/contract/temporal/organizational coupling 已分析；
- 模块化单体有 public API、internal 隐藏、architecture tests；
- Port 使用稳定 DTO/error，不泄漏 ORM/internal model；
- local/remote adapter 运行同一 consumer contract suite；
- ACL 把 legacy 模型翻译限制在边界；
- Strangler route cohort 稳定、可观测、可回退；
- shadow 只用于安全读取，副作用被禁止；
- 写 unknown outcome 不自动 fallback/dual write；
- data backfill + CDC + reconciliation + cutover + cleanup 完整；
- 过渡 shared DB 有 role/owner/退出计划；
- API/event rolling compatibility 覆盖旧 consumer/retained event；
- provisioning/telemetry/security/on-call prerequisites 就绪；
- 有明确 legacy retirement 和迁移临时代码删除条件；
- 接受根据证据合并错误边界。

## 33. 本课结论

- 微服务的价值是业务能力独立交付和隔离，不是进程/容器数量。
- 一个清晰模块化单体通常比边界错误的分布式单体更容易维护和演进。
- boundary 来自 bounded context、aggregate invariant、数据 owner、共同变化与团队能力。
- 服务拥有数据写入规则；共享 table 写入会让 API 独立性失真。
- Port/Adapter 让本地与远程实现遵守同一业务合同，契约测试防止迁移漂移。
- Strangler Fig 用稳定 cohort 渐进切换；shadow read 可比较，写 dual-run 需要可靠数据协议。
- 写请求 timeout 是 unknown outcome，不能为了可用性自动落到另一 writer。
- 数据 backfill、增量同步、reconciliation 和单一写 owner 往往比代码抽取更困难。
- 拆错时应合并；架构边界是持续验证的假设，不是不可逆荣誉。

下一节：容量规划、可用性与灾难恢复——从 workload、utilization、queue、SLO/error budget 到 redundancy、RTO/RPO、backup/restore、multi-zone/region 与演练，建立可计算的运行边界。

## 34. 参考资料

- [Microsoft：Use domain analysis to model microservices](https://learn.microsoft.com/en-us/azure/architecture/microservices/model/domain-analysis)
- [Microsoft：Use tactical DDD to design microservices](https://learn.microsoft.com/en-us/azure/architecture/microservices/model/tactical-domain-driven-design)
- [Microsoft：Identify microservice boundaries](https://learn.microsoft.com/en-us/azure/architecture/microservices/model/microservice-boundaries)
- [Microsoft：Data considerations for microservices](https://learn.microsoft.com/en-us/azure/architecture/microservices/design/data-considerations)
- [Martin Fowler：Monolith First](https://martinfowler.com/bliki/MonolithFirst.html)
- [Martin Fowler：Microservice Prerequisites](https://martinfowler.com/bliki/MicroservicePrerequisites.html)
- [Martin Fowler：Strangler Fig Application](https://martinfowler.com/bliki/StranglerFigApplication.html)
