---
title: Vue 3 Composition API 与组件类型设计
description: 从 Vue 2 Options API 迁移到 script setup、响应式组合与类型安全组件契约
---

# Vue 3 Composition API 与组件类型设计

> 适用环境：Vue 3.5+、TypeScript 7.x、Vite、`@vue/language-tools` 2.1+。你已经有 Vue 2 经验，因此本节不重复模板与指令基础，而是集中讲迁移思维、类型边界和工程实践。

## 1. 学习目标

完成本节后，你应该能够：

- 理解 Composition API 解决的是逻辑组织与复用问题，不只是新语法。
- 理解 `<script setup>` 的编译模型和顶层绑定暴露规则。
- 正确选择 `ref()`、`reactive()` 和 `computed()`。
- 避免响应式对象解构、替换和类型声明中的常见错误。
- 使用类型式 `defineProps()` 与默认值设计 Props。
- 使用 `defineEmits()` 建立事件名与载荷契约。
- 使用 `defineModel()` 描述组件 `v-model`。
- 使用 `defineSlots()`、`useTemplateRef()` 与 `defineExpose()`。
- 区分 `watch()`、`watchEffect()` 和计算属性。
- 把副作用清理放进正确的组件生命周期。
- 设计职责清晰、可复用、可测试的组合式函数。

## 2. 前置知识

建议先掌握：

- Vue 2 Options API、Props、事件、`v-model` 与生命周期。
- TypeScript 对象、联合、泛型和模块边界。
- JavaScript 闭包、异步函数与事件循环基础。

上一节：[TypeScript 工程配置与模块边界](/frontend/typescript/project-configuration-and-module-boundaries)

## 3. 从 Options API 到 Composition API

Vue 2 常按选项类别组织代码：

```js
export default {
  data() {},
  computed: {},
  watch: {},
  methods: {},
  mounted() {}
}
```

一个业务功能可能散落在五个选项中。Composition API 允许按业务能力组织：

```ts
const lessonDraft = useLessonDraft()
const autosave = useAutosave(lessonDraft)
const permissions = useLessonPermissions()
```

核心变化不是“把 `data` 改成 `ref`”，而是把状态、派生值、副作用和操作聚合在同一个逻辑单元中。

## 4. Composition API 不会淘汰 Options API

Vue 3 同时支持两种 API。Options API 仍适合：

- 逻辑简单的组件。
- 维护稳定的 Vue 2 风格团队代码。
- 不需要复杂逻辑复用的页面。

Composition API 更适合：

- 同一业务能力涉及多个状态与生命周期。
- 逻辑需要跨组件复用。
- TypeScript 推断和模块组织要求较高。
- 大型组件需要按功能拆分，而不是按选项拆分。

迁移不必一次性重写全部组件，但同一组件内应保持可理解的组织方式。

## 5. `setup()` 的执行时机

组件每创建一个实例，`setup()` 逻辑会执行一次。闭包中的局部状态属于当前组件实例：

```ts
export default {
  setup() {
    const count = ref(0)
    return { count }
  }
}
```

模块顶层状态则会被所有组件实例共享：

```ts
const sharedCount = ref(0)

export function useSharedCount() {
  return { sharedCount }
}
```

将状态移到模块顶层前，必须明确它是否应成为单例；SSR 中还需避免跨请求共享用户数据。

## 6. 什么是 `<script setup>`

```vue
<script setup lang="ts">
import { ref } from 'vue'

const count = ref(0)
</script>

<template>
  <button @click="count++">{{ count }}</button>
</template>
```

`<script setup>` 是单文件组件的编译期语法糖。顶层变量、函数和导入可以直接在模板中使用，不需要手写 `return`。

它的内容仍会进入组件的 `setup()` 作用域，而不是只执行一次的普通模块初始化代码。

## 7. 编译宏不是普通导入

以下 API 是编译宏：

- `defineProps()`
- `defineEmits()`
- `defineModel()`
- `defineSlots()`
- `defineExpose()`
- `withDefaults()`

在 `<script setup>` 中通常不需要从 `vue` 导入。编译器会识别并转换它们。

宏参数会被提升到模块作用域，因此不能随意引用仅在 `setup` 局部创建的变量。把宏当普通运行时函数理解，会造成错误的执行时机假设。

## 8. `ref()`：单值与可替换值

```ts
const count = ref(0)
// Ref<number>

const selectedId = ref<string | null>(null)
```

在脚本中通过 `.value` 读写：

```ts
count.value++
selectedId.value = 'lesson-1'
```

在模板中，顶层 ref 会自动解包：

```vue
<p>{{ count }}</p>
```

`ref` 适合原始值、需要整体替换的对象、异步结果和可空引用。

## 9. 不要忘记 `ref` 的可空状态

```ts
const lesson = ref<Lesson | null>(null)
```

加载完成前它确实可能为空。不要通过不真实的断言消除：

```ts
// 不推荐
const lesson = ref<Lesson>({} as Lesson)
```

更可靠的方式是保留 `null`，在模板使用条件渲染，在脚本使用守卫或可选链。

如果泛型没有初始值：

```ts
const page = ref<number>()
// Ref<number | undefined>
```

## 10. `reactive()`：对象状态

```ts
const form = reactive({
  title: '',
  durationMinutes: 60,
  published: false
})
```

读取和修改属性不需要 `.value`：

```ts
form.title = 'Vue 3 Composition API'
```

`reactive()` 返回 Proxy，并对嵌套对象进行深层响应式转换。它适合多个字段经常一起操作、对象身份保持稳定的状态。

## 11. 优先让 `reactive()` 推断

```ts
interface LessonForm {
  title: string
  durationMinutes: number
  published: boolean
}

const form: LessonForm = reactive({
  title: '',
  durationMinutes: 60,
  published: false
})
```

通常直接从初始对象推断即可。Vue 官方不建议给 `reactive<SomeType>()` 直接传泛型，因为返回类型还包含嵌套 ref 解包规则，与泛型输入不完全相同。

需要约束形状时，可以给变量标注接口或让初始化表达式使用 `satisfies`。

## 12. 不要整体替换 `reactive` 对象

```ts
let form = reactive({ title: '' })

// 不推荐：旧 Proxy 的订阅关系被丢弃
form = reactive({ title: '新标题' })
```

更可靠的选择：

- 使用 `Object.assign(form, next)` 更新同一 Proxy。
- 如果业务经常整体替换对象，使用 `ref<Form>(initial)`。

选择依据是状态身份，而不是对象有几个字段。

## 13. 解构会丢失响应式连接

```ts
const state = reactive({ count: 0 })
const { count } = state
```

此处 `count` 是普通数字，不会随 `state.count` 更新。需要将属性转为 ref 时：

```ts
const { count } = toRefs(state)
```

或直接在计算和模板中使用 `state.count`。不要为了少写前缀破坏响应式来源的可读性。

## 14. Props 解构是一个特殊情况

Vue 3.5 中，`<script setup>` 对 `defineProps()` 的响应式解构提供编译支持：

```ts
interface Props {
  title: string
  pageSize?: number
}

const {
  title,
  pageSize = 20
} = defineProps<Props>()
```

这里的 `title` 由编译器保持响应式。它不是说所有 `reactive()` 对象都能安全普通解构，也不是旧版本 Vue 的通用行为。

团队需要明确最低 Vue 与语言工具版本，避免不同开发环境产生不同理解。

## 15. `computed()`：声明派生状态

```ts
const isValid = computed(() =>
  form.title.trim().length > 0 &&
  form.durationMinutes > 0
)
```

计算属性会追踪 getter 读取的响应式依赖，并缓存结果。它应尽量保持纯粹：

- 不发送请求。
- 不修改其他状态。
- 不操作 DOM。
- 不依赖不可预测的外部可变值。

类型通常可从返回值推断；复杂公共 API 可以显式写 `computed<boolean>()`。

## 16. 可写计算属性

```ts
const fullName = computed({
  get: () => `${firstName.value} ${lastName.value}`,
  set: value => {
    const [first = '', last = ''] = value.split(' ')
    firstName.value = first
    lastName.value = last
  }
})
```

可写计算适合双向适配已有状态，不应成为隐藏复杂写操作的通道。涉及校验、异步保存或多个领域动作时，显式方法更清晰。

## 17. `watch()`：明确来源与前后值

```ts
watch(
  () => form.title,
  (title, previousTitle) => {
    console.log(previousTitle, '->', title)
  }
)
```

监听 `reactive` 属性时要传 getter，不能直接传当下的普通值：

```ts
// 错误思路：form.title 在调用时只是 string
// watch(form.title, callback)
```

`watch` 适合来源明确、需要新旧值、需要控制首次执行或深度的副作用。

## 18. `watchEffect()`：自动收集依赖

```ts
watchEffect(() => {
  document.title = `${form.title} - 编辑课程`
})
```

同步执行期间读取的响应式值会成为依赖。它适合依赖关系与副作用代码紧密、无需旧值的场景。

如果副作用读取很多状态或执行异步逻辑，自动依赖可能变得难以审查，此时 `watch` 更明确。

## 19. 异步监听必须处理过期结果

用户快速切换课程时，旧请求可能晚于新请求返回。监听清理函数可以取消或忽略过期任务：

```ts
watch(selectedId, async (id, _oldId, onCleanup) => {
  if (!id) return

  const controller = new AbortController()
  onCleanup(() => controller.abort())

  await fetch(`/api/lessons/${id}`, {
    signal: controller.signal
  })
})
```

仅依靠“最后一次赋值”可能造成竞态条件。类型正确不能代替并发控制。

## 20. 生命周期钩子

```ts
onMounted(() => {
  window.addEventListener('online', handleOnline)
})

onBeforeUnmount(() => {
  window.removeEventListener('online', handleOnline)
})
```

生命周期注册应在 `setup` 的同步阶段完成，让 Vue 能把钩子关联到当前组件实例。

定时器、事件监听、观察器和外部订阅必须清理。组件卸载并不会自动了解所有第三方副作用。

## 21. 类型式 Props

```ts
interface Props {
  lesson: Lesson
  readonly?: boolean
  autosaveDelay?: number
}

const props = defineProps<Props>()
```

类型式声明简洁并有良好推断。编译器会尝试生成等价的运行时 Props 声明。

不能同时向同一个 `defineProps()` 传运行时对象和类型泛型。整个 Props 对象使用需要完整类型分析的复杂条件类型时，AST 转换仍有限制；单个属性类型可以更复杂。

## 22. Props 是只读输入

```ts
// 不应修改父组件输入
// props.lesson.title = '新标题'
```

顶层 Props 是只读的，但嵌套对象仍可能被 JavaScript 修改。子组件不应利用这一点改变父级所有权状态。

编辑器组件通常：

1. 从 Props 创建本地草稿。
2. 用户修改草稿。
3. 保存时通过事件提交新值。

这比直接双向修改复杂对象更容易追踪。

## 23. Props 默认值

Vue 3.5 可使用响应式 Props 解构：

```ts
const {
  readonly = false,
  autosaveDelay = 800
} = defineProps<Props>()
```

也可以使用：

```ts
const props = withDefaults(defineProps<Props>(), {
  readonly: false,
  autosaveDelay: 800
})
```

旧式默认值中，可变数组和对象应使用工厂函数，避免组件实例共享同一引用。团队应统一项目版本下的推荐写法。

## 24. 类型式 Emits

推荐使用具名元组表达事件载荷：

```ts
const emit = defineEmits<{
  save: [lesson: LessonDraft]
  cancel: []
  invalid: [errors: readonly string[]]
}>()
```

```ts
emit('save', draft)
emit('cancel')
```

事件名、参数数量和类型都会检查。事件是组件公共 API，应使用业务语义，而不是把内部所有点击原样向上传播。

## 25. 运行时 Emits 校验

运行时声明可以提供校验函数：

```ts
const emit = defineEmits({
  save: (lesson: LessonDraft) =>
    lesson.title.trim().length > 0
})
```

类型式声明主要提供编译期约束。来自表单、接口或外部 JavaScript 的值仍需运行时验证，不能把 TypeScript 类型当作输入校验器。

## 26. `defineModel()` 与组件 `v-model`

```ts
const title = defineModel<string>('title', {
  required: true
})
```

它声明名为 `title` 的 model prop 与对应 `update:title` 事件。模板中可直接：

```vue
<input v-model="title" />
```

父组件使用：

```vue
<LessonEditor v-model:title="title" />
```

`defineModel()` 是 Vue 3.4+ 编译宏。它适合真正的双向组件值，不应把所有 Props 都改造成 model。

## 27. Model 默认值的同步风险

如果子组件 model 有默认值，而父组件传入的 ref 初始为 `undefined`，父子初值可能暂时不同步。公共组件应优先：

- 明确 `required`。
- 让父组件初始化值。
- 或清晰记录默认值与同步行为。

双向绑定减少模板样板，但没有消除状态所有权问题。

## 28. 类型式 Slots

```ts
defineSlots<{
  default(props: {
    lesson: Lesson
    dirty: boolean
  }): unknown
  actions(props: {
    save(): void
    saving: boolean
  }): unknown
}>()
```

Slots 是父组件提供的渲染函数。为 Slot Props 建立类型，可以让父组件模板获得正确提示。

Slot 内容仍在父组件作用域求值；子组件只负责提供 slot props，不会获得父组件的局部变量。

## 29. DOM 事件类型

```ts
function handleInput(event: Event) {
  const input = event.currentTarget as HTMLInputElement
  form.title = input.value
}
```

`EventTarget` 本身没有 `value`。优先使用 `currentTarget` 表达监听器绑定元素，并在边界处做受控断言。

模板中简单的 `v-model` 通常比手写输入事件更直接；复杂解析与校验才需要独立处理器。

## 30. 模板引用

Vue 3.5 与当前语言工具可推断静态模板引用，也可显式指定：

```ts
const titleInput = useTemplateRef<HTMLInputElement>('titleInput')

onMounted(() => {
  titleInput.value?.focus()
})
```

模板：

```vue
<input ref="titleInput" />
```

挂载前或被 `v-if` 移除后，元素引用可能为 `null`，因此需要可选链或守卫。

## 31. 组件引用与 `defineExpose()`

`<script setup>` 组件默认是封闭的。只在确有命令式需求时暴露最小接口：

```ts
function focusTitle() {
  titleInput.value?.focus()
}

defineExpose({ focusTitle })
```

父组件可通过组件模板引用调用该方法。不要暴露整个内部表单或大量方法，否则会破坏组件封装。

## 32. 组合式函数的基本形态

组合式函数通常以 `use` 开头，并在同步调用阶段注册响应式依赖和生命周期：

```ts
export function useOnlineStatus() {
  const online = ref(navigator.onLine)

  const update = () => {
    online.value = navigator.onLine
  }

  onMounted(() => window.addEventListener('online', update))
  onBeforeUnmount(() => window.removeEventListener('online', update))

  return { online: readonly(online) }
}
```

只读返回值能限制调用方绕过组合式函数提供的操作直接修改状态。

## 33. 组合式函数输入

如果输入可能是普通值、ref 或 getter，可以使用 Vue 提供的标准归一化工具，而不是自行发明联合处理：

```ts
function useLesson(id: MaybeRefOrGetter<string>) {
  watchEffect(() => {
    const currentId = toValue(id)
    // 根据 currentId 加载
  })
}
```

公共组合式函数应明确：

- 输入是否响应式。
- 何时开始副作用。
- 如何取消。
- 返回状态是否允许外部修改。
- 错误如何表达。

## 34. 组合式函数返回 ref

推荐返回包含多个 ref 的普通对象：

```ts
return {
  data,
  error,
  loading,
  reload
}
```

调用方可以安全解构，ref 仍保持响应式：

```ts
const { data, loading } = useLesson(id)
```

如果直接返回 `reactive` 对象，普通解构会失去响应式连接。返回策略是 API 设计的一部分。

## 35. 不要按生命周期机械拆组合式函数

以下拆分缺少业务内聚：

```text
useMountedLogic()
useWatchLogic()
useComputedLogic()
```

更好的边界是：

```text
useLessonDraft()
useAutosave()
useKeyboardShortcuts()
```

每个组合式函数内部可以包含自己的状态、计算、监听和清理。组织单位是能力，不是 API 类别。

## 36. 完整示例：课程编辑器

页面直接导入完整 Vue 单文件组件源码。

### 编辑器组件

```text
examples/frontend/vue3-composition/LessonEditor.vue
```

<<< ../../../examples/frontend/vue3-composition/LessonEditor.vue

### 父级工作区

```text
examples/frontend/vue3-composition/LessonWorkspace.vue
```

<<< ../../../examples/frontend/vue3-composition/LessonWorkspace.vue

示例包含：

1. 类型式 Props、Emits 与 Slots。
2. 命名 `v-model`。
3. `reactive` 本地草稿和 `computed` 校验。
4. `watch` 同步 Props 并调度自动保存。
5. 定时器清理与异步保存状态。
6. `useTemplateRef` 和最小 `defineExpose` 接口。
7. 父组件对数据所有权和保存结果的管理。

## 37. 常见迁移错误

### 把所有 `data` 字段机械改成 `ref`

先按业务能力重新分组，再选择 `ref` 或 `reactive`。

### 把组合式函数当 Mixins

组合式函数使用显式参数和返回值，不应依赖隐式 `this`、同名合并和神秘覆盖顺序。

### 在 `setup` 中寻找 `this`

Composition API 通过闭包访问局部绑定，不使用 Options API 组件实例 `this`。

### 修改 Props 或嵌套 Props

Props 属于父组件。编辑应使用本地草稿、事件或明确的 model 契约。

### 普通解构 `reactive` 对象

会拿到非响应式当前值。使用对象属性、`toRef()` 或 `toRefs()`。

### 用 `watch` 维护可计算状态

能由现有状态纯粹推导的值优先使用 `computed`，避免双重事实来源。

### 忘记清理副作用

定时器、DOM 监听、网络请求和第三方订阅都应有清理策略。

### 过度使用 `defineExpose`

组件引用形成命令式耦合。优先 Props、Events、Slots 和 model。

## 38. 工程最佳实践

- 按业务能力组织组件逻辑，而不是按 API 类型排列代码。
- 保持 Props 向下、事件向上的数据流。
- 原始值和可替换对象用 `ref`，稳定对象状态可用 `reactive`。
- 派生状态使用纯 `computed`，副作用使用 `watch` 或 `watchEffect`。
- 异步监听处理取消、过期结果和卸载清理。
- Props、Emits、Slots 与 Model 都视为公共组件 API。
- 类型式宏保持简单，复杂领域类型放入独立模块。
- 模板引用和暴露方法保持最小。
- 组合式函数返回 ref 与明确操作，避免隐式共享可变状态。
- 外部数据仍从 `unknown` 经过运行时验证。
- SFC 使用 `vue-tsc` 与当前 Vue 语言工具检查，而不是只依赖转译成功。

## 39. 与 Vue 2 的关键对照

| Vue 2 常见方式 | Vue 3 Composition API |
| --- | --- |
| `data()` | `ref()` / `reactive()` |
| `computed` 选项 | `computed()` |
| `watch` 选项 | `watch()` / `watchEffect()` |
| `methods` | 普通函数 |
| `mounted` | `onMounted()` |
| `beforeDestroy` | `onBeforeUnmount()` |
| Mixins | 组合式函数 |
| `this.$emit` | `defineEmits()` 返回的 `emit` |
| `model` 配置 | `defineModel()` 或 prop + emit |

对照表帮助定位 API，但不应据此逐行翻译旧组件。真正的迁移收益来自重新划分逻辑边界。

## 40. 面试知识

### `ref` 和 `reactive` 如何选择？

`ref` 适合原始值、可空值和需要整体替换的对象；`reactive` 适合身份稳定、按属性修改的对象状态。团队一致性与 API 边界同样重要。

### 为什么解构 `reactive` 会丢失响应式？

响应式追踪发生在 Proxy 属性访问上。普通解构只复制当前属性值，之后不再经过 Proxy。

### `computed` 与 `watch` 有什么区别？

`computed` 声明并缓存派生值，应保持纯粹；`watch` 在来源变化后执行副作用，可获得新旧值并控制执行策略。

### `defineProps` 是运行时函数吗？

在 `<script setup>` 中它是编译宏，会被 SFC 编译器处理，不需要普通导入。

### `defineModel` 做了什么？

它声明 model prop 和对应 `update:*` 事件，并返回可在组件内读写的 ref。

### 组合式函数与 Mixins 有何区别？

组合式函数依赖和返回值显式、来源可追踪、命名冲突可由局部变量解决；Mixins 通过组件选项隐式合并。

## 41. 本节总结

- Composition API 按业务能力组织状态、派生值、副作用和操作。
- `<script setup>` 是编译期语法，顶层绑定可直接用于模板。
- `ref` 在脚本中使用 `.value`，模板顶层会自动解包。
- `reactive` 返回 Proxy，普通解构和整体替换会破坏连接。
- `computed` 用于纯派生状态，`watch` 和 `watchEffect` 用于副作用。
- Props 是只读输入，编辑场景应使用本地草稿或明确 model。
- 类型式 Emits 用具名元组表达事件载荷。
- `defineModel`、`defineSlots`、`useTemplateRef` 改善组件契约与工具提示。
- 生命周期副作用必须清理，异步监听必须处理竞态。
- 组合式函数以业务能力为边界，并明确响应式输入和状态所有权。
- Vue 类型不能代替接口数据和用户输入的运行时验证。

## 42. 下一步学习

下一节建议学习：**Vue 3 响应式原理与副作用管理**。

届时将深入：

- Proxy、依赖收集和触发更新的核心模型。
- `ref` 的包装与自动解包边界。
- 深层、浅层响应式和 `readonly`。
- `watch` 的刷新时机、深度与清理机制。
- 响应式身份、性能与第三方状态集成。

## 43. 参考资料

- [Vue 官方指南：TypeScript with Composition API](https://vuejs.org/guide/typescript/composition-api.html)
- [Vue API：`<script setup>`](https://vuejs.org/api/sfc-script-setup.html)
- [Vue 官方指南：Composition API FAQ](https://vuejs.org/guide/extras/composition-api-faq.html)
- [Vue 官方指南：Reactivity Fundamentals](https://vuejs.org/guide/essentials/reactivity-fundamentals.html)
- [Vue 官方指南：Computed Properties](https://vuejs.org/guide/essentials/computed.html)
- [Vue 官方指南：Watchers](https://vuejs.org/guide/essentials/watchers.html)
- [Vue 官方指南：Composables](https://vuejs.org/guide/reusability/composables.html)
- [Vue 官方指南：Component `v-model`](https://vuejs.org/guide/components/v-model.html)
- [Vue 官方指南：Slots](https://vuejs.org/guide/components/slots.html)
