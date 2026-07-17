---
title: TypeScript 泛型基础与约束
description: 从数组首项和分页转换出发，理解泛型怎样保存类型关系，以及约束怎样规定最低能力
outline: deep
---

# TypeScript 泛型基础与约束

[上一课](/frontend/typescript/unions-intersections-and-narrowing)使用联合类型表达“一个值可能属于哪些候选类型”。泛型解决的是另一类问题：调用方已经知道具体类型，通用代码怎样在多个位置保持这种类型关系？

最典型的关系是：

```text
输入数组的元素类型 → 返回的首项类型
转换回调的返回类型 → 新数组的元素类型
分页数据的元素类型 → page.items 的元素类型
仓库保存的实体类型 → 查询结果的实体类型
```

泛型的价值不是给函数加一对尖括号，而是让通用代码复用时不丢失具体业务类型。

## 为什么 `any` 和联合类型都解决不了首项函数

JavaScript 函数：

```ts
function first(items) {
  return items[0]
}
```

使用 `any`：

```ts
function first(items: any[]): any {
  return items[0]
}

const title = first(['TypeScript'])
title.notExists()
// any 关闭了后续检查。
```

使用联合类型：

```ts
function first(
  items: readonly (string | number)[]
): string | number | undefined {
  return items[0]
}
```

它只支持预先列出的候选，而且传入纯字符串数组后，结果仍是 `string | number | undefined`。

真实关系应该是：

```text
readonly string[]  → string | undefined
readonly number[]  → number | undefined
readonly Lesson[]  → Lesson | undefined
```

使用类型参数保存这个关系：

```ts
function first<Item>(items: readonly Item[]): Item | undefined {
  return items[0]
}
```

调用时 TypeScript 从数组推断 `Item`：

```ts
const title = first(['TypeScript', 'Vue'])
// string | undefined

const duration = first([60, 90])
// number | undefined
```

泛型保留了元素类型，但没有删除数组可能为空的事实。

## 类型参数是类型层面的变量

最小泛型函数：

```ts
function identity<Value>(value: Value): Value {
  return value
}
```

`Value` 是类型参数，可以把它理解为类型层面的形参：

```text
值形参：value  等调用时传入真实值
类型参数：Value 等调用时确定具体类型
```

显式调用：

```ts
const text = identity<string>('TypeScript')
const count = identity<number>(4)
```

通常不必手写类型实参：

```ts
const text = identity('TypeScript')
// TypeScript 推断 Value 为 string。
```

类型参数只参与静态检查。生成 JavaScript 后会被移除，不能在运行时写 `typeof Value`，也不能仅凭泛型创建 `new Value()`。

### 名称应该表达类型角色

短名称 `T`、`K`、`V` 在简单签名中很常见，但多个参数时描述性名称更容易理解：

```ts
function map<Input, Output>(
  items: readonly Input[],
  transform: (item: Input) => Output
): Output[] {
  return items.map(transform)
}
```

这里一眼能看出：输入元素和输出元素可以是不同类型。

## 泛型的核心是关系，不是“接受任意类型”

下面的泛型保存了输入与输出关系：

```ts
function pair<Value>(value: Value): [Value, Value] {
  return [value, value]
}
```

`Value` 同时出现在输入和两个输出位置。

下面的泛型通常没有增加价值：

```ts
function logValue<Value>(value: Value): void {
  console.log(value)
}
```

函数只需要接收一个未知值，返回值也不保留 `Value`，可以更直接地写：

```ts
function logValue(value: unknown): void {
  console.log(value)
}
```

判断一个函数是否需要泛型，可以问：

1. 调用者是否关心某几个类型位置之间的对应关系？
2. 去掉类型参数后，是否会丢失有用的具体类型？
3. 类型参数是否至少连接了输入、输出或多个成员？

“类型参数只出现一次”不是绝对错误，但通常是重新检查设计的信号。

## 类型推断让常见调用保持简洁

两个类型参数可以从不同位置推断：

```ts
function map<Input, Output>(
  items: readonly Input[],
  transform: (item: Input, index: number) => Output
): Output[] {
  return items.map(transform)
}

const lengths = map(['TS', 'Vue'], (item) => item.length)
// Input = string
// Output = number
// lengths = number[]
```

推断过程可以顺着签名阅读：

```text
传入 string[]
      ↓
Input 推断为 string
      ↓
回调 item 获得 string 上下文类型
      ↓
回调返回 number
      ↓
Output 推断为 number
      ↓
最终返回 number[]
```

显式类型实参适合值信息不足的情况：

```ts
interface User {
  id: string
  name: string
}

const usersById = new Map<string, User>()
```

空 Map 没有内容可以推断完整键和值类型，所以显式声明很有意义。

不要为了显得严谨而重复准确推断：

```ts
identity<string>('hello')
// 合法，但 identity('hello') 已经足够。
```

## 泛型对象把容器结构与内容类型分开

分页结构总是相同，真正变化的是元素：

```ts
interface Page<Item> {
  items: readonly Item[]
  page: number
  pageSize: number
  total: number
}
```

使用：

```ts
interface Lesson {
  id: string
  title: string
}

const lessonPage: Page<Lesson> = {
  items: [{ id: 'ts-04', title: '泛型基础与约束' }],
  page: 1,
  pageSize: 20,
  total: 1
}
```

`Page` 负责分页协议，`Lesson` 负责业务数据，两种职责不需要复制成 `LessonPage`、`UserPage`、`OrderPage` 三套接口。

### 泛型可以嵌套传播

```ts
interface ApiError {
  code: string
  message: string
}

type ApiResult<Data> =
  | { ok: true; data: Data }
  | { ok: false; error: ApiError }

type LessonPageResult = ApiResult<Page<Lesson>>
```

类型从外向内逐层明确：请求结果成功时得到分页，分页内部是课程。

泛型不会验证网络响应。真实 JSON 仍应从 `unknown` 经过运行时 Schema 或守卫，泛型只描述验证后的静态关系。

### 类型参数放在调用上还是对象上

每次调用都能选择不同类型时，参数属于调用签名：

```ts
interface IdentityFunction {
  <Value>(value: Value): Value
}
```

一个对象的多个成员共享同一类型时，参数属于整个接口：

```ts
interface Repository<Item> {
  save(item: Item): void
  findAll(): readonly Item[]
}
```

`Repository<Lesson>` 创建后，所有成员都围绕 `Lesson` 工作；`IdentityFunction` 每调用一次都可以推断新的 `Value`。

## 约束说明泛型至少需要什么能力

无约束类型参数可能是任何类型，不能随意读取属性：

```ts
function printLength<Value>(value: Value): Value {
  console.log(value.length)
  // Value 不一定有 length。
  return value
}
```

使用 `extends` 声明最低结构：

```ts
interface HasLength {
  length: number
}

function printLength<Value extends HasLength>(value: Value): Value {
  console.log(value.length)
  return value
}
```

可以传入任何结构上满足约束的值：

```ts
printLength('TypeScript')
printLength([1, 2, 3])
printLength({ length: 5, unit: 'minutes' })

printLength(42)
// 错误：number 没有 length。
```

这里的 `extends` 是类型约束，不要求类继承。TypeScript 采用结构化类型，只要值至少具有 `length: number` 就满足条件。

### 约束不是具体类型

这是泛型最容易误解的地方：

```ts
function ensureMinimumLength<Value extends { length: number }>(
  value: Value,
  minimum: number
): Value {
  if (value.length >= minimum) return value

  return { length: minimum }
  // 错误：只满足约束，不一定满足具体 Value。
}
```

调用者可能传入字符串数组。`{ length: 3 }` 虽然满足约束，却没有数组方法，不能冒充调用者传入的完整类型。

```text
Value extends HasLength
不等于
Value 就是 HasLength
```

泛型函数承诺返回 `Value` 时，必须返回真正满足调用者具体类型的值。信息不足时可以让调用者提供创建方式：

```ts
function ensureMinimumLength<Value extends { length: number }>(
  value: Value,
  minimum: number,
  createFallback: (minimum: number) => Value
): Value {
  return value.length >= minimum
    ? value
    : createFallback(minimum)
}
```

## 约束应只包含实现真正依赖的字段

通用仓库通过 ID 建索引：

```ts
interface Entity {
  readonly id: string
}

class MemoryRepository<Item extends Entity> {
  private readonly records = new Map<string, Item>()

  save(item: Item): void {
    this.records.set(item.id, item)
  }

  findById(id: string): Item | undefined {
    return this.records.get(id)
  }
}
```

实现只依赖 `id`，因此约束不应要求 `title`、`createdAt` 等无关字段。传入 `Lesson` 时，返回值仍是完整 `Lesson | undefined`，不会退化成 `Entity | undefined`。

泛型类的类型参数属于实例：

```ts
const lessonRepository = new MemoryRepository<Lesson>()
```

运行时只有一份类静态成员，不会分别创建 `MemoryRepository<Lesson>` 和 `MemoryRepository<User>` 的静态存储，因此类的静态字段不能直接引用实例侧 `Item`。静态泛型工厂应在方法自身声明类型参数。

## 数组是否非空也可以成为类型关系

普通数组可能为空：

```ts
function first<Item>(items: readonly Item[]): Item | undefined {
  return items[0]
}
```

不要用断言隐藏风险：

```ts
function firstUnsafe<Item>(items: readonly Item[]): Item {
  return items[0] as Item
}
```

空数组运行时仍得到 `undefined`。

如果函数要求非空，就把前置条件写入参数：

```ts
type NonEmptyArray<Item> = readonly [Item, ...Item[]]

function firstRequired<Item>(items: NonEmptyArray<Item>): Item {
  return items[0]
}

firstRequired(['TypeScript'])
firstRequired([])
// 错误：缺少第一个元素。
```

这不是让类型“骗过 undefined”，而是让调用者证明输入满足更强条件。

## 默认类型参数减少常见重复

接口错误通常使用统一结构：

```ts
interface ApiError {
  code: string
  message: string
}

type ApiResult<Data, ErrorData = ApiError> =
  | { ok: true; data: Data }
  | { ok: false; error: ErrorData }
```

常见接口只传数据类型：

```ts
type LessonResult = ApiResult<Lesson>
```

特殊校验接口覆盖错误类型：

```ts
interface ValidationError {
  field: string
  message: string
}

type CreateResult = ApiResult<Lesson, readonly ValidationError[]>
```

默认值适合“绝大多数调用相同、少数需要覆盖”的类型角色。必需类型参数应放在带默认值参数之前，默认类型也必须满足自己的约束。

## 泛型、联合类型、重载和 unknown 怎么选择

### 使用泛型

调用者关心多个位置的类型对应关系：

```ts
function first<Item>(items: readonly Item[]): Item | undefined
```

### 使用联合类型

只接受有限候选，且不需要保持输入输出精确对应：

```ts
function printId(id: string | number): void
```

### 使用重载

存在少量清楚的调用形式，且输入与返回有不同对应：

```ts
function parse(value: string): object
function parse(value: Uint8Array): object
```

### 使用 `unknown`

函数只接收一个暂时未知的值，并不把具体类型传播到其他位置：

```ts
function log(value: unknown): void
```

不要写没有关系的泛型：

```ts
function isReady<Value>(value: Value): boolean {
  return value != null
}
```

这里返回值永远是 `boolean`，实现也不使用 `Value` 的具体信息，直接接收 `unknown` 更诚实。

## 泛型 API 的设计顺序

设计一个通用函数时，可以按以下顺序：

1. 先写清楚一个具体版本，确认真实输入输出；
2. 找出哪些具体类型会变化；
3. 找出调用者需要保留的类型关系；
4. 只为这些关系引入类型参数；
5. 实现需要访问属性时，添加最低真实约束；
6. 优先让常见调用自然推断；
7. 返回值包含真实风险，不使用 `as` 删除 `undefined`；
8. 类型参数不断增加时，重新检查 API 是否承担太多职责。

官方泛型设计建议可以概括为三点：下推类型参数、减少类型参数、类型参数至少出现两次。它们不是机械规则，而是在帮助推断保持简单、错误信息保持可读。

## 完整示例：分页转换和通用仓库

这篇保留一个完整示例，因为它需要展示泛型关系怎样从仓库一直传播到分页结果：

```text
MemoryRepository<Lesson>
          ↓ findAll
readonly Lesson[]
          ↓ 放入 Page
Page<Lesson>
          ↓ mapPage
Page<LessonSummary>
          ↓ toSuccess
ApiResult<Page<LessonSummary>>
```

<<< ../../../examples/typescript/generics-and-constraints.ts

运行：

```bash
node --experimental-strip-types examples/typescript/generics-and-constraints.ts
```

阅读时重点观察：

- `mapPage` 的 `Input` 和 `Output` 都由调用位置推断；
- `MemoryRepository` 只约束真正依赖的 `id`；
- `Page<Lesson>` 转换后自动得到 `Page<LessonSummary>`；
- 普通数组首项保留 `undefined`，非空元组首项不需要；
- 默认错误类型让常见 `ApiResult<Data>` 保持简洁。

## 常见问题：泛型为什么没有按预期工作

### 返回结果变成 any

检查输入、约束或第三方声明中是否引入了 `any`。`any` 会沿泛型关系传播，最终让精确类型失效。

### 约束后为什么仍不能返回约束对象

约束只是具体类型的最低要求。`Value extends HasLength` 的调用者可能传入数组、字符串或更复杂对象，普通 `HasLength` 不能冒充完整 `Value`。

### 类型参数很多，错误信息无法阅读

检查每个参数是否真的建立独立关系。只用于约束一个回调、没有影响其他位置的参数通常可以直接写成普通函数类型。

### 为什么首项一定要处理 undefined

`Item[]` 没有表达非空。要么返回 `Item | undefined`，要么把非空前置条件写成元组，不能用断言删除运行时可能性。

### 为什么不能在运行时判断 Item

类型参数生成 JavaScript 时已擦除。需要运行时行为时，应额外传入值、构造函数或校验器。

### 应不应该手写尖括号

优先使用推断。空容器、缺少值证据或需要明确更宽目标类型时，再显式提供类型实参。

## 下一课

下一节是[`keyof`、`typeof` 与索引访问类型](/frontend/typescript/keyof-typeof-and-indexed-access)。本课刻意没有展开 `K extends keyof T`，因为下一课会先建立值空间与类型空间，再系统解释：

- 怎样从已有对象和值派生类型；
- 怎样得到对象的合法键集合；
- 怎样让返回类型随具体键精确变化；
- 为什么宽泛字符串不能安全索引对象；
- 怎样从常量配置和数组中提取可维护类型。

## 参考资料

- [TypeScript Handbook：Generics](https://www.typescriptlang.org/docs/handbook/2/generics.html)
- [TypeScript Handbook：More on Functions - Generic Functions](https://www.typescriptlang.org/docs/handbook/2/functions.html#generic-functions)
- [TypeScript Handbook：Guidelines for Writing Good Generic Functions](https://www.typescriptlang.org/docs/handbook/2/functions.html#guidelines-for-writing-good-generic-functions)
- [TypeScript Handbook：Generic Classes](https://www.typescriptlang.org/docs/handbook/2/classes.html#generic-classes)
- [TypeScript Handbook：Generic Object Types](https://www.typescriptlang.org/docs/handbook/2/objects.html#generic-object-types)
