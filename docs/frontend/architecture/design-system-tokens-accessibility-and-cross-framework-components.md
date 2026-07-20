---
title: 前端设计系统与跨框架组件平台
description: 从 Design Token、组件行为契约和可访问性出发，建立支持主题、版本演进、视觉回归以及 Vue、React、Web Components 的组件平台
outline: deep
---

# 前端设计系统与跨框架组件平台

组件库通常从“把常用按钮封装起来”开始。项目较小时，这能减少复制；团队和产品增加以后，真正的问题却不再是有没有 `Button.vue`：

- Figma、Vue 2、Vue 3、React 和静态页面中的颜色与间距逐渐漂移；
- 两个看起来相同的 Tabs 有不同键盘操作和 ARIA；
- 暗色主题靠每个页面各写一套覆盖规则；
- 组件改了一点 DOM 或 CSS，数十个应用无法判断是否会破坏；
- “跨框架共享”变成把 React 或 Vue Runtime 塞进每个组件；
- 版本虽然遵守 SemVer，视觉和行为却在 Minor Release 中悄悄变化；
- 文档只展示理想状态，没有 Loading、Error、长文本、RTL 和键盘路径。

设计系统不是组件文件集合，而是一套让产品界面持续保持一致、可访问和可演进的决策系统。理解这件事时，可以先抓住一条主线：**先给设计决策命名，再给交互行为立约，最后用实现、测试和治理守住这些约定。**

它至少包含：

```text
设计原则与内容规范
  → Design Token
  → 无框架行为与可访问性契约
  → 组件实现和框架 Adapter
  → 文档、测试、发布和迁移工具
  → Owner、贡献流程和采用反馈
```

## 先看清目标：设计系统解决的是“决策漂移”

团队最初缺的也许只是几个可复用组件，规模扩大后真正昂贵的却是“同一个决定被重新做了很多次”。先区分三个容易混用的概念，才能知道课程后面的 Token、状态机和治理分别在解决什么。

### UI Kit

UI Kit 常指设计工具中的图形资产、样式和组件实例。它帮助设计师组合界面，但不自动约束代码、可访问性和版本兼容。

### 组件库

组件库提供可安装的代码包，包括组件、样式和类型。它解决复用，却不一定回答设计决策由谁维护、何时升级、如何迁移。

### 设计系统

设计系统同时治理设计语言和工程契约：原则、Token、组件语义、可访问性、内容、文档、测试、发布与贡献流程。组件库只是它的代码载体之一。

一个设计系统是否成功，不应只看组件数，而要看：

- 产品团队是否更快完成一致且可访问的界面；
- 重复实现和视觉漂移是否减少；
- 升级成本与未知破坏是否下降；
- 例外是否能被发现、解释和逐步收敛。

## 从产品决策建立 Token 语言

设计系统的第一步不是写组件，而是让设计和代码能用同一个名字讨论决定。如果“主要操作背景色”在每个技术栈里都只表现为一个色值，那么大家共享的是结果，不是含义；Token 正是把含义保留下来的中间语言。

### Design Token 保存“决策”，不是 CSS 缩写

Token 用稳定名称表示一个设计决定，例如“默认正文颜色”“危险操作背景色”“组件圆角”。消费者依赖语义，不直接依赖某个 Hex 或 8px。

```text
不稳定：color: #2550c2
较稳定：color: var(--ds-color-action-primary-background)
```

当品牌或主题改变时，语义仍是“主要操作背景”，实现值可以替换。

Design Tokens Community Group 在 2025.10 发布了首个稳定格式，包括 Token、Group、Type、Alias 等可互操作语义。需要准确理解它的地位：这是 W3C Community Group Final Report，不是 W3C Recommendation；它适合成为工具交换格式，但团队仍需定义自己的命名、转换和兼容政策。

### 三层 Token 模型表达不同稳定性

#### Core/Primitive Token：有哪些原材料

Core Token 描述可用原材料，例如颜色梯度、间距尺度和圆角。它回答“有哪些值”，不直接表达产品用途。

#### Semantic Token：这些材料用在哪里

Semantic Token 描述用途，例如：

```text
color.text.default
color.surface.canvas
color.action.primary.background
```

主题通常覆盖这一层。业务和大多数组件应优先消费 Semantic Token，这样暗色、品牌和高对比模式不会要求重写组件。

#### Component Token：某个组件为何需要例外

Component Token 只在组件确实需要独立演进或存在稳定特殊决策时引入，例如 `button.paddingInline`。如果给每个 CSS 声明都创建 Component Token，系统会退化成难以追踪的 CSS 间接层。

完整的 DTCG 风格示例：

<<< ../../../examples/frontend/design-system-platform/tokens.json

颜色值使用明确的 Color Space、Components 和可选 Hex Fallback；Dimension 同时保存数值与单位。Alias 使用 `{core.color.blue600}` 引用，避免同一值手工复制。

### Token 命名应该描述意图

对消费者暴露 `blue600` 会把品牌实现泄漏成业务契约：以后主色变为紫色，名称仍然叫 Blue。Core 层可以使用描述性名称，但 Semantic 层应表达角色、强调级别和状态。

一种可推理结构是：

```text
类别.角色.强调.状态
color.action.primary.background.hover
color.text.danger.default
space.layout.section
```

命名不必追求最长，而要满足：

- 不依赖当前页面或临时实现；
- 设计与代码使用同一语义；
- 新主题能替换值而不改消费者；
- 状态轴一致，不混用 `active`、`pressed`、`selected`；
- Token 数量足够表达产品，不无限复制近义词。

### 不是所有值都应该成为 Token

一个只在单个组件内部使用、没有跨产品意义、不会被主题覆盖的布局细节，可以留在组件 CSS 中。

判断是否需要 Token，可以问：

1. 它是否代表被设计和产品共同认可的决定？
2. 是否在多个平台或组件中共享？
3. 是否需要随主题、品牌、密度或可访问模式改变？
4. 修改它是否需要集中评审并通知消费者？

如果答案都是否，创建 Token 只会增加命名和迁移成本。

### 从 JSON 到产物必须可验证

```text
DTCG JSON
  → Format、Type 与 Alias 校验
  → 循环引用和类型检查
  → 按平台转换
  → CSS Custom Properties / TypeScript / iOS / Android
  → 对生成文件做 Drift Check
```

下面的脚本解析 Alias、阻止循环和类型不匹配，并验证已提交 CSS 与源 Token 保持一致：

<<< ../../../examples/frontend/design-system-platform/build-tokens.mts

示例只实现本课使用的 Color 与 Dimension，不冒充完整 DTCG Resolver。2025.10 Format Module 也明确说明官方 JSON Schema 仍在探索中，因此不能随意填写一个看似官方的 `$schema` URL。真实项目应使用或构建符合当前规范的结构、类型与引用校验工具，并锁定格式版本、转换器版本和输出快照。

生成的 TypeScript 名称为 CSS Variable 提供自动补全，但不复制运行时值：

<<< ../../../examples/frontend/design-system-platform/tokens.generated.ts

Source of Truth 必须唯一。如果设计工具、JSON 和 CSS 都允许独立编辑，漂移只是时间问题。

### CSS Custom Property 是 Web 主题契约

CSS Custom Property 参与 Cascade 和 Inheritance，适合把语义 Token 从页面传入普通组件和 Shadow DOM。生成结果如下：

<<< ../../../examples/frontend/design-system-platform/tokens.css

#### 为什么主题覆盖 Semantic，而不是 Core

暗色主题并不需要改变“蓝色 600 是什么”，而是改变“默认文字”和“画布背景”引用哪种颜色。覆盖 Semantic 层能保留原材料定义并减少重复。

#### `color-scheme` 的作用

它告诉浏览器页面支持的配色，让原生表单、滚动条等 User Agent UI 与主题协调。它不能替代自定义 Token，也不会自动保证对比度。

#### `@property` 的价值和边界

`@property` 可以声明自定义属性语法、初始值和是否继承，使浏览器更早拒绝无效值，并支持类型化插值。并非每个 Token 都必须注册；大量注册会增加产物和治理成本。

## 让主题成为首屏基础能力

有了 Semantic Token，还没有自动得到可靠主题。主题选择必须在首屏绘制前确定，并且需要同时处理服务端输出、浏览器偏好、用户选择和异常环境；否则正确的 Token 仍会以错误顺序应用。

### 主题初始化要避免闪烁和 Hydration 不一致

如果应用加载后才从 `localStorage` 读取暗色主题，用户会先看到亮色再切换。可以在 `<head>` 主样式之前运行极小的同步脚本：

<<< ../../../examples/frontend/design-system-platform/theme-bootstrap.html

示例会过滤无效存储值，并在 `localStorage` 因隐私或安全策略抛错时退回系统偏好。真实 SSR 应尽量由服务器通过 Cookie 写出一致的 `data-theme`。若服务器不知道客户端偏好，可以让初始 CSS 使用 `prefers-color-scheme`，Hydration 后再同步用户显式选择。

主题优先级应明确：

```text
用户显式选择 > 组织/租户策略 > 操作系统偏好 > 产品默认值
```

还要处理 `storage` 或 BroadcastChannel 跨 Tab 同步、系统主题变化和无存储环境。内联首屏脚本必须配合 CSP Nonce 或 Hash；不要为了主题脚本放宽整个站点的 `script-src`。

### 主题不只有 Light 与 Dark

设计系统还可能需要：

- High Contrast 或 Forced Colors；
- Reduced Motion；
- Compact/Comfortable Density；
- Brand/Tenant Theme；
- Print；
- RTL 与不同文字系统。

不要把这些全部编码进一个巨型字符串 `theme="dark-compact-brand-a"`。各维度有不同所有权和组合规则，应使用独立 Attribute、Media Query 或上下文，同时控制受支持组合数量。

在 Forced Colors 下，硬编码阴影和背景可能消失；应使用系统颜色、边框和可感知状态，不以颜色作为唯一信息。Reduced Motion 也不是删除一切动画，而是避免非必要、可能引发不适的运动，同时保留必要状态反馈。

## 先定义行为契约，再选择组件技术

Token 解决“长什么样”，却不回答 Tabs 按下方向键后发生什么。复杂组件最容易在这一层漂移，所以不要先问它用 Vue、React 还是 Web Component 实现，而要先把输入、输出、语义、焦点和时间行为写成可测试契约。

### 组件 API 是长期兼容面

一个组件的公共契约远不止 Props：

```text
输入：Property、Attribute、Slot、Context、CSS Token
输出：Event、回调、表单值、焦点移动、DOM 状态
语义：Role、Name、State、键盘模型
样式：Parts、Class、尺寸与布局承诺
时间：同步/异步、受控/非受控、生命周期
```

因此，改变 DOM 顺序、Event 触发时机、焦点恢复或默认 Accessible Name，都可能是破坏性变化，即使 TypeScript 类型没有变化。

示例把 Tabs 的正式契约单独记录：

<<< ../../../examples/frontend/design-system-platform/component-contract.md

### 优先组合原生 HTML

原生 `<button>` 已提供键盘激活、Disabled、Focus 和表单语义。用 `<div role="button">` 需要自行补齐 Tab、Enter、Space、Disabled 和平台行为，仍容易遗漏。

设计系统的 Leaf Component 应尽量保留原生能力：

- Button 渲染 `<button>`；
- Link 渲染 `<a href>`；
- Text Field 建立 `<label>`、`<input>`、Description 和 Error 关联；
- 表单提交、自动填充和 Constraint Validation 不被无理由禁用。

ARIA 用于补充缺失语义，不会自动实现行为。`role="tab"` 不会替你处理 Arrow Key、Roving tabindex 或 Panel 显示。

### WCAG、ARIA 与 APG 的职责不同

- WCAG 是内容可访问性的可测试成功准则；
- WAI-ARIA 定义 Role、State 和 Property 的语义；
- ARIA Authoring Practices Guide 提供常见 Widget 的信息性 Pattern、键盘惯例和示例。

APG 不是 W3C Normative Standard，也不是完整设计系统。使用 Pattern 时仍要结合产品内容、浏览器和辅助技术测试。

WCAG 2.2 新增了 Focus Not Obscured、Dragging Movements、Target Size (Minimum) 等要求；其中 Target Size (Minimum) 是 AA，Focus Appearance 是更严格的 AAA 准则，不能把它们笼统当成同一合规等级。设计系统可以集中解决大量基础问题，但“用了设计系统”不等于整个页面自动合规：页面结构、文案、焦点顺序和业务流程仍属于应用责任。

### 复杂交互先建立无框架状态机

Tabs 同时包含 Selected、Focused、Disabled 和 Activation Mode。把这些规则直接写进 Vue Watcher 或 React Effect，会让两个框架实现逐渐分叉。

下面的纯状态模型不依赖 DOM 或框架：

<<< ../../../examples/frontend/design-system-platform/tabs-state.ts

自动激活模式中，Arrow Key 移动焦点时同时切换 Panel；手动模式只移动焦点，Enter/Space 才激活。APG 建议只有 Panel 能无明显延迟显示时才自动激活，否则键盘用户每次移动焦点都要等待网络或渲染。

纯状态机的价值是：

- 同一行为可供原生、Vue 和 React Adapter 使用；
- 边界条件无需启动浏览器即可测试；
- DOM 层只负责事件翻译、语义和渲染；
- 行为变化会成为明确的契约变更。

### 行为契约测试比组件快照更稳定

<<< ../../../examples/frontend/design-system-platform/tabs-state.test.mts

测试验证了：

- 手动模式移动焦点不立即改变 Selected；
- Enter/Space 对应的激活可以单独执行；
- Disabled Tab 被跳过；
- 最后一个 Tab 向右循环到第一个；
- 自动模式让 Focus 与 Selection 同步。

Markup Snapshot 无法证明这些行为，也无法证明屏幕阅读器获得正确关系。

## 跨框架共享的核心是只翻译边界

状态模型稳定以后，才适合讨论“共享到哪一层”。共享越深入，统一程度越高，但框架集成、SSR 和发布成本也越大；目标不是追求一份代码，而是让每个平台遵守同一份行为契约。

### 四种共享层级

| 层级 | 共享内容 | 适用场景 | 主要代价 |
| --- | --- | --- | --- |
| Token/CSS | 视觉决策 | 所有项目 | 行为仍可能漂移 |
| Headless Core | 状态机、算法、契约 | Vue/React 各自渲染 | Adapter 仍需等价测试 |
| Web Component | DOM、行为和样式 | 多框架稳定叶子组件 | SSR、表单、类型与框架边界 |
| 框架组件包 | 完整原生体验 | 单一主框架 | 多框架需多份实现 |

选择最弱但足够的共享方式。不要因为同时存在 Vue 和 React，就把每个 Layout、Data Grid 和业务 Form 都改成 Custom Element。

### Custom Element 的跨框架契约

示例把 Headless Tabs 状态机装入一个原生 Custom Element：

<<< ../../../examples/frontend/design-system-platform/ds-tabs.ts

它实现了：

- 幂等注册，避免重复 `customElements.define()` 抛错；
- 简单值使用 Attribute，复杂 `items` 使用 DOM Property；
- 原生 Button、ARIA 双向 ID、Roving tabindex；
- 自动和手动激活模式；
- `bubbles + composed` 的 `CustomEvent` 穿过 Shadow Boundary；
- Token 通过继承进入 Shadow DOM；
- `part` 只暴露经过承诺的样式节点；
- 所有外部文本使用 `textContent`，不注入 HTML。

#### Attribute 与 Property 不能混为一谈

Attribute 本质是字符串，适合 `selected-id="overview"`、布尔存在性和可序列化初始状态。对象、数组和函数应使用 Property：

```ts
element.items = tabs;
```

把 JSON 放进 Attribute 会引入转义、体积、身份、更新和安全问题。

#### Event 是输出，不要暴露内部 Store

`ds-change` 传递稳定业务 Detail。宿主不应该获得 Vue Ref、React Setter 或内部状态机实例。Event 名、传播方式、Cancelable 与 Detail Schema 都属于版本契约。

#### Shadow DOM 不是绝对隔离

普通选择器不会穿透 Shadow Root，但以下能力会跨边界：

- 可继承 CSS Property 与 CSS Custom Property；
- Slot 内容仍属于 Light DOM；
- Composed Event；
- `::part()` 显式暴露的节点；
- 可访问性树中的组合语义。

因此 Shadow DOM 是封装工具，不是权限或安全沙箱。

### CSS Parts 应像 Public API 一样克制

Shadow Parts 允许消费者通过 `ds-tabs::part(tab)` 定制内部节点。它比开放所有内部 Class 更稳定，但每个 Part 名仍会成为兼容承诺。

不要为 Shadow Tree 每个 `<div>` 暴露 Part。优先顺序通常是：

1. Semantic Token 控制主题；
2. 组件 Variant 控制支持的产品语义；
3. 少量 Part 处理合理的宿主布局集成；
4. Fork 只用于设计系统明确不支持的产品需求。

允许任意 CSS 覆盖会破坏 Focus、Disabled、对比度和布局不变量。

### React 与 Vue Adapter 只翻译边界

React Adapter 将 Array 写入 Property，并把 DOM CustomEvent 转成惯用回调：

<<< ../../../examples/frontend/design-system-platform/DsTabsReactAdapter.tsx

React 19 已完善带连字符 Custom Element 的 Property 与 CustomEvent 使用方式；若支持 React 18 或希望统一框架惯用 API，Adapter 仍可提供稳定类型、命名、SSR 策略和错误处理。不要在 Adapter 里复制状态机。

Vue Adapter 将 Props 写入元素 Property，并在卸载时移除监听器：

<<< ../../../examples/frontend/design-system-platform/DsTabsVueAdapter.vue

Vue 构建工具需要通过 `compilerOptions.isCustomElement` 识别相应 Tag，否则编译器会尝试把它解析成 Vue Component。若用 Vue `defineCustomElement` 创建元素，还要评估每个组件是否捆绑 Vue Runtime、Style 如何注入 Shadow Root，以及宿主能否共享同一 Vue 版本。

### 跨框架 TypeScript 类型必须按需加载

React JSX Tag 类型：

<<< ../../../examples/frontend/design-system-platform/react-custom-elements.d.ts

Vue Global Component 类型：

<<< ../../../examples/frontend/design-system-platform/vue-custom-elements.d.ts

示例将框架类型拆分。库不应在基础 `elements` 入口自动执行所有 React/Vue Module Augmentation，否则未使用对应框架的消费者也可能被迫解析 Peer Type 或产生全局冲突。

类型只能描述合法形状，不能验证运行时 Attribute、Event Detail 或浏览器支持。跨部署或不可信输入仍需运行时校验。

### SSR 与 Custom Element Upgrade

浏览器解析 `<ds-tabs>` 时，如果定义尚未加载，它先是未知 HTMLElement；注册后发生 Upgrade。设计时要考虑：

- 未 Upgrade 内容是否可读，还是空白；
- Declarative Shadow DOM 或服务端 Light DOM Fallback；
- Property 在 Upgrade 前已被宿主赋值时如何恢复；
- SSR Markup 与客户端首次 Render 是否一致；
- 定义脚本失败时的降级；
- Custom Element Bundle 是否进入关键渲染路径。

示例适合解释客户端契约，不宣称已经完成 SSR。生产库若支持 SSR，必须把 Upgrade 前后、Hydration 和无 JavaScript 情况写入支持矩阵并测试。

### Form-associated Custom Element 要谨慎

复杂自定义 Form Control 可以使用 `ElementInternals` 与 Form 关联、设置提交值和 Validity，但这增加了浏览器兼容、Label、Autofill、Reset、Disabled、Validation Message 和辅助技术测试范围。

如果原生 `<input>`、`<select>`、`<button>` 能满足需求，优先包装或组合原生控件。为了外观重造 Text Input 往往得不偿失。

### Package 边界要让消费者只加载所需平台

<<< ../../../examples/frontend/design-system-platform/package-exports.json

这里分别暴露 Tokens、Elements、React 和 Vue：

- React/Vue 是可选 Peer Dependency；
- 不使用框架 Adapter 的消费者不必安装两个 Runtime；
- `exports` 阻止消费者深层依赖内部文件；
- 注册元素和全局 CSS 标记为 Side Effect，避免被错误 Tree-shake；
- 每个入口有独立 Type Declaration。

还应测量每个入口的压缩体积和依赖图。一个 2KB Button 不应因为统一入口带入整个 Icon Set、Date Library 和两个框架 Runtime。

### SemVer 不只管理 TypeScript

#### Patch

通常用于不改变支持契约的缺陷修复。但一个“修复”如果明显改变布局、焦点或 Event 时机，仍可能需要更高版本或迁移说明。

#### Minor

新增可选 Variant、Token、Event 或 Component，同时保持旧用法兼容。默认值变化要谨慎，因为它会改变所有未显式配置的消费者。

#### Major

删除或重命名 Prop/Token/Part、改变键盘模型、DOM 结构承诺、默认行为或最低框架/浏览器版本。

CSS 是 API。删除 Custom Property、改变 Specificity、Layer 顺序、Box Model 和尺寸都可能破坏消费者，即使 JavaScript 类型完全相同。

### Token 迁移要有过渡期

安全重命名通常采用 Expand and Contract：

```css
/* 先新增新名，让旧名指向新名，并发出弃用说明。 */
--ds-color-text-primary: var(--ds-color-text-default);
```

接着：

1. 发布新 Token 与 Codemod；
2. 在文档和 Lint 中标记旧 Token Deprecated；
3. 统计仓库内外采用情况；
4. 至少保留承诺的兼容窗口；
5. Major Release 才删除旧名。

如果公开 CSS 中到处复制了旧值，仅搜索 Token 名无法完成迁移，所以设计系统需要限制消费者绕过 Semantic Token。

## 用文档、测试与治理保护长期演进

组件能够跨框架运行，只证明“今天能用”；设计系统还要保证它明天升级后仍可理解、可验证、可迁移。下面的文档、测试、版本和贡献流程不是外围工作，而是公共契约得以长期成立的条件。

### 文档必须覆盖状态空间

一个组件页面至少应包含：

- 何时使用和何时不用；
- Accessible Name 和键盘操作；
- Default、Hover、Focus、Active、Disabled；
- Loading、Empty、Error 和异步行为；
- 长文本、国际化、RTL 与窄 Viewport；
- Light、Dark、High Contrast、Reduced Motion；
- Controlled/Uncontrolled 或 Property/Event 数据流；
- API、Token、Part 和版本说明；
- 常见误用和迁移指南。

Story 应是稳定、最小、可复现的组件状态。不要依赖随机时间、真实生产 API 和不固定数据，否则文档和测试都会 Flaky。

### 测试策略按契约分层

```text
Token Format/Drift Test
  → Headless 状态机单元测试
  → DOM 行为与可访问名称测试
  → 真实浏览器键盘和辅助技术测试
  → 视觉回归
  → Vue/React Consumer Contract Test
  → 少量真实应用集成测试
```

自动 Accessibility Scanner 可以发现部分 Name、Role、对比度和 ARIA 问题，不能判断文案是否清楚、焦点是否符合业务流程、屏幕阅读器体验是否合理。自动测试必须配合键盘和真实辅助技术人工验证。

评审模板：

<<< ../../../examples/frontend/design-system-platform/accessibility-review.md

### 视觉回归验证像素，不验证意图

<<< ../../../examples/frontend/design-system-platform/visual-regression.spec.mts

视觉测试能捕获颜色、尺寸、间距、字体和布局变化。可靠基线需要固定：

- 浏览器和操作系统镜像；
- 字体文件与加载完成条件；
- Viewport、Device Scale Factor 和 Locale；
- 动画、Caret、时间和随机数据；
- Light/Dark、关键 State 和响应式断点。

Playwright 官方文档也提醒渲染会受 OS、硬件、浏览器和设置影响。Diff 阈值不应调大到掩盖真实变化；基线更新必须经过有设计上下文的人工审查，不能在 CI 失败后机械接受。

### Focus 是组件平台的一等状态

Focus 不只是一个蓝色 Outline。组件契约要说明：

- 页面 Tab 顺序中谁可聚焦；
- Composite Widget 内如何用 Arrow Key 移动；
- 打开 Dialog 后初始焦点在哪里；
- 关闭后焦点返回哪个仍存在的 Trigger；
- 删除当前 Item 后焦点落在哪里；
- Disabled Item 是完全跳过还是可发现不可操作；
- 异步加载是否导致 Focus 丢失。

Focus Indicator 必须在不同背景和主题中可见。不要全局 `outline: none`；如果产品要求满足 WCAG 2.2 AAA 的 Focus Appearance，还需要验证指示器面积和焦点前后的变化对比度。无论目标等级如何，自定义 Focus Style 都要检查它与相邻背景的非文本对比度，而不能只凭设计稿截图判断。

### 设计系统治理需要产品反馈回路

核心团队不能只接收需求单，也不能独自猜测所有产品需求。一个健康贡献流程包括：

1. 问题描述、用户场景和现有绕过方式；
2. 判断是 Core 能力、组合示例还是业务专用组件；
3. 设计、内容、Accessibility 和工程共同评审；
4. API Proposal 与行为契约；
5. 实现、测试、文档和迁移计划；
6. 试点消费者验证；
7. 发布后采用、缺陷和可用性反馈。

采用指标不应强迫团队使用不合适组件。更有意义的是：重复实现减少量、升级耗时、Accessibility 缺陷、视觉漂移、支持请求响应时间和组件覆盖的真实产品场景。

### 何时不应进入设计系统

以下内容通常先留在业务 Feature：

- 只服务一个领域、包含大量业务规则的复合页面；
- API 和交互仍在快速试验的组件；
- 无法定义跨产品语义的临时活动 UI；
- 仅因为两个页面外观相似、但变化原因不同的组合。

可以先共享 Token、Primitive 和 Headless Utility。等多个产品出现相同需求和变化方向后，再提升为正式组件。过早抽象会让设计系统成为所有团队的协调瓶颈。

### 常见反模式

#### Token 等于全量 CSS 变量

每个 Margin 和像素都有 Token，却没有稳定设计语义，消费者只能在数百个近义名称中猜测。

#### 业务直接依赖 Core Color

页面到处使用 Blue 600，主题和品牌更换时必须全局搜索。

#### Vue 与 React 分别重写复杂行为

初始外观一致，键盘、Focus 和异步状态逐渐漂移。应共享状态机或跑同一行为契约。

#### 用 Web Component 包装整个应用页面

框架边界看似统一，却带来 SSR、Router、数据、表单和运行时重复。Web Component 更适合稳定、内聚的叶子或 Widget。

#### 暴露所有 Shadow Part

消费者依赖内部结构，组件无法重构，Accessibility 修复也可能破坏外部 CSS。

#### 自动 Accessibility 扫描等于合规

工具只能发现可算法判断的子集，无法替代键盘、屏幕阅读器和真实任务验证。

#### 快照通过等于行为正确

静态 Markup 无法证明 Arrow Key、Focus Restore、Event Timing 和 Form Submission。

#### 每次视觉 Diff 都更新基线

这会把回归正式记录为新标准。更新必须解释设计意图和消费者影响。

#### 永不删除 Deprecated API

兼容层不断累积，文档和实现出现多条等价路径。应给出窗口、Codemod 和明确 Major 终点。

#### 设计系统团队成为审批中心

所有产品改动都要等待中央团队，最终业务绕过系统。治理应提供清晰扩展点、贡献机制和响应承诺。

### 完整示例如何组合

```text
examples/frontend/design-system-platform/
├── DsTabsReactAdapter.tsx
├── DsTabsVueAdapter.vue
├── accessibility-review.md
├── build-tokens.mts
├── component-contract.md
├── ds-tabs.ts
├── package-exports.json
├── react-custom-elements.d.ts
├── tabs-state.test.mts
├── tabs-state.ts
├── theme-bootstrap.html
├── tokens.css
├── tokens.generated.ts
├── tokens.json
├── visual-regression.spec.mts
└── vue-custom-elements.d.ts
```

迁入真实项目时，应补充完整 Token Resolver、真实 Demo 页面、Playwright 与 Accessibility 依赖、浏览器支持矩阵、SSR 策略、Package Build、API Extractor、Bundle Budget、Release Automation 和框架 Consumer Test。示例重点是展示边界与可验证契约，不假装一个 Tabs 就构成完整设计系统。

### 设计系统评审清单

#### Token 与主题

- Core、Semantic、Component 三层职责清楚；
- 产品优先消费 Semantic Token；
- Alias、循环、类型和生成 Drift 在 CI 校验；
- Source of Truth 唯一；
- Light/Dark 之外考虑 Forced Colors、Reduced Motion 和 RTL；
- 主题初始化不会闪烁或造成 Hydration 不一致。

#### 组件契约

- 优先使用原生 HTML；
- Props、Events、Slots、Focus、DOM 和 CSS 都纳入兼容评审；
- 复杂行为有无框架状态模型或等价契约测试；
- Attribute 只承载简单字符串语义，复杂值使用 Property；
- CustomEvent 的传播与 Detail Schema 明确；
- Shadow Part 数量克制。

#### 可访问性

- Name、Role、State 和 Relationship 正确；
- 键盘模型符合使用场景；
- Focus 进入、移动、删除和恢复规则明确；
- Zoom、Reflow、Contrast、Forced Colors、Reduced Motion 已验证；
- 自动扫描配合键盘和辅助技术人工测试；
- 页面团队与设计系统的责任边界清楚。

#### 发布与采用

- Tokens、Elements、React、Vue 入口可独立消费；
- Peer Dependency 和 Side Effect 声明准确；
- Bundle Size 与最低平台版本受控；
- CSS、视觉和行为变化进入 SemVer 评审；
- Deprecated API 有迁移工具和删除期限；
- 文档覆盖真实状态，视觉基线由人工评审；
- 贡献流程、Owner 和反馈指标存在。

## 回到主线：共享决定，而不是强求共享所有代码

设计系统的稳定主线是：

```text
设计意图
  → Semantic Token 形成跨平台名称
  → Headless State Machine 固化复杂行为
  → 原生语义和可访问性构成组件契约
  → Web Component 或框架 Adapter 连接运行环境
  → Contract、Browser、Visual Test 保护兼容性
  → Package、SemVer、迁移与贡献流程支撑长期演进
```

跨框架共享不是“所有代码只写一遍”。视觉决策适合由 Token 共享，复杂交互规则适合由无框架状态机共享，稳定叶子组件可由 Web Component 共享，而框架特有组合仍应保持原生体验。真正重要的是所有实现遵守同一语义、Accessibility 和版本契约。

下一节：[前端国际化与本地化工程](./frontend-internationalization-localization-and-rtl-engineering.md)，系统讨论 Locale、消息格式、复数与性别、日期数字、时区、RTL、翻译资产、伪本地化、SSR 一致性和持续交付。

## 参考资料

- [Design Tokens Community Group：2025.10](https://www.designtokens.org/)
- [DTCG：Format Module 2025.10](https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/)
- [DTCG：Color Module 2025.10](https://www.w3.org/community/reports/design-tokens/CG-FINAL-color-20251028/)
- [MDN：CSS Custom Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/--%2A)
- [MDN：Registering Custom Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Properties_and_values_API/Registering_properties)
- [MDN：Web Components](https://developer.mozilla.org/en-US/docs/Web/API/Web_components)
- [MDN：CSS Shadow Parts](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Shadow_parts)
- [MDN：ElementInternals](https://developer.mozilla.org/en-US/docs/Web/API/ElementInternals)
- [W3C WAI：WCAG 2.2 新增内容](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)
- [W3C WAI-ARIA APG：Introduction](https://www.w3.org/WAI/ARIA/apg/about/introduction/)
- [W3C WAI-ARIA APG：Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
- [Vue：Vue and Web Components](https://vuejs.org/guide/extras/web-components.html)
- [React：DOM Components 与 Custom HTML Elements](https://react.dev/reference/react-dom/components)
- [Playwright：Visual Comparisons](https://playwright.dev/docs/test-snapshots)
- [Storybook：Accessibility Tests](https://storybook.js.org/docs/writing-tests/accessibility-testing)
