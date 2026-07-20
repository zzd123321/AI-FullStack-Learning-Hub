---
title: 前端权限、设备能力与隐私工程架构
description: 系统掌握 Permissions API、设备能力请求、Permissions Policy、资源生命周期、撤销、降级、数据最小化与生产治理
outline: deep
---

# 前端权限、设备能力与隐私工程架构

相机、麦克风、定位、剪贴板、通知和传感器不是普通函数：它们跨越浏览器沙箱，最终结果可能同时受 HTTPS、浏览器支持、Permissions Policy、用户选择、操作系统、企业策略、瞬时用户激活和设备状态影响。

因此，权限工程不能只回答“怎样弹出授权框”。更完整的问题是：为什么需要这项能力、此刻是否应该请求、一次调用到底成功了什么、何时停止硬件、收集哪些数据、保存多久、怎样撤销，以及用户拒绝后能否继续完成任务。

本课会沿着五个问题推进：先拆开能力、策略、权限与操作结果；再建立会变化的权限状态和资源 owner；随后用 Permissions Policy 收紧嵌入边界；最后把数据最小化、测试、观测和删除纳入同一生命周期。

## 学习目标

完成本课后，你应该能够：

- 区分接口支持、上下文资格、策略委派、权限状态和本次操作结果；
- 正确使用 Permissions API 查询与监听，而不把 `query()` 当作统一申请接口；
- 由明确用户意图调用各能力自己的请求 API，并提供可靠降级；
- 为媒体 track、定位 watch、Wake Lock 和设备连接建立确定性 owner；
- 使用响应头与 iframe `allow` 共同限制嵌入内容；
- 设计用途登记、数据最小化、保留、删除、审计与隐私文案；
- 覆盖拒绝、策略阻止、撤销、无设备、超时和资源中断等生产状态。

## 先把“能不能用”拆成四个问题

前端常用一个布尔值 `hasPermission` 表示全部状态，这会从模型层制造错误。更接近真实世界的判定链是：

```text
1. 当前环境是否实现接口？
2. 安全上下文、顶层/嵌入关系和 Permissions Policy 是否允许请求？
3. 当前 permission state 是 prompt、granted 还是 denied？
4. 这一次设备操作是否真的成功，并得到可用结果？
```

四层之间不能互相替代。例如：

- `navigator.mediaDevices` 存在，不代表当前 iframe 被委派相机；
- permission state 为 `granted`，不代表摄像头没有被别的应用占用；
- `getCurrentPosition()` 成功，不代表下一次调用还会成功；
- `NotAllowedError` 不足以证明“用户点击了拒绝”，它也可能来自不安全上下文或策略；
- 接口不存在是 `unavailable`，不等于用户 `denied`。

UI 应描述自己真正知道的事实，例如“当前环境无法使用相机”或“浏览器/系统阻止了访问”，不要在没有证据时责怪用户。

### Permissions API 是状态观察器

`navigator.permissions.query()` 接收某项能力定义的 descriptor，返回 `PermissionStatus`。其 `state` 有三种：

- `prompt`：当前状态仍需要请求流程决定，不保证下一次一定显示对话框；
- `granted`：当前上下文被允许使用该能力，授权持续时间仍由能力与浏览器决定；
- `denied`：当前上下文不能使用，可能由用户、浏览器、系统或策略造成。

Permissions API 不提供一个通用的 `request()`。定位通过 Geolocation API 触发，媒体通过 `getUserMedia()`，通知通过 `Notification.requestPermission()`，设备类 API 往往通过自己的 chooser。查询状态和执行能力是两件事。

不同浏览器支持的 permission name 并不完全一致，不认识的 descriptor 会拒绝 Promise。`camera`、`microphone`、`clipboard-read` 等即使在某些浏览器可查询，也不能作为所有目标平台的前置条件。

<<< ../../../examples/frontend/device-permissions/permission-observer.ts

示例把“API 不存在”“descriptor 不支持”和“查询异常”分开，并监听 `PermissionStatus.change`。`AbortSignal` 解决了一个容易遗漏的竞态：组件可能在异步 `query()` 完成前已经卸载，此时不应再挂 listener 或更新旧组件。

状态监听仍不是资源监听。用户从浏览器指示器停止屏幕共享时，最直接的事实是 track `ended`；不要等待 permission state 恰好同步变化。

### 请求来自用户任务，不来自页面初始化

首次加载就批量申请相机、定位和通知，用户既不知道用途，也难以做出有意义的选择。更可靠的流程是：

1. 用户进入一个明确功能，例如“扫描课程二维码”；
2. 页面说明要使用什么、为什么需要、数据是否上传和替代方式；
3. 用户点击继续；
4. 在该 API 要求的用户激活窗口内发起请求；
5. 根据本次结果进入成功、阻止、不可用或失败路径；
6. 功能结束立即释放资源。

不是每项 API 都要求相同形式的瞬时激活，浏览器实现也可能更严格。不要写一个“统一申请所有权限”的工具函数；统一的是产品状态与错误语义，真正请求仍由具体 capability adapter 负责。

<<< ../../../examples/frontend/device-permissions/capability-request.ts

示例有意把本次结果命名为 `success`，而不是 `granted`。拿到一次位置只证明这次调用返回了结果，不能承诺 permission 会永久保留。定位错误码 `PERMISSION_DENIED` 也可能由 Permissions Policy 产生，所以结果只说 `blocked`，不伪造责任方和恢复方式。

定位默认关闭高精度、设置超时并允许复用一分钟内的位置。这不是所有业务的固定参数，而是“附近课程只需要近似位置”的产品决策。配送确认、运动轨迹等场景需要不同精度，但也应让用户确认结果，而不是把第一次坐标静默当成事实。

剪贴板写入函数名标明调用前提：组件必须从明确点击中直接调用。`NotAllowedError` 可能涉及权限、焦点、用户激活或 iframe policy，示例同样不会武断显示“你拒绝了”。

### capability adapter 返回可行动状态

组件不应根据 user-agent 猜测“iOS 没有某功能”或“Chrome 一定支持蓝牙”。adapter 可以统一成下列产品语义：

| 结果 | 含义 | 常见 UI |
| --- | --- | --- |
| `success` | 本次操作成功 | 进入功能，同时建立资源 owner |
| `blocked` | 权限、策略或激活条件阻止 | 解释条件，提供设置/顶层打开/重新点击路径 |
| `unavailable` | 接口或安全上下文不满足 | 直接使用替代方案 |
| `failed` | 设备、约束、超时或未知故障 | 按原因重试、调整约束或更换设备 |

不要让所有失败都变成 `denied`。定位失败可改为手动选城市；相机失败可上传图片；复制失败可选中文本手动复制；通知拒绝后保留站内消息；生物识别不可用时回到常规验证。

## 权限会变化，设备资源必须有 owner

permission state 描述当前是否允许尝试，资源对象描述硬件是否正在工作。这两个生命周期经常不同步：用户可以保留麦克风权限但停止当前 track，也可以在 track 工作时从系统设置撤销权限。

常见资源与清理动作：

| 资源 | 必须清理的操作 |
| --- | --- |
| `MediaStreamTrack` | `stop()`，断开元素 `srcObject`，清理事件监听 |
| Geolocation watch | `clearWatch(id)` |
| `WakeLockSentinel` | `release()` 并监听意外释放 |
| Bluetooth/Serial/HID | 关闭连接、移除通知 listener |
| object URL | `URL.revokeObjectURL()` |
| 临时敏感状态 | 清空内存引用、store 快照与定时器 |

owner 通常是页面级 service、一次对话流程或明确组件。获得资源的人不一定拥有它：组件可能只展示由通话 service 管理的 stream，路由离开也不一定代表全局通话必须结束。创建时就写明谁能停止、哪些事件触发停止、结束状态怎样通知 UI。

### 相机、麦克风和屏幕共享是活资源

媒体至少包含三种不同事实：

```text
当前上下文可以请求设备
→ getUserMedia/getDisplayMedia 本次返回 track
→ track 此刻仍然 live，并持续提供符合需求的数据
```

`getUserMedia()` 可能以不同异常结束：`NotAllowedError` 表示权限或策略阻止，`NotFoundError` 表示没有匹配设备，`NotReadableError` 表示系统或硬件无法读取，`OverconstrainedError` 表示约束无解。用户也可以一直不选择，使 Promise 长时间既不 resolve 也不 reject；产品应允许退出等待，并在迟到 stream 到达时立即 stop。

约束是请求，不是保证。获取后用 `track.getSettings()` 查看实际分辨率、帧率和输入。过早使用严格 `exact` 约束会增加失败，也可能在授权前暴露设备能力形成指纹面；通常先用宽松约束开始，再根据业务渐进调整。

track 可能因设备拔出、系统撤销或用户停止共享而触发 `ended`，临时无数据时还会 `mute`。一个很容易写错的细节是：主动调用 `MediaStreamTrack.stop()` 会把 `readyState` 设为 `ended`，但不会触发 `ended` 事件。因此产品状态不能只靠事件更新。

<<< ../../../examples/frontend/device-permissions/media-resource-owner.ts

示例把多个 track 当成一次产品会话：任意 track 被外部终止时，关闭其余 track，防止用户以为已经结束但仍保留部分采集；owner 主动停止时则显式发布状态，因为浏览器不会替它触发 `ended`。视频会议也可以选择保留剩余 track，但必须把这种策略写清楚。

屏幕共享每次都应由用户选择 surface，页面不能静默记住并后台恢复。共享内容可能包含通知、密码和其他应用，开始前要说明风险，停止入口始终可见，目标 surface 结束后立即同步 UI。

### 定位结果还包含精度和时间

`GeolocationPosition` 不只是经纬度，还包含 `accuracy` 与 `timestamp`。产品必须定义“多新、多准才够用”：

- 城市级内容通常不需要高精度 GPS；
- 配送位置应让用户在地图上确认；
- `maximumAge` 可复用近期结果，减少延迟和设备访问；
- `watchPosition()` 持续产生敏感数据并消耗能量，离开任务立即 `clearWatch()`；
- timeout、位置不可用和 permission/policy blocked 需要不同恢复路径；
- 上传前考虑降精度、短保留和访问审计。

IP 推断位置不是“没有隐私成本的替代定位”。它精度较低，但仍可能关联账号、网络和行为；若只需要用户所在城市，手动选择往往更透明也更可靠。

### 剪贴板读取比写入更敏感

写入常用于用户点击“复制链接”；读取可能取得密码管理器、聊天或其他应用刚复制的内容。优先处理用户主动 `paste` 事件，不要轮询剪贴板。

浏览器对 Clipboard API 的实现存在明显差异：Chromium 可能使用持久 permission，Firefox/Safari 更依赖瞬时激活和每次 paste UI。即使 permission query 返回 `granted`，本次调用仍可能受到焦点和平台规则限制。

设计原则：

- 读取前说明要解析什么，只保留需要字段；
- 不把内容自动写入分析、错误日志或提交请求；
- 页面失焦或不可见时不主动读取；
- 写入失败时提供选中文本和手动复制；
- 不把 `clipboard-read`/`clipboard-write` query 当成跨浏览器前置条件。

### chooser 类设备能力遵循同一框架

Bluetooth、USB、Serial、HID、MIDI、Web Share、Wake Lock 和传感器有各自的 chooser、权限与支持矩阵，但可以沿用同一思路：

1. 检测 capability，不从 UA 推断；
2. 用户进入具体任务后再调用；
3. 让浏览器 chooser 选择设备，页面不伪造系统选择器；
4. 只保存业务需要的最小设备标识；
5. 连接断开、页面隐藏、权限撤销时按策略清理；
6. 重连前核对用户意图、账号和设备身份；
7. 提供手动输入、上传或普通网络路径。

Wake Lock 只是尽力维持屏幕唤醒，可能因页面不可见、电量或系统策略自动释放。监听 `release`，等页面重新可见且原任务仍活动时再谨慎申请，不能把它当永久系统锁。

### 框架 store 只保存快照

Pinia/Redux 可以保存 `idle/requesting/active/blocked/failed`、设备显示名、开始时间等可序列化状态；不要把 `MediaStream`、`PermissionStatus`、清理函数或活连接持久化进 store。资源由 service 持有，store 是面向 UI 的投影。

多个组件请求同一用途时可以合并进行中的 Promise，避免连续系统提示；不同用途不能偷偷复用同意。“扫码”取得的相机流不能在用户不知情时转给“视频会议”。路由离开、账号切换、页面隐藏和应用进入后台应分别定义清理策略。

SSR 没有 `navigator`，能力检测只能在客户端执行。服务端先渲染稳定占位，hydration 后再展示真实能力状态，避免服务器猜 UA 造成结构不一致。

## Permissions Policy 管的是部署资格

Permissions Policy 让顶层页面规定自己和嵌入内容是否**有资格请求**某些能力。它不是用户同意，也不会替代 HTTPS、具体 API 的用户激活或系统权限。

响应头可以默认关闭站点不需要的能力：

```http
Permissions-Policy: camera=(), microphone=(), geolocation=(self)
```

含义是：相机和麦克风对当前文档及其子 frame 关闭；定位只允许当前 origin 及符合继承规则的同源 frame。每个 directive 有自己的默认 allowlist，不能假设未声明时一律是 `self`。

### Header 与 iframe `allow` 取更严格交集

跨源 frame 若确实需要相机，父页面的响应头和该 iframe 的 container policy 都必须允许：

```http
Permissions-Policy: camera=(self "https://capture.example")
```

```html
<iframe
  src="https://capture.example/scan"
  allow="camera; microphone 'none'"
  sandbox="allow-scripts allow-same-origin">
</iframe>
```

响应头使用带括号的 Structured Field 语法，iframe `allow` 使用不同语法；需要在真实响应与目标浏览器中验证。父级若设置 `camera=()`，子 frame 不能用 `allow="camera *"` 重新开启——禁用是单向收紧。

`allow="camera"` 的默认目标是 iframe `src` 的 origin。frame 导航到另一个 origin 后，原来的委派不会自动等价于信任新站点；如果确有多 origin 导航需求，应显式列出并重新做威胁评估，而不是使用 `*`。

策略排障要同时检查：顶层响应头、iframe `allow`、sandbox、当前 frame origin、安全上下文、浏览器设置、OS 权限和企业策略。Geolocation 被 policy 禁止时同样可能只返回 `PERMISSION_DENIED`，这正是前端错误不能武断归因的原因。

### 第三方脚本继承文档能力

Permissions Policy 以 browsing context 为边界，不会为同一页面里的每个 `<script>` 单独隔离权限。第三方脚本与业务代码共享当前 document 的能力，一旦发生 XSS，也可能调用已经暴露的 API。

因此还需要减少第三方脚本、严格 CSP、依赖治理、最小化全局对象，并把敏感调用放在明确用户流程中。若第三方内容无需能力，优先放入 sandbox iframe，结合精确 `allow` 和 `postMessage` origin/schema 校验。

## 隐私工程覆盖数据的完整生命周期

权限提示只解决浏览器是否允许调用，不代表用户同意所有业务用途。例如相机授权用于扫码，不等于可以上传连续画面；定位用于展示附近课程，不等于可以建立长期轨迹；通知权限 granted 也不是无限营销许可。

### 先写用途登记，再写请求代码

<<< ../../../examples/frontend/device-permissions/privacy-policy.ts

示例要求登记：具体用途、实际数据类别、本地还是服务端处理、保留天数、是否核心功能和替代路径。它会拒绝“改善体验”这类模糊目的、默认持久保存剪贴板，以及没有 fallback 的可选能力。

真实评审还应回答：

- 哪个用户动作触发请求？
- 精度、采样频率和持续时间是多少？
- 原始数据和派生数据分别是什么？
- 上传到哪个服务，是否经过第三方？
- 谁可以访问，日志是否包含敏感值？
- 何时删除，用户怎样主动删除？
- 不授权时能否用更少数据完成目标？

“功能需要”不是终点。团队要证明为什么低精度、一次性、本地处理或手动输入不足以完成同一任务。

### 用数据流找到被遗漏的派生物

为每项能力画出数据流：

```text
设备/系统 → 浏览器 API → 页面内存
→ 本地派生 → 是否上传 → 哪个服务/第三方
→ 原始与派生数据存储 → 访问者 → 保留 → 删除/备份过期
```

“不保存原始音频”不代表没有隐私数据：转录文本、embedding、语言、时长、设备信息和错误日志都可能敏感。删除策略需要覆盖原始数据、派生物、cache、分析副本、备份与处理方，而不是只删主表的一列。

数据最小化也不只是减少字段，还包括：

- 降低精度：城市代替坐标；
- 降低频率：单次位置代替轨迹；
- 缩短持续时间：按钮按住说话代替常驻麦克风；
- 本地派生：只上传“是否进入区域”，不上传路径；
- 降低可关联性：不用稳定设备 ID 作为分析主键；
- 缩短保留：任务完成后删除临时媒体和 token。

### 敏感能力需要可见状态和撤销

- 相机/麦克风：持续显示正在使用、用途和停止入口；
- 屏幕共享：展示共享对象，捕获结束立即同步；
- 定位 watch：说明持续采集，离开任务自动停止；
- 剪贴板：读取前说明字段，不后台监控；
- Bluetooth/USB/传感器：设备标识不进入普通分析日志；
- 通知：提供类别、频率、静默时段和设备级退订。

页面通常无法主动把系统 permission 重置回 `prompt`，但必须能停止资源、关闭业务开关并删除已收集数据。撤销是产品能力，不只是浏览器设置说明。

### 可访问性是降级设计的一部分

- 请求前用可聚焦文本说明用途、数据去向和替代方式；
- 不用 disabled 开关藏起 denied 的恢复说明；
- 相机、麦克风和定位活动同时提供文字与视觉状态；
- 错误不只靠颜色，并把焦点移动到可行动提示；
- 扫码、语音输入和拖动地图提供上传、键盘或文字替代；
- chooser 取消是正常用户决定，不显示红色“系统故障”；
- OS 设置路径会随平台变化，文案避免假设菜单名称永远一致。

后端仍要执行鉴权、配额、文件/媒体验证和业务授权，不能相信客户端声称“已经获得相机权限”。敏感结果不得放入 URL、普通分析事件和原始错误上报。

## 用失败路径、测试与观测证明可靠性

设备能力最常见的问题不是 happy path 写不出来，而是产品无法解释失败，或者 UI 显示已关闭但硬件仍在工作。错误模型和资源泄漏测试应与授权流程同时设计。

### 从异常映射到恢复动作

不要依赖浏览器本地化的 `error.message`。优先使用规范定义的 DOMException name、Geolocation code 和 API 状态，再映射到产品动作：

| 分类 | 可能事实 | 恢复方向 |
| --- | --- | --- |
| blocked | permission、policy、激活或系统限制 | 顶层打开、重新点击、设置说明、替代路径 |
| no-device | 没有满足需求的设备 | 连接设备或上传文件 |
| busy/unreadable | OS、硬件或其他应用占用 | 关闭占用、切换设备、重试 |
| overconstrained | 请求约束无解 | 放宽约束，不先追问权限 |
| timeout | 用户未决定或设备响应慢 | 允许退出，谨慎重试 |
| interrupted | track、lock、connection 已中断 | 立即更新 UI，按用户意图恢复 |
| unsupported | 浏览器/上下文没有能力 | 直接使用降级 |

`prompt` 不保证一定弹框，`denied` 也不保证页面内能恢复。某些浏览器提供一次性或短期授权，权限寿命可能是一次、一个 session、一天或长期；每次进入任务都重新核对当前状态与资源事实。

### 测试状态转换，也测试资源泄漏

用途策略的纯逻辑测试：

<<< ../../../examples/frontend/device-permissions/privacy-policy.test.mts

错误分类和媒体 owner 测试：

<<< ../../../examples/frontend/device-permissions/capability-lifecycle.test.ts

浏览器集成测试至少覆盖：

- unsupported、prompt、granted、denied；
- Permissions API descriptor 不支持；
- 响应头/iframe policy 禁止；
- 权限在浏览器或 OS 设置中撤销；
- 无设备、设备忙、约束失败、timeout；
- 用户忽略或取消系统提示；
- track mute/ended、watch clear、Wake Lock release；
- 组件在 query/request 完成前卸载；
- 页面隐藏、bfcache 恢复、WebView 内容进程重建；
- 登录切换和敏感数据删除。

自动化浏览器授权只能验证代码分支，不能替代真实系统对话框、摄像头指示灯、移动端后台策略和企业配置。目标设备矩阵应包含实际浏览器、OS、顶层/嵌入形态和权限撤销流程。

### 观测漏斗而不是收集敏感值

建议观察：

```text
功能入口曝光
→ 用户阅读用途并主动点击
→ 系统请求结果类别
→ 设备操作成功
→ 任务完成/降级完成
→ 资源释放
```

只看 granted 会把“授权后设备忙”和“功能最终完成”混在一起。指标记录 capability、步骤、结果分类、耗时、浏览器/壳版本和恢复路径，不记录坐标、剪贴板内容、原始设备 ID、音视频或完整异常 message。

资源观测可以记录匿名 session 是否正常 stop、异常 ended 和持续时间分桶。对疑似泄漏设置上限告警，但不要为了诊断上传敏感 payload。

### 常见失败模式及原因

#### 页面初始化批量请求

用户无法理解用途，浏览器也可能实施反滥用限制。把请求放回具体任务。

#### 把 query 当 request

状态查询不会替用户完成具体 API 的授权/chooser，也不是所有 descriptor 都兼容。以能力调用结果为本次事实。

#### 把一次 success 当永久 granted

权限会过期、撤销，设备也会中断。进入任务时重新核对，运行中监听资源。

#### denied 一律责怪用户

policy、OS、企业配置和上下文都可能阻止。文案只表达已知事实。

#### UI 关闭但资源仍活动

只修改 store 布尔值，没有调用 track/watch/lock/connection cleanup。资源必须有 owner 和泄漏测试。

#### iframe 使用 `allow="*"`

第三方导航或被攻陷内容获得超出用途的能力。Header 定义最大集合，iframe 精确收紧。

#### 同意扩展到第二用途

权限属于 origin，不等于产品用途无限复用。每个新用途重新说明、评审和最小化。

#### 日志记录原始值

坐标、设备 ID 和剪贴板会扩散到分析、告警和工单。使用分类和 correlation ID。

### 渐进落地路线

第一阶段统一 capability adapter、结果分类和降级 UI，清除 UA 判断与页面初始化请求。

第二阶段为媒体、定位 watch、锁和连接建立 owner；加入 Abort、撤销/中断监听、资源泄漏测试与 Permissions Policy 默认收紧。

第三阶段完成用途登记、数据流、保留删除、真实设备矩阵、隐私审计和生产漏斗。新增能力必须先通过“用途、最小数据、替代方案、owner、删除”评审，再进入代码。

### 上线检查清单

- [ ] 每项能力有具体用途、触发动作、数据类别、处理位置和保留期；
- [ ] 接口支持、上下文、policy、permission 和操作错误分别建模；
- [ ] Permissions API 不被当作统一申请接口或所有浏览器前置条件；
- [ ] 敏感能力在用户理解用途后由明确操作触发；
- [ ] 本次成功不被描述为永久授权；
- [ ] track、watch、lock、connection、object URL 有明确 owner 和清理；
- [ ] 主动 `track.stop()` 会显式更新 UI，不依赖 `ended`；
- [ ] Permissions-Policy 默认关闭非必要能力，iframe 精确委派；
- [ ] 拒绝、policy 禁止、无设备、设备忙、timeout、撤销均有恢复或降级；
- [ ] 不同业务用途不会静默复用同一敏感资源；
- [ ] 日志、分析和错误上报不采集敏感原始值；
- [ ] 原始数据、派生物、cache、备份和第三方都有删除策略；
- [ ] 顶层/嵌入、浏览器、OS、WebView 和真实设备矩阵已验证；
- [ ] 用户能看到活动状态、停止能力并删除相关数据。

## 总结

成熟的权限工程不是维护一个 `hasPermission` 布尔值，而是管理一条有限、可撤销的数据与资源生命周期：

- capability detection 只说明接口存在，不说明策略和设备可用；
- Permissions API 观察 `prompt/granted/denied`，具体 API 执行请求；
- 一次操作 success 不等于永久 granted，错误也不能随意归因给用户；
- Permissions Policy 决定上下文是否有资格请求，不代替用户同意；
- 活跃 track、watch、lock 和连接必须由 owner 确定性释放；
- 权限同意只覆盖说明过的用途，原始与派生数据都要最小化和删除；
- 拒绝和不支持时仍能完成核心任务，才是真正可靠的渐进增强。

当产品能准确回答“为什么现在请求、正在使用什么、数据去了哪里、怎样停止、拒绝后怎么办”，设备能力才是在服务用户，而不是让用户为技术实现让渡控制权。

下一节：[Web Worker、SharedWorker、WebAssembly 与前端计算架构](./web-worker-sharedworker-webassembly-and-frontend-compute-architecture.md)，会继续讨论主线程之外的计算边界、消息传输、取消、内存与故障隔离。

## 参考资料

- [MDN：Permissions API](https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API)
- [MDN：Permissions.query](https://developer.mozilla.org/en-US/docs/Web/API/Permissions/query)
- [MDN：Permissions Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Permissions_Policy)
- [MDN：Geolocation.getCurrentPosition](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition)
- [MDN：MediaDevices.getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [MDN：MediaStreamTrack.stop](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/stop)
- [MDN：Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API)
- [W3C：Permissions](https://www.w3.org/TR/permissions/)
- [W3C：Permissions Policy](https://www.w3.org/TR/permissions-policy/)
