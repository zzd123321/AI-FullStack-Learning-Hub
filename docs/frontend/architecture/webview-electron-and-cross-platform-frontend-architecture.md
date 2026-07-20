---
title: WebView、Electron 与跨端前端架构
description: 系统掌握 Web 与原生边界、消息桥、Electron 进程隔离、WebView 安全、深链、版本兼容、测试与发布治理
outline: deep
---

# WebView、Electron 与跨端前端架构

把网页装进 WebView 或 Electron 窗口，并不会自动得到可靠跨端应用。页面一旦能调用文件系统、系统浏览器、剪贴板或原生 SDK，普通 XSS 就可能从“篡改页面”升级为“滥用本机权限”。跨端架构的核心不是让 JavaScript 尽可能方便地调用原生，而是建立最小、可验证、可版本化的能力边界。

这节课从一个贯穿始终的假设出发：**渲染页面有一天可能被攻陷，而原生层仍必须守住系统能力**。我们会先区分运行形态和信任边界，再设计桥协议与客户端生命周期；随后分别落到 Electron 和移动 WebView，最后处理深链、文件、认证、多版本发布、测试与回滚。

## 学习目标

- 区分浏览器、WebView、Electron renderer/preload/main 的信任边界；
- 设计版本化 request/response 桥协议；
- 实现请求关联、超时、清理、能力发现和错误模型；
- 理解 context isolation、sandbox 与最小 preload API；
- 限制导航、外链、窗口、下载、深链和文件能力；
- 设计 Web/原生独立发布下的兼容窗口；
- 建立安全、测试、可观测、签名和回滚治理。

## 先找到真正的安全边界

团队采用跨端技术通常是为了复用 UI、业务规则和前端人才，而不是为了复用所有平台细节。第一步不是选一个桥库，而是识别哪些代码仍处于浏览器沙箱，哪些代码已经拥有操作系统权限，以及攻击者控制页面后最多能走到哪里。

### 三种运行形态

| 形态 | 引擎与权限 | 主要风险 |
| --- | --- | --- |
| 普通 Web | 浏览器沙箱 | 浏览器兼容、网络与 Web 安全 |
| 原生 WebView | 系统 WebKit/Chromium + 原生桥 | 任意 frame 调桥、导航劫持、版本碎片 |
| Electron | 捆绑 Chromium + Node/Electron 主进程 | renderer 被攻陷后触达系统能力 |

共享 Vue/React UI 不代表共享所有运行时假设。能力差异应通过 adapter 暴露，而不是在组件中遍布 user-agent 判断。

### 共享 UI，不共享运行时假设

同一个 Vue 组件可以在浏览器、Android WebView 和 Electron renderer 中运行，但这些环境的更新渠道、存储、窗口模型、后退行为和可用能力并不相同。若组件里到处出现 `if (isElectron)`、`if (isAndroid)`，业务代码很快会与壳版本绑定。

更稳定的边界是语义化 adapter：

```ts
interface PlatformCapabilities {
  openHelpCenter(): Promise<void>;
  selectLearningMaterial(): Promise<readonly SelectedFile[]>;
  getRuntimeInfo(): Promise<RuntimeInfo>;
}
```

Web adapter 可以调用 `<input type="file">` 和 `window.open`；Electron/WebView adapter 通过受限桥调用原生。组件只关心“选择学习资料”，不关心底层是 `ipcRenderer`、Android interface 还是 WKWebView handler。

### 把 renderer 当不可信页面

页面可能因 XSS、第三方脚本、远程内容、供应链或导航错误被控制。原生层必须假设每条消息都可能恶意：校验 schema、来源、窗口身份、能力、参数、用户意图和速率。

```text
UI → typed capability client → versioned bridge
→ native dispatcher → authorization/policy → OS API
```

“消息来自自己的 WebView”不是授权证明。

XSS 并不是唯一入口。页面还可能加载被污染的远程 bundle、第三方脚本、广告 iframe，或者在重定向后意外进入另一个 origin。`contextIsolation` 和 sandbox 会降低攻陷后的能力，却不能把一个危险的 `readAnyFile(path)` 变安全；最终授权必须发生在拥有系统能力的一侧。

## 把函数调用还原成跨边界协议

页面写下 `await platform.selectFile()` 时，看起来像普通函数调用；底层实际经历了序列化、排队、进程或语言边界、系统 UI、异步响应和页面生命周期变化。把它当作小型分布式协议，许多设计要求就不再显得多余。

### 桥协议需要明确契约

<<< ../../../examples/frontend/cross-platform-bridge/bridge-protocol.ts

协议包含版本、唯一 ID、有限 method 和结构化 params。不要提供 `execute(command, args)`、`send(channel, any)` 这类万能入口。新增能力要新增明确 method、输入上限、错误码和审计策略。

响应区分成功和失败；错误传稳定 code，message 只用于展示/诊断。不要把原生堆栈、文件路径和密钥传回页面。

TypeScript 只能约束参与同一次编译的代码，不能验证来自旧壳、JSON、原生语言或受攻击 renderer 的运行时数据。示例因此不会把输入对象直接 `as BridgeRequest` 返回，而是逐字段校验后重建新对象；响应也经过同样的 runtime schema，未知错误码和畸形 envelope 不会进入业务代码。

对未知字段要先定义兼容策略。本示例对请求 envelope 和 method 参数采用严格白名单，避免参数走私；若生产协议需要前向兼容，可以允许明确声明为 optional 的新字段，但原生 dispatcher 仍只读取自己认识的字段。

### 请求关联、超时与生命周期

<<< ../../../examples/frontend/cross-platform-bridge/bridge-client.ts

异步桥必须处理乱序响应、重复 ID、超时、页面销毁和迟到响应。示例先登记 pending 请求再发送，兼容同步 mock；无论成功、失败、超时、Abort 还是 `dispose()`，都从 Map 删除请求并清理 timer/listener。无效原生响应被丢弃，迟到响应也不能重新唤醒已经失败的业务流程。

Abort 和超时只表示页面**停止等待**，不自动撤销原生操作。若调用已经打开系统文件框或开始写文件，任务仍可能完成。因此带副作用的方法需要幂等键；真正可取消的长任务还要有明确 `task.cancel` 协议。

组件卸载不一定代表全局任务应取消：上传任务可能由页面级 service 拥有，而预览弹窗请求由组件拥有。应该由创建任务的所有者决定 Abort。同步 IPC 会阻塞 renderer 与主进程协作，Electron 官方也建议优先使用异步 `invoke/handle`。

示例客户端适合 `postMessage`、WebView handler 等需要自己关联响应的 transport。Electron 的 `ipcRenderer.invoke()` 已经为一次调用关联返回 Promise，可以直接在 preload 的窄函数中使用；此时仍需要 runtime schema、超时/生命周期策略和 main 端授权，但不必为了形式统一再叠一层消息 Map。

长任务不要让单次桥调用挂数分钟。返回 task ID，再通过订阅或查询状态，并支持取消和幂等。

### 原生 dispatcher 是安全边界

<<< ../../../examples/frontend/cross-platform-bridge/native-dispatcher.ts

dispatcher 同时接收解析后的业务请求和**由平台 adapter 产生的策略上下文**。`authorizedSender` 不能由页面放进 payload；Electron main 或移动原生层必须从真实窗口、frame、当前 origin 和会话状态推导它。

示例只允许产品 allowlist 中的精确 HTTPS origin（包括端口），并让文件选择返回不透明 token 与展示元数据，而不是任意本机路径。生产还要结合用户意图、租户策略和 OS 权限。外链应交给系统浏览器，不能在带高权限桥的 WebView 内任意加载。

能力发现返回语义能力和版本，而不是只返回平台名：

```json
{ "selectFile": { "version": 2 }, "biometric": false }
```

### 错误与长任务也是协议

稳定错误码应表达调用者下一步能做什么：

| 错误 | UI 行为 |
| --- | --- |
| `UNSUPPORTED` | 隐藏入口或展示平台替代路径 |
| `UNAUTHORIZED` | 停止调用并记录安全事件，不自动重试 |
| `INVALID_ARGUMENT` | 修复页面输入或提示用户 |
| `USER_CANCELLED` | 正常结束交互，通常不报错 |
| `VERSION_MISMATCH` | 进入升级或兼容页面 |
| `NATIVE_FAILURE` | 有限重试或提供诊断入口 |

不要把原生 exception、堆栈和本机路径塞进 `message`。原生层可以用 correlation ID 记录受控诊断，页面只收到稳定且不敏感的信息。长任务应尽快返回 task ID，通过查询或事件报告状态；单次请求挂几分钟既难取消，也容易被页面重载切断。

## 在 Electron 与 WebView 中落实边界

协议只定义了“说什么”，平台代码还要保证“谁能说”。Electron 的进程隔离与移动 WebView 的 frame/origin 行为不同，不能用同一段“桥初始化成功”代替平台安全策略。

### Electron 的进程模型

- main：应用生命周期、窗口与高权限系统 API；
- renderer：渲染 Web UI，默认不应拥有 Node 权限；
- preload：在隔离上下文中暴露经过筛选的窄 API；
- utility process：适合隔离 CPU 密集或不可信处理。

`contextIsolation` 隔开页面 world 与 preload world，sandbox 限制 renderer 进程能访问的系统资源，`nodeIntegration: false` 则不把 Node 原语交给页面。三者是不同层次的纵深防御。现代 Electron 已默认启用 isolation 和 renderer sandbox，但应用仍应显式审查配置，并保持 Electron/Chromium/Node 在受支持版本。

main 进程不在 Chromium renderer sandbox 内。不要让 main 直接解析不可信媒体或执行重 CPU 工作；可把适合隔离的处理放进 utility process，并继续使用最小输入输出协议。

### preload 只暴露能力函数

<<< ../../../examples/frontend/cross-platform-bridge/electron-preload-contract.ts

不要暴露整个 `ipcRenderer`、任意 channel send 或带 event 对象的回调。否则 XSS 可以枚举内部 channel，或者从 event 重新取得高权限对象。preload 应包装固定能力和参数，main 再做一次 runtime 校验。Electron 29 起也不再允许把 `ipcRenderer` 本身穿过 `contextBridge`，但“API 传不过去”不等于自定义 wrapper 自动安全。

### main handler 再验证调用者

<<< ../../../examples/frontend/cross-platform-bridge/electron-main-handler.ts

示例同时核对 `webContents.id`、`senderFrame.parent === null` 和精确、非 opaque origin：来自另一个窗口、子 frame、已导航页面或销毁后变成 `null` 的 frame 都不能继承能力。`file:` 页面常得到无法作为身份边界的 opaque origin；Electron 官方也建议避免 `file://`，应用可以注册受控 custom protocol，并在创建窗口时保存不可变的授权上下文，而不是临时相信 renderer 自报的 URL。

窗口销毁后必须注销 handler/listener，避免权限残留和测试污染。若应用存在多个窗口，应按 `WebContents.ipc`/frame 范围或一个集中路由器管理所有权，不能让多个窗口反复覆盖同一个全局 `ipcMain.handle`。

### WebView 桥的额外风险

Android 官方明确指出，`addJavascriptInterface` 注入的对象会对 WebView 的所有 frame 可见，而且应用无法通过该接口可靠验证调用 frame 的 origin。因此，只要页面可能包含不可信 iframe 或发生外域导航，就不应继续保留高权限 interface。较新的 message channel 改善了协议形态，但如果 endpoint 没有 origin 校验，同样会接受恶意发送者。

WKWebView 通过 `WKScriptMessageHandler` 接收消息；handler 名称不是秘密，也不是安全边界。原生侧仍需验证 frame、页面来源和 payload，并在生命周期结束时移除 handler。避免加载任意远程页面后仍保留高权限能力。

导航开始、重定向、弹窗和 iframe 都要重新应用策略，不能只检查初始 URL。

### 导航与外部内容

建立 allowlist：允许的精确 HTTPS origin、应用自己的安全 custom protocol、系统外开目标。用 `URL` 解析器比较 `origin/hostname`，不要使用 `startsWith("https://trusted.example")`，否则 `trusted.example.evil.test`、userinfo 或 URL 归一化都可能绕过。

默认拒绝 `file:`、`javascript:`、`data:`、未知自定义 scheme、任意下载和新窗口。Electron 需要同时处理初始 `loadURL`、`will-navigate`、服务端重定向和 `setWindowOpenHandler`；移动 WebView 也要在每次 navigation action 上重评估，而不是只检查第一次 URL。

OAuth 等临时外域流程用专门低权限窗口或系统认证会话，不应让整个远程站点继承主应用桥。证书错误不能“开发方便”而全局忽略。

## 把系统能力接入可恢复的应用生命周期

桥安全之后，还要解决跨端产品真正棘手的部分：应用可能冷启动、暂停、恢复、更新或切换账号；深链和系统选择器可能在页面尚未 ready 时到达。平台事件必须变成可排队、可去重、可重新鉴权的领域输入。

### 深链不是可信命令

<<< ../../../examples/frontend/cross-platform-bridge/deep-link.ts

自定义 scheme、Universal Link 和 App Link 都可能由其他应用或网页触发。示例限制总长度、scheme、route、参数名、重复参数与每个值的格式，然后重建内部目标；遇到未知参数会拒绝整条 link，而不是悄悄删除后继续执行。

解析成功只说明“语法允许”，不说明当前用户有权查看目标。页面仍要经过正常登录、租户和资源授权。深链不能直接执行删除、付款、授权或文件操作；最多导航到需要用户再次确认的页面。

冷启动与热启动要走同一队列：原生先保存 link，等 Web runtime ready 后投递，并用 event ID 去重。

### 文件与系统能力

页面请求“选择文件”，原生返回用户明确选择的受控句柄或短期 token，加上文件名、MIME 和大小等展示信息。后续读取通过 `file.readChunk(token, offset, length)` 之类受限能力完成；token 绑定窗口、账号、过期时间和最大范围。直接返回 `/Users/.../secret.txt` 既泄露本机结构，也诱导团队继续添加任意路径读取接口。

写文件、剪贴板、摄像头、定位和通知都应绑定可见用户操作、最小范围和 OS 权限说明。系统 permission granted 也不等于任何页面脚本都获准调用；原生层仍需执行应用自己的能力策略。

不要允许 Web 参数决定 shell 命令、可执行路径或未转义文件名。高风险操作增加原生确认和审计。

### 认证与存储

WebView cookie、原生 Keychain/Keystore 和 Electron 安全存储属于不同威胁模型。系统安全存储可以降低磁盘静态窃取风险，却无法在应用进程已被攻陷时神奇保护所有明文使用。长期 refresh token 尽量留在受控原生层，页面通过短期、范围有限的会话访问；不要提供 `getRefreshToken()` 之类桥方法。

登出需要原子清理 cookie、Web storage、原生 token、下载和后台任务。多账号数据必须按身份隔离。

### ready、暂停与恢复

页面与壳需要显式 ready 握手。原生可以先缓存冷启动深链、文件打开事件和窗口参数，等页面报告协议版本与当前账号就绪后再投递；每个事件携带稳定 ID，页面确认后删除。仅依赖“DOMContentLoaded 已触发”无法证明 store、router 和认证恢复已经完成。

移动端暂停后可能回收 Web 内容进程，Electron renderer 也可能崩溃或被重载。恢复流程应重新协商 capabilities、重建订阅、重放未确认事件，并让有副作用请求依靠幂等键判断是否已经执行。

### 性能与体验

桥消息通常经过 structured clone 或 JSON 序列化。不要逐帧传鼠标点、大型状态树或 Base64 文件；Base64 还会增加体积和复制成本。音视频、文件和大二进制使用专门流、MessagePort、共享缓冲区（满足隔离条件时）或临时文件通道，桥只传 metadata、token 和背压信号。

跨端 adapter 还要统一 safe-area、软键盘、系统返回键、窗口尺寸、缩放和前后台事件，但不能抹掉平台惯例。例如 Android 返回键与桌面窗口关闭语义不同，应映射为领域意图，而不是强行调用同一段 `history.back()`。

## 为壳、Web 与服务端设计兼容窗口

跨端应用至少有三个独立版本：已安装壳、页面 bundle 和服务端 API。用户不会同步升级它们；即使团队只发一个安装包，缓存和崩溃恢复也会制造短暂混合版本。

### 版本兼容

原生发布和 Web 发布速度不同，线上必然同时存在旧壳+新页面、新壳+缓存旧页面。协议需要：

- major version 拒绝不兼容请求；
- capability negotiation；
- 新字段可选、旧字段保留兼容窗口；
- 服务端按壳版本提供最低支持策略；
- Web 远程发布具备灰度和 kill switch；
- 不把“平台版本”当“能力存在”。

协议 major version 用于拒绝无法安全理解的 envelope；method capability version 用于表达某项能力的演进。新增 optional 字段通常不需要提升 major，改变字段含义、认证规则或副作用语义则需要新 method/version。不要用 Electron 版本、Android API level 或 user-agent 替代 capability negotiation。

服务端可以维护最低支持壳版本，但“阻断旧版本”本身也要有离线和故障策略。旧壳至少应能展示清晰升级说明、保存未同步数据，并避免进入半可用高风险流程。

### UI 来源与更新模型

Electron 本地资源、远程 Web 内容和 Service Worker cache 不能互相争夺版本。常见模型有：

- UI 随安装包发布：版本一致性强，但修复速度受应用更新限制；
- 远程 UI：发布快，但旧壳会立即执行新代码，桥兼容和供应链风险显著提高；
- 签名 bundle 下载：可以灰度和回滚，但需要完整签名、原子切换与缓存治理。

不要在没有协议和回滚设计时混用模型，例如本地首页又注册 Service Worker 去覆盖安装包资源。远程代码只要能触达原生能力，其构建、审查、CSP、依赖和发布权限就应按原生安全等级治理，而不是当作普通网页热更新。

自动更新必须验证签名，采用原子替换与可恢复切换。更新时先处理未保存数据；main 更新或重启后，旧 renderer 不能长期继续运行，应重新握手并在不兼容时刷新。回滚也必须考虑已经迁移的本地数据库和下载 bundle，不能只把可执行文件换回旧版。

### 认证与多版本数据

壳与 Web 都可能缓存账号状态。登录和登出协议需要明确谁拥有 token、cookie 如何建立、页面崩溃后怎样恢复，以及 Web 远程版本是否仍能理解原生会话。多账号切换时，文件 token、深链队列、下载、Web storage 和后台任务都要按 principal 隔离。

本地 schema migration 与桥协议一样需要兼容窗口：新壳写入的数据若旧 bundle 无法读取，就不能随意回滚。迁移应可重入、分阶段，并在真正不可逆前保留恢复点。

## 用测试、观测和发布治理守住边界

跨端安全不能靠一次代码 review 证明。协议 fixtures、平台测试、真实安装包 E2E、发布签名和生产遥测要共同证明：不可信页面无法越权，允许的能力在多版本和故障条件下仍可恢复。

### 测试从纯协议逐步走到真实壳

纯逻辑测试覆盖未知 method、危险 URL 和深链 allowlist：

<<< ../../../examples/frontend/cross-platform-bridge/bridge-protocol.test.mts

客户端与 dispatcher 测试覆盖运行时响应校验、Abort、来源策略和外链 allowlist：

<<< ../../../examples/frontend/cross-platform-bridge/bridge-runtime.test.ts

还需：

- contract tests：Web 与 Android/iOS/Electron 共享 JSON fixtures；
- renderer tests：缺少能力、超时、迟到响应、dispose；
- native tests：来源、frame、参数、权限和 OS API mock；
- E2E：冷/热深链、导航重定向、弹窗、更新与崩溃恢复；
- 安全测试：XSS 后尝试枚举/滥用所有桥能力。

contract fixtures 不只验证 TypeScript；Android/Kotlin、iOS/Swift、Electron main 和 Web 都应读取同一组合法/非法 JSON。安全 E2E 可以在测试页面主动模拟 XSS，尝试从 iframe、外域导航和新窗口枚举所有能力，验证原生层仍拒绝。

自动化无法代替真实平台：至少在目标 OS 上覆盖签名安装包、系统文件框、权限撤销、冷/热深链、睡眠恢复、离线更新、renderer/Web 内容进程崩溃和回滚。

### 可观测性

记录 bridge version、method、request ID、耗时、结果 code、壳/Web build、平台和受控窗口标识；不记录 token、完整 URL query、文件路径、深链参数或文件内容。监控未知 method、版本不匹配、超时、无效响应、拒绝来源、renderer 崩溃和更新失败。

Web 和原生日志用 correlation ID 串联，但各自遵守隐私与保留期。

### 安全基线

- Electron renderer 禁用 Node integration，启用 isolation/sandbox；
- preload 不暴露 ipcRenderer 或任意 channel；
- WebView 只给可信主 frame 安装最小桥；
- 每条消息 runtime 校验、授权、限长和限速；
- 导航、重定向、新窗口、下载和外部 scheme 默认拒绝；
- CSP、依赖更新、代码签名和自动更新签名启用；
- 原生密钥不返回页面；
- 远程内容与高权限桥不无条件组合。

Electron 还应设置权限请求处理器、CSP、导航与新窗口策略，不关闭 `webSecurity`，不忽略证书错误，并评估适用的 fuses。移动端应关闭不需要的文件/content access、调试和混合内容能力。安全默认值会随平台版本变化，升级时必须重新查看官方 breaking changes 与安全清单。

### 常见失败及其因果

#### 用 user-agent 分支代替能力发现

平台名不能证明 capability 存在，更不能表达某项能力的协议版本。结果是同一平台的旧壳崩溃或新壳无法启用功能。

#### 暴露 `send(channel, payload)` 万能桥

所有内部 IPC 都变成页面攻击面；新增 main handler 会在不知情时自动暴露给 renderer。应按业务能力提供窄函数。

#### 只做 TypeScript 类型

旧壳、原生语言、JSON 和恶意输入不受 TypeScript 约束。两侧都必须运行时解析并限制长度。

#### 只检查初始 URL

合法页面可以重定向、打开窗口或嵌入 iframe。每次 navigation、redirect、new-window 和消息发送都要重新执行策略。

#### 超时后直接重试副作用

超时只说明没收到响应，原生可能已写入成功。没有幂等键时会重复保存、支付或导出。

#### 桥上传输 Base64 大文件

编码膨胀、反复复制和无背压会阻塞两个运行时。使用 token、流或专门数据通道。

#### 远程 Web 更新绕过原生审查

远程 bundle 仍能调用原生能力，因此一次前端发布可能等价于改变桌面/移动应用行为。它需要相同等级的供应链与灰度控制。

#### 日志记录原始 payload

文件路径、深链参数、token 和用户内容会跨越 Web/原生日志系统扩散。记录 method、code、版本和 correlation ID 即可。

### 渐进落地

第一阶段只建立平台无关 capability interface、Web adapter、unsupported UI 和 runtime info，不急于接入高权限能力。

第二阶段实现版本化 envelope、最小 preload/handler、来源校验、contract fixtures、稳定错误码和生命周期清理。先选择低风险只读能力证明边界。

第三阶段再加入文件、深链、多窗口、长任务、自动更新、灰度、崩溃恢复和安全演练。每新增能力先写明调用者、用户意图、输入上限、副作用、取消/幂等、日志和撤销路径。

### 上线检查清单

- [ ] renderer/WebView 按不可信输入处理；
- [ ] 协议有版本、ID、有限 method、schema 与稳定错误码；
- [ ] 请求有超时、清理、幂等与迟到响应策略；
- [ ] Electron isolation/sandbox/Node integration 配置正确；
- [ ] Android/iOS handler 只对可信内容和 frame 开放；
- [ ] 导航、外链、弹窗、下载和深链均有 allowlist；
- [ ] 文件、剪贴板、摄像头等绑定用户意图和最小权限；
- [ ] 认证密钥留在原生安全存储，登出完整清理；
- [ ] 壳/Web/API 存在多版本兼容与 kill switch；
- [ ] contract、E2E、安全、更新和回滚均已验证；
- [ ] 日志可关联但不泄漏敏感参数。

## 总结

跨端前端的本质是把 Web UI 与系统能力隔在一条可审计边界两侧：

- 组件依赖语义能力，不依赖平台名和万能桥；
- 请求与响应都是不可信协议数据，需要版本、关联、runtime schema 和上限；
- preload/handler 只暴露最小接口，dispatcher 根据真实 sender context 最终授权；
- 超时和 Abort 不等于原生任务取消，副作用依赖幂等与任务协议；
- 导航、深链、文件、认证和生命周期都可能跨越信任边界；
- 壳、Web、API 与本地数据永远存在多版本，发布和回滚必须共同设计。

只有攻击者控制 renderer 后仍无法扩张权限，合法用户在更新、离线、恢复和多账号场景中仍能理解当前状态，代码复用才没有以安全和可靠性为代价。

下一节：[前端权限、设备能力与隐私工程架构](./frontend-permissions-device-capabilities-and-privacy-engineering.md)，会回到浏览器与设备 API，继续学习权限状态、最小采集、撤销、降级和隐私生命周期。

## 参考资料

- [Electron：Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [Electron：Using Preload Scripts](https://www.electronjs.org/docs/latest/tutorial/tutorial-preload)
- [Electron：Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [Electron：Inter-Process Communication](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [Electron：Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron：Process Sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox)
- [Electron：webFrameMain](https://www.electronjs.org/docs/latest/api/web-frame-main)
- [Android：WebView](https://developer.android.com/reference/android/webkit/WebView)
- [Android：WebView Native Bridge 风险](https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges)
- [Android：Security checklist](https://developer.android.com/privacy-and-security/security-tips)
- [Apple：WKScriptMessageHandler](https://developer.apple.com/documentation/webkit/wkscriptmessagehandler)
