---
title: React 核心心智模型与 TypeScript 组件设计
description: 从一个课程目录出发，循序渐进理解组件、Props、事件、State 快照、派生数据、状态所有权和组件身份
outline: deep
---

# React 核心心智模型与 TypeScript 组件设计

有 Vue 经验的人学习 React，通常不会被 JSX 或事件绑定难住，真正容易混淆的是状态模型。

在 Vue 里，你习惯修改一个响应式值：

```ts
count.value++
```

在 React 里，你不会修改当前这次渲染中的 `count`，而是请求 React 使用新状态再渲染一次：

```tsx
setCount(count + 1)
```

这两个写法表面相似，背后的模型却不同。如果一开始没有建立“渲染快照”的概念，后面学习 Effect、异步请求和性能优化时会不断遇到闭包旧值、重复同步和冗余状态问题。

本课会一直围绕一个课程目录展开，按照下面的顺序推进：

```text
用组件描述界面
      ↓
用 Props 传入数据
      ↓
用事件表达用户操作
      ↓
用 State 记住会变化的信息
      ↓
从 Props 和 State 计算当前界面
      ↓
明确状态所有者和组件身份
```

> 第一次阅读先完成基础部分和完整示例。进阶部分重点解决 State 更新和 Key，原理部分再解释 Render、Commit 与协调过程。

## 本课在学习路线中的位置

```text
JavaScript、TypeScript 与 Vue 组件经验
                  ↓
本课：React 组件、Props、事件和 State
                  ↓
下一课：Effect、Ref、异步竞态和自定义 Hook
                  ↓
后续：Reducer、Context、路由、表单、性能和测试
```

学完本课，你应该能够：

- 用一句话解释 React 函数组件在做什么；
- 使用 TypeScript 定义组件 Props 和领域回调；
- 使用 `useState` 保存交互状态，并理解 Setter 不会修改当前快照；
- 区分真正的 State 与可以直接计算的派生数据；
- 使用不可变更新修改对象和数组 State；
- 把共享状态放到正确的共同父组件；
- 使用稳定 Key 表达列表实体和组件身份；
- 初步解释 Trigger、Render、Commit 以及渲染纯度。

## 从 Vue 组件到 React 组件

一个 Vue 课程卡片可能写成：

```vue
<script setup lang="ts">
defineProps<{
  title: string
  published: boolean
}>()
</script>

<template>
  <article>
    <h2>{{ title }}</h2>
    <span>{{ published ? '已发布' : '草稿' }}</span>
  </article>
</template>
```

对应的 React 组件是一个普通函数：

```tsx
interface LessonCardProps {
  title: string
  published: boolean
}

function LessonCard({ title, published }: LessonCardProps) {
  return (
    <article>
      <h2>{title}</h2>
      <span>{published ? '已发布' : '草稿'}</span>
    </article>
  )
}
```

可以先建立最简单的一句话模型：

```text
组件函数读取当前 Props 和 State，返回当前界面应该是什么样子。
```

它返回的 JSX 不是直接创建好的 DOM，也不是 HTML 字符串，而是 React 用来描述界面的元素结构。

---

## 第一部分：基础——完成一个可交互课程目录

### 组件是返回 JSX 的函数

React 组件名必须以大写字母开头：

```tsx
function LessonTitle() {
  return <h2>React 核心心智模型</h2>
}
```

使用时像标签：

```tsx
function App() {
  return (
    <main>
      <LessonTitle />
    </main>
  )
}
```

小写名称会被当作浏览器原生元素。`<lessonTitle>` 表示名为 `lessonTitle` 的 DOM 标签，而不是上面的组件。

JSX 与模板最常用的对应关系如下：

| 目的 | Vue Template | React JSX |
| --- | --- | --- |
| 插入表达式 | `{{ title }}` | `{title}` |
| 绑定属性 | `:disabled="saving"` | `disabled={saving}` |
| 监听点击 | `@click="save"` | `onClick={save}` |
| 条件展示 | `v-if="lesson"` | `{lesson ? <Editor /> : null}` |
| 列表展示 | `v-for="item in items"` | `{items.map(item => ...)}` |
| CSS 类名 | `class` | `className` |

JSX 中的 `{}` 接受 JavaScript 表达式，不能直接放 `if`、`for` 这样的语句。复杂判断可以在 `return` 前计算，或提取成函数和组件。

### Props 描述组件需要的输入

课程卡片不应该把标题写死，而应通过 Props 接收：

```tsx
interface LessonCardProps {
  lesson: {
    readonly id: string
    readonly title: string
    readonly published: boolean
  }
}

function LessonCard({ lesson }: LessonCardProps) {
  return (
    <article>
      <h2>{lesson.title}</h2>
      <span>{lesson.published ? '已发布' : '草稿'}</span>
    </article>
  )
}
```

父组件传入数据：

```tsx
<LessonCard lesson={lesson} />
```

Props 是组件本次渲染的只读输入。不要修改它：

```tsx
function LessonCard({ lesson }: LessonCardProps) {
  lesson.title = lesson.title.trim()
  // 错误思路：组件修改了调用方拥有的数据。

  return <h2>{lesson.title}</h2>
}
```

需要格式化时创建局部值：

```tsx
const displayTitle = lesson.title.trim()
```

局部计算不会修改外部数据，也不需要保存成 State。

### 事件处理器表达用户操作

按钮接收的是函数，不是函数调用结果：

```tsx
function SaveButton() {
  function handleClick(): void {
    console.log('用户点击了保存')
  }

  return <button onClick={handleClick}>保存</button>
}
```

下面的写法会在渲染时立即调用：

```tsx
// 错误：传给 onClick 的是 handleClick() 的返回值。
<button onClick={handleClick()}>保存</button>
```

需要传参数时，再包一层函数：

```tsx
<button onClick={() => onSelect(lesson.id)}>
  选择课程
</button>
```

React 使用 camelCase 事件名，如 `onClick`、`onChange`、`onSubmit`。事件处理器适合执行由明确用户操作触发的工作，例如更新 State、提交表单或调用保存接口。

### 用 `useState` 记住交互信息

普通局部变量不能跨渲染保留，也不会请求 React 更新界面：

```tsx
function Counter() {
  let count = 0

  function increment(): void {
    count++
  }

  return <button onClick={increment}>{count}</button>
}
```

使用 State：

```tsx
import { useState } from 'react'

function Counter() {
  const [count, setCount] = useState(0)

  function increment(): void {
    setCount(count + 1)
  }

  return <button onClick={increment}>{count}</button>
}
```

`useState(0)` 返回两个值：

```text
count     当前这次渲染看到的状态快照
setCount  请求 React 安排下一次状态的 Setter
```

命名通常使用 `[something, setSomething]`，这不是语法要求，但能清楚表达二者关系。

调用 Setter 后，React 会安排一次新渲染。当前函数里的 `count` 不会被原地改写：

```tsx
function increment(): void {
  setCount(count + 1)
  console.log(count) // 仍然是当前渲染的旧值。
}
```

先接受这个现象，进阶部分会完整解释 State 快照和更新队列。

### 受控输入把 State 作为当前值

搜索框需要记住用户输入：

```tsx
const [keyword, setKeyword] = useState('')

return (
  <input
    type="search"
    value={keyword}
    onChange={(event) => setKeyword(event.currentTarget.value)}
  />
)
```

数据流是：

```text
State keyword
    ↓ value
输入框显示 keyword
    ↓ 用户输入触发 onChange
setKeyword(nextValue)
    ↓ 新渲染
输入框显示新的 keyword
```

这种输入框称为受控输入。React State 是显示值的来源，因此传入 `value` 时也必须提供能够更新它的 `onChange`。

TypeScript 能从内联处理器推断事件类型。抽成独立函数时可以明确标注：

```tsx
import type { ChangeEvent } from 'react'

function handleChange(event: ChangeEvent<HTMLInputElement>): void {
  setKeyword(event.currentTarget.value)
}
```

优先使用 `currentTarget`，它表示监听器绑定的输入元素。尽早提取字符串、布尔值和 ID 等领域数据，不要把 DOM Event 一层层传到业务逻辑。

### 能计算出来的数据不需要 State

课程列表和搜索词已经存在，那么可见课程可以直接计算：

```tsx
const visibleLessons = lessons.filter((lesson) =>
  lesson.title.toLocaleLowerCase().includes(keyword.toLocaleLowerCase())
)
```

不要再保存一份 `visibleLessons`，然后用 Effect 同步：

```tsx
// 不推荐：visibleLessons 与 lessons、keyword 可能不同步。
const [visibleLessons, setVisibleLessons] = useState(lessons)
```

判断一项数据是否应该成为 State，可以依次问：

1. 它会随交互或时间变化吗？
2. 它能否从现有 Props 和 State 直接算出？
3. 页面重新渲染时是否需要记住它？

如果能直接计算，就在渲染中计算。只有经过性能测量确认计算昂贵时，才考虑缓存；`useMemo` 是性能工具，不是让派生数据保持正确的工具。

### 共享状态放到最近的共同父组件

搜索条件既影响筛选控件，也影响课程列表。如果状态放在 `SearchControls` 内部，兄弟组件 `LessonList` 无法直接得到它。

把状态放到共同父组件：

```text
LessonCatalog 拥有 filters
├── SearchControls 接收 filters 和 onChange
└── LessonList 接收过滤后的 lessons
```

父组件把值和回调都作为 Props 传下去：

```tsx
<SearchControls filters={filters} onChange={setFilters} />
<LessonList lessons={visibleLessons} onSelect={setSelectedId} />
```

子组件调用回调，是在报告“用户想改变什么”；真正的 State 仍由父组件拥有。这与 Vue 中 Props 向下、事件向上的目标相同，只是 React 通常直接传 Callback Prop。

不要把所有 State 都提升到 `App`。只被编辑器使用的输入草稿可以留在编辑器中。合适位置是“所有需要读取或修改它的组件最近的共同父级”。

### 使用 `map` 渲染列表，并提供稳定 Key

```tsx
<ul>
  {lessons.map((lesson) => (
    <li key={lesson.id}>{lesson.title}</li>
  ))}
</ul>
```

Key 帮助 React 判断同级列表中哪个元素对应哪个业务实体。它应该：

- 在同级列表中唯一；
- 来自课程自身的稳定身份；
- 在插入、删除和重排后仍代表同一实体。

不要使用 `Math.random()`。数组下标只适合不会插入、删除、排序、筛选，也没有局部交互状态的静态列表。

`key` 不会作为普通 Prop 传给组件。如果子组件需要 ID，仍需明确传入：

```tsx
<LessonRow key={lesson.id} lessonId={lesson.id} />
```

---

## 第二部分：进阶——真正理解 State 更新

### State 是一次渲染的快照

组件函数每次执行都会得到那次渲染的 Props、State 和事件处理器。考虑：

```tsx
const [count, setCount] = useState(0)

function handleClick(): void {
  setCount(count + 1)
  console.log(count)
}
```

假设当前界面显示 `0`：

1. 当前渲染中的 `count` 是 `0`；
2. `setCount(1)` 请求下一次使用 `1`；
3. 当前处理器继续运行，它所属快照中的 `count` 仍是 `0`；
4. React 随后重新调用组件，新渲染得到 `count === 1`。

Setter 不是给变量赋值。它把更新加入 React 的更新队列。

快照也会被异步回调捕获：

```tsx
function handleSubmit(): void {
  setTimeout(() => {
    alert(`提交时的关键词：${keyword}`)
  }, 1000)
}
```

这里展示的是点击提交那次渲染中的 `keyword`。用户随后输入新内容，不会改写已经创建的旧闭包。

这不一定是 Bug。有时我们正需要“提交时的值”。判断闭包旧值前，先明确业务想读取事件发生时的快照，还是更新队列中的最新状态。

### 基于前值连续更新时使用函数式写法

下面三次更新都读取同一个 `count` 快照：

```tsx
setCount(count + 1)
setCount(count + 1)
setCount(count + 1)
```

如果当前是 `0`，三次都在请求“设置为 `1`”，不是依次得到 `1`、`2`、`3`。

函数式更新接收队列中的前一个结果：

```tsx
setCount((current) => current + 1)
setCount((current) => current + 1)
setCount((current) => current + 1)
```

队列可以理解为：

```text
0 → updater → 1 → updater → 2 → updater → 3
```

适合使用函数式更新的情况：

- 新值依赖旧值；
- 同一交互可能连续排入多次更新；
- 回调可能在较晚时间运行，但需要基于最新队列状态。

如果新值完全来自事件，就可以直接设置：

```tsx
setKeyword(event.currentTarget.value)
```

Updater 必须保持纯粹，只根据传入值返回新值，不在里面请求接口、写日志计数或修改外部对象。

### 对象和数组必须按不可变协议更新

State 中保存对象时，不要修改旧对象：

```tsx
lesson.title = nextTitle
setLesson(lesson)
```

创建新对象：

```tsx
setLesson((current) => ({
  ...current,
  title: nextTitle
}))
```

更新数组中的课程：

```tsx
setLessons((current) =>
  current.map((lesson) =>
    lesson.id === lessonId
      ? { ...lesson, title: nextTitle }
      : lesson
  )
)
```

这里没有修改旧数组和旧课程，而是创建新数组，并只为目标课程创建新对象。

“不可变”是 Props 和 State 的更新协议，不是禁止所有局部修改。渲染中刚创建、尚未共享的临时数组可以正常 `push`；不能修改已经属于某次 Props 或 State 快照的对象。

### State 要保持最小，但必须完整

课程目录真正需要保存：

- 可编辑课程数组；
- 搜索条件；
- 当前选择的课程 ID。

不需要保存：

- 过滤后的课程，因为可以由课程和搜索条件计算；
- 当前课程对象，因为可以通过选择 ID 查找；
- “是否有搜索结果”，因为可以由数组长度判断。

```tsx
const visibleLessons = filterLessons(catalog, filters)
const selectedLesson =
  catalog.find((lesson) => lesson.id === selectedId) ?? null
```

减少冗余 State 会同时减少同步代码、Effect 和不一致状态。

但“最小”不等于把多个独立含义强行压进一个字符串。状态还必须完整表达所有合法情况。例如没有选中课程时，`selectedId` 应明确允许 `null`：

```tsx
const [selectedId, setSelectedId] = useState<string | null>(null)
```

### Props 只会初始化本地 State 一次

编辑器经常从课程标题创建本地草稿：

```tsx
function LessonEditor({ lesson }: LessonEditorProps) {
  const [title, setTitle] = useState(lesson.title)
}
```

`lesson.title` 是这个 State 的初始值，不是持续同步规则。父组件之后传入另一门课程，现有 `title` 不会自动重置。

这不一定错误。必须先定义业务语义：

```text
Props 是始终权威的当前值      → 不要复制，直接渲染或做受控组件
Props 只用于创建编辑草稿      → 本地 State 合理，但要定义何时重置
```

本课使用课程 ID 作为编辑器 Key：

```tsx
<LessonEditor
  key={selectedLesson.id}
  lesson={selectedLesson}
  onSave={saveTitle}
/>
```

切换 ID 后，React 把它视为新的编辑会话，旧组件卸载，新组件使用新课程标题初始化草稿。

### 组件在树中的身份决定 State 是否保留

React 将 State 关联到渲染树中的位置和组件类型，而不是保存在 JSX 标签里。

可以先记住三种情况：

| 位置、类型和 Key | State 结果 |
| --- | --- |
| 同一位置、同一组件类型、同一 Key | 保留 |
| 同一位置但组件类型改变 | 重置 |
| 同一类型但 Key 改变 | 重置 |

Key 不只用于列表，也可以主动表达“这是另一个业务实体”。但不要为了修复所有同步问题随意改变 Key，因为它会重置整个子树，包括输入焦点和其他本地 State。

组件函数应定义在模块顶层：

```tsx
// 不推荐
function Page() {
  function Editor() {
    return <input />
  }

  return <Editor />
}
```

`Page` 每次渲染都会创建新的 `Editor` 函数引用，React 会把它视为不同组件类型，导致子树状态重置。需要数据时使用 Props，而不是在父组件内部定义组件类型。

### Hook 必须保持稳定调用顺序

Hook 只能在 React 组件或自定义 Hook 的顶层调用：

```tsx
// 错误：enabled 改变后，Hook 调用位置会变化。
if (enabled) {
  const [value, setValue] = useState('')
}
```

正确做法是始终调用，再对值或 JSX 做条件判断：

```tsx
const [value, setValue] = useState('')
const visibleValue = enabled ? value : ''
```

React 依靠每次渲染中 Hook 的调用顺序，把每个 `useState` 对应到正确的状态槽。因此 Hook 不能放进条件、循环、事件处理器、嵌套函数或普通工具函数。

自定义 Hook 复用的是状态逻辑，不会自动共享 State。两个组件分别调用同一个 Hook，默认得到两份独立状态。

---

## 第三部分：原理——React 怎样把组件结果变成界面

### 一次更新经过 Trigger、Render 和 Commit

可以把更新过程简化为：

```text
Trigger → Render → Reconcile → Commit → Browser Paint
```

各阶段职责不同：

| 阶段 | 发生什么 |
| --- | --- |
| Trigger | 初次挂载、State 更新、父组件更新或 Context 变化安排工作 |
| Render | React 调用组件函数，计算新的元素树描述 |
| Reconcile | 根据类型、位置和 Key 比较新旧树，决定需要提交的变化 |
| Commit | 把必要变化应用到真实 DOM，并更新 Ref |
| Paint | 浏览器进行样式、布局和绘制 |

组件函数重新执行不等于整个页面 DOM 被删除重建。Render 计算“界面应该是什么”，Commit 才修改真实 DOM，而且通常只修改必要部分。

React 的 Render 与浏览器渲染不是同一个概念。性能分析时要区分组件计算、DOM 修改、布局和绘制。

### 为什么组件渲染必须纯粹

纯渲染意味着：

1. 相同 Props、State 和 Context 应描述相同界面；
2. 不修改 Props、State 或模块共享对象；
3. 不在组件函数执行期间请求接口、写 Storage 或操作 DOM。

错误示例：

```tsx
let renderCount = 0

function LessonTitle({ lesson }: LessonCardProps) {
  renderCount++
  lesson.title = lesson.title.trim()
  document.title = lesson.title

  return <h2>{lesson.title}</h2>
}
```

组件可能因为父组件更新、State 更新、开发检查或调度需要而执行多次。若每次执行都会发送请求或修改共享数据，渲染次数就会改变业务结果。

渲染中可以创建和修改本次调用内部的新对象：

```tsx
function LessonTitles({ lessons }: { lessons: readonly Lesson[] }) {
  const titles: string[] = []

  for (const lesson of lessons) {
    titles.push(lesson.title)
  }

  return <p>{titles.join('、')}</p>
}
```

`titles` 是本次调用新建的局部值，没有修改任何旧快照，所以仍然是纯计算。

用户点击时执行的事件处理器不属于渲染阶段。需要与网络、DOM Widget 或订阅持续同步时才使用 Effect，下一课会专门讨论。

### State 保存在 React 中，不在函数局部变量里

每次调用组件都会创建新的局部变量和事件处理器，但 State 能够保留，因为它由 React 根据组件在树中的身份保存。

可以使用一个概念模型理解：

```text
渲染树中的组件位置
        ↓
React 保存的状态槽 [state 1, state 2, ...]
        ↓ 按 Hook 调用顺序读取
本次组件函数里的局部快照
```

这同时解释了：

- 为什么普通局部变量不能保存交互状态；
- 为什么 Hook 调用顺序不能改变；
- 为什么 Key 或组件类型改变会重置 State；
- 为什么 Setter 只影响下一次渲染。

### JavaScript 闭包保存了那次渲染的变量

每次渲染都会创建新的事件处理函数：

```text
Render A：count = 0，创建 handleClick A
Render B：count = 1，创建 handleClick B
```

`handleClick A` 闭包里的 `count` 永远是 `0`；`handleClick B` 看到的是 `1`。这不是 React 把变量“冻结”了，而是普通 JavaScript 闭包行为与 React 多次调用组件共同产生的结果。

因此不要把所有旧闭包都视为错误。处理方式取决于意图：

- 要保留事件发生时的值：直接使用闭包快照；
- 要基于队列中最新 State 更新：使用函数式 Setter；
- 要同步外部系统：建立正确 Effect 及依赖；
- 要保存不参与渲染的可变值：下一课学习 Ref。

### 协调过程依靠类型、位置和 Key 判断身份

React 比较新旧元素树时，需要判断哪些组件是原来的实体，哪些是新实体。

```text
同一位置 + 同一类型 + 同一 Key
                 ↓
通常保留组件身份、DOM 与 State

类型或 Key 改变
                 ↓
旧身份卸载，新身份挂载，State 重置
```

列表如果使用不稳定 Key，React 就可能把某个课程的输入状态错误地对应到另一门课程。Key 不是性能装饰，而是业务身份提示。

### TypeScript 约束组件边界，不验证运行时数据

TypeScript 适合表达 Props 和 Callback：

```tsx
interface LessonListProps {
  lessons: readonly Lesson[]
  selectedId: string | null
  onSelect: (lessonId: string) => void
}
```

这里清楚说明：

- 列表只读取课程，不修改数组；
- 没有选中项时使用 `null`；
- 子组件报告课程 ID，而不是泄漏鼠标事件。

组件返回类型通常交给 TypeScript 推断即可：

```tsx
function LessonTitle({ title }: { title: string }) {
  return <h2>{title}</h2>
}
```

不必为了写 React 组件而统一使用 `React.FC`。是否接受 `children` 应由 Props 明确表达。

类型声明不会验证接口响应。课程接口仍应在应用边界从 `unknown` 解析为可信的 `Lesson[]`，再传入组件树。

### Strict Mode 用额外检查暴露不纯逻辑

开发环境中的 `<StrictMode>` 会额外执行部分纯函数和 Effect 设置、清理流程，以帮助发现：

- 渲染时修改 Props 或共享数组；
- State Updater 修改旧对象；
- Effect 缺少清理；
- Ref Callback 没有正确释放资源。

它不意味着生产环境每个组件永远固定执行两次，也不应通过删除 Strict Mode 掩盖重复请求。正确方向是把副作用移出渲染，并让外部资源拥有完整清理逻辑。

---

## 完整示例：可筛选、可编辑的课程目录

完整示例只使用本课已经解释过的概念。阅读时先从 `App` 和 `LessonCatalog` 看数据流，再阅读叶子组件。

### 领域类型

课程和筛选条件使用只读字段，提醒组件不要修改旧 Props 或 State 快照。

<<< ../../../examples/frontend/react-core-mental-model/types.ts

### 初始数据与纯筛选函数

筛选规则不依赖 React，可以单独测试和复用。

<<< ../../../examples/frontend/react-core-mental-model/lesson-data.ts

### 受控筛选组件

它不拥有筛选 State，只通过 Props 接收当前值，并通过回调报告变化。

<<< ../../../examples/frontend/react-core-mental-model/SearchControls.tsx

### 课程列表

列表通过稳定课程 ID 设置 Key，并把课程 ID 交给领域回调。

<<< ../../../examples/frontend/react-core-mental-model/LessonList.tsx

### 本地草稿编辑器

标题草稿只属于当前编辑会话，因此留在编辑器内部。课程 ID 改变时，父组件通过 Key 创建新的会话。

<<< ../../../examples/frontend/react-core-mental-model/LessonEditor.tsx

### 课程目录

它是列表、筛选和选择状态最近的共同父组件，也是课程数组的所有者。

<<< ../../../examples/frontend/react-core-mental-model/LessonCatalog.tsx

### State 快照演示

两个按钮直观展示“重复设置同一个快照值”和“依次处理函数式更新”的差别。

<<< ../../../examples/frontend/react-core-mental-model/StateSnapshotDemo.tsx

### 应用装配

<<< ../../../examples/frontend/react-core-mental-model/App.tsx

### 浏览器入口

入口检查挂载节点，并保留开发阶段 Strict Mode。

<<< ../../../examples/frontend/react-core-mental-model/main.tsx

完整数据流如下：

```text
LessonCatalog.catalog + filters + selectedId
            │
            ├── filters → SearchControls → onChange → setFilters
            │
            ├── visibleLessons → LessonList → onSelect → setSelectedId
            │
            └── selectedLesson → LessonEditor
                                     │
                                     └── onSave → setCatalog
```

示例没有附带 React/Vite 构建配置，因为本专题不能修改根依赖和构建配置。源码通过 `<<<` 直接显示在页面上，不会只给出文件名。

## 常见问题：从现象定位原因

### 调用 Setter 后日志还是旧值

```text
原因：当前事件处理器属于旧渲染快照
如果只是观察下一次界面：直接看下一次渲染结果
如果新值依赖旧值：使用函数式 Setter
```

### 输入框不能输入

```text
检查：是否传了 value，却没有 onChange？
检查：onChange 是否真的更新 value 对应的 State？
```

### 修改对象后界面没有按预期更新

```text
检查：是否直接修改了旧 State 对象？
修复：使用对象展开、map、filter 等创建新对象或新数组
```

### 切换课程后仍然显示上一门草稿

```text
原因：useState 的初始值只在当前组件身份创建时使用
选择：让父组件受控管理草稿，或用稳定业务 Key 表达新编辑会话
```

### 删除列表项后，输入状态跑到另一行

```text
检查：是否使用数组下标作为 Key？
修复：使用来自数据的稳定实体 ID
```

### 为了同步两个 State 写了 Effect

先检查其中一个是否能从另一个和 Props 直接计算。大量“State A 变化后更新 State B”的 Effect，通常说明存在冗余事实来源。

### Strict Mode 下代码看起来执行两次

不要先关闭 Strict Mode。检查组件渲染、Updater 或 Effect 是否修改了外部值，是否缺少清理。代码不应依赖组件函数的精确执行次数。

## 本节知识链

### 第一次学习必须掌握

- 函数组件读取 Props 和 State，返回 JSX；
- Props 是当前渲染的只读输入；
- 事件处理器必须传函数；
- `useState` 返回当前快照和 Setter；
- 受控输入由 `value` 与 `onChange` 共同组成；
- 能由 Props 和 State 计算的数据不需要另存 State；
- 共享状态放在使用它的组件最近的共同父级；
- 列表使用稳定业务 Key。

### 第二次阅读再理解

- Setter 请求下一次渲染，不修改当前变量；
- 基于旧值的连续更新使用函数式 Setter；
- 对象和数组按不可变协议更新；
- Props 初始化本地 State 不等于持续同步；
- 类型、位置和 Key 决定组件 State 是否保留；
- Hook 调用顺序必须稳定。

### 进阶阶段需要建立的原理

- 一次更新经过 Trigger、Render、Reconcile 和 Commit；
- Render 必须纯粹，真实 DOM 只在 Commit 中修改；
- State 由 React 根据组件身份保存；
- 旧值现象来自渲染快照与 JavaScript 闭包；
- TypeScript 约束组件边界，但不验证运行时接口；
- Strict Mode 用开发期额外检查暴露不纯逻辑。

## 下一课

下一节是[Effect、Ref、异步竞态与自定义 Hook](/frontend/react/effects-refs-async-races-and-custom-hooks)。它会回答本课刻意留下的问题：

- 哪些逻辑应该放在事件中，哪些才需要 Effect；
- Effect 为什么需要依赖和清理；
- 异步搜索如何避免旧响应覆盖新结果；
- Ref 怎样保存不参与渲染的值和访问 DOM；
- 自定义 Hook 怎样复用逻辑而不隐藏数据流。

Reducer、Context 和跨组件状态会在后续[Reducer、Context 与跨组件状态架构](/frontend/react/reducer-context-and-cross-component-state-architecture)中系统学习，不在第一课一次堆叠。

## 参考资料

- [React 官方教程：Describing the UI](https://react.dev/learn/describing-the-ui)
- [React 官方教程：Adding Interactivity](https://react.dev/learn/adding-interactivity)
- [React 官方教程：Managing State](https://react.dev/learn/managing-state)
- [React 官方教程：Thinking in React](https://react.dev/learn/thinking-in-react)
- [React：Keeping Components Pure](https://react.dev/learn/keeping-components-pure)
- [React：Render and Commit](https://react.dev/learn/render-and-commit)
- [React：State as a Snapshot](https://react.dev/learn/state-as-a-snapshot)
- [React：Queueing a Series of State Updates](https://react.dev/learn/queueing-a-series-of-state-updates)
- [React：Updating Objects in State](https://react.dev/learn/updating-objects-in-state)
- [React：Updating Arrays in State](https://react.dev/learn/updating-arrays-in-state)
- [React：Preserving and Resetting State](https://react.dev/learn/preserving-and-resetting-state)
- [React：Using TypeScript](https://react.dev/learn/typescript)
