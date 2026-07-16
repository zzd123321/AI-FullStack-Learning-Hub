---
title: 前端支付、结算与高风险交易交互架构
description: 系统掌握支付状态机、金额精度、幂等、支付组件、回跳、Webhook 最终一致性、风控验证、退款与生产治理
---

# 前端支付、结算与高风险交易交互架构

“点击支付 → 请求成功 → 显示支付成功”是一条危险的直线。真实支付可能要求跳转钱包、3-D Secure 验证、异步银行处理、人工风控、延迟通知、部分退款，甚至出现浏览器断网但银行已经扣款。前端既不能决定金额，也不能把一次 HTTP 响应当作资金最终事实。

本课从交易边界出发，把购物车、订单、支付尝试、资金状态和履约分离，建立可重试、可恢复、可审计的高风险交互模型。示例保持支付供应商无关；接入具体 PSP 时，应使用其官方 SDK、服务端库和当前集成指南。

## 学习目标

- 区分报价、订单、支付意图、支付尝试、扣款、退款与履约；
- 用最小货币单位表达金额，避免浮点和客户端定价；
- 理解支付是服务端事实驱动的异步状态机；
- 正确设计幂等键、防重复提交和未知结果恢复；
- 选择托管支付页、嵌入组件或原生表单的安全边界；
- 处理 3DS/SCA、钱包跳转、回跳与页面恢复；
- 以验签 Webhook 和主动查询完成最终一致性；
- 处理退款、撤销、拒付、离线支付和库存竞争；
- 建立可访问交互、测试、观测、对账与事故响应。

## 一、先拆开领域对象

```text
Cart / Quote：用户当前选择与短期价格快照
Order：商家承诺销售什么、应收多少、履约给谁
Payment：为某订单收取某金额的生命周期
Payment Attempt：某种支付方式的一次确认尝试
Charge / Transaction：支付网络中的资金记录
Refund：对已收资金的反向操作
Fulfillment：发货、开通服务或发放权益
```

这些对象不能用一个 `paid: boolean` 代替。一个订单可能有多次失败尝试、一次成功扣款和两次部分退款；一次支付也可能先授权、后捕获。订单状态与支付状态相关，但不是同一个状态机。

前端只展示服务端投影，例如 `order.paymentSummary`。支付供应商对象、密钥、内部风控原因和完整持卡人数据不应直接成为页面 store。

## 二、信任边界：浏览器只能提出意图

浏览器可以提交：订单 ID、选中的配送方式、优惠码、支付方式 token 和一次操作 ID。浏览器不能决定：最终单价、折扣、税费、运费、币种、库存、收款账户或是否履约。

服务端创建支付前应重新读取商品和订单，校验订单所有者与版本，重新计算应付金额，并把金额、币种、订单 ID 绑定到支付对象。即使 DevTools 把 `amount: 9900` 改成 `1`，服务端也只能按可信订单收费。

发布到浏览器的 publishable key 或 client secret 不是服务端 secret，但仍属于限定用途的敏感能力：只能交给对应用户，不放入 URL、日志、分析事件或错误上报。

## 三、金额不是 JavaScript number

`0.1 + 0.2 !== 0.3` 是二进制浮点表示的结果。金额计算还涉及币种小数位、舍入规则、税费分摊和负数语义，不能靠 `toFixed(2)` 修补。

<<< ../../../examples/frontend/payment-checkout-architecture/money.ts

示例只接受长度受限、币种格式明确的非负十进制字符串，转换成 `bigint` 最小单位，并拒绝多余小数位。币种的小数位必须来自后端维护的 ISO 4217/支付渠道元数据；不能假定所有币种都是两位，也不能由用户输入 `fractionDigits`。

前端可用 `Intl.NumberFormat` 做本地化展示，但计算、比较和 API 合同都使用 `{ currency, minor }`。服务端定义税费舍入和分摊规则，并保存每个订单行的计算结果，保证退款与财务对账能够复现。

## 四、报价、订单与价格漂移

结算页加载时得到的是带版本和过期时间的 quote。创建订单/支付时，服务端使用 quote ID 或 order version 做乐观并发检查：商品改价、优惠失效、运费变化或库存不足时，返回新的明确报价，让用户确认，而不是静默多收。

按钮旁的金额只是展示。最终确认对话应显示服务端最新的商品、币种、总额、周期性收费条件和收款主体。订阅还要明确试用、续费周期、取消方式与未来价格语义。

## 五、支付状态机，而不是 loading 布尔值

常见领域投影可以包括：

```text
idle → creating → requires_method → requires_action
                         ↘ processing → paid
                         ↘ failed / canceled
paid → refunded（真实系统还可能有 partially_refunded / disputed）
```

<<< ../../../examples/frontend/payment-checkout-architecture/payment-state.ts

`requires_action` 表示需要 3DS、钱包授权或其他客户动作；`processing` 可能持续数秒到数日。`failed` 必须区分“可换支付方式”“可重试”“订单已失效”；取消也不一定能撤回已进入清算的支付。

示例只接受更高服务端版本的快照，防止慢响应把 `paid@4` 覆盖回 `processing@3`。版本由自己的支付服务生成；不能假设第三方 Webhook 有序到达。

## 六、一次订单，一个可复用支付对象

创建支付对象后把 provider payment ID 绑定到订单。用户刷新、回退或重新打开页面时优先读取并复用，而不是每次点击都新建。换支付方式通常是同一支付生命周期的新 attempt，不等于新订单。

若业务允许拆单、多币种、分期或组合支付，应显式建模多个 payment allocation，并约束它们与订单应收的关系，不能靠前端把多个“成功”相加决定履约。

## 七、幂等解决的是重复执行

用户双击、移动网络重试、代理超时和页面恢复都可能重复 POST。每个“创建本订单支付”的逻辑操作生成稳定 `operationId`；同一次操作的所有重试复用它，不同操作使用新 ID。

<<< ../../../examples/frontend/payment-checkout-architecture/checkout-client.ts

服务端幂等记录至少绑定：认证主体、endpoint、operation ID、请求规范化摘要、响应/资源 ID 和有效期。相同 key 但参数不同必须冲突失败，不能复用旧响应；数据库唯一约束负责并发竞态，不能只在内存 Map 中先查后写。

浏览器到商家服务端、商家服务端到 PSP 是两个幂等边界。后端还应以订单/支付 ID 派生或持久化上游幂等键。不要把一次随机 key 每次重试都重新生成，那只是重复请求标识，不是幂等。

## 八、防重复点击不等于幂等

提交后禁用按钮可以改善体验，却不能防多 tab、刷新、超时重试和恶意请求。按钮锁只负责当前 UI；服务端幂等、订单状态约束和数据库唯一性才保证资金操作至多创建一次。

提交中显示明确金额与阶段，并保留取消导航提示。网络超时后的文案应是“正在确认支付结果”，不是“支付失败，请再次支付”，因为结果可能未知。

## 九、三类支付页面集成

| 方式 | 卡数据进入商家页面/系统 | 优点 | 主要成本 |
| --- | --- | --- | --- |
| PSP 托管跳转页 | 通常不进入 | 边界清晰、合规面较小 | 跳转与品牌体验 |
| PSP 托管 iframe/Elements | 字段由 PSP 托管 | 体验可组合 | 宿主页脚本仍影响支付安全 |
| 商家自建卡表单/API | 可能进入 | 最大控制 | PCI 范围与泄漏风险显著增加 |

优先使用经过验证的 PSP 托管页面或托管字段，不自行读取 PAN、CVV。视觉上像普通 `<input>` 不代表数据边界相同；必须确认 DOM、网络目标、日志、录屏和监控 SDK 是否可能接触卡数据。

PCI SSC 对嵌入式支付页也强调脚本授权、完整性、清单和篡改检测。是否符合某个 SAQ 不能由前端团队自行宣称，应与收单机构、支付品牌和合规负责人确认。

## 十、支付页面的脚本供应链

支付页是 e-skimming 的高价值目标。应减少第三方脚本，建立脚本 owner/用途/版本清单；使用严格 CSP、可信加载源、SRI（适用时）、Trusted Types（适用时）、依赖锁定、变更审核和篡改监测。

会话回放、热图、客服插件、A/B 测试与错误采集默认禁止读取支付 iframe 周边敏感字段。CSP 不能替代 PSP 托管边界，也不能保证已允许的恶意脚本安全。

## 十一、SCA、3DS 与额外动作

欧洲等地区和支付网络可能要求强客户认证。前端不能通过 BIN、地区或金额自行断言“不会 3DS”；创建/确认支付后，根据 PSP 返回的 `requires_action` 使用官方 SDK 完成挑战。

挑战可能弹层、iframe 或顶层跳转，用户也可能取消、超时或验证成功后浏览器断网。组件必须支持焦点管理、键盘操作、屏幕阅读器提示、窄屏和长时间等待，不在挑战期间错误销毁支付实例。

支付认证不是站点登录。recent login、MFA、3DS、passkey 和支付网络授权分别证明不同事情，不应互相替代。

## 十二、回跳地址不是成功证明

钱包或 3DS 完成后浏览器可能回到 `/pay/return`。查询参数完全受用户控制，攻击者可以手写 `?success=true`；回跳丢失也不代表支付失败。

<<< ../../../examples/frontend/payment-checkout-architecture/return-contract.ts

回跳页只做三件事：校验一次性 transaction state、提取格式受限的 opaque payment ID、向自己的服务端查询。服务端再校验当前用户能否读取该订单，并从数据库/PSP 对账获得状态。

return URL 使用固定 allowlist，敏感 client secret 不进入地址栏。处理完回跳参数后用 `history.replaceState` 清理，避免 referrer、历史记录、截图和分析工具泄漏。

## 十三、浏览器响应也不是最终账本

SDK `confirm()` 返回 succeeded 可以立即改善 UI，但订单履约仍以可信服务端状态为准。浏览器可能被篡改、响应可能丢失，某些支付方式本来就是异步。

推荐事实流：

```text
浏览器确认支付 ─┐
                 ├→ PSP
PSP 签名 Webhook ─→ 支付服务更新数据库 → 订单/履约 outbox
浏览器轮询/SSE ───→ 读取商家数据库中的支付投影
定时对账任务 ─────→ 修复丢失事件或长期 processing
```

“前端成功页面”是服务端事实的展示，不是触发发货或发权益的命令。

## 十四、Webhook：验签、去重、乱序

Webhook handler 应在原始 request body 上使用 PSP 官方库验签，并校验时间容差、endpoint secret 和环境。解析 JSON 后再重建字符串会破坏签名语义。测试与生产 secret 分开并支持轮换。

事件至少一次投递且可能乱序、重复。处理器以 provider event ID 去重，在数据库事务中更新支付聚合并写 outbox；未知对象主动向 PSP 查询。不能看到 `payment_succeeded` 就按前端传来的 order ID 发货。

快速持久化后返回 2xx，耗时履约异步执行。失败进入可观测重试和 dead-letter/reconciliation 流程。事件去重不等于业务幂等：履约操作也需要以 order/payment 唯一键约束。

## 十五、主动查询与最终一致性

回跳后先读取自己的服务端；状态仍 processing 时有限轮询，后台 Webhook 最终更新。轮询应退避、有上限、支持 AbortSignal，并在页面隐藏/离开时停止。

<<< ../../../examples/frontend/payment-checkout-architecture/reconciliation.ts

达到上限不是失败，而是“仍在处理中”：给出订单入口、通知承诺和客服参考号。页面恢复、`pageshow`、重新获得网络或用户主动刷新时再次对账。SSE/WebSocket 能降低延迟，但仍不能替代查询和后台对账。

## 十六、未知结果是一级状态

请求超时包含三种可能：服务端未收到、已收到但 PSP 未处理、已经扣款但响应丢失。此时不能自动创建新支付，也不能立即告诉用户失败。

用同一 operation ID 重试创建/确认，或按订单读取已有 payment。页面显示“正在确认，请勿重复支付”，并允许安全离开。客服后台也应按订单、支付 ID、时间与金额查询，而不是要求用户盲目再付一次。

## 十七、授权与捕获

部分行业先 authorize 冻结额度，发货时 capture。授权成功不等于资金已结算；授权可能过期、部分捕获或被撤销。前端要展示“已授权/待确认”而不是“已付款”，库存和履约策略由业务决定。

捕获是服务端高风险命令，需要订单状态、金额上限、幂等、权限和审计。不要把 provider capture API 暴露给浏览器。

## 十八、退款、撤销与拒付

退款是新资金操作，不是把 payment 状态改回 failed。它可能 pending、failed、partial，并有多笔退款；币种、可退余额和手续费规则由服务端计算。

退款按钮需要权限、recent authentication、原因、确认金额、幂等键与审计。UI 对“提交退款”和“退款到账”使用不同状态。拒付/dispute 是独立流程，可能在支付成功很久后发生，不能抹掉原始交易历史。

## 十九、库存、优惠与支付竞争

支付成功但库存已卖完会造成昂贵补偿。根据业务选择：短期库存预留后支付、先支付后可靠退款，或支付授权后确认库存再捕获。每种方案都有超时清理与补偿任务。

优惠券使用次数、礼品卡余额和积分扣减也需要事务/预留/幂等，不能只在前端禁用。订单保存定价快照，支付只收订单应收，不重新解释购物车。

## 二十、保存支付方式与订阅

“保存卡”需要明确同意、用途和未来 on-session/off-session 语义。使用 PSP 的 setup/mandate 流程保存 payment method token，不保存 PAN/CVV。未来离线扣款可能失败并要求用户重新认证，产品必须有通知和恢复路径。

订阅状态由 invoice、payment、subscription 多个对象共同决定。试用结束、续费失败、宽限期、暂停和取消是服务端订阅领域，前端不能仅凭最近一次 charge 判断权益。

## 二十一、Payment Request 与数字钱包

Payment Request API 提供浏览器级支付方式选择体验，不是新的清算网络，也不替代 PSP、服务端订单、幂等或 Webhook。它要求安全上下文，而且当前并非所有主流浏览器都支持，必须提供普通结算回退。

`show()` 通常要求用户激活并受并发限制。`canMakePayment()` 只能作为渐进增强信号，不能用来推断用户财务能力、支付一定成功或隐藏所有其他方式。

## 二十二、错误分类与文案

- 用户可修复：卡信息、余额、认证取消——保留订单并允许换方式；
- 临时技术错误：网络、PSP 5xx——以同一幂等键恢复并查询；
- 业务冲突：价格/库存/订单版本变化——展示新报价并重新确认；
- 风控拒绝：只显示可公开的通用文案，不泄漏规则；
- 永久配置错误：币种/商户能力——停止重试并告警；
- processing/unknown：明确“未确认”，不归类为失败。

不要把 provider decline code 原样展示，也不要把“付款失败”与“订单取消”绑定。错误对象进入日志前要移除卡数据、client secret、钱包 payload 和个人信息。

## 二十三、可访问性与交互细节

支付总额、币种、周期、错误和 processing 状态要有文本，不只靠颜色或 spinner。错误与对应字段建立程序化关联，提交失败后焦点移到错误摘要；异步状态用克制的 live region 通知。

不要用短倒计时制造无障碍障碍；若库存预留会过期，要提供延长/恢复机制。防重复提交时保留按钮标签和状态说明，避免简单 `disabled` 让读屏用户失去上下文。跳转回来后恢复到订单状态标题，而非重新聚焦支付按钮。

## 二十四、测试策略

金额、版本快照和回跳合同可以纯逻辑测试：

<<< ../../../examples/frontend/payment-checkout-architecture/payment-logic.test.mts

还应覆盖：

- 同一 operation ID 的并发请求只创建一个支付；
- 同 key 不同 body 返回冲突；
- 断网发生在请求前、处理后、响应中三个窗口；
- requires_action 成功、取消、超时、回跳丢失；
- Webhook 验签失败、重复、乱序、延迟和未知对象；
- processing 长时间停留及主动对账修复；
- 部分退款、重复退款、授权过期和捕获冲突；
- 多 tab、刷新、后退、bfcache 和账号切换；
- CSP、第三方脚本、日志脱敏和支付组件可访问性；
- PSP test mode 的失败卡、3DS、异步支付和 webhook 重放。

单元 mock 不能证明真实钱包、浏览器跳转、第三方 iframe、签名或支付网络状态。预发布环境使用 PSP 官方测试工具和契约，生产用小额/受控验证与对账监控。

## 二十五、可观测性、审计与对账

使用不含秘密的关联标识串联 `checkoutSessionId/orderId/paymentId/attemptId/providerEventId/operationId`。指标包括支付创建、认证转化、processing 时长、未知结果、重复拦截、Webhook 延迟/失败、对账差异、退款和各支付方式成功率。

日志禁止记录 PAN、CVV、磁道数据、完整钱包 payload、client secret、provider secret 和未经治理的个人资料。金额日志包含币种和最小单位；错误日志保留稳定内部 code，而不是供应商敏感原文。

每日/近实时对账比较商家订单账本、PSP 交易与财务结算。自动修复必须有边界；金额差异、重复成功、孤立交易、长期 processing 和履约不一致进入人工队列与告警。

## 二十六、常见失败模式

1. 使用浮点计算金额；2. 接受前端提交的最终总价；3. `paid: boolean` 表达全部生命周期；4. 每次重试生成新幂等键；5. 禁用按钮当作防重复扣款；6. 回跳 `success=true` 就发货；7. 浏览器 SDK 成功就直接发权益；8. Webhook 不验签或依赖顺序；9. processing 当失败并催用户重付；10. 自建卡输入却忽略 PCI；11. 支付页加载任意分析脚本；12. 退款直接覆盖原交易；13. 403/风控原因原样暴露；14. Payment Request 当作唯一入口；15. 日志记录 client secret 或支付 payload。

## 二十七、渐进落地路线

先建立服务端订单定价、整数金额和一个订单一个支付对象；再加入双层幂等、托管支付组件、明确状态机和回跳查询；随后建设验签 Webhook、outbox、有限轮询、退款与库存补偿；最后完善脚本治理、SCA/钱包、对账、风控、可访问性和事故演练。

## 二十八、上线检查清单

- [ ] 订单、支付、attempt、charge、refund 与履约对象分离；
- [ ] 金额使用可信服务端定价、币种和最小单位，未使用浮点；
- [ ] order version/quote expiry 防止静默价格漂移；
- [ ] 同一订单复用支付对象，重复提交有服务端幂等与唯一约束；
- [ ] 浏览器到服务端、服务端到 PSP 两个幂等边界均已处理；
- [ ] 优先使用 PSP 托管页/字段，secret 与卡数据不进入商家前端；
- [ ] 支付页第三方脚本、CSP、完整性和篡改监测经过治理；
- [ ] requires_action、processing、unknown、failed 与 paid 明确分离；
- [ ] 回跳参数不决定成功，只向自己的服务端查询；
- [ ] Webhook 原始 body 验签、时间校验、去重、容忍乱序并快速响应；
- [ ] 履约由数据库中的可信支付事实/outbox 驱动且自身幂等；
- [ ] 超时使用同一 operation ID 恢复，不诱导重复支付；
- [ ] 轮询有退避、上限、取消与长期 processing 恢复入口；
- [ ] 退款、捕获、取消和高风险操作有权限、再验证与审计；
- [ ] 库存、优惠、积分和支付失败有预留/补偿策略；
- [ ] 日志、分析、录屏、错误上报不采集支付敏感数据；
- [ ] 多浏览器、钱包、3DS、异步支付、Webhook 和故障注入已测试；
- [ ] 支付账本、PSP 与履约有持续对账和人工异常队列。

## 总结

可靠的支付前端不是“调用收款 API 的表单”，而是一个受服务端事实约束的异步交易视图。整数金额和订单版本保护价格，稳定幂等键保护重复执行，托管组件缩小敏感数据边界，状态机表达额外认证与未知结果，验签 Webhook、查询和对账共同完成最终一致性。前端负责让用户理解和恢复交易；服务端账本才决定资金与履约。

## 参考资料

- [Stripe：Payment Intents API](https://docs.stripe.com/payments/payment-intents)
- [Stripe：PaymentIntent 与 SetupIntent 生命周期](https://docs.stripe.com/payments/paymentintents/lifecycle)
- [Stripe：Idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [Stripe：Receive events in a webhook endpoint](https://docs.stripe.com/webhooks)
- [MDN：Payment Request API](https://developer.mozilla.org/en-US/docs/Web/API/Payment_Request_API)
- [W3C：Payment Request API](https://www.w3.org/TR/payment-request/)
- [PCI SSC：SAQ A 电商脚本资格说明](https://www.pcisecuritystandards.org/faqs/1588/)
- [PCI SSC：Payment Page Security and Preventing E-Skimming](https://blog.pcisecuritystandards.org/new-information-supplement-payment-page-security-and-preventing-e-skimming)
- [European Banking Authority：SCA 与数字钱包说明](https://www.eba.europa.eu/publications-and-media/press-releases/eba-clarifies-application-strong-customer-authentication)
