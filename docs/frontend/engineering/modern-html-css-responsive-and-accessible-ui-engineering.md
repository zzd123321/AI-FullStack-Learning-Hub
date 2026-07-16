---
title: 现代 HTML/CSS、响应式布局与可访问 UI 工程
description: 系统掌握语义 HTML、层叠算法、布局与尺寸、容器查询、响应式资源、主题、动效、兼容性、可访问性和样式治理
---

# 现代 HTML/CSS、响应式布局与可访问 UI 工程

在 Vue 或 React 项目里，组件最终仍会变成 HTML、CSSOM、布局盒和可访问性树。框架能组织状态，却不会自动修正错误标题层级、无标签输入框、溢出的 Grid item、被遮挡的焦点或不尊重用户偏好的动画。

本课不按属性手册罗列 CSS，而是建立一套 UI 工程模型：先让 HTML 表达语义和交互契约，再让层叠决定样式来源，让布局算法根据可用空间求解，最后用响应式资源、用户偏好、兼容策略和自动化测试保证产品在不同设备与辅助技术下成立。

## 学习目标

- 理解 DOM、CSSOM、box tree、paint 与 accessibility tree 的职责；
- 用原生语义元素建立无需 ARIA 补救的结构；
- 按 origin、importance、context、layer、specificity、scope 和 source order 分析层叠；
- 理解 box sizing、内在尺寸、min-content/max-content 与默认最小尺寸；
- 正确选择 normal flow、Flexbox、Grid、Subgrid、定位与滚动容器；
- 区分媒体查询与容器查询的设计边界；
- 使用逻辑属性、流式尺寸和响应式资源，而非设备型号断点；
- 建立 design token、主题、强制颜色和减少动态效果策略；
- 处理焦点、缩放、回流、触控目标、键盘与读屏；
- 建立 CSS 模块边界、兼容基线、视觉回归和生产治理。

## 一、UI 不是像素截图

一个界面至少同时存在四种结构：DOM 表达内容与关系；CSSOM 保存匹配规则；layout/box tree 计算几何；accessibility tree 向辅助技术暴露名称、角色、状态和关系。视觉相同不代表语义相同。

设计稿是某个 viewport、字体、语言和数据下的样本，不是布局规则。工程目标是定义约束，让长文本、系统字体、200% 缩放、RTL、触控和键盘仍得到可用结果。

## 二、先确定内容语义，再写样式

标题用 `h1`—`h6`，站点导航用 `nav`，独立内容用 `article`，真正按钮用 `button`，链接只负责导航。原生元素自带键盘、焦点、表单与可访问性行为。

不要因为默认样式不符合设计就改用 `div`。CSS 可以重设外观，却很难完整重造按钮在 Enter/Space、disabled、表单提交和辅助技术中的平台契约。

## 三、完整语义页面

<<< ../../../examples/frontend/modern-html-css-ui-engineering/semantic-dashboard.html

示例包含语言、viewport、标题、跳转链接、landmark、主导航、当前页、表单 label、结果 live region、真正列表、article 与机器可读 time。这里的 ARIA 只补充名称和状态，没有覆盖原生角色。

一个页面通常只有一个代表主体的 `main`；每个可独立辨认的 section 应有可访问名称。标题层级表达文档结构，不按字号选择。

## 四、ARIA 的第一规则

能用原生 HTML，就不用 ARIA 重造。给 `div` 加 `role=button` 后，还需要 tabindex、Enter/Space 行为、disabled 语义和状态同步；遗漏任何一项都会制造伪按钮。

ARIA 不能改变浏览器行为，只改变暴露给辅助技术的语义。组件重构时同时测试 accessible name、role、state，不只看 DOM 属性是否存在。

## 五、表单与错误的真实契约

placeholder 不是 label；消失后用户无法确认字段含义。`label for`、fieldset/legend、autocomplete、input type 和原生约束先表达语义，业务校验再补充。

错误消息需与字段关联，并在提交或失焦策略下可发现。不要每输入一个字符就用 assertive live region 报错。错误样式不能只依赖红色，还要有文本或图标语义。

## 六、理解层叠算法

“选择器权重更高就赢”是不完整的。浏览器先比较 relevance，然后依次考虑来源与重要性、封装 context、cascade layer，再在同层比较 specificity、scoping proximity 和出现顺序。动画与 transition 还有自己的优先级。

因此第三方 CSS、应用 CSS 与用户样式冲突时，盲目叠 ID 或 `!important` 治标不治本。先在 DevTools Computed/Cascade 面板确认究竟在哪一层失败。

## 七、Cascade Layers 管来源

<<< ../../../examples/frontend/modern-html-css-ui-engineering/layers-and-tokens.css

示例先声明 `reset → tokens → base → layout → components → utilities → overrides`，层顺序比层内 specificity 更早决定胜负。组件层不必靠复杂选择器压过 reset。

未分层的普通 author style 会压过分层普通规则，所以引入旧样式时应主动放进明确层。`!important` 在 layer 间顺序反转，这是保护早期基础约束的机制，不应当作常规覆盖工具。

## 八、Specificity 只解决局部竞争

`:where()` specificity 为零，适合 reset 和可覆盖默认值；`:is()`、`:not()` 与 `:has()` 的权重取决于参数。组件选择器保持单 class 或低权重组合，状态用属性或明确 modifier。

不要用 DOM 层级 `.page .panel ul li a` 绑定结构。它既难覆盖又让重构标签产生意外。选择器应表达组件契约，不复制 DOM 路径。

## 九、继承、初始值与自定义属性

`color` 等属性默认继承，`margin` 不继承；`inherit`、`initial`、`unset` 和 `revert` 语义不同。`all: unset` 会同时移除有价值的平台样式和语义相关表现，使用前必须重建焦点与交互状态。

自定义属性按层叠和继承在 computed-value time 解析，不是预处理变量。它适合主题、组件上下文与设计 token；循环或无效替换会使整个声明在计算值阶段失效。

## 十、设计 token 分语义层级

原始 token 描述色板和尺度，语义 token 描述 `surface/text/accent/danger`，组件 token 再表达局部用途。组件不应散落品牌色 hex，否则暗色、品牌切换和高对比模式无法统一迁移。

token 仍需治理：名称、类型、默认值、弃用、对比度、跨平台转换和变更版本。CSS 变量不是自动设计系统。

## 十一、盒模型与 box-sizing

默认 `content-box` 的 width 不含 padding/border，固定宽度组件容易超出预期。常见 reset 对所有元素和伪元素使用 `border-box`，让声明尺寸包含 padding 与 border。

margin collapse、overflow、formatting context 和 containing block 会改变几何。遇到“莫名位移”先辨认参与哪个布局算法，不用负 margin 反复试错。

## 十二、内在尺寸决定能否收缩

布局项不只受声明 width 控制，还有 min-content、max-content、fit-content 与 replaced element intrinsic size。长 URL、不可断词文本和图片可能撑开容器。

Flex/Grid item 的自动最小尺寸常导致 `1fr` 或 flex child 看似无法缩小；根据语义使用 `min-inline-size: 0`、`minmax(0, 1fr)` 和合适 overflow，而不是给整页 `overflow-x:hidden` 掩盖问题。

## 十三、Normal Flow 是默认基线

块和行内内容的正常流天然支持未知高度、文档顺序和响应式变化。能用 flow 完成的布局，不用 absolute 定位每一个元素。

绝对定位脱离常规流，不会为父容器贡献正常尺寸。它适合角标、overlay 等真正叠放关系，不适合主页面排版。

## 十四、Flexbox 解决一维分配

Flexbox 沿主轴分配剩余空间，并在交叉轴对齐。`flex-basis` 是参与分配的初始主尺寸，`flex: 1` 不等于简单 width 平分；内容最小尺寸仍会影响结果。

工具栏、导航、按钮组和“内容 + 操作”适合 Flex。使用 `gap` 表达项目间距，避免每个 child margin 和最后项清零规则。

## 十五、Grid 解决二维轨道

Grid 同时定义行列轨道，适合页面骨架、卡片矩阵和字段矩阵。`auto-fit` 配合 `minmax()` 可让可用空间决定列数，不必为每种屏宽写断点。

Grid 的 source order 不应为视觉排版随意改变。键盘和读屏通常仍按 DOM 顺序，CSS placement 不能修复错误信息结构。

## 十六、Subgrid 对齐跨组件内容

普通嵌套 Grid 建立独立轨道，多个卡片的标题、正文和 footer 不一定对齐。Subgrid 允许子 grid 采用父级相应轨道，实现内容驱动的一致对齐。

只有确实共享轨道的层级才用 subgrid。组件完全独立时，强行共享页面轨道反而提高耦合。

## 十七、完整响应式布局

<<< ../../../examples/frontend/modern-html-css-ui-engineering/responsive-dashboard.css

示例使用流式 page shell、Flex、auto-fit Grid、`min()`、`clamp()`、逻辑尺寸和命名 container。卡片根据自身 inline size 变体；只有页面级结构才使用 viewport media query。

## 十八、媒体查询与容器查询

媒体查询适合 viewport、打印、hover/pointer、color scheme、contrast 和 reduced motion 等环境能力。组件宽度往往由侧栏、Grid 或嵌入位置决定，与 viewport 没有固定关系，此时用 container query。

容器需建立查询上下文，如 `container: course / inline-size`。容器不能根据自身内部被查询样式形成不可解循环，所以查询作用于后代，而不是直接改查询容器本身的尺寸。

## 十九、断点来自内容而非设备名

“tablet 768px”会随分屏、缩放和嵌入失效。先让布局自然流动，在内容开始拥挤或测量不可读时设置断点，并用 `em/rem` 尊重字号环境。

移动优先不是永远先写小屏，而是先定义最少约束的核心体验，再在空间或能力存在时增强。不要用 user-agent 字符串决定布局。

## 二十、逻辑属性支持书写模式

`inline/block` 由 writing mode 决定，`start/end` 由方向决定。使用 `margin-inline`、`padding-block`、`border-inline-start`、`inline-size` 能让 LTR、RTL 和竖排共享规则。

图标箭头、时间轴和手势方向未必都应镜像；按语义决定。不要只做 CSS 翻转而忽略 DOM 阅读顺序、键盘方向与内容本地化。

## 二十一、Viewport 单位与移动浏览器

传统 `vh` 在移动地址栏伸缩时容易产生遮挡或跳变。small/large/dynamic viewport 单位分别表达保守、最大和当前动态视口；逻辑单位 `dvb/dvi` 还能适配 writing mode。

全屏面板需同时考虑 safe-area inset、虚拟键盘、滚动容器和 focus not obscured。不要假定 `100vh` 等于用户此刻可见高度。

## 二十二、流式排版

用 `clamp(min, preferred, max)` 让字号和间距在区间内平滑变化，但上下限要可读。正文行长通常限制在合适字符范围，避免超宽屏一行横跨整个页面。

用户缩放和自定义默认字号必须继续生效。重要文本不要只用 `vw`，因为纯 viewport 单位可能削弱文本缩放。

## 二十三、响应式图片是资源选择

<<< ../../../examples/frontend/modern-html-css-ui-engineering/responsive-picture.html

`srcset` 的 `w` descriptor 告诉浏览器候选资源固有宽度，`sizes` 描述图片在当前条件下预计的 CSS slot 宽度，浏览器结合 DPR 和网络策略选资源。它不是 CSS breakpoint 的图片版复制。

`picture/source` 用于格式或 art direction；`img` 仍提供最终 fallback 与 alt。明确 width/height 或 aspect-ratio 为图片预留空间，降低 CLS。首屏 LCP 图片通常不应 lazy-load。

## 二十四、容器溢出是产品决策

文本换行、截断、滚动、扩展高度代表不同信息语义。重要姓名或金额不应无提示截断；单行 ellipsis 还需可访问的完整信息入口。

滚动容器需要可聚焦性、名称、明显边界和键盘可达内容。嵌套横纵滚动会带来触控和读屏困难，应减少层级。

## 二十五、主题不是切换 class 就结束

主题覆盖页面背景、文本、控件、表单、滚动条、浏览器原生 UI、图片和第三方内容。`color-scheme` 告诉浏览器页面支持的方案；CSS token 决定应用颜色。

<<< ../../../examples/frontend/modern-html-css-ui-engineering/theme-preference.ts

示例区分用户偏好 `system/light/dark` 与最终主题。选择 system 时不要固化当时的深浅色，应继续响应操作系统变化；SSR 在首屏尽早应用持久偏好，避免闪烁和 hydration 不一致。

## 二十六、颜色、对比度与强制颜色

颜色对比要在实际背景、字号、字重与交互状态上测量。透明叠加、渐变和图片背景不能只检查 token 两端。状态不能只靠颜色区分。

Windows forced-colors 等模式会在 paint 阶段替换大量作者颜色。优先接受系统颜色；只有内容不可读时才做窄范围修复，不用 `forced-color-adjust:none` 全局关闭用户保护。

## 二十七、焦点可见且不能被遮挡

键盘焦点需要高对比指示器，`:focus-visible` 可减少纯指针点击的多余焦点样式，但不能 `outline:none` 后不提供替代。sticky header、cookie banner 和底部工具栏不得盖住当前焦点。

跳转到锚点时可使用 `scroll-margin-block-start` 留出 sticky header 空间。对话框关闭后把焦点恢复到合理触发点。

## 二十八、交互目标与输入方式

触控目标需要足够尺寸和间距；不要把 hover 当唯一发现方式。`@media (hover:hover)`、`pointer` 能用于增强，但设备可能同时存在鼠标和触摸，逻辑不能只二选一。

拖拽必须有非拖拽替代操作；精确手势应有简单手势路径。视觉标签文字要与 accessible name 一致，方便语音控制定位。

## 二十九、动效表达状态变化

动效应解释空间、层级或状态变化，不只是装饰。优先 transform/opacity 可减少布局工作，但合成层也消耗显存，`will-change` 不能长期到处添加。

<<< ../../../examples/frontend/modern-html-css-ui-engineering/accessible-interactions.css

示例为焦点、skip link、当前页、减少动态效果和 forced colors 建立基线。减少动态效果不是简单删除所有反馈，而是移除非必要运动、视差和大幅缩放，保留即时状态确认。

## 三十、滚动与固定界面

页面尽量只有一个主滚动容器。`position: sticky` 受最近 scrolling ancestor 与 containing block 影响，祖先 overflow 常是 sticky 失效原因。

scroll snap 适合可预测分页内容，但不能困住用户。程序化滚动尊重 reduced motion，焦点与视觉位置同步，避免只滚动却让键盘焦点留在原处。

## 三十一、CSS 隔离方案的边界

全局 CSS 适合 reset、token、基础语义和 utilities；CSS Modules 提供构建期局部类名；Vue scoped style 通过属性选择器隔离；CSS-in-JS 可能提供动态主题和类型集成，也带来运行时、SSR、缓存与调试成本。

隔离类名不能隔离继承、custom properties、字体、top layer 或 portal 内容。选择方案前先定义需要隔离的是命名、规则来源、主题还是运行时状态。

## 三十二、组件 API 不应泄漏布局偶然性

组件根节点默认不应固定外边距和页面宽度；由父布局决定摆放，组件内部决定自身结构。用 `class`/slot/part/token 开放明确扩展点，不允许任意深层选择器穿透内部。

状态通过语义属性和组件 API 表达，避免父页面依赖第三个 span。视觉变体数量要受设计系统治理，不能每个页面新增一个布尔 prop。

## 三十三、Progressive Enhancement

先提供语义 HTML、正常流和核心操作，再用 Grid、container query、dialog 等能力增强。关键业务不应在某个新 CSS 特性不支持时完全消失。

用 `@supports` 检测能力而非浏览器名字。fallback 需要满足产品支持基线，不必让旧环境像素完全一致，但必须可读、可操作且数据正确。

## 三十四、浏览器基线与兼容策略

团队明确浏览器/版本、企业 WebView、辅助技术和使用占比，形成可执行支持矩阵。MDN Baseline 可以辅助判断广泛可用性，但不能代替自己的流量和业务风险。

Autoprefixer 只补前缀，不会自动修复语义或所有行为差异。新特性需确认语法解析、fallback cascade、polyfill 成本和真实设备表现。

## 三十五、性能与渲染成本

复杂选择器通常不是首要瓶颈；更常见问题是巨大 DOM、同步布局读写交错、重阴影/滤镜、超大图片、字体阻塞和频繁改变影响布局的属性。

使用 Performance/Rendering 工具区分 style、layout、paint 与 composite。`content-visibility`、contain 和虚拟化都有可访问性、查找、锚点与尺寸估算边界，不为分数盲目开启。

## 三十六、字体工程

字体影响换行、布局偏移、语言覆盖和品牌。合理 subset、preload 真正首屏字体、设置 `font-display`，并用 fallback metric override 或兼容字体降低交换布局变化。

不要为每个字重加载完整独立文件；变量字体能减少请求但不保证更小。中文字体体积尤其需要按产品内容和授权策略评估。

## 三十七、测试策略

纯逻辑验证主题解析和持久化边界：

<<< ../../../examples/frontend/modern-html-css-ui-engineering/ui-engineering.test.mts

浏览器层还要覆盖：语义与 accessible name、键盘顺序、焦点可见、200%/400% zoom、320 CSS px reflow、长文本、动态字体、LTR/RTL、深浅色、forced colors、reduced motion、触摸和不同 DPR。

视觉回归应选择稳定 viewport、字体、数据与动画时钟，并允许有意的跨浏览器字形差异。截图通过不能证明键盘和读屏可用；自动 axe 类规则也只能发现部分问题。

## 三十八、样式质量门禁

Stylelint 检查无效属性、重复规则、层顺序、token 使用和项目约定；HTML/框架 lint 检查 label、alt、landmark 与非法 ARIA。CSS 构建检查无效 import、重复产物和预算。

门禁不应鼓励用 disable 注释绕过。每个例外记录原因、owner 和移除条件，尤其是 `!important`、深层穿透、固定 z-index 和强制颜色覆盖。

## 三十九、常见失败模式

1. 用 div 重造原生控件；2. 用 ARIA 掩盖错误 HTML；3. 标题按字号选；4. placeholder 当 label；5. 认为 specificity 决定一切；6. 到处 `!important`；7. 选择器复制 DOM；8. 固定 px 复刻单张设计稿；9. 用设备名断点；10. 用 JS 测宽替代容器查询；11. 全页 hidden 掩盖横向溢出；12. Grid/Flex item 忘记内在最小尺寸；13. absolute 做主布局；14. 视觉 reorder 破坏阅读顺序；15. `100vh` 忽略移动视口；16. 图片没有尺寸；17. 懒加载 LCP；18. 暗色只反转背景；19. 删除 outline；20. hover-only；21. 动画忽略 reduced motion；22. forced colors 全局关闭；23. 截图测试代替无障碍测试。

## 四十、上线检查清单

- [ ] HTML 的元素、标题、landmark、列表和表单关系表达真实语义；
- [ ] 原生控件优先，ARIA 只补充缺失语义且状态同步；
- [ ] DOM 顺序与阅读、焦点和操作顺序一致；
- [ ] cascade origin/layer 顺序明确，组件 selector 低权重；
- [ ] reset、token、base、layout、component 和 override 边界清晰；
- [ ] box sizing、内在尺寸、长文本和 overflow 经过验证；
- [ ] Flex 用于一维分配，Grid/Subgrid 用于共享二维轨道；
- [ ] 页面环境用 media query，组件空间用 container query；
- [ ] 断点来自内容约束，不依赖设备型号或 UA；
- [ ] 使用逻辑属性并验证 LTR、RTL 和目标语言；
- [ ] 动态 viewport、safe area、虚拟键盘与 sticky 遮挡已测试；
- [ ] 文本可缩放，流式尺寸有合理上下限和行长；
- [ ] 图片提供 srcset/sizes、尺寸、alt 和正确加载优先级；
- [ ] 主题覆盖原生控件、持久化、SSR 与系统偏好变化；
- [ ] 对比度、非颜色状态和 forced colors 经过验证；
- [ ] focus visible、focus not obscured、skip link 和恢复策略成立；
- [ ] 触控目标、键盘、语音、非拖拽路径和 hover 替代成立；
- [ ] reduced motion 下移除非必要运动并保留状态反馈；
- [ ] CSS 模块方案的全局、继承、portal 与扩展边界明确；
- [ ] 支持矩阵、@supports fallback 和真实设备验证已完成；
- [ ] style/layout/paint、字体、图片和 CSS 体积满足预算；
- [ ] 视觉回归、DOM 测试、自动规则和人工辅助技术测试互补。

## 总结

现代 UI 工程从语义开始，而不是从像素开始。HTML 定义内容和原生行为，层叠决定样式治理边界，内在尺寸与布局算法根据可用空间求解，媒体和容器查询处理不同层次的环境变化，token、用户偏好和渐进增强保证主题与兼容性，键盘、焦点、缩放和辅助技术测试验证真实可用性。框架只是这些能力的组织者，不能替代浏览器平台本身。

## 参考资料

- [WHATWG HTML Standard：Sections](https://html.spec.whatwg.org/multipage/sections.html)
- [MDN：HTML Semantics](https://developer.mozilla.org/en-US/docs/Glossary/Semantics)
- [MDN：Introduction to the CSS cascade](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascade/Introduction)
- [MDN：@layer](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40layer)
- [MDN：@container](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40container)
- [MDN：CSS Grid Subgrid](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Grid_layout/Subgrid)
- [MDN：Logical properties and values](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Logical_properties_and_values/Basic_concepts)
- [MDN：Responsive images](https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Responsive_images)
- [MDN：prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion)
- [MDN：forced-colors](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/forced-colors)
- [W3C：Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/)
