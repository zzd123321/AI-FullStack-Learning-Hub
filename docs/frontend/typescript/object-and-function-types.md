---
title: TypeScript 对象类型与函数类型
description: 系统掌握对象结构、属性修饰符、结构化类型、函数签名、回调、重载与严格函数检查
outline: deep
---

# TypeScript 对象类型与函数类型

> 适用环境：TypeScript 7.0.2、Node.js 22 或更高版本。本文涉及的核心语法同样适用于 TypeScript 5.9 和 6.x。

## 1. 学习目标

完成本节后，你应该能够：

- 使用匿名对象类型、`type` 和 `interface` 描述业务对象。
- 正确理解必填属性、可选属性、`readonly` 属性和索引签名。
- 解释 TypeScript 的结构化类型系统（Structural Type System）。
- 理解对象字面量的多余属性检查（Excess Property Check）。
- 使用函数类型表达式描述参数、返回值和回调函数。
- 正确设计可选参数、默认参数、剩余参数和回调参数。
- 区分 `void`、`undefined`、`never`、`unknown` 和 `Function`。
- 判断应该使用联合类型还是函数重载（Function Overload）。
- 理解 `strictFunctionTypes` 解决的安全问题。
- 为一个真实的课程仓库设计对象类型和函数契约。

## 2. 前置知识

学习本节前，建议已经理解：

- JavaScript 对象、数组、函数和回调函数。
- TypeScript 类型推断、类型标注和联合类型。
- `strict` 模式的基本作用。
- `undefined` 与属性不存在的区别。

如果这些概念还不熟悉，可以先复习[从 JavaScript 到 TypeScript](/frontend/typescript/from-javascript-to-typescript)。

## 3. 为什么对象类型和函数类型如此重要

一个应用的代码大致在做两件事：

1. 保存和传递数据。
2. 使用函数处理数据。

对象类型负责描述“数据应该长什么样”，函数类型负责描述“数据如何进入、如何被处理、最后返回什么”。

以课程保存接口为例：

```ts
function saveLesson(input) {
  // input 有哪些字段？
  // title 能否为空？
  // durationMinutes 是字符串还是数字？
  // 函数会返回课程，还是只返回 id？
}
```

没有类型时，这些信息只能存在于文档、注释或开发者记忆中。加入类型后，我们可以把约定变成编译器能够检查的契约：

```ts
interface CreateLessonInput {
  title: string
  durationMinutes: number
}

interface Lesson {
  readonly id: string
  title: string
  durationMinutes: number
}

type SaveLesson = (input: CreateLessonInput) => Lesson
```

这里同时建立了两种边界：

- 对象边界：课程输入和课程实体分别包含什么。
- 行为边界：保存函数接收什么、返回什么。

## 4. 描述对象的三种方式

### 4.1 匿名对象类型

对象结构简单并且只使用一次时，可以直接写在参数位置：

```ts
function printLesson(lesson: { title: string; durationMinutes: number }) {
  console.log(`${lesson.title}：${lesson.durationMinutes} 分钟`)
}
```

优点是就地可读，缺点是重复使用时会产生重复代码。

### 4.2 使用 `interface`

```ts
interface Lesson {
  title: string
  durationMinutes: number
}

function printLesson(lesson: Lesson): void {
  console.log(`${lesson.title}：${lesson.durationMinutes} 分钟`)
}
```

`interface` 主要用于描述对象、类实例和可扩展的公开契约。

### 4.3 使用 `type`

```ts
type Lesson = {
  title: string
  durationMinutes: number
}
```

在普通对象场景中，`type` 和 `interface` 能完成大量相同工作。不要把选择它们变成无意义的争论。

可以先遵循以下工程规则：

- 面向对象的公开契约、组件 Props 或希望扩展的对象结构：优先考虑 `interface`。
- 联合类型、交叉类型、元组、函数类型和类型运算：使用 `type`。
- 团队已经有统一规范：遵循团队规范。

它们的重要差异之一是接口可以声明合并（Declaration Merging）：

```ts
interface LessonMeta {
  author: string
}

interface LessonMeta {
  updatedAt: Date
}

// 最终同时需要 author 和 updatedAt。
const meta: LessonMeta = {
  author: 'Ada',
  updatedAt: new Date()
}
```

类型别名不能以同名方式重复声明。这种合并能力常用于扩展第三方库声明，但普通业务代码中不应依赖大量隐式合并。

## 5. 属性修饰符

### 5.1 必填属性

```ts
interface Lesson {
  title: string
  durationMinutes: number
}
```

创建 `Lesson` 时，两个字段都必须存在并满足对应类型。

### 5.2 可选属性 `?`

```ts
interface Lesson {
  title: string
  summary?: string
}
```

`summary?: string` 表示这个属性可以不存在。读取时，它的类型是 `string | undefined`：

```ts
function getSummary(lesson: Lesson): string {
  return lesson.summary ?? '暂无简介'
}
```

可选属性并不等同于“属性一定存在，但值可以是 `undefined`”。开启 `exactOptionalPropertyTypes` 后，区别会更加严格：

```ts
interface Lesson {
  summary?: string
}

const first: Lesson = {} // 正确：属性不存在
const second: Lesson = { summary: '类型系统' } // 正确

const third: Lesson = { summary: undefined }
// 开启 exactOptionalPropertyTypes 后报错。
```

如果业务确实允许显式写入 `undefined`，需要写成：

```ts
interface Lesson {
  summary?: string | undefined
}
```

这在 PATCH 请求、表单状态和对象序列化中尤其重要，因为“未提供字段”和“主动清空字段”经常代表不同业务含义。

### 5.3 只读属性 `readonly`

```ts
interface Lesson {
  readonly id: string
  title: string
}

const lesson: Lesson = {
  id: 'lesson-1',
  title: '对象类型'
}

lesson.title = '函数类型' // 正确
lesson.id = 'lesson-2' // 类型错误
```

`readonly` 有三个边界需要记住：

1. 它主要是编译阶段的约束，不会自动冻结运行时对象。
2. 它默认是浅层的，不会递归保护嵌套对象。
3. 它约束通过当前类型访问属性的方式，不一定代表底层对象永远不可修改。

```ts
interface Course {
  readonly metadata: {
    views: number
  }
}

const course: Course = {
  metadata: { views: 0 }
}

course.metadata = { views: 1 } // 类型错误
course.metadata.views += 1 // 正确，因为 readonly 只修饰 metadata 引用
```

需要保护数组内容时，可以使用 `readonly T[]`：

```ts
interface Lesson {
  tags: readonly string[]
}

function printTags(tags: readonly string[]): void {
  console.log(tags.join(', '))
  tags.push('new') // 类型错误
}
```

## 6. 索引签名：属性名暂时未知

如果对象的键在开发时无法全部列出，但值遵循统一规则，可以使用索引签名（Index Signature）：

```ts
interface LessonProgressMap {
  [lessonId: string]: number
}

const progress: LessonProgressMap = {
  'lesson-1': 100,
  'lesson-2': 40
}
```

也可以写成：

```ts
type LessonProgressMap = Record<string, number>
```

使用索引签名时，显式声明的同类属性也必须符合索引值类型：

```ts
interface Scores {
  [name: string]: number
  total: number
  label: string // 类型错误：string 不符合 number
}
```

不要在键集合已知时滥用 `Record<string, T>`。它会让任意字符串看起来都合法，拼写错误也更难发现。

键集合固定时，优先使用字面量联合：

```ts
type Difficulty = 'beginner' | 'intermediate' | 'advanced'
type DifficultyLabels = Record<Difficulty, string>

const labels: DifficultyLabels = {
  beginner: '入门',
  intermediate: '进阶',
  advanced: '高级'
}
```

## 7. 结构化类型系统

TypeScript 主要根据对象实际拥有的成员判断兼容性，而不是要求对象显式声明“实现了某个类型”。这叫结构化类型（Structural Typing），也常被形容为“只看形状”。

```ts
interface Titled {
  title: string
}

const lesson = {
  title: '对象类型',
  durationMinutes: 60
}

function printTitle(value: Titled): void {
  console.log(value.title)
}

printTitle(lesson) // 正确：lesson 至少拥有 title: string
```

这与 Java 中的名义类型系统（Nominal Type System）不同。Java 类通常需要明确 `implements` 某个接口；TypeScript 更关注值是否满足所需结构。

结构化类型的好处是非常适合 JavaScript 生态中的对象字面量、模块和回调函数；代价是“名字不同但结构相同”的类型可能互相兼容。

## 8. 多余属性检查不是精确对象类型

下面的直接调用会报错：

```ts
interface LessonTitle {
  title: string
}

function printTitle(lesson: LessonTitle): void {
  console.log(lesson.title)
}

printTitle({
  title: '函数类型',
  durationMinutes: 60
  // 错误：对象字面量包含未知属性 durationMinutes。
})
```

但是先保存到变量后可以通过：

```ts
const lesson = {
  title: '函数类型',
  durationMinutes: 60
}

printTitle(lesson) // 正确
```

原因不是 TypeScript 前后矛盾，而是它会对“新鲜的对象字面量”执行额外的拼写和属性检查；变量则按照结构兼容规则检查。

所以 `LessonTitle` 的含义是“至少具有 `title: string`”，不是“只能拥有 title”。如果业务要求运行时拒绝额外字段，需要使用专门的运行时校验方案。

## 9. 扩展和组合对象类型

### 9.1 接口继承

```ts
interface Entity {
  readonly id: string
  createdAt: Date
}

interface Lesson extends Entity {
  title: string
  durationMinutes: number
}
```

接口还可以扩展多个接口：

```ts
interface Searchable {
  keywords: readonly string[]
}

interface SearchableLesson extends Entity, Searchable {
  title: string
}
```

### 9.2 交叉类型

```ts
type Entity = {
  readonly id: string
  createdAt: Date
}

type LessonContent = {
  title: string
  durationMinutes: number
}

type Lesson = Entity & LessonContent
```

交叉类型 `A & B` 表示一个值同时满足 A 和 B。

如果同名属性无法兼容，交叉结果可能出现无法使用的 `never`：

```ts
type A = { id: string }
type B = { id: number }
type Impossible = A & B

// Impossible['id'] 是 string & number，也就是 never。
```

因此组合类型时要主动检查同名属性，而不是机械地使用 `&`。

## 10. 函数类型表达式

描述函数最直接的方式是函数类型表达式（Function Type Expression）：

```ts
type FormatLesson = (title: string, durationMinutes: number) => string

const formatLesson: FormatLesson = (title, durationMinutes) => {
  return `${title}：${durationMinutes} 分钟`
}
```

类型 `(title: string, durationMinutes: number) => string` 表示：

- 第一个参数必须是字符串。
- 第二个参数必须是数字。
- 返回值必须是字符串。

参数名称用于提高可读性，判断函数兼容性时主要考虑位置和类型，而不是参数名字。

### 10.1 上下文类型推断

当函数表达式被赋给一个已知函数类型时，参数类型可以从上下文推断：

```ts
type LessonPredicate = (lesson: Lesson) => boolean

const isLongLesson: LessonPredicate = (lesson) => {
  // lesson 被推断为 Lesson。
  return lesson.durationMinutes >= 60
}
```

这种能力叫上下文类型（Contextual Typing）。不要在类型已经明确的两边重复标注所有内容。

## 11. 调用签名和带属性的函数

JavaScript 函数本身也是对象，可以拥有属性。普通箭头形式无法同时描述调用方式和额外属性，这时可以使用调用签名（Call Signature）：

```ts
interface LessonFormatter {
  (lesson: Lesson): string
  locale: string
}

const formatter = ((lesson: Lesson) => lesson.title) as LessonFormatter
formatter.locale = 'zh-CN'
```

调用签名使用 `:` 分隔返回类型：

```ts
(lesson: Lesson): string
```

而函数类型表达式使用箭头：

```ts
(lesson: Lesson) => string
```

这种“可调用对象”在插件系统、验证器和带配置的工具函数中比较常见，普通业务函数不需要刻意设计成这种形式。

## 12. 返回类型：什么时候写，什么时候推断

局部小函数可以依靠推断：

```ts
const double = (value: number) => value * 2
// 推断为 (value: number) => number
```

以下场景建议明确标注返回类型：

- 导出的公共函数。
- 服务层、数据访问层等重要边界。
- 递归函数。
- 希望限制实现细节泄漏的函数。
- 返回对象结构复杂，错误返回值可能被推断成联合类型的函数。

```ts
interface LessonSummary {
  id: string
  title: string
}

function toSummary(lesson: Lesson): LessonSummary {
  return {
    id: lesson.id,
    title: lesson.title
  }
}
```

明确返回 `LessonSummary` 后，实现不会意外把内部字段暴露成公共契约。

## 13. 可选参数、默认参数和剩余参数

### 13.1 可选参数

```ts
function formatTitle(title: string, prefix?: string): string {
  return prefix ? `${prefix}：${title}` : title
}
```

在函数体内，`prefix` 的类型是 `string | undefined`。

必填参数不能放在可选参数后面：

```ts
function bad(optional?: string, required: number) {}
// 错误：必填参数不能跟在可选参数后面。
```

### 13.2 默认参数

```ts
function formatTitle(title: string, prefix = '课程'): string {
  return `${prefix}：${title}`
}
```

调用方可以省略 `prefix`，函数体内它已经是 `string`，不需要再次处理 `undefined`。

### 13.3 剩余参数

```ts
function addTags(lessonId: string, ...tags: string[]): void {
  console.log(lessonId, tags)
}

addTags('lesson-1', 'typescript', '函数')
```

剩余参数必须是数组或元组类型，并放在参数列表最后。

## 14. 回调参数最容易出现的误区

假设我们声明一个遍历函数：

```ts
function forEachLesson(
  lessons: readonly Lesson[],
  callback: (lesson: Lesson, index: number) => void
): void {
  lessons.forEach(callback)
}
```

调用方可以只声明自己需要的参数：

```ts
forEachLesson(lessons, (lesson) => {
  console.log(lesson.title)
})
```

不要为了允许调用方省略 `index`，把它写成可选参数：

```ts
callback: (lesson: Lesson, index?: number) => void
```

这句话真正表达的是：“实现 `forEachLesson` 的人可能不传 index。”于是调用方使用 `index` 时必须处理 `undefined`。

> 设计回调类型时，只有当调用回调的一方确实可能不传某个参数，才把它标记为可选。

## 15. `void`、`undefined`、`never`、`unknown` 和 `Function`

### 15.1 `void`

`void` 表示调用者不应使用函数的返回结果：

```ts
type Logger = (message: string) => void
```

JavaScript 中未显式返回值的函数运行时会返回 `undefined`，但 TypeScript 中 `void` 和 `undefined` 不是同一个概念。

有一个重要规则：一个实际返回值的函数可以赋给返回 `void` 的回调类型，返回值会被忽略。

```ts
const numbers: number[] = []

;[1, 2, 3].forEach((value) => numbers.push(value))
// push 返回 number，但 forEach 忽略这个返回值。
```

但是函数实现如果被显式声明为 `(): void`，就不能主动返回一个值：

```ts
function log(): void {
  return true // 类型错误
}
```

### 15.2 `undefined`

`undefined` 是一个实际值和实际类型。返回 `undefined` 的函数可以明确写成：

```ts
function findNothing(): undefined {
  return undefined
}
```

### 15.3 `never`

`never` 表示函数永远无法正常返回，或者某个联合类型已经没有剩余情况：

```ts
function fail(message: string): never {
  throw new Error(message)
}
```

它也可以用于穷尽性检查：

```ts
type LessonStatus = 'draft' | 'published' | 'archived'

function assertNever(value: never): never {
  throw new Error(`未知状态：${String(value)}`)
}

function getStatusLabel(status: LessonStatus): string {
  switch (status) {
    case 'draft':
      return '草稿'
    case 'published':
      return '已发布'
    case 'archived':
      return '已归档'
    default:
      return assertNever(status)
  }
}
```

以后向 `LessonStatus` 增加新状态但忘记处理时，编译器会在 `assertNever` 处提示。

### 15.4 `unknown`

`unknown` 表示类型暂时未知，使用前必须检查：

```ts
function parseJson(text: string): unknown {
  return JSON.parse(text)
}

const value = parseJson('{"title":"TypeScript"}')

if (
  typeof value === 'object' &&
  value !== null &&
  'title' in value &&
  typeof value.title === 'string'
) {
  console.log(value.title)
}
```

外部接口、JSON、浏览器存储和用户输入都属于典型的未知边界。

### 15.5 不要使用全局 `Function` 类型

```ts
function run(callback: Function) {
  callback('unexpected', 123) // 几乎失去参数和返回值检查
}
```

应该描述真实调用方式：

```ts
function run(callback: () => void): void {
  callback()
}
```

如果函数参数和返回值真的完全未知，可以根据目的使用更明确的类型：

```ts
type UnknownFunction = (...args: never[]) => unknown
```

但普通业务接口应尽可能描述具体签名。

## 16. 联合类型与函数重载

如果多种输入采用相同处理方式并返回相同类型，优先使用联合类型：

```ts
function getLength(value: string | readonly unknown[]): number {
  return value.length
}
```

不要无意义地写成两个重载：

```ts
function getLength(value: string): number
function getLength(value: readonly unknown[]): number
```

当参数组合不同，或者输入类型与返回类型存在明确对应关系时，重载才更有价值：

```ts
interface Lesson {
  id: string
  title: string
}

function normalizeLesson(input: string): string
function normalizeLesson(input: Lesson): Lesson
function normalizeLesson(input: string | Lesson): string | Lesson {
  if (typeof input === 'string') {
    return input.trim()
  }

  return {
    ...input,
    title: input.title.trim()
  }
}
```

重载有三个关键规则：

1. 对外可调用的是重载签名。
2. 实现签名必须兼容所有重载。
3. 调用方不能直接依赖只存在于实现签名中的调用方式。

重载过多通常意味着 API 设计过于复杂，可以考虑拆分函数或使用可辨识联合类型。

## 17. 函数兼容性与 `strictFunctionTypes`

设想一个函数可能接收字符串或数字：

```ts
type StringOrNumberHandler = (value: string | number) => void

const stringOnly = (value: string): void => {
  console.log(value.toLowerCase())
}

const handler: StringOrNumberHandler = stringOnly
```

这个赋值是不安全的，因为之后可以调用 `handler(10)`，而 `stringOnly` 无法处理数字。

启用 `strictFunctionTypes` 后，这类函数属性赋值会被拒绝。它已包含在 `strict` 中。

需要注意：由于历史兼容原因，这项严格检查主要应用于函数属性语法，而不完全应用于方法语法：

```ts
interface FunctionProperty {
  handle: (value: string | number) => void
}

interface MethodSyntax {
  handle(value: string | number): void
}
```

设计回调、事件处理器和策略对象时，理解这种差异有助于避免把过窄的处理函数放到更宽的调用位置。

## 18. 完整项目示例：内存课程仓库

本节提供了一份可直接编译运行的示例：

```text
examples/typescript/object-and-function-types.ts
```

<<< ../../../examples/typescript/object-and-function-types.ts

运行环境：

```text
Node.js >= 22
TypeScript 7.0.2
strict: true
exactOptionalPropertyTypes: true
noUncheckedIndexedAccess: true
```

运行命令：

```bash
npm run example:ts:object-functions
```

示例定义了：

- `Lesson`：课程实体对象。
- `CreateLessonInput`：新建课程的输入对象。
- `LessonPredicate`：课程筛选回调。
- `LessonMapper`：课程映射回调。
- `LessonRepository`：仓库行为契约。
- `assertNever`：状态穷尽性检查。

核心仓库类型：

```ts
interface LessonRepository {
  getAll: () => readonly Lesson[]
  findById: (id: string) => Lesson | undefined
  save: (input: CreateLessonInput) => Lesson
}
```

这里使用函数属性而不是方法语法，让 `strictFunctionTypes` 能更严格地检查函数参数。

预期输出的主要内容：

```text
新建课程： TypeScript 对象类型与函数类型
可学习课程数： 1
课程摘要： [...]
```

### 执行过程

1. `createLessonRepository` 接收只读课程数组，避免修改调用方数组。
2. 仓库内部复制初始对象和标签数组，建立自己的可变状态。
3. `save` 接收 `CreateLessonInput`，生成只读 id 和默认草稿状态。
4. `summary` 不存在时不向结果对象写入该属性，以符合 `exactOptionalPropertyTypes`。
5. `getAll` 和 `findById` 返回对象及标签数组的副本，避免调用方直接修改仓库内部状态。
6. `selectLessons` 使用 `LessonPredicate` 约束回调参数。
7. `mapLessons` 把课程实体转换成展示摘要。
8. `getStatusLabel` 使用 `never` 保证所有状态都被处理。

> [!WARNING]
> 示例中的对象复制仍然是浅复制。真实项目如果包含深层可变对象，需要设计更清晰的不可变数据边界，而不是误以为展开运算符等于深拷贝。

## 19. 常见错误

### 19.1 使用 `Object`、`{}` 表示普通对象

```ts
function handle(value: Object) {}
function handleOther(value: {}) {}
```

`Object`、`object` 和 `{}` 含义不同。通常应该描述具体业务结构；只想排除原始类型时才考虑小写 `object`。

### 19.2 把可选属性当成必定存在

```ts
interface Lesson {
  summary?: string
}

function print(lesson: Lesson): void {
  console.log(lesson.summary.toUpperCase())
  // summary 可能是 undefined。
}
```

需要使用条件判断、可选链或空值合并：

```ts
console.log(lesson.summary?.toUpperCase() ?? '暂无简介')
```

### 19.3 误以为 `readonly` 等于运行时冻结

`readonly` 会被编译器检查，但不会自动调用 `Object.freeze`，也不会递归冻结嵌套对象。

### 19.4 给回调参数错误地添加 `?`

可选回调参数表示调用方可能收不到该参数，不是表示实现函数可以少写一个形参。

### 19.5 使用 `Function` 或大量 `any`

这会让函数边界失去主要价值。应描述真实参数与返回值，未知边界优先使用 `unknown`。

### 19.6 依靠类型断言绕过对象错误

```ts
const lesson = apiData as Lesson
```

断言不验证运行时数据。外部数据需要真正的运行时校验。

### 19.7 把多余属性检查当成精确类型

TypeScript 的对象类型通常描述“至少需要哪些属性”，不是运行时白名单。

### 19.8 重载签名与实现签名不兼容

实现必须能够处理所有重载输入，并返回所有重载允许的结果；实现签名本身不会自动成为对外可调用签名。

## 20. 工程最佳实践

- 为领域对象、接口请求和模块边界命名类型，局部一次性对象可以使用匿名类型。
- 区分实体类型、创建输入、更新输入和展示输出，不要用一个超大接口覆盖所有场景。
- id、创建时间等不应由调用方随意修改的字段使用 `readonly` 表达意图。
- 对外部数据使用 `unknown` 加运行时校验，不要直接断言为业务类型。
- 回调函数只把真正可能缺失的参数标记为可选。
- 公共函数显式标注返回类型，避免实现细节意外扩大 API。
- 能用联合参数清晰表达时，不使用重载。
- 开启 `strict`；需要严格区分缺失属性和显式 `undefined` 时，再开启 `exactOptionalPropertyTypes`。
- 对固定键集合使用字面量联合配合 `Record`，避免宽泛的字符串索引。
- 让函数接收只读数组，除非它的职责就是修改传入数组。
- 使用 `never` 为状态机和可辨识联合类型建立穷尽性检查。

## 21. 与 Java、Vue 的联系

### 与 Java 接口对比

Java 接口通常依赖显式实现关系，TypeScript 接口主要依赖结构兼容。一个对象不需要写 `implements Lesson`，只要结构满足 `Lesson` 就可以使用。

### 与 Vue 组件 Props 对比

Vue 3 中的组件 Props 本质上也是对象契约：

```ts
interface Props {
  lesson: Lesson
  selected?: boolean
  onOpen: (id: string) => void
}
```

这里同时包含对象类型和函数类型。本节是后续学习 Vue 3 TypeScript 组件设计的直接基础。

### 与后端 DTO 对比

`CreateLessonInput` 类似 Java 后端中的创建请求 DTO；`Lesson` 类似领域实体或响应模型。前后端都应该区分不同数据生命周期，而不是让一个模型承担所有职责。

## 22. 面试题

### `type` 和 `interface` 有什么区别？

两者都能描述对象结构。`interface` 支持声明合并并自然地表达可扩展对象契约；`type` 能表示联合、交叉、元组、函数以及类型运算。普通对象场景中两者高度重叠，应结合团队规范和表达目的选择。

### TypeScript 为什么允许属性更多的对象赋给属性较少的类型？

因为 TypeScript 使用结构化类型系统。目标类型要求的成员只要存在且类型兼容，额外成员通常不影响兼容性；但新鲜对象字面量会额外执行多余属性检查，以帮助发现拼写错误。

### `readonly` 能否保证对象运行时不可变？

不能。它主要是编译阶段、当前访问路径上的浅层约束。运行时冻结需要 `Object.freeze` 等机制，深层不可变还需要递归类型和相应运行时策略。

### `void` 与 `undefined` 有什么区别？

`undefined` 是一个实际值和类型；函数类型中的 `void` 主要表示调用者不使用返回结果。一个实际返回值的函数可以在某些情况下赋给返回 `void` 的回调类型，其返回值会被忽略。

### 什么时候使用函数重载？

当不同参数组合具有明确、不同的调用方式，尤其输入类型与返回类型存在对应关系时可以使用重载。如果只是接受几个类型并返回同一种类型，通常优先使用联合参数。

### `strictFunctionTypes` 解决什么问题？

它阻止把只能处理更窄输入的函数赋给可能接收更宽输入的函数位置，避免调用时传入实现无法处理的值。由于历史兼容，它对函数属性语法的检查比方法语法更严格。

### 为什么外部 JSON 不能直接断言为接口类型？

接口和类型别名在运行时通常不存在，断言也不会验证数据。外部 JSON 可能缺字段、类型错误或包含恶意内容，需要运行时校验后才能进入可信业务区域。

## 23. 本节总结

- 对象类型描述数据结构，函数类型描述行为契约。
- `interface` 和 `type` 在对象场景中大量重叠，但扩展能力和表达范围不同。
- 可选属性表示属性可能不存在；`exactOptionalPropertyTypes` 会严格区分缺失与显式 `undefined`。
- `readonly` 是浅层的编译时约束，不等于运行时冻结。
- TypeScript 使用结构化类型系统，兼容性主要取决于成员形状。
- 对象字面量会执行额外的多余属性检查，但这不是精确对象类型。
- 函数类型应该准确描述调用方会收到的参数和可使用的返回值。
- 回调参数只有在调用者真的可能不传时才标记为可选。
- `void`、`undefined`、`never` 和 `unknown` 各自表达不同语义。
- 联合类型能清晰解决问题时优先于重载。
- `strictFunctionTypes` 能阻止一部分不安全的函数赋值。

## 24. 下一步学习

下一节建议学习：**TypeScript 联合类型、交叉类型与类型收窄进阶**。

学完后，你将能够：

- 用可辨识联合类型表达完整业务状态。
- 使用 `in`、`typeof`、`instanceof` 和类型谓词收窄类型。
- 使用 `never` 检查状态处理是否完整。
- 为 Vue 组件异步状态和后端接口结果建立安全模型。

## 25. 参考资料

- [TypeScript Handbook：Object Types](https://www.typescriptlang.org/docs/handbook/2/objects.html)
- [TypeScript Handbook：More on Functions](https://www.typescriptlang.org/docs/handbook/2/functions.html)
- [TypeScript Handbook：Type Compatibility](https://www.typescriptlang.org/docs/handbook/type-compatibility.html)
- [TSConfig：strictFunctionTypes](https://www.typescriptlang.org/tsconfig/strictFunctionTypes.html)
- [TSConfig：exactOptionalPropertyTypes](https://www.typescriptlang.org/tsconfig/exactOptionalPropertyTypes.html)
- [TSConfig：noUncheckedIndexedAccess](https://www.typescriptlang.org/tsconfig/noUncheckedIndexedAccess.html)
