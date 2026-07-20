---
title: 前端支付、结算与高风险交易交互架构
description: 从一次可能丢失响应的支付出发，理解金额、订单、支付状态机、幂等、托管组件、回跳、Webhook、履约、退款和对账
outline: deep
---

# 前端支付、结算与高风险交易交互架构

用户点击“支付 ¥199”，按钮转了几秒后浏览器断网。此时页面应该显示成功、失败，还是允许用户再付一次？

答案是：前端暂时不知道。请求可能根本没有到达商家服务端，也可能支付机构已经扣款、只是响应没能返回。如果把“HTTP 请求失败”直接翻译成“支付失败”，很可能诱导用户重复付款；如果只凭回跳地址上的 `success=true` 发货，又可能在没有收到资金时交付商品。

因此，支付前端不是一个收款表单，而是**服务端交易事实在浏览器中的可恢复投影**。本课沿着一次支付从报价、提交、额外认证、异步确认到履约和退款的过程，逐步建立这套模型。

示例不绑定某家支付服务商。生产接入必须使用支付服务商当前的官方 SDK、服务端库、测试工具与合规指南。

## 学习目标

完成本课后，你应该能够：

- 区分购物车、报价、订单、支付、支付尝试、扣款、退款与履约；
- 用最小货币单位和明确币种表达金额，避免浮点与客户端定价；
- 把服务端支付状态和本地网络请求状态分开；
- 解释稳定幂等键怎样处理双击、超时、重试与并发；
- 比较托管支付页、托管字段和商家自建表单的安全边界；
- 正确处理 3DS/SCA、数字钱包、第三方跳转和页面恢复；
- 理解浏览器响应、回跳参数与 Webhook 各自能证明什么；
- 用有限轮询、Webhook、Outbox 与对账完成异步收敛；
- 建模授权/捕获、退款、拒付、库存和订阅等后续流程；
- 建立可访问、可审计并能演练故障的支付体验。

## 先找到资金事实，而不是先写支付按钮

一个最小支付系统也包含多种领域对象：

```text
Cart（用户当前选择）
  ↓ 生成有期限的价格快照
Quote（商品、税费、运费、优惠、币种、版本）
  ↓ 用户确认
Order（商家准备销售和履约的内容）
  ↓ 关联一个可恢复的收款生命周期
Payment ── 多次 Payment Attempt ── 支付网络交易
  │
  ├── Refund / Dispute（后续资金变化）
  └── Fulfillment（发货、开通权益，不是支付本身）
```

### 为什么一个 `paid: boolean` 不够

同一订单可能第一次银行卡验证失败，第二次换钱包后进入异步处理，第三方确认成功后才允许履约；之后又发生两次部分退款。一个布尔值无法回答：

- 用户现在需要换支付方式，还是完成额外认证？
- 银行正在处理，还是商家只丢失了响应？
- 资金只是授权冻结，还是已经捕获？
- 已经退了多少，还剩多少可退？
- 商品是否已经交付，交付能否安全重试？

订单、Payment、Attempt、Refund 和 Fulfillment 应有各自的标识、状态与审计记录。它们互相关联，但不能互相覆盖历史。

### 浏览器只能表达意图

前端可以提交订单 ID、订单版本、选择的配送/支付方式和一次操作 ID。它不能决定最终单价、优惠、税费、运费、库存、收款账户和是否允许履约。

服务端创建或更新 Payment 时必须重新读取可信订单，确认当前用户或会话能操作它，验证订单版本与未支付状态，并按订单中的金额和币种调用支付服务商。浏览器即使把 DevTools 中的显示金额从 19900 改成 1，也不能改变实际应收。

页面 Store 只保存商家服务端发布的有限 Payment Snapshot。服务商密钥、完整上游对象、内部风控理由和持卡人数据不进入前端状态。

## 金额先正确，后面的状态才有意义

JavaScript `number` 使用二进制浮点，很多十进制小数不能精确表示。`0.1 + 0.2` 的问题只是表象；实际结算还包含币种小数位、税费舍入、折扣分摊、退款重算和金额上限。

### 用币种和最小单位组成金额

```text
¥19.90 → { currency: "CNY", minor: 1990 }
¥5.00  → { currency: "CNY", minor: 500 }
合计   → { currency: "CNY", minor: 2490 }
```

最小单位的小数位来自受治理的币种/渠道元数据，不能假设所有币种都是两位，也不能让用户提交 `fractionDigits` 决定解析方式。

<<< ../../../examples/frontend/payment-checkout-architecture/money.ts

示例使用 `bigint` 做内部精确运算，拒绝多余小数、负的结算输入和超出产品上限的金额。JSON 不支持 `bigint`，因此跨接口时把最小单位序列化为十进制数字字符串，再在边界重新校验。

这并不表示浏览器可以自行计算最终应收。前端金额工具适合输入预览、展示一致性检查和测试；税费、折扣分摊与最终总额仍由服务端按明确规则计算并保存快照。退款、账本借贷等允许负向语义的领域，应使用另一种有清楚正负规则的类型，而不是偷偷允许结算输入带负号。

### 报价变化要重新征得同意

结算页拿到的 Quote 应包含版本和过期时间。创建订单或 Payment 时，服务端检查 Quote/Order Version：商品改价、优惠失效、税费或运费变化时，返回新的报价让用户重新确认，不能静默按不同金额收款。

最终确认区域应该展示服务端最新的商品、币种、总额、收款主体，以及订阅的周期、试用、续费和取消条件。`Intl.NumberFormat` 只负责本地化显示，不参与金额计算；显示值必须来自同一份金额快照。

## 支付状态与请求状态必须分开

支付服务通常不是一条同步直线。一个简化的收款状态可能是：

```text
requires_method ── 用户选择方式 ──> requires_action
       ▲                                  │ 3DS / 钱包确认
       │                                  ▼
     failed <──────────────────────── processing
                                             │
                                  ┌──────────┴──────────┐
                                  ▼                     ▼
                              authorized              paid
```

不同支付服务商的原始状态不同。商家支付服务应把它们映射成自己稳定、版本化的领域投影，并明确 `paid` 在本业务中表示什么。它通常表示“已达到允许履约的收款条件”，不等于资金从此不会退款、拒付或被财务调整。

### 网络失败不是支付失败

浏览器至少同时维护两类状态：

| 状态来源 | 示例 | 能否决定资金事实 |
| --- | --- | --- |
| 本地请求 | creating、confirming、network error | 不能 |
| 服务端快照 | processing、authorized、paid、failed | 能作为 UI 的可信投影 |

如果页面已经看到 `paid@version 4`，之后一次查询超时，只能记录 transport error，不能把 Payment 改成 failed。慢到达的 `processing@version 3` 也不能覆盖较新的结果。

<<< ../../../examples/frontend/payment-checkout-architecture/payment-state.ts

示例在 JSON 进入 Store 前检查 ID、阶段、版本、币种和最小单位；Reducer 只接收同一订单、同一 Payment 的更高版本。网络错误单独保存，不修改最后一份服务端快照。

版本应由商家支付服务在持久化状态变化时单调增加。不能假设第三方 Webhook 按创建顺序到达，也不要拿浏览器请求完成顺序充当资金版本。

### unknown / processing 是正常结果

超时意味着结果未知：请求可能未发送、正在处理，或已经成功但响应丢失。UI 应显示“正在确认支付结果，请勿重复付款”，提供订单入口和客服参考号，而不是立刻显示“支付失败，请重试”。

`processing` 可能持续几秒，也可能因银行转账等方式持续数日。达到前端轮询上限只表示页面停止等待，不应该擅自把服务端状态变成 failed。

## 幂等让同一个意图能够安全重试

双击只是重复请求的一个来源。移动网络重连、反向代理超时、浏览器恢复、客户端自动重试、多标签和服务端调用支付服务商都可能重复执行。

### 一笔逻辑操作使用一个稳定 ID

用户第一次发起“为订单 42 创建或复用 Payment”时生成 `operationId`。如果结果未知，所有重试继续使用这个 ID；用户明确开始另一笔不同操作时才生成新 ID。

<<< ../../../examples/frontend/payment-checkout-architecture/checkout-client.ts

示例刻意不提交金额，只提交订单 ID、订单版本和操作 ID。Cookie Session 下同时发送 CSRF Token；响应经过运行时校验后才进入状态机。

`Idempotency-Key` 请求头来自浏览器，因此本身不可信。服务端幂等记录必须绑定：认证主体/会话、endpoint、operation ID、规范化请求摘要、已创建资源或响应，以及合理的保留期限。相同 key 配不同参数应返回冲突，而不是悄悄复用旧结果。

数据库唯一约束或等价原子机制负责两个并发请求的竞争，不能用“先在内存 Map 查询、没有就创建”冒充幂等。浏览器到商家服务端、商家服务端到支付服务商是两个独立边界；后端还要持久化上游幂等键，并把 Payment ID 绑定到 Order。

### 防双击只是体验，不是资金保证

提交时禁用按钮、显示当前金额和状态说明是正确体验，但无法阻止刷新、多标签、恶意请求或响应丢失。即使按钮已经禁用，服务端仍要幂等、检查订单状态并限制一个订单可关联的活动 Payment。

同一购物车或订单通常复用一个 Payment 对象，让它记录多次 Attempt。Stripe 的 PaymentIntent 指南也建议中断恢复时复用同一对象，并通过幂等键避免重复创建。具体服务商的对象模型不同，应映射到自己的 Order/Payment 关系，而不是把供应商对象直接变成领域模型。

## 收集支付方式时先缩小敏感数据边界

### 三种常见集成方式

| 方式 | 卡数据是否进入商家控制的页面/系统 | 主要优点 | 主要代价 |
| --- | --- | --- | --- |
| 服务商托管跳转页 | 通常不进入 | 边界清晰、集成和合规面较小 | 有页面跳转、品牌控制较少 |
| 服务商托管 iframe/字段 | 敏感字段由服务商托管 | 可组合结算体验 | 宿主页脚本仍影响安全与合规 |
| 商家自建卡表单/API | 可能进入 | 控制最多 | PCI 范围和泄漏责任显著扩大 |

优先采用服务商托管页面或托管字段，不自行读取 PAN、CVV。视觉上像普通输入框不代表数据边界相同，必须确认字段 DOM、网络目标、日志、录屏和监控 SDK 是否会接触卡数据。

PCI DSS 适用范围与 SAQ 资格取决于真实数据流和当前标准，不能由前端团队凭“用了 iframe”自行宣称。PCI SSC 自 2025 年起还对嵌入式支付页的脚本攻击保护提出了更新后的 SAQ A 资格条件；应由收单机构、合规负责人或 QSA 根据当前实现确认。

### 支付页脚本也是供应链

E-skimming 攻击不一定破解后端，它也可能篡改支付页脚本读取用户输入。支付页面应减少第三方脚本，维护 owner、用途、来源和版本清单，建立变更审批、CSP、适用时的 SRI/Trusted Types、完整性检查和篡改监测。

会话回放、热图、客服插件、A/B 测试和错误采集默认不得读取支付区域、上游 Client Secret、钱包 Payload 或个人信息。CSP 只能约束加载边界，不能保证已经允许的第三方脚本没有恶意行为。

支付服务商向浏览器暴露的 publishable key 或限定用途 Client Secret 不是服务器 API Secret，但也不应进入 URL、日志、分析事件和客服截图，并且只能交给有权操作当前 Order/Payment 的会话。

### 3DS、SCA 和站点登录不是一件事

支付确认后可能返回 `requires_action`，要求 3-D Secure、钱包授权或其他客户动作。前端应根据服务商响应调用官方 SDK，而不是根据卡号段、地区或金额自行预测“不会验证”。

挑战可能是 iframe、弹层或顶层跳转，用户可能取消、超时，也可能验证完成后断网。UI 需要保留 Payment 身份、正确恢复焦点、支持键盘和屏幕阅读器，并在挑战进行时避免组件重建。

站点 recent login、MFA、Passkey User Verification 与支付网络认证分别证明不同事情。退款权限可以要求站点再认证，实际付款仍可能需要 3DS；二者不能互相代替。

### Payment Request API 只是渐进增强

Payment Request API 让浏览器协调可用支付方式和支付 UI，不是新的清算网络，也不替代服务商 SDK、商家订单、幂等、Webhook 或服务端授权。

它只在安全上下文中可用，当前仍不是所有主流环境的 Baseline 能力。`show()` 通常要求直接由用户激活触发，文档不可见或浏览器策略也可能拒绝；调用后还要正确结束 PaymentResponse UI。`canMakePayment()` 只是能力提示，不能推断用户余额、授信或支付一定成功。

因此始终保留普通结算路径，先 Feature Detection，再把浏览器支付 UI 当作可替换入口。

## 第三方回跳只证明浏览器回来了

钱包或 3DS 完成后，浏览器可能返回 `/pay/return`。用户可以手写查询参数，攻击者也能构造 `?success=true`；用户关掉页面导致没有回跳，也不证明支付失败。

### 把回跳绑定到发起事务

开始跳转前生成高熵、一次性的 transaction state，绑定当前会话、Order/Payment、预期回跳地址和期限。回跳时先消费事务，再检查 origin、path、state 和格式受限的内部 Payment ID。

<<< ../../../examples/frontend/payment-checkout-architecture/return-contract.ts

示例拒绝重复参数和 state 不匹配，并有意忽略 `success=true` 等供应商状态文本。调用方拿到 Payment ID 后，只向自己的商家服务端查询；服务端再验证当前身份对订单的访问权，并读取数据库/支付服务商事实。

事务存储与上一课 OAuth state 的思想相同：随机值不是支付凭证，而是把异步回跳绑定到发起上下文。示例只负责解析和比较，生产调用方还要保证 state 一次消费、限时、失败也清理。

处理完成后用固定安全路由或 `history.replaceState` 清理 code、state 和临时参数，避免浏览器历史、Referrer、截图和分析工具继续携带。

### SDK 返回成功也不能直接发货

浏览器 SDK 的成功结果可以让 UI 尽快进入“正在确认”或展示最新快照，但浏览器可被篡改、响应可能丢失，很多支付方式也天然异步。发货、开通权益和发送正式收据应由服务端可信 Payment 状态驱动。

## Webhook、主动查询和对账共同收敛

推荐把事实流画成两条相遇的路径：

```text
用户页面 ── 创建/确认 ──> 商家支付服务 ──> 支付服务商
   │                          ▲                    │
   └── 查询 / SSE <── 数据库 Payment 投影 <── 签名 Webhook
                              │
                              └── Transactional Outbox ──> 幂等履约

定时对账：商家账本 <──────────────> 支付服务商交易/结算记录
```

### Webhook 先验证来源，再解释事件

Webhook Handler 使用支付服务商官方库，在**原始请求 Body**上验证签名、时间容差、正确环境和 Endpoint Secret。JSON Middleware 若先解析、重排或重新序列化 Body，可能破坏签名输入。

支付服务商可能重复、延迟或乱序投递事件。处理器需要：

1. 限制 Body 大小并完成签名/时间验证；
2. 用 Provider Event ID 做投递去重；
3. 将上游 Payment ID 映射到数据库中已有的内部 Payment/Order；
4. 按自己的状态转换规则和版本更新聚合；
5. 在同一数据库事务写入履约 Outbox；
6. 持久化必要事实后快速返回 2xx，耗时工作异步执行。

事件去重不等于业务幂等：两种不同事件都可能指向同一最终状态，履约消费者仍要以 Order/Payment 唯一键保证权益只发一次。Webhook 中未知对象、版本冲突和长期 processing 进入主动查询/人工队列，不能按事件里的任意 Order ID 直接发货。

### 页面用有限轮询获得最新投影

回跳、超时或 `processing` 后，页面立即读取商家服务端，然后按退避策略有限轮询。页面隐藏、路由离开或账号切换时使用 AbortSignal 停止。

<<< ../../../examples/frontend/payment-checkout-architecture/reconciliation.ts

示例只在 `processing` 时继续查询，最多十次，而且最后一次读取后不会无意义等待。耗尽预算返回 `still-processing`，而不是伪造 failed。页面随后可提供订单入口和通知承诺；恢复可见、`pageshow`、网络恢复或用户主动刷新时再次查询。

SSE/WebSocket 能降低等待延迟，但连接会断、消息会丢，仍需初始查询、版本快照和后台对账。

### 对账修复“所有实时路径都没成功”

Webhook 可能因配置、网络或程序错误长期失败。定时对账比较商家订单/Payment 账本、支付服务商交易和财务结算，发现孤立成功、重复资金、金额差异、长期 processing、退款差异与履约不一致。

确定、安全的差异可以自动修复；无法证明的资金差异进入人工队列。对账不是报表附属功能，而是支付系统恢复模型的一部分。

## 支付成功以后，领域仍在继续

### 授权和捕获

酒店、电商等场景可能先 Authorize 冻结额度，发货时再 Capture。`authorized` 不等于资金已经结算；授权可能过期、撤销、增额或只捕获一部分。

Capture 是服务端高风险命令，需要订单状态、可捕获上限、操作权限、recent authentication、幂等和审计。不能把服务商 Capture API 或 Secret 暴露给浏览器。

### 退款不是把 paid 改成 failed

Refund 是新的资金对象，有自己的 amount、currency、状态、operation ID 和服务商交易。一次 Payment 可以有多次部分退款；退款提交成功也不表示用户银行账户已经到账。

退款页面要展示可退余额、原因、权限和确认金额。服务端重新计算可退上限并处理并发，前端使用最小单位但不能决定最终金额。Dispute/Chargeback 又是独立生命周期，可能在支付很久后出现，不能删除或改写原交易历史。

### 库存和优惠需要补偿策略

支付成功后才发现无库存，会带来退款成本与用户投诉。常见选择包括：

- 短期预留库存，再发起支付，超时释放；
- 先授权，确认库存后捕获；
- 先收款，缺货时可靠退款和通知。

没有一种方案对所有业务最好，但都必须定义预留过期、并发唯一性、补偿任务和人工恢复。优惠券次数、礼品卡余额和积分也需要服务端事务/预留，不能靠按钮禁用。

### 保存支付方式与订阅

保存卡需要明确同意、用途和未来 on-session/off-session 语义。使用服务商的 Setup/Mandate/Payment Method Token 机制，不保存 PAN/CVV。未来离线扣款可能要求重新认证或失败，产品必须有通知与恢复路径。

订阅权益不能只看最近一次 Charge。Subscription、Invoice、Payment、试用、宽限期、暂停和取消各自有状态，最终由服务端订阅领域决定当前权益。

## 高风险页面要让用户看懂并能恢复

### 错误文案先区分事实

| 类别 | 示例 | UI 处理 |
| --- | --- | --- |
| 用户可修复 | 支付方式被拒、认证取消 | 保留订单，允许换方式 |
| 业务冲突 | 价格、库存、订单版本变化 | 展示新事实，重新确认 |
| 临时技术错误 | 网络、商家服务或 PSP 暂时不可用 | 保留 operation ID，查询并恢复 |
| 风控拒绝 | 内部策略拒绝 | 使用可公开文案，不暴露规则 |
| processing / unknown | 结果尚未确认 | 明确等待，不诱导重复付款 |
| 永久配置问题 | 商户未开通币种/方式 | 停止盲目重试并告警 |

不要把服务商原始 Decline Code、内部风控细节或敏感 Payload 直接展示。401、403 继续沿用上一课语义：会话过期与无权操作订单不是支付失败；账号切换时取消请求并丢弃旧身份 Epoch 下迟到的响应。

### 可访问性也是交易正确性

总额、币种、周期、错误和处理状态都要有文本，不能只靠颜色或 Spinner。字段错误与输入建立程序化关联；提交失败后把焦点移到错误摘要；异步变化用克制的 live region 通知。

禁用按钮时保留可读标签和“正在确认”说明。3DS/钱包返回后恢复到订单状态标题，而不是重新聚焦“支付”按钮。库存预留倒计时要允许理解、延长或恢复，不能制造键盘和认知障碍。

高风险退款、捕获、付款方式变更等操作还需要服务端权限、CSRF 防护、recent authentication 和不可抵赖审计；前端确认对话只是最后一次防误触，不是授权边界。

## 用故障注入证明不会多收或错发

### 可运行示例验证

<<< ../../../examples/frontend/payment-checkout-architecture/payment-runtime.test.ts

示例覆盖：

- 十进制金额精确转成最小单位，并限制精度与产品上限；
- `bigint` 以数字字符串进入 JSON 合同；
- Payment Snapshot 对版本、阶段、币种和金额失败关闭；
- 网络错误不会覆盖已经 paid 的服务端快照；
- 慢响应不能把高版本状态回滚；
- Checkout 同时携带稳定幂等键与 CSRF Token；
- 回跳必须匹配 origin、path 和 transaction state，`success=true` 无效；
- 轮询在两个读取之间只等待一次，耗尽后仍为 processing。

端到端和预发布环境还要使用服务商官方测试模式覆盖：

- 请求发送前断网、服务端处理后丢响应、返回途中断网；
- 同一 operation ID 并发到达，以及同 key 不同请求冲突；
- 3DS 成功、取消、超时、弹窗/回跳丢失；
- Webhook 签名失败、重复、乱序、延迟、密钥轮换和未知对象；
- 长期 processing、对账修复和幂等履约；
- 授权过期、部分捕获、多笔部分退款和重复退款；
- 多标签、刷新、后退、bfcache、账号切换与缓存隔离；
- CSP、第三方脚本篡改、日志脱敏和支付组件可访问性；
- 真实浏览器钱包能力与普通结算 fallback。

Mock 单元测试不能证明 iframe 数据边界、浏览器跳转、支付网络状态、Webhook 签名和合规范围。生产前需要真实测试账户、服务商 CLI/回放工具、生产构建与受控小额验证。

### 观测与审计不能收集支付秘密

用不含秘密的关联 ID 串联：

```text
checkoutSessionId → orderId → paymentId → attemptId
                         ├── operationId
                         └── providerEventId / providerRequestId
```

指标包括创建成功率、requires_action 转化、processing P95/P99、未知结果、幂等冲突、Webhook 延迟/失败、对账差异、履约延迟、退款和各支付方式成功率。

日志禁止记录 PAN、CVV、磁道数据、服务器 Secret、完整 Client Secret、钱包 Payload 和未经治理的个人信息。金额同时记录币种与最小单位；错误使用稳定内部 Code，不把服务商敏感原文扩散到日志和分析平台。

### 常见错误为何危险

#### 超时后生成新幂等键再付一次

旧请求可能已经成功，新 key 会创建第二笔操作。应复用原 operation ID 并先查询已有 Payment。

#### 把按钮禁用当作防重复扣款

它只约束当前 DOM，无法覆盖刷新、多标签和服务端重试。资金唯一性必须由服务端持久化约束保证。

#### 回跳或 SDK 成功就发权益

浏览器输入可伪造且异步状态可能继续变化。履约由数据库中的可信 Payment 状态与 Outbox 驱动。

#### Webhook 验签后直接执行所有业务

签名只证明来源和 Payload 未被修改，不证明事件没重复、顺序正确或业务尚未执行。还要去重、版本化、事务更新与幂等消费。

#### 退款覆盖原始 Payment

这会破坏账本和对账，也无法表达部分退款与退款失败。Refund 必须是关联的新资金对象。

#### Payment Request 成为唯一入口

能力和支付方式覆盖不一致，会直接排除部分浏览器与 WebView。它只能渐进增强。

### 渐进落地路线

先建立服务端 Order/Quote、整数最小单位金额和一个订单可恢复的 Payment 对象。前端拆开网络请求状态与版本化 Payment Snapshot，并实现稳定 operation ID。

随后接入托管支付页面/字段和官方 SDK，处理 requires_action、processing、回跳事务与有限查询。服务端同时完成双层幂等、原始 Body Webhook 验签、聚合版本和履约 Outbox。

最后建设退款/捕获/库存补偿、脚本治理、真实钱包与 SCA 测试、持续对账、人工异常队列和资金事故演练。每一阶段都要能回答：响应丢失时怎样恢复？重复事件怎样不多收、不多发？

### 上线检查清单

- [ ] Cart/Quote、Order、Payment、Attempt、Refund 与 Fulfillment 对象分离；
- [ ] 服务端决定价格、币种、税费和可履约事实，浏览器只提交意图；
- [ ] 金额使用受治理的最小单位、精度、舍入和产品上限；
- [ ] Quote/Order Version 与过期时间防止静默价格漂移；
- [ ] 本地请求错误不会覆盖服务端 Payment Snapshot；
- [ ] 同一逻辑操作复用 operation ID，相同 key 不同参数会冲突；
- [ ] 浏览器→商家和商家→服务商两个幂等边界都有持久化约束；
- [ ] 同一 Order 能恢复/复用 Payment，不因刷新盲目新建；
- [ ] 优先使用托管页/字段，卡数据和服务器 Secret 不进入前端；
- [ ] 支付页第三方脚本、CSP、完整性和篡改监测经过治理；
- [ ] requires_action、processing、authorized、paid、failed 与 unknown 语义明确；
- [ ] 回跳绑定一次性事务，查询参数不决定支付成功；
- [ ] Webhook 在原始 Body 上验签、去重、容忍乱序并快速持久化；
- [ ] 履约由数据库事实和 Outbox 驱动，消费者自身幂等；
- [ ] 轮询有退避、上限和取消，耗尽不会变成 failed；
- [ ] Refund、Capture、Dispute 与库存补偿有独立模型、权限和审计；
- [ ] Payment Request/钱包有 Feature Detection 和普通结算 fallback；
- [ ] 日志、分析、录屏与错误平台不采集支付敏感数据；
- [ ] 服务商测试模式、故障注入、真实浏览器和持续对账均已验证。

## 总结

支付前端真正需要维护的不是一个 `loading`，而是用户意图与服务端资金事实之间的可恢复关系：

- Order 决定应收，Payment 表达收款生命周期，Refund 与 Fulfillment 保留各自历史；
- 金额使用币种与最小单位，最终定价永远来自服务端；
- 网络请求状态与支付领域状态分离，超时和 processing 都不是失败；
- 稳定 operation ID、数据库唯一约束和上游幂等共同抵抗重复执行；
- 托管支付组件、脚本治理和最小数据暴露缩小敏感边界；
- 3DS、钱包和回跳只是流程步骤，不能单独证明资金成功；
- 签名 Webhook、主动查询、Outbox 和定时对账让状态最终收敛；
- 前端负责让用户理解、等待和恢复，服务端账本决定资金与履约。

下一节：[前端多租户、权限系统与企业级管理后台架构](./frontend-multi-tenant-permission-and-enterprise-admin-architecture.md)，会把本课的身份、资源授权、审计和高风险操作进一步扩展到租户隔离、支持人员代操作与大规模管理后台。

## 参考资料

- [Stripe：Payment Intents API](https://docs.stripe.com/payments/payment-intents)
- [Stripe：Idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [Stripe：Receive events in a webhook endpoint](https://docs.stripe.com/webhooks)
- [MDN：Payment Request API](https://developer.mozilla.org/en-US/docs/Web/API/Payment_Request_API)
- [W3C：Payment Request API](https://www.w3.org/TR/payment-request/)
- [PCI SSC：SAQ A Eligibility Criteria for E-Commerce Merchants](https://blog.pcisecuritystandards.org/faq-clarifies-new-saq-a-eligibility-criteria-for-e-commerce-merchants)
- [PCI SSC：Payment Page Security and Preventing E-Skimming](https://blog.pcisecuritystandards.org/new-information-supplement-payment-page-security-and-preventing-e-skimming)
- [European Banking Authority：SCA and Digital Wallets](https://www.eba.europa.eu/publications-and-media/press-releases/eba-clarifies-application-strong-customer-authentication)
