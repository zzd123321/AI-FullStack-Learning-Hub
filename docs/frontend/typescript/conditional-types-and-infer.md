---
title: TypeScript 条件类型与 infer
description: 理解类型层面的可赋值性分支、infer 结构提取、联合分发与过滤原理
outline: deep
---

# TypeScript 条件类型与 `infer`

[上一课](/frontend/typescript/keyof-typeof-and-indexed-access)学习了怎样从已知对象和键直接查询类型。这一课进一步处理带有分支和结构提取的关系：

- 输入是数组时取得元素，否则保留原类型；
- 输入是函数时取得返回类型；
- 输入是 Promise 时取得最终结果；
- 从联合类型中保留或排除满足条件的成员。

条件类型可以理解为类型层面的选择：

```ts
type IsString<Value> = Value extends string ? true : false
```

但它不是运行时 `if`。它不会读取真实值，也不会生成 JavaScript 分支。

## 条件类型判断的是可赋值性

基本形式：

```ts
type Result = CheckedType extends Constraint
  ? TrueType
  : FalseType
```

含义是：如果 `CheckedType` 可以赋值给 `Constraint`，选择真分支，否则选择假分支。

```ts
type IsString<Value> = Value extends string ? true : false

type A = IsString<'TypeScript'> // true
type B = IsString<number>       // false
```

这里的 `extends` 不是检查类是否显式继承。TypeScript 使用结构化类型：

```ts
interface HasId {
  id: string
}

type HasStringId<Value> = Value extends HasId ? true : false

type LessonCheck = HasStringId<{
  id: string
  title: string
}>
// true
```

对象至少具备 `id: string`，就可赋值给 `HasId`。

### 条件类型不会执行运行时校验

```ts
type IsArray<Value> =
  Value extends readonly unknown[] ? true : false
```

它只能选择静态结果。检查用户输入仍需要：

```ts
function process(value: unknown): void {
  if (Array.isArray(value)) {
    console.log(value.length)
  }
}
```

类型系统回答“根据声明应该是什么”，运行时代码回答“当前真实值是什么”。

## 条件类型通常与泛型一起使用

对固定类型判断意义不大：

```ts
type Known = string extends string ? 1 : 0
// 1
```

泛型让同一规则处理不同输入：

```ts
type ApiField<Value> =
  Value extends Date ? string : Value

type DateField = ApiField<Date>   // string
type TitleField = ApiField<string> // string
type CountField = ApiField<number> // number
```

可以把条件类型看作接收类型并返回类型的静态函数。

### 约束放在参数上，还是条件里

提取 `message` 属性有两种语义。

不满足条件就拒绝调用：

```ts
type MessageOfStrict<
  Value extends { message: unknown }
> = Value['message']
```

不满足条件就得到 `never`：

```ts
type MessageOf<Value> =
  Value extends { message: unknown }
    ? Value['message']
    : never
```

选择依据：

- 调用者传错类型应立即报错：使用泛型约束；
- 类型转换需要跳过不匹配成员：在条件中判断并返回 `never`。

在真分支中，TypeScript 已经知道 `Value` 拥有 `message`，所以 `Value['message']` 合法。这是类型层面的收窄。

## `infer` 给匹配到的内部类型命名

取得数组元素可以写：

```ts
type ElementOf<Value> =
  Value extends readonly (infer Element)[]
    ? Element
    : Value
```

阅读方式：

```text
Value 是否符合 readonly 某种元素数组？
                   ↓ 是
把该元素类型临时命名为 Element
                   ↓
返回 Element
```

```ts
type A = ElementOf<string[]> // string
type B = ElementOf<number>   // number
```

`infer` 只能在条件类型的 `extends` 匹配结构中声明。它不是运行时变量，也不需要提前知道被提取的具体类型。

### 从函数中提取返回值和参数

```ts
type ReturnOf<FunctionType> =
  FunctionType extends (...args: never[]) => infer Result
    ? Result
    : never

type ParametersOf<FunctionType> =
  FunctionType extends (...args: infer Args) => unknown
    ? Args
    : never
```

使用：

```ts
function createLesson(title: string, minutes: number) {
  return { title, minutes }
}

type Lesson = ReturnOf<typeof createLesson>
type CreateLessonArgs = ParametersOf<typeof createLesson>
// [title: string, minutes: number]
```

生产代码优先使用标准 `ReturnType` 和 `Parameters`。自己实现这些类型的目的，是理解 `infer` 怎样匹配结构。

### 从元组和 Promise 中提取

```ts
type Head<Tuple> =
  Tuple extends readonly [infer First, ...unknown[]]
    ? First
    : never

type PromiseValue<Value> =
  Value extends Promise<infer Result>
    ? Result
    : Value
```

简单 `PromiseValue` 只展开一层。标准 `Awaited<Value>` 还处理嵌套 Promise、类 Promise 对象、`null` 和 `undefined` 等完整语义，业务代码应优先使用它。

### 可以约束 infer 得到的类型

```ts
type StringHead<Tuple> =
  Tuple extends readonly [infer First extends string, ...unknown[]]
    ? First
    : never
```

只有首项是字符串时才保留。约束让匹配条件更明确，但过度嵌套会迅速降低可读性，应拆成有意义的中间类型。

## 分布式条件类型会逐个处理联合成员

当条件左侧是裸类型参数时，传入联合会逐个分发：

```ts
type ToArray<Value> = Value extends unknown ? Value[] : never

type Result = ToArray<string | number>
// string[] | number[]
```

可以把它展开为：

```text
ToArray<string | number>
        ↓ 分发
ToArray<string> | ToArray<number>
        ↓
string[] | number[]
```

这与 `(string | number)[]` 不同：前者是纯字符串数组或纯数字数组，后者允许数组中混合两种元素。

### 利用分发过滤联合成员

```ts
type OnlyStrings<Value> =
  Value extends string ? Value : never

type Result = OnlyStrings<'draft' | 404 | 'published'>
// "draft" | "published"
```

过程：

```text
"draft"     → "draft"
404          → never
"published" → "published"
合并联合     → "draft" | never | "published"
             → "draft" | "published"
```

`never` 是空联合成员，合并时会消失，因此非常适合过滤。

### `Exclude`、`Extract` 和 `NonNullable`

它们的核心原理可以近似写成：

```ts
type MyExclude<Union, Excluded> =
  Union extends Excluded ? never : Union

type MyExtract<Union, Included> =
  Union extends Included ? Union : never

type MyNonNullable<Value> =
  Value extends null | undefined ? never : Value
```

使用标准工具：

```ts
type Status = 'idle' | 'loading' | 'success' | 'error'
type Settled = Exclude<Status, 'idle' | 'loading'>
// "success" | "error"

type Text = Extract<string | number | null, string>
// string

type Present = NonNullable<string | null | undefined>
// string
```

### 从可辨识联合筛选成员

```ts
type LearningEvent =
  | { type: 'started'; payload: { lessonId: string } }
  | { type: 'completed'; payload: { lessonId: string; score: number } }
  | { type: 'failed'; payload: { reason: string } }

type CompletedEvent = Extract<
  LearningEvent,
  { type: 'completed' }
>
```

结构化可赋值性让 `Extract` 保留唯一匹配成员。随后可以继续提取 `CompletedEvent['payload']`。

## 用方括号关闭分发

有时想判断整个联合是否满足条件，而不是逐成员处理：

```ts
type IsString<Value> =
  Value extends string ? true : false

type A = IsString<string | number>
// boolean，即 true | false
```

把条件两边包成单元素元组：

```ts
type IsStringAsWhole<Value> =
  [Value] extends [string] ? true : false

type B = IsStringAsWhole<string | number>
// false
```

现在比较的是整个 `string | number` 是否能赋给 `string`。

不要为了记语法而机械加方括号。先问：业务规则是逐个转换联合成员，还是判断整个联合？

## `never`、`unknown` 和 `any` 的边界

### `never` 作为输入可能直接消失

裸类型参数条件会分发，而 `never` 没有联合成员可分发：

```ts
type IsNeverWrong<Value> =
  Value extends never ? true : false

type Result = IsNeverWrong<never>
// never，不是 true。
```

关闭分发后检查：

```ts
type IsNever<Value> =
  [Value] extends [never] ? true : false
```

### `unknown` 是安全顶层类型

```ts
type Wrap<Value> = Value extends unknown ? Value[] : never
```

普通具体类型都能赋给 `unknown`，因此常用它触发分发而不关闭检查。

### `any` 会污染条件结果

`any` 可能让条件结果同时包含真、假分支，并继续关闭后续检查。高级类型内部也应尽量使用 `unknown`、具体结构或 `never[]` 描述未知位置，而不是依赖 `any`。

## 重载函数只能从最后签名推断

对具有多个重载签名的函数使用条件推断时，通常从最后一个、最宽的签名推断：

```ts
declare function parse(value: string): string
declare function parse(value: number): number
declare function parse(value: string | number): string | number

type Parsed = ReturnType<typeof parse>
// string | number
```

条件类型不会对重载列表逐个执行调用解析。若需要保留每种调用的对应关系，可能要重新建模为函数联合、映射或显式接口，而不是期待 `infer` 自动还原全部重载。

## 递归条件类型要有清楚终止条件

```ts
type UnwrapPromise<Value> =
  Value extends Promise<infer Inner>
    ? UnwrapPromise<Inner>
    : Value
```

它会一直展开，直到不再是 Promise。递归类型适合树、嵌套 Promise 等递归结构，但复杂度和编译成本也会增长。

优先使用 `Awaited` 等标准工具。自定义递归类型必须有明确终止分支，并避免对不受控深度数据进行类型体操。

## 完整示例：API 结果与学习事件

示例把本课最常见的两种用途放在一起：

1. 从 API 结果联合中提取成功数据和失败错误；
2. 从事件联合中筛选指定事件并提取 payload；
3. 从异步函数本身派生最终返回类型；
4. 使用运行时判断实现 `NonNullable` 对应的真实保证。

<<< ../../../examples/typescript/conditional-types-and-infer.ts

运行：

```bash
node --experimental-strip-types examples/typescript/conditional-types-and-infer.ts
```

类型数据流：

```text
ApiResult<Page<Lesson>, ApiError>
       ├── SuccessData → Page<Lesson>
       └── FailureData → ApiError

LearningEvent
       ↓ Extract type = completed
CompletedEvent
       ↓ infer payload
CompletedPayload
```

## 常见问题：条件类型为什么得到意外结果

### 联合输入得到一组结果，而不是一个整体结果

裸类型参数触发了分发。先确认是否需要逐成员处理；需要整体判断时使用 `[Value] extends [Constraint]`。

### 过滤结果突然变成 never

所有联合成员都进入了 `never` 分支，或者输入本身已经是 `never`。逐个展开成员检查可赋值性最容易定位。

### infer 为什么不能在任意位置声明

`infer` 表示“从匹配结构的某个位置提取”，因此只能出现在条件类型的 `extends` 模式中。

### ReturnType 为什么没有保留每个重载结果

标准推断基于最后一个重载签名，不执行逐重载匹配。复杂重载 API 需要显式建模。

### 条件类型能否验证接口数据

不能。它只操作静态类型；网络 JSON 仍需运行时 Schema 或守卫。

### 是否应该重新实现所有工具类型

学习时可以复现原理，生产代码优先使用标准 `Exclude`、`Extract`、`NonNullable`、`ReturnType`、`Parameters`、`InstanceType` 和 `Awaited`。标准工具处理的边界更完整，团队也更熟悉。

## 控制复杂度的原则

- 条件类型应表达稳定、可复用的类型关系，不追求炫技；
- 分支超过两三层时拆成具名中间类型；
- 先展开一个具体输入验证结果，再推广到泛型；
- 分布行为必须有意选择，不依赖碰巧得到正确结果；
- 运行时行为和静态类型分别实现，不能只写类型承诺；
- 标准工具足够时不要重复发明；
- 类型错误比原业务概念更难理解时，说明抽象可能过度。

## 下一课

下一节是[映射类型与常用工具类型](/frontend/typescript/mapped-types-and-utility-types)。条件类型负责选择和提取，映射类型负责遍历对象键并逐项变换。下一课会继续解释：

- 如何遍历 `keyof T` 生成新对象类型；
- 如何添加、移除 `readonly` 和可选修饰符；
- `Partial`、`Required`、`Readonly`、`Pick`、`Omit`、`Record` 的原理；
- 为什么深层工具类型必须控制边界。

## 参考资料

- [TypeScript Handbook：Conditional Types](https://www.typescriptlang.org/docs/handbook/2/conditional-types.html)
- [TypeScript Handbook：Utility Types](https://www.typescriptlang.org/docs/handbook/utility-types.html)
- [TypeScript Handbook：Creating Types from Types](https://www.typescriptlang.org/docs/handbook/2/types-from-types.html)
- [TypeScript 4.5：Awaited Type](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-5.html#the-awaited-type-and-promise-improvements)
