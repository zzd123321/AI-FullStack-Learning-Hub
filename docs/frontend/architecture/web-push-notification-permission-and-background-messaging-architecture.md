---
title: Web Push、通知权限与后台消息架构
description: 系统掌握通知权限、PushSubscription、VAPID、消息加密、Service Worker 展示、点击路由、订阅治理、降级、安全与生产运营
---

# Web Push、通知权限与后台消息架构

Web Push 不是“后端往浏览器发一个 JSON”。它横跨用户授权、浏览器订阅、厂商 Push Service、应用服务器、消息加密、Service Worker 和操作系统通知中心。页面即使关闭，浏览器也可能接收消息并短暂启动 Service Worker；但发送成功不等于设备展示，更不等于用户看见或点击。

通知还是一种高打扰权限。错误的首次弹窗会让用户永久拒绝；过度发送会伤害信任、留存和系统级站点信誉。可靠架构必须同时优化技术投递和用户意愿。

## 学习目标

完成本课后，你应该能够：

- 区分 Notifications API、Push API、Service Worker 与站内消息；
- 解释浏览器、Push Service 和应用服务器之间的数据流；
- 在明确用户意图后申请权限，并处理 default/granted/denied；
- 创建、上报、更新和注销 `PushSubscription`；
- 理解 VAPID 公私钥、endpoint 能力 URL 和消息加密边界；
- 在 Service Worker 中可靠处理 push、展示通知和安全路由点击；
- 设计通知 tag、去重、偏好、静默时段和多设备订阅；
- 根据 Push Service 响应清理失效订阅或有限重试；
- 建立隐私、安全、可访问性、测试、观测与运营治理。

## 一、先分清三种“消息”

| 能力 | 页面是否需要打开 | 展示位置 | 适合场景 |
| --- | --- | --- | --- |
| 站内消息 | 通常需要 | 应用 UI | 消息中心、未读列表、实时提示 |
| 系统通知 | 不一定在当前页 | 操作系统通知中心 | 用户明确订阅的及时提醒 |
| Web Push | 页面可关闭 | 先唤醒 Service Worker，再展示通知 | 服务端事件驱动的后台到达 |

Notifications API 负责请求展示权限和显示系统通知；Push API 负责建立浏览器订阅并接收服务端推送；Service Worker 负责后台事件。仅调用 `showNotification()` 不会自动建立远程推送。

站内消息应是业务记录，Push 通常只是“有新事件”的短时投递通道。用户错过 Push 后，再打开应用仍应从服务器得到正确未读状态。

## 二、数据流与信任边界

```text
浏览器页面
  └─ PushManager.subscribe(applicationServerKey)
       └─ Push Service 返回 endpoint + p256dh + auth
            └─ 页面把 subscription 绑定到当前用户和设备记录

业务事件 → 通知服务 → 用户偏好/去重/限流
  └─ 使用 VAPID 私钥认证，并用订阅密钥加密 payload
       └─ POST 到 Push Service endpoint
            └─ 浏览器收到 push → 启动 Service Worker
                 └─ showNotification → 用户点击 → 打开/聚焦应用
```

Push Service 通常由浏览器生态提供，不是你的业务 API。应用服务器不直接连接用户设备，也不能把 endpoint 当普通用户 ID。

## 三、支持条件与渐进增强

通知和 Push 通常要求安全上下文，并且不同浏览器、操作系统、安装形态和企业策略支持程度不同。能力检测至少包含：

```text
serviceWorker in navigator
PushManager in window
Notification in window
```

即使接口存在，权限申请、订阅或后台投递仍可能失败。产品必须保留站内收件箱、页面 badge、邮件或用户主动刷新等路径。Push 不能是找回账号、安全验证、支付结果等关键事实的唯一通道。

## 四、权限是产品漏斗，不是页面初始化代码

不要首次访问就执行 `Notification.requestPermission()`。用户尚未理解价值，拒绝后往往需要进入浏览器设置才能恢复。

更合理的流程：

1. 在具体功能中说明会发送什么，例如“课程评论回复”；
2. 先提供站内开关和频率/类别选择；
3. 用户点击“开启系统通知”；
4. 在这次明确手势中调用权限 API；
5. granted 后建立 subscription；
6. denied 后保留站内消息并给出设置说明，不反复骚扰。

所谓 soft prompt 不能伪装成浏览器权限框，也不能用误导按钮强迫同意。它的价值是解释用途和让用户主动进入系统请求。

## 五、三种权限状态

- `default`：用户尚未作出决定，或关闭了提示；可以在未来有意义的时机再次说明，但不能频繁弹出；
- `granted`：当前 origin 可展示通知，仍不代表已经有 Push subscription；
- `denied`：当前 origin 被拒绝，页面不能自行重置权限。

完整能力检测和权限请求：

<<< ../../../examples/frontend/web-push-notifications/permission-and-subscription.ts

`requestNotificationPermissionFromUserGesture` 的名字刻意表达调用前提。技术上函数无法证明调用栈来自用户手势，组件层必须保证它由点击等明确操作直接触发。

跨源 iframe 中的权限申请受到严格限制。嵌入式产品通常应由顶层站点引导，不能依赖第三方 iframe 弹系统权限。

## 六、创建 PushSubscription

订阅依赖已激活的 Service Worker registration：

```ts
registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey
})
```

`applicationServerKey` 是 VAPID 公钥的二进制形式，示例包含 Base64URL 解码。公钥可以公开；私钥只能存在于可信服务端或密钥管理系统。

先调用 `getSubscription()`，避免每次启动都无意义创建。示例还比较已有订阅绑定的 application server key；若 VAPID 公钥已轮换，先注销旧订阅再重建。无论复用还是新建，都应把当前 subscription 上报后端进行 reconciliation，因为服务端记录可能丢失、过期或绑定在旧账号。

## 七、订阅对象包含什么

序列化后的 `PushSubscription` 通常包括：

- `endpoint`：Push Service 的投递 URL；
- `expirationTime`：可能为 null，不应假设一定存在；
- `keys.p256dh`：用户代理公钥材料；
- `keys.auth`：消息加密认证材料。

endpoint 是难以猜测的能力 URL，拿到它的一方可能尝试向订阅投递。不要写入前端日志、分析平台、错误截图、工单或 URL 参数。

后端接收时仍需 schema、长度、HTTPS、用户身份、CSRF 和速率校验：

<<< ../../../examples/frontend/web-push-notifications/subscription-record.ts

客户端字段校验改善错误反馈，后端验证才是安全边界。

## 八、一位用户可以有多个订阅

同一用户可能有手机、桌面、不同浏览器、普通标签页和已安装 PWA。数据模型应是：

```text
User 1 ── N PushSubscriptionRecord
```

每条记录有内部 ID、endpoint、密钥、创建/最近确认时间、客户端家族和禁用时间。不要用 endpoint 作为公开主键，也不要新订阅时删除用户其他设备。

需要定义：

- “在此设备关闭通知”只注销当前 subscription；
- “所有设备关闭”禁用用户级偏好并清理所有订阅；
- 登出是否保留设备订阅，通常应解除与旧账号绑定；
- 同一浏览器换账号时不能把旧用户消息发给新用户；
- 长期未确认或持续失败的记录如何回收。

## 九、VAPID 解决什么

Web Push 协议让应用服务器向 Push Service 请求投递。VAPID 允许应用服务器用长期密钥对标识自己，并可将订阅限制到对应应用服务器公钥。

边界必须明确：

- 浏览器订阅使用 VAPID public key；
- 服务端发送使用对应 private key 签名认证；
- VAPID 不是业务用户身份；
- VAPID 认证不代替 payload encryption；
- private key 轮换需要订阅兼容或重新订阅计划；
- 不要在浏览器自己生成服务端签名。

服务端应使用成熟 Web Push 库实现 VAPID、ECDH/HKDF、内容编码与 Push Service header，避免自行拼接密码学协议。

## 十、消息加密与最小 payload

Push Service 负责转发，但业务 payload 按 Web Push 消息加密协议保护。即便如此，服务仍可观察 endpoint、时间、大小和频率等元数据。

Payload 应尽量小：

```json
{
  "version": 1,
  "notificationId": "n-123",
  "title": "你有一条新回复",
  "route": "/notifications/n-123",
  "category": "message"
}
```

避免发送访问令牌、完整私信、医疗/财务内容、可长期使用的下载 URL。更高隐私场景只发送不敏感的 wake-up 提示，应用打开后再通过当前认证获取内容。

客户端必须把解密后的 JSON 继续当不可信输入：

<<< ../../../examples/frontend/web-push-notifications/push-payload.ts

示例限制 schema 版本、长度、类别和同源相对 route，拒绝 `//evil.example` 这类协议相对跳转。

## 十一、push 事件必须关联 waitUntil

浏览器收到消息后可启动 Service Worker，并派发 `push`。Worker 生命周期短，展示通知的 Promise 必须传给 `event.waitUntil()`。

移动端不应依赖页面中的 `new Notification()`；使用 `registration.showNotification()` 创建持久通知。

完整 push 与 notificationclick handler：

<<< ../../../examples/frontend/web-push-notifications/service-worker-push.ts

示例在 payload 缺失、JSON 错误或版本未知时展示通用通知。对于以 `userVisibleOnly: true` 建立的订阅，服务端不应发送用户不可见的静默追踪 push；Push 应对应用户认可的可见用途。

## 十二、NotificationOptions 的产品语义

常见字段：

- `body`：简短补充，不放敏感详情；
- `icon`：通知图标；
- `badge`：部分平台使用的单色小图标；
- `tag`：让同类通知替换/归组，避免通知中心爆炸；
- `data`：点击时需要的最小路由/内部 ID；
- `actions`：平台支持时显示操作按钮；
- `requireInteraction`、`silent`、`renotify`：支持和行为存在平台差异。

不要假定所有字段、action 数量、图片和声音在各平台一致。核心语义必须在标题、正文和默认点击中成立。

`tag` 不应全站固定，否则所有通知互相覆盖；也不应每条完全随机导致无法收敛。可按会话、任务或业务聚合键设计。

## 十三、点击处理是安全导航

点击通知后通常：

1. 立即关闭通知；
2. 验证 route 是允许的同源路径；
3. 查找已有 window client；
4. 存在则 navigate/focus；
5. 不存在则 `clients.openWindow()`；
6. 页面加载后用当前登录态读取业务数据。

不能直接信任 payload 中的绝对 URL，否则通知系统会成为开放重定向入口。不要把 bearer token 放进点击 URL。用户可能已登出，目标页需要正常进入登录并在安全范围内保留 return path。

Action 按钮不是普通点击。删除、归档等有副作用动作仍需鉴权、幂等、CSRF/重放防护和失败反馈。对高风险操作更适合先打开应用确认。

## 十四、前台页面与系统通知去重

用户正停留在对应会话时，再弹系统通知通常是噪声。推荐在服务端或 Worker 展示前结合产品策略：

- 页面通过 WebSocket/SSE 接收站内事件；
- 页面向服务端维护有限时效的活跃状态，或 Worker 查询 window clients；
- 若用户正在查看目标内容，更新 UI/声音而不额外发送 Push；
- 无法可靠判断时，保持服务端通知 ID 幂等，避免站内与 Push 重复计数。

但不要收到 `userVisibleOnly` Push 后任意静默吞掉。更可靠的是发送前根据用户活跃状态决定是否创建 Push 投递。

## 十五、偏好、类别与静默时段

系统权限只有 origin 级 granted/denied，业务仍需更细偏好：评论、私信、任务、营销、安全提醒等分别控制。

<<< ../../../examples/frontend/web-push-notifications/delivery-policy.ts

静默时段跨午夜需要特殊判断。生产系统还要保存 IANA 时区而不是固定 UTC offset，并处理夏令时变化。紧急安全类通知是否绕过静默时段必须由明确政策决定，不能靠开发者临时 hardcode。

偏好应在发送服务统一执行，而不是只在某台设备本地判断；否则其他设备仍会收到不想要的类别。

## 十六、服务端发送队列

业务事务不应同步等待所有 Push Service。更可靠的流程：

```text
业务提交成功
→ 写入领域事件/outbox
→ 通知编排读取用户偏好与订阅
→ 生成 notificationId，去重和限流
→ 投递队列调用 Web Push 库
→ 记录 Push Service 响应
→ 清理失效订阅或有限重试
```

队列消息包含内部 subscription ID，不要在普通队列日志中铺开 endpoint 和密钥。发送 worker 在执行时从受控数据库读取最新记录。

Web Push 支持 TTL、urgency、topic 等投递语义。TTL 表示消息可以等待多长时间，过期事件不应在数小时后突然提醒；urgency 影响 Push Service 的投递优先级和设备资源；topic 可用于替换尚未投递的同类消息。具体 header 使用成熟库并按业务验证。

## 十七、发送成功不等于用户看到

应用服务器收到 Push Service 的 2xx，只表示服务接受了投递请求，不证明：

- 设备当前在线；
- 浏览器最终收到；
- Service Worker 成功运行；
- 操作系统展示；
- 用户注意到或点击；
- 目标业务仍有效。

因此不要把“Push 发送成功”写成业务已读，也不要以点击率作为唯一送达率。关键状态仍由应用打开后的业务 API 确认。

## 十八、根据响应治理订阅

<<< ../../../examples/frontend/web-push-notifications/delivery-result.ts

常见处理：

- 2xx：Push Service 接受；
- 404/410：endpoint 已失效，删除或禁用 subscription；
- 408/429/5xx：在有限预算内退避重试，并尊重 `Retry-After`；
- 其他 4xx：签名、加密、请求或策略错误，进入告警/死信，不盲重试。

同一 subscription 持续失败必须熔断。大量 401/403 可能表示 VAPID 配置或时钟问题；突然大量 410 可能是浏览器生态变化、密钥轮换或数据污染，需要按供应商和客户端版本聚合诊断。

## 十九、订阅恢复与轮换

浏览器可能刷新或失效 subscription，VAPID key 也可能轮换。不要只在首次授权时把订阅保存一次。

应用启动/登录后应：

1. 检查系统权限；
2. `getSubscription()`；
3. granted 但无订阅时，在符合用户偏好的情况下恢复订阅；
4. 有订阅时重新 upsert 到当前用户；
5. denied 时禁用服务端对应设备记录；
6. 登出时解绑当前账号。

`pushsubscriptionchange` 可作为额外信号，但兼容和后台执行不能作为唯一恢复路径。前台 reconciliation 才是基础路径。

## 二十、关闭通知的完整语义

<<< ../../../examples/frontend/web-push-notifications/permission-and-subscription.ts

示例关闭当前设备时先 `unsubscribe()`，再通知服务端删除 endpoint。即使后端调用失败，后续发送通常会得到失效响应并清理；UI 可保留待同步清理任务。

业务开关关闭与浏览器权限 denied 不同：

- 业务关闭可以保留 subscription 但服务端不发送，便于以后快速开启；
- 当前设备永久关闭可 unsubscribe；
- 系统 denied 只能引导用户去浏览器设置恢复；
- 删除账号时必须删除所有 subscription 与通知偏好数据。

## 二十一、隐私与安全

- endpoint、p256dh、auth 按敏感凭证存储、传输和日志脱敏；
- VAPID private key 放在密钥管理系统，限制发送服务访问；
- 订阅保存/删除接口要求当前身份、CSRF 防护和速率限制；
- payload 最小化，不放 token 和敏感正文；
- 点击 route 使用同源 allowlist，不接受任意 URL；
- 通知内容在锁屏可能可见，要提供隐私模式；
- 服务端偏好和退订立即生效，并有审计记录；
- 防止任意业务方绕过编排服务直接群发；
- 监控异常发送量、投诉、拒绝率和退订率。

浏览器权限 granted 不是无限营销同意。用途变化、频率变化和营销通信仍受产品承诺与适用法规约束。

## 二十二、可访问性与内容设计

- 标题直接表达来源和事件，不只写“你有新消息”；
- 正文简短，避免仅靠 emoji、颜色或图片传达关键信息；
- 默认点击总能完成核心路径，不依赖 action 支持；
- action 使用清晰动词，并避免高风险不可撤销操作；
- 站内提供完整消息历史，通知消失后仍能找回；
- 不连续高频震动、声音或 renotify；
- 用户可按类别、时间和设备控制；
- 权限和订阅状态以文本呈现，不只显示开关颜色。

通知不是屏幕阅读器公告的替代品；应用前台仍需要可访问的实时更新和焦点管理。

## 二十三、测试策略

### 1. 纯逻辑

Payload schema 测试覆盖安全 route 与版本拒绝：

<<< ../../../examples/frontend/web-push-notifications/push-payload.test.mts

偏好与发送结果测试覆盖跨午夜静默时段、类别关闭、410 清理和 429 退避：

<<< ../../../examples/frontend/web-push-notifications/delivery-policy.test.mts

### 2. 浏览器集成

覆盖 unsupported、default、granted、denied、权限在设置中被撤销、已有订阅、订阅创建失败、unsubscribe 失败和账号切换。权限自动化需使用浏览器测试上下文授权，不应让 CI 真弹系统对话框。

### 3. Service Worker

构造无 data、非法 JSON、未知版本、超长字段、合法消息；验证每条路径调用 `waitUntil` 和 `showNotification`。点击测试覆盖已有窗口、新窗口、登录失效、危险外域 route 与 action。

### 4. 端到端投递

在真实目标浏览器/设备建立测试订阅，由预发布发送服务投递，验证后台、页面关闭、设备休眠、TTL、网络恢复、图标和点击。模拟 Push Service 不能替代少量真实生态契约测试。

## 二十四、可观测性

建议串联：

```text
businessEventId → notificationId → subscriptionId
→ queueAttemptId → pushService status → click/open → business read
```

指标包括：

- 权限说明曝光、系统请求、granted/denied 转化；
- 活跃/失效订阅数和每用户设备数；
- 发送队列延迟、2xx、410、429、5xx；
- 重试、死信、VAPID 错误和供应商分布；
- 通知展示（能可靠采集时）、点击、目标页成功；
- 按类别的关闭、系统拒绝、退订和投诉；
- 静默时段抑制、去重和限流数量。

不能为追求统计而增加静默 Push 或指纹跟踪。指标按最小必要采集，并明确 2xx、展示和点击的不同口径。

## 二十五、容量与反滥用

一次业务事件可能展开为数百万订阅投递。系统需要：

- 用户级、类别级、租户级和全局速率限制；
- notificationId/topic 去重；
- 批次、背压、暂停和紧急停止开关；
- 订阅失效清理，避免反复请求 410；
- 按 Push Service 分区与熔断；
- TTL 防止队列积压后发送过期消息；
- 测试账号与生产人群隔离；
- 群发必须审批、预览、灰度和可撤回未发送批次。

Push 会消耗设备网络、电量和用户注意力。技术吞吐上限远高于合理产品频率，运营限制必须先于扩容。

## 二十六、常见失败模式

### 失败一：首次访问立即请求权限

用户不了解价值就永久拒绝。先说明具体用途，由明确手势触发。

### 失败二：granted 等于已订阅

权限和 subscription 是不同状态。每次启动进行 reconciliation。

### 失败三：把 VAPID 私钥放进前端

任何人都能冒充应用服务器发送。浏览器只需要公钥。

### 失败四：endpoint 写入日志

它是能力 URL。按敏感数据脱敏和访问控制。

### 失败五：Payload 带完整敏感内容

锁屏可见且元数据仍暴露。只发送最小提示，打开后认证读取。

### 失败六：点击直接打开 payload URL

形成开放重定向或 token 泄漏。只允许受控同源 route。

### 失败七：2xx 当作已读

它只代表 Push Service 接受。业务已读由应用内行为确认。

### 失败八：410 仍无限重试

失效 endpoint 永远不会恢复。立即清理订阅。

### 失败九：所有设备共用一条记录

新设备覆盖旧设备，退订语义混乱。用户与订阅是一对多。

### 失败十：只依赖 pushsubscriptionchange

后台事件并非稳定唯一入口。应用启动时主动对账。

### 失败十一：站内消息只存在于 Push

通知丢失后业务记录消失。服务器消息中心才是事实。

### 失败十二：没有发送总闸门

错误事件触发海量推送。限流、审批、灰度和 kill switch 必须存在。

## 二十七、渐进落地路线

### 阶段一：站内通知与权限体验

- 建立服务端消息中心和已读状态；
- 定义类别、频率、静默时段和降级通道；
- 在高价值场景解释权限；
- 支持 granted/denied/unsupported UI；
- 完成隐私文案与运营约束。

### 阶段二：单设备可靠 Push

- Service Worker 持久通知和安全点击；
- subscription upsert/unsubscribe；
- VAPID 密钥管理和成熟发送库；
- Payload schema/version 和最小化；
- 2xx/410/429/5xx 分类处理与观测。

### 阶段三：多设备与规模化运营

- 用户一对多订阅、账号切换和定期 reconciliation；
- 事件 outbox、发送队列、幂等和 TTL；
- 偏好、活跃状态、去重和频率治理；
- 灰度、审批、kill switch、真实设备矩阵；
- 密钥轮换、灾难恢复和大规模失效清理。

## 二十八、上线检查清单

- [ ] 网站在不支持 Push 或用户拒绝时仍有完整核心功能；
- [ ] 权限仅由明确用户操作触发，申请前说明类别和价值；
- [ ] default、granted、denied、unsupported 有不同 UI 和恢复方案；
- [ ] Service Worker、PushManager 和 Notification 分别检测；
- [ ] VAPID 公钥仅用于订阅，私钥只在受控服务端；
- [ ] endpoint、p256dh、auth 不进入普通日志和分析系统；
- [ ] 用户与 subscription 一对多，设备关闭和全局关闭语义明确；
- [ ] 登录、登出、换账号和权限撤销都会重新对账；
- [ ] payload 加密、最小化、版本化并经过 runtime schema；
- [ ] notification route 只允许同源安全路径，不携带 bearer token；
- [ ] push/showNotification/click 的异步工作全部进入 `waitUntil`；
- [ ] 默认点击在 actions 不支持时仍能完成核心流程；
- [ ] 业务偏好、静默时段、隐私模式和退订立即生效；
- [ ] 发送来自事务 outbox/队列，不阻塞业务请求；
- [ ] TTL、urgency、topic、幂等、限流和重试预算明确；
- [ ] 404/410 清理订阅，429/5xx 退避，永久 4xx 进入告警；
- [ ] 2xx、展示、点击和业务已读指标严格区分；
- [ ] 真实浏览器、移动设备、后台、休眠和点击路由已测试；
- [ ] 群发具备审批、灰度、暂停和全局 kill switch；
- [ ] 站内消息保存完整业务事实，Push 不是唯一通道。

## 总结

可靠 Web Push 系统是一条受用户许可约束的后台消息管线：

- Notifications API 管理系统展示权限，Push API 管理后台订阅；
- Subscription 是设备/浏览器级能力，应与用户一对多绑定并持续对账；
- VAPID 标识应用服务器，payload encryption 保护内容，两者都在服务端实现；
- Service Worker 用 `waitUntil` 展示持久通知，并把点击限制到安全同源路由；
- 偏好、静默时段、TTL、去重和限流决定“是否应该发送”；
- Push Service 2xx 不是展示或已读，关键业务状态仍来自应用服务器；
- 失效清理、队列治理、密钥保护、真实设备测试和 kill switch 决定系统能否规模化。

只有当每条通知都能回答“为什么发、用户是否同意、内容是否必要、点击是否安全、错过后在哪里找回”，Push 才是在帮助用户，而不是争夺注意力。

## 参考资料

- [MDN：Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API)
- [MDN：Using the Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API)
- [MDN：Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- [MDN：PushManager.subscribe](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe)
- [MDN：ServiceWorkerRegistration.showNotification](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification)
- [MDN：notificationclick event](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/notificationclick_event)
- [W3C：Push API](https://www.w3.org/TR/push-api/)
- [RFC 8030：Generic Event Delivery Using HTTP Push](https://www.rfc-editor.org/rfc/rfc8030)
- [RFC 8291：Message Encryption for Web Push](https://www.rfc-editor.org/rfc/rfc8291)
- [RFC 8292：VAPID for Web Push](https://www.rfc-editor.org/rfc/rfc8292)
