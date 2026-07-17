---
title: TypeScript 对象类型与函数类型
description: 从课程保存功能出发，掌握对象字段、可选与只读属性、函数输入输出、回调契约和结构化类型
outline: deep
---

# TypeScript 对象类型与函数类型

[上一课：从 JavaScript 到 TypeScript](/frontend/typescript/from-javascript-to-typescript)解决了一个总体问题：TypeScript 能把代码中的隐含假设写成可检查的契约。

这一课只专注两类最常见的契约：

```text
对象类型：一份数据应该包含什么
函数类型：一段代码接收什么，又返回什么
```

前端项目的大部分类型最终都会落到这两件事上。接口响应、Vue Props、React Props 和 Store State 都是对象；事件处理器、请求函数、数组回调和组件事件都是函数。

我们会围绕“创建并查询课程”逐步建立这些契约，而不是一次罗列所有对象和函数高级语法。

## 本课与前后课程的关系

```text
上一课：类型推断、unknown 与运行时边界
                    ↓
本课：准确描述对象和函数
                    ↓
下一课：当一个值存在多种可能时，使用联合类型和收窄
                    ↓
后续：用泛型复用对象与函数契约
```

学完本课，你应该能够：

- 用对象类型描述必填、可选和只读字段；
- 根据数据生命周期拆分实体、创建输入和展示输出；
- 理解 `type` 与 `interface` 的常用选择，不陷入无意义争论；
- 为函数参数、返回值和回调建立清楚契约；
- 正确设计可选参数、默认参数和回调参数；
- 解释结构化类型与对象字面量多余属性检查；
- 使用只读参数表达函数不会修改调用方数据；
- 识别 `Function`、错误可选回调参数和直接修改输入等常见问题。

## 从一个没有契约的保存函数开始

JavaScript 中可以这样保存课程：

```js
function saveLesson(input) {
  return {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    durationMinutes: input.durationMinutes,
    tags: input.tags || []
  }
}
```

代码没有回答以下问题：

- `input` 必须有哪些字段？
- `title` 能不能是 `null`？
- `tags` 是字符串还是数组？
- 调用方是否需要提前传 `id`？
- 返回对象一定包含哪些字段？

TypeScript 先把输入和结果分别命名：

```ts
interface CreateLessonInput {
  title: string
  durationMinutes: number
  tags?: readonly string[]
}

interface Lesson {
  readonly id: string
  title: string
  durationMinutes: number
  tags: readonly string[]
}

function saveLesson(input: CreateLessonInput): Lesson {
  return {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    durationMinutes: input.durationMinutes,
    tags: input.tags ? [...input.tags] : []
  }
}
```

这里有一个很重要的设计决定：没有为了省事让输入和返回值都使用 `Lesson`。

创建课程时还没有 `id`，所以 `CreateLessonInput` 不应该要求调用方伪造它。类型名称不只是描述对象长什么样，也应该表达它处于哪个业务阶段。

---

## 描述对象需要哪些字段

### 一次性使用的对象可以直接写在参数旁边

结构很短，并且只使用一次时，可以使用匿名对象类型：

```ts
function printLesson(
  lesson: { title: string; durationMinutes: number }
): void {
  console.log(`${lesson.title}：${lesson.durationMinutes} 分钟`)
}
```

它的优势是不用跳到其他地方查类型。重复出现后再命名：

```ts
interface LessonSummary {
  title: string
  durationMinutes: number
}

function printLesson(lesson: LessonSummary): void {
  console.log(`${lesson.title}：${lesson.durationMinutes} 分钟`)
}
```

不要把“所有对象都必须先建一个 interface”当作规范。类型是否命名，取决于它有没有独立含义、是否复用，以及名字能否增加理解。

### 必填字段表达最低契约

```ts
interface Lesson {
  id: string
  title: string
  durationMinutes: number
}
```

赋给 `Lesson` 的对象必须至少包含这些字段，并且类型匹配：

```ts
const lesson: Lesson = {
  id: 'ts-02',
  title: '对象类型与函数类型',
  durationMinutes: 90
}
```

漏掉 `durationMinutes` 或把它写成字符串，都会在运行前得到提示。

对象类型不会自动验证业务规则。`durationMinutes: number` 仍然允许 `-10` 和 `NaN`。类型负责描述数据形状，正数、范围和标题非空等规则仍需业务校验。

### 可选字段表示属性可能不存在

不是每门课程都有简介：

```ts
interface Lesson {
  title: string
  summary?: string
}
```

`summary?: string` 表示：

```text
属性可以不存在
如果存在，它必须是 string
```

因此读取时得到 `string | undefined`：

```ts
function getSummary(lesson: Lesson): string {
  return lesson.summary ?? '暂无简介'
}
```

不要直接调用字符串方法：

```ts
function printSummary(lesson: Lesson): void {
  console.log(lesson.summary.toUpperCase())
  // 错误：summary 可能不存在。
}
```

可以先判断、使用可选链，或者通过空值合并提供默认值。

### “属性不存在”与“值是 undefined”可能不是一回事

JavaScript 中下面两个对象并不完全相同：

```ts
const first = {}
const second = { summary: undefined }

console.log('summary' in first)  // false
console.log('summary' in second) // true
```

开启 `exactOptionalPropertyTypes` 后，TypeScript 会更严格地区分它们：

```ts
interface LessonDraft {
  summary?: string
}

const first: LessonDraft = {}
const second: LessonDraft = { summary: '课程简介' }

const third: LessonDraft = { summary: undefined }
// 开启 exactOptionalPropertyTypes 后不允许。
```

如果业务明确允许属性存在且值为 `undefined`，可以写成：

```ts
interface LessonDraft {
  summary?: string | undefined
}
```

这种区别在 PATCH 请求中尤其重要：

```text
没有 summary 字段      → 不修改原简介
summary 明确为 null     → 清空简介
```

具体协议可能不同，但类型必须忠实表达协议，不能随意把“未提供”和“清空”混成一件事。

### `readonly` 表达不应通过当前契约修改

课程 ID 一旦生成就不应随意修改：

```ts
interface Lesson {
  readonly id: string
  title: string
}

const lesson: Lesson = {
  id: 'ts-02',
  title: '对象类型'
}

lesson.title = '对象类型与函数类型'
lesson.id = 'another-id'
// 错误：id 是只读属性。
```

`readonly` 是 TypeScript 的编译期约束，不会自动执行 `Object.freeze()`。它还是浅层的：

```ts
interface Course {
  readonly metadata: {
    views: number
  }
}

const course: Course = {
  metadata: { views: 0 }
}

course.metadata = { views: 1 }
// 错误：不能替换 metadata。

course.metadata.views += 1
// 允许：内部的 views 没有 readonly。
```

数组也可以提供只读视图：

```ts
function printTags(tags: readonly string[]): void {
  console.log(tags.join('、'))
  tags.push('新增标签')
  // 错误：函数承诺不通过这个参数修改数组。
}
```

只读参数的价值是表达所有权：数组由调用方拥有，当前函数只读取它。

### `interface` 和 `type` 先用简单规则选择

两者都能描述普通对象：

```ts
interface LessonByInterface {
  title: string
}

type LessonByType = {
  title: string
}
```

在普通业务对象场景中，它们高度重叠。当前阶段使用下面的规则就足够：

- 对象、组件 Props、服务接口等公开对象契约，使用 `interface` 很自然；
- 联合类型、函数类型、元组和类型运算通常使用 `type`；
- 团队已有统一约定时，优先保持一致；
- 不要仅为了从 `type` 改成 `interface` 而重构稳定代码。

`interface` 支持声明合并，`type` 能表达更多非对象类型。这些差异在库类型扩展和高级类型课程中才会真正影响设计，本课不展开声明合并技巧。

### 属性名无法提前列完时使用索引类型

课程进度以课程 ID 为键：

```ts
type ProgressByLessonId = Record<string, number>

const progress: ProgressByLessonId = {
  'ts-01': 100,
  'ts-02': 40
}
```

等价的索引签名写法是：

```ts
interface ProgressByLessonId {
  [lessonId: string]: number
}
```

它表示任意字符串键对应数字，但不保证某个具体键一定存在。开启 `noUncheckedIndexedAccess` 后：

```ts
const current = progress['not-found']
// number | undefined
```

读取后要处理缺失情况：

```ts
const current = progress[lessonId] ?? 0
```

如果键集合是固定的，就不要使用宽泛的 `string`：

```ts
type Level = 'beginner' | 'intermediate' | 'advanced'
type LevelLabels = Record<Level, string>

const labels: LevelLabels = {
  beginner: '入门',
  intermediate: '进阶',
  advanced: '高级'
}
```

以后增加一个 `Level` 时，编译器会要求标签表同步补齐。

---

## 函数类型描述输入、输出和调用责任

### 函数签名就是调用契约

```ts
function formatLesson(
  title: string,
  durationMinutes: number
): string {
  return `${title}：${durationMinutes} 分钟`
}
```

签名说明：

```text
输入：string、number
输出：string
```

函数参数通常需要明确标注，因为函数实现不能猜到未来调用方会传什么。返回类型常常可以推断：

```ts
function double(value: number) {
  return value * 2
}
// 推断返回 number。
```

导出的公共函数、服务层函数和重要领域边界建议显式写返回类型。这样实现重构时，不容易无意扩大对外契约：

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

### 函数本身也可以成为一种类型

筛选函数接收课程并返回布尔值：

```ts
type LessonPredicate = (
  lesson: Readonly<Lesson>,
  index: number
) => boolean
```

使用它描述变量或参数：

```ts
const isLongLesson: LessonPredicate = (lesson) => {
  return lesson.durationMinutes >= 60
}
```

`lesson` 不需要重复标注，TypeScript 会从 `LessonPredicate` 推断它的类型。这叫上下文类型推断。

函数类型中的参数名称只帮助阅读：

```ts
type First = (lesson: Lesson) => boolean
type Second = (item: Lesson) => boolean
```

`lesson` 和 `item` 名称不同，不会因此变成不兼容类型；真正决定契约的是参数位置、参数类型和返回类型。

### 回调参数由调用回调的一方决定

设计一个遍历函数：

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

JavaScript 本来就允许函数忽略额外参数，因此不需要把 `index` 标记为可选。

错误设计：

```ts
callback: (lesson: Lesson, index?: number) => void
```

它表达的是“调用回调的人可能不传 index”。于是回调实现使用 `index` 前必须处理 `undefined`。

判断回调参数是否可选，应站在调用者这一侧：这个函数真的会在某些路径省略参数吗？如果永远传，就不应该写 `?`。

### 可选参数、默认参数解决不同问题

可选参数在函数体内可能是 `undefined`：

```ts
function formatTitle(title: string, prefix?: string): string {
  return prefix === undefined
    ? title
    : `${prefix}：${title}`
}
```

默认参数让函数体始终得到具体值：

```ts
function formatTitle(title: string, prefix = '课程'): string {
  return `${prefix}：${title}`
}
```

如果缺省时存在自然默认值，默认参数通常更简单。如果“没有传”本身具有业务含义，就保留可选参数并明确判断。

必填参数不能放在可选参数后面，因为调用位置会变得含糊：

```ts
function invalid(prefix?: string, title: string): string {
  return `${prefix}${title}`
}
```

参数很多时，不要继续增加位置参数，改用一个命名对象：

```ts
interface FormatLessonOptions {
  title: string
  durationMinutes: number
  prefix?: string
  uppercase?: boolean
}

function formatLesson(options: FormatLessonOptions): string {
  // 每个参数的含义在调用处都清楚可见。
  const label = `${options.prefix ?? '课程'}：${options.title}`
  const result = `${label}（${options.durationMinutes} 分钟）`

  return options.uppercase ? result.toUpperCase() : result
}
```

### 剩余参数接住数量不固定的输入

```ts
function addTags(lessonId: string, ...tags: string[]): void {
  console.log(lessonId, tags)
}

addTags('ts-02', 'typescript', '函数类型')
```

函数体中的 `tags` 是数组。剩余参数必须放在最后，并使用数组或元组类型。

### `void` 表示调用方不使用返回结果

```ts
type Logger = (message: string) => void
```

它主要表达调用方不依赖返回结果，而不等同于“运行时绝对只能返回 `undefined`”。例如：

```ts
const values: number[] = []

;[1, 2, 3].forEach((value) => values.push(value))
```

`push` 运行时返回数组长度，但 `forEach` 的回调结果被忽略，所以这种写法可以赋给返回 `void` 的回调位置。

如果函数实现本身显式写了 `(): void`，就不能主动返回业务值：

```ts
function log(message: string): void {
  console.log(message)
  return true
  // 错误：显式 void 实现不应返回值。
}
```

`never` 表示永远不能正常返回，`unknown` 表示值暂时未知。它们会分别在联合类型和边界设计中继续学习，不要把它们和 `void` 当成同一组“没有值”的类型。

### 不要用全局 `Function` 逃避签名设计

```ts
function run(callback: Function): void {
  callback('意外参数', 123)
}
```

`Function` 几乎没有描述参数和返回值，调用约束已经丢失。应该写出真实调用方式：

```ts
function run(callback: () => void): void {
  callback()
}
```

带参数时同样明确：

```ts
function selectLesson(
  lessonId: string,
  onSelected: (lessonId: string) => void
): void {
  onSelected(lessonId)
}
```

### 回调必须能够处理调用方承诺的全部输入

假设一个处理器契约允许字符串或数字：

```ts
type Handler = (value: string | number) => void
```

只会处理字符串的函数不能放到这里：

```ts
const stringOnly = (value: string): void => {
  console.log(value.toLowerCase())
}

const handler: Handler = stringOnly
// strictFunctionTypes 下错误。
```

原因可以从真实调用推导：

```ts
handler(10)
```

`Handler` 承诺数字合法，但 `stringOnly` 无法处理数字。开启 `strict` 时，`strictFunctionTypes` 会检查常见函数属性和回调位置，阻止这种过窄实现。

这里不必先记“逆变”术语。只需检查一个问题：调用方按照目标类型传入任何合法值时，这个具体函数都能处理吗？

---

## TypeScript 为什么允许“字段更多”的对象

### 它主要比较结构，而不是类型名称

```ts
interface Titled {
  title: string
}

const lesson = {
  id: 'ts-02',
  title: '对象类型与函数类型',
  durationMinutes: 90
}

function printTitle(value: Titled): void {
  console.log(value.title)
}

printTitle(lesson)
```

`lesson` 没有声明“实现 Titled”，但它至少拥有 `title: string`，所以可以传入。

这叫结构化类型系统。它很适合 JavaScript 对象，因为已有对象不需要继承某个类或显式实现接口，就能满足一个较小契约。

`Titled` 的含义更接近：

```text
我只要求调用时至少能安全读取 title: string
```

而不是：

```text
对象只能拥有 title，不能有其他字段
```

### 新对象字面量会接受额外的拼写检查

直接传对象字面量时会得到不同提示：

```ts
printTitle({
  title: '对象类型',
  durationMinutes: 90
  // 错误：当前目标类型没有 durationMinutes。
})
```

先保存到变量后，按照普通结构兼容规则检查：

```ts
const lesson = {
  title: '对象类型',
  durationMinutes: 90
}

printTitle(lesson)
```

这不是前后矛盾。TypeScript 会对新创建的对象字面量额外执行多余属性检查，用来发现拼错字段或传错配置。

不要用中间变量或类型断言故意绕过提示。先问自己：

- 目标类型是否漏写了合法字段？
- 调用方是否传入了错误配置？
- 这个函数是否应该接收一个更合适的命名类型？

多余属性检查也不是运行时白名单。接口数据是否允许额外字段，仍由运行时解析器和协议决定。

---

## 用不同对象类型表达数据生命周期

一个常见反模式是建立一个包含所有可选字段的万能类型：

```ts
interface LessonData {
  id?: string
  title?: string
  summary?: string
  durationMinutes?: number
  displayLabel?: string
}
```

它可以表示几乎任何对象，却不能保证任何业务阶段的数据完整。

更清楚的做法是按生命周期拆分：

```ts
interface CreateLessonInput {
  title: string
  summary?: string
  durationMinutes: number
}

interface Lesson {
  readonly id: string
  title: string
  summary?: string
  durationMinutes: number
}

interface LessonSummary {
  readonly id: string
  readonly label: string
}
```

三种类型回答不同问题：

| 类型 | 表达的阶段 | 关键特征 |
| --- | --- | --- |
| `CreateLessonInput` | 创建前的用户输入 | 没有服务端 ID |
| `Lesson` | 已存在的课程实体 | ID 必填且只读 |
| `LessonSummary` | 列表展示结果 | 只包含界面需要的数据 |

以后学习工具类型时，会使用 `Pick`、`Omit`、`Partial` 等从已有类型生成变体。但在掌握这些工具前，先学会识别不同业务含义更重要。类型复用不能以模糊数据阶段为代价。

## 完整示例：内存课程仓库

这一课保留一个完整示例，因为对象契约和函数契约只有组合起来，才能清楚展示调用方、仓库和返回值之间的数据所有权。

示例包含：

- `Lesson`、`CreateLessonInput` 和 `LessonSummary` 三种数据阶段；
- `LessonPredicate` 回调类型；
- `LessonRepository` 行为契约；
- 只读输入、对象复制和明确返回类型；
- `exactOptionalPropertyTypes` 下正确处理可选简介。

<<< ../../../examples/typescript/object-and-function-types.ts

运行：

```bash
npm run example:ts:object-functions
```

预期主要输出：

```text
新建课程： TypeScript 对象类型与函数类型
长课程数量： 2
课程摘要： [...]
```

### 按数据流阅读示例

```text
CreateLessonInput
        ↓ repository.save
生成 id、整理字段
        ↓
仓库内部 Lesson
        ↓ cloneLesson
调用方得到 Lesson 副本
        ↓ toSummary
LessonSummary
```

为什么要返回副本？因为 `readonly` 只是当前类型访问路径上的编译期约束。仓库若直接暴露内部对象，调用方仍可能通过其他可变类型或 JavaScript 代码修改它。

示例中的复制是浅复制，因此 `tags` 数组需要单独复制。若对象包含更深层结构，应重新设计所有权或使用专门的不可变策略，不能把对象展开误认为通用深拷贝。

## 常见问题：从错误信息回到契约

### “Property ... is missing”

```text
含义：目标类型要求一个必填字段，但当前对象没有提供
检查：字段应当必填，还是业务上确实允许缺失？
不要：为了消除错误，机械地给所有字段加 ?
```

### “Object is possibly undefined”

```text
含义：正在读取可选属性或可能不存在的索引结果
选择：先判断、提供默认值，或修改上游契约使它真正必填
```

### “Cannot assign to ... because it is a read-only property”

```text
检查：当前函数是不是数据所有者？
如果需要更新：创建新对象，或把修改操作交给拥有者
不要：立刻用类型断言移除 readonly
```

### 对象明明字段更多，却不能直接传入

新对象字面量会执行多余属性检查。检查字段是否拼错、目标类型是否错误，或者先建立真正符合调用目的的对象。不要把“先存变量就能通过”当作修复方案。

### 回调明明可以少写参数，为什么类型里不能写 `?`

实现函数可以忽略调用方传来的额外参数；类型里的可选参数却表示调用方可能不传。两者描述的是不同责任。

### 为什么不能直接修改函数收到的数组

如果参数类型是 `readonly Lesson[]`，函数已经承诺只读取调用方数据。需要排序或添加时创建新数组：

```ts
const sorted = [...lessons].sort(compareLessons)
```

### 类型正确，为什么负数时长仍能保存

`number` 只描述 JavaScript 数字类型，不表达“有限正整数”。业务范围仍需运行时校验。类型系统和业务校验解决不同层次的问题。

## 本课应形成的设计习惯

- 对象类型表达业务阶段，不只是字段集合；
- 创建输入、持久化实体和展示结果不必共用一个万能类型；
- 真正可能缺失的字段才使用 `?`；
- `readonly` 用来表达读取边界和所有权，不冒充运行时冻结；
- 参数较多时使用命名对象，避免难以阅读的位置参数；
- 公共函数明确输入输出，局部实现充分使用推断；
- 回调参数由真正调用回调的一方定义；
- 接收数组但不修改时使用只读数组；
- 遇到多余属性提示先检查契约，不用断言压掉；
- 外部 JSON 仍从 `unknown` 开始验证，接口声明不会自动校验数据。

## 下一课

下一节是[联合类型、交叉类型与类型收窄](/frontend/typescript/unions-intersections-and-narrowing)。它会处理本课暂时没有展开的问题：

- 一个值可能是多种类型时怎样安全使用；
- `null`、成功、失败和加载状态怎样形成合法状态模型；
- TypeScript 怎样沿 `typeof`、属性判断和分支收窄类型；
- 交叉类型怎样组合契约，以及冲突属性为什么可能得到 `never`；
- 如何使用穷尽性检查发现遗漏状态。

函数重载也会在理解联合类型与收窄后更容易判断：如果多个输入采用同一种处理并返回同一类型，通常使用联合参数；只有调用形式和返回对应关系确实不同，才考虑重载。

## 参考资料

- [TypeScript Handbook：Everyday Types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html)
- [TypeScript Handbook：Object Types](https://www.typescriptlang.org/docs/handbook/2/objects.html)
- [TypeScript Handbook：More on Functions](https://www.typescriptlang.org/docs/handbook/2/functions.html)
- [TSConfig：exactOptionalPropertyTypes](https://www.typescriptlang.org/tsconfig/exactOptionalPropertyTypes.html)
- [TSConfig：noUncheckedIndexedAccess](https://www.typescriptlang.org/tsconfig/noUncheckedIndexedAccess.html)
- [TSConfig：strictFunctionTypes](https://www.typescriptlang.org/tsconfig/strictFunctionTypes.html)
