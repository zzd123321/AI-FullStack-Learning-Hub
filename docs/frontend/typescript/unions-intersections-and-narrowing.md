---
title: TypeScript 联合类型、交叉类型与类型收窄
description: 从请求状态建模出发，理解联合类型、运行时收窄、可辨识联合、穷尽检查与交叉类型
outline: deep
---

# TypeScript 联合类型、交叉类型与类型收窄

[上一课](/frontend/typescript/object-and-function-types)学习了怎样描述一份确定的对象和一个确定的函数签名。但真实业务中的值经常存在多种可能：

- 路由参数可能是数字，也可能是字符串；
- 查询结果可能找到课程，也可能得到 `undefined`；
- 请求可能正在加载、成功或失败；
- 捕获到的异常可能是 `Error`，也可能是任意 JavaScript 值。

联合类型负责表达这些可能性，类型收窄负责用真实的运行时证据排除可能性。

```text
联合类型：现在可能是什么
      ↓ 条件判断提供证据
类型收窄：在当前代码路径中已经确定是什么
```

这一课最终要解决的不是“会写 `string | number`”，而是怎样让非法业务状态更难进入代码。

## 从一个容易矛盾的请求状态开始

很多页面会这样保存请求状态：

```ts
interface RequestState {
  loading: boolean
  data?: Lesson[]
  error?: string
}
```

它允许构造出：

```ts
const impossible: RequestState = {
  loading: true,
  data: [],
  error: '请求失败'
}
```

类型无法判断这是否矛盾，因为我们告诉它三个字段可以自由组合。

业务事实其实是：请求在某一刻只能处于一种状态，而且每种状态拥有不同数据。

```ts
type RequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: readonly Lesson[] }
  | { status: 'error'; message: string }
```

这个模型会贯穿整课。先从最小的联合类型开始，再一步步推导到请求状态。

## 联合类型表示“候选类型之一”

使用 `|` 连接候选类型：

```ts
type LessonId = string | number
```

运行时的值仍然只有一个：

```ts
const first: LessonId = 'ts-03'
const second: LessonId = 3
```

`string | number` 不是一个同时拥有字符串和数字能力的新对象。它表示当前代码还不知道具体是哪一种。

### 收窄前只能使用共同能力

```ts
function normalizeId(id: string | number): string {
  return id.toString()
}
```

字符串和数字都能调用 `toString()`，所以安全。

```ts
function normalizeId(id: string | number): string {
  return id.toUpperCase()
  // number 没有 toUpperCase()。
}
```

虽然候选值变多了，未经判断时能直接使用的能力反而更少，因为每个操作必须对所有候选成员都安全。

### 字面量联合把宽泛字符串变成有限集合

```ts
type LessonStatus = 'draft' | 'published' | 'archived'
```

相比 `string`，它能够发现拼写错误：

```ts
function changeStatus(status: LessonStatus): void {
  console.log(status)
}

changeStatus('published')
changeStatus('publised')
// 错误：publised 不在允许集合中。
```

字面量联合适合状态、角色、组件尺寸和有限协议值，但不要用它伪装无限集合。例如用户名不是有限枚举，仍应是普通 `string`。

### 注意字面量类型可能被扩大

```ts
let status = 'loading'
// 推断为 string，因为以后可以赋成其他字符串。

const fixedStatus = 'loading'
// 推断为字面量 "loading"。
```

对象即使用 `const` 声明，属性仍可能被修改：

```ts
const state = { status: 'loading' }
// state.status 通常被扩大为 string。
```

提供目标类型通常最清楚：

```ts
const state: RequestState = { status: 'loading' }
```

也可以使用 `as const` 保留字面量并把属性推断为只读：

```ts
const state = { status: 'loading' } as const
```

`as const` 只影响类型推断，不会在运行时冻结对象。

---

## 收窄就是用运行时证据排除候选项

### `typeof` 适合区分基本类型和函数

```ts
function formatId(id: string | number): string {
  if (typeof id === 'string') {
    return id.trim().toUpperCase()
  }

  return id.toFixed(0)
}
```

在 `if` 分支中，运行时判断证明 `id` 是字符串。字符串分支已经返回，后面的路径只剩数字。

```text
id: string | number
        ↓ typeof id === 'string'
    是 /                 \ 否
string                   number
```

TypeScript 能识别 JavaScript `typeof` 的常见结果，如 `string`、`number`、`boolean`、`undefined`、`function` 和 `object`。

要记住 JavaScript 的历史行为：

```ts
typeof null === 'object' // true
```

所以判断对象时要同时排除 `null`：

```ts
function printKeys(value: object | null): void {
  if (value !== null && typeof value === 'object') {
    console.log(Object.keys(value))
  }
}
```

### 明确判断空值，避免真值判断改变业务含义

下面的判断会同时排除 `null`、空字符串等假值：

```ts
function getLabel(value: string | null): string {
  if (value) return value
  return '未填写'
}
```

如果空字符串是合法值，这就错误地把它当作缺失。只想排除 `null` 时应明确写：

```ts
function getLabel(value: string | null): string {
  if (value !== null) return value
  return '未填写'
}
```

同理，`if (count)` 会排除合法的 `0`。只有当所有假值都代表同一种业务情况时，真值判断才合适。

### 相等判断可以关联多个变量

```ts
function compare(
  left: string | number,
  right: string | boolean
): void {
  if (left === right) {
    // 两个联合中唯一共同的类型是 string。
    console.log(left.toUpperCase(), right.toUpperCase())
  }
}
```

通常优先使用 `===` 和 `!==`，避免隐式转换。`value != null` 可以同时排除 `null` 和 `undefined`，但团队若禁止宽松相等，写成两个显式判断更容易统一理解。

### `in` 适合按对象属性区分

```ts
interface VideoLesson {
  videoUrl: string
}

interface ArticleLesson {
  content: string
}

function getResource(lesson: VideoLesson | ArticleLesson): string {
  if ('videoUrl' in lesson) {
    return lesson.videoUrl
  }

  return lesson.content
}
```

如果属性是可选的，它可能出现在两个分支里，收窄结果就不会像必填独有属性一样明确。因此业务变体更推荐使用稍后介绍的共同状态字段。

对外部 `unknown` 使用 `in` 前，还要先证明它是非空对象，否则运行时会报错。

### `instanceof` 适合类实例和内置对象

```ts
function formatDate(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString()
  }

  return new Date(value).toISOString()
}
```

`instanceof` 检查原型链。接口和类型别名在运行时已经不存在，不能写 `value instanceof Lesson`。

普通 JSON 数据通常没有自定义类实例原型，更适合检查结构或可辨识字段。数组应使用 `Array.isArray()`：

```ts
function getCount(value: string | string[]): number {
  if (Array.isArray(value)) return value.length
  return value.trim().length
}
```

## 控制流分析会沿代码路径更新类型

TypeScript 不只看某一个判断，还会分析返回、赋值和代码可达性。

### 提前返回让剩余路径更简单

```ts
function normalize(value: string | null): string {
  if (value === null) return ''

  // null 路径已经结束，这里只剩 string。
  return value.trim()
}
```

相比多层嵌套，先处理无效或特殊情况并提前返回，往往同时改善运行逻辑和类型推断。

### 重新赋值会改变当前位置的观察类型

```ts
let value: string | number = Math.random() > 0.5 ? '42' : 42

if (typeof value === 'string') {
  value = value.trim()
  // 当前仍是 string。
}

value = 100
// 合法：变量声明类型仍然允许 number。
```

收窄只影响某个控制流位置，不会永久改写变量声明类型。

### 异步回调前可以保存已收窄快照

可变变量在回调执行前可能被其他代码修改，编译器不能总是假设之前的判断仍成立：

```ts
let title: string | undefined = 'TypeScript'

if (title !== undefined) {
  const currentTitle = title

  setTimeout(() => {
    console.log(currentTitle.toUpperCase())
  }, 0)
}

title = undefined
```

`currentTitle` 是判断后创建的不可变快照，闭包中的含义明确。这个思路以后也会出现在 React State 快照和异步竞态处理中。

---

## 可辨识联合把状态和对应数据绑定起来

请求状态的每个成员都包含 `status`，且值是不同字面量：

```ts
type LessonRequestState =
  | { status: 'idle' }
  | { status: 'loading'; startedAt: number }
  | { status: 'success'; data: readonly Lesson[] }
  | { status: 'error'; message: string }
```

`status` 是可辨识字段。判断它时，整个对象一起收窄：

```ts
function renderState(state: LessonRequestState): string {
  switch (state.status) {
    case 'idle':
      return '尚未请求'
    case 'loading':
      return `开始时间：${state.startedAt}`
    case 'success':
      return `共 ${state.data.length} 节课程`
    case 'error':
      return state.message
  }
}
```

成功分支一定有 `data`，错误分支一定有 `message`。其他状态根本不存在这些字段。

这比一个包含多个可选字段的对象更准确：

```ts
interface LooseState {
  status: 'idle' | 'loading' | 'success' | 'error'
  data?: readonly Lesson[]
  message?: string
}
```

`LooseState` 只让每个字段各自合法，没有表达字段之间的关联。它仍允许成功但没有数据，或者加载时携带错误。

### 可选属性和状态联合解决不同问题

可选属性适合独立信息：

```ts
interface LessonCard {
  title: string
  summary?: string
}
```

可辨识联合适合互斥分支：

```ts
type Action =
  | { kind: 'link'; href: string }
  | { kind: 'button'; onClick: () => void }
```

如果某个字段是否必填取决于另一个字段，通常应该考虑对象联合，而不是继续增加 `?`。

### 用 `never` 让状态处理保持完整

```ts
function assertNever(value: never): never {
  throw new Error(`未处理的状态：${JSON.stringify(value)}`)
}

function renderState(state: LessonRequestState): string {
  switch (state.status) {
    case 'idle':
      return '尚未请求'
    case 'loading':
      return '正在加载'
    case 'success':
      return `共 ${state.data.length} 节课程`
    case 'error':
      return state.message
    default:
      return assertNever(state)
  }
}
```

所有成员处理完后，`default` 中的 `state` 应该是 `never`，表示不可能出现值。

如果以后向联合增加 `refreshing`，却忘记增加分支，`state` 不再是 `never`，编译器会在 `assertNever` 处提示。这让“新增状态后哪些地方必须同步修改”更容易被发现。

---

## 自定义守卫把复杂判断变成可复用证据

外部接口数据通常从 `unknown` 开始。先建立一个通用对象判断：

```ts
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
```

返回类型 `value is Record<string, unknown>` 叫类型谓词。它告诉 TypeScript：返回 `true` 时，调用方可以把 `value` 当作该类型。

继续验证课程：

```ts
function isLesson(value: unknown): value is Lesson {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.durationMinutes === 'number'
    && Number.isFinite(value.durationMinutes)
    && value.durationMinutes > 0
}
```

使用：

```ts
if (isLesson(payload)) {
  console.log(payload.title.toUpperCase())
}
```

类型谓词是一份开发者承诺。编译器不会证明实现真的足够：

```ts
function isLessonUnsafe(value: unknown): value is Lesson {
  return true
}
```

这能通过类型检查，却会把任何值伪装成课程。谓词必须验证后续代码依赖的全部字段。复杂接口应使用集中维护的 Schema，而不是在各组件里复制不完整守卫。

### 断言函数适合“失败就不能继续”的边界

```ts
function assertLesson(value: unknown): asserts value is Lesson {
  if (!isLesson(value)) {
    throw new TypeError('课程数据格式不正确')
  }
}

function parseLesson(value: unknown): Lesson {
  assertLesson(value)
  return value
}
```

类型谓词返回布尔值，调用方可以决定失败分支；断言函数失败时抛出，正常返回就证明条件成立。

它与 `as Lesson` 不同：断言函数必须执行真实运行时检查，类型断言只要求编译器相信开发者。

---

## 交叉类型表示“同时满足多个契约”

联合使用 `|` 表示候选之一，交叉使用 `&` 表示同时满足：

```ts
interface HasRequestId {
  requestId: string
}

interface HasTimestamp {
  timestamp: number
}

type RequestMetadata = HasRequestId & HasTimestamp
```

合法值必须拥有两边字段：

```ts
const metadata: RequestMetadata = {
  requestId: 'req-001',
  timestamp: Date.now()
}
```

请求跟踪信息也可以附加到每一种状态：

```ts
type TrackedRequestState = LessonRequestState & HasRequestId
```

它适合组合彼此独立、没有冲突的能力。类型表达式本身不会在运行时合并对象，真实值仍需通过对象字面量、展开运算符或其他逻辑创建。

### 同名属性必须同时满足两边

```ts
type StringId = { id: string }
type NumberId = { id: number }
type Impossible = StringId & NumberId
```

`id` 必须同时是字符串和数字，结果是 `never`，正常值无法满足。

这不是对象展开的“后者覆盖前者”。出现冲突通常说明：

- 两个业务概念本来就不应组合；
- 属性命名太宽泛；
- 实际需要的是二选一的联合类型；
- 应先明确删除旧字段，再定义新契约。

不要使用双重类型断言强行制造无法满足的交叉类型。

## 联合参数还是函数重载

[上一课](/frontend/typescript/object-and-function-types)暂缓了重载，因为先理解联合后更容易做选择。

如果多个输入走相同逻辑并返回同一种类型，优先联合参数：

```ts
function getLength(value: string | readonly unknown[]): number {
  return value.length
}
```

当调用形式不同，而且输入和返回存在明确对应关系时，重载才有价值：

```ts
function normalize(input: string): string
function normalize(input: readonly string[]): string[]
function normalize(
  input: string | readonly string[]
): string | string[] {
  return typeof input === 'string'
    ? input.trim()
    : input.map((item) => item.trim())
}
```

重载签名是调用方看到的契约，实现签名必须能够处理全部重载。重载数量不断增加时，通常应检查 API 是否承担了太多职责。

---

## 完整示例：从未知 JSON 到可信请求状态

这篇保留完整示例，因为它需要把运行时校验、状态联合、穷尽检查和跟踪信息组合成一条真实边界：

```text
JSON 字符串
    ↓ JSON.parse
unknown
    ↓ 类型守卫与断言函数
readonly Lesson[]
    ↓ 构造状态
TrackedLessonRequestState
    ↓ status 收窄
可展示文本
```

<<< ../../../examples/typescript/unions-intersections-and-narrowing.ts

运行：

```bash
node --experimental-strip-types examples/typescript/unions-intersections-and-narrowing.ts
```

预期输出包含一次成功和一次校验失败：

```text
[req-001] 已加载 1 节课程
[req-002] INVALID_LESSON_PAYLOAD：接口返回的课程列表格式不正确
```

示例中成功状态只保存已经校验的 `Lesson[]`。这样业务层不需要在每次读取标题时重复验证，边界外保持未知，边界内保持可信。

## 常见问题：先检查证据是否真实

### 联合值不能调用某个方法

检查该方法是否对联合中的每个成员都安全。如果只属于某个成员，先通过 `typeof`、可辨识字段或其他真实判断收窄。

### `typeof value === 'object'` 后仍提示可能为 null

这是 JavaScript 的历史行为。增加 `value !== null`，并继续检查真正需要的字段。

### `if (value)` 把 0 或空字符串过滤掉

真值判断排除所有假值。只想排除 `null` 或 `undefined` 时，使用明确相等判断。

### 使用 `as` 后不再报错，但运行时崩溃

`as` 没有提供运行时证据，也不转换数据。外部值应通过守卫、断言函数或 Schema 验证。

### `isLesson` 返回 true 后仍然读到坏数据

类型谓词实现可能没有验证完整契约。检查它是否验证了后续依赖的每个字段、数组元素和业务范围。

### 交叉类型中的属性变成 `never`

两边给同名字段施加了无法同时满足的约束。重新检查模型，不要用断言压掉冲突。

### 新增状态后旧代码没有提示

关键状态处理使用 `switch` 配合 `assertNever`。没有穷尽性检查时，新增成员可能落入宽泛默认分支。

## 本课的核心判断顺序

面对一份存在多种形态的数据，可以按以下顺序思考：

1. 这些情况是可以同时存在，还是互斥选择？
2. 互斥时使用联合；同时满足时才考虑交叉。
3. 对象成员之间是否存在“某字段决定其他字段”的关联？
4. 有关联时使用共同字面量字段建立可辨识联合。
5. 使用这份数据前，运行时能提供什么证据？
6. 简单证据直接判断，复杂边界封装守卫或 Schema。
7. 关键状态是否需要 `never` 保证处理完整？

## 下一课

下一节是[泛型基础与约束](/frontend/typescript/generics-and-constraints)。联合类型能表达“输入属于哪些候选”，泛型则解决另一类问题：

- 输入是什么类型，输出就保持同一种类型；
- 数组元素、接口数据和回调参数之间怎样建立关联；
- 为什么 `any` 会丢失关联，而泛型可以保留；
- 怎样使用约束说明泛型至少需要哪些能力。

## 参考资料

- [TypeScript Handbook：Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
- [TypeScript Handbook：Everyday Types - Union Types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#union-types)
- [TypeScript Handbook：Object Types - Intersection Types](https://www.typescriptlang.org/docs/handbook/2/objects.html#intersection-types)
- [TypeScript Handbook：Function Overloads](https://www.typescriptlang.org/docs/handbook/2/functions.html#function-overloads)
- [MDN：typeof](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Operators/typeof)
- [MDN：in operator](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Operators/in)
- [MDN：instanceof](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Operators/instanceof)
