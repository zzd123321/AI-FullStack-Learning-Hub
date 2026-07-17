---
title: Vue 3 组件通信、依赖注入与可复用组件
description: 从状态所有权出发，设计 Props、Events、v-model、Attributes、Slots 与 Provide Inject 边界
outline: deep
---

# Vue 3 组件通信、依赖注入与可复用组件

[上一课](/frontend/vue3/reactivity-and-effect-management)解释了状态变化后哪些 effect 会重新执行。本课换一个角度：状态和能力应该穿过哪些组件边界？

Vue 提供了很多通信方式：

```text
Props / Events / v-model / Slots / Attributes
Provide / Inject / 组合式函数 / Store
```

真正困难的不是语法，而是选择。如果没有先确定所有权，任何 API 都可能被用成隐式双向绑定或全局状态。

本课围绕课程目录中的三个组件展开：

```text
LessonCatalog             页面拥有筛选词和课程数据
  ├─ BaseField            包装原生输入
  └─ SelectionProvider    拥有当前选择
       ├─ 作用域 Slot      让父级决定列表怎样渲染
       └─ LessonToolbar   深层后代读取选择上下文
```

## 先回答“谁拥有状态”

设计组件 API 前，先回答：

1. 谁创建并保存这份状态？
2. 谁可以直接修改？
3. 谁只需要读取？
4. 子组件传回的是新状态，还是一个用户意图？
5. 依赖只跨直接父子，还是属于整个组件子树？
6. 谁负责最终 DOM 结构和无障碍语义？

典型父子数据流：

```text
父组件拥有 lesson
      │
      ├─ Props：提供当前值
      ▼
子组件展示并产生用户意图
      │
      ├─ Events：通知父组件
      ▼
父组件决定是否以及怎样更新 lesson
```

“Props 向下、事件向上”不是必须背诵的口号，而是让写入路径可追踪。

## 直接父子通信优先使用 Props 与 Events

Props 是组件声明的只读输入：

```ts
interface Props {
  lesson: Lesson
  selected: boolean
}

const props = defineProps<Props>()
```

父组件更新后，新值会流向子组件。子组件不能改写 prop 绑定：

```ts
// Vue 会警告：不能修改只读 Prop。
props.selected = true
```

### 嵌套对象技术上可改，不代表应该改

对象按引用传递，Vue 无法以合理成本阻止所有嵌套修改：

```ts
// 运行时可能执行，但让父组件状态在不明显的位置发生变化。
props.lesson.title = '子组件修改后的标题'
```

更清楚的做法是发送意图：

```ts
const emit = defineEmits<{
  rename: [payload: { id: string; title: string }]
}>()

emit('rename', {
  id: props.lesson.id,
  title: nextTitle
})
```

父组件收到事件后再校验、记录日志、请求服务或更新状态。只有父子本来就是一个紧耦合实现单元时，才考虑共享嵌套可变对象，并应明确记录这一例外。

## 先区分初始值、本地状态与受控值

很多同步问题来自契约名称含糊。

### 初始值只在创建时读取一次

```ts
const props = defineProps<{
  initialPage: number
}>()

const page = ref(props.initialPage)
```

以后父级修改 `initialPage`，本地 `page` 不会自动跟随。这个行为不是响应式失效，而是代码只在 `setup` 初始化时读取了一次。

名称应表达约定：

- `initialPage`：只用于初始化；
- `page`：通常意味着父级持续控制；
- `defaultPage`：没有受控值时采用的默认状态。

### 纯变换不要复制为本地状态

```ts
const normalizedTitle = computed(() =>
  props.title.trim()
)
```

如果本地值只是 Prop 的派生结果，使用 computed 保持单一事实来源，不要用 watcher 在两个 ref 之间同步。

### 编辑草稿需要产品规则

```ts
const draft = reactive({
  title: props.lesson.title
})
```

父级后来切换课程时，不能只问“怎样 watch”，还要先决定：

- 当前没有修改时是否自动重置？
- 有未保存内容时阻止切换、弹出确认，还是暂存？
- 只在 `lesson.id` 变化时重置，还是服务端更新同一课程也覆盖？
- 是否需要版本号处理并发编辑冲突？

watcher 是实现机制，不能替产品做所有权与冲突决策。

## Events 应表达领域意图

```ts
const emit = defineEmits<{
  select: [lessonId: string]
  rename: [payload: { id: string; title: string }]
  remove: [lessonId: string]
}>()
```

事件名和载荷构成组件公共 API。优先发送稳定领域数据：

```ts
emit('select', props.lesson.id)
```

不要让业务父组件依赖子组件内部的 DOM：

```ts
// 不推荐：父组件被迫理解内部按钮和 MouseEvent。
emit('select', mouseEvent)
```

如果子组件把按钮改成菜单项、键盘快捷键或触摸操作，领域事件仍可保持不变。

### 组件事件不会冒泡

Vue 自定义组件事件与原生 DOM 事件不同，只能由直接父组件监听：

```vue
<LessonRow @select="handleSelect" />
```

更上层祖先不会自动收到。需要跨多层时，可以：

- 由中间组件显式转发；
- 使用属于子树的 Provide / Inject；
- 使用组合式上下文；
- 对跨页面状态使用 Store。

不要用隐式全局 Event Bus 模拟组件事件冒泡。

### 声明 Emits 还有运行时意义

显式声明事件不只为了 TypeScript。Vue 会把已声明事件的监听器与 Fallthrough Attributes 区分开，避免监听器意外落到根 DOM。

公共组件应声明承诺发出的所有事件。若把原生 `click` 声明为组件事件，调用方的 `@click` 就监听组件显式发出的 click，而不再自动作为根元素原生监听器；这种 API 必须有意设计。

## `v-model` 是受控值协议

Vue 3.4+ 可用：

```ts
const model = defineModel<string>({
  required: true
})
```

父组件：

```vue
<SearchInput v-model="query" />
```

它概念上展开为：

```vue
<SearchInput
  :model-value="query"
  @update:model-value="query = $event"
/>
```

子组件对应 `modelValue` Prop 与 `update:modelValue` Event。`defineModel` 返回的 ref 让协议更易使用，但没有改变所有权：父组件仍保存绑定值。

### 什么时候适合 model

`v-model` 适合一个组件长期编辑一个受控值，例如输入框、开关、日期选择器。

保存表单、删除课程或发布课程更适合业务事件：

```text
持续同步一个值           → v-model
完成一个业务动作         → save / remove / publish Event
```

不要因为 `v-model` 简短，就给组件每个字段都建立双向协议。

### 命名 model 表达多个独立受控值

```ts
const title = defineModel<string>('title', {
  required: true
})

const published = defineModel<boolean>('published', {
  required: true
})
```

```vue
<LessonFields
  v-model:title="title"
  v-model:published="published"
/>
```

如果这些字段必须一起校验、提交和回滚，一个对象 model 或显式保存事件可能更一致。

### 默认值可能让父子初始状态不同

如果子组件为 `defineModel` 设置默认值，而父级绑定 ref 初始为 `undefined`，子组件已有默认值，父级仍是 `undefined`。

公共受控组件通常应：

- 使用 `required: true`；
- 让父组件完成初始化；
- 或清楚记录“未传绑定值”时的非受控行为。

复杂校验、请求和领域操作也不应藏在 model setter 或 modifier 中。转换应保持局部、同步且可预测。

## Attributes 把原生能力交给正确元素

传给组件、但没有被声明为 Props 或 Events 的属性和监听器叫 Fallthrough Attributes：

```vue
<BaseField
  class="compact"
  type="search"
  aria-label="筛选课程"
  @focus="trackFocus"
/>
```

单根组件默认把这些内容继承到根元素。`class`、`style` 和原生监听器会按 Vue 规则合并。

这对根元素就是 `<button>` 的 BaseButton 很方便，却不一定适合带包装层的输入组件：

```vue
<div class="field-shell">
  <label>...</label>
  <input />
</div>
```

`type`、`disabled`、`aria-describedby` 和 `@focus` 应落到 `input`，不是外层 `div`。

### 显式控制透传目标

```ts
defineOptions({
  inheritAttrs: false
})
```

```vue
<div class="field-shell">
  <input v-bind="$attrs" />
</div>
```

透传目标是组件公共契约的一部分。它会影响键盘、焦点、表单提交和无障碍行为，不能只为了消除警告随便选择元素。

### 多根组件没有自动透传

```vue
<header>...</header>
<main>...</main>
```

Vue 无法判断 Attributes 应落到哪个根节点。如果没有显式绑定，开发环境会警告。正确做法仍是先决定语义目标，再使用 `v-bind="$attrs"`。

### `useAttrs` 不是响应式业务状态

```ts
const attrs = useAttrs()
```

`attrs` 始终反映最新透传内容，但为了性能它不是可用 `watch` 观察的响应式对象。如果组件逻辑确实依赖某个输入，应把它声明为 Prop。属性名保留原始形式，例如 `foo-bar`；监听器通常以 `onClick` 键出现。

可以这样划分：

```text
组件理解并参与业务逻辑的输入  → Props
组件承诺发出的事实或意图      → Emits
原生元素通用能力              → Attributes
```

基础组件通常允许较多原生透传，业务组件则应保持更窄、更语义化的 API。

## Slots 把渲染控制权交给父组件

Props 传数据，Slots 传入一段由父组件定义的渲染内容。

### 默认与具名 Slot 定义稳定区域

```vue
<article class="lesson-card">
  <header>
    <slot name="header" />
  </header>

  <section>
    <slot />
  </section>

  <footer v-if="$slots.actions">
    <slot name="actions" />
  </footer>
</article>
```

父组件：

```vue
<LessonCard>
  <template #header>{{ lesson.title }}</template>
  <p>{{ lesson.summary }}</p>
  <template #actions>
    <button @click="openLesson">打开</button>
  </template>
</LessonCard>
```

Slot 内容在父组件作用域中求值。子组件不能让它直接访问自己的局部状态，必须通过 Slot Props 显式提供。

不要把每个内部标签都设计成 Slot。插槽应对应稳定的布局区域或扩展能力，否则内部 DOM 一调整就破坏公共 API。

### 作用域 Slot 让行为与呈现分离

```vue
<slot
  :lesson="lesson"
  :selected="selected"
  :select="select"
/>
```

父组件决定呈现：

```vue
<template #default="{ lesson, selected, select }">
  <button
    type="button"
    :aria-pressed="selected"
    @click="select"
  >
    {{ lesson.title }}
  </button>
</template>
```

子组件拥有状态与行为，父组件拥有实际标记。这是 Headless / Renderless 组件的基础。

Slot Props 也是公共 API：

```ts
defineSlots<{
  default(props: {
    lesson: Lesson
    selected: boolean
    select(): void
  }): unknown
}>()
```

应传递稳定领域数据和操作，不要暴露内部 DOM、私有 ref 或大量实现细节。

### Slot 还是组合式函数

两者都能复用无界面逻辑，但消费方式不同：

```text
调用方需要在模板中声明式组合一个子树  → Headless 组件 / Slot
调用方只需要状态和函数                 → 组合式函数
逻辑与固定视觉必须一起复用             → 普通组件
```

普通应用代码中，组合式函数通常少一层组件、类型输入输出也更直接。组件库需要跨模板提供行为时，作用域 Slot 更自然。

## Provide / Inject 服务组件子树

假设工具栏位于 Selection Provider 的深层后代：

```text
Provider → Layout → Sidebar → LessonToolbar
```

中间组件不关心选择状态，却被迫逐层传递 Props，这就是 Props Drilling。祖先可提供上下文：

```ts
provide(selectionKey, context)
```

后代注入：

```ts
const context = inject(selectionKey)
```

如果多个祖先提供同一个键，最近的 Provider 生效。这让某个子树可以覆盖主题、表单上下文或服务实现。

直接父子依赖仍优先 Props。Provide / Inject 的价值是让中间组件不必了解与自己无关的子树上下文。

### 用 `InjectionKey` 同步类型契约

```ts
import type { InjectionKey, Ref } from 'vue'

interface LessonSelectionContext {
  selectedId: Readonly<Ref<string | null>>
  select(id: string): void
  clear(): void
}

const lessonSelectionKey = Symbol(
  'lesson-selection'
) as InjectionKey<LessonSelectionContext>
```

Symbol 避免字符串键冲突，`InjectionKey<T>` 让 Provider 和 Consumer 使用同一类型。大型工程通常把键和上下文接口放在独立模块，避免 Consumer 依赖 Provider 组件的实现文件。

### 类型正确也不代表 Provider 一定存在

```ts
const selection = inject(lessonSelectionKey)
// LessonSelectionContext | undefined
```

组件可能被单独渲染、测试或放在错误位置。必需上下文应尽早失败：

```ts
if (!selection) {
  throw new Error(
    'LessonToolbar 必须位于 LessonSelectionProvider 内'
  )
}
```

无条件断言只会把清楚的配置错误推迟到更远位置。可选依赖则可以提供合理默认值。

### 状态在 Provider 修改

```ts
const selectedId = ref<string | null>(null)

function select(id: string): void {
  selectedId.value = id
}

provide(lessonSelectionKey, {
  selectedId: readonly(selectedId),
  select
})
```

Consumer 获得只读状态与命名操作。写规则、校验和日志仍留在状态拥有者。

`inject` 不会自动解包注入的 ref：

```ts
selection.selectedId.value
```

这样 Consumer 与 Provider 保持同一响应式连接；模板顶层绑定仍按模板规则解包。

## Provide / Inject 不是没有边界的 Store

它适合一个组件子树的上下文：

- 表单字段注册与校验上下文；
- Tabs、菜单、选择器等复合组件；
- 主题、语言和服务依赖；
- 父子树紧密协作但层级较深。

Pinia 等 Store 更适合：

- 多个没有共同近祖先的页面共享业务状态；
- 状态要跨路由保留；
- 需要 DevTools 时间线和明确 action；
- 涉及缓存、持久化和跨模块协调。

`app.provide` 可注入 API Client、日志器和插件服务，但会让依赖不再出现在 Props 中。测试必须提供替身，SSR 还要避免把请求级用户状态放进进程级单例。

## 基础组件和业务组件承担不同契约

BaseField 一类基础组件：

- 接近原生 HTML 语义；
- 合理透传 `aria-*`、`data-*` 与原生监听器；
- 保持 label、焦点、disabled 和错误关联；
- model 与事件较通用。

LessonCatalog 一类业务组件：

- API 使用课程、选择、发布等领域词汇；
- 不暴露内部 DOM；
- 通过业务事件表达操作；
- 对 Attributes 透传更加谨慎。

混合两者会得到既不通用、又缺少业务约束的组件。

### 可访问性不是样式附加项

包装原生输入时至少要保持：

- `label for` 指向真实控件 `id`；
- `disabled` 落到可交互元素；
- `aria-describedby` 指向错误说明；
- `aria-invalid` 表达错误状态；
- 键盘和焦点行为遵循原生预期。

如果 `$attrs` 被错误地放到视觉包装层，即使页面看起来正常，组件契约仍然是错的。

## 完整示例：课程选择复合组件

四个组件各自回答一种边界问题。

### BaseField：受控值与原生能力

`inheritAttrs: false` 阻止属性落到包装层，`$attrs` 被显式绑定到真实输入框；`defineModel` 建立受控字符串值。

<<< ../../../examples/frontend/vue3-components/BaseField.vue

### Selection Provider：子树状态拥有者

Provider 拥有选择状态，同时通过作用域 Slot 和 Inject 上下文提供两种消费方式。对外只暴露只读状态与操作。

<<< ../../../examples/frontend/vue3-components/LessonSelectionProvider.vue

### LessonToolbar：深层 Consumer

Toolbar 不必经过每一层 Props 获取选择状态；缺少 Provider 时立即报告清晰错误，并用领域事件把“打开课程”交给页面。

<<< ../../../examples/frontend/vue3-components/LessonToolbar.vue

### LessonCatalog：页面组合与最终所有权

页面拥有课程数据、筛选词和消息，决定列表怎样渲染，并处理 Toolbar 的 `open` 事件。

<<< ../../../examples/frontend/vue3-components/LessonCatalog.vue

沿数据流阅读：

```text
LessonCatalog.query
  ↔ BaseField v-model

SelectionProvider.selectedId
  → Slot Props → LessonCatalog 的列表按钮
  → Inject     → LessonToolbar

LessonToolbar emit('open', lessonId)
  → LessonCatalog.handleOpen
```

## 选择通信方式的顺序

| 问题 | 更合适的机制 |
| --- | --- |
| 直接父组件向子组件提供值 | Props |
| 直接子组件表达用户意图 | Events |
| 长期编辑一个父级受控值 | `v-model` |
| 父级决定子组件某区域怎样渲染 | Slots |
| 深层后代读取同一子树上下文 | Provide / Inject |
| 复用没有固定 UI 的有状态逻辑 | 组合式函数 |
| 跨页面共享业务状态与 action | Store |

机制可以组合，但每一种都应有明确理由。出现通信困难时先回到状态所有权，不要再增加一层同步。

## 从常见问题反推边界

### 父组件数据在没有事件时变化

检查子组件是否直接修改嵌套 Prop。创建本地草稿，或让父组件通过事件执行更新。

### 祖先监听不到后代事件

组件事件不会冒泡。显式转发，或为真正的子树依赖使用 Provide / Inject。

### `v-model` 初始值父子不同

检查子组件是否设置 default，而父级绑定值仍是 `undefined`。让父组件初始化，或清楚设计非受控模式。

### `disabled` 和 `aria-*` 没有作用

Fallthrough Attributes 可能落在包装层。关闭自动继承，并绑定到真正交互元素。

### Slot 一改名大量页面报错

Slot 名和 Slot Props 已成为公共 API。减少实现细节暴露，并为稳定区域和领域能力命名。

### Consumer 在测试中得到 `undefined`

组件依赖 Provider。测试需要提供上下文，必需依赖应在组件中尽早抛出明确错误。

### Provide / Inject 越用越像全局状态

依赖已经超出一个稳定子树，或需要跨路由生命周期和调试能力。评估迁移到 Store。

## Vue 2 经验怎样迁移

- Vue 3 默认组件 model 协议是 `modelValue / update:modelValue`；
- 多个命名 `v-model` 取代许多 `.sync` 用法，但不应滥用；
- Vue 2 的 `$listeners` 已合并到 `$attrs`，原生监听器透传必须重新审查；
- 多根组件不会自动选择 Attributes 目标；
- 自定义事件仍不冒泡，不要使用全局 Event Bus 掩盖依赖；
- Mixins 中的隐式状态来源可迁移为显式组合式函数或类型化上下文；
- Options API 的 Props、Emits、Provide / Inject 仍可用，核心所有权原则没有改变。

## 本课小结

组件复用不是“把代码拆小”，而是建立稳定边界：

1. Props 提供只读输入，Events 把意图交回状态拥有者；
2. 初始值、本地状态和受控值是三种不同契约；
3. `v-model` 是 Prop + update Event 的受控协议，不是共享可变状态；
4. Attributes 应落到语义正确的原生元素；
5. Slots 把渲染控制权交给父组件，Slot Props 也是公共 API；
6. Provide / Inject 服务组件子树，`InjectionKey` 同步类型但不能保证 Provider 存在；
7. Provider 应保留写操作，Consumer 读取只读状态并调用命名操作；
8. 组合式函数、Headless 组件、普通组件和 Store 分别服务不同复用范围。

## 下一课

下一节是[Pinia 状态管理与服务层设计](/frontend/vue3/pinia-state-management-and-service-layer)。本课已经解释何时子树上下文应停留在 Provider，下一课会处理真正跨页面、跨组件树的业务状态：

- Setup Store 中 state、getter 和 action 的职责；
- 为什么网络请求不应直接散落在组件和 Store 细节中；
- Store 解构怎样保持响应式；
- 异步状态、并发请求和错误如何建模；
- SSR 与持久化为什么需要明确实例和数据边界。

## 参考资料

- [Vue 官方指南：Props](https://vuejs.org/guide/components/props.html)
- [Vue 官方指南：Component Events](https://vuejs.org/guide/components/events.html)
- [Vue 官方指南：Component v-model](https://vuejs.org/guide/components/v-model.html)
- [Vue 官方指南：Fallthrough Attributes](https://vuejs.org/guide/components/attrs.html)
- [Vue 官方指南：Slots](https://vuejs.org/guide/components/slots.html)
- [Vue 官方指南：Provide / Inject](https://vuejs.org/guide/components/provide-inject.html)
- [Vue 官方指南：Composables](https://vuejs.org/guide/reusability/composables.html)
- [Vue TypeScript：Typing Provide / Inject](https://vuejs.org/guide/typescript/composition-api.html#typing-provide-inject)
