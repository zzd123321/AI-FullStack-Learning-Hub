---
title: React 核心心智模型与 TypeScript 组件设计
description: 从课程目录出发，理解组件、Props、事件、State 快照、派生数据、所有权和组件身份
outline: deep
---

# React 核心心智模型与 TypeScript 组件设计

有 Vue 经验时，JSX 和事件绑定通常不难。真正需要重新建立的是状态模型。

Vue 常写：

```ts
count.value += 1
```

React 常写：

```tsx
setCount(count + 1)
```

表面都是“让 count 加一”，含义却不同：

```text
Vue ref：修改响应式容器中的值
React State：请求 React 用下一份状态重新渲染
```

当前组件函数里的 `count` 不会被 Setter 原地改写。它属于这一次渲染的快照。若没有先理解这一点，之后的 Effect、异步请求和并发渲染都会像一堆特殊规则。

本课让一个课程目录逐步长出来：

```text
静态课程卡片
  ↓ Props 输入
可选择列表
  ↓ State 记忆
筛选与编辑
  ↓ 状态所有权和派生数据
切换编辑对象
  ↓ 组件身份和 Key
最终解释 Render / Commit 与纯度
```

## 组件是一份界面计算，不是命令式更新脚本

Vue 组件：

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

React 函数组件：

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

最重要的一句话是：

> 组件读取本次 Props、State 和 Context，计算当前界面应是什么样子。

JSX 不是 HTML 字符串，也不是已经创建的 DOM。它产生 React 元素描述，React 再根据前后结果决定怎样提交到宿主环境。

### 组件名为什么大写

```tsx
function LessonTitle() {
  return <h2>React 核心心智模型</h2>
}

function App() {
  return <LessonTitle />
}
```

大写名称被视为组件，小写名称被视为宿主元素。`<lessonTitle>` 表示一个名为 lessonTitle 的自定义 DOM 标签，不会调用上面的函数。

React 应负责调用组件。不要把组件当普通函数直接执行：

```tsx
// 不要这样调用组件，Hook 和组件身份都会失去 React 管理。
const result = LessonTitle()
```

### JSX 仍然是 JavaScript 表达式

常用对应关系：

| 目的 | Vue Template | React JSX |
| --- | --- | --- |
| 插值 | `{{ title }}` | `{title}` |
| 动态属性 | `:disabled="saving"` | `disabled={saving}` |
| 点击 | `@click="save"` | `onClick={save}` |
| 条件 | `v-if="lesson"` | `{lesson ? <Editor /> : null}` |
| 列表 | `v-for="item in items"` | `{items.map(...)}` |
| CSS class | `class` | `className` |

花括号中放表达式，不能直接放 `if`、`for` 语句。复杂判断放在 return 前，或提取成有名字的函数和组件。

这不意味着所有逻辑都应塞进 JSX。JSX 应让读者看清界面结构；长链式转换和复杂权限判断更适合普通 TypeScript。

## Props 是本次渲染的只读输入

领域类型：

<<< ../../../examples/frontend/react-core-mental-model/types.ts

卡片可以接收整个课程：

```tsx
interface LessonCardProps {
  lesson: Lesson
}

function LessonCard({ lesson }: LessonCardProps) {
  return <h2>{lesson.title}</h2>
}
```

父组件：

```tsx
<LessonCard lesson={lesson} />
```

Props 可以随父组件后续渲染而变化，但对当前这次渲染来说是不可变快照。子组件不能改调用方拥有的对象：

```tsx
function LessonCard({ lesson }: LessonCardProps) {
  lesson.title = lesson.title.trim() // 错误的所有权
  return <h2>{lesson.title}</h2>
}
```

需要展示格式化值，创建局部计算：

```tsx
const displayTitle = lesson.title.trim()
```

它不修改外部数据，也不需要 State。

### TypeScript Props 应表达真正契约

可选与必需必须来自产品语义：

```tsx
interface AvatarProps {
  userId: string
  size?: 'small' | 'medium' | 'large'
}

function Avatar({ userId, size = 'medium' }: AvatarProps) {
  // ...
}
```

不要因为调用方暂时没传就把关键 Prop 改成可选，再在组件深处用非空断言。让错误尽早出现在边界。

组件嵌套内容对应 `children`。简单容器通常写：

```tsx
import type { ReactNode } from 'react'

interface PanelProps {
  title: string
  children: ReactNode
}
```

不要默认使用 `React.FC` 才算“正确的 React TypeScript”。普通函数加显式 Props 已足够，是否使用 FC 取决于团队约定和所需类型行为。

## 事件处理器表达“用户做了什么”

```tsx
function SaveButton() {
  function handleClick(): void {
    console.log('用户点击保存')
  }

  return <button onClick={handleClick}>保存</button>
}
```

传入的是函数。下面会在渲染时立即执行：

```tsx
<button onClick={handleClick()}>保存</button>
```

需要参数时，用函数表达这次用户操作：

```tsx
<button onClick={() => onSelect(lesson.id)}>
  选择课程
</button>
```

### 子组件回报领域事件，不必泄漏 DOM Event

列表对外契约：

```tsx
interface LessonListProps {
  lessons: readonly Lesson[]
  selectedId: string | null
  onSelect: (lessonId: string) => void
}
```

父组件真正关心的是“选择了哪个课程”，不是 button 的 MouseEvent。让子组件尽早从 DOM 事件提取领域值，父组件更容易复用和测试。

完整列表：

<<< ../../../examples/frontend/react-core-mental-model/LessonList.tsx

若组件本身就是通用输入控件，暴露 `ChangeEvent<HTMLInputElement>` 也可能合理；关键是契约层级与组件职责匹配。

## 普通变量为什么不能让组件记住内容

```tsx
function Counter() {
  let count = 0

  function increment(): void {
    count += 1
  }

  return <button onClick={increment}>{count}</button>
}
```

点击确实修改了这次函数调用中的变量，但没有请求 React 重新渲染。即使别的原因触发新渲染，组件函数又从 `let count = 0` 开始。

State 同时提供：

1. 跨渲染保存的数据槽；
2. 请求 React 使用新状态渲染的 Setter。

```tsx
const [count, setCount] = useState(0)
```

可以把它读成：

```text
count     本次渲染拿到的状态值
setCount  为后续渲染排入一次状态更新
```

## State 是快照：Setter 不会修改当前变量

```tsx
function increment(): void {
  setCount(count + 1)
  console.log(count)
}
```

日志仍是旧值，不是 Setter “异步赋值失败”，而是这个事件处理器闭包来自某次渲染，它捕获了那次渲染的 count。

React 接收更新后，会再次调用组件：

```text
渲染 A：count = 0
  ↓ 点击处理器来自渲染 A
setCount(1)
  ↓ React 安排新渲染
渲染 B：count = 1
```

渲染 A 的局部变量不会变成渲染 B 的变量。

### 为什么连续写三次只加一

```tsx
setCount(count + 1)
setCount(count + 1)
setCount(count + 1)
```

三行都读取同一个快照，例如 count 都是 0，于是都在请求“设置为 1”。

当下一状态依赖队列中的前一状态时，传 updater：

```tsx
setCount((current) => current + 1)
setCount((current) => current + 1)
setCount((current) => current + 1)
```

React 按队列应用：

```text
0 → 1 → 2 → 3
```

完整对照：

<<< ../../../examples/frontend/react-core-mental-model/StateSnapshotDemo.tsx

函数式更新不是所有 Setter 的强制写法。新值完全由事件 payload 决定时：

```tsx
setKeyword(event.currentTarget.value)
```

已经清楚。只有“基于现有状态生成下一状态”时，updater 才能避免闭包中的旧快照。

## 受控输入把当前值和修改方式都交给 React

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

数据流：

```text
State keyword
  ↓ value
input 显示
  ↓ 用户输入触发 onChange
读取 currentTarget.value
  ↓ setKeyword
下一次渲染得到新 keyword
```

只传 value 不传 onChange，会变成无法编辑的只读输入。只传 defaultValue，则 DOM 在初始化后拥有当前值，是非受控输入。

“受控/非受控”是所有权描述，不是质量等级：

- 需要即时校验、联动和外部重置时，受控更直接；
- 简单表单、文件输入或与非 React 控件集成时，非受控可能更自然。

课程筛选组件是受控的：

<<< ../../../examples/frontend/react-core-mental-model/SearchControls.tsx

它没有自己的 filters State。父组件传当前值，子组件通过 onChange 请求父组件更新。

## State 只保存无法从当前输入计算出来的事实

课程目录已有 catalog 和 filters：

```tsx
const visibleLessons = filterLessons(catalog, filters)
```

不需要再写：

```tsx
const [visibleLessons, setVisibleLessons] = useState<Lesson[]>([])
```

否则 catalog、filters、visibleLessons 会形成三份需要同步的状态。任何一个更新路径漏掉 setVisibleLessons，界面就过期。

纯筛选函数：

<<< ../../../examples/frontend/react-core-mental-model/lesson-data.ts

在 render 中直接计算，保证它永远对应本次 Props 和 State。

### 不要用 Effect 同步可派生 State

```tsx
useEffect(() => {
  setVisibleLessons(filterLessons(catalog, filters))
}, [catalog, filters])
```

这会先用旧 visibleLessons 渲染并 Commit，再运行 Effect，再 Setter，再渲染一次。本来一次纯计算能完成的事变成两次提交和同步风险。

Effect 用于与 React 外部系统同步，下一课会详细解释；不是派生数据工具。

### State 结构应避免矛盾和重复

不推荐：

```tsx
const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null)
```

若 catalog 更新了对应课程，selectedLesson 可能仍是旧对象。

保存稳定 ID：

```tsx
const [selectedId, setSelectedId] = useState<string | null>(null)
const selectedLesson =
  catalog.find((lesson) => lesson.id === selectedId) ?? null
```

现在课程实体只有 catalog 一份事实来源。

State 应尽量：

- 不保存可计算结果；
- 不重复同一实体；
- 不允许多个字段构成互相矛盾状态；
- 避免难以不可变更新的深层嵌套；
- 但也不能丢掉真正需要跨渲染保留的信息。

“最小”不是字段越少越好，而是没有冗余事实。

## 状态所有者应是需要协调它的最近共同父组件

SearchControls 需要显示 filters，LessonList 需要使用 filters 后的结果。若各自保存一份关键词，就要互相同步。

把 filters 放到最近共同父组件 LessonCatalog：

```text
LessonCatalog owns filters
  ├── SearchControls 读取并请求修改
  └── LessonList 使用筛选结果
```

这叫 lifting state up。

它不是要求所有 State 都放到页面根：

- 只有一个按钮使用的 hover、展开状态可以留在叶组件；
- 两个兄弟需要协调的值上移到共同父组件；
- 跨很深组件树再考虑 Context；
- 复杂转换再考虑 Reducer；
- 服务端缓存和 URL 状态属于不同系统。

每一份 State 只应有一个事实来源。所有权可以随设计演进上移或下移。

## Props 和 State 都按不可变快照使用

错误：

```tsx
catalog[0].title = '新标题'
setCatalog(catalog)
```

它修改了旧快照，且根数组引用没变。这样会破坏 React 对输入稳定性的假设，也让旧闭包、日志和调试工具看到被篡改的数据。

正确创建下一份值：

```tsx
setCatalog((current) =>
  current.map((lesson) =>
    lesson.id === lessonId
      ? { ...lesson, title: nextTitle }
      : lesson
  )
)
```

这里有两个重要性质：

- 数组是新对象；
- 只有目标课程是新对象，未变化课程保持引用。

不可变更新不等于每次深拷贝整棵数据。只复制从根到变化点的路径，既保持历史快照正确，也保持未变化子对象身份稳定。

数组常见对应：

| 目的 | 不可变写法 |
| --- | --- |
| 添加 | `[...current, item]` |
| 删除 | `current.filter(...)` |
| 修改 | `current.map(...)` |
| 排序 | `[...current].sort(...)` |

复杂嵌套更新频繁时，先考虑把 State 规范化或拆分所有权，而不是堆叠很多层对象展开。

## Props 只初始化 State 一次

编辑器需要本地草稿：

```tsx
function LessonEditor({ lesson }: LessonEditorProps) {
  const [title, setTitle] = useState(lesson.title)
  // ...
}
```

`useState(lesson.title)` 只在这个组件身份第一次创建时给出初值。以后 lesson Prop 改变，不会自动重置 title。

这不是 React 漏同步，而是本地 State 必须有明确语义。这里 title 表示“当前编辑会话草稿”，父组件更新课程标题时不应随意覆盖用户正在输入的内容。

完整编辑器：

<<< ../../../examples/frontend/react-core-mental-model/LessonEditor.tsx

若组件必须始终显示 Prop，根本不要复制到 State；直接使用 lesson.title。

若切换实体意味着新编辑会话，可用实体身份让 React 重建：

```tsx
<LessonEditor
  key={selectedLesson.id}
  lesson={selectedLesson}
  onSave={saveTitle}
/>
```

## State 与组件在渲染树中的身份绑定

React 不是把 State 存在函数局部变量里，而是根据组件在渲染树中的位置和身份，把 State 槽关联给这次组件实例。

通常：

- 同一父级位置；
- 同一组件类型；
- 同一 key；

会保留 State。

类型或 key 改变，React 会把它视为新身份，旧组件卸载，新组件挂载，内部 State 重置。

### 列表 key 也表达同一个身份问题

```tsx
{lessons.map((lesson) => (
  <li key={lesson.id}>{lesson.title}</li>
))}
```

key 应来自数据的稳定 ID，不能每次 render 用随机数。数组下标只表示当前位置；插入、删除和排序后，输入草稿、焦点和本地 State 可能跟到另一条业务记录。

key 不会作为普通 Prop 传给组件。子组件需要 ID 时仍要显式传 `lessonId` 或 lesson。

不要为了“刷新组件”随意改变 key。它会销毁本地状态、DOM 和副作用。只有产品语义确实是新实体/新会话时才重置身份。

## Hook 为什么必须在顶层稳定调用

错误：

```tsx
if (editable) {
  const [title, setTitle] = useState('')
}
```

或：

```tsx
for (const lesson of lessons) {
  useState(lesson.title)
}
```

React 需要每次渲染以相同顺序对应 Hook 槽。条件改变后调用顺序漂移，React 就无法知道某个 State 属于哪一行源码。

规则：

- 只在 React 组件和自定义 Hook 中调用 Hook；
- 在顶层调用，不放进普通条件、循环和事件处理器；
- 使用官方 ESLint Plugin 让规则自动检查。

需要条件行为时，仍然顶层调用 Hook，把条件放进计算或 Hook 参数；或者拆成条件渲染的子组件，让每个组件拥有稳定 Hook 结构。

## 一次更新经过 Trigger、Render 和 Commit

### Trigger

首次 root render、State Setter 或父级更新让 React 安排工作。

### Render

React 调用需要计算的组件，读取这次 Props、State、Context，得到新的元素树。

Render 是计算阶段，不保证每次结果都 Commit。现代 React 可以暂停、放弃或重新开始计算，因此 render 不能产生外部副作用。

### Commit

React 把必要变更提交给 DOM，并处理相关生命周期工作。DOM 真正变化发生在这一阶段。

浏览器之后还会布局和绘制。Render 慢、DOM Commit 慢和浏览器布局慢也是不同问题，后续性能课会分别分析。

## 纯渲染让 React 可以安全重试和优化

纯组件要求相同的 Props、State、Context 产生相同 JSX，并且不修改渲染前已经存在的对象或外部系统。

渲染中不能：

```tsx
function LessonList() {
  analytics.track('rendered') // 外部副作用
  cache.push(item)            // 修改外部数组
  lesson.title = 'changed'    // 修改 Prop
  return /* ... */
}
```

可以创建本次渲染自己的局部值：

```tsx
const visible = lessons.filter(matches)
```

事件处理器不是 render，可以响应用户操作；与外部系统的同步放在 Effect 或专门数据层。

纯度使 React 可以：

- 多次调用组件检查问题；
- 放弃过期 render；
- 在服务端执行；
- 安全缓存和优化；
- 不依赖兄弟组件执行顺序。

## Strict Mode 是开发期探测器

入口：

<<< ../../../examples/frontend/react-core-mental-model/main.tsx

Strict Mode 在开发环境会进行额外检查，包括：

- 额外调用组件 render 以暴露不纯逻辑；
- Effect 做额外 setup → cleanup → setup；
- callback ref 做额外 setup/cleanup；
- 报告部分弃用 API。

这不是生产环境“无缘无故执行两次”。若额外执行导致重复写入、连接泄漏或数组被重复修改，说明代码原本就依赖了不安全的单次执行假设。

不要通过删除 Strict Mode 来隐藏问题。修复 render 纯度和副作用清理。

## JavaScript 闭包为什么会看到旧 State

每次 render 都创建新的事件处理函数。这个函数捕获该次 render 的 Props 和 State：

```tsx
function handleLater(): void {
  window.setTimeout(() => {
    console.log(count)
  }, 1000)
}
```

一秒内即使 count 已更新，回调仍打印创建它的那次快照。这是 JavaScript 闭包的正常行为。

解决方案取决于需求：

- 下一状态基于最新队列：函数式 Setter；
- 需要最新值但不驱动界面：下一课的 ref；
- 外部订阅要响应变化：正确 Effect 依赖和清理；
- 异步结果属于某次请求：取消和请求所有权。

不要看到旧值就把所有变量都塞进 ref。先明确这段代码需要“历史快照”还是“最新值”。

## TypeScript 不验证运行时数据

```ts
const lesson = (await response.json()) as Lesson
```

断言不会检查 JSON。Props 类型只能约束受 TypeScript 检查的调用方；API、localStorage、URL 和 postMessage 仍是 unknown 边界。

正确流程：

```text
外部 unknown
  ↓ schema / type guard
可信 Lesson
  ↓ Props
组件渲染
```

不要让每个组件重复猜网络结构。服务层负责解析，组件接收稳定领域类型。

## 完整课程目录如何组合

应用入口：

<<< ../../../examples/frontend/react-core-mental-model/App.tsx

目录组件：

<<< ../../../examples/frontend/react-core-mental-model/LessonCatalog.tsx

它拥有三份真正需要记住的 State：

- catalog：用户可编辑的课程集合；
- filters：多个子组件共同使用的筛选条件；
- selectedId：当前选择身份。

它没有保存：

- visibleLessons，因为可计算；
- selectedLesson，因为可从 ID 和 catalog 查找；
- editor title，因为属于单次编辑会话。

完整数据流：

```text
LessonCatalog
├── catalog State
├── filters State
├── selectedId State
│
├── SearchControls
│   ├── filters Prop
│   └── onChange → 更新父级 filters
│
├── LessonList
│   ├── visibleLessons 派生值
│   ├── selectedId Prop
│   └── onSelect → 更新父级 selectedId
│
└── LessonEditor key=selectedId
    ├── lesson Prop
    ├── title 本地草稿 State
    └── onSave → 父级不可变更新 catalog
```

这张图把本课所有概念连在一起：

- Props 是输入；
- callback 是子组件报告事件的出口；
- State 有唯一所有者；
- 派生数据不重复存；
- 不可变更新创建下一快照；
- key 说明编辑会话身份。

## 常见现象应该怎样定位

### Setter 后日志还是旧值

处理器属于旧渲染快照。不要期待当前变量被 Setter 修改。

### 连续加三次只增加一

三次都从同一快照计算。需要函数 updater 队列。

### 输入框不能输入

传了 value 却没有在 onChange 中更新对应 State，或者总把旧值写回。

### 修改对象后界面行为异常

检查是否直接改了 Props/State，是否把同一引用重新传给 Setter。

### Prop 更新但本地 State 没变

`useState(prop)` 只初始化当前身份一次。决定组件应受控、保留本地草稿，还是用 key 开始新会话。

### 删除列表后输入状态串行

检查 key 是否使用数组下标或随机值。key 必须表达实体身份。

### 为同步两个 State 写了 Effect

先检查其中一个是否可由另一个和 Props 在 render 中计算。

### Strict Mode 下日志出现两次

确认是否仅开发检查；再修正 render 副作用和缺失清理，不要先关闭 Strict Mode。

## 本课小结

- 函数组件读取本次输入，返回界面描述；React 决定何时调用和提交；
- Props 和 State 都是当前 render 的只读快照；
- Setter 排入后续状态，不修改当前闭包中的变量；
- 下一状态依赖旧状态时使用函数式 updater；
- State 只保存无法从当前 Props/State 计算的事实；
- 多个组件协调同一状态时，把所有权提升到最近共同父组件；
- 对象和数组用不可变更新生成下一快照；
- `useState(prop)` 只初始化一次，是否重置由组件身份语义决定；
- 类型、树中位置和 key 决定 State 保留还是重建；
- Hook 顶层顺序必须稳定；
- Render 必须纯，Strict Mode 用额外开发检查暴露不纯和清理问题；
- TypeScript 约束组件边界，但外部数据仍需运行时验证。

下一节是[Effect、Ref、异步竞态与自定义 Hook](/frontend/react/effects-refs-async-races-and-custom-hooks)。本课已经说明“能在 render 中计算就不要 Effect”；下一课会从必须连接浏览器或网络的场景出发，解释 Effect 究竟何时需要、依赖数组为什么不是执行时机开关，以及怎样处理清理和旧请求。

## 官方资料

- [React：你的第一个组件](https://react.dev/learn/your-first-component)
- [React：向组件传递 Props](https://react.dev/learn/passing-props-to-a-component)
- [React：State 如同一张快照](https://react.dev/learn/state-as-a-snapshot)
- [React：把一系列 State 更新加入队列](https://react.dev/learn/queueing-a-series-of-state-updates)
- [React：选择 State 结构](https://react.dev/learn/choosing-the-state-structure)
- [React：在组件间共享 State](https://react.dev/learn/sharing-state-between-components)
- [React：保留和重置 State](https://react.dev/learn/preserving-and-resetting-state)
- [React：保持组件纯粹](https://react.dev/learn/keeping-components-pure)
- [React：Rules of React](https://react.dev/reference/rules)
- [React：StrictMode](https://react.dev/reference/react/StrictMode)
