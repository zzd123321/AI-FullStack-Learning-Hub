---
title: 前端国际化与本地化工程
description: 系统设计 Locale 协商、消息格式、复数、日期数字、时区、RTL、翻译资产、伪本地化、SSR 一致性与持续交付
outline: deep
---

# 前端国际化与本地化工程

把中文文案复制到 `en.json` 并不等于完成国际化。真实产品还会遇到：

- 用户选择 `en-GB`，系统只支持 `en-US`，应该如何回退；
- 英语有单复数，阿拉伯语有 zero、one、two、few、many、other；
- 同一个 Instant 在上海、伦敦和纽约显示成不同日期；
- 金额的小数位、货币符号位置和数字系统不同；
- 阿拉伯语页面中混入订单号和 URL 后，标点顺序错乱；
- 服务端按 UTC/中文渲染，浏览器按本地时区/英文 Hydration；
- 翻译资源比应用 Bundle 更新，缓存组合出不兼容版本；
- “自动扫描全部通过”，按钮仍被德语长文本撑破。

国际化工程的目标不是把字符串替换掉，而是让语言、地区、书写方向、数字、日历、时区和文化规则成为显式上下文，并在构建、运行时、SSR、缓存、测试和翻译流程中保持一致。

这节课沿着一次真实请求展开：先决定“用户要哪种语言环境”，再选择消息和格式化规则，然后把相同上下文带过 SSR、资源加载、RTL 布局与翻译交付。这样能看清每个概念为什么出现，而不是记住一组互不相干的 API。

## 先建立请求级语言环境

国际化的第一个问题不是翻译哪句话，而是当前请求究竟使用什么 Locale。Locale 若仍隐含在浏览器或服务器默认值中，后面的消息、日期、缓存和 Hydration 就没有共同依据。

### Internationalization 与 Localization

Internationalization（i18n）是让软件能够适应不同语言文化而不重写架构：抽取消息、显式 Locale、格式化 API、RTL 布局和可替换资源。

Localization（l10n）是为目标市场产出具体体验：翻译、术语、日期数字、图片、法律内容、帮助中心和质量审核。

还常见 Globalization：选择市场、法规、运营和发布策略。前端主要负责 i18n 能力与 l10n 交付接缝。

### Locale 不是 Language，也不是 Country

BCP 47 Locale 可以包含语言、书写系统、地区、变体和 Unicode Extension：

```text
en-US       英语 + 美国地区
pt-BR       葡萄牙语 + 巴西地区
zh-Hans-CN  中文 + 简体书写系统 + 中国地区
sr-Latn     塞尔维亚语 + 拉丁书写系统
th-TH-u-nu-thai  泰语区域，并请求泰文数字系统
```

语言不唯一决定地区格式，国家也可能有多种语言。不要把 `countryCode` 当 Locale，也不要用 `locale.split('-')[1]` 假设第二段永远是地区。

`Intl.Locale` 用于解析和规范化 Unicode Locale；应用仍要定义自己支持哪些翻译资源。

### Locale 协商是产品策略

浏览器 `navigator.languages`、HTTP `Accept-Language`、URL、用户档案和 Cookie 都可能提供偏好。优先级必须明确，例如：

```text
URL 显式 Locale > 已登录用户设置 > Locale Cookie > Accept-Language > 产品默认值
```

示例先规范化输入，再做精确匹配，并利用 likely-subtags 避免把 `zh-TW` 仅凭基础语言误匹配到简体 `zh-CN`：

<<< ../../../examples/frontend/internationalization/locales.ts

#### 为什么不能依赖运行时默认 Locale

`new Intl.DateTimeFormat()` 不传 Locale 会使用环境默认值。开发机、Node Server、Edge Runtime 和用户浏览器可能不同，因此 SSR、测试和缓存都不可预测。应用层必须传入已经协商好的 Locale。

#### Fallback 必须可观测

Fallback 能避免白屏，却也可能把阿拉伯语页面混入英文或中文。每次缺失 Key 应记录 Locale、Key、Catalog Revision 和 Release，并在 CI 尽量提前阻止，而不是永久依赖运行时兜底。

### Locale 是请求级上下文，不是进程全局变量

SSR Server 同时处理不同用户请求。若把当前 Locale 写进 Module Singleton，请求 A 的中文可能泄漏到请求 B 的英文。

Locale Context 应随请求创建，并传入：

- Catalog Loader；
- Message Formatter；
- Number/Date/Relative Time Formatter；
- `<html lang dir>`；
- Cache Key；
- Telemetry 的低基数维度。

客户端可以通过 Framework Provider 提供上下文，但底层格式化函数仍应显式接收 Locale，便于测试和复用。

## 把消息当成有结构、可版本化的数据

Locale 确定以后，才轮到选择文案。这里最常见的误区是把翻译理解成字符串字典；实际上变量、复数分支、富文本边界和资源版本共同组成一份数据契约。

### 消息必须作为完整句子翻译

错误方式：

```ts
`${t('hello')} ${name}, ${t('youHave')} ${count} ${t('messages')}`
```

不同语言需要改变词序、格、性别或省略部分。ICU 官方指南强调用户可见消息应作为一个整体，使译者可以移动变量：

```text
welcome = Hello, {name}
```

不要让译者翻译孤立片段，也不要把英文语法写进代码。

### Catalog 是版本化数据契约

基础类型将普通消息与复数分支分开：

<<< ../../../examples/frontend/internationalization/catalog.ts

三份真实资源：

<<< ../../../examples/frontend/internationalization/messages/zh-CN.json

<<< ../../../examples/frontend/internationalization/messages/en-US.json

<<< ../../../examples/frontend/internationalization/messages/ar.json

Key 应表达稳定语义或功能位置，不能直接用整段英文当 Key。英文文案改变并不一定代表语义改变，稳定 Key 便于翻译记忆、弃用和使用统计。

### 复数不是 `count === 1`

CLDR 定义的 Cardinal 类别包括 zero、one、two、few、many、other。每种语言实际使用的类别不同，分数也可能与整数不同。

```ts
new Intl.PluralRules('ar').select(0) // zero
new Intl.PluralRules('ar').select(2) // two
```

类别名称不是可以直接翻译的语法标签，而是选择本地化消息分支的稳定标识。`other` 是必需兜底，但正式资源应覆盖该 Locale 当前需要的全部类别。

Ordinal（第 1、第 2）与 Cardinal（1 个、2 个）规则不同，必须用 `type: 'ordinal'` 单独处理。

### 消息运行时必须校验参数

<<< ../../../examples/frontend/internationalization/message-runtime.ts

示例展示最小运行时：Fallback、回退来源与缺失回调、占位符、`Intl.PluralRules` 和 `other` 兜底。空字符串也是合法消息，不能用真假判断误报成缺失；消息若来自英语回退 Catalog，复数规则也必须使用英语而不是请求页面的 Locale。示例不实现完整 ICU MessageFormat，也不支持 Select、嵌套消息、Rich Text、数字格式 Skeleton 和 Escaping Grammar；生产应用应使用成熟、与翻译平台兼容的 MessageFormat 实现。

对应的契约测试会分别确认“合法空消息”和“从阿拉伯语回退到英语”这两条容易混淆的路径：

<<< ../../../examples/frontend/internationalization/message-runtime.test.mts

不要通过 `innerHTML` 渲染译文。翻译内容仍是外部数据，可能包含错误或恶意 Markup。Rich Text 消息应使用受控占位符映射到允许的组件，不允许任意 HTML。

## 显式格式化数字、时间与文本

翻译解决“说什么”，`Intl` 解决“按当前文化规则怎样展示”。输入仍应是明确的领域数据；格式化负责展示，不能反过来成为数据模型或解析协议。

### Number 与 Currency 不是 `toFixed(2)`

同一数值在不同 Locale 中使用不同分组、小数分隔符和数字系统。Currency 还决定符号、位置和默认小数位：

<<< ../../../examples/frontend/internationalization/formatters.ts

金额领域模型应保存 Currency Code 与精确金额表示。示例为突出 `Intl.NumberFormat` 使用普通 `number`，涉及结算时应采用经过约定的最小货币单位、十进制定点类型或服务端金额模型，避免二进制浮点误差。不要从本地化字符串反解析金额，也不要假设所有 Currency 都有两位小数。

Percent Formatter 接收比例：`0.25` 格式化为 25%。Compact Notation、Unit、Sign Display 都应通过 `Intl.NumberFormat` Option 表达，不手工拼接 `K`、`万`、`%`。

### Date、Time、Instant 和 Calendar Date 要分清

#### Instant

一个全球唯一时间点，例如 API 返回带 `Z` 或 Offset 的 ISO 时间。显示时需要用户/业务 Time Zone。

#### Zoned Date-Time

Instant 加 IANA Time Zone，例如 `2026-07-15T10:00:00Z` 在 `Asia/Shanghai` 显示为 18:00。时区包含夏令时历史规则，不等于固定 `+08:00` Offset。

#### Calendar Date

生日、账单日、课程日期可能只有 `2026-07-15`，没有时间与时区。把它解析成午夜 `Date` 再转换时区，可能显示成前一天。

#### Wall-clock Time

“每天 09:00”也不是 Instant；必须结合日期、Time Zone 和夏令时规则才能成为具体时间点。

前端应先确定领域语义，再格式化。`Date` 主要表示 Instant，不足以自动表达所有 Civil Time 类型。

### Time Zone 必须显式传递

示例的 `formatInstant()` 同时要求 Locale 和 IANA Time Zone，避免依赖运行环境：

```ts
formatInstant('zh-CN', instant, 'Asia/Shanghai')
formatInstant('en-US', instant, 'America/New_York')
```

用户 Locale 不等于 Time Zone。英文用户可能住在上海，中文用户也可能在纽约。Time Zone 来源应是用户设置、业务对象或设备检测后的显式选择。

### 不要解析本地化展示字符串

`01/02/2026` 在不同地区可能是 1 月 2 日或 2 月 1 日。Intl 的主要能力是格式化，不是把任意用户文本无歧义解析成领域数据。

表单输入应使用：

- 结构化控件分别收集年月日；
- 明确格式提示和校验；
- 标准化 ISO/领域结构提交；
- 金额输入明确 Currency 和 Decimal Separator 策略。

展示格式与传输格式必须分离。

### List、Relative Time、Display Name 和 Collation

不要手工用逗号连接列表；`Intl.ListFormat` 会处理最后连接词。相对时间用 `Intl.RelativeTimeFormat`，国家/语言显示名用 `Intl.DisplayNames`。

排序和搜索也不是简单 `toLowerCase()`：

- `Intl.Collator(..., { usage: 'sort' })` 用于排序；
- `usage: 'search'` 的等价关系不代表可直接构建全文搜索；
- 大小写映射在土耳其语等 Locale 中有特殊规则；
- 数据库搜索、前端过滤和后端分页必须约定同一语义。

Formatter 创建可能有成本，示例按 Locale/Option 缓存。缓存 Key 必须包含所有影响输出的 Option。

### 文本分割不能按 UTF-16 Code Unit

`string.length` 和 `split('')` 可能拆开 Emoji、组合附加符或复杂书写系统。截断、字符计数和光标逻辑应按需求使用 Code Point、Grapheme Cluster 或 Word Boundary。

`Intl.Segmenter` 能按 Locale 分割 Grapheme、Word 和 Sentence。CSS 截断通常优于 JavaScript 手工截断；业务长度限制要说明限制的是 Byte、Code Point 还是用户感知字符。

## 让书写方向进入文档与布局语义

RTL 不是翻译完成后的 CSS 补丁。浏览器的双向文本算法、辅助技术发音、DOM 顺序和布局方向都需要明确语义，因此应先设置 `lang`、`dir`，再让 CSS 使用逻辑方向。

### 方向属于文档语义

阿拉伯语、希伯来语等使用 RTL Script。页面主方向应设置在根元素：

<<< ../../../examples/frontend/internationalization/document-locale.ts

`lang` 帮助屏幕阅读器发音、字体与拼写工具；`dir` 建立 Bidi Base Direction。不要只通过 CSS `text-align: right` 模拟 RTL。

对于方向未知的用户生成文本，`<bdi>` 或合适位置的 `dir="auto"` 可以隔离、推断其方向，避免订单号、用户名或标题改变周围标点顺序。

### RTL 布局使用 Logical Properties

<<< ../../../examples/frontend/internationalization/rtl.css

用 `margin-inline-start`、`padding-inline-end`、`border-block` 和 `text-align: start` 表达逻辑方向，减少成套覆盖。

不是所有视觉都镜像：

- 前进/后退箭头通常镜像；
- 播放、暂停、勾选、相机和品牌 Logo 通常不镜像；
- 数字、代码、URL 常保持 LTR，但要做 Bidi 隔离；
- Chart 时间轴是否镜像取决于产品语义。

RTL 必须由母语审阅，机械翻转无法判断真实阅读习惯。

## 把同一上下文带过资源、SSR 与 URL

客户端已经选对 Locale 还不够：资源分包、CDN 缓存、服务端首帧和可分享 URL 都必须使用同一结果。如果其中一层重新猜测，用户就会看到混合语言、缓存串用或 Hydration 不一致。

### 翻译资源要按边界加载

一次把所有 Locale 和 Namespace 放进首屏 Bundle 会浪费网络与解析成本。可以按当前 Locale、Route 或 Feature 动态加载：

<<< ../../../examples/frontend/internationalization/load-catalog.mts

需要同时解决：

- 切换 Locale 时旧请求取消或忽略；
- Loading 期间是否保留旧语言，避免整页闪烁；
- Catalog Chunk 失败的 Fallback；
- Prefetch 下一常用 Locale；
- Offline/Service Worker 的资源版本；
- Host 与 Remote 是否使用兼容 Catalog Revision。

### Catalog 与应用版本必须兼容

应用新增 Key 后，如果 CDN 仍返回旧 Catalog，会出现运行时缺失；翻译平台提前删除旧 Key，也会破坏尚未升级的客户端。

策略包括：

- Catalog 作为应用不可变构建产物；
- 或独立发布，但使用 Schema/Revision 和兼容窗口；
- 新旧 Key Expand and Contract；
- Cache Key 包含 Locale + Catalog Revision；
- HTML、JS 与 Catalog 回滚保持兼容。

不能只用 `/messages/zh.json` 永久缓存并原地覆盖内容。

### SSR 首帧必须共享 Locale 契约

服务端与客户端第一次 Render 至少共享：

- Locale；
- Time Zone；
- Catalog Revision 与消息内容；
- `lang`、`dir`；
- 影响 Number/Date 的格式化 Option。

<<< ../../../examples/frontend/internationalization/ssr-locale-contract.ts

序列化状态要防止 `</script>` 注入，示例转义 `<`。客户端 Hydration 前读取同一状态，不能立刻用 `navigator.language` 或本地 Time Zone 覆盖首帧；挂载完成后再按产品策略切换。

#### Cache Key

SSR HTML 若按 Locale 输出，CDN Cache Key 必须包含 Locale，或使用 Locale 路径。若输出又依赖租户、权限或 Currency，这些维度也要纳入，避免把一个用户版本缓存给另一个用户。

### Locale URL、SEO 与分享

内容站常用 `/zh-CN/courses`、`/en-US/courses`，使页面可链接、可缓存、可被搜索引擎区分。还应正确设置 Canonical、Alternate `hreflang`、Sitemap 和服务端状态码。

Locale Switch 应尽量保留当前内容身份，而不是总跳首页；但如果目标 Locale 没有该内容，要给出明确 Fallback 或不可用提示。

纯后台应用可以把 Locale 放在用户设置中，但刷新、深链和 SSR 仍要有确定恢复规则。

## 用测试和交付流程守住本地化质量

运行时兜底只能避免页面崩溃，不能证明体验正确。真正可靠的做法是把布局扩张、消息结构、复数类别、翻译上下文和资源兼容尽量提前到开发与 CI 阶段验证，再用母语和辅助技术评审补足自动化盲区。

### 伪本地化把问题提前到开发阶段

<<< ../../../examples/frontend/internationalization/pseudo-localize.ts

伪本地化通常：

- 替换字符，暴露硬编码未抽取文案；
- 扩长字符串，暴露固定宽高和截断；
- 保留 `{placeholder}`，验证运行时参数；
- 使用包围符号，发现字符串被意外切割；
- 另建伪 RTL Locale 验证方向布局。

伪本地化不是机器翻译，也不能替代母语审校，但能在翻译开始前发现大量结构问题。

### 资源校验必须理解消息结构

<<< ../../../examples/frontend/internationalization/check-catalogs.mts

检查器验证：

- Locale Key 集合一致；
- 普通消息与复数消息 Shape 一致；
- 普通消息占位符没有丢失或新增；
- 每种 Locale 覆盖 `Intl.PluralRules` 要求类别；
- 所有复数分支至少有 `other`；
- 翻译没有引入未知参数。

真实 ICU Catalog 还要用正式 Parser 验证语法、嵌套 Select/Plural、Rich Text Tag、重复 Key、弃用 Key 和最大长度。不能用正则解析完整 ICU Grammar。

### 国际化测试要固定上下文

<<< ../../../examples/frontend/internationalization/internationalization.test.mts

测试覆盖的不只是“英文字符串等于什么”，还包括：

- Locale Canonicalization 和 Fallback；
- 每个 Locale 的 Plural Category；
- DST 切换前后；
- Calendar Date 不跨日；
- Currency 与 Numbering System；
- 长文本、RTL、Bidi 混排；
- SSR/Client 输出一致；
- 缺失 Catalog 和旧 Revision；
- 伪本地化占位符保持。

日期断言应显式 Locale 和 Time Zone，不依赖 CI 机器。视觉测试固定字体和浏览器环境。

### 翻译持续交付

<<< ../../../examples/frontend/internationalization/translation-workflow.yml

典型流程：

```text
代码新增 Source Message
  → CI 提取并验证
  → TMS 同步上下文、截图和说明
  → 翻译、审校、术语检查
  → 回写 Catalog
  → Key/Placeholder/Plural 校验
  → 伪 Locale、真实 Locale UI 测试
  → 与应用或独立 Revision 发布
```

译者需要上下文：组件截图、变量含义、字符限制、语气、Plural 分支和不可翻译术语。只有 Key 与英文文本会产生大量猜测和返工。

### 删除消息前先证明没有消费者

动态 Key 如 `t('status.' + state)` 难以静态分析，也让翻译平台不知道真实集合。优先使用显式 Map：

```ts
const statusKeys = {
  draft: 'course.status.draft',
  published: 'course.status.published',
} as const;
```

删除采用 Expand and Contract：停止新使用、统计运行时命中、等待旧客户端兼容窗口，再删除 Catalog Key。

### 本地化不只包含文字

还要评估：

- 人名顺序与称谓；
- 地址字段与邮编；
- 电话号码显示和存储；
- 度量衡、纸张、周起始日；
- 图片、手势和颜色文化含义；
- 法律、税务和隐私文案；
- 输入法、字体覆盖和 Font Fallback；
- 语音与字幕。

不要用一个全球统一表单强迫所有用户填写“First Name/Last Name/State/ZIP”。领域模型与验证规则也需要本地化设计。

### 可访问性与国际化相互影响

- `<html lang>` 必须反映主要语言；局部语言变化用元素 `lang`；
- Screen Reader 发音依赖 Language Metadata；
- Error Message 翻译后仍要通过 `aria-describedby` 关联；
- 字体放大和长译文不能遮挡控件；
- RTL 下 Focus 顺序应遵循逻辑 DOM，而非视觉 Hack；
- Icon-only Button 的 Accessible Name 也必须本地化；
- Live Region 文案切换不能制造重复播报。

本地化 QA 应包含键盘和辅助技术，不只是母语截图审阅。

### 可观测性要记录语义，不记录隐私

可以记录低基数维度：Supported Locale、Catalog Revision、Missing Key、Fallback Source、格式化异常和资源加载失败。

不要记录完整译文、用户输入、姓名、搜索词或地址。Missing Parameter 记录参数名而不是值。告警应区分：

- CI 可阻止的资源契约错误；
- 某 Locale Catalog 加载失败；
- 某 Release 新增 Missing Key；
- 仅个别用户环境缺少 Intl 数据或字体。

### 常见反模式

#### 字符串片段拼接

锁死源语言词序，译者无法重排句子。

#### `count === 1`

只适用于少数语言的一部分情况，忽略多复数类别和分数。

#### Locale 等于 Country

错误推断语言、Currency 和 Time Zone。它们是相关但独立的上下文。

#### 用用户 Locale 推断 Time Zone

跨国用户和旅行场景立即出错。

#### 解析本地化字符串作为数据

日期和金额有歧义，应提交标准结构。

#### RTL 只设 `text-align: right`

没有设置 Bidi Base Direction，布局、标点和辅助技术语义仍错误。

#### 所有图标统一镜像

播放、品牌和非方向图标被错误翻转。

#### 翻译 HTML

扩大 XSS 和 Markup 损坏风险。使用受控 Rich Text Placeholder。

#### 所有 Locale 打入首屏

浪费 Bundle，仍没有解决 Catalog 版本和失败回退。

#### 运行时缺失永远静默 Fallback

用户看到混合语言，团队却不知道资源已经破坏。

### 完整示例如何组合

```text
examples/frontend/internationalization/
├── catalog.ts
├── check-catalogs.mts
├── document-locale.ts
├── formatters.ts
├── internationalization.test.mts
├── load-catalog.mts
├── locales.ts
├── message-runtime.ts
├── message-runtime.test.mts
├── messages/
│   ├── ar.json
│   ├── en-US.json
│   └── zh-CN.json
├── pseudo-localize.ts
├── rtl.css
├── ssr-locale-contract.ts
└── translation-workflow.yml
```

### 生产评审清单

#### Locale 与消息

- 支持 Locale、默认值和 Fallback 图明确；
- 协商优先级与持久化策略明确；
- SSR 不使用进程全局 Locale；
- 用户消息按完整句子翻译；
- Plural/Select 使用成熟 MessageFormat；
- Missing Key 与 Fallback 可观测。

#### 格式与时间

- Number、Currency、List、Date 使用 Intl；
- Formatter Cache Key 包含完整 Option；
- Instant、Time Zone、Calendar Date 分离；
- Locale 不用于推断 Time Zone/Currency；
- 展示字符串不反解析成领域数据；
- DST、分数和非拉丁数字经过测试。

#### RTL 与 UI

- 根元素正确设置 `lang` 与 `dir`；
- CSS 使用 Logical Properties；
- 混合方向用户文本使用 Bidi Isolation；
- 图标按语义决定是否镜像；
- 长文本、伪 Locale、RTL 和字体回退已验证；
- Accessibility 人工测试覆盖主要 Locale。

#### 资源与交付

- Catalog Key、Placeholder、Plural 在 CI 校验；
- Locale Chunk 有失败与缓存策略；
- Catalog Revision 与应用兼容；
- SSR 与 Client 共享 Locale/TimeZone/Revision；
- TMS 有截图、变量说明和术语；
- Key 弃用有兼容窗口和使用证据。

## 回到主线：让文化差异成为显式上下文

国际化工程的主线是：

```text
显式 Locale/TimeZone/Currency 上下文
  → 完整消息与 CLDR 复数规则
  → Intl 格式化数字、日期、列表和排序
  → lang/dir、Logical CSS 与 Bidi Isolation
  → Catalog 分包、Revision 和 SSR 一致性
  → 伪本地化、资源契约和真实 Locale 测试
  → TMS、CI、观测与兼容迁移形成交付闭环
```

真正可扩展的国际化不是在组件里到处调用 `t()`，而是把语言文化相关决策从隐式环境变成可传递、可缓存、可测试、可版本化的系统上下文。

下一节：[前端数据可视化渲染、交互与可访问性](./frontend-data-visualization-rendering-interaction-and-accessibility.md)，讨论 Canvas/SVG/WebGL 取舍、坐标与 Scale、交互状态、可访问替代、流式数据、性能和图表组件治理。

## 参考资料

- [MDN：Intl](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl)
- [MDN：Intl.Locale](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale)
- [MDN：Intl.DateTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)
- [MDN：Intl.NumberFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat)
- [MDN：Intl.PluralRules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules)
- [MDN：Intl.Segmenter](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter)
- [Unicode TR35：Locale Inheritance and Matching](https://unicode.org/reports/tr35/#Locale_Inheritance)
- [Unicode CLDR：Plural Rules](https://cldr.unicode.org/index/cldr-spec/plural-rules)
- [ICU：Formatting Messages](https://unicode-org.github.io/icu/userguide/format_parse/messages/)
- [W3C Internationalization：Structural Markup and RTL Text](https://www.w3.org/International/questions/qa-html-dir.en)
