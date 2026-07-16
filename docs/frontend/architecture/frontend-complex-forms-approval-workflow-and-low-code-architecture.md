---
title: 前端复杂表单、审批工作流与低代码配置架构
description: 系统掌握 schema 驱动表单、条件规则、草稿恢复、并发合并、审批状态机、配置安全、无障碍与生产治理
---

# 前端复杂表单、审批工作流与低代码配置架构

简单表单是几个输入框加一次提交；复杂表单则可能有数百字段、条件显隐、跨页依赖、文件、草稿、多人修改、审批、退回、超时升级和版本迁移。当团队试图用服务端配置减少重复开发时，又会引入新的解释器、安全边界和发布治理。

本课把“数据结构”“呈现布局”“条件规则”“校验”“草稿”“工作流”拆开，建立可测试、可迁移、可恢复的配置驱动架构。低代码不是让服务端向浏览器下发任意 JavaScript，而是让经过版本化和白名单验证的声明式配置进入受控运行时。

## 学习目标

- 区分数据 schema、UI schema、业务规则、权限和工作流；
- 理解 JSON Schema 能做什么、不能做什么；
- 设计组件白名单和受限条件表达式；
- 管理字段依赖、条件显隐、数组和多步骤表单；
- 协调同步、异步和服务端校验；
- 实现草稿自动保存、版本迁移和隐私清理；
- 用乐观并发与三方合并处理多人修改；
- 将审批建模为服务端持久状态机和幂等命令；
- 处理退回、委派、超时、撤回和长任务恢复；
- 建立可访问性、测试、观测和配置发布治理。

## 一、六层模型不要混在一起

```text
Data Schema：字段类型、required、范围与结构
UI Schema：布局、分组、控件选择与帮助文本
Rule Model：显隐、启用、计算和跨字段条件
Authorization：谁能看、改、提交、审批哪些字段/动作
Workflow：文档在草稿、审核、批准等状态间如何流转
Persistence：草稿、正式版本、附件和审计怎样保存
```

把所有内容塞进一个超大 JSON 会让职责互相污染。例如 JSON Schema 的 `required` 表达实例有效性，不等于界面一定显示红色星号；字段能否编辑还取决于当前用户、工作流阶段和资源状态。

## 二、先定义稳定领域文档

表单只是领域文档的一种编辑器。报销单、采购申请或供应商准入应有稳定 document ID、tenant、schema version、data version、workflow instance 和附件引用。

字段 ID 一旦进入草稿、规则、审计、导出和 API，就成为长期合同。不能因为产品改文案而改 ID，也不能用数组下标作为可重复区块的身份。

## 三、JSON Schema 的职责

JSON Schema Draft 2020-12 描述 JSON 数据结构与验证，支持对象、数组、组合、引用和词汇表。应明确 `$schema` dialect，固定实现版本，并对 `format` 是 annotation 还是 assertion 作出一致约定。

JSON Schema 不定义最终组件、页面布局、权限、异步唯一性、数据库事务或审批流程。把 `x-widget` 等扩展关键字用于 UI 是可行约定，但它们不是标准验证语义，必须由自己的版本化 vocabulary/renderer 解释。

服务端仍使用同一领域规则验证提交。前端 schema 校验用于即时反馈，不能成为唯一数据完整性边界。

## 四、UI 配置必须进入组件白名单

渲染器只识别有限字段类型和经过审核的组件映射，不接受配置给出任意模块 URL、Vue component name、HTML、事件处理器或 CSS selector。

<<< ../../../examples/frontend/form-workflow-low-code-architecture/form-schema.ts

示例从 `unknown` 开始验证 schema version、组件种类、字段数量、字段 ID 唯一且格式安全，并要求 select 有选项。生产还要进一步限制嵌套深度、字符串长度、option 数量、引用循环和整体配置体积，防止恶意或错误配置耗尽浏览器。

`labelKey/helpKey` 进入受控国际化资源，不把配置文本当 `v-html`。远端图标、帮助链接和富文本分别使用协议/域名 allowlist 与 sanitizer。

## 五、Schema 与 TypeScript 的关系

静态 TypeScript 类型在编译后不存在，不能验证网络配置和草稿。运行时 schema 才验证 unknown 输入；若从 schema 生成 TS 类型，要在 CI 检查生成物与服务端合同同步。

动态租户自定义字段无法全部变成静态属性。可以让稳定核心字段强类型，将自定义区表示为经过 runtime validation 的记录，避免到处 `as SomeForm`。

## 六、条件规则不要使用 eval

“当 country=CN 且 amountBand 为 high 时显示税号”可以表示为受限 AST，而不是字符串 `data.country === ...`。解释器只支持明确操作符、标量和字段引用。

<<< ../../../examples/frontend/form-workflow-low-code-architecture/rule-engine.ts

受限 AST 可以验证深度、收集依赖、审计、迁移和在服务端复算。示例还用节点预算限制单次求值与遍历，并区分字段缺失和显式 `null`。禁止 `eval`、`new Function`、模板表达式执行、任意属性路径和函数调用，避免配置获得代码执行能力。

规则必须有确定性：不直接读取当前时间、网络或随机数；环境值以显式、可信 input 传入。高风险业务结果由服务端重新计算。

## 七、依赖图与循环

条件、计算字段和选项数据源形成图。配置发布前提取依赖并检测未知字段与循环：A 依赖 B、B 又依赖 A 时，简单 watch 会无限更新。

运行时只在依赖字段变化时重算相关节点，而不是每次按键遍历全部规则。定义拓扑顺序、相等判断和最大计算预算；复杂表达式可以移到 Worker，但不能因此放宽安全语法。

## 八、显隐之后数据怎么办

字段被隐藏时有三种语义：保留值、清除值、提交时忽略。它们影响用户预期、审计和服务端验证，必须由字段策略明确指定。

不要用 CSS 隐藏后继续提交敏感旧值，也不要在短暂切换条件时无提示删除用户输入。常见做法是表单状态暂时保留，构造 command 时根据当前有效 schema 白名单挑选字段；真正清除时给出提示。

隐藏不等于无权访问。服务端字段级授权仍要拒绝用户不应读取或修改的数据。

## 九、计算字段与派生值

展示性合计可以在前端即时计算，提交时服务端重算。财务、权限、风险、税费等结果不能信任浏览器提供。

保存“输入事实”还是“计算快照”取决于审计需求。需要复现历史结果时保存规则版本、输入和服务端计算结果，不要在几年后用最新规则重算旧申请。

## 十、动态选项与级联字段

国家 → 城市、客户 → 合同等选项来自异步查询。请求 key 包含 tenant、依赖值、locale 和权限上下文；上游变化时取消旧请求并验证当前选项是否仍有效。

搜索选择器做 debounce、AbortSignal、分页和空状态。响应回来时检查 request generation，避免慢的旧国家请求覆盖新国家选项。

选项 label 只用于展示，提交稳定 ID；服务端重新验证 ID 属于当前租户和允许范围，防 IDOR。

## 十一、数组字段需要稳定项 ID

可重复联系人、费用明细不能用数组 index 作为组件 key、错误路径和审计身份。每项有 client item ID，服务端保存后映射正式 ID。

删除、排序、复制与插入都要保持焦点和错误关联。数组级规则（至少一项、总额上限、互斥类型）与单项规则分开。大数组考虑分页/虚拟化，但提交与校验仍基于完整领域集合。

## 十二、多步骤表单不是多个独立对象

wizard 需要共享 document/draft version。步骤只是导航投影，可按依赖图决定可达性；不能通过直接修改 URL 跳过服务端必需条件。

每步保存草稿，最终 submit 才进入正式校验和工作流。顶部显示进度、步骤名称与错误数量，允许回到已完成步骤；浏览器后退应有可预测语义。

## 十三、校验分层与触发时机

- 输入级：类型、长度、格式，适合 blur 或合适的即时反馈；
- 跨字段：日期区间、组合条件，依赖变化后重算；
- 异步：编号唯一、额度查询，需 debounce、取消和 generation；
- 服务端：权限、最新数据、事务和外部系统，提交时最终执行；
- 工作流：当前阶段是否允许命令，由工作流服务判断。

不要每次按键显示“必填错误”，也不要只在最后一步一次抛出几十项。客户端与服务端共享稳定 error code/path，文案在前端按 locale 映射；服务端 message 作为安全 fallback，不直接当 HTML。

## 十四、错误摘要与焦点

提交失败时，在表单前提供带标题的错误摘要，每项链接到对应控件；字段通过 `aria-describedby` 关联帮助和错误文本，并设置 `aria-invalid`。不能只用红色边框。

<<< ../../../examples/frontend/form-workflow-low-code-architecture/error-summary.ts

动态错误摘要可使用恰当 live region，并把焦点移到摘要或第一个错误，策略保持一致。切到包含错误的折叠区/步骤后再聚焦控件，不能把焦点发给未渲染节点。

## 十五、草稿是版本化数据

草稿至少包含 document ID、schema version、base data version、保存时间和数据。没有这些元数据，恢复时无法判断属于哪个文档、能否迁移或是否覆盖了更新版本。

<<< ../../../examples/frontend/form-workflow-low-code-architecture/draft-envelope.ts

解码本地存储永远从 unknown 开始，验证 envelope 后执行显式迁移，并把草稿标记为迁移后的 schema version。迁移失败时保留原始副本并提供安全导出/放弃选择，不用类型断言硬塞给新表单。

敏感表单默认使用服务端草稿；localStorage 长期明文不适合身份证、健康、薪资等数据。IndexedDB 也不是安全保险箱，XSS 与本机用户仍可能访问。

## 十六、自动保存是一套协议

自动保存需要 dirty tracking、debounce、single-flight、版本条件和状态提示：`未保存 → 保存中 → 已保存 → 冲突/离线`。输入期间不应不断覆盖正在发送的 snapshot；本次完成后若仍 dirty，再发送下一版。

请求携带 operation ID 与 expectedVersion。超时后使用同一操作 ID 查询/重试，避免生成重复草稿版本。页面关闭时 `beforeunload` 只能作为提示，不能保证异步保存完成。

## 十七、离线草稿与恢复

离线可编辑前先定义字段和附件是否允许缓存、保留多久、账号/租户切换如何清理。每个草稿 namespace 包含 subject、tenant、document 和 schema version。

网络恢复后先读取服务端最新 base，再合并；不能盲目 PUT 本地整份对象。Service Worker Background Sync 可改善重试，但支持和权限会变化，服务端照常校验身份、版本和字段授权。

## 十八、并发编辑需要三方合并

保存时服务端用 ETag/expectedVersion 检测冲突。已知 base、local 和 remote 后才能判断：只有本地改、只有远端改、双方同值，或真正冲突。

<<< ../../../examples/frontend/form-workflow-low-code-architecture/three-way-merge.ts

示例做浅字段合并，适合说明原理。嵌套对象、数组排序、富文本需要领域专用 merge 或 CRDT/OT；不能用通用深合并假装解决语义冲突。

冲突 UI 展示字段标签、双方值、修改者和时间，让用户逐项选择；保存选择时仍带最新版本，防解决期间再次冲突。

## 十九、工作流属于服务端

审批可能跨数天、涉及定时器、重试、外部系统和多参与者，不能依赖一个保持打开的 SPA。服务端工作流/领域状态机持久化实例、历史和待办，前端读取投影并发命令。

<<< ../../../examples/frontend/form-workflow-low-code-architecture/workflow-state.ts

`allowedCommands` 是服务端基于当前 subject、阶段和策略给出的 UI 投影；调用 approve 时服务端再次授权。版本更高的 snapshot 才覆盖当前状态，避免轮询和事件乱序导致回退。

## 二十、状态与命令分开

状态是事实，如 `in_review`；命令是意图，如 `approve`。不要让前端提交 `{ status: 'approved' }`，而应提交 `ApproveApplication(instanceId, expectedVersion, comment, operationId)`。

命令 API 验证当前状态、操作者、职责分离、必要评论和版本，并幂等地产生事件。相同 operation ID 不重复审批或发送通知。

## 二十一、工作流版本与运行实例

新流程发布后，已运行实例通常继续使用启动时的 definition version。直接让旧实例读取最新节点图，可能跳过审批人或进入不存在节点。

迁移运行实例是显式运维操作：定义 source/target version、状态映射、数据迁移、补偿和审计。前端根据实例的 definition version 渲染兼容投影，而不是假定所有实例相同。

## 二十二、审批人解析与职责分离

“直属经理”“成本中心负责人”是服务端解析规则。提交时或进入节点时解析取决于业务：前者形成历史快照，后者跟随组织变化。语义必须明确并审计。

申请人不能审批自己、同一人不能完成相互制约的节点、代理人不能越过委派范围。前端可提示，服务端通过 actor 历史与策略最终执行。

## 二十三、退回、撤回与重新提交

`changes_requested` 不是回到一个没有历史的 draft。保留原提交版本、审核意见、允许修改字段和新修订号。重新提交产生新版本并关联上一版本。

撤回只在服务端允许的阶段可用；外部付款/签署已经开始时可能需要补偿而不是简单回滚。按钮文案准确说明影响。

## 二十四、并行审批、会签与法定人数

并行节点可能是 all-of、any-of、至少 N 人、按组各一人。前端展示规则、已完成数量和剩余条件，但不自己计算最终通过。

重复点击、两个审批人同时操作和撤权竞态通过 command version、幂等和服务端事务处理。晚到响应只触发重新读取实例。

## 二十五、超时、升级与委派

定时器在工作流引擎/持久调度器中运行，不能靠 `setTimeout` 或用户浏览器在线。超时可提醒、升级、自动拒绝或转派，每个动作需幂等和审计。

休假委派包含委托人、受托人、范围、有效期和禁止权限；页面持续显示“代表谁操作”。委派不能自动绕过职责分离。

## 二十六、附件与工作流

附件采用预签名/分片上传、服务端 finalize、病毒扫描和状态投影。上传完成不等于可提交；工作流校验引用的附件属于当前 tenant/document、扫描通过且未过期。

新版本替换附件时保留历史引用和审计，下载使用短期授权。配置不能提供任意 bucket/path。

## 二十七、低代码编辑器的安全边界

设计器用户也是潜在不可信输入源。发布前服务端验证 schema dialect、组件 allowlist、规则 AST、依赖无环、权限引用、国际化 key、数据源、URL、资源预算和兼容性。

预览运行在隔离环境，使用合成数据，不能因为“管理员配置”就访问生产 secret 或任意 API。插件需要签名、版本锁定、权限 manifest 和供应链审查。

低代码运行时不是通用浏览器内代码沙箱；如果业务需要任意脚本，应移到真正隔离、受配额和审计的服务端执行环境。

## 二十八、配置发布治理

配置经历 draft → validation → review → staged → published → deprecated。发布生成不可变 definition version、内容 hash、作者、审批人与变更说明。

灰度按 tenant/subject 稳定分桶，监控渲染错误、校验失败、完成率和性能。回滚指向上一不可变版本；不能原地覆盖导致正在编辑的草稿含义变化。

兼容性检查识别删除必填字段、改变类型、缩小 enum、修改规则等 breaking change，并要求迁移策略。

## 二十九、性能架构

不要把 500 字段一次全部响应式深监听和渲染。按步骤/分区懒渲染，依赖图做增量计算，稳定 key 保留输入状态，昂贵校验 debounce 或 Worker 化。

性能预算包括配置解析、首个可编辑时间、单次输入响应、规则重算节点数、自动保存 payload 和内存。虚拟化表单前评估焦点、浏览器查找和错误跳转，不能牺牲可访问性。

## 三十、测试策略

纯逻辑覆盖配置、规则、合并、状态和错误映射：

<<< ../../../examples/frontend/form-workflow-low-code-architecture/form-workflow.test.mts

还应覆盖：

- schema dialect、未知组件、重复 ID、深度/体积与引用循环；
- 规则 truth table、未知字段、循环、依赖和计算预算；
- 显隐后的保留/清除/提交语义；
- 异步选项乱序、取消、租户与权限变化；
- 草稿损坏、旧版本迁移、账号/租户切换和隐私清理；
- 自动保存 single-flight、离线、超时、幂等和版本冲突；
- 三方合并、数组/富文本冲突和再次冲突；
- 工作流非法命令、重复命令、并发审批和职责分离；
- 退回、重提、委派、超时、迁移与附件扫描；
- 键盘、读屏、缩放、错误摘要、焦点和多步骤导航；
- 大配置、长表单和低端设备性能。

属性测试适合规则 AST、迁移和 merge invariants；状态模型测试适合验证任何命令序列都不能越过必要审批。

## 三十一、可观测性与审计

记录不含表单敏感值的 definitionVersion、documentId、dataVersion、workflowInstanceId、phase、command、operationId、actor、duration 和 error code。字段级错误指标使用 field ID/code，谨慎控制 cardinality。

审计保存配置发布 diff、文档版本、命令、真实 actor/代理关系、审批意见策略、前后状态和关联 ID。不要把密码、证件、健康信息或完整表单 payload indiscriminately 写日志。

监控 schema 加载失败、规则预算超限、草稿恢复/迁移失败、自动保存延迟、409 冲突率、表单放弃、审批停留时间、定时器积压和通知失败。

## 三十二、常见失败模式

1. 一个 JSON 同时承担数据、UI、权限和流程；2. TypeScript 类型代替运行时验证；3. 配置指定任意组件/HTML；4. 用 `eval` 执行条件；5. watch 互相赋值形成循环；6. 隐藏字段仍提交敏感旧值；7. 数组 index 作为身份；8. localStorage 明文存敏感草稿；9. 自动保存整对象且无版本；10. 冲突时 last write wins；11. 前端直接修改 approved 状态；12. allowedCommands 当服务端授权；13. 用 `setTimeout` 做审批超时；14. 发布覆盖旧 definition；15. 错误只有红框没有摘要和关联。

## 三十三、渐进落地路线

先建立稳定领域文档、runtime schema 和普通手写表单；再抽出字段组件白名单、错误合同和安全规则 AST；随后加入版本化草稿、自动保存、并发合并和服务端工作流命令；最后建设低代码编辑器、配置审核灰度、实例迁移、性能预算与全链路审计。

## 三十四、上线检查清单

- [ ] 数据 schema、UI schema、规则、权限、工作流和持久化分层；
- [ ] 明确 JSON Schema dialect、validator 版本和 format 语义；
- [ ] 网络 schema/draft 从 unknown 做运行时验证；
- [ ] 组件、富文本、URL、数据源和插件使用严格 allowlist；
- [ ] 条件采用受限 AST，无 eval/new Function/任意属性访问；
- [ ] 规则依赖无未知字段和循环，有深度/节点/执行预算；
- [ ] 隐藏字段的保留、清除和提交语义明确；
- [ ] 异步选项有取消、generation、tenant 与资源授权校验；
- [ ] 数组项有稳定 ID，多步骤共享 document/draft version；
- [ ] 错误摘要、字段关联、焦点、读屏和键盘经过验证；
- [ ] 草稿包含 schema/base version，并有迁移和隐私清理策略；
- [ ] 自动保存 single-flight、幂等、可观察且不依赖 unload 完成；
- [ ] 并发写使用 ETag/expectedVersion，冲突做领域合并；
- [ ] 工作流持久化在服务端，前端只发幂等命令和读投影；
- [ ] allowedCommands 仅用于 UI，服务端每次重新授权；
- [ ] 运行实例绑定 definition version，迁移是显式审计操作；
- [ ] 职责分离、并行审批、委派和超时由服务端保证；
- [ ] 附件归属、扫描和版本在提交/审批时重新校验；
- [ ] 配置发布不可变、可灰度、可回滚且有兼容性检查；
- [ ] 敏感值不进入日志、分析、回放和无治理本地存储。

## 总结

复杂表单的可维护性来自清晰分层：JSON Schema 描述数据，UI schema 选择受控组件，安全 AST 表达条件，版本 envelope 保存草稿，三方合并处理并发，服务端状态机持久化审批。低代码的价值不是执行更多动态代码，而是把可重复的业务变化限制在可验证、可迁移、可审计的声明式边界内。

## 参考资料

- [JSON Schema：Draft 2020-12](https://json-schema.org/draft/2020-12)
- [JSON Schema：Understanding JSON Schema](https://json-schema.org/understanding-json-schema/)
- [W3C WAI：Forms Tutorial](https://www.w3.org/WAI/tutorials/forms/)
- [W3C WAI：Form User Notifications](https://www.w3.org/WAI/tutorials/forms/notifications/)
- [W3C：WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [OMG：Business Process Model and Notation 2.0.2](https://www.omg.org/spec/BPMN/2.0.2/)
- [MDN：Using the Constraint Validation API](https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Constraint_validation)
- [MDN：IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [MDN：ETag](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/ETag)
