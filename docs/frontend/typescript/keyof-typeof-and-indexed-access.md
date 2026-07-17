---
title: TypeScript keyof、typeof 与索引访问类型
description: 从运行时配置逐步派生对象类型、键联合和值类型，减少重复声明并保持配置同步
outline: deep
---

# TypeScript `keyof`、`typeof` 与索引访问类型

[上一课](/frontend/typescript/generics-and-constraints)用泛型保存输入和输出之间的类型关系。这一课解决另一个常见问题：项目里已经存在对象、数组和配置，怎样从它们派生类型，而不是手工维护两份事实？

例如课程状态经常被重复声明：

```ts
type LessonStatus = 'draft' | 'published' | 'archived'

const statusLabels = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档'
}
```

新增 `reviewing` 时，开发者可能只修改其中一处。更可靠的方式是选择一个事实来源：

```ts
const statusLabels = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档'
} as const

type LessonStatus = keyof typeof statusLabels
```

整条派生链是：

```text
运行时值 statusLabels
        ↓ typeof
对象的静态类型
        ↓ keyof
"draft" | "published" | "archived"
```

理解这条链之后，索引访问、数组元素类型和配置驱动类型都会自然很多。

## 先分清值空间和类型空间

TypeScript 文件同时存在两类名称：

- 值：运行时真实存在，可以读取、调用和打印；
- 类型：只供编译器检查，生成 JavaScript 后通常消失。

```ts
interface Lesson {
  id: string
  title: string
}

const lesson = {
  id: 'ts-05',
  title: '类型派生'
}

const current: Lesson = lesson
//             类型      值
```

值不能直接放进类型位置：

```ts
const field = 'title'
type FieldValue = Lesson[field]
//                       错误：field 是值。
```

可以先取得值的类型：

```ts
const field = 'title' as const
type FieldValue = Lesson[typeof field]
// string
```

类名比较特殊，它同时创建实例类型和运行时构造函数值：

```ts
class LessonModel {
  constructor(readonly title: string) {}
}

const lesson: LessonModel = new LessonModel('类型派生')
//            实例类型       运行时构造函数值
```

因此 `LessonModel` 表示实例类型，而 `typeof LessonModel` 表示构造函数及静态成员的类型。

## 两种 `typeof` 处在不同世界

### JavaScript 运行时 `typeof`

```ts
const title = 'TypeScript'
console.log(typeof title) // "string"
```

它会真实执行并返回字符串，也能用于联合类型收窄。

### TypeScript 类型位置 `typeof`

```ts
const lesson = {
  id: 'ts-05',
  title: '类型派生',
  durationMinutes: 100
}

type LessonFromValue = typeof lesson
```

它不会执行代码，而是取得 `lesson` 的静态类型：

```ts
// 近似得到：
// {
//   id: string
//   title: string
//   durationMinutes: number
// }
```

可以把两者对比为：

| 写法 | 发生时间 | 得到什么 |
| --- | --- | --- |
| 表达式中的 `typeof value` | JavaScript 运行时 | `'string'` 等字符串 |
| 类型位置的 `typeof value` | TypeScript 检查时 | 值的静态类型 |

### 类型位置不会执行任意表达式

```ts
function createLesson() {
  return { id: '1', title: 'TypeScript' }
}

type Lesson = typeof createLesson()
//                                错误：类型位置不会调用函数。
```

需要函数返回类型时，先取得函数类型，再使用 `ReturnType`：

```ts
type CreateLesson = typeof createLesson
type Lesson = ReturnType<CreateLesson>
```

同理，`Parameters<typeof createLesson>` 可以取得参数元组。核心领域模型是否应该依赖实现函数派生，需要根据契约稳定性判断；公共模型显式声明往往更清楚。

## `keyof` 把对象属性名变成联合类型

```ts
interface Lesson {
  id: string
  title: string
  durationMinutes: number
  published: boolean
}

type LessonKey = keyof Lesson
// "id" | "title" | "durationMinutes" | "published"
```

`keyof` 只产生类型，不会创建运行时键数组。

可以用它限制函数参数：

```ts
function printField(key: keyof Lesson): void {
  console.log(key)
}

printField('title')
printField('unknown')
// 错误：unknown 不是 Lesson 的键。
```

### 索引签名会扩大键集合

```ts
type ScoreMap = {
  [name: string]: number
}

type ScoreKey = keyof ScoreMap
// string | number
```

数字也会出现，因为普通 JavaScript 对象会把数字属性键转换为字符串。

如果对象其实只有有限字段，不要为了方便添加 `[key: string]: unknown`。它会让任意字符串看起来合法，失去拼写检查。

### 联合对象只暴露共同安全键

```ts
type Content =
  | { kind: 'video'; title: string; videoUrl: string }
  | { kind: 'article'; title: string; content: string }

type SafeKey = keyof Content
// "kind" | "title"
```

未收窄时，值可能是任意成员，只能安全访问双方都有的字段。判断 `kind` 后，才能分别访问 `videoUrl` 或 `content`。

交叉类型要求同时满足两边，因此通常包含两边全部键：

```ts
type Stored = { id: string } & { createdAt: number }
type StoredKey = keyof Stored
// "id" | "createdAt"
```

`keyof` 只回答有哪些键，不保证冲突属性一定能构造。

## 索引访问类型查询某个键对应的值

```ts
type LessonTitle = Lesson['title']
// string

type LessonDuration = Lesson['durationMinutes']
// number
```

它长得像对象访问，但发生在类型空间，不读取真实对象。

键也可以是联合：

```ts
type DisplayValue = Lesson['title' | 'durationMinutes']
// string | number
```

全部值类型：

```ts
type LessonValue = Lesson[keyof Lesson]
// string | number | boolean
```

这个联合往往太宽。如果业务依赖“具体键对应具体值”，应保留键参数，而不是提前合并成所有值联合。

## `K extends keyof T` 保留键和值的对应关系

```ts
function getProperty<ObjectType, Key extends keyof ObjectType>(
  object: ObjectType,
  key: Key
): ObjectType[Key] {
  return object[key]
}
```

三个部分各有职责：

```text
ObjectType               当前对象类型
keyof ObjectType         所有合法键
Key extends ...          本次传入的具体合法键
ObjectType[Key]          该键对应的精确值类型
```

调用：

```ts
const lesson: Lesson = {
  id: 'ts-05',
  title: '类型派生',
  durationMinutes: 100,
  published: true
}

const title = getProperty(lesson, 'title')
// string

const published = getProperty(lesson, 'published')
// boolean
```

如果直接把参数写成 `keyof ObjectType`：

```ts
function getPropertyWide<ObjectType>(
  object: ObjectType,
  key: keyof ObjectType
): ObjectType[keyof ObjectType] {
  return object[key]
}
```

它只知道“某个合法键”，返回值总是全部属性值联合。单独的 `Key` 类型参数保存了本次键与结果之间的关系。

## 数组和元组也能使用索引访问

数组通过数字下标访问：

```ts
const lessons = [
  { id: 'ts-04', title: '泛型' },
  { id: 'ts-05', title: '类型派生' }
]

type LessonItem = (typeof lessons)[number]
// { id: string; title: string }
```

理解顺序：

1. `typeof lessons` 得到数组类型；
2. `[number]` 表示任意数字位置；
3. 结果就是数组元素类型。

元组还可以访问具体位置：

```ts
type Entry = readonly [id: string, duration: number]

type EntryId = Entry[0]       // string
type EntryDuration = Entry[1] // number
type EntryValue = Entry[number] // string | number
```

## `as const` 保留字面量信息

普通数组需要允许以后加入任意字符串，因此元素会扩大：

```ts
const statuses = ['draft', 'published', 'archived']
type Status = (typeof statuses)[number]
// string
```

使用 `as const`：

```ts
const statuses = ['draft', 'published', 'archived'] as const
type Status = (typeof statuses)[number]
// "draft" | "published" | "archived"
```

它对字面量表达式主要产生三种类型效果：

1. 字面量不再扩大；
2. 对象属性成为只读；
3. 数组成为只读元组。

```ts
const config = {
  status: 'draft',
  retryDelays: [1000, 3000]
} as const
```

类型近似为：

```ts
{
  readonly status: 'draft'
  readonly retryDelays: readonly [1000, 3000]
}
```

`as const` 不会调用 `Object.freeze()`，也不会自动深度冻结外部引用。它控制静态推断，不是运行时安全机制。

## `satisfies` 校验形状，同时尽量保留精度

类型标注可能把变量视为较宽的目标类型：

```ts
type Color = string | [number, number, number]

const palette: Record<'primary' | 'danger', Color> = {
  primary: [49, 87, 213],
  danger: '#c2415d'
}
```

读取 `palette.danger` 时得到宽泛的 `Color`。

使用 `satisfies`：

```ts
const palette = {
  primary: [49, 87, 213],
  danger: '#c2415d'
} satisfies Record<
  'primary' | 'danger',
  string | [number, number, number]
>

palette.danger.toUpperCase()
```

它检查键和值满足目标契约，同时尽量保留表达式自身的具体类型。

`satisfies` 不是 `as` 断言：不满足目标类型时会报错。它也不是运行时校验，不能验证接口响应和用户输入。

### 配置中常组合 `as const` 与 `satisfies`

```ts
const columns = [
  { key: 'title', align: 'left' },
  { key: 'durationMinutes', align: 'right' }
] as const satisfies readonly {
  key: keyof Lesson
  align: 'left' | 'center' | 'right'
}[]
```

得到两种能力：

- `satisfies` 检查列键确实属于 `Lesson`；
- `as const` 保留当前实际列键的字面量。

```ts
type Column = (typeof columns)[number]
type ColumnKey = Column['key']
// "title" | "durationMinutes"
```

`ColumnKey` 不是全部 `keyof Lesson`，而是配置中真正出现的列。

## 从对象配置和数组配置派生类型

### 对象配置的键和值

```ts
const fieldDefinitions = {
  title: { label: '课程名称', kind: 'text' },
  durationMinutes: { label: '学习时长', kind: 'number' },
  published: { label: '是否发布', kind: 'boolean' }
} as const

type Definitions = typeof fieldDefinitions
type FieldName = keyof Definitions
type FieldKind = Definitions[FieldName]['kind']
// "text" | "number" | "boolean"
```

最后一行先取得每个字段定义对象的联合，再查询联合成员共同拥有的 `kind`。

### 数组配置的元素和属性

```ts
const options = [
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已发布' }
] as const

type Option = (typeof options)[number]
type OptionValue = Option['value']
// "draft" | "published"
```

配置适合成为事实来源时再派生。稳定的公共 API、后端协议或领域模型可能更适合显式类型，再使用 `satisfies` 校验具体配置。

## 为什么 `Object.keys()` 不是 `Array<keyof T>`

标准签名通常返回 `string[]`。原因是结构化类型允许实际对象拥有比静态类型更多的属性：

```ts
interface Named {
  name: string
}

const fullUser = {
  name: 'Ada',
  passwordHash: 'secret'
}

const publicUser: Named = fullUser
Object.keys(publicUser)
// 运行时仍包含 name 和 passwordHash。
```

静态 `keyof Named` 只有 `'name'`，运行时键却可能更多。若无条件返回 `Array<keyof T>`，开放对象场景就不真实。

处理策略：

- 有限固定字段：维护明确的只读键元组并用 `satisfies` 校验；
- 外部对象：把键和值当作未知数据验证；
- 完全受控的封闭对象：可以封装带断言的辅助函数，但要写清前置条件；
- 不在通用工具中无条件断言所有 `Object.keys()`。

## 外部字符串必须验证后才能成为有限键

```ts
const keyFromUrl: string =
  new URLSearchParams(location.search).get('sort') ?? ''

const value = lesson[keyFromUrl]
// 任意 string 不保证是 Lesson 的键。
```

准备一个同时服务运行时与类型系统的白名单：

```ts
const sortableFields = ['title', 'durationMinutes'] as const
type SortableField = (typeof sortableFields)[number]

function isSortableField(value: string): value is SortableField {
  return (sortableFields as readonly string[]).includes(value)
}

if (isSortableField(keyFromUrl)) {
  const value = lesson[keyFromUrl]
  // string | number
}
```

数组在运行时执行验证，`typeof` 与 `[number]` 在静态世界产生联合。类型谓词实现仍需开发者保证正确。

## 完整示例：配置驱动的课程字段

这篇保留一个完整示例，因为同一份配置同时参与运行时循环、静态校验和类型派生：

```text
statusLabels / columns / sortableFields
             ↓ as const
保留实际字面量
             ↓ satisfies
检查配置契约
             ↓ typeof
取得配置静态类型
             ↓ keyof / [number] / T[K]
派生状态、列键和属性值类型
```

<<< ../../../examples/typescript/keyof-typeof-and-indexed-access.ts

运行：

```bash
node --experimental-strip-types examples/typescript/keyof-typeof-and-indexed-access.ts
```

阅读时重点追踪：

- `LessonStatus` 如何只依赖 `statusLabels` 的键；
- `ColumnKey` 为什么只包含真正配置的列；
- `getProperty()` 为什么能根据键返回字符串或数字；
- URL 字符串为什么必须先经过运行时白名单。

## 常见问题：派生结果为什么不够精确

### 数组元素派生后只是 string

普通数组允许继续写入任意字符串，因此字面量被扩大。若它确实是固定配置，使用 `as const` 保留只读元组。

### `keyof` 为什么没有生成可遍历数组

`keyof` 只存在于类型空间，生成 JavaScript 后消失。运行时遍历仍需要真实数组或 `Object.keys()`。

### 为什么任意 string 不能索引对象

有限对象只保证少数已知键，任意字符串可能不存在。收紧字符串来源，或先做运行时白名单校验。

### `T[keyof T]` 为什么太宽

它把所有属性值合并成联合，丢失具体键和值的对应。保留泛型 `K` 并返回 `T[K]`。

### `as const` 后运行时对象仍被修改

它只改变编译器推断，不冻结运行时对象，也不能阻止外部引用修改共享数据。

### `satisfies` 为什么没有验证接口 JSON

它只检查源码表达式的静态可赋值性。网络数据需要运行时 Schema 或守卫。

## 选择事实来源，而不是到处派生

类型派生并非越多越好，可以按以下原则判断：

- 运行时配置决定真实功能时，让类型从配置派生；
- 公共协议需要稳定独立契约时，显式声明类型；
- 具体实现必须符合公共契约时，使用 `satisfies`；
- 派生表达式过长时，拆成有业务含义的中间类型；
- 不从偶然示例 JSON 推断完整接口，因为示例可能缺少可选和错误分支；
- 派生只解决静态同步，不替代运行时验证和权限检查。

## 下一课

下一节是[条件类型与 `infer`](/frontend/typescript/conditional-types-and-infer)。本课已经学会从已知键和数组位置直接查询类型；下一课会处理“根据输入类型选择不同结果”和“从复杂类型结构中提取内部部分”：

- 条件类型怎样表达类型层面的分支；
- 为什么裸类型参数遇到联合会分发；
- `infer` 怎样提取函数返回、数组元素和 Promise 内部类型；
- 内置工具类型背后的实现逻辑。

## 参考资料

- [TypeScript Handbook：Keyof Type Operator](https://www.typescriptlang.org/docs/handbook/2/keyof-types.html)
- [TypeScript Handbook：Typeof Type Operator](https://www.typescriptlang.org/docs/handbook/2/typeof-types.html)
- [TypeScript Handbook：Indexed Access Types](https://www.typescriptlang.org/docs/handbook/2/indexed-access-types.html)
- [TypeScript Handbook：Creating Types from Types](https://www.typescriptlang.org/docs/handbook/2/types-from-types.html)
- [TypeScript Handbook：Literal Inference](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#literal-inference)
- [TypeScript 3.4：const assertions](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html#const-assertions)
- [TypeScript 4.9：satisfies Operator](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html#the-satisfies-operator)
