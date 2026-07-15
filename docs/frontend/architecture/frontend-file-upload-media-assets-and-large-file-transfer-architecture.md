---
title: 前端文件上传、媒体资产处理与大文件传输架构
description: 系统掌握 File 与 Blob、文件校验、上传状态机、分片并发、断点续传、对象存储直传、完整性、安全、可访问性与生产治理
---

# 前端文件上传、媒体资产处理与大文件传输架构

“选择文件然后 POST”只覆盖了最小演示。生产上传要同时面对不可信文件、弱网络、页面刷新、大文件内存、临时授权、并发控制、重复请求、对象存储协议、服务端转码和用户随时取消。

更重要的是，下面这些状态完全不同：

```text
用户选择文件
→ 浏览器完成初步检查
→ 原始字节传输完成
→ 对象存储合并成功
→ 服务端安全扫描完成
→ 图片/视频转码完成
→ 业务资产正式可用
```

如果进度条到 100% 就显示“发布成功”，后续扫描或转码失败会让 UI、业务数据库与对象存储互相矛盾。本课从浏览器文件模型出发，逐步建立可恢复、可观测、可治理的上传系统。

## 学习目标

完成本课后，你应该能够：

- 解释 `File`、`Blob`、object URL、流与文件输入框的职责；
- 理解 `accept`、扩展名和 `File.type` 为什么都不是安全边界；
- 根据大小、网络与产品需求选择单请求、分片上传或 tus；
- 设计由后端控制的上传会话、对象键、短期权限和完成协议；
- 正确实现切片、有限并发、重试、进度、暂停、取消和恢复；
- 区分传输完整性、内容真实性、安全扫描与业务合法性；
- 管理图片、视频、PDF 等媒体预览和异步处理生命周期；
- 为可访问性、资源预算、测试、观测和存储清理建立工程策略。

## 一、上传不是一个请求，而是一条资产流水线

建议把系统拆为四个平面：

```text
数据面：File → Blob 分片 → HTTP → 临时对象 → 正式资产
控制面：创建会话、签发权限、查询分片、完成、终止
状态面：校验、上传、暂停、合并、处理、成功、失败
治理面：配额、鉴权、审计、扫描、生命周期、成本
```

课程示例先声明不可破坏的契约：

<<< ../../../examples/frontend/file-upload-architecture/upload-contract.md

组件不应同时承担四个平面的全部职责。Vue/React 组件负责呈现与用户意图；上传 service 负责协议；后端负责权限与会话；异步媒体管线负责可信资产生成。

## 二、浏览器里的 File 与 Blob

`Blob` 表示不可变的字节序列和一个可选 MIME 类型。`File` 继承 `Blob`，增加 `name` 与 `lastModified` 等用户选择文件的元数据。

常用能力：

- `file.size`：字节数；
- `file.type`：浏览器提供的 MIME 提示，可能为空；
- `blob.slice(start, end)`：取得半开区间 `[start, end)`；
- `blob.arrayBuffer()`：把完整 Blob 读进内存；
- `blob.text()`：按文本读取；
- `blob.stream()`：得到 `ReadableStream`；
- `URL.createObjectURL(blob)`：为 `<img>`、`<video>` 等创建本地引用。

浏览器不会因为用户选中了文件，就把任意本地路径开放给页面。页面获得的是经用户授权选择的 `File` 对象；文件名也通常不包含本机完整路径。

### 不要默认把大文件读进内存

`await file.arrayBuffer()` 会为整个文件分配连续结果。一个数 GB 视频不应该为了上传先变成完整 ArrayBuffer、Base64 或 JSON。通常可以直接把 `File`/`Blob` 作为请求体，或者用 `slice()` 按区间上传。

Base64 还会增加体积，并产生字符串与二进制之间的额外复制。它适合很小的嵌入数据，不是通用上传格式。

## 三、文件选择是可访问交互

标准入口是 `<input type="file">`。`multiple` 允许多选，`accept` 为选择器提供类型提示，`capture` 在部分移动设备上可建议摄像头或麦克风来源。

不要用 `display: none` 隐藏文件输入后只留下不可聚焦的 `<div>`。可使用关联的 `<label>`，或保留视觉隐藏但仍可聚焦的 input。拖放只是增强能力，键盘和触摸用户仍需标准入口。

拖放区需要：

- 明确的可见边界和文本说明；
- `dragover` 阻止默认行为后再处理 `drop`；
- 与文件选择器相同的校验路径；
- 不把文件夹或非文件项误当成普通文件；
- 上传队列可被键盘浏览和删除。

`accept="image/*"` 只影响选择体验，用户仍可能通过拖放或修改文件绕过它。

## 四、客户端校验是即时反馈，不是信任边界

文件名、扩展名、`File.type` 和魔数检查都由不可信客户端提供或执行。客户端校验的价值是尽早提示明显错误、减少无意义流量；服务端必须重新验证。

示例同时检查大小、扩展名和少量文件头：

<<< ../../../examples/frontend/file-upload-architecture/file-policy.ts

这个检测器只能识别少数容器签名，不能证明文件安全，也不能完整识别复杂格式。例如：

- ZIP 可能是 Office 文档、APK，也可能是压缩炸弹；
- SVG 是图像格式，但可包含脚本、外链和复杂解析行为；
- JPEG 头正确不代表后续字节能被安全解码；
- MP4 是容器，内部编码、轨道和时长仍需解析；
- PDF 可能包含脚本、附件或解析器攻击面。

服务端还要执行授权、配额、真实内容解析、恶意软件扫描、解压预算和业务规则。

## 五、预览不是验证

object URL 让浏览器控件直接引用 Blob，避免先转成 Base64。每次 `createObjectURL` 都产生需要管理的 URL；长生命周期页面应在替换、移除或组件卸载时释放。

<<< ../../../examples/frontend/file-upload-architecture/object-url-preview.ts

不能在设置 `img.src` 后立刻 revoke，否则用户可能无法打开图片或使用上下文菜单。应在预览真正被移除时释放。

本地能播放视频不等于服务端处理必然成功。浏览器支持的编解码器、服务端转码器和目标设备矩阵可能不同。预览 UI 应明确“本地预览”和“已处理资产”的区别。

### 图片方向与像素炸弹

图片文件字节数不大，解码后的像素内存却可能很高。`width × height × 4` 只是常见 RGBA 表面的粗略下限，还未包含解码器、缩放层和多份画布。读取尺寸、生成缩略图和处理 EXIF 方向都要有像素预算；可信变体通常应由服务端重新编码。

## 六、先选上传协议

| 场景 | 推荐起点 | 主要特点 |
| --- | --- | --- |
| 小文件表单 | `multipart/form-data` 到应用后端 | 简单，业务字段一起提交 |
| 中小文件直传 | 后端签发单对象短期 URL | 应用服务器不转发主体 |
| 大文件与弱网络 | 对象存储 multipart | 分片独立并发与重试 |
| 跨供应商可恢复协议 | tus | 用资源 URL 与 offset 恢复 |
| 实时生成的数据 | 流式请求或专门摄取协议 | 来源本身没有完整 File |

不要看到“大文件”就固定切成某个大小。对象存储有最小分片、最大分片数、校验和编号规则；服务器应根据供应商限制和文件大小返回合法 `partSize`。

## 七、应用后端中转还是对象存储直传

### 后端中转

浏览器把字节发给应用服务器，服务器再写对象存储。优点是策略集中、协议简单；缺点是应用服务器承担双倍网络路径、连接时间和扩容压力。

### 直传

浏览器先请求自己的后端创建会话，再使用短期预签名 URL 上传到对象存储。应用后端仍然负责：

- 验证当前用户和业务资源；
- 生成不可猜测且不由原文件名决定的对象键；
- 限制大小、类型、分片数、有效期和允许的操作；
- 记录 upload ID、asset ID 与所有权；
- 完成后验证并推动扫描/转码。

预签名 URL 是在有效期内可使用的能力凭证。不要写入分析日志、错误上报、聊天消息或长期本地存储。

## 八、三阶段 multipart 协议

以常见对象存储协议为例：

```text
1. create：后端初始化上传，返回 uploadId、assetId、partSize
2. upload parts：各分片独立上传，记录 partNumber 与 ETag/校验值
3. complete：按协议提交分片清单，对象存储合并对象
```

初始化后的未完成上传可能持续占用存储并产生费用。系统必须有显式 abort API 和后台生命周期清理，不能只依赖浏览器页面善后。

完成接口要幂等：客户端超时并不知道服务端是否已经成功，因此同一个完成请求可能重放。服务端应返回同一资产结果，而不是创建第二份业务记录。

## 九、分片规划：字节边界必须稳定

<<< ../../../examples/frontend/file-upload-architecture/chunk-plan.ts

这里使用半开区间，因此：

```text
part 1: [0, partSize)
part 2: [partSize, 2 × partSize)
最后一片: [start, file.size)
```

重试同一 `partNumber` 必须读取同一字节范围。恢复时若服务器返回的 partSize 与本地旧计划不一致，应以服务端会话为准或重新创建，不能悄悄混用。

示例中的 `weakFileFingerprint` 只由名称、大小和修改时间组成，存在碰撞；它适合查找“可能的恢复记录”，不能证明用户重新选择了同一内容。

## 十、上传状态机：100% 之后还有状态

<<< ../../../examples/frontend/file-upload-architecture/types.ts

<<< ../../../examples/frontend/file-upload-architecture/upload-reducer.ts

核心路径：

```text
idle → validating → creating-session → uploading
uploading ⇄ paused
uploading → completing → processing → completed
活动状态 → failed / cancelled
```

`uploadedBytes === totalBytes` 只说明客户端已发送所有分片。合并、完整性校验、安全扫描、转码和业务发布都可能失败，因此还需要 `completing` 与 `processing`。

不要用 `isUploading`、`isSuccess`、`isProcessing` 三个可任意组合的布尔值表达流程，否则很容易同时出现“上传中且成功”。

## 十一、并发不是越高越快

分片并发可以隐藏单请求延迟，也能只重试失败部分。但每个并发都会消耗：

- 浏览器连接、内存和事件处理；
- 用户上行带宽；
- 签名与对象存储请求配额；
- 移动设备电量；
- 同页面其他 API 的网络机会。

一般从 2～4 个并发开始，通过真实网络指标调整。多文件上传应有全局调度器，而不是每个文件各开四个请求，导致十个文件瞬间产生四十个并发。

完整协调器将协议 API 与字节 transport 依赖注入：

<<< ../../../examples/frontend/file-upload-architecture/multipart-upload.ts

它具备这些关键行为：

- 使用服务端返回的分片大小；
- 跳过已经完成的分片；
- 限制并发；
- 每次重试重新签名，避免复用过期 URL；
- 完成前按 `partNumber` 排序；
- 失败时保留 upload session，而不是擅自销毁可恢复数据。

## 十二、上传进度的真实语义

截至当前标准能力，Fetch 没有类似 XHR `upload.progress` 的通用上传进度事件。浏览器端需要准确上传进度时，XHR 仍是务实方案：

<<< ../../../examples/frontend/file-upload-architecture/xhr-part-transport.ts

跨源直传若要读取 `ETag` 等响应头，对象存储 CORS 必须用 `Access-Control-Expose-Headers` 暴露它；只允许 `PUT` 还不够。请求方法、来源、请求头和响应头都应按最小权限配置。

Fetch request streaming 与 `duplex: "half"` 是另一类能力：它允许请求体边生产边发送，不等于自动提供已上行进度，也不能替代对象存储 multipart 的恢复协议。采用前必须做目标浏览器能力验证和服务端兼容测试。

### 重试时进度为什么会倒退

失败请求已经报告的字节可能未被服务端接受。重试开始时，该分片的“本次尝试进度”应清零；否则总进度可能超过 100%。

<<< ../../../examples/frontend/file-upload-architecture/progress-ledger.ts

UI 可以把进度平滑显示，但不能伪造完成。更清晰的文案是“正在上传 72%”“正在校验”“正在处理视频”，而不是所有阶段都叫“上传中”。

## 十三、错误分类、退避与幂等

可以自动重试的通常是网络错误、408、429 和部分 5xx。常见的 4xx 表示认证、签名、请求格式或业务规则有问题，盲目重试只会放大压力。

<<< ../../../examples/frontend/file-upload-architecture/retry-policy.ts

指数退避配合 jitter，能避免大量客户端在服务恢复瞬间同时重试。重试预算必须有限，并尊重服务端 `Retry-After`（若协议提供）。

安全重试还依赖幂等：同一个 part number 重传通常覆盖该分片；创建上传会话和创建业务资产则需要客户端 operation ID 或服务端幂等键，避免超时重试产生重复记录。

## 十四、暂停、离线、取消与终止

这些动作不是同义词：

- 暂停：中止或等待当前请求，但保留服务端 session 以便继续；
- 离线：由环境导致的暂停，恢复网络后仍需重新确认 session；
- 取消本机请求：`AbortController.abort()`，只保证本页面停止等待/发送；
- 终止上传：调用后端 abort，释放对象存储中的未完成分片；
- 删除资产：对已经 complete 的正式对象执行受权删除流程。

页面关闭时的异步清理并不可靠。未完成 multipart 的最终回收必须由后端定时任务或对象存储生命周期规则兜底。

## 十五、断点续传需要服务端事实

恢复不能只相信 localStorage。客户端应该：

1. 用户重新选择文件，或通过受支持的持久文件句柄重新授权；
2. 用弱指纹查找候选 upload ID；
3. 请求后端查询这个 session 是否存在、属于当前用户、尚未过期；
4. 以后端列出的已完成分片和分片大小为准；
5. 为缺失分片重新取得短期 URL；
6. 完成后删除本地恢复记录。

本地记录只保存非敏感的协议索引，不保存 File 内容或预签名 URL：

<<< ../../../examples/frontend/file-upload-architecture/resume-record.ts

示例读取时做了最小结构检查；生产代码应使用完整 runtime schema，限制记录年龄和数组长度，并处理账号切换。

### tus 的 offset 模型

tus 以一个 upload resource URL 表示上传，客户端查询服务端 `Upload-Offset`，再从该偏移继续 PATCH。服务端只在字节被接受后推进 offset。这与“客户端记住自己发到第几片”相比，把恢复事实放在服务端。

tus 与对象存储 multipart 不是同一协议。可以使用成熟实现或在后端做适配，不要把两者的 header、offset 和 complete 语义混拼。

## 十六、完整性不是一个 ETag 就结束

要区分四个问题：

1. **传输完整性**：收到的字节是否与发送的一致；
2. **文件识别**：实际格式是否符合声明；
3. **内容安全**：是否包含恶意载荷或解压炸弹；
4. **业务合法性**：当前用户是否有权上传这种资产。

ETag 的语义由存储协议和上传方式决定。对于 S3 multipart，对象 ETag 通常不是整个文件的简单 MD5；加密方式和供应商实现也会影响语义。应使用协议明确支持的 checksum 字段，不要根据 ETag 外观猜算法。

浏览器 `crypto.subtle.digest()` 通常需要完整 ArrayBuffer，不是通用的增量大文件哈希接口。大文件哈希可放到 Worker 并采用经过审查的增量实现，但最终仍要由服务端或对象存储独立验证。

## 十七、媒体处理是异步后端工作流

上传原始对象后，常见流水线包括：

```text
临时隔离区
→ 内容识别与恶意软件扫描
→ 元数据解析
→ 图片去 EXIF / 缩略图 / 格式转换
→ 视频探测 / 转码 / 切片 / 封面
→ 发布不可变变体
→ 回写 asset 状态
```

前端应订阅或轮询 `processing → ready/failed`，显示可恢复的处理失败。不要允许未经扫描的原始对象直接进入公共 CDN；下载响应也应设置正确 `Content-Type`、`Content-Disposition` 与安全头。

资产记录与对象键应分离。业务使用稳定 asset ID，底层可产生多个版本和变体；不要把用户原始文件名直接作为公共 URL 或存储路径。

## 十八、安全边界

### 1. 文件名与路径

文件名只是展示元数据。服务端必须去除路径含义、控制字符和危险分隔符，限制长度；对象键由服务端生成。下载时对 `Content-Disposition` 文件名正确编码。

### 2. 主动内容

HTML、SVG、PDF 等可能包含主动内容。若业务不需要浏览器内联渲染，使用附件下载和隔离域名；若需要展示，采用专门净化、sandbox 与严格 CSP，不能直接把用户内容插入主站 DOM。

### 3. 配额与资源消耗

同时限制单文件、单会话、单用户每日容量、分片数、并发数和处理时长。压缩文件要限制展开后的文件数、层级和总字节，媒体要限制像素、时长、轨道数和编码复杂度。

### 4. 授权与竞态

创建、签名、查询、完成、终止和删除每一步都重新校验所有权。不要因为 upload ID 随机就把它当授权。完成接口还要确认所有 part 都属于同一 session，不能接受客户端指定任意对象键。

## 十九、队列与框架集成

建议分层：

```text
Upload UI：选择、列表、进度、操作、错误文案
Upload store：可序列化状态与 asset ID
Upload service：AbortController、并发池、协议 adapter
Backend API：会话、签名、查询、完成、终止
Processor：扫描、转码、发布、回调
```

不要把 `File`、XHR、AbortController 或定时器放进需要持久化的 Pinia/Redux store。store 保存 ID、状态与数值；运行时句柄由 service 管理。

组件卸载是否取消上传要由产品语义决定。路由切换可能不应中断全局上传队列；退出账号则必须停止请求并清除属于旧身份的恢复信息。

## 二十、多文件调度

上传多个文件需要两层限制：每个文件的分片并发，以及整个页面的请求总并发。调度器还应考虑：

- 小文件不要长期饿死在大视频后面；
- 用户手动选择的高优先级文件；
- 失败文件不会占住 worker；
- 同一个文件只执行一个 complete；
- 总进度同时展示文件数和字节数，避免被小文件数量误导；
- 内存中只保留正在传输的少量分片引用。

移动网络或省流量模式下可以降低并发，但不要仅凭 `navigator.connection` 做不可逆决策；它不是所有浏览器都支持，且网络会变化。

## 二十一、可访问性与产品反馈

- 文件按钮有可见 label、焦点样式和键盘入口；
- 类型与大小限制在选择前可见；
- 每个文件有名称、状态、进度和独立操作；
- 进度使用原生 `<progress>` 或正确的 `progressbar` 语义；
- 不要让读屏器为每 1% 变化高频播报，可按阶段或较大间隔通知；
- 错误说明原因和下一步，不只显示红色；
- 暂停、继续、取消的语义和结果清楚；
- 缩略图提供合适替代文本，装饰性预览使用空 alt；
- 处理时间未知时使用不确定状态，不伪造百分比。

页面刷新前若有活跃上传，可以说明影响，但 `beforeunload` 不是可靠的数据保存机制，也不应滥用阻止离开。

## 二十二、测试策略

### 1. 纯逻辑测试

覆盖分片边界、最后一片、零字节、非法大小、状态转换、进度重试回退、退避分类和完成排序：

<<< ../../../examples/frontend/file-upload-architecture/upload-logic.test.mts

文件特征与重试策略测试覆盖签名识别、未知内容、可重试状态和确定性退避：

<<< ../../../examples/frontend/file-upload-architecture/file-and-retry.test.mts

完整协调器通过注入假的协议 API 和 transport 做集成测试：验证已完成分片不会重传，失败后不再调度新分片，完成清单有序，并发与进度不超过预算。

### 2. 协议集成测试

验证 CORS 预检、允许 header、暴露 ETag、签名过期、错误分片号、重复 complete、abort 后 complete、账号越权和生命周期回收。对象存储模拟器不能代替真实供应商的少量契约测试。

### 3. 浏览器与网络测试

覆盖 Chrome、Safari、Firefox 和目标移动设备；注入离线、超时、429、5xx、慢上行、刷新、休眠唤醒和网络切换。检查 object URL、XHR、worker 和事件监听器没有泄漏。

### 4. 安全与媒体语料

准备扩展名伪装、空 MIME、截断图片、超大像素、损坏 MP4、嵌套压缩包、主动 SVG、恶意样本测试流程。安全样本需隔离管理，不应进入普通开发下载目录。

## 二十三、可观测性

建议按 upload ID/asset ID 关联以下事件：

- 文件大小桶、类型和协议；
- create、首分片、各分片重试、complete、processing、ready 的时延；
- 上行吞吐、并发数、失败 status 与网络类型；
- 恢复成功率、用户取消率、签名过期率；
- 扫描、转码失败原因和队列等待；
- 未完成 multipart 数量、临时对象字节和清理延迟。

日志不能记录预签名 URL、原始文件内容或敏感文件名。高基数字段要控制采样和保留期。

## 二十四、性能与成本治理

- 小文件不要强行 multipart，额外请求可能更慢；
- 大文件避免 Base64、完整 arrayBuffer 和主线程哈希；
- 缩略图限制解码尺寸，处理移到 Worker 或服务端；
- 并发、重试和签名请求都有预算；
- CDN 只服务 ready 的不可变变体，使用版本化 URL；
- 临时对象、失败 session 和旧变体设置生命周期；
- 对上传、存储、扫描、转码、出网分别计量；
- 服务端返回的限制应在 UI 选择前可见，并在提交时再次执行。

分片越小，失败重传成本越低，但请求、签名、校验和元数据成本越高；分片越大则相反。应使用真实文件分布和失败率建模，而不是只比较峰值速度。

## 二十五、常见失败模式

### 失败一：只相信 accept 和 File.type

它们是体验提示，不是安全证明。服务端重新识别内容并执行策略。

### 失败二：把大文件转成 Base64

增加体积和内存复制。直接上传 Blob 或按范围切片。

### 失败三：进度 100% 就发布成功

对象仍可能在合并、扫描或转码。显式表达 completing 与 processing。

### 失败四：并发无限增加

请求互相争用，移动端资源耗尽。设置文件级和全局并发预算。

### 失败五：所有错误都自动重试

认证和业务 4xx 不会因重试修复。分类错误，限制预算并加入 jitter。

### 失败六：暂停时调用服务端 abort

session 被销毁后无法恢复。区分暂停本地请求与终止远端上传。

### 失败七：localStorage 是恢复真相

记录可能陈旧、被篡改或属于旧账号。以后端 session 和已完成分片为准。

### 失败八：把 ETag 当整文件 MD5

multipart 等场景并不成立。使用存储协议明确的 checksum 能力。

### 失败九：忘记 revoke object URL

长时间选择和删除预览会持续占用资源。由明确 owner 在移除时释放。

### 失败十：只取消浏览器请求

未完成分片仍在远端占用空间。提供终止 API，并配置后台生命周期清理。

### 失败十一：原文件名直接成为对象键

引入覆盖、路径、隐私和缓存问题。服务端生成内部键，文件名仅作受控元数据。

### 失败十二：上传服务与组件生命周期绑定

路由切换意外中止任务。按产品需求把长任务提升到应用级 service。

## 二十六、渐进落地路线

### 阶段一：可靠的小文件上传

- 标准文件输入与可访问列表；
- 客户端即时校验和服务端权威校验；
- 明确状态机、取消和错误分类；
- 对象 URL 生命周期；
- 上传、处理与 ready 状态分离。

### 阶段二：对象存储直传

- 后端控制对象键和短期权限；
- CORS 最小配置；
- 幂等创建与完成；
- 安全扫描、媒体变体和隔离发布；
- 临时对象生命周期与成本监控。

### 阶段三：大文件与恢复

- 服务端决定分片计划；
- 有限并发、分类重试和可信进度；
- 查询服务端分片事实；
- 刷新/离线恢复与 tus 或供应商 multipart adapter；
- 多文件公平调度、真实网络测试和运营指标。

## 二十七、上线检查清单

- [ ] 文件输入支持键盘、触摸与拖放增强，限制在选择前可见；
- [ ] `accept`、扩展名、MIME 和客户端魔数不被当作安全边界；
- [ ] 服务端执行授权、配额、内容识别、扫描和业务校验；
- [ ] 大文件不经过 Base64 或完整主线程内存读取；
- [ ] 对象键由服务端生成，原文件名被规范化并仅作为元数据；
- [ ] 预签名 URL 权限最小、有效期短且不进入日志和持久存储；
- [ ] CORS 精确允许来源、方法和 header，并暴露必要响应 header；
- [ ] 分片大小、数量和 checksum 符合真实存储协议；
- [ ] create、part、complete、abort 的幂等和所有权均已验证；
- [ ] 并发、重试、jitter、超时和总资源有上限；
- [ ] 进度在重试时不会超过 100%，完成后仍显示处理阶段；
- [ ] 暂停、取消本机请求、终止 session 和删除资产语义分离；
- [ ] 恢复以后端已完成分片为准，不复用过期签名；
- [ ] ETag 不被错误解释，完整性使用协议支持的 checksum；
- [ ] object URL、XHR、worker 和监听器均有确定 owner 与清理；
- [ ] 原始对象先隔离，ready 资产经过扫描和必要的重新编码；
- [ ] 未完成 multipart、临时对象与旧变体有生命周期清理；
- [ ] 浏览器、移动设备、弱网、刷新、越权和恶意语料已测试；
- [ ] 指标能关联传输、合并、处理与发布，但不泄露敏感内容。

## 总结

可靠上传系统的核心不是进度条，而是明确的协议与所有权：

- File/Blob 提供浏览器内的受控字节访问，切片避免整体读入内存；
- 客户端校验改善反馈，服务端才是授权、内容和安全边界；
- 后端创建 session、决定对象键和分片计划，短期凭证只授予必要能力；
- multipart 将失败限制在单个分片，有限并发与分类重试控制资源；
- 恢复以后端 offset/part 事实为准，本地记录只是索引；
- 传输完成、对象完成、处理完成和业务发布是不同状态；
- 扫描、转码、生命周期、可访问性和观测决定系统能否长期运行。

当 UI 能准确回答“正在传什么、传到哪里、是否安全、能否恢复、什么时候真正可用”，文件上传才从一个请求成长为可靠的资产基础设施。

## 参考资料

- [MDN：Using files from web applications](https://developer.mozilla.org/en-US/docs/Web/API/File_API/Using_files_from_web_applications)
- [MDN：File](https://developer.mozilla.org/en-US/docs/Web/API/File)
- [MDN：Blob.stream](https://developer.mozilla.org/en-US/docs/Web/API/Blob/stream)
- [MDN：URL.createObjectURL](https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static)
- [MDN：XMLHttpRequest upload](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/upload)
- [MDN：Request.duplex](https://developer.mozilla.org/en-US/docs/Web/API/Request/duplex)
- [AWS：Uploading and copying objects using multipart upload](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html)
- [AWS：Download and upload objects with presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)
- [AWS：Checking object integrity for data uploads](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html)
- [tus：Resumable upload protocol](https://tus.io/protocols/resumable-upload)
