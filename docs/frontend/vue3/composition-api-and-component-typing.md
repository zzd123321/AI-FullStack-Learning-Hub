---
title: Vue 3 Composition API 与组件类型设计
description: 从 Vue 2 的课程编辑器出发，循序渐进理解 script setup、ref、reactive、computed、Props、Emits 和组合式逻辑
outline: deep
---

# Vue 3 Composition API 与组件类型设计

你已经写过几年 Vue 2，`data`、`computed`、`methods` 和 `watch` 应该都不陌生。学习 Vue 3 时，最容易走进的误区是把 Composition API 当成一张 API 替换表：

```text
data      → ref / reactive
computed  → computed()
methods   → 普通函数
mounted   → onMounted()
```

这些对应关系没有错，却没有解释 Composition API 为什么存在。

这节课会一直围绕“课程编辑器”展开。我们先看 Vue 2 组件为什么会越来越难维护，再用 Vue 3 重新组织同一份业务逻辑。重点不是背新函数，而是建立一条连贯主线：

```text
业务状态 → 派生状态 → 用户操作 → 组件边界 → 可复用逻辑
```

> 第一次阅读先完成基础部分和完整示例。进阶部分用于处理真实项目中的边界，原理部分用于解释这些 API 为什么这样工作。

## 本课在学习路线中的位置

```text
Vue 2 Options API 经验
          ↓
本课：用 Composition API 组织一个完整组件
          ↓
下一课：深入响应式追踪与副作用管理
          ↓
后续：组件通信、Pinia、路由、表单与测试
```

学完本课，你应该能够：

- 解释 Composition API 改变的是逻辑组织方式，而不只是语法；
- 使用 `<script setup>` 编写 TypeScript 单文件组件；
- 根据状态的使用方式选择 `ref`、`reactive` 和 `computed`；
- 使用类型式 Props 和 Emits 建立清楚的父子组件契约；
- 把 Props 复制为本地草稿，而不是直接修改父组件数据；
- 判断一段逻辑应该留在组件中，还是提取成组合式函数；
- 初步解释 `ref`、Proxy 和依赖追踪之间的关系。

## 从一个 Vue 2 组件开始

假设课程编辑器包含三个功能：

1. 编辑标题和时长；
2. 根据表单内容计算校验错误；
3. 保存时把草稿交给父组件。

在 Options API 中，逻辑通常按 API 类型分开放置：

```js
export default {
  props: {
    lesson: Object
  },

  data() {
    return {
      draft: {
        title: this.lesson.title,
        durationMinutes: this.lesson.durationMinutes
      },
      saving: false
    }
  },

  computed: {
    errors() {
      // 表单校验逻辑
    }
  },

  methods: {
    async save() {
      // 保存逻辑
    }
  }
}
```

小组件没有明显问题。可是加入自动保存、权限、键盘快捷键和离开页面确认后，同一个功能会散落在 `data`、`computed`、`watch`、`methods` 和生命周期中。

Composition API 允许我们按“业务能力”把相关代码放在一起：

```ts
const draft = reactive(/* 表单状态 */)
const errors = computed(/* 表单校验 */)

function save() {
  // 保存操作
}
```

以后还可以继续提取：

```ts
const { draft, errors, save } = useLessonDraft(lesson)
```

这才是核心变化：从“代码属于哪一种 Vue 选项”，转向“代码共同完成哪一种业务能力”。

---

## 第一部分：基础——完成一个可工作的组件

### `<script setup>` 是更简洁的 `setup`

最小的 Vue 3 单文件组件可以这样写：

```vue
<script setup lang="ts">
import { ref } from 'vue'

const count = ref(0)

function increment(): void {
  count.value++
}
</script>

<template>
  <button @click="increment">
    点击次数：{{ count }}
  </button>
</template>
```

这里先注意三个事实：

- `lang="ts"` 让脚本区域使用 TypeScript；
- 脚本顶层声明的变量和函数可以直接在模板中使用；
- 不需要再写 `components`、`methods`，也不需要手动 `return`。

`<script setup>` 不是浏览器原生语法。Vue 的单文件组件编译器会把它转换成组件的 `setup()` 逻辑。

可以先把它理解为：

```text
<script setup> 顶层代码
            ↓ Vue 编译器转换
组件每次创建实例时执行的 setup 逻辑
```

### 用 `ref` 保存一个值

Vue 必须知道状态何时变化，才能更新依赖它的模板。普通变量做不到这一点：

```ts
let count = 0

function increment() {
  count++
  // JavaScript 值变了，但 Vue 没有收到响应式通知。
}
```

使用 `ref` 后，Vue 会得到一个可以追踪的容器：

```ts
const count = ref(0)
```

TypeScript 会根据初始值推断它是 `Ref<number>`。在脚本中通过 `.value` 访问：

```ts
count.value++
```

在模板中，顶层 ref 会自动解包，因此写 `count`，不是 `count.value`：

```vue
<p>{{ count }}</p>
```

为什么脚本和模板写法不同？脚本是普通 JavaScript，需要明确访问容器里的值；模板由 Vue 编译，可以替我们完成常见的解包。

`ref` 很适合独立状态：

```ts
const saving = ref(false)
const selectedId = ref<string | null>(null)
const message = ref('')
```

### 用 `reactive` 组织一组相关字段

表单中的标题、时长和发布状态经常一起操作，可以放在一个响应式对象中：

```ts
const draft = reactive({
  title: '',
  durationMinutes: 60,
  published: false
})
```

读写属性时不需要 `.value`：

```ts
draft.title = 'Vue 3 Composition API'
draft.durationMinutes = 120
```

`reactive()` 返回一个 Proxy。对属性的读取和修改会经过这个 Proxy，Vue 因而能够追踪哪些代码读取了哪些属性，以及属性何时变化。

第一次学习可以使用这条简单规则：

```text
独立的单个值                  → ref
会作为一个整体替换的对象        → ref
按属性修改的一组稳定对象字段     → reactive
```

这不是绝对语法规则，而是帮助代码表达状态使用方式。

### 用 `computed` 表达派生状态

表单是否有效，可以由表单字段计算出来：

```ts
const valid = computed(() =>
  draft.title.trim().length > 0
  && draft.durationMinutes > 0
)
```

`valid` 不应该再用一个 `ref(false)` 单独维护。否则修改表单后还必须记得同步它，应用里就出现了两份事实来源。

可以这样区分：

```text
用户或程序直接修改的事实      → ref / reactive
能从已有事实计算出来的结果     → computed
```

计算属性的 getter 应尽量保持纯粹：读取状态并返回结果，不在里面发送请求、修改其他状态或操作 DOM。

在脚本中读取计算结果仍需 `.value`：

```ts
if (valid.value) {
  console.log('可以保存')
}
```

模板中同样会自动解包：

```vue
<button :disabled="!valid">保存</button>
```

### `methods` 变成普通函数

Composition API 不需要专门的 `methods` 选项：

```ts
function resetDraft(): void {
  draft.title = ''
  draft.durationMinutes = 60
  draft.published = false
}
```

普通函数可以直接读取同一 `setup` 作用域中的状态。这依靠的是 JavaScript 闭包，不再依赖组件实例上的 `this`。

这带来两个直接变化：

- 不需要担心 `this` 指向；
- 函数依赖哪些状态，可以从词法作用域中看出来。

### Props 是父组件给出的输入

课程编辑器需要父组件传入课程：

```ts
interface Lesson {
  readonly id: string
  readonly title: string
  readonly durationMinutes: number
  readonly published: boolean
}

const props = defineProps<{
  lesson: Lesson
}>()
```

`defineProps` 建立组件的输入契约。父组件漏传 `lesson`，或者字段类型不匹配，模板类型工具就能够发现问题。

Props 的数据所有权属于父组件。不要这样修改：

```ts
// 不应该：子组件绕过父组件直接修改它拥有的数据。
props.lesson.title = '新标题'
```

即使嵌套对象在 JavaScript 运行时可能允许修改，这种做法仍会让数据来源难以追踪。

编辑器通常创建本地草稿：

```ts
const draft = reactive({
  title: props.lesson.title,
  durationMinutes: props.lesson.durationMinutes,
  published: props.lesson.published
})
```

现在用户编辑的是子组件拥有的草稿，不是父组件的原对象。

### Emits 把用户意图交回父组件

保存时，子组件通过事件提交草稿：

```ts
interface LessonDraft {
  title: string
  durationMinutes: number
  published: boolean
}

const emit = defineEmits<{
  save: [draft: LessonDraft]
}>()

function submit(): void {
  emit('save', {
    title: draft.title.trim(),
    durationMinutes: draft.durationMinutes,
    published: draft.published
  })
}
```

这里的类型声明同时约束：

- 事件名必须是 `save`；
- 事件必须带一个参数；
- 参数必须满足 `LessonDraft`。

父组件接收事件，再决定如何更新自己的数据：

```vue
<LessonEditor :lesson="lesson" @save="handleSave" />
```

形成了一条清楚的数据流：

```text
父组件拥有 lesson
      ↓ Props
子组件创建并编辑 draft
      ↓ save 事件
父组件决定怎样更新 lesson
```

这就是常说的“Props 向下，事件向上”。它的价值不是口号，而是让状态所有权和修改入口容易定位。

---

## 第二部分：进阶——处理真实项目中的边界

### `ref` 和 `reactive` 不是按数据类型二选一

常见说法是“基本类型用 `ref`，对象用 `reactive`”。它适合作为入门提示，但并不完整，因为对象也可以放进 ref：

```ts
const lesson = ref<Lesson | null>(null)

// 请求完成后整体替换。
lesson.value = loadedLesson
```

更可靠的问题是：这个状态怎样变化？

| 状态使用方式 | 更自然的选择 |
| --- | --- |
| 独立的字符串、数字、布尔值 | `ref` |
| 加载前为空、加载后整体替换 | `ref<T \| null>` |
| 保存后用新对象替换旧对象 | `ref<T>` |
| 表单字段长期按属性修改 | `reactive` |
| 需要作为组合式函数返回值安全解构 | 通常返回多个 ref |

团队一致性也很重要。不要仅为了证明某种 API 更高级而混用。

### 不要用空断言伪造“已经加载”

接口请求完成前，课程确实不存在：

```ts
const lesson = ref<Lesson | null>(null)
```

不要伪造一个类型正确但业务无效的对象：

```ts
// 不推荐：运行时仍是一个缺少字段的空对象。
const lesson = ref<Lesson>({} as Lesson)
```

保留 `null` 后，模板使用条件渲染：

```vue
<LessonEditor v-if="lesson" :lesson="lesson" />
<p v-else>正在加载课程…</p>
```

类型在这里迫使界面正视真实的加载状态。

### 不要整体替换 `reactive` 变量

下面的写法会让变量指向一个新的 Proxy：

```ts
let draft = reactive({ title: '' })

// 不推荐：依赖旧 Proxy 的代码不会自动改为追踪新对象。
draft = reactive({ title: '新标题' })
```

如果对象身份应该稳定，可以保留 Proxy，只更新属性：

```ts
Object.assign(draft, nextDraft)
```

如果业务天然需要整体替换，开始时就用 ref：

```ts
const draft = ref<LessonDraft>(initialDraft)
draft.value = nextDraft
```

选择 API 的依据仍然是状态变化方式。

### 普通解构可能切断 `reactive` 属性连接

```ts
const state = reactive({ count: 0 })
const { count } = state
```

此时 `count` 只是解构那一刻得到的普通数字。以后修改 `state.count`，这个局部常量不会改变。

原因不是“解构语法不支持 Vue”，而是响应式追踪发生在 Proxy 的属性访问上。解构完成后，后续代码不再访问 `state.count`。

优先保留来源：

```ts
const doubled = computed(() => state.count * 2)
```

确实需要把属性变成独立 ref 时，可以使用 `toRef` 或 `toRefs`：

```ts
const { count } = toRefs(state)
count.value++
```

### Props 草稿还需要考虑重新同步

本课示例只编辑一门固定课程，因此初始化时复制一次 Props 就足够。如果父组件可能在同一个编辑器实例中切换课程，本地草稿还要跟随新的 Props 重置。

```ts
watch(
  () => props.lesson,
  (lesson) => {
    Object.assign(draft, {
      title: lesson.title,
      durationMinutes: lesson.durationMinutes,
      published: lesson.published
    })
  }
)
```

但这会引出新的产品问题：切换课程时，如果当前草稿尚未保存怎么办？直接覆盖可能丢失用户输入。

因此监听只是技术机制，真正要先确定的是业务规则：

```text
没有未保存修改 → 可以重置草稿
存在未保存修改 → 确认、阻止切换或暂存草稿
```

`watch`、清理时机和异步竞态会在下一课系统展开。

### 什么时候提取组合式函数

不要看到三行 Composition API 就立即抽取 `useSomething`。先判断这些代码是否形成一个独立能力：

- 状态、派生状态和操作是否共同解决一个问题？
- 是否会在多个组件复用？
- 提取后输入和输出是否更清楚？
- 是否可以不依赖组件模板单独测试？

例如，课程草稿逻辑可以逐步形成：

```ts
export function useLessonDraft(source: Lesson) {
  const draft = reactive({
    title: source.title,
    durationMinutes: source.durationMinutes,
    published: source.published
  })

  const errors = computed(() => validateLessonDraft(draft))

  function createSnapshot(): LessonDraft {
    return {
      title: draft.title.trim(),
      durationMinutes: draft.durationMinutes,
      published: draft.published
    }
  }

  return { draft, errors, createSnapshot }
}
```

组合式函数与 Mixins 的关键差别是显式性：

```text
Mixins：状态从组件选项合并进来，来源和命名冲突可能不明显
组合式函数：依赖通过参数进入，能力通过返回值离开
```

提取边界应是 `useLessonDraft`、`useAutosave` 这样的业务能力，而不是 `useComputedLogic`、`useMountedLogic` 这样的 API 分类。

### 副作用必须有生命周期

派生状态只计算结果，副作用会改变组件之外的世界，例如：

- 修改 `document.title`；
- 注册窗口事件；
- 启动定时器；
- 请求接口；
- 订阅 WebSocket。

注册外部资源后通常要清理：

```ts
import { onBeforeUnmount, onMounted } from 'vue'

function handleOnline(): void {
  console.log('网络已恢复')
}

onMounted(() => {
  window.addEventListener('online', handleOnline)
})

onBeforeUnmount(() => {
  window.removeEventListener('online', handleOnline)
})
```

组件卸载会停止 Vue 自己关联的响应式监听，但 Vue 无法猜出所有第三方资源应该怎样释放。清理是创建副作用时就要一起设计的责任。

---

## 第三部分：原理——Composition API 为什么这样工作

### `setup` 逻辑属于组件实例

`<script setup>` 中的代码会被编译进组件的 `setup()`。每创建一个组件实例，相关逻辑就执行一次：

```vue
<Counter />
<Counter />
```

两个 `Counter` 各自得到自己的 `count`，因为两个组件实例分别执行了 `ref(0)`。

而模块顶层导出的状态是另一回事：

```ts
// shared-counter.ts
const count = ref(0)

export function useSharedCounter() {
  return { count }
}
```

这里的 `count` 在模块加载时创建，所有调用方共享同一个 ref。它可能正是全局状态的需要，也可能是意外的数据泄漏。SSR 中还要特别避免跨请求共享用户数据。

判断状态放在哪里，本质是在决定它的生命周期和所有者。

### 响应式系统建立“读取者与状态”的联系

可以先用一个简化模型理解：

```text
computed / 组件渲染开始执行
              ↓
读取 ref.value 或 reactive 属性
              ↓
Vue 记录“谁读取了谁”
              ↓
相应值以后发生变化
              ↓
Vue 通知相关计算或组件重新执行
```

真实实现会处理调度、批处理、嵌套 effect 和清理等更多细节，但主线就是“读取时收集依赖，写入时触发依赖”。

这解释了几个常见现象：

- 普通变量变化不会更新模板，因为它没有进入响应式追踪；
- `computed` 只会依赖 getter 实际读取到的响应式值；
- 解构 `reactive` 属性后，后续读取不再经过 Proxy；
- 没有在当前执行路径读取的状态，不会凭空成为依赖。

下一课会深入 Proxy、effect、调度时机和监听清理。

### `ref` 用容器追踪值，`reactive` 用 Proxy 追踪属性

原始值本身不能被 Proxy 拦截。Vue 用带有 `.value` 的对象包装它：

```text
ref(0)
  ↓
{ value: 0 }  ← 概念模型，不是完整内部实现
```

读取和设置 `.value` 时，Vue 可以进行依赖追踪和触发更新。

对象则可以使用 Proxy 拦截属性访问：

```text
原始对象 ← reactive() → 响应式 Proxy
                         ↑
                  组件代码应操作它
```

所以 `reactive(raw) !== raw`。在需要依赖对象身份的 Map、Set 或第三方库边界中，要清楚自己保存的是原始对象还是 Proxy。

### 编译宏不是普通运行时函数

`defineProps` 和 `defineEmits` 在 `<script setup>` 中是编译宏：

```ts
const props = defineProps<Props>()
const emit = defineEmits<Emits>()
```

通常不需要从 `vue` 导入它们。SFC 编译器会识别这些调用，并生成对应的组件选项和运行时代码。

因此要区分两类 API：

```text
ref、reactive、computed  → 从 vue 导入的运行时 API
defineProps、defineEmits → 由 SFC 编译器识别的编译宏
```

类型式声明主要帮助编译器和开发工具建立契约。它不等于运行时验证：如果 Props 最终来自不可信接口，接口数据仍应在进入组件树之前解析和校验。

### 单向数据流让修改路径可以追踪

Props 只读不是为了增加样板代码，而是为了避免同一份状态被多个组件任意修改。

如果父子组件都直接改同一个对象，看到标题变化时很难回答：

- 是父组件请求完成后更新的？
- 是编辑器输入修改的？
- 是另一个兄弟组件修改的？
- 是监听器自动同步的？

使用 Props 和事件后，所有权更加明确：

```text
状态保存在父组件
    ↓ 提供当前值
子组件展示并产生用户意图
    ↓ 发送事件
父组件处理意图并更新状态
```

组件双向绑定 `v-model` 只是对 prop 与 `update:*` 事件的简写，没有消除状态所有权。它会在组件通信课程中详细学习。

---

## 完整示例：课程编辑器

下面的示例只组合本课已经解释过的概念，不再为了展示 API 而额外加入 Slots、模板引用和自动保存。

### 子组件：编辑本地草稿

`LessonEditor` 负责：

1. 接收父组件的课程；
2. 创建本地响应式草稿；
3. 用计算属性产生错误信息和修改状态；
4. 保存时发送普通对象快照。

<<< ../../../examples/frontend/vue3-composition/LessonEditor.vue

### 父组件：拥有并更新课程

`LessonWorkspace` 负责保存真正的课程数据，并处理编辑器发出的 `save` 事件。

<<< ../../../examples/frontend/vue3-composition/LessonWorkspace.vue

阅读完整示例时，可以按这条路线追踪数据：

```text
LessonWorkspace.lesson
          ↓ :lesson
LessonEditor.props.lesson
          ↓ 初始化
LessonEditor.draft
          ↓ 用户编辑、computed 校验
emit('save', snapshot)
          ↓ @save
LessonWorkspace.handleSave
          ↓
替换 LessonWorkspace.lesson
```

注意示例中的注释主要解释“为什么这样设计”，而不是逐行翻译语法。

## 常见问题：从现象定位原因

### 修改了变量，模板却没有更新

```text
检查：变量是不是普通 let，而不是 ref / reactive？
检查：是否把 reactive 属性普通解构成了独立值？
检查：模板读取的是否真是被修改的那份状态？
```

### 脚本中的 ref 得到的不是实际值

```text
原因：ref 是响应式容器
脚本：使用 state.value
模板：顶层 ref 通常会自动解包，使用 state
```

### 父组件数据在没有事件时发生变化

```text
检查：子组件是否修改了 Props 的嵌套对象？
修复：创建本地草稿，通过事件提交快照
```

### `computed` 里的代码造成重复请求或循环更新

```text
原因：把副作用放进了派生计算
修复：computed 只返回结果；请求和外部修改交给明确操作或 watch
```

### 组件里出现很多 `.value`

`.value` 本身不是问题。先看状态是否组织得当，不要为了消除 `.value` 把所有状态塞进一个巨大 `reactive` 对象。清楚的所有权比少写几个字符更重要。

### 抽出组合式函数后更难理解

如果调用方必须同时阅读五个文件才能知道状态从哪里来，抽象可能过早。先保持业务逻辑内聚，等能力边界和复用需求稳定后再提取。

## 本节知识链

### 第一次学习必须掌握

- `<script setup>` 顶层绑定可以直接用于模板；
- `ref` 在脚本使用 `.value`，模板会处理常见解包；
- `reactive` 适合按属性修改的对象状态；
- `computed` 表达从现有状态推导出来的结果；
- Composition API 中的操作就是普通函数；
- Props 属于父组件，子组件通过事件提交意图。

### 第二次阅读再理解

- `ref` 与 `reactive` 应根据状态变化方式选择；
- `reactive` 变量不应随意整体替换；
- 普通解构为什么可能切断 Proxy 属性访问；
- 本地 Props 草稿在来源切换时需要业务同步策略；
- 组合式函数应按业务能力提取。

### 进阶阶段需要建立的原理

- `setup` 状态与模块单例状态具有不同生命周期；
- 响应式系统在读取时收集依赖，在写入时触发更新；
- `ref` 通过容器属性追踪值，`reactive` 通过 Proxy 追踪属性；
- `defineProps` 和 `defineEmits` 是编译宏；
- 单向数据流的核心是明确状态所有权和修改路径。

## 下一课

下一节是[响应式原理与副作用管理](/frontend/vue3/reactivity-and-effect-management)。它会沿着本课留下的问题继续深入：

- Proxy、ref 与 effect 如何建立依赖关系；
- `computed` 为什么能够缓存；
- `watch` 和 `watchEffect` 应该怎样选择；
- 异步请求如何取消过期结果；
- 深层、浅层和只读响应式分别解决什么问题。

Slots、`v-model`、依赖注入和模板引用会放在后续的[组件通信、依赖注入与可复用组件](/frontend/vue3/component-communication-and-reusable-components)中系统学习，不在第一课集中堆叠。

## 参考资料

- [Vue 官方指南：Composition API FAQ](https://vuejs.org/guide/extras/composition-api-faq.html)
- [Vue 官方指南：Reactivity Fundamentals](https://vuejs.org/guide/essentials/reactivity-fundamentals.html)
- [Vue 官方指南：Computed Properties](https://vuejs.org/guide/essentials/computed.html)
- [Vue 官方指南：TypeScript with Composition API](https://vuejs.org/guide/typescript/composition-api.html)
- [Vue 官方 API：`<script setup>`](https://vuejs.org/api/sfc-script-setup.html)
- [Vue 官方指南：Props](https://vuejs.org/guide/components/props.html)
- [Vue 官方指南：Component Events](https://vuejs.org/guide/components/events.html)
- [Vue 官方指南：Composables](https://vuejs.org/guide/reusability/composables.html)
