---
title: 前端权限、设备能力与隐私工程架构
description: 系统掌握 Permissions API、设备能力请求、Permissions Policy、撤销、降级、数据最小化与生产治理
---

# 前端权限、设备能力与隐私工程架构

相机、麦克风、定位、剪贴板、通知和传感器不是普通函数：它们跨越浏览器沙箱，权限可能由用户、浏览器、操作系统、企业策略、HTTPS 和嵌入策略共同决定。成熟设计关注的不只是“能否调用”，还包括为什么请求、何时停止、收集什么、保存多久以及拒绝后怎样完成任务。

## 学习目标

- 区分能力支持、策略允许、权限状态和一次调用结果；
- 正确使用 Permissions API 查询和监听，而不把 query 当申请；
- 由明确用户意图触发各能力自己的请求 API；
- 用 Permissions Policy 限制顶层页面与 iframe；
- 设计撤销、资源清理、降级、隐私最小化和审计。

## 一、四层判定模型

```text
接口是否存在 → 安全上下文/平台是否允许
→ Permissions Policy 是否委派 → 用户/系统权限
→ 本次设备操作是否成功
```

`denied` 可能来自用户拒绝，也可能来自 Permissions Policy；UI 不应武断写“你拒绝了”。设备忙、约束不满足、超时和权限拒绝也必须分开。

## 二、Permissions API 只负责查询

`navigator.permissions.query()` 返回 `granted`、`prompt` 或 `denied`，不同浏览器支持的 permission name 不同，未知名称会 reject。Permissions API 并不提供统一 request；定位仍通过 geolocation、媒体通过 getUserMedia、通知通过 Notification API 请求。

<<< ../../../examples/frontend/device-permissions/permission-observer.ts

监听 `PermissionStatus.change` 能响应用户在设置中撤销权限；组件卸载时必须移除 listener。unsupported 不等于 denied，应回到具体能力 API 的渐进增强路径。

## 三、请求必须绑定用户意图

页面加载时批量请求相机、定位和通知既缺少上下文，也会降低授权率。先说明具体用途，用户点击功能后只请求这一步需要的最小能力。

<<< ../../../examples/frontend/device-permissions/capability-request.ts

定位示例限制超时、允许一分钟缓存且默认不用高精度；高精度会增加等待与能耗，只在业务确实需要时开启。剪贴板函数名标明必须由用户手势调用，因为浏览器通常要求瞬时激活。

## 四、权限与资源生命周期不同

granted 只是允许调用。麦克风 track、定位 watch、屏幕共享 track、Wake Lock、Bluetooth/GATT 连接都要由明确 owner 清理。停止使用功能时：

- `MediaStreamTrack.stop()`；
- `clearWatch()`；
- 释放 WakeLockSentinel/连接；
- 删除临时 object URL 和敏感内存；
- 更新 UI，让浏览器指示与产品文案一致。

页面通常不能主动重置系统权限，但必须停止资源并允许用户删除已收集数据。

## 五、Permissions Policy 是部署边界

响应头可默认关闭不需要的能力：

```http
Permissions-Policy: camera=(), microphone=(), geolocation=(self)
```

iframe 的 `allow` 只能在父级响应头允许范围内进一步收紧，不能重新开启父级已禁用能力。跨源嵌入应列出精确 origin，避免 `*`；导航到新 origin 后重新检查委派语义。

策略、HTTPS、用户权限会聚合到最终结果，因此排障必须同时查看响应头、iframe 属性、origin 和浏览器设置。

## 六、能力适配而非平台判断

不要用 user-agent 推断“iOS 没有剪贴板”或“Chrome 一定支持蓝牙”。能力 adapter 统一返回 granted、denied、unavailable、failed，并为 UI 提供可行动的恢复方式。

降级示例：定位失败允许手动选城市；相机失败允许文件上传；剪贴板失败选中文本手动复制；通知拒绝保留站内收件箱；生物识别不可用回到常规验证。

## 七、隐私工程从用途清单开始

<<< ../../../examples/frontend/device-permissions/privacy-policy.ts

每项能力记录 purpose、是否必需、保留期、处理位置、共享方和删除方式。模糊的“改善体验”不足以证明定位必要性。默认选择较低精度、较少字段、较短时间和本地处理。

权限同意不等于同意任意二次用途。相机授权用于扫码，不代表可上传连续画面；剪贴板读取不应变成后台监控。

## 八、敏感能力设计原则

- 相机/麦克风：展示实时启用状态，提供停止，服务端重新验证媒体；
- 定位：能用城市就不用坐标，能用一次定位就不用 watch；
- 屏幕共享：由用户选择 surface，捕获结束立即同步 UI；
- 剪贴板：读取比写入更敏感，不长期保存；
- 传感器/蓝牙/USB：设备标识可能用于指纹，限制枚举与日志；
- 通知：origin 权限之外还有业务类别、频率和静默时段。

## 九、错误、撤销与恢复

permission denied 提供设置说明和替代入口；policy denied 提示嵌入/管理员限制；device missing 提示连接设备；busy 提示关闭占用应用；timeout 允许重试；not supported 直接使用降级方案。不要依赖错误 message 文本分类，优先 DOMException name 和 API 定义。

### prompt 不是“肯定会弹窗”

`PermissionStatus.state === "prompt"` 表示尚未获得明确许可，但实际调用时浏览器可能显示提示，也可能因用户激活、平台规则或反滥用机制直接拒绝。UI 应写“点击后浏览器可能请求权限”，不能预先承诺一定出现对话框。

`denied` 也不一定能从页面内恢复。部分浏览器允许再次请求，部分要求用户进入地址栏或系统设置。恢复说明应按实际平台维护，并始终提供无需该能力的路径。

## 十、相机、麦克风与屏幕共享

媒体权限至少涉及三种不同事实：

```text
浏览器允许当前 origin 请求设备
→ getUserMedia/getDisplayMedia 本次返回 track
→ track 当前仍处于 live、enabled 且未被系统中断
```

拿到一次授权不代表设备永远可用。蓝牙耳机断开、系统切换输入、用户从浏览器指示器停止共享，都会让 track mute 或 ended。应用要监听生命周期并把真实状态同步到 UI。

约束是请求，不是保证。`echoCancellation`、分辨率、帧率、deviceId 和 facingMode 可能被调整或因过于严格而产生 `OverconstrainedError`。先用宽松约束获取能力，再根据设置和需求渐进调整。

屏幕共享尤其不能替用户静默选择窗口。每次共享由用户明确选择 surface，页面不能永久记住并后台恢复。共享画面可能包含其他应用、通知和密码，开始前说明风险，结束按钮始终可见，并监听 video track ended。

## 十一、定位不是一个布尔权限

定位结果同时包含坐标、accuracy 和时间戳。产品应根据业务判断结果是否足够新、精度是否足够，而不是拿到坐标就视为成功。

- 附近城市级内容通常不需要高精度 GPS；
- 配送位置可让用户在地图上确认，而不是自动提交原始坐标；
- `watchPosition` 持续产生敏感数据和能耗，离开功能立即 `clearWatch`；
- `maximumAge` 可复用近期结果，减少等待与设备访问；
- 超时、位置不可用和权限拒绝是不同恢复路径；
- 服务端存储前考虑降精度、短保留期和访问审计。

IP 推断位置不是“无权限定位”的等价替代：它精度低，也仍属于可能关联用户的个人数据，应明确用途。

## 十二、剪贴板的读写风险不对称

写入剪贴板常用于“复制链接”，通常由一次用户点击触发；读取可能暴露用户从密码管理器、聊天或其他应用复制的内容，敏感得多。

设计原则：

- 优先处理用户主动 paste 事件，而不是后台轮询读取；
- 读取前说明将解析什么，并只保留需要字段；
- 不把剪贴板内容自动写入日志、分析或表单提交；
- 写入失败时选中文本并提示手动复制；
- 不依赖 `clipboard-read`/`clipboard-write` query 在所有浏览器一致支持；
- 页面失焦或不可见时不尝试读取。

即便 permission query 返回 granted，浏览器仍可能要求瞬时用户激活或每次提示；具体 API 调用结果才是本次事实。

## 十三、其他设备能力的共同模式

Bluetooth、USB、Serial、HID、MIDI、Wake Lock、Web Share 和传感器各有不同 chooser、权限与兼容性，但可以使用同一设计框架：

1. 能力检测，不根据 UA 猜测；
2. 在用户选择具体功能后调用；
3. chooser 由浏览器展示，页面不伪造设备选择；
4. 只保存业务需要的最小设备标识；
5. 连接断开、页面隐藏、权限撤销时清理；
6. 重连前重新确认用户意图和设备身份；
7. 提供手动输入、上传或普通网络 API 等替代路径。

Wake Lock 只是尽力维持屏幕唤醒，可能因页面不可见、电量或系统策略被释放。应用应监听 release，并在重新可见且用户任务仍活动时谨慎恢复，而不是把它当永久系统锁。

## 十四、Permissions Policy 的继承

顶层响应头定义可用能力的最大集合，iframe `allow` 在此基础上继续收紧。父级已设置 `camera=()`，子 frame 无法通过 `allow="camera *"` 重新开启。

跨源嵌入要同时满足：

```http
Permissions-Policy: camera=(self "https://trusted.example")
```

```html
<iframe
  src="https://trusted.example/capture"
  allow="camera https://trusted.example; microphone 'none'"
  sandbox="allow-scripts allow-same-origin">
</iframe>
```

Header 与 `allow` 语法不同，部署时要用真实响应头和目标浏览器验证。iframe 导航到另一个 origin 后，原委派不应自动被理解为对新站点授权。第三方 frame 若不需要设备能力，显式设为 none。

Permissions Policy 不是用户同意：策略允许只代表该上下文有资格请求，最终仍受安全上下文、用户权限和 API 自身要求约束。

## 十五、隐私数据流与保留

对每项能力画出数据流：

```text
设备/系统 → 浏览器 API → 内存处理
→ 是否上传 → 哪个服务 → 哪些派生数据
→ 保存位置/时长 → 谁可访问 → 如何删除
```

“不保存原始音频”不代表没有隐私风险：转录文本、embedding、设备元数据和错误日志也可能敏感。删除政策要覆盖原始数据、派生物、缓存、备份和第三方处理方。

数据最小化不仅是减少字段，还包括降低采样频率、精度、持续时间和可关联性。例如只在本地判断“是否进入区域”，比持续上传位置轨迹更小化。

## 十六、框架集成与并发请求

权限 service 管理 API 与资源 owner，Pinia/Redux 只保存可序列化的快照。不要把 `MediaStream`、PermissionStatus、Geolocation watch ID 对应的清理函数持久化到 store。

多个组件同时请求同一能力时应合并进行中的 Promise，避免连续弹窗；但不同用途不能偷偷复用同意。例如“扫码”获得的相机流不应在用户不知情时转给“视频会议”。

路由离开、账号切换和页面隐藏分别定义清理策略。SSR 阶段没有 navigator，能力检测只能在客户端执行，并用稳定占位避免 hydration 不一致。

## 十七、可访问性与文案

- 权限请求前用可聚焦文本说明用途和替代方式；
- 不用 disabled 开关隐藏 denied 的恢复说明；
- 相机/麦克风活动同时提供文字和视觉状态；
- 错误不只靠颜色，并把焦点移到可行动提示；
- 扫码、语音、拖动地图均提供键盘/文字替代；
- OS 设置步骤不要假设所有设备菜单完全一致；
- 设备 chooser 取消属于正常用户决定，不显示红色系统故障。

## 十八、安全与反滥用

第三方脚本继承当前文档能力，减少脚本供应链并使用 CSP。敏感结果不进入 URL、分析日志和错误上报。后端不相信客户端“已获权限”，仍执行鉴权、配额和内容验证。iframe 使用 sandbox、精确 allow 与 postMessage origin 校验。

## 十九、测试与观测

纯逻辑测试用途政策：

<<< ../../../examples/frontend/device-permissions/privacy-policy.test.mts

浏览器测试覆盖 unsupported/prompt/granted/denied、设置中撤销、policy 禁止、无设备、设备忙、超时和页面卸载清理。真实设备验证移动端、嵌入、企业策略和 OS 权限组合。

指标记录能力、步骤、结果类别、耗时和恢复路径，不记录坐标、剪贴板内容、设备 ID 或媒体。监控请求曝光→用户操作→系统授权→功能成功，而不是只看 granted。

测试还要验证资源泄漏：track 是否 stop、watch 是否 clear、PermissionStatus listener 是否移除、页面进入 bfcache/恢复后状态是否重新核对。自动化授权只验证代码路径，不能替代真实系统对话框、设备指示灯和撤销流程。

## 二十、常见失败模式

1. 页面加载批量申请权限；2. query 等同 request；3. denied 一律责怪用户；4. granted 后永久采集；5. iframe allow 使用通配符；6. 权限拒绝后功能完全不可用；7. 日志记录坐标和设备标识；8. 只测试 Chrome granted 路径；9. 文案“关闭”但资源仍活动；10. 同意被扩展到未说明用途。

## 二十一、渐进落地路线

第一阶段统一 CapabilityResult、错误分类和降级 UI；第二阶段建立资源 owner、撤销监听和 Permissions Policy；第三阶段完成用途登记、数据流、保留删除、真实设备矩阵和隐私审计。新增能力必须先通过用途与替代方案评审，再进入代码。

## 二十二、上线检查清单

- [ ] 每项能力有明确用途、触发动作、最小数据和保留期；
- [ ] 支持/策略/权限/调用错误分层；
- [ ] Permissions API 不被当作统一申请接口；
- [ ] 敏感请求由明确用户手势触发；
- [ ] track/watch/lock/connection 有 owner 和清理；
- [ ] Permissions-Policy 默认关闭非必要能力，iframe 精确委派；
- [ ] 拒绝、撤销、无设备和不支持均有降级；
- [ ] 日志与分析不采集敏感原始值；
- [ ] 浏览器、OS、嵌入和真实设备矩阵已测试；
- [ ] 用户能查看、关闭并删除相关数据。

## 总结

权限工程的核心是“最小能力、明确意图、有限生命周期、可靠降级”。Permissions API 提供状态观察，具体 API 执行请求，Permissions Policy 提供部署级限制，产品与隐私策略决定是否应该请求。用户即使拒绝，也应能够理解原因并继续完成核心任务。

## 参考资料

- [MDN：Permissions API](https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API)
- [MDN：Permissions.query](https://developer.mozilla.org/en-US/docs/Web/API/Permissions/query)
- [MDN：Permissions Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Permissions_Policy)
- [MDN：Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API)
- [MDN：Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API)
- [W3C：Permissions](https://www.w3.org/TR/permissions/)
- [W3C：Permissions Policy](https://www.w3.org/TR/permissions-policy-1/)
