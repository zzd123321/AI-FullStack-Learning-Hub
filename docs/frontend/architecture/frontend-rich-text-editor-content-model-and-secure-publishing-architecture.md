---
title: 前端富文本编辑器、内容模型与安全发布架构
description: 系统掌握结构化文档、编辑事务、Selection、输入法、粘贴清洗、链接媒体安全、版本迁移、预览发布、无障碍与生产治理
---

# 前端富文本编辑器、内容模型与安全发布架构

`contenteditable` 可以让一个元素“能输入”，却不会自动提供稳定文档模型、撤销重做、粘贴策略、输入法兼容、Selection 映射、协作、迁移或安全发布。直接保存 `innerHTML` 看起来省事，最终通常得到浏览器相关标签、不可迁移样式、XSS 边界和无法可靠比较的内容。

本课从结构化内容模型开始，把浏览器 DOM 当作编辑表面，把每次输入变成文档事务，把选择区映射到模型位置，再建立粘贴、链接、媒体、版本、预览、审核和发布边界。目标不是手写一套完整编辑器，而是理解为什么成熟编辑器框架需要这些层，以及团队怎样正确评估和治理它们。

## 学习目标

- 区分内容模型、编辑状态、DOM 投影和发布产物；
- 理解 `contenteditable`、`beforeinput`、IME 与 Selection 的边界；
- 设计结构化、可验证、可迁移的文档 schema；
- 用 transaction/step 表达输入、命令和撤销历史；
- 保存和恢复模型级 selection bookmark；
- 处理粘贴、拖放、剪贴板和外部 HTML；
- 安全建模链接、图片、嵌入与代码块；
- 建立自动保存、并发冲突、审核、定时发布与回滚；
- 处理渲染清洗、Trusted Types、CSP 与 XSS；
- 建立无障碍、测试、性能、观测和供应链治理。

## 一、编辑器有四个不同事实

```text
Content document：持久、框架无关的结构化领域文档
Editor state：document + selection + composition + undo/plugin state
Editable DOM：浏览器输入、光标和可视排版的投影
Published artifact：经过验证、渲染、清洗和版本固定的 HTML/JSON
```

DOM 不是唯一事实。浏览器、扩展、拼写检查和粘贴都可能暂时修改 DOM；编辑器需要读取输入意图，将其转换为 transaction，再把模型投影回 DOM。发布页面也不应直接复用活动编辑 DOM。

## 二、为什么不能只保存 innerHTML

同样的视觉结果可能有多种 HTML：`<b>`、`<strong>`、内联 style、嵌套 span。浏览器编辑命令和粘贴源还会产生不同结构。字符串 diff 无法表达“给三个字加粗”，迁移和协作也困难。

任意 HTML 允许脚本 URL、事件属性、危险 SVG/MathML、iframe、style 和未来新增语义进入长期存储。即使保存时清洗，清洗策略升级后旧内容仍需重新验证。

结构化模型只允许产品支持的节点与属性，然后由受控 renderer 输出语义 HTML。

## 三、设计结构化文档 schema

文档通常由 block 与 inline 组成：paragraph、heading、list、quote、code block、image；文本携带 bold/italic/code 等 marks，link 是受限 inline 节点。

<<< ../../../examples/frontend/rich-text-content-publishing/content-model.ts

示例从 `unknown` 验证 schema version、block ID、节点类型、heading level、mark 白名单、嵌套深度、节点数和字符串长度。生产还要验证每种节点完整属性、总字符、列表深度、表格尺寸、链接协议和 asset ownership。

稳定 block/node ID 用于 selection、评论、审计、协作和增量渲染，不能每次 render 随机生成。

## 四、Schema 表达领域能力

不要把 HTML 标签一比一搬成 schema。产品可能支持“警告提示块”“课程引用”“受控视频”，它们有明确数据而非任意 div/class。

同样，不支持的格式应在粘贴时降级，而不是为了“保真”把未知 HTML 塞进 rawHtml 节点。raw HTML 是一个新的高风险产品能力，需要独立权限、sandbox 与发布策略。

## 五、Schema version 与迁移

文档保存 `schemaVersion`。节点重命名、属性结构变化、废弃 embed provider 都通过确定性迁移逐版执行；迁移输入从 unknown 验证，输出再验证。

迁移保留原 revision、迁移版本、工具版本和失败报告。不要在读取时静默写回所有历史内容；可惰性读取、后台批量或发布前迁移，但语义与回滚要明确。

## 六、DOM renderer 与 parser 成对设计

renderer 将模型输出为语义 HTML/DOM；parser 将受控 DOM/粘贴内容转回模型。两者应满足可接受范围内的 round trip：`parse(render(doc))` 与规范化后的 doc 等价。

编辑 DOM 可包含 decoration、selection marker、placeholder 等非内容节点，parser 必须忽略。不要把插件 UI 序列化进文档。

## 七、contenteditable 只是编辑表面

`contenteditable` 是枚举属性，支持 true/false 和 `plaintext-only`；嵌套 editable、Tab 顺序和粘贴格式有具体行为。跨浏览器细节仍需测试。

编辑器通常让一个受控根节点 editable，内部 atomic node/控件通过 `contenteditable=false` 等机制隔离。错误嵌套会造成光标陷阱和删除异常。

## 八、beforeinput 与 input

`beforeinput` 提供 inputType、data 和目标范围，让编辑器在浏览器修改前识别 insertText、deleteContentBackward、insertFromPaste 等意图；可取消时转为自己的 transaction。

并非所有变化都保证可取消或提供完整信息，自动填充、拼写纠正、IME 和浏览器差异需要在 `input` 后做 DOM/model reconciliation。不能只监听 keydown：粘贴、语音、移动输入和辅助技术不一定产生预期按键。

## 九、IME composition 是一个整体

中文、日文等输入法在 compositionstart 到 compositionend 期间维护临时文本。每个 compositionupdate 都提交远端、重渲染 DOM 或重置 selection，会打断候选窗口。

编辑状态显式记录 composing，延迟某些 normalization、协作广播和工具栏更新；composition 结束后形成合适 transaction。必须在真实 IME、移动键盘和屏幕阅读器下测试。

## 十、用 transaction 表达修改

编辑命令不是直接改 DOM，而是产生 steps：替换文本、加 mark、拆分段落、提升列表、插入节点。Transaction 包含 base version、steps、selection mapping 和 metadata。

<<< ../../../examples/frontend/rich-text-content-publishing/transaction.ts

示例展示最小 replace-text step：验证 block 与范围，返回新 document/version，不修改旧对象。真实实现还要保证 Unicode/grapheme、schema 约束、step map 和嵌套树位置。

统一 transaction 使键盘、工具栏、粘贴、API 和协作走同一校验路径。

## 十一、撤销重做不是保存 DOM 快照

每次输入保存整份 HTML 内存高、selection 难恢复、协作冲突。成熟编辑器按 transaction 分组 history：连续输入合并，粘贴/格式/结构命令形成边界。

Undo 撤销本地意图还是全局最新变化，在协作场景不同。浏览器原生 undo 与自定义 history 不能同时争夺；需要明确拦截策略和平台快捷键。

## 十二、Selection 是方向性的

Selection 有 anchor/focus，反向选择与 forward range 不同。模型位置通常是 node path/ID + offset，并需区分 text offset、node boundary 和 atomic node selection。

DOM Selection/Ranges 是易失的：重渲染、浮层点击和异步上传会使 node 引用失效。打开链接弹窗前先保存模型 bookmark，而不是长期保存 Range 对象。

## 十三、选择书签与恢复

<<< ../../../examples/frontend/rich-text-content-publishing/selection-bookmark.ts

示例按稳定 block ID 恢复并 clamp offset；节点已删除时落到明确 fallback。成熟实现通过 transaction mapping 把旧 selection 映射到新文档，远端编辑后仍尽量保持意图。

恢复前确保 editor 仍是目标实例且获得焦点；多个编辑器、shadow root/iframe 和弹窗需要独立 selection owner。

## 十四、Unicode 与光标单位

JavaScript string offset 是 UTF-16 code unit，用户看到的字符可能由代理对、组合符号或多个 code point 组成。删除半个 emoji 会破坏文本。

编辑器框架通常规定自己的 position 单位，并借助浏览器 DOM mapping。自定义文本算法按 grapheme cluster 处理用户级字符；服务端、协作协议和高亮偏移必须共享单位。

## 十五、键盘命令与平台差异

快捷键映射到语义 command，如 toggleBold、splitBlock，不直接调用 `execCommand`。处理 macOS Meta 与其他平台 Control、AltGraph、IME 和浏览器保留快捷键。

所有命令还应有可发现的工具栏入口；快捷键说明可本地化。不要阻止用户常用浏览器/辅助技术快捷键。

## 十六、粘贴是最大输入边界

剪贴板可包含 `text/plain`、`text/html`、文件和自定义 MIME。富文本粘贴先读取允许类型，在隔离 parser 中清洗/转换为 schema，再插入 transaction。

外部 HTML 可能包含 script、event handler、style、tracking URL、data URI、SVG、Word 私有标记和巨大嵌套。不要先插入 DOM 再“清理一下”。

## 十七、纯文本粘贴策略

<<< ../../../examples/frontend/rich-text-content-publishing/plain-text-paste.ts

示例规范化行尾、限制字符量，并把空行分段。真实产品需决定单换行是 soft break 还是空格，代码块则通常保留所有换行。

`plaintext-only` 可帮助简单输入区去格式，但完整富文本仍需自己的 clipboard pipeline。

## 十八、富文本粘贴清洗与转换

流程通常是：限制 bytes/nodes/depth → 解析 inert DOM → sanitizer allowlist → source-specific normalization → schema parser → schema validation → transaction。

清洗 HTML 与输出编码不是同一件事；sanitizer 版本和配置要集中治理并回归 XSS corpus。不能用正则清洗 HTML。

Word/Docs 转换器保留 paragraph/list/table 等语义，丢弃字体、任意颜色和跟踪属性。无法表达的内容给出提示，而非静默产生 raw HTML。

## 十九、Clipboard API 的权限边界

异步 Clipboard API 通常要求安全上下文、用户激活或权限，浏览器差异明显。普通 copy/cut/paste event 是主要兼容路径；增强复制可以额外写 text/plain 与受控 HTML。

复制内部结构时可使用自定义 MIME，但粘贴端仍验证 schema/version，不能信任“来自自己应用”。敏感内容复制要符合数据防泄漏策略。

## 二十、拖放与文件

拖动文字、链接、图片和本地文件走不同数据项。drop target 根据模型位置插入，禁止浏览器默认导航到拖入文件。

图片先产生带 upload ID 的占位节点；上传完成 transaction 将其替换为服务端 asset ID。撤销、失败、删除和页面关闭要取消/清理孤立上传。

## 二十一、链接模型与协议

链接节点保存规范 href 和可选 title，不保存 onclick/target 任意字符串。输入 URL 通过 URL parser，allowlist `http/https` 及产品明确允许的协议。

<<< ../../../examples/frontend/rich-text-content-publishing/safe-link.ts

示例拒绝 `javascript:`，区分同源与外链，并为外链提供 `noopener noreferrer`。发布时服务端再次规范化；是否允许 `mailto/tel`、相对 URL、锚点和重定向域名由产品策略决定。

编辑器点击链接默认选择/编辑而非直接导航，并提供键盘可访问的打开动作。

## 二十二、图片与媒体是资产引用

内容模型保存 asset ID、alt、caption、展示尺寸/裁剪意图，不直接保存临时 object URL 或任意远程 URL。媒体服务负责扫描、转码、元数据剥离、响应式变体和授权。

alt 为空可以表示装饰图，但不能把文件名自动当高质量替代文本。发布前 lint 缺失 alt、超大资源和失败资产。

## 二十三、Embed 与 iframe

不要允许作者直接粘任意 iframe。使用 provider allowlist 和结构化 `{provider, resourceId}`，服务端解析 oEmbed/元数据并生成受控 sandbox iframe。

限制 `sandbox`/`allow`、referrer、origin、尺寸和懒加载；第三方 embed 涉及 cookie、追踪、CSP 与同意管理。预览与发布环境使用同一策略。

## 二十四、代码块与语法高亮

代码内容是文本节点，不是 HTML。语言使用 allowlist，highlight renderer 输出 token spans 或经过验证的 HTML；高亮失败回退纯文本。

不要在编辑按键时对整个大代码块同步重高亮；debounce/Worker，并保留 selection。复制应优先提供原始代码文本。

## 二十五、表格是独立复杂子系统

表格需要行列身份、单元格 selection、键盘导航、粘贴矩阵、合并约束、表头语义和响应式阅读。不要用普通段落 hack。

限制尺寸和嵌套，发布为语义 table/caption/th/scope。非常复杂的数据表更适合专用数据组件，不应全部塞进文章富文本。

## 二十六、评论、批注与建议模式

评论 anchor 不应仅保存字符 offset；保存 node ID + range + quote/context，并在 transaction 后映射。内容删除后评论进入 orphaned/resolved 状态，而非指向错误文字。

建议模式把 insert/delete/format 作为带作者的变更，接受/拒绝仍是 transaction。权限和审计由服务端保证。

## 二十七、自动保存与并发

自动保存提交 document revision + operation ID + expectedVersion。single-flight、dirty generation 和明确保存状态避免覆盖新输入。

服务端 409/412 时不能 last-write-wins。单人偶发并发可三方合并；实时协作采用 OT/CRDT 等成熟协议。无论哪种，schema transaction 仍是边界。

## 二十八、编辑、审核、发布分离

草稿 revision、审核状态与已发布 revision 分开。用户继续编辑 draft 不应直接改变线上内容；publish 命令固定某个已审核 revision。

<<< ../../../examples/frontend/rich-text-content-publishing/publish-state.ts

`allowedCommands` 只控制 UI，服务端每次重新授权和校验 revision。旧异步响应不能覆盖新状态，snapshot 以 revision/version 收敛。

## 二十九、预览必须接近生产

编辑画布含 selection/decorations，不能当发布预览。预览服务用目标 revision、生产 renderer、sanitizer、CSS、asset policy 和 locale 生成。

预览 URL 短期、不可索引、需授权，防草稿泄漏。iframe 隔离预览时配置 sandbox/CSP，并通过受控消息同步 viewport，不开放任意 postMessage。

## 三十、定时发布、回滚与缓存

定时发布由服务端持久调度器执行，绑定 timezone、instant、revision 和 operation ID，不靠浏览器 setTimeout。到时重新检查审核、权限/策略和资产状态。

回滚是发布旧 revision 成为新 publication event，不删除历史。发布后清 CDN/ISR/search/social preview 缓存，使用版本键和可观察任务。

## 三十一、发布渲染与 XSS

最安全路径是从验证后的结构化模型创建 DOM/模板节点，文本始终作为 text。若必须产生 HTML，renderer 只输出固定标签/属性，链接和资源再验证，并在服务端做 defense-in-depth sanitizer。

CSP 限制脚本、frame、img 等来源。Trusted Types 可集中 HTML injection sink 的转换并用 CSP 强制，但它不自动提供 sanitizer，策略仍由应用定义；旧浏览器还需相同安全代码路径。

不要因为内容由“管理员”编辑就信任；账号接管、粘贴和供应链都可能注入。

## 三十二、工具栏无障碍

编辑器有可访问名称、说明和明确 focus ring。工具栏可采用 WAI-ARIA toolbar pattern：Tab 进入/离开，方向键在控件间移动，toggle button 使用 `aria-pressed`。

不要制造数十个 Tab stop；下拉菜单、颜色选择和对话框分别遵循对应模式。按钮状态根据 selection 更新，但不反复打断读屏。

## 三十三、文档语义与阅读体验

标题层级、列表、引用和链接文本要有语义，不只视觉样式。发布 lint 检测跳级 heading、空链接、重复锚点、无 alt、只写“点击这里”、超长段落等。

编辑器必须支持键盘完成所有核心操作，200%/400% 缩放、RTL、竖排/多语言（如产品需要）和高对比度。屏幕阅读器在 contenteditable 中差异大，要用真实组合测试。

## 三十四、插件架构与供应链

插件声明 schema nodes、commands、keymaps、parsers、renderers 和 migrations。插件版本影响长期文档，不能随意移除或更新。

建立插件 allowlist、owner、版本锁定、安全审查、bundle budget 和兼容矩阵。远程运行时插件尤其危险，不让 tenant 配置任意模块 URL。

## 三十五、性能

大文档避免每次按键序列化/校验/渲染全部树。按 transaction 增量更新、memoized node view、局部 decoration 和延迟分析。

大粘贴/解析/高亮可 Worker 化，但 Selection/DOM 仍在主线程。设文档节点/字符/表格/历史上限，超限时提供分拆建议而不是浏览器崩溃。

## 三十六、测试策略

纯逻辑覆盖 schema、事务、bookmark、粘贴、链接和发布状态：

<<< ../../../examples/frontend/rich-text-content-publishing/editor-logic.test.mts

还应覆盖：

- unknown/深度/节点预算、未知 mark/node 与 schema 迁移；
- render/parse round trip 与规范化；
- beforeinput/input、键盘、删除、换行、composition；
- 正向/反向 selection、节点删除、异步弹窗恢复；
- undo grouping、redo、协作映射和冲突；
- plain/html/file paste、Word/Docs、超大与 XSS corpus；
- javascript/data URL、外链、embed sandbox 和媒体失败；
- 上传占位、撤销、孤儿资产和 object URL 清理；
- 自动保存、409、审核、定时发布、回滚和缓存失效；
- Trusted Types/CSP report、服务端 sanitizer 与旧内容；
- IME、移动键盘、读屏、RTL、缩放和大文档性能。

真实浏览器 E2E 不可被纯函数测试替代；编辑与 Selection 高度依赖浏览器实现。

## 三十七、可观测性与审计

指标包括编辑器加载、输入延迟、transaction 数/失败、composition 异常、粘贴大小/清洗丢弃、自动保存、冲突、迁移、预览与发布耗时。不要记录正文、剪贴板和敏感 selection。

审计保存 content/revision、actor、schema/plugin versions、命令、审核、发布时间、发布/回滚事件和内容 hash。需要 diff 时使用结构化安全摘要和受限权限。

CSP/Trusted Types violation、sanitizer 丢弃危险节点、异常链接和 embed 拦截进入安全监控，但避免复制攻击 payload 到不安全日志界面。

## 三十八、常见失败模式

1. `contenteditable` 等于编辑器；2. `innerHTML` 是唯一事实；3. 任意 HTML 节点长期存储；4. 只监听 keydown；5. composition 期间重渲染；6. 保存 DOM Range 跨异步操作；7. undo 存整份 HTML；8. 粘贴先插入再清理；9. 正则清洗 HTML；10. 链接只检查字符串前缀；11. 图片保存临时 object URL；12. 任意 iframe/embed；13. 草稿编辑直接改变线上；14. 定时发布依赖浏览器；15. Trusted Types 当 sanitizer；16. 管理员内容默认可信；17. 工具栏只支持鼠标；18. 插件升级不管历史文档。

## 三十九、渐进落地路线

先用成熟框架支持 paragraph/heading/list/link 和结构化 schema；再建设粘贴 pipeline、资产引用、事务自动保存和可靠 Selection；随后加入审核发布、预览、迁移、评论与协作；最后完善插件平台、Trusted Types/CSP、内容 lint、性能预算和安全演练。

## 四十、上线检查清单

- [ ] Content document、editor state、editable DOM 与 published artifact 分离；
- [ ] 文档从 unknown 验证 schema version、节点/属性/预算；
- [ ] 稳定 node ID 贯穿 selection、评论、迁移和审计；
- [ ] schema 迁移逐版、可验证、可回滚并保留原 revision；
- [ ] renderer/parser round trip 与 decoration 忽略规则经过测试；
- [ ] beforeinput/input、IME、移动输入和辅助技术兼容；
- [ ] 所有编辑入口统一产生 schema-valid transaction；
- [ ] undo/redo 分组明确，不与浏览器 history 冲突；
- [ ] selection 使用模型 bookmark/step mapping，不长期保存 DOM Range；
- [ ] Unicode offset/grapheme 语义在客户端、服务端和协作中一致；
- [ ] 粘贴限制体积/深度并经 sanitizer、normalizer 与 schema parser；
- [ ] 外部 HTML 不用正则清洗，未知格式不进入 raw HTML；
- [ ] 链接协议、外链 rel、redirect 与发布策略重新验证；
- [ ] 图片/媒体保存 asset ID，有扫描、转码、alt 和孤儿清理；
- [ ] iframe/embed 使用 provider allowlist 与最小 sandbox/allow；
- [ ] 自动保存幂等并使用 expectedVersion，冲突不 last-write-wins；
- [ ] draft/review/published revision 分离，publish 固定审核版本；
- [ ] 预览使用生产 renderer/sanitizer/CSS 且短期授权；
- [ ] 定时发布由持久服务端任务执行，回滚保留历史；
- [ ] 发布从结构模型安全渲染，并有 CSP/Trusted Types 防线；
- [ ] toolbar、对话框、键盘、读屏、缩放与 RTL 已验证；
- [ ] 插件版本、迁移、安全、owner 和历史兼容受到治理。

## 总结

富文本编辑器的核心不是工具栏，而是稳定内容模型和事务系统：浏览器 DOM 负责输入表面，结构化 schema 负责长期语义，transaction 统一修改，bookmark 保护选择，粘贴 pipeline 收紧外部内容，资产与链接模型保护发布边界，revision/审核/发布状态保证线上一致。成熟框架能提供大量底层能力，但团队仍必须明确自己的 schema、安全、迁移和发布治理。

## 参考资料

- [MDN：contenteditable](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/contenteditable)
- [MDN：beforeinput event](https://developer.mozilla.org/en-US/docs/Web/API/Element/beforeinput_event)
- [W3C：Selection API](https://www.w3.org/TR/selection-api/)
- [MDN：Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API)
- [MDN：InputEvent](https://developer.mozilla.org/en-US/docs/Web/API/InputEvent)
- [MDN：Trusted Types API](https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API)
- [OWASP：Cross-Site Scripting Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [WAI-ARIA APG：Toolbar Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/)
