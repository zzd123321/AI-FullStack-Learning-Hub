---
title: 前端搜索、筛选、排序与数据查询体验架构
description: 系统掌握查询状态、URL 编解码、搜索语义、分面筛选、稳定排序、游标分页、请求竞态、高亮、无障碍与生产治理
---

# 前端搜索、筛选、排序与数据查询体验架构

搜索页面看似只是输入框和结果列表，实际上连接着用户意图、URL 状态、服务端查询语言、搜索索引、缓存、排序、分页和无障碍交互。一个慢响应覆盖新结果、一个不稳定排序造成重复项、一个错误的“共 12,345 条”或一段未经转义的高亮 HTML，都可能直接破坏可信度。

本课从查询合同开始，把输入草稿、已提交查询、筛选、排序、游标、分面统计和结果呈现分层，建立可分享、可恢复、可取消、可审计的数据查询体验。具体搜索引擎可以变化，前端领域模型不应暴露 Elasticsearch/Lucene/SQL 的任意查询语法。

## 学习目标

- 区分用户输入草稿、已提交条件、请求与结果快照；
- 设计可验证、可规范化、可分享的 URL 查询合同；
- 理解全文搜索、精确筛选、排序和分面的不同语义；
- 正确选择 offset、cursor/search-after 与快照分页；
- 解决 debounce、AbortSignal、旧响应和缓存混页；
- 建模 AND/OR 筛选、分面计数和近似总数；
- 安全呈现摘要与命中高亮；
- 实现可访问搜索框、自动建议、结果状态和键盘交互；
- 处理权限过滤、隐私、国际化、SEO、测试和可观测性。

## 一、先拆开四种状态

```text
Input draft：输入框中正在编辑的文字
Committed query：已确认、写入 URL、可请求的查询条件
Request state：generation、cursor、loading、error
Result snapshot：命中、分面、总数语义、next cursor、索引版本
```

如果每次按键直接覆盖 committed query，浏览器历史会充满字符级记录，URL、结果和输入可能互相追逐。如果所有状态又只有一个 `searchText`，就无法表达“用户正在改词，但仍查看上一批结果”。

简单站内搜索可按 Enter/按钮提交；自动建议通常 debounce 输入，但选择建议或提交才进入完整结果页。产品应明确，而不是由组件默认行为决定。

## 二、定义前端查询领域模型

查询对象只包含产品允许的字段：term、filter、sort、cursor/page size。不要让浏览器发送任意字段名、SQL、Lucene query string、脚本排序或聚合表达式。

服务端把稳定的前端合同翻译为搜索引擎 DSL，并执行 tenant、权限、资源范围、成本和字段 allowlist。前端隐藏某个筛选项不等于用户不能手写参数。

## 三、URL 是可分享状态，不是数据库语句

适合放入 URL 的状态包括搜索词、非敏感筛选、排序和必要分页定位。URL 支持刷新、前进后退、分享和服务端渲染，但会进入历史、日志、分析、referrer 和截图。

姓名、邮箱、客户编号、健康条件等敏感搜索不应默认形成可分享 URL；可使用 POST search session 或短期 opaque query ID，并配置 referrer 与日志脱敏。

## 四、查询参数必须从不可信输入解析

`URLSearchParams` 支持重复参数；`get()` 只取第一个，`getAll()` 才适合多选筛选。它负责 form-urlencoded 编解码，调用方操作解码后的值，不要手工双重编码。

<<< ../../../examples/frontend/search-query-experience/query-codec.ts

示例对 sort/status 使用 allowlist，限制 term、category 数量和长度，对重复 category 去重排序，并把 cursor 当格式受限 opaque 值。未知参数被忽略，不传播到后端查询 DSL。

## 五、规范化决定缓存与分享是否稳定

语义相同的条件应产生同一 canonical query：默认值省略、多选值去重并排序、空白规范化、参数顺序固定。它可作为 query cache key、请求指纹和 canonical URL 的基础。

不要对自然语言 term 随意 lowercase、Unicode normalize 或去标点，除非搜索合同明确这么做；某些语言和标识符中这些变化并不等价。规范化策略应由前后端共享版本。

筛选、排序或 term 改变后旧 cursor 必须删除。cursor 只对原 query/sort/snapshot 有意义，混用会跳项、重复或被服务端拒绝。

## 六、History push 还是 replace

- 正式提交、选择筛选、改变排序：通常 `pushState`，让后退恢复上一查询；
- 输入草稿同步、折叠面板、频繁滑杆：可 `replaceState` 或不进 URL；
- 无限滚动每批 cursor：通常不为每批 push，另存可恢复位置；
- 点击分页页码：用户期望可后退，可 push。

监听 `popstate` 时以 URL 重新构建 committed query，避免 store 再反向覆盖 URL。SSR 初始查询与客户端 hydrate 使用同一 codec。

## 七、搜索不是字符串 includes

全文搜索涉及 analyzer、tokenization、stemming、同义词、拼写、字段权重、语言和相关性。`includes()` 只适合小型已加载集合，不能代表生产搜索语义。

UI 要说明搜索范围：标题、正文、标签还是编号。精确 ID/邮箱查询与自然语言搜索可走不同模式，但切换要显式，不能靠隐蔽语法让普通用户猜。

## 八、输入、提交与 debounce

debounce 是减少自动建议请求的体验策略，不是后端保护。后端仍做速率、配额、最小字符和查询成本限制。

中文 IME composition 期间不要按中间字串提交；监听 composition 状态。粘贴、语音输入、清空和浏览器 autofill 同样要测试。

提交时 trim 是否改变原意要谨慎；保留用户显示值和规范化请求值可以是两个字段。

## 九、请求竞态：取消与代际检查缺一不可

用户先搜 `vue`，再搜 `typescript`。旧请求可能最后完成；只按完成顺序写 store 会把新结果覆盖回旧结果。

<<< ../../../examples/frontend/search-query-experience/latest-search.ts

示例先 abort 上一请求，再用 generation 检查返回值。abort 能减少资源，却不能保证服务端停止或第三方 Promise 服从 signal；generation 才保证旧结果不被应用。

取消错误通常不显示为失败。真正网络错误保留当前 committed query 和旧结果（若产品允许），提供明确重试，不自动清空为“无结果”。

## 十、加载、空结果和旧数据

首次加载可显示骨架；已有结果上改变小筛选时，可保留旧结果并显示 updating，但必须标注它们对应旧条件，不能让用户误操作。

区分：尚未搜索、加载中、无匹配、请求失败、权限过滤后为空、索引尚未同步。一个统一 empty component 会给出错误解释。

结果计数和状态变化通过克制的 live region 通知，不要每次按键打断读屏。

## 十一、缓存键与查询指纹

缓存 key 至少包含 subject/tenant、canonical query、sort、locale、权限/索引版本（按风险）和 page/cursor。账号或租户切换时不能复用结果。

服务端可返回不含秘密的 `queryFingerprint`，每页必须匹配，防止筛选变化后把旧页追加到新列表。fingerprint 是一致性标识，不是授权凭证。

## 十二、排序必须稳定且可解释

排序字段包括 relevance、date、title、price 等。任何分页排序都需要唯一 tie-breaker，例如 `(updatedAt desc, id desc)`；只按日期会让相同时间记录跨页重复或丢失。

相关性分数可能随索引刷新变化；深分页需要 snapshot/PIT 或接受“结果可能变化”的产品语义。UI 不应承诺搜索排名永久固定。

locale-sensitive title 排序由后端使用明确 collation；前端不能拿当前页再排序冒充全局排序。

## 十三、Offset 分页的边界

offset/page number 适合结果较小、需要跳页和总页数的后台表格。缺点是深 offset 成本高，数据插入删除后页面漂移。

不要因为 UI 有“第 999 页”就要求搜索引擎扫描巨大 offset。产品可限制最大页、提供精确筛选或导出异步任务。

## 十四、Cursor / search-after 分页

cursor 封装最后一条的稳定 sort values、query/snapshot 和必要签名；前端不解析，只原样传回。改变 query/sort/page size 后丢弃。

Elasticsearch 官方建议深分页使用 `search_after`，保持相同 query/sort，并提供唯一 tie-breaker；索引刷新会改变顺序时使用 PIT 保持快照。

cursor 应短期、不可伪造或在服务端验证，限制长度与资源消耗。过期返回明确状态，前端从第一页重启并说明结果已更新。

## 十五、合并无限滚动页面

<<< ../../../examples/frontend/search-query-experience/cursor-pages.ts

示例先核对 query fingerprint，再按稳定 ID 去重；同一 ID 新页可更新旧投影。真实实现还要决定列表顺序、删除项、snapshot 过期和滚动锚点。

“加载更多”按钮通常比自动 IntersectionObserver 更可控、更可访问；可自动预取，但保留按钮、加载状态和重试入口。不要让页脚永远被无限滚动推走。

## 十六、返回列表时恢复什么

用户进入详情再返回，期望恢复 committed query、已加载页、滚动位置和焦点项。只保存 scrollY 不够，因为列表高度和结果可能变化。

保存 query fingerprint、item ID 与相对 offset；恢复数据后定位稳定 ID。若 snapshot 过期，说明结果已更新并尽量定位该对象。bfcache 恢复时重新确认权限和必要状态。

## 十七、筛选语义：同组 OR、跨组 AND

电商常见语义：同一 facet 内品牌 A 或 B，不同 facet 间品牌条件且价格条件。也有后台要求全部标签 AND，因此 UI 和 API 必须显式定义。

<<< ../../../examples/frontend/search-query-experience/facet-selection.ts

筛选 chip、checkbox、清除单项与清除全部共享同一 reducer。筛选值使用稳定 ID，label 可本地化。选中隐藏在“更多”中的值仍要在 active filters 区可见。

## 十八、分面计数不是简单 total

分面计数通常回答“当前查询下选择此值会有多少结果”。计算时该 facet 是否排除自身过滤会影响体验：self-filtering 显示当前交集，disjunctive faceting 可显示添加其他值后的可能性。

分布式 terms aggregation 的 bucket count 可能近似，并可能省略长尾 bucket。API 应返回 `relation: eq|gte|approximate` 或 error metadata，UI 不把近似值伪装成财务级精确数字。

高基数字段不适合一次列出全部 facet；使用搜索式筛选、composite/cursor 或专用字典服务。

## 十九、总数也有语义

响应可表达：精确 328、至少 10,000、约 2.3 万、未计算。为每次按键计算精确 total 可能比返回首屏结果更昂贵。

UI 根据 relation 显示“328 条”“10,000+”“约 2.3 万”，不要统一 `total: number`。分页是否能显示末页也取决于 total 是否精确。

## 二十、自动建议与完整搜索不同

suggest endpoint 优化低延迟和少量候选，可返回历史查询、实体和补全；完整 search 返回授权后的结果、分面与分页。不要让 suggestion payload 包含用户无权看到的标题或存在性。

每个候选有稳定 ID、类型、主标签和必要描述。选择候选是导航到实体、填入 term 还是加入 filter，应由类型明确。

## 二十一、Combobox 无障碍

原生搜索 input 加普通提交按钮优先。需要自动建议时，按 WAI-ARIA combobox pattern 实现 accessible name、expanded、controls、active descendant、listbox/option 状态和键盘模型。

输入焦点通常留在 combobox，用 `aria-activedescendant` 表达活动候选；方向键浏览、Enter 选择、Escape 关闭且保留输入、Tab 行为都要一致。视觉 hover 不能取代键盘 active。

不要把每个候选都放进 Tab 顺序，也不要自动选择第一项后在 blur 时偷偷改用户输入，除非产品明确采用该 autocomplete 模式并完整实现。

## 二十二、查询语法与高级搜索

如果支持 `status:open owner:me`，应有真正 parser、token/span error、转义和自动补全；不能用字符串 split。解析结果转为受限 AST，服务端验证字段、操作符、类型和成本。

普通用户最好通过筛选 UI 构造 AST，高级文本语法与 UI 双向同步需要 canonical printer。无法无损表示的条件不要悄悄丢失。

## 二十三、安全高亮

搜索引擎常返回带 `<em>` 的片段，但把它直接 `innerHTML`/`v-html` 会扩大 XSS 边界。优先让服务端返回原始文本和已验证 range/结构化 segments，前端用文本节点与 `<mark>` 渲染。

<<< ../../../examples/frontend/search-query-experience/highlight-segments.ts

示例要求范围递增、不重叠、不越界且不切断 UTF-16 代理对，输出纯文本 segment。偏移单位必须约定：示例使用 JavaScript UTF-16 code unit；若服务端按 Unicode code point/UTF-8 byte 计算，需要转换，否则 emoji 和组合字符会错位。若产品要求按用户感知字符截取，还要采用一致的 grapheme segmentation。

如果只能接收高亮 HTML，服务端使用可信 sanitizer 与固定标签/属性 allowlist，前端仍不拼接用户输入。

## 二十四、摘要、截断与匹配上下文

结果摘要应围绕命中位置截取，保留字段来源和省略标记。前端 CSS line-clamp 只做视觉截断，屏幕阅读器与复制语义需测试。

搜索结果可能来自不同语言字段；标记“标题匹配”“正文匹配”，不要把隐藏敏感字段的命中暴露给无权用户。

## 二十五、权限与索引一致性

搜索服务必须在查询阶段执行 tenant 与资源授权，不能先返回全量 hits 再让前端过滤。否则 total、facet、suggestion 和 timing 都可能泄露数据。

权限撤销与索引更新可能有延迟；读取详情时业务服务再次授权。搜索结果点击后 404/403 是可接受一致性状态，前端刷新结果并解释，不缓存敏感摘要过久。

文档级 ACL 过滤、共享关系和 policy version 应进入服务端查询与缓存策略。

## 二十六、国际化搜索

中文分词、日文形态、大小写、重音、同义词和拼写纠错依赖 locale 与 analyzer。浏览器 locale、用户偏好、文档语言和查询语言可能不同。

前端传受控 locale/language hint，服务端选择索引策略；不要用 JavaScript lowercase 假装完成国际化搜索。排序同样使用明确 collation。

RTL 输入、混合方向文本和高亮片段需视觉测试。日期/数字筛选使用结构化值，不解析本地化展示字符串。

## 二十七、SEO 与公开搜索页

公开可索引列表要控制无限参数组合造成 crawl explosion。只为有价值的规范筛选生成 canonical URL；noindex、robots 和 sitemap 策略由产品/SEO 决定。

SSR 输出与客户端查询必须同一 canonical contract，避免 hydrate 后结果突变。用户私有搜索页通常不应被索引，并禁止公共 CDN 缓存。

## 二十八、预取与性能

可在用户接近页尾或聚焦建议时预取，但尊重网络、Save-Data、服务端成本和缓存命中。预取永远使用相同 query fingerprint，条件变化立即取消。

性能预算包括 input latency、suggest p95、首批结果、分面、页面追加、DOM 节点和图片。结果列表虚拟化要保留焦点、屏幕阅读器位置与返回恢复。

## 二十九、错误与降级

- 400：查询合同无效，重置非法参数并提示；
- 401/403：身份或权限变化，不当作无结果；
- 408/网络错误：保留条件和可用旧结果，允许重试；
- 429：停止自动重试，遵循 Retry-After；
- cursor expired：从第一页重启并说明结果更新；
- partial/timed_out：明确结果可能不完整，提供重试/收紧条件；
- engine unavailable：可降级到受限数据库查询，但标注能力差异。

不要无限重试昂贵搜索，也不要把错误清空成“0 条结果”。

## 三十、测试策略

纯逻辑覆盖 codec、fingerprint、分面和安全高亮：

<<< ../../../examples/frontend/search-query-experience/search-logic.test.mts

还应覆盖：

- 重复/未知/超长参数、编码、空值和 canonical round trip；
- query 变化自动清 cursor，前进后退恢复 committed query；
- IME、粘贴、清空、debounce 和提交语义；
- 旧请求后到、abort 不生效、错误与重试；
- 稳定 tie-breaker、插入删除、cursor/PIT 过期；
- fingerprint 不匹配、重复 hit 和滚动恢复；
- 同 facet OR、跨 facet AND、清除和隐藏选中项；
- exact/gte/approximate total 与 facet count；
- suggestion 权限、选择动作和 combobox 全键盘模型；
- 高亮越界、重叠、emoji/组合字符和 XSS payload；
- tenant/subject/cache/索引权限隔离；
- 多语言 analyzer、RTL、排序与低端设备性能。

后端使用固定语料相关性回归集和授权数据集；前端 snapshot 测试不能证明搜索质量。

## 三十一、可观测性与搜索质量

记录脱敏 query hash/分类、canonical filter、sort、page depth、latency、timeout、result relation、click rank、zero result 和 refinement，不默认记录原始敏感 term。

业务指标包括 search-to-click、首次点击时间、query reformulation、零结果率和最终任务完成；点击率高不一定质量高，可能是结果误导。相关性实验按用户稳定分桶，并监控权限与延迟回归。

trace 串联 frontend generation/query fingerprint、gateway、search request 和索引版本。高 cardinality query 文本不作为指标 label。

## 三十二、常见失败模式

1. 输入草稿等于已提交查询；2. 任意 URL 参数直传搜索 DSL；3. 手工拼接/双重编码；4. 筛选变化保留旧 cursor；5. debounce 当作后端保护；6. 只 abort 不做 generation；7. query cache 不含 tenant/subject；8. 当前页前端排序冒充全局排序；9. 排序没有唯一 tie-breaker；10. 深 offset 无限开放；11. 混合不同 fingerprint 页面；12. 把近似 count 显示为精确；13. suggestion 泄露无权实体；14. `v-html` 渲染引擎高亮；15. 403/超时显示为零结果；16. 自制 combobox 只支持鼠标。

## 三十三、渐进落地路线

先建立受限 SearchQuery、URL codec、服务端权限过滤和稳定排序；再加入 committed/input 分离、generation、缓存键和明确状态；随后建设 cursor/fingerprint、分面、建议与安全高亮；最后完善快照分页、国际化相关性、无障碍、质量评估和隐私治理。

## 三十四、上线检查清单

- [ ] 输入草稿、committed query、请求和结果快照分离；
- [ ] 查询合同使用 allowlist，未暴露任意搜索引擎 DSL；
- [ ] URL 从不可信输入解析，未知/重复/长度/默认值有明确语义；
- [ ] canonical query 稳定，敏感搜索不进入 URL、日志和 referrer；
- [ ] term/filter/sort 变化会删除 cursor 并创建新 fingerprint；
- [ ] History push/replace、popstate、SSR/hydration 行为一致；
- [ ] debounce、IME、提交与自动建议语义经过验证；
- [ ] 请求同时使用 AbortSignal 和 generation 防旧响应覆盖；
- [ ] loading、updating、empty、error、partial 和 unknown 分离；
- [ ] cache key 包含 subject、tenant、query、locale 与必要策略版本；
- [ ] 排序有唯一 tie-breaker，未对当前页冒充全局排序；
- [ ] 深分页使用 cursor/search-after，必要时绑定 snapshot/PIT；
- [ ] 页面追加验证 fingerprint、稳定 ID、过期和返回恢复；
- [ ] 同组/跨组筛选逻辑与计数 self-filter 语义明确；
- [ ] total/facet 的 exact、gte、approximate 和 omitted 正确呈现；
- [ ] suggestion 与结果在服务端执行 tenant/资源授权；
- [ ] combobox accessible name、ARIA、焦点和键盘模型完整；
- [ ] 高亮使用文本 segment/range，不直接注入不可信 HTML；
- [ ] 偏移单位、emoji、组合字符、多语言与 RTL 已测试；
- [ ] 查询隐私、搜索质量、延迟和零结果有持续监控。

## 总结

可靠查询体验不是“输入框请求一个接口”，而是一套稳定协议：受限领域模型表达意图，URL codec 负责分享与恢复，服务端负责搜索语义和授权，稳定排序与 cursor 保证分页，generation 防止竞态，结构化高亮保护渲染边界，精确/近似元数据维护用户信任。前端最终要让用户知道自己搜了什么、结果处于什么快照、为何为空，以及下一步如何收紧或恢复。

## 参考资料

- [MDN：URLSearchParams](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams)
- [WHATWG：URL Standard](https://url.spec.whatwg.org/)
- [MDN：AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
- [WAI-ARIA APG：Combobox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
- [Elasticsearch：Paginate search results](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/paginate-search-results)
- [Elasticsearch：Terms aggregation](https://www.elastic.co/docs/reference/aggregations/search-aggregations-bucket-terms-aggregation)
- [MDN：History API](https://developer.mozilla.org/en-US/docs/Web/API/History_API)
- [MDN：search input](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/search)
