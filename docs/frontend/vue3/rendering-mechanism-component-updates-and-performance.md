---
title: Vue 3 渲染机制、组件更新与性能优化
description: 从模板编译和响应式更新出发，理解组件边界、列表身份、异步加载、缓存与性能测量
---

# Vue 3 渲染机制、组件更新与性能优化

> 适用环境：Vue 3.5+、TypeScript、Vite。Patch Flag 等编译细节用于建立心智模型，不是业务代码应该依赖的稳定接口。

前面的课程反复提到“缩小依赖范围”“保持 Props 稳定”“不要深度 watch 巨大对象”。这些建议只有在理解一次 Vue 更新如何发生之后，才不会变成死记硬背。

这一课围绕一个问题展开：

> 状态改变以后，Vue 做了哪些工作；我们又怎样证明其中哪一步真的慢？

## 先分清楚：页面到底是哪一种慢

“页面很卡”至少可能指两类完全不同的问题。

### 首次加载慢

用户打开地址后，很久才看到主要内容或才能可靠交互。常见成本是：

- HTML 里是否已有可见内容；
- 服务端响应和接口瀑布；
- JavaScript、CSS、字体、图片体积；
- JavaScript 下载、解析和执行；
- 客户端挂载或 Hydration；
- 第三方脚本占用主线程。

这类问题关注 LCP、INP、资源瀑布、长任务和传输体积。

### 页面运行后更新慢

页面已经打开，输入筛选词、切换选项或拖动控件时掉帧。常见成本是：

- 同步计算太多；
- 响应式依赖和组件更新范围太大；
- 创建或比较大量 VNode；
- DOM 节点太多；
- 布局、绘制或合成成本过高；
- 一次交互中触发长任务。

路由懒加载可以减少首屏代码，却不会让一万个已渲染行的筛选变快。缓存一个 computed 也不会修复一张 5 MB 首图。

第一条性能原则因此是：

> 先把“慢”描述成可观测阶段，再谈优化手段。

## 从模板到真实 DOM 的完整路径

Vue 渲染可以概括成三个阶段：

```text
模板
  ↓ 编译
render function
  ↓ 首次执行
VNode 树
  ↓ mount
真实 DOM

响应式依赖变化
  ↓ 调度 render effect
新的 VNode 树
  ↓ patch 新旧描述
必要的 DOM 修改
```

### 编译：模板变成渲染函数

单文件组件的模板通常在 Vite 构建过程中提前编译。浏览器拿到的是渲染函数，不必再携带完整模板编译器并在运行时解析模板。

渲染函数执行后返回 VNode。概念化的 VNode 类似：

```ts
const vnode = {
  type: 'button',
  props: { class: 'primary' },
  children: '保存'
}
```

它是“期望界面”的 JavaScript 描述，不是真实 DOM 的完整复制。

### Mount：第一次创建界面

Renderer 第一次执行渲染函数，遍历 VNode 并创建真实 DOM。渲染运行在响应式 effect 中，因此执行期间读取到的 ref、reactive 属性和 computed 会被收集为依赖。

### Patch：后续让 DOM 与新描述一致

依赖改变后，组件更新任务进入调度队列。渲染函数再次执行并产生新 VNode；Renderer 比较新旧 VNode，只对真实 DOM 做必要修改。

所以这些说法不是一回事：

```text
响应式值改变
≠ 一定触发所有组件
≠ 整个组件 DOM 重建
≠ 浏览器重绘整页
```

一个组件即使重新执行 render，也可能最终只修改一个文本节点；新旧值相同的 DOM 属性不会被无意义重写。

## Vue 为什么能比“盲目比较整棵树”做得更少

Vue 同时控制模板编译器和运行时。编译器能提前分析模板，把信息留给运行时。

### 静态内容可以跳过

```vue
<section>
  <h1>课程目录</h1>
  <p>选择课程查看详情</p>
  <p>{{ selectedTitle }}</p>
</section>
```

前两个节点永远不依赖运行时状态。编译器可以缓存或提升这些静态内容，后续更新时不必把它们当成普通动态节点反复创建、比较。

连续的大块静态内容还可能合并成静态 VNode，高效地挂载。由此可见，把每段静态 HTML 都拆成一个组件不一定更快，反而可能增加组件实例成本。

### Patch Flags 告诉运行时“哪里可能变”

```vue
<div :class="{ active }">{{ title }}</div>
```

编译器知道这个元素只有 class 和文本是动态的，于是在生成的 VNode 上留下更新提示。运行时不必每次枚举所有属性。

Patch Flag 用位掩码表达 TEXT、CLASS、STYLE 等动态类型。具体数字属于 Vue 内部实现；理解它的目的即可，不要在业务代码中读取或硬编码。

### Block Tree 把动态后代扁平记录

一棵很深的模板可能只有少数动态节点。Block 会记录带 Patch Flag 的动态后代，更新时运行时可以访问这组扁平节点，而不是递归检查全部静态层级。

`v-if`、`v-for` 会改变结构，因此会形成新的 Block 边界。编译器仍要保证结构变化时的正确性。

这套机制通常称为“编译器知情的 Virtual DOM”：

```text
模板的静态信息
  ↓ 编译器编码
运行时获得更新提示
  ↓
跳过不可能变化的工作
```

模板往往比随意手写 render function 或 JSX 更容易被静态分析。后两者的价值是表达能力，不是天然更接近底层、所以一定更快。

## 响应式依赖决定组件何时进入更新队列

假设 setup 中有两个 ref，但模板只读了其中一个：

```ts
const title = ref('Vue')
const unrelated = ref(0)
```

`unrelated` 没有被组件渲染 effect 读取，修改它不会因为“和 title 在同一个 setup”就必然触发组件渲染。

反过来，如果模板、渲染期间调用的函数或 computed 读取了一个巨大 reactive 对象的许多属性，就会建立更多依赖。优化更新范围的第一步往往不是加缓存，而是确认组件到底读取了什么。

开发环境可以用 `onRenderTracked()` 和 `onRenderTriggered()` 辅助调查：

```ts
onRenderTracked((event) => {
  console.debug('渲染收集了依赖', event)
})

onRenderTriggered((event) => {
  console.debug('哪个依赖触发了更新', event)
})
```

它们适合诊断，不应作为生产业务逻辑。

渲染函数必须保持纯粹：不要在模板调用的方法中修改状态、发请求或写 localStorage。render 可能多次执行，副作用应放进事件处理器、watch 或生命周期。

## 更新为什么不是每次赋值都立刻改 DOM

连续执行：

```ts
count.value += 1
count.value += 1
count.value += 1
```

JavaScript 状态会立即变成最终值，但 Vue 会缓冲并去重组件更新，在同一轮 flush 中处理，而不是同步修改 DOM 三次。

完整示例：

<<< ../../../examples/frontend/vue3-rendering/RenderBatchingDemo.vue

这解释了：

```ts
count.value += 1
console.log(count.value) // 新状态
console.log(element.textContent) // 可能仍是旧 DOM
```

只有确实要读取 Vue 更新后的 DOM 时才：

```ts
await nextTick()
```

`nextTick()` 等待 Vue 的 DOM 更新 flush，不代表：

- 网络请求已经结束；
- 图片、字体已经加载；
- CSS transition 已结束；
- 浏览器已经完成下一次绘制；
- 任意第三方组件都稳定了。

如果需要测量浏览器完成布局后的结果，可能还要等待 `requestAnimationFrame()`；资源本身则有各自的加载事件。

### Watcher 的 flush 位置

默认 watcher 回调通常在父组件更新后、所属组件 DOM 更新前执行。若副作用确实要读自身更新后的 DOM：

```ts
watch(source, callback, { flush: 'post' })
```

`flush: 'sync'` 会绕过普通批量调度，应只在非常明确且变化频率低的场景使用。对频繁数组变更使用同步 watcher，可能一次操作触发大量回调。

flush 只改变副作用的执行时机，不能把 watcher 变成 computed。能声明派生关系时仍优先 computed。

## 组件边界也是更新边界

父组件重新渲染，不等于所有后代都要执行同等工作。子组件可能因为以下原因更新：

- 自己读取的响应式状态变化；
- 接收到的 Prop 值变化；
- 注入值或 Store 依赖变化；
- Slot 内容的依赖要求更新；
- key 变化导致旧实例卸载、新实例创建。

### 稳定 Props 为什么重要

假设每一行都接收 `activeId`：

```vue
<LessonRow
  v-for="lesson in lessons"
  :lesson="lesson"
  :active-id="selectedId"
/>
```

选择变化后，每一行的 `activeId` 都变了，所有行都有更新理由。

让父组件先算出布尔值：

```vue
<LessonRow
  v-for="lesson in lessons"
  :lesson="lesson"
  :active="lesson.id === selectedId"
/>
```

此时大多数行的 active 仍是 false，通常只有旧选中行和新选中行的 Prop 改变：

<<< ../../../examples/frontend/vue3-rendering/LessonRow.vue

稳定性不只看“内容一样”，还看值的比较语义。每次 render 都创建新对象：

```vue
<Child :options="{ compact: true }" />
```

对象引用每次都不同。若对象是静态配置，把它提到 setup 中；若是派生对象，先判断是否真的造成可测更新，再选择拆成标量 Props、稳定 computed 或其他设计。

不要为了引用稳定性把简单事件回调过早复杂化。Vue 的性能决策应该来自 profiler，而不是照搬其他框架的优化习惯。

### Computed 的稳定性

Vue 3.4+ 中，computed 重新计算后若结果与上次相等，不会继续触发下游 effect：

```ts
const isEven = computed(() => count.value % 2 === 0)
```

但若 computed 每次返回新对象，引用仍不同：

```ts
const summary = computed(() => ({ total: items.value.length }))
```

可以在确有性能证据时复用旧结果，但 getter 必须先完整读取本轮依赖，再比较返回，否则依赖收集可能不完整。很多场景把下游输入改成标量更清楚。

## key 表达身份，不是消除警告的编号

列表 diff 必须知道“新旧节点是不是同一个业务对象”。稳定 key 让 Vue 在插入、删除、重排时正确复用 DOM 和组件实例。

```vue
<LessonRow
  v-for="lesson in lessons"
  :key="lesson.id"
  :lesson="lesson"
/>
```

数组索引只表示当前位置。删除中间项后，后续所有索引都改变，输入值、焦点、组件本地状态或动画可能被复用到错误项目。

只有列表永远不重排、不插入删除、每项没有身份相关状态时，索引 key 才可能无害；业务实体通常直接使用稳定 ID。

### 改 key 会强制重建

当同一位置的 key 改变，Vue 会卸载旧实例并挂载新实例。它可以有意用于“换了实体就需要全新本地状态”的边界，但不应当作通用刷新按钮：

- 本地状态会丢失；
- 生命周期和请求重新执行；
- DOM 与焦点被重建；
- 真实的数据同步问题被掩盖。

先修正所有权和依赖关系，再考虑是否真的需要重建。

## 大列表包含三种不同成本

筛选一千条数据至少涉及：

1. JavaScript 过滤计算；
2. Vue 创建和 patch VNode；
3. 浏览器维护 DOM、布局与绘制。

只优化其中一层，不一定改变用户体验。

示例把数据生成和不可变更新放在纯函数中：

<<< ../../../examples/frontend/vue3-rendering/lesson-data.ts

页面完整实现：

<<< ../../../examples/frontend/vue3-rendering/LessonCatalogPerformance.vue

它包含三个有意的边界：

- `shallowRef` 不代理每条记录的深层属性；
- 修改课程时替换根数组，只替换真正变化的记录；
- 父组件传给行组件的是已经算好的 active 布尔值。

`shallowRef` 是一份契约：

```ts
// 不会触发更新
lessons.value[0].title = '新标题'

// 替换根值才是正确更新方式
lessons.value = lessons.value.map((lesson) =>
  lesson.id === id ? { ...lesson, title: '新标题' } : lesson
)
```

深层响应式开销通常只在大量嵌套数据、一次渲染访问数万甚至更多属性时值得处理。普通业务对象优先使用默认 reactive，不要把 `shallowRef` 当成“更高级的 ref”。

### 一千条数据不等于应该有一千个可见 DOM 行

无论框架 diff 多快，浏览器维护大量 DOM 都有成本。屏幕一次只能显示几十行时，虚拟列表往往比微调 computed 更有效：

```text
完整数据 10000 项
  ↓ 根据滚动窗口计算
只渲染可见区域和少量缓冲项
```

虚拟化还要处理动态高度、键盘导航、滚动定位和可访问性，通常优先选成熟方案并用真实数据测试。

模板里也不要反复调用昂贵函数：

```vue
<!-- 每次 render、每一行都执行 -->
<li v-for="item in expensiveFilter(items)">
```

把纯派生计算放进 computed；若计算本身仍然很重，再考虑索引、服务端筛选、Web Worker 或减少数据量。

## 条件渲染和跳过更新各有边界

### `v-if` 与 `v-show`

`v-if` 为 false 时不创建子树，切换时会挂载或卸载。适合初始很少出现、切换不频繁的内容。

`v-show` 始终创建 DOM，只切换 display。适合初始化可以接受、但需要频繁显示隐藏的简单内容。

选择依据是“初始成本与切换成本”，不是固定规则。

### `v-once`

它让子树首次渲染后永久跳过更新。适合依赖运行时数据、但生命周期内确定不会再变化的内容。若业务后来要求更新，这个指令会让界面悄悄停在旧值。

### `v-memo`

它根据依赖数组跳过一棵子树或大列表项的更新：

```vue
<LessonRow
  v-for="lesson in lessons"
  :key="lesson.id"
  v-memo="[lesson.id === selectedId, lesson.updatedAt]"
/>
```

依赖漏写就会产生陈旧 UI。Vue 官方把它定位为少数性能敏感场景的工具；先稳定 Props、减少 DOM 并测量，再决定是否承担这份手工依赖维护成本。

组件抽象本身也有实例与 Slot 开销，但只有在大列表中重复成百上千次时，减少一层无意义包装才可能明显。不要牺牲清晰边界去消灭几个正常组件。

## 代码分割解决“何时下载”，不是“如何更新”

低频且较大的分析面板可以异步加载：

<<< ../../../examples/frontend/vue3-rendering/AsyncPanelHost.vue

<<< ../../../examples/frontend/vue3-rendering/LoadingPanel.vue

<<< ../../../examples/frontend/vue3-rendering/ErrorPanel.vue

<<< ../../../examples/frontend/vue3-rendering/AnalyticsPanel.vue

`defineAsyncComponent()` 可以配置：

- loader 动态 import；
- loading 延迟，避免快网下闪烁；
- timeout；
- error component；
- 有上限的重试策略。

重试不能不分原因无限执行。构建产物不存在、代码语法错误等永久故障不会因为立即重试而恢复；生产策略应识别可恢复网络错误，并加入退避和上限。

路由记录的：

```ts
component: () => import('./SettingsView.vue')
```

是 Vue Router 的路由懒加载；页面内部 `defineAsyncComponent()` 是组件级加载。两者都借助动态 import 形成 chunk，但由不同边界管理，不需要把路由组件再包一层 async component。

拆包也不是越碎越好。每个 chunk 都有请求、调度和缓存成本。应查看真实构建分析，按页面或低频重功能切分，而不是让每个小按钮都独立下载。

## KeepAlive 解决“切走后是否保留实例”

动态组件默认切换后会卸载，重新回来时创建新实例。编辑器切到预览又回来，若希望保留未提交文本，可以缓存：

<<< ../../../examples/frontend/vue3-rendering/CachedWorkspace.vue

<<< ../../../examples/frontend/vue3-rendering/EditorPanel.vue

<<< ../../../examples/frontend/vue3-rendering/PreviewPanel.vue

`KeepAlive` 缓存的是组件实例以及它的本地响应式状态和 DOM 子树，不是普通接口数据缓存。

实例离开 DOM 时进入 deactivated，回来时 activated。注意：

- `onActivated()` 初次挂载也会调用；
- `onDeactivated()` 在进入缓存和最终卸载时都会调用；
- 被停用不等于已销毁；
- 计时器、订阅、媒体播放可能要在 deactivated 暂停；
- 恢复时在 activated 继续或刷新过期数据。

`max` 让缓存按最近使用策略淘汰；`include`、`exclude` 按组件 name 匹配。`<script setup>` 的 SFC 在当前 Vue 中可从文件名推断 name，但重命名文件也会改变匹配结果。

不要缓存所有路由。缓存越多，占用的内存和仍存活的副作用越多。真正需要跨页面共享的业务数据仍应进入 Store 或缓存层，而不是依赖某个页面实例永不销毁。

## SSR 与 Hydration 为什么也受渲染模型影响

服务端已输出 HTML 时，客户端 Hydration 会把组件状态和事件连接到已有 DOM，而不是从空容器重建一切。编译器的动态提示也能帮助这一步跳过静态工作。

前提是服务端与客户端首次渲染一致。常见破坏因素：

- render 中直接读取 `Date.now()` 或 `Math.random()`；
- 服务端与客户端时区不同；
- 首次 render 访问 `window.innerWidth`；
- 无稳定种子的随机 ID；
- 两端权限或数据初值不同；
- 非法 HTML 被浏览器自动修正。

Hydration mismatch 可能造成 DOM 修复、状态丢失和额外工作。后续 SSR 专题会完整解释；本课先记住：render 的确定性也是性能和正确性要求。

## 性能优化必须形成证据闭环

一次可靠分析可以按这个顺序进行。

### 先稳定复现

记录：

- 页面和操作步骤；
- 数据量；
- 浏览器与设备；
- 开发还是生产构建；
- 慢的是首次加载还是某次交互。

开发模式包含额外警告和调试开销，最终结论要用接近生产的构建验证。

### 再定位主线程花在哪里

工具各自回答不同问题：

| 工具 | 适合回答 |
| --- | --- |
| Network | 哪些资源晚、重复或过大 |
| Coverage / 构建分析 | 下载的代码有多少未使用，chunk 如何组成 |
| Chrome Performance | 长任务、脚本、布局、绘制分别耗时多少 |
| Vue Devtools Profiler | 哪些组件更新、耗时和触发范围 |
| User Timing | 业务阶段从开始到结束用了多久 |
| Web Vitals | 真实用户的加载和交互体验 |

Vue 开发环境可启用 `app.config.performance`，向浏览器 Performance Timeline 添加 Vue 标记。

### 找到原因后只改对应层

例如一次筛选慢：

```text
输入事件
  ↓
过滤 4ms
  ↓
组件更新 7ms
  ↓
布局 80ms
```

主因是 DOM/布局，就应减少渲染节点或虚拟化；缓存那 4ms 过滤不会解决主体问题。

若性能记录显示每次选择让全部行组件更新，再修稳定 Props。若脚本时间来自深层 Proxy 访问，且数据确实巨大并按不可变方式管理，再考虑 shallow API。

### 修改后用同一场景复测

记录优化前后：

- 同一数据量；
- 同一设备与网络条件；
- 多次运行的中位数或分布；
- 功能、可访问性和内存是否退化。

没有复测的“优化”只是代码变化。

## DOM 读写也可能制造布局抖动

循环中交替写样式和读取布局：

```ts
for (const element of elements) {
  element.style.width = nextWidth
  console.log(element.offsetWidth)
}
```

浏览器可能被迫反复计算布局。更好的方向是批量读取，再批量写入，或用 class 和 CSS 完成布局变化。

Vue 减少了手工 DOM 操作，却不能消除浏览器布局与绘制成本。动画优先考虑 transform 和 opacity，也仍需用 Performance 面板确认。

## 首屏优化通常按收益排序

常见优先级是：

1. 选择合适渲染架构：静态内容优先 SSG，SEO/首屏敏感页面评估 SSR；
2. 优化服务端和关键接口；
3. 压缩并正确尺寸化图片、字体；
4. 减少初始 JavaScript 和第三方脚本；
5. 按页面或重功能做代码分割；
6. 避免串行请求瀑布；
7. 最后再研究微小 runtime 优化。

构建步骤还能移除未使用的 tree-shakable API，但 tree shaking 依赖 ESM、静态 import 和库的副作用声明。引入一个大依赖前应看它在**本项目构建产物**中的实际增量，而不是只看 npm 包总大小。

发布时入口 HTML 通常不应长期强缓存，带内容哈希的 JS/CSS 可以长期 immutable。否则新 HTML 引用的 chunk 与旧缓存组合不一致，动态 import 可能失败。错误恢复可以提示刷新，但根本解决方案是正确的缓存和部署一致性策略。

## 常见伪优化

### 所有值都包 computed

简单读取没有昂贵计算，不会因为多一层 computed 自动更快。computed 也有依赖和缓存管理成本。

### 所有组件都异步

首屏必需的小组件被拆出去会增加请求和 loading 切换。按下载时机与功能重量切分。

### 所有对象都 shallowRef

嵌套修改不再响应，却没有建立不可变更新纪律，结果是界面不刷新。只在大而基本不可变的数据上使用。

### 所有列表都加 v-memo

依赖维护成本和陈旧 UI 风险可能大于收益。先稳定 Props、使用正确 key、减少 DOM。

### 用 setTimeout 等 Vue 更新

时间猜测不表达调度关系。读取 Vue 更新后的 DOM 用 `nextTick()`；等待绘制、动画或网络使用对应机制。

### 每次都改 key 强制刷新

它会销毁状态和 DOM，只是绕过了真正的数据所有权问题。

### 机械拆成很多微组件

组件应表达复用、状态或更新边界。大量只转发一层 Props/Slot 的组件在大列表中反而可能增加成本。

## 阅读示例时的因果顺序

批量调度与 `nextTick()`：

<<< ../../../examples/frontend/vue3-rendering/RenderBatchingDemo.vue

大列表、稳定 Props 与浅层响应：

<<< ../../../examples/frontend/vue3-rendering/lesson-data.ts

<<< ../../../examples/frontend/vue3-rendering/LessonCatalogPerformance.vue

<<< ../../../examples/frontend/vue3-rendering/LessonRow.vue

异步组件的加载状态：

<<< ../../../examples/frontend/vue3-rendering/AsyncPanelHost.vue

实例缓存与激活状态：

<<< ../../../examples/frontend/vue3-rendering/CachedWorkspace.vue

把它们串起来：

```text
状态变化
  ↓ 响应式依赖定位组件
调度器批量执行
  ↓ render 产生新 VNode
编译提示 + 稳定组件输入缩小 patch
  ↓
浏览器执行必要 DOM、布局与绘制
  ↓
Profiler 证明哪一层值得继续优化
```

## 本课小结

- Vue 通过 compile、mount、patch 把声明式模板同步到 DOM；
- 响应式触发、组件 render、DOM 修改和浏览器绘制是不同阶段；
- 静态缓存、Patch Flags 和 Block Tree 让运行时跳过不可能变化的工作；
- 调度器会批量更新，`nextTick()` 只等待 Vue 的 DOM flush；
- 组件边界和稳定 Props 可以缩小更新范围；
- key 表达业务身份，随意改 key 会强制销毁重建；
- 大列表要分别看计算、VNode 和 DOM 成本，虚拟化常比微优化收益更大；
- `shallowRef` 只有配合根替换和不可变数据才正确；
- 异步组件控制代码何时下载，`KeepAlive` 控制实例切走后是否保留；
- 性能改动必须经过复现、定位、针对性修改和同场景复测。

下一节是[Vue 3 测试策略与可测试架构](/frontend/vue3/testing-strategy-and-testable-architecture)。当组件边界、服务边界和副作用所有权清楚后，测试就能围绕可观察行为建立，而不是依赖内部实现。

## 官方资料

- [Vue：渲染机制](https://vuejs.org/guide/extras/rendering-mechanism.html)
- [Vue：性能最佳实践](https://vuejs.org/guide/best-practices/performance.html)
- [Vue：nextTick](https://vuejs.org/api/general.html#nexttick)
- [Vue：侦听器的回调触发时机](https://vuejs.org/guide/essentials/watchers.html#callback-flush-timing)
- [Vue：异步组件](https://vuejs.org/guide/components/async.html)
- [Vue：KeepAlive](https://vuejs.org/guide/built-ins/keep-alive.html)
- [Vue：渲染调试钩子](https://vuejs.org/api/composition-api-lifecycle.html#onrendertracked)
