---
title: API Gateway、服务发现、健康检查与配置治理
description: 沿一次请求的完整路径理解 DNS、负载均衡、L7 路由、身份边界、EndpointSlice、readiness 与动态配置快照
outline: deep
---

# API Gateway、服务发现、健康检查与配置治理

浏览器请求 `https://api.example.com/api/orders/o-100` 时，并不是“直接访问 Spring Boot”。它可能依次经过 DNS、云负载均衡、WAF、API Gateway、Kubernetes Service、service mesh proxy，最后才到某个 Pod。

这些组件都可能路由、终止 TLS、添加 headers、重试或超时。如果责任没有写清，一次请求可能被重复认证、重复 retry；客户端也可能伪造 `X-User-Id` 或 `X-Forwarded-For`，让后端误信外部输入。

本课沿 data plane 的真实路径解释每层作用，再讨论 control plane 如何向它们发布 route、endpoint 和 policy。主线是：**稳定名称如何找到不断变化的健康实例，边界组件如何把不可信外部请求转换成受约束的内部请求。**

> Kubernetes 部分依据当前官方 Service、EndpointSlice 与 probe 文档。EndpointSlice 自 Kubernetes 1.21 为 stable；文中不假设某个云负载均衡或 gateway 厂商的默认行为。

## 1. 一次外部请求可能经过哪些层

```mermaid
flowchart LR
    B["Browser"] --> DNS["DNS"]
    DNS --> EDGE["CDN / WAF"]
    EDGE --> LB["L4/L7 Load Balancer"]
    LB --> GW["API Gateway"]
    GW --> SVC["Service / discovery"]
    SVC --> P["Ready application instance"]
```

不是每套系统都需要所有层。重要的是明确当前部署中谁负责：

- public IP/TLS certificate；
- WAF/DDoS 与 body/header 上限；
- host/path/method 路由；
- authentication 和粗粒度 authorization；
- rate limit、deadline/retry；
- endpoint discovery/load balancing；
- trace/request identity；
- response transformation/caching。

同一功能在 CDN、gateway、mesh 和应用重复配置，行为会叠加而非自动去重。

## 2. DNS 只解决名称到地址，不理解业务 route

DNS 将 hostname 解析为 IP/CNAME。resolver、OS、JVM、proxy 都可能缓存结果，更新受 TTL 与实现影响。DNS 不能按 `/api/orders` 路由，也不判断 bearer token。

Kubernetes 内部 DNS 可以把 Service 名称解析到 ClusterIP；headless Service 则可返回 ready endpoint IP，让 client 自己选择。Pod IP 是短暂的，不应硬编码进应用配置。

DNS failover 不是瞬时切换：已有连接、resolver cache、negative cache 与 TTL 都影响传播。

## 3. L4 与 L7 负载均衡

- Layer 4 根据 IP/port/TCP/UDP 转发，不理解 HTTP path/body；
- Layer 7 理解 HTTP host/path/method/headers，可终止 TLS、route、redirect 或修改 headers。

API Gateway 通常处于 L7，面向 API consumer，承载 API-specific policy。普通 load balancer 重点是把连接/请求分发到健康 backend。产品能力可能重叠，但架构文档仍要写清逻辑责任。

## 4. Gateway、Ingress 与 Service 不应混称

在 Kubernetes 语境中：

- Service 暴露一组 backend endpoints 的稳定网络抽象；
- Ingress 通过规则暴露 HTTP/HTTPS，具体能力由 controller 实现；
- Gateway API 是更具角色和可扩展性的网络 API 家族；
- API Gateway 是更广泛的架构角色，可能运行在集群内外，也可能由 Ingress/Gateway controller 产品实现。

“我们用了 Ingress，所以自动有 OAuth、tenant 限流和 API version policy”并不成立，要核对 controller 与配置。

## 5. 路由合同需要确定性

常见匹配输入：scheme、host、port、path、method、headers。规则重叠时要定义优先级。

示例选择相同 host 下最长 path prefix：

```text
/api/         → general
/api/orders/  → orders

/api/orders/o-100 应选择 orders
```

<<< ../../../examples/python/backend-gateway-discovery/gateway_learning/gateway.py{164-174}

route config 应拒绝完全重复 identity，保留稳定 `route_id` 用于 metrics。要防止 `/api/order` 误匹配 `/api/orders`，明确 trailing slash、URL decoding、case 和 normalization 在哪一步发生。

## 6. Gateway 不是业务聚合垃圾场

适合 gateway 的横切逻辑：TLS、routing、协议边界、认证、粗粒度 policy、request limits、observability。

“VIP 用户订单折扣”“库存状态转换”等 domain rule 应由 owner service 维护。把业务流程堆进 gateway 会导致发布耦合、测试困难和绕过入口时规则失效。

需要为 Web/mobile 定制聚合时可使用 BFF，但 BFF 仍是有 owner、API 合同、deadline 和测试的应用服务，不等于在 gateway 配置里写任意业务脚本。

## 7. Authentication 与 authorization 的责任分层

Gateway 可验证 token signature、issuer、audience、expiry，拒绝明显无效请求；后端仍需做 resource-level authorization：Alice 是否能读取订单 o-100。

只在 gateway 验证身份而后端完全信任所有网络请求，意味着任何能绕过 gateway 访问后端的人都能伪造身份。应组合：

- 后端只接受受控网络/mesh 身份；
- gateway 删除外部 identity headers；
- 验证 bearer token 后重新注入受信 claims，或将 token 继续传给后端复验；
- service-to-service 使用独立 workload identity/mTLS；
- 后端按 tenant/resource 再授权。

## 8. Bearer token 为什么必须减少传播

RFC 6750 的 bearer 语义是持有者即可使用。token 进入日志、错误页、query 或不需要它的服务都会扩大泄漏面。

Gateway 终止外部 token 后，可以向内部传递最小、完整性受保护的 identity context；也可按 zero-trust 模型让后端验证原 token。选择要明确 trust boundary，不能无签名地相信任意 `X-User-Id`。

示例会删除客户端提供的身份 headers 和 Authorization，再用验证结果注入：

<<< ../../../examples/python/backend-gateway-discovery/gateway_learning/gateway.py{199-224}

教学 token map 不是 JWT/OAuth 实现；生产使用成熟 OIDC/JWT library，并校验 algorithm confusion、JWKS refresh、issuer/audience/time/nonce 等合同。

## 9. Forwarded/X-Forwarded-For 是信任链问题

外部 client 可以自己发送：

```http
X-Forwarded-For: 127.0.0.1
X-User-Id: admin
```

因此后端不能直接取最左 IP。只有直接 peer 是已配置 trusted proxy 时，才考虑它传来的 chain；从靠近应用的一端移除已知 trusted hops，第一个不受信地址才是候选 client IP。

<<< ../../../examples/python/backend-gateway-discovery/gateway_learning/gateway.py{176-197}

trusted hop 数/CIDR 必须匹配真实拓扑。过宽信任整个内部网段也有风险。RFC 7239 标准化 `Forwarded`，现实中 `X-Forwarded-*` 很常见；具体 proxy append/replace 行为要实测。

client IP 只能作为风控信号，不是可靠用户身份：NAT、IPv6 privacy、mobile network 和代理都会改变它。

## 10. 服务发现解决实例动态变化

Deployment 扩缩容、滚动升级和故障重建使 Pod 地址不断变化。调用者需要稳定 service identity 与动态 endpoint set。

两类实现：

- server-side discovery：client 调稳定 VIP/proxy，由它选择 backend；Kubernetes ClusterIP 常属于此思路；
- client-side discovery：client 从 registry/DNS/API 获取 endpoints 并自己负载均衡；headless Service/gRPC resolver 可属于此思路。

client-side 能做 zone/latency-aware 和 per-endpoint breaker，但每种语言 client 都要正确处理 watch、cache、stale、dedup、rebalance。server-side 简化 client，但增加 proxy hop/控制组件。

## 11. Kubernetes Service 与 EndpointSlice 的因果链

```text
Deployment creates Pods
→ Service selector matches Pods
→ control plane updates EndpointSlices
→ service proxy/load balancer sees ready endpoints
→ request routes to one endpoint
```

EndpointSlice 记录 address、port、ready/serving/terminating、zone 等。官方文档提醒 slice 更新期间 endpoint 可能暂时重复，直接消费 API 的 client 要聚合并 deduplicate，不能把每个 slice 当完整列表。

示例 registry 只选择 ready endpoint：

<<< ../../../examples/python/backend-gateway-discovery/gateway_learning/gateway.py{90-116}

真实 Kubernetes 不需要业务应用自己手写这个 registry；模型用于解释 endpoint set 为什么不同于 service 名称。

## 12. readiness、liveness 与 startup probe

- startup：应用是否完成启动；成功前可抑制 liveness/readiness；
- readiness：当前能否接收正常流量；失败时从 Service ready endpoint 中摘除；
- liveness：进程是否陷入无法自行恢复的状态，需要重启。

常见错误是 liveness 检查远程数据库。数据库短暂抖动 → 所有 Pod liveness 失败 → 同时重启 → 剩余容量更小 → 级联故障。

readiness 也不能无脑依赖所有可选下游：推荐服务失败不一定要让订单 API 摘除。检查“这个实例能否履行核心请求”，并设置合理 timeout/threshold。

## 13. ready 不代表每个请求一定成功

health 是采样的近似状态。probe 成功后实例下一毫秒仍可能崩溃；endpoint 摘除也有传播时间，已有 keep-alive/in-flight request 仍存在。

所以 client 仍需 deadline、有限 retry/connection handling。反过来，不能因为 client 有 retry 就把不健康 endpoint 一直留在池中。

## 14. graceful shutdown 与 connection draining

滚动发布时理想顺序：

```text
mark not ready
→ endpoint update propagates
→ stop accepting new work
→ drain in-flight within deadline
→ close resources and exit
```

实际平台 termination 流程、preStop、grace period、load balancer deregistration 和 app signal handling 要联合测试。仅 sleep 固定秒数不能证明 endpoint 已传播。

长连接/WebSocket/streaming 还需 reconnect/resume 合同；无限 drain 会阻止发布完成。

## 15. 负载均衡算法影响尾延迟

round-robin 假设 endpoints 相近；least-request 更适合请求成本不同；consistent hashing 可保持 key affinity；zone-aware 优先本区减少延迟/费用。

sticky session 会降低均衡与故障切换能力，不能用来弥补 server 把 session 只放进本机内存。需要 affinity 时写清 key、rebalance、热点与 endpoint 消失行为。

示例用 ready endpoints round-robin，故意保持简单：

<<< ../../../examples/python/backend-gateway-discovery/gateway_learning/gateway.py{109-116}

## 16. control plane 与 data plane

- control plane 产生 route、endpoint、certificate、policy 与 config；
- data plane 在每个请求上执行当前 snapshot。

control plane 暂时不可用时，data plane 通常应继续使用 last-known-good，而不是所有请求立即停止。反过来，过旧配置也有安全风险，需要 staleness/expiry/kill switch policy。

配置发布不应逐字段原地修改：route 已更新但 timeout/auth policy 尚未更新会出现中间状态。应验证完整 candidate，原子切换 immutable snapshot。

## 17. 配置快照为何需要 version 与 validation

示例 ConfigManager：

<<< ../../../examples/python/backend-gateway-discovery/gateway_learning/gateway.py{38-87}

它检查 path、timeout、duplicate route、CIDR 和单调 version；candidate 全部有效才替换 current。无效 version 2 被拒绝后，请求继续使用 version 1。

真实系统还需 schema、cross-field/reference 校验、signature/authorization、canary、ack/nack、rollback、审计和配置年龄 metrics。

## 18. static、启动时与动态配置

- build-time：编译进 artifact，变更需重新构建；
- startup-time：env/file/secret，重启后生效；
- dynamic：watch/push/poll，运行中切 snapshot。

不是所有参数都适合动态。DB driver、线程模型等变化可能需要重建资源；半更新对象会泄漏连接。动态配置 handler 应显式支持原子重建、失败 rollback。

feature flag 是一种动态决策配置，也要有 owner、expiry、targeting、默认值和删除计划。flag service 故障时采用 cached/default 哪个值，涉及业务安全。

## 19. ConfigMap 与 Secret 的边界

Kubernetes ConfigMap 用于非机密配置；Secret 用于 password、OAuth token、SSH key 等敏感数据。但 Secret 对象不是“自动绝对安全”：还需 etcd encryption at rest、RBAC、最小挂载、rotation、审计和避免日志/env dump。

Secret 值 base64 表示不等于加密。只把 Secret mount 给需要的 container，应用不要在启动日志打印整个 environment/config。

ConfigMap/Secret 作为 env 注入通常不会让现有进程环境自动变化；volume 更新、watch 与应用 reload 行为要按平台方式验证。

## 20. route/config rollout 也是发布

路由错误能把所有流量指向错误 service，比单个应用 bug blast radius 更大。应执行：

- schema/static validation；
- route overlap/shadow analysis；
- dry-run 与 fixture requests；
- 少量 gateway/region canary；
- metrics/log diff；
- 自动/人工 rollback；
- config version 与 commit/change ticket 可追踪。

不要一次对全部实例同时 reload 无验证配置；也不要让不同实例永久停留不同 version 而无法观测。

## 21. Gateway retry 与上一课的放大

gateway 可能因 upstream connect failure retry 另一个 ready endpoint。但应用 SDK/mesh 也可能 retry。

写请求 timeout 是 unknown outcome；gateway 不了解 domain idempotency 时不应随意重放。route policy 要按 method/operation 定义 maxAttempts、per-attempt timeout、overall deadline、retryable conditions 和 budget。

504 表示 gateway 等 upstream 超时，不证明 upstream 没有提交。

## 22. 完整教学实现

<<< ../../../examples/python/backend-gateway-discovery/gateway_learning/gateway.py

模型执行：

```text
read immutable config snapshot
→ choose most specific route
→ choose ready endpoint
→ remove untrusted identity/forwarding headers
→ validate bearer token
→ inject trusted identity
→ derive client IP from trusted proxy chain
→ build bounded upstream request
```

它不实现 TLS/JWT、HTTP proxy、DNS、Kubernetes watch 或真实 load balancing，仅让安全与配置因果链可测试。

## 23. 自动化测试

<<< ../../../examples/python/backend-gateway-discovery/tests/test_gateway.py

八项测试覆盖：

- longest path route；
- client 伪造 identity 被删除；
- untrusted peer 的 X-Forwarded-For 被忽略；
- trusted proxy chain 找到第一个 untrusted client；
- not-ready endpoint 不再被选择；
- 没有 ready endpoint 快速失败；
- 认证失败优先于 backend availability，避免泄漏内部健康状态；
- invalid dynamic config 保留 last-known-good。

## 24. 运行示例

<<< ../../../examples/python/backend-gateway-discovery/pyproject.toml

```bash
cd examples/python/backend-gateway-discovery
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[test]'
python -m pytest
```

## 25. Vue / JavaScript 对照

- Vue app 只知道 public origin，不应保存 Pod/instance URL；
- Vite env 是 build-time replacement，改 ConfigMap 不会自动改变已下载 JS；
- BFF 可把多个内部 API 合成前端模型，但不能把长期 token 放浏览器可读配置；
- 浏览器不能信任/设置内部 `X-User-Id`，身份来自 token/session 验证；
- 401 表示需要认证，403 表示无权，502/503/504 要呈现不同重试体验；
- route rollout 时旧前端与新 API 并存，API backward compatibility 不能靠“同时发布”；
- WebSocket endpoint 切换要设计 reconnect、resume cursor 和 sticky 边界。

## 26. 可观测性

每层记录自己的 span/metrics，并传播 W3C Trace Context 等标准上下文：

- DNS/connect/TLS/gateway/upstream timing；
- route_id、config version、cluster、selected endpoint；
- auth outcome，不记录 token；
- response flags：no route/no healthy upstream/timeout/reset；
- endpoint ready/serving/terminating 与变化传播时间；
- per-endpoint request/error/latency，避免只看 service aggregate；
- config accepted/rejected/stale/rollback；
- XFF/trusted proxy parse error；
- certificate/JWKS/secret expiry。

不要信任外部 request id 作为唯一内部标识；可保留外部值用于关联，同时生成/校验内部 trace/request id，限制长度与字符防日志注入。

## 27. 工程检查清单

- 画出真实 DNS/CDN/LB/Gateway/Service/mesh/app 路径；
- TLS termination、route、auth、rate/retry owner 唯一明确；
- route precedence、normalization、rewrite 和 overlap 有测试；
- gateway 横切职责与 domain business rule 分离；
- 外部 identity headers 被删除，再从验证结果注入；
- backend 不能被未授权路径绕过 gateway trust boundary；
- bearer token 最小传播，日志/query 不泄漏；
- Forwarded/XFF 只信任明确 peer/hops/CIDR；
- Service/EndpointSlice 使用 ready endpoints 并处理更新/重复；
- startup/readiness/liveness probe 语义不混淆；
- liveness 不因共享下游抖动触发全体重启；
- graceful shutdown 与 endpoint propagation/in-flight drain 联测；
- load-balancing 算法符合请求成本、zone 与 affinity；
- data plane 能使用有界 last-known-good；
- config candidate 完整 validation 后原子切 snapshot；
- config version、canary、ack、rollback、staleness 可观测；
- ConfigMap 不放 secret，Secret 有 RBAC/encryption/rotation/最小挂载；
- gateway retry 不与 SDK/mesh 相乘，不误重放写请求；
- response/trace 能定位失败发生在哪一层。

## 28. 本课结论

- DNS、load balancer、Gateway、Service discovery 与应用是不同层，能力重叠不等于责任可以含糊。
- Gateway 把不可信外部请求转换成受约束内部请求，但后端仍拥有 resource authorization。
- 客户端可伪造 XFF/identity headers；只有 trusted proxy chain 与重新注入的身份可作为内部上下文。
- Kubernetes Service 提供稳定抽象，EndpointSlice 维护动态 endpoints，readiness 决定正常流量候选。
- liveness 用于不可自愈进程，readiness 用于是否接流量；错误探针会制造级联重启。
- control plane 发布配置，data plane 执行 immutable snapshot；无效更新应保留 last-known-good。
- ConfigMap 用于非机密配置，Secret 仍需 encryption、RBAC、rotation 与防日志泄漏。
- route/config 变更具有全局 blast radius，应像代码一样验证、canary、观测和 rollback。

下一节：微服务边界与演进——为什么“按技术层拆服务”会制造分布式耦合，如何用业务能力、数据所有权、团队认知负荷和变化模式选择 modular monolith 或 microservices，并安全迁移。

## 29. 参考资料

- [Kubernetes：Service](https://kubernetes.io/docs/concepts/services-networking/service/)
- [Kubernetes：EndpointSlices](https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/)
- [Kubernetes：Liveness、Readiness 与 Startup Probes](https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/)
- [Kubernetes：Gateway API](https://kubernetes.io/docs/concepts/services-networking/gateway/)
- [Kubernetes：ConfigMaps](https://kubernetes.io/docs/concepts/configuration/configmap/)
- [Kubernetes：Secrets good practices](https://kubernetes.io/docs/concepts/security/secrets-good-practices/)
- [RFC 7239：Forwarded HTTP Extension](https://www.rfc-editor.org/rfc/rfc7239.html)
- [RFC 6750：OAuth 2.0 Bearer Token Usage](https://www.rfc-editor.org/rfc/rfc6750.html)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
