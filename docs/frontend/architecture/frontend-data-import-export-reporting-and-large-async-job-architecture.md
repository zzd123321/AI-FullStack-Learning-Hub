---
title: 前端数据导入、导出、报表与大规模异步任务架构
description: 系统掌握文件预检、列映射、分阶段校验、CSV 安全、快照导出、异步 Job、进度取消、下载授权、审计与生产治理
---

# 前端数据导入、导出、报表与大规模异步任务架构

导入 20 行 CSV 可以像一次表单提交；导入 200 万行则是一条数据管道。导出当前表格的 50 行可以在浏览器生成；导出全租户审计数据必须经历查询快照、异步生成、对象存储和短期下载授权。如果仍用一个 loading、一个百分比和一次长 HTTP 请求表达全部过程，页面会在超时、部分失败、取消和权限变化时失去真实性。

本课把“文件上传”“格式解析”“结构校验”“业务校验”“预览确认”“应用变更”“生成报表”“下载交付”拆开，建立持久、幂等、可恢复、可审计的大规模任务模型。文件上传协议已在前面的专题讲过，本课专注上传之后的数据语义与任务生命周期。

## 学习目标

- 区分上传、解析、验证、导入、报表生成与下载；
- 设计客户端预检与服务端可信文件识别；
- 处理编码、分隔符、CSV、XLSX 与公式注入；
- 设计稳定模板、列映射、类型解析和错误报告；
- 选择全有或全无、部分成功、暂存后确认等导入语义；
- 用 `202 Accepted`、Job resource 和幂等命令表达长任务；
- 正确显示多阶段进度、未知总量、取消与恢复；
- 建立一致的导出快照、短期下载授权和完整性元数据；
- 处理权限变化、隐私、租户隔离、测试、观测与审计。

## 一、先拆开数据管道

```text
选择文件 → 客户端预检 → 上传/暂存 → 服务端识别格式
→ 解析 → 结构校验 → 业务校验 → 预览/确认
→ 应用变更 → 对账/索引/通知 → 完成或部分完成

提交报表条件 → 固化查询快照 → 异步生成 → 加密对象存储
→ 短期下载授权 → 下载/过期 → 留存或删除
```

每一阶段的失败语义不同：上传失败可以续传，解析失败通常要换文件，业务校验失败可以修数据，应用变更部分失败需要补偿或错误报告。一个 `status: error` 无法指导恢复。

## 二、浏览器预检只改善体验

选择文件后可以检查名称、扩展名、`File.type`、大小和空文件，尽早给出反馈。

<<< ../../../examples/frontend/data-import-export-jobs/file-preflight.ts

扩展名和 MIME 都由客户端环境提供，可能为空或被伪造。服务端必须重新检查大小、magic bytes、容器结构、压缩展开预算、病毒/恶意内容，并用自己的 parser 识别格式。客户端 accepted 不等于安全。

文件策略由服务端下发版本化限制，前端内置限制只能作为默认值；服务端更严格时返回稳定错误代码。

## 三、不要一次读完整大文件

`file.text()`、`arrayBuffer()` 会把完整文件放进内存；解析库还可能产生数倍对象开销。大文件优先直接上传，由服务端流式解析。需要本地预览时只读取受限头部/少量行，使用 Blob slice、stream 或 Worker。

浏览器解析不替代服务端验证。主线程不得同步展开巨大 XLSX/ZIP；压缩比和条目数必须设预算，防 zip bomb。

## 四、格式不是扩展名

CSV 是文本记录格式，XLSX 是包含 XML 等内容的 ZIP 容器，JSON/NDJSON 又有不同流式边界。模板应明确支持的媒体类型、版本、最大行列、sheet 名、公式、合并单元格和附件策略。

不要用一个“万能 spreadsheet parser”默认启用宏、外链、公式计算或 HTML。解析运行在隔离进程/容器，限制 CPU、内存、时间、展开大小和网络访问。

## 五、字符编码与 BOM

CSV 常见 UTF-8、UTF-8 BOM、历史本地编码。自动猜测可能把文本悄悄解错；应优先规定 UTF-8，检测 BOM，并在置信度低时让用户选择编码后预览。

替换字符 `�`、非法字节和行尾差异要进入诊断。导出给特定表格软件时是否加 BOM 是兼容性产品决策，不属于 CSV 核心语义。

## 六、CSV 不是 split(',')

RFC 4180 描述逗号、CRLF、双引号和引号转义；字段可以包含逗号、换行和双引号。逐行 `split('\n')` 再 `split(',')` 会破坏合法记录。

使用维护良好的流式 parser，固定 delimiter/quote/escape 或做受限探测。探测结果必须展示确认；分号、小数逗号和 locale 会让自动判断含糊。

严格限制列数、字段长度、记录长度和异常行，避免 parser 资源耗尽。

## 七、XLSX 的显示值与原始值

单元格可能有原始数字、格式、显示文本、公式和缓存结果。日期在表格系统中可能是序列数，且受日期系统、时区和 locale 影响。不能只取“看起来像文本”的显示值再猜类型。

导入合同规定接受原始值还是显示值、是否允许公式、空白与零的区别。通常拒绝公式或只读取可信缓存值并标记，服务端绝不执行不可信公式和外部链接。

## 八、模板必须版本化

模板包含 template ID/version、字段 ID、列标题、required、类型、示例、枚举和说明。标题可本地化，稳定字段 ID 不变。

下载模板时写入隐藏 metadata sheet/明确版本列（不依赖用户不修改），上传后识别版本并选择迁移规则。删除列、改变类型和收紧枚举属于 breaking change，旧模板要有过渡窗口。

模板是帮助工具，不是安全凭证；服务端仍验证每列。

## 九、列映射是显式确认

用户自己的文件通常没有模板。系统读取 header，基于规范化 label/alias 提出建议，用户确认 source → target 映射。

<<< ../../../examples/frontend/data-import-export-jobs/column-mapping.ts

示例用稳定 target field ID、防止同一目标被重复占用，显式报告规范化后重复的源表头，并检查 required 字段。建议只是建议：`Name` 可能是姓名或公司名，不能无提示自动导入。

映射配置绑定 tenant、import type 和 schema version；保存为用户模板时需要权限和隐私控制。

## 十、Header 规范化也会冲突

trim、大小写和 Unicode NFKC 有助于匹配，却可能把原本不同的 header 合并。检测重复规范化结果并要求用户处理，不能静默取第一列。

header 为空、超长、包含控制字符或重复时给出行/列诊断。用于 DOM ID、对象 key、日志前不能直接信任 header 文本。

## 十一、类型解析必须显式

`00123` 可能是编号，不是数字；`01/02/03` 日期含糊；`1,234` 受 locale 影响；`true/yes/是` 需要字典。每个目标字段定义 parser、locale、空值、范围和时区语义。

金额使用字符串到最小单位/decimal，不用浮点；日期区分纯日期与 instant；枚举提交稳定 ID。错误保留原始 cell、规范化值和 error code，方便修复。

## 十二、校验分阶段

- 文件级：格式、大小、编码、模板版本；
- 结构级：sheet、header、列数、required mapping；
- 单元格级：类型、长度、格式；
- 行级：字段组合、唯一键；
- 文件级业务：文件内重复、总额、父子引用；
- 系统级：tenant、权限、现有数据、外部服务；
- 应用阶段：事务、并发版本和最终授权。

前面阶段失败可节省昂贵查询。验证结果会随数据库变化，确认后应用时仍需重验关键条件。

## 十三、错误预算与完整报告

百万行全部错误可能生成数 GB 报告。设置 `maxErrors`、每类样本和统计；达到阈值后标记 truncated，但继续计算是否值得由成本策略决定。

页面展示总行、有效、无效、警告和前若干错误。完整错误报告异步生成，包含 row number、稳定字段 ID、原始安全摘要、error code 和可操作说明。

错误值可能含个人数据，不能进入普通日志或分析。下载错误报告需要与原导入相同或更严格权限。

## 十四、预览不是完整数据表

预览展示受限样本、映射、类型解释、将创建/更新/跳过数量和副作用。明确抽样策略：前 N 行、随机样本或分层样本；不能让用户误以为预览覆盖全部。

确认页面显示 schema version、源文件 hash、验证时间和快照过期。确认命令引用 staging ID，不重新接受一份浏览器构造的数据。

## 十五、选择导入原子性

三种常见语义：

| 模式 | 语义 | 适用 |
| --- | --- | --- |
| all-or-nothing | 任一错误不写入 | 小批量、高一致性 |
| valid-rows | 合法行提交，错误行报告 | 独立记录、容许部分成功 |
| staged-confirm | 先完整验证/暂存，再确认应用 | 大批量、高风险 |

部分成功必须返回成功/失败/跳过的精确定义。不能显示“导入成功”却只写入 60%。跨百万行单数据库事务也可能不可行，需要分批幂等与补偿。

## 十六、创建、更新和 upsert

导入行需要稳定业务键或明确 server ID。按姓名模糊匹配更新极其危险。预览显示每行 operation：create/update/skip/conflict。

upsert 要定义缺失字段是不修改、设 null 还是默认值；空字符串与空单元格语义分开。字段级权限防止 mass assignment，浏览器隐藏列不能替代服务端 allowlist。

更新携带 expectedVersion 或定义 snapshot 语义，避免覆盖用户在验证后做的新修改。

## 十七、幂等与行级身份

创建 import job 使用 operation ID，网络重试复用；同一文件 hash 不一定等于同一业务意图，不能粗暴全局去重。

每行可用 `(jobId, rowNumber)` 或源业务 ID 作为幂等边界，批次 checkpoint 持久化。worker 重启后从 checkpoint 安全恢复，不重复创建或发送通知。

副作用通过 outbox/幂等 consumer 执行，不能在可能重跑的行循环里直接发邮件。

## 十八、长任务使用 Job resource

POST 创建任务可返回 `202 Accepted` 和 job resource；202 只表示已接收，HTTP 本身不会稍后补发最终结果。客户端必须读取 job、接收事件或通知。

```http
HTTP/1.1 202 Accepted
Location: /api/import-jobs/job_123
Retry-After: 2
```

Job 创建 API 做权限、配额和幂等；job URL 仍需认证授权，不因为 ID 难猜就公开。

## 十九、任务状态机

<<< ../../../examples/frontend/data-import-export-jobs/job-state.ts

`awaiting_confirmation` 表示验证完成但尚未应用；`partially_succeeded` 与 failed 分离；cancel_requested 表示服务器已收到取消意图，不等于立刻停止。

前端只接受更高 version 的 snapshot，防轮询、SSE 和重连事件乱序。最终状态仍可因留存过期转为 expired，但不要覆盖历史审计。

## 二十、进度不是一个随便增长的数字

上传 20%、验证 40%、应用 40% 是阶段权重，不是把处理行数直接除文件大小。阶段总量未知时显示 indeterminate 和当前阶段；发现 total 后再切换 determinate。

<<< ../../../examples/frontend/data-import-export-jobs/progress.ts

示例只在所有阶段有可信 total 时计算加权百分比。生产还应让 displayed progress 单调，防重试/checkpoint 使进度倒退；99% 停很久比虚假跳到 100% 更糟，最终完成只由 terminal state 决定。

同时展示 `已处理 120,000 / 约 200,000`、成功/失败与最近更新时间，比单独百分比更可解释。

## 二十一、轮询、SSE 与后台通知

轮询遵循服务端 Retry-After、指数退避、页面隐藏降频和 AbortSignal；terminal 后停止。SSE/WebSocket 降低延迟，但断线重连后以 GET job 对账。

长达数小时的任务不能依赖页面打开。完成后可用站内通知/邮件提示，但通知不携带公开下载链接或敏感数据；用户回站后重新授权读取。

## 二十二、取消是协作协议

取消命令携带 operation ID 和 expectedVersion。worker 在安全 checkpoint 检查 cancel_requested，停止未开始批次，并决定已提交批次是否保留。

取消不等于回滚。UI 明确“停止剩余处理，已导入的 80,000 行会保留”或提供独立补偿 job。某些生成报表阶段可以直接丢弃临时对象，语义不同。

重复取消应幂等；任务已完成时返回当前事实，不伪装取消成功。

## 二十三、重试与恢复

技术失败可从 checkpoint 重试；数据错误通常要求修文件或 mapping。Retry 按钮触发服务端命令，不在浏览器重演百万行。

重试是继续同一 job attempt 还是创建新 attempt 要显式。保留 root job、attempt ID、错误和输入版本，方便审计与指标。

## 二十四、导出的是查询快照

导出请求包含受限 filter、sort、columns、locale/timezone 和 format。服务端固化 query definition、授权范围、policy version 与 snapshot/asOf，避免生成过程中数据变化导致结果不一致。

“导出当前页”“导出当前筛选全部”“导出选中项”是不同命令，确认对话显示预计范围。all-matching 使用服务端 query token，不把百万 ID 拉到浏览器。

## 二十五、报表计算在服务端

浏览器生成只适合小且非敏感的已加载数据。大型 CSV/XLSX/PDF、聚合、图表快照和跨源数据在服务端 job 完成，减少内存、保持权限和审计。

Blob 仍适合小文件，但它通常把内容保存在内存；ReadableStream 能流式消费响应，却不自动获得可靠的任意路径磁盘写入和断点语义。能力检测并提供服务端下载回退。

## 二十六、CSV 转义与公式注入是两件事

CSV quoting 解决逗号、换行和双引号的结构；它不阻止表格软件把 `=...`、`+...` 等单元格当公式。用户输入进入供人打开的 CSV 时存在公式注入风险。

<<< ../../../examples/frontend/data-import-export-jobs/csv-cell.ts

示例始终双引号并转义双引号；对潜在公式可拒绝，或为明确的 spreadsheet-view profile 加 tab 前缀。后者会改变底层数据，且跨表格程序行为不同，所以机器交换 CSV 应优先拒绝/使用安全格式，而不是悄悄污染字段。

OWASP 明确提醒没有适用于所有表格应用和下游消费者的万能清洗。导出 profile、威胁模型和兼容性测试必须明确。

## 二十七、XLSX 也要防公式和外链

生成 XLSX 时把不可信值写为 string cell，不写 formula；禁止外部链接、宏和嵌入对象。选择维护良好的库并固定版本，检查生成包结构和解压预算。

如果产品允许公式，只允许服务端生成的固定模板公式，用户数据只能作为值，不能拼接进公式字符串。

## 二十八、文件名与 Content-Disposition

文件名由服务端生成或严格清理，移除路径分隔符、控制字符、保留名和过长内容。HTTP `Content-Disposition: attachment` 配合 RFC 6266/8187 的 `filename`/`filename*` 处理非 ASCII。

浏览器 `download` 属性只是提示，跨源与响应 header 行为需测试。前端不要从查询词直接拼出任意文件名，也不要信任响应中路径样式名称。

## 二十九、短期下载授权

生成文件保存在私有对象存储，job 完成后由服务端签发短期、最小范围 URL，或通过认证下载 endpoint 转发。下载前重新验证当前用户、tenant、权限和文件状态。

<<< ../../../examples/frontend/data-import-export-jobs/download-link.ts

示例只接受未过期 HTTPS 且 origin 在 allowlist 的 URL，拒绝 `javascript:` 和意外主机。签名 URL 是 bearer capability，不进入分析、聊天、错误日志或长期 DOM。

页面不要把 URL 永久缓存；过期后向服务端重新申请，而不是修改 expires 参数。

## 三十、完整性、大小与类型

下载 grant/job metadata 提供预期 bytes、media type 和可选 SHA-256。高风险导出可下载后在 Worker/流中校验 hash，但浏览器内校验并不能替代 HTTPS、对象存储完整性和服务端签名。

响应校验 Content-Type、Content-Length（若有）和最终 origin。跨源 redirect 需要存储策略允许，不能让 allowlisted URL 跳到任意来源后继续处理敏感内容。

## 三十一、权限变化与租户隔离

创建 job 时授权一次不够。worker 执行、生成文件和用户下载时都要根据业务决定重新授权。撤权后是否继续生成、是否允许原发起人下载是明确策略。

job、staging table、对象路径、cache key、队列消息和日志都包含已验证 tenant ID。平台管理员跨租户导出使用独立 break-glass 流程，不能普通筛选参数切换 tenant。

导入行里的 tenant ID 通常忽略/拒绝，目标租户来自可信 job context。

## 三十二、隐私、留存与删除

导入原文件、错误报告、生成导出都可能复制大量个人数据。定义每类对象的用途、加密、访问、地域、留存、自动删除和 legal hold。

UI 显示过期时间和手动删除入口；删除是服务端 lifecycle，不只是隐藏列表项。对象日志、备份和下游通知遵守治理策略。

报表列遵循最小化与字段级权限，默认不导出隐藏 ID、token、内部备注或软删除数据。

## 三十三、无障碍与用户反馈

文件 input 有明确 label、格式/大小说明和错误关联；拖放区必须有键盘可用的选择按钮。mapping table 使用真实 label/header，不能只靠颜色表示已映射。

任务阶段和完成通过克制 live region 通知，进度使用文本与 `progress`/ARIA 正确语义。取消按钮说明后果；部分成功页面把成功、失败、报告下载分区。

错误报告页面支持键盘分页、筛选和跳转，不要求用户只能在颜色标记的 spreadsheet 中查错。

## 三十四、测试策略

纯逻辑覆盖预检、映射、状态、进度、CSV 和下载授权：

<<< ../../../examples/frontend/data-import-export-jobs/import-export.test.mts

还应覆盖：

- 空文件、伪扩展/MIME、magic bytes、zip bomb 和病毒扫描；
- UTF-8/BOM/非法字节、CRLF、引号、换行与超长字段；
- XLSX 日期、公式、外链、宏、多 sheet 和损坏容器；
- 重复/空 header、mapping 冲突、required 与模板迁移；
- locale 数字日期、枚举、文件内重复和系统级冲突；
- maxErrors 截断、错误报告隐私和部分成功统计；
- job 创建幂等、worker 重启、checkpoint 和副作用去重；
- 轮询/SSE 乱序、断线、Retry-After、取消与完成竞态；
- 快照导出、权限撤销、租户隔离和签名 URL 过期；
- CSV 结构转义、公式 payload、XLSX string cell；
- Unicode 文件名、Content-Disposition、redirect 和 hash；
- 键盘、读屏、低带宽、大文件和长时间任务。

使用生成式/模糊测试攻击 parser 边界；生产级样例包含脱敏的大规模和异常分布数据。

## 三十五、可观测性与审计

trace 串联 operationId/jobId/attemptId/tenant/sourceObject/outputObject/schemaVersion。指标包括文件大小/行数、各阶段耗时、队列等待、吞吐、错误率、部分成功、取消延迟、重试、报告过期与下载成功。

日志不记录整行、原文件、签名 URL 或敏感字段；error code/field ID/row bucket 足够聚合。高 cardinality job ID 进入 trace/log，不作为指标 label。

审计保存谁在何租户以什么条件创建导入/导出、输入 hash、mapping/schema、确认、结果统计、文件留存和下载事件。审计本身不复制完整数据。

## 三十六、常见失败模式

1. 扩展名/MIME 当可信格式；2. 主线程一次读取完整大文件；3. CSV 用 split；4. 自动猜编码/分隔符不确认；5. header 名直接当字段 key；6. 表格日期按字符串猜；7. 预览 100 行就宣称全文件有效；8. 部分成功显示普通成功；9. 长任务维持一个 HTTP 请求；10. 202 当完成；11. 百分比虚假增长；12. cancel 当回滚；13. worker 重试重复副作用；14. 浏览器生成全量敏感报表；15. CSV quoting 当公式防护；16. 签名 URL 长期缓存；17. 创建时授权后下载不重验；18. 错误日志保存完整行。

## 三十七、渐进落地路线

先提供严格模板、小批量服务端解析、完整校验和同步结果；再引入 staging、列映射、错误报告和明确原子性；随后升级为幂等 Job、checkpoint、进度/取消、快照导出与短期下载；最后完善多格式隔离解析、公式安全、对账、留存、权限重验和容量演练。

## 三十八、上线检查清单

- [ ] 上传、解析、验证、确认、应用、生成和下载阶段分离；
- [ ] 客户端预检仅改善体验，服务端识别格式并做安全扫描；
- [ ] 大文件不在主线程完整加载，parser 有资源与展开预算；
- [ ] CSV 使用标准 parser，编码/分隔符低置信度时要求确认；
- [ ] XLSX 原始值、日期、公式、外链和宏策略明确；
- [ ] 模板、schema、mapping 与迁移均有不可变版本；
- [ ] 字段使用稳定 ID，header 规范化冲突不会静默覆盖；
- [ ] 数字、金额、日期、枚举和空值按显式 locale/类型解析；
- [ ] 校验分层、错误预算、预览抽样和报告截断清晰呈现；
- [ ] all-or-nothing/valid-rows/staged-confirm 语义明确；
- [ ] upsert key、空字段、并发版本与字段级权限明确；
- [ ] job/批次/行/副作用具备合适幂等边界与 checkpoint；
- [ ] 202 返回可读取 job resource，客户端不把 accepted 当完成；
- [ ] 状态版本防乱序，进度可解释，未知总量使用 indeterminate；
- [ ] 轮询遵循 Retry-After，SSE 重连后 GET 对账；
- [ ] 取消后已完成数据和补偿语义向用户说明；
- [ ] 导出条件、授权、policy 和数据 snapshot 固化；
- [ ] CSV 结构转义与公式注入分别治理，profile 明确；
- [ ] 文件名、Content-Disposition、媒体类型和完整性经过验证；
- [ ] 下载使用短期 HTTPS allowlist URL，并在下载时重新授权；
- [ ] tenant 贯穿 job、staging、对象、队列、缓存和审计；
- [ ] 原文件、错误报告和导出有最小权限、留存与删除策略。

## 总结

可靠的数据导入导出不是“读文件、循环请求、生成 Blob”，而是一条持久数据管道：服务端可信识别和分阶段校验保护输入，版本化 mapping 和预览让用户确认语义，Job 状态机与 checkpoint 支撑大规模执行，快照与字段授权保证导出一致，CSV/XLSX 安全和短期下载授权保护交付。前端的责任是准确呈现阶段、范围、部分结果和恢复路径，而不是用一个百分比掩盖后台事实。

## 参考资料

- [RFC 9110：HTTP Semantics（202 Accepted、Retry-After、Range）](https://www.rfc-editor.org/rfc/rfc9110)
- [RFC 4180：CSV Format and MIME Type](https://www.rfc-editor.org/rfc/rfc4180)
- [RFC 6266：Content-Disposition in HTTP](https://www.rfc-editor.org/rfc/rfc6266)
- [RFC 8187：HTTP Header Parameter Encoding](https://www.rfc-editor.org/rfc/rfc8187)
- [OWASP：CSV Injection](https://owasp.org/www-community/attacks/CSV_Injection)
- [MDN：Blob](https://developer.mozilla.org/en-US/docs/Web/API/Blob)
- [MDN：ReadableStream](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream)
- [MDN：File API](https://developer.mozilla.org/en-US/docs/Web/API/File_API)
- [MDN：Content-Disposition](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Disposition)
