---
title: React 核心心智模型与 TypeScript 组件设计
description: 从渲染纯度、State 快照、更新队列和组件身份出发，建立面向工程实践的 React TypeScript 基础
---

# React 核心心智模型与 TypeScript 组件设计

> 适用环境：React 19.x、TypeScript 严格模式与现代构建工具。本课以 React 19.2 官方文档为资料基线，但重点是跨小版本稳定的渲染与状态原则。已有 Vue 经验，因此不会重复 HTML、JavaScript 和组件化入门。

## 1. 学习目标

完成本节后，你应该能够：

- 用“组件函数描述某次渲染的 UI”解释 React，而不是套用 Vue 响应式直觉。
- 区分 Trigger、Render、Commit 与浏览器 Paint。
- 保持组件和 Hook 在渲染阶段纯净。
- 理解每次 Render 中 Props、State 和事件处理器都是一个快照。
- 正确选择值更新和函数式 State 更新。
- 解释批处理为什么不会让当前事件处理器里的变量立即改变。
- 使用不可变更新维护对象与数组 State。
- 根据树中位置、组件类型和 Key 判断 State 是保留还是重置。
- 设计最小、完整且无冗余的 State。
- 在受控与非受控组件之间做出明确选择。
- 使用 TypeScript 建模 Props、Events、Children、原生属性和异步状态。
- 遵守 Hook 的调用规则，并理解 Strict Mode 暴露问题的方式。
- 从 Vue 的“依赖跟踪更新”切换到 React 的“重新调用组件并协调结果”模型。

## 2. 先建立正确的一句话模型

React 组件是一个接收 Props、读取本次 State，并返回 UI 描述的函数：

```text
UI snapshot = render(props snapshot, state snapshot, context snapshot)
```

当 State 更新时，React 会安排一次新的 Render，再把新旧结果交给协调过程，最后只提交必要的 DOM 变更。

这句话里有四个关键点：

- 组件函数可能执行很多次，不等于 DOM 每次全部重建。
- 每次执行看到的是那次 Render 的固定输入快照。
- Render 计算“应该是什么”，Commit 才真正修改 DOM。
- React 可以暂停、重启或放弃尚未提交的 Render，所以渲染必须纯。

如果把组件函数理解成“初始化函数”，就会自然地在函数体里发请求、写全局变量或修改 DOM；这些行为在 React 的可重入渲染模型中都不可靠。

## 3. 从 Vue 迁移心智模型

React 与 Vue 都是声明式、组件化、单向数据流优先的 UI 框架，但更新模型不同：

| 关注点 | Vue 3 常见模型 | React 常见模型 |
| --- | --- | --- |
| 组件执行 | `setup()` 通常每个实例执行一次 | 函数组件每次 Render 都重新调用 |
| 响应式状态 | Ref/Proxy 是可读取的响应式容器 | State 是当前 Render 的不可变快照 |
| 更新入口 | 修改 `ref.value` / reactive 属性 | 调用 Setter 请求下一次 Render |
| 依赖关系 | 运行时/编译器跟踪读取依赖 | 父 Render 通常递归计算子树，再由协调优化 |
| 派生值 | `computed()` 缓存依赖结果 | 通常直接在 Render 计算，必要时再 Memoize |
| 模板 | SFC Template 指令 | JSX 是 JavaScript 表达式语法扩展 |
| 双向绑定 | `v-model` 契约 | `value/checked + onChange` 显式受控契约 |
| 生命周期 | Mounted/Updated 等组件阶段 | Render 与 Effect 同步外部系统 |

不要把 `useState` 当成 React 版 `ref`。Setter 不会修改当前函数闭包中的值；它请求 React 用新 State 再调用组件。

也不要认为 React 每次函数执行都会替换全部 DOM。函数执行产生新的元素树描述，Commit 阶段才根据差异更新真实节点。

## 4. JSX 是表达 UI 的 JavaScript 语法

JSX 最终转成 React 元素描述，不是 HTML 字符串。常见差异：

- JavaScript 表达式放在 `{}` 中。
- `class` 写成 `className`，多数 DOM 属性使用 camelCase。
- Event Handler 传函数：`onClick={handleClick}`，不能写成调用结果 `onClick={handleClick()}`。
- 每个组件必须返回一个根值，可以用 Fragment `<>...</>`，它不产生 DOM 包装。
- 自定义组件名必须大写，小写标签被解释为原生元素。
- `null`、`undefined`、Boolean 不渲染可见内容；数字 `0` 会渲染。

条件渲染直接使用 JavaScript：

```tsx
return error ? <ErrorMessage message={error} /> : <LessonList lessons={lessons} />
```

需要警惕：

```tsx
{items.length && <List items={items} />}
```

列表为空时它会渲染 `0`。更明确的写法是：

```tsx
{items.length > 0 ? <List items={items} /> : null}
```

JSX 会转义字符串值，能降低普通文本插值的 XSS 风险；`dangerouslySetInnerHTML` 会绕过这层保护，必须使用可信、经过上下文安全处理的 HTML。

## 5. 组件函数必须纯

纯渲染包含三层要求：

1. **相同输入得到相同输出**：同一组 Props、State、Context 应描述相同 UI。
2. **不修改调用前已存在的对象**：不能改 Props、State、模块变量或共享缓存。
3. **渲染阶段不产生外部可观察副作用**：不发请求、不写 Storage、不注册监听、不改 DOM。

错误示例：

```tsx
let renderCount = 0

function Profile({ user }: { user: User }) {
  renderCount += 1       // 修改模块状态
  user.name = user.name.trim() // 修改 Props
  document.title = user.name   // 修改 DOM
  return <h1>{user.name}</h1>
}
```

渲染期间可以创建和修改本次调用内部的新对象：

```tsx
function LessonTitles({ lessons }: { lessons: readonly Lesson[] }) {
  const titles: string[] = []
  for (const lesson of lessons) titles.push(lesson.title)
  return <p>{titles.join('、')}</p>
}
```

`titles` 不会逃逸到其他 Render，因此局部 Mutation 不破坏纯度。纯度禁止的是对外部既存值的非幂等修改，不是禁止所有赋值语句。

用户点击、提交表单等事件处理器不在 Render 阶段执行，适合由明确交互触发的副作用。与网络、DOM Widget、订阅等外部系统的持续同步使用 Effect；下一课会详细讨论 Effect 边界。

## 6. React 为什么需要渲染纯度

React 的调度可能：

- 为高优先级工作暂停低优先级 Render。
- 在提交前重新执行组件。
- 发现结果不再需要而放弃某次 Render。
- 在开发 Strict Mode 中额外调用纯函数，暴露 Mutation 和清理缺陷。

如果 Render 会扣库存、写日志、发送请求或把数据追加到共享数组，“多执行一次”就会改变业务结果。纯计算可以安全重试，这是并发渲染、流式与编译优化的重要前提。

“React 应该只调用一次”不是可靠契约。只有 Commit 后的用户可见行为和正确管理的 Effect 才属于外部世界。

## 7. Render 与 Commit

一次更新可分为：

```text
Trigger → Render → Reconcile → Commit → Browser Paint
```

### Trigger

初次 `createRoot().render()`，或组件 State 更新、父组件 Render、Context 变化等，让 React 安排工作。

### Render

React 调用组件函数，递归获得元素树。这里只是计算，不应该读写 DOM。

### Reconcile

React 比较新旧树，依据元素类型、位置和 Key 判断节点/组件身份，决定哪些工作需要提交。

### Commit

React 应用必要的 DOM 插入、删除、属性更新和 Ref 变更。未变化的 DOM 节点可以保留。

### Paint

浏览器执行样式、布局和绘制。Paint 属于浏览器流水线，不是 React 生命周期的一部分。

React “Render” 与浏览器“Render”不是同一个概念。性能分析时要区分组件计算、DOM Commit、Layout 和 Paint。

## 8. State 是快照，不是可变变量

考虑：

```tsx
const [count, setCount] = useState(0)

function handleClick() {
  setCount(count + 1)
  console.log(count)
}
```

日志仍是 `0`。`setCount()` 没有修改当前 Render 的 `count`，而是安排下一次 Render 使用 `1`。当前 Handler 闭包仍属于旧快照。

这同样适用于异步回调：

```tsx
function handleSubmit() {
  const submittedName = name
  setTimeout(() => {
    alert(`提交时的名字：${submittedName}`)
  }, 3000)
}
```

回调捕获的是注册它的那次 Render 变量。用户后来输入新名字，不会神秘地改写旧闭包。

快照模型带来确定性，但也会形成 stale closure。解决方法不是把所有值塞进 Ref，而是先判断：

- 需要基于队列中的最新 State 更新？用函数式更新。
- 需要事件发生时的快照？闭包正是所需。
- 需要读取不触发 Render 的最新外部值？可能用 Ref。
- Effect 依赖遗漏？修正依赖和逻辑边界，而不是绕过规则。

## 9. 更新队列与批处理

完整演示：

<<< ../../../examples/frontend/react-core-mental-model/StateSnapshotDemo.tsx

三次 `setCount(count + 1)` 都基于同一个快照，例如都请求“设置为 1”。函数式更新传入 updater：

```tsx
setCount((current) => current + 1)
```

React 处理队列时，把上一步结果传给下一步，因此连续三个 updater 得到 `+3`。

使用函数式更新的典型条件：

- 新值依赖同一更新队列里的旧值。
- 多个更新可能在一次批处理中发生。
- 回调闭包可能来自较早 Render，而业务需要基于最新队列状态。

若新值完全来自 Event Payload，可以直接设置：

```tsx
setKeyword(event.currentTarget.value)
```

React 会批处理一个交互中的多个 State 更新，避免每次 Setter 都立刻 Render。批处理不跨越“必须先完成当前用户事件再处理下一个事件”的语义边界。不要依赖 Setter 后立即读取 DOM；如果确有第三方集成需要同步提交，应先重新审视架构，`flushSync` 是少数集成场景的逃生口，不是常规写法。

Updater 本身也必须纯。开发模式可能额外调用 updater 来发现 Mutation，不能在其中发请求或写日志计数。

## 10. State 必须按不可变值更新

错误：

```tsx
lesson.title = nextTitle
setLesson(lesson)
```

它修改了当前快照中的对象，并把同一引用交回 React。除了可能无法触发预期更新，还会污染旧 Render、Memoization 和历史调试。

正确：

```tsx
setLesson((current) => ({ ...current, title: nextTitle }))
```

数组同理：

```tsx
setLessons((current) =>
  current.map((lesson) =>
    lesson.id === updated.id ? updated : lesson
  )
)
```

“不可变”是更新协议，不代表所有 JavaScript 对象必须 `Object.freeze()`。可以修改本次刚创建、尚未发布的新对象；不能修改已经成为 Props/State/Context 快照的一部分。

TypeScript 的 `readonly` 能表达边界意图，但它是编译期约束，不是深度运行时冻结。本课领域类型使用只读字段：

<<< ../../../examples/frontend/react-core-mental-model/types.ts

## 11. 设计最小且完整的 State

State 应满足：

- **会随交互或时间变化**。
- **无法从现有 Props/State 直接计算**。
- **由一个明确组件拥有**。

课程目录只保存可编辑课程数据、关键词、是否只看已发布和选择 ID；可见列表和选中课程在 Render 中推导：

<<< ../../../examples/frontend/react-core-mental-model/LessonCatalog.tsx

不要这样同步派生 State：

```tsx
const [visibleLessons, setVisibleLessons] = useState(initialLessons)

useEffect(() => {
  setVisibleLessons(filterLessons(initialLessons, filters))
}, [initialLessons, filters])
```

这会先用旧列表 Render，再由 Effect 触发第二次 Render，还增加同步 Bug。纯计算应该直接执行。只有经过测量确认计算昂贵时，才考虑 `useMemo`；Memo 是性能优化，不是正确性工具。

纯筛选规则放在独立 TypeScript 文件，可直接测试：

<<< ../../../examples/frontend/react-core-mental-model/lesson-data.ts

## 12. State 应该放在哪里

为每个 State 问：哪些组件读取它，哪些交互修改它？把它放到这些组件最近的共同父级，再通过 Props 下发值和 Callback。

本课数据流：

```text
LessonCatalog owns catalog + filters + selectedId
├── SearchControls receives filters + onChange
├── LessonList receives lessons + selectedId + onSelect
└── LessonEditor owns temporary title draft
```

筛选条件影响 Controls 和 List，所以由共同父级 Catalog 拥有。编辑草稿只在 Editor 内使用，所以留在 Editor。把所有 State 一律提升到 App 会制造 Prop Drilling 和巨大更新面；把共享 State 留在某个子组件又会迫使兄弟组件做隐式同步。

“单向数据流”不是只能从上往下传数据。Callback 也作为 Prop 从父传子，子组件调用它，把用户意图报告给拥有 State 的父组件。State 的所有权仍然单一。

## 13. 受控组件与非受控组件

受控 Input：

```tsx
<input value={keyword} onChange={(event) => setKeyword(event.currentTarget.value)} />
```

React State 是 UI 的 Source of Truth。只传 `value` 不传 `onChange` 会得到只读输入。

非受控 Input：

```tsx
<input defaultValue="React" />
```

DOM 保存后续值，提交时可用 FormData 或 Ref 读取。它适合简单表单、原生文件输入或不需要每次键入驱动其他 UI 的场景。

不要让同一个输入在生命周期中从 `undefined` 的非受控状态切到字符串受控状态。初始化为 `''`，或始终使用明确契约。

可复用组件也有相同选择：

- 受控：`selectedId + onSelectedIdChange`，父级拥有状态。
- 非受控：`defaultSelectedId`，组件内部拥有状态。

需要同时支持两种模式时必须定义优先级、切换行为和事件语义；否则宁可提供两个清晰封装。

完整受控筛选组件：

<<< ../../../examples/frontend/react-core-mental-model/SearchControls.tsx

## 14. 组件身份决定 State 是否保留

React 不把 State 存在 JSX 标签或函数局部变量里，而是把它关联到渲染树中的位置和组件类型。

### 同一位置、同一类型

组件继续存在，State 保留，即使 Props 改变。

### 同一位置、类型改变

旧组件卸载，新组件挂载，子树 State 重置。

### Key 改变

即使类型相同，React 也把它视为不同身份，旧 State 被丢弃。

课程编辑器以课程 ID 作为 Key：

<<< ../../../examples/frontend/react-core-mental-model/LessonEditor.tsx

```tsx
<LessonEditor key={selectedLesson.id} lesson={selectedLesson} />
```

切换课程时草稿应重置，因此 Key 表达“这是另一个编辑会话”。如果业务要求为每门课程保留草稿，就不应依赖单个 Editor 本地 State，而应把以 lesson ID 索引的草稿提升到更稳定的所有者。

不要在另一个组件内部定义组件函数：

```tsx
function Page() {
  function Editor() { /* ... */ }
  return <Editor />
}
```

每次 Page Render 都创建一个新的组件函数类型，React 可能重置其子树 State。组件类型应定义在模块顶层；需要数据就通过 Props 传入。

## 15. 列表 Key 是身份，不是消除警告的装饰

课程列表：

<<< ../../../examples/frontend/react-core-mental-model/LessonList.tsx

Key 应满足：

- 在同级列表中唯一。
- 来自数据的稳定身份。
- 同一实体跨 Render 保持不变。

不要使用 `Math.random()`；它会让每次 Render 都重建组件和 DOM。数组 Index 只适合永不插入、删除、重排且没有局部 State 的静态列表。否则删除第一项后，第二项可能继承第一位置的输入 State。

`key` 是 React 协调 Hint，不会作为普通 Prop 传给组件。组件需要 ID 时必须显式传：

```tsx
<LessonRow key={lesson.id} lessonId={lesson.id} />
```

## 16. Hook 规则来自调用顺序

Hook 必须：

- 只在 React 函数组件或自定义 Hook 顶层调用。
- 不放在条件、循环、嵌套函数、Event Handler、`try/catch` 中。

错误：

```tsx
if (enabled) {
  const [value, setValue] = useState('')
}
```

React 依靠每次 Render 的 Hook 调用顺序，把某次 `useState` 对应到正确状态槽。条件改变会移动后续 Hook 的位置。

正确做法是始终调用 Hook，把条件放进计算或 Hook 内部逻辑：

```tsx
const [value, setValue] = useState('')
const visibleValue = enabled ? value : ''
```

Hook 名以 `use` 开头不只是命名风格，Lint 和 React 工具通过它识别调用规则。自定义 Hook 复用的是状态逻辑，不是共享 State；每次调用拥有自己的 State，除非它明确订阅同一外部 Store。

## 17. Strict Mode 为什么看起来“执行两次”

开发环境的 `<StrictMode>` 会额外执行部分纯函数和 Effect 设置/清理流程，以暴露：

- Render 修改 Props、模块数组或缓存。
- Updater 不纯。
- Effect 缺少清理。
- Ref Callback 没有正确释放资源。
- 使用已弃用 API。

入口示例：

<<< ../../../examples/frontend/react-core-mental-model/main.tsx

不要通过移除 Strict Mode 掩盖重复请求或重复追加。先定位副作用为何位于 Render、为何 Effect 不可取消，或为何清理不完整。开发期额外检查不等于生产每个组件永远固定执行两次；程序也不能依赖确切 Render 次数。

## 18. TypeScript：组件返回值与 Props

函数组件通常让 TypeScript 推断返回类型：

```tsx
interface LessonTitleProps {
  title: string
}

function LessonTitle({ title }: LessonTitleProps) {
  return <h2>{title}</h2>
}
```

不必普遍使用 `React.FC`。普通函数更直接，并且 Children 是否存在由 Props 明确决定。

常见类型选择：

| 需求 | 推荐类型 |
| --- | --- |
| 可渲染 Children | `ReactNode` |
| 组件生成的元素 | 通常推断；边界需要时用 `ReactElement` |
| DOM Event | `ChangeEvent<HTMLInputElement>` 等 |
| 原生元素 Props | `ComponentPropsWithoutRef<'button'>` |
| State Setter 作为 Prop | 更偏向领域 Callback，而非暴露 Setter |
| CSS 属性对象 | `CSSProperties` |
| Ref 到 DOM | `useRef<HTMLInputElement>(null)` |

`ReactNode` 比 `JSX.Element` 范围更宽，可包含字符串、数字、元素、数组、`null` 等可渲染内容。组件库的 Children 通常使用 `ReactNode`。

## 19. 包装原生组件时保留平台能力

一个 Button 不应重新手写几十个 HTML 属性类型。通过原生 Props 继承 `disabled`、`aria-*`、事件等能力：

<<< ../../../examples/frontend/react-core-mental-model/Button.tsx

设计要点：

- 使用 `ComponentPropsWithoutRef<'button'>` 获取当前 React DOM 类型。
- 用 `Omit` 收紧需要重新定义的字段。
- 默认 `type="button"`，避免放在 Form 中意外提交。
- 自定义 `tone` 只表达设计系统语义。
- 其余 Props 透传到真实 Button，保留可访问性和测试能力。
- Spread 顺序决定谁覆盖谁；关键属性应在 API 中明确优先级。

如果组件要转发 Ref，需要选择与当前 React 版本和项目约定一致的方案。Ref 是逃生口，不应成为普通数据流。

## 20. Event 类型：优先使用 `currentTarget`

React Event Handler 可以内联推断：

```tsx
<input onChange={(event) => setKeyword(event.currentTarget.value)} />
```

抽取函数时显式标注：

```tsx
function handleChange(event: ChangeEvent<HTMLInputElement>): void {
  setKeyword(event.currentTarget.value)
}
```

`currentTarget` 是注册 Handler 的元素，类型稳定；`target` 是事件实际起源，可能是子元素，类型更宽。Button 内含 Icon 时，`event.target` 不一定是 Button。

不要把整个 Event 保存到长期业务状态。尽早提取领域值：字符串、Boolean、ID、FormData，再传入业务函数。

回调 Props 应表达领域事件：

```ts
onSelect: (lessonId: string) => void
```

而不是把 `MouseEvent` 一路传到 Store/API。这样组件边界更易测试，也不绑定具体 DOM 结构。

## 21. 用联合类型表达合法 UI 状态

多个 Boolean 容易产生不可能组合：

```ts
isLoading: boolean
hasError: boolean
hasData: boolean
```

判别联合让状态互斥：

```ts
type RemoteData<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string }
```

通用渲染组件：

<<< ../../../examples/frontend/react-core-mental-model/RemoteDataView.tsx

`switch` 按 `status` 收窄后，只有 success 分支能访问 `data`。这比可选字段和非空断言更可靠。

Render Props `children: (data: T) => ReactNode` 让调用方决定成功内容，同时保持 Loading/Error 状态机集中。不要把所有异步请求都抽象成一个万能组件；只有状态语义和交互确实一致时才复用。

## 22. React 组件拆分的依据

不要因为 JSX 超过 20 行就拆组件，也不要把每个 `<div>` 都封装。适合形成组件的信号：

- 有清晰业务或设计语义。
- 拥有独立 State/交互边界。
- 在多个地方复用。
- 需要独立测试、加载或错误边界。
- 父组件包含多个彼此独立的变化原因。

本课结构：

```text
App
├── LessonCatalog
│   ├── SearchControls
│   ├── LessonList
│   │   └── Button
│   └── LessonEditor
│       └── Button
└── StateSnapshotDemo
    └── Button
```

这是职责图，不是要求每层都放 State。叶子展示组件可以是纯 Props → JSX。

## 23. 常见反模式

### 在 Render 中同步 State

```tsx
if (selectedId !== lesson.id) setSelectedId(lesson.id)
```

容易导致重复 Render 或循环。优先删除冗余 State、在 Event 中更新，或用 Key 明确重置身份。

### Props 复制到 State 后长期不同步

```tsx
const [title, setTitle] = useState(props.title)
```

Initializer 只在挂载时使用。它适合“初始值之后成为本地草稿”，但必须明确切换实体时是保留、由 Key 重置，还是上层拥有草稿。

### 每个派生值都用 `useMemo`

Memoization 增加依赖和调试成本。先保证计算纯且正确，再用 Profiler 证明瓶颈。

### Index/Random Key

它们破坏实体与组件 State 的对应。使用后端 ID 或领域稳定键。

### 为了共享状态提取自定义 Hook

Hook 复用逻辑，每次调用默认拥有独立 State。真正共享需要把 State 提升、Context 或外部 Store。

### 把 Hook 当生命周期回调集合

React Effect 的核心是“与外部系统同步”，不是机械对应 mounted/updated。下一课会专门拆解。

## 24. 完整示例结构

```text
examples/frontend/react-core-mental-model/
├── App.tsx
├── Button.tsx
├── LessonCatalog.tsx
├── LessonEditor.tsx
├── LessonList.tsx
├── RemoteDataView.tsx
├── SearchControls.tsx
├── StateSnapshotDemo.tsx
├── lesson-data.ts
├── main.tsx
└── types.ts
```

前文已经展示全部核心文件。以下补齐应用装配，保证页面直接包含全部源码。

### App

<<< ../../../examples/frontend/react-core-mental-model/App.tsx

示例没有包含 Vite/React 插件与依赖配置，因为本专题不得修改根 `package.json` 和构建配置。TSX 文件是完整教学源码，但当前工作树没有 React 类型和运行时依赖，因此不会假装完成 React 类型检查或运行构建。

## 25. 验证策略

本课示例在真实项目中应验证：

- `filterLessons()` 的关键词、空白、发布状态和大小写边界。
- 受控 Input 的值和 Callback Payload。
- 选择课程后 Editor 出现，切换 Key 后草稿重置。
- 列表重排后 State 仍绑定正确实体。
- Snapshot 按钮增加 1，函数式队列按钮增加 3。
- Strict Mode 下无 Render Mutation、重复副作用或 Warning。
- 键盘和屏幕阅读器能识别 Fieldset、Button 状态和异步消息。

测试应从 DOM 和用户行为观察结果，不要断言组件调用次数。Render 次数是 React 可调整的实现行为，除非正在进行受控性能诊断。

## 26. 生产检查清单

### Render

- 组件与 Hook 在 Render 中纯净。
- 不修改 Props、State、Context 或模块共享数据。
- 不在 Render 发请求、写 DOM、Storage 或遥测。
- 派生值能计算就不额外保存 State。

### State

- 每个 State 有唯一、合理的 Owner。
- 基于前值的更新使用函数式 Updater。
- 对象和数组按不可变协议更新。
- Key 表达真实身份，而不是隐藏 Warning。
- Props 初始化本地 State 的重置语义明确。

### TypeScript 与组件 API

- Props、Callback、Children 和异步状态有精确类型。
- 领域回调不泄漏 DOM Event。
- 原生包装组件保留 ARIA、disabled 和事件能力。
- 不用 `any`、非空断言掩盖边界问题。

### 工具

- 使用 Rules of Hooks 和相关 Lint 规则。
- 开发环境保留 Strict Mode。
- 性能优化来自测量，不是到处加 Memo。
- 错误、Loading、Empty 和成功状态都可访问。

## 27. 进一步阅读

- [React：Thinking in React](https://react.dev/learn/thinking-in-react)
- [React：Keeping Components Pure](https://react.dev/learn/keeping-components-pure)
- [React：Render and Commit](https://react.dev/learn/render-and-commit)
- [React：State as a Snapshot](https://react.dev/learn/state-as-a-snapshot)
- [React：Queueing a Series of State Updates](https://react.dev/learn/queueing-a-series-of-state-updates)
- [React：Preserving and Resetting State](https://react.dev/learn/preserving-and-resetting-state)
- [React：Using TypeScript](https://react.dev/learn/typescript)
- [React：Components and Hooks must be pure](https://react.dev/reference/rules/components-and-hooks-must-be-pure)

## 28. 本节小结

React 最重要的入门不是记忆 Hook，而是接受它的计算模型：组件函数可以重复执行，每次执行读取固定快照并纯粹描述 UI；Setter 把更新排入队列，下一次 Render 才看到新 State；真实 DOM 只在 Commit 中改变；树中位置、类型和 Key 决定 State 身份。

当 State 保持最小、派生值直接计算、组件契约使用 TypeScript 明确表达后，React 代码会比“用 Effect 手动同步一切”简单得多。下一课将在这个基础上进入 Effect、Ref、资源清理、异步竞态与自定义 Hook，解释 React 中真正需要副作用的边界。
