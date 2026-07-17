---
title: TypeScript 映射类型与常用工具类型
description: 从课程实体派生创建输入、更新 DTO、表单状态和事件处理器，理解映射修饰符与标准工具类型
outline: deep
---

# TypeScript 映射类型与常用工具类型

[上一课](/frontend/typescript/conditional-types-and-infer)学习了怎样根据条件选择和提取类型。映射类型解决另一种重复：已有对象包含一组字段，现在需要为每个字段执行相同的类型变换。

例如课程表单每个字段都有“是否触碰”状态：

```ts
interface LessonForm {
  title: string
  durationMinutes: number
  published: boolean
}

interface LessonFieldTouched {
  title: boolean
  durationMinutes: boolean
  published: boolean
}
```

新增字段后，两份接口必须手工同步。真正的规则是：遍历表单的每个键，把值改成 `boolean`。

```ts
type FieldTouched<Model> = {
  [Key in keyof Model]: boolean
}

type LessonFieldTouched = FieldTouched<LessonForm>
```

这一课围绕四种对象变换展开：

```text
改变修饰符：可选、必填、只读、可写
选择字段：Pick、Omit
有限键映射：Record
重命名或过滤键：映射类型中的 as
```

## 映射类型是类型层面的逐键变换

基本结构：

```ts
type Copy<Model> = {
  [Key in keyof Model]: Model[Key]
}
```

按顺序理解：

1. `keyof Model` 得到键联合；
2. `Key in ...` 逐个访问这些键；
3. `Model[Key]` 得到当前键对应的值类型；
4. 每个结果属性组成新对象类型。

```ts
interface LessonForm {
  title: string
  durationMinutes: number
  published: boolean
}

type AsyncFields<Model> = {
  [Key in keyof Model]: Promise<Model[Key]>
}

type AsyncLessonForm = AsyncFields<LessonForm>
// {
//   title: Promise<string>
//   durationMinutes: Promise<number>
//   published: Promise<boolean>
// }
```

`Model[Key]` 保留键和值的对应关系，而不是把所有字段都扩大成 `Promise<string | number | boolean>`。

### 映射类型不会遍历运行时对象

```ts
type BooleanFields<Model> = {
  [Key in keyof Model]: boolean
}
```

它不会生成 JavaScript，也不会创建真实对象。仍需编写实际值：

```ts
const touched: BooleanFields<LessonForm> = {
  title: false,
  durationMinutes: false,
  published: false
}
```

类型只能检查这个对象，不能替代运行时循环、对象展开或数据转换。

### 与索引签名的区别

开放字典使用索引签名：

```ts
type Scores = {
  [lessonId: string]: number
}
```

有限已知键使用映射类型：

```ts
type Status = 'draft' | 'reviewing' | 'published'

type StatusLabels = {
  [Current in Status]: string
}
```

后者要求所有状态都有标签；直接编写对象字面量时，多余或拼错的键也会被检查出来。`Record<Status, string>` 就是这种有限键映射的标准写法。

## 映射修饰符改变可选和只读状态

直接遍历 `keyof Model` 通常会保留原属性修饰符：

```ts
interface Lesson {
  readonly id: string
  summary?: string
}

type Same<Model> = {
  [Key in keyof Model]: Model[Key]
}

type SameLesson = Same<Lesson>
// readonly id: string
// summary?: string
```

这类保留原修饰符的变换常被称为同态映射。

### 添加可选属性

```ts
type Optional<Model> = {
  [Key in keyof Model]?: Model[Key]
}
```

它近似标准 `Partial<Model>`。

### 移除可选属性

```ts
type RequiredFields<Model> = {
  [Key in keyof Model]-?: Model[Key]
}
```

`-?` 表示移除可选修饰符，对应 `Required<Model>`。

### 添加或移除只读

```ts
type ReadonlyFields<Model> = {
  readonly [Key in keyof Model]: Model[Key]
}

type Mutable<Model> = {
  -readonly [Key in keyof Model]: Model[Key]
}
```

`+` 表示添加，可以省略；`-` 表示移除。

这些都是浅层变换。把属性本身标为只读，不会递归改变嵌套对象的成员。

## `Partial` 适合局部更新，但不是通用 DTO

```ts
interface Lesson {
  readonly id: string
  title: string
  summary: string | null
  durationMinutes: number
  published: boolean
  readonly createdAt: Date
}
```

直接写 `Partial<Lesson>` 会允许修改 `id` 和 `createdAt`，也让每个字段都可选。更准确的更新输入先选择允许更新的字段：

```ts
type UpdateLessonInput = Partial<Pick<
  Lesson,
  'title' | 'summary' | 'durationMinutes' | 'published'
>>
```

它表达两条规则：

1. 只有列出的字段能更新；
2. 每次请求可以只提供其中一部分。

`Partial` 不会自动变成深层 Patch：

```ts
interface Settings {
  appearance: {
    theme: string
    density: string
  }
}

type SettingsPatch = Partial<Settings>
```

`appearance` 可以缺失，但一旦提供，内部仍要求完整 `theme` 和 `density`。

开启 `exactOptionalPropertyTypes` 时，`Partial` 产生的可选字段不自动允许显式 `undefined`。如果协议用 `null` 表示清空，就应在原字段或更新 DTO 中明确写出 `null`。

### `Required` 适合从草稿走向完成态吗

```ts
type CompleteDraft = Required<Draft>
```

它只把属性改成必填，并不会验证空字符串、非法数字或业务依赖。若完成态有新的不变量，显式领域类型和运行时构造函数通常比机械 `Required` 更准确。

### `Readonly` 提供浅层只读视图

```ts
function renderLesson(lesson: Readonly<Lesson>): string {
  return lesson.title
}
```

它表达函数不会通过当前引用修改顶层字段，不会调用 `Object.freeze()`，也不会递归冻结嵌套数据。

## `Pick` 与 `Omit` 选择对象字段

只选择列表需要的字段：

```ts
type LessonListItem = Pick<
  Lesson,
  'id' | 'title' | 'published'
>
```

排除内部字段：

```ts
type PublicLesson = Omit<Lesson, 'createdAt'>
```

选择原则不是哪个更短，而是哪个更稳定：

- 允许字段集合很小且安全要求高：优先 `Pick` 白名单；
- 只排除少量明确字段，其余字段都应跟随模型：可以 `Omit`；
- 对外公开、权限和日志脱敏场景，白名单通常更安全；
- 类型名字仍应表达业务含义，不要让长串工具类型取代领域语言。

`Pick` 和 `Omit` 只产生静态类型，不会在运行时删除对象字段：

```ts
type Public = Omit<Lesson, 'createdAt'>

const publicLesson: Public = lesson
// 运行时对象仍可能拥有 createdAt。
```

真正序列化前仍需显式选择字段。

## `Record` 建立有限键到统一值的映射

```ts
type Status = 'draft' | 'published' | 'archived'
type StatusLabels = Record<Status, string>

const labels: StatusLabels = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档'
}
```

漏写或多写键都会报错。

不要把 `Record<string, Value>` 理解成任意键运行时都存在：

```ts
const scores: Record<string, number> = {}
const value = scores['missing']
```

运行时仍得到 `undefined`。开启 `noUncheckedIndexedAccess` 后类型会反映这一点。若键集合有限，应使用字面量联合；若真正开放，应在读取处处理缺失。

## 键重映射可以重命名或过滤属性

映射类型的 `as` 子句能够产生新键：

```ts
type Getters<Model> = {
  [Key in keyof Model as `get${Capitalize<string & Key>}`]:
    () => Model[Key]
}
```

`LessonForm` 会产生 `getTitle`、`getDurationMinutes` 和 `getPublished`。

模板字面量类型将在下一课系统讲解；这里先理解 `as` 决定输出键。

### 映射为 `never` 可以删除键

```ts
type RemoveId<Model> = {
  [Key in keyof Model as Key extends 'id' ? never : Key]: Model[Key]
}
```

键被映射为 `never` 后不会出现在结果中。这是键级过滤，不是运行时删除。

## 从事件联合生成处理器对象

映射类型不仅能遍历对象键，也能遍历可作为属性键的联合成员：

```ts
type LessonEvent =
  | { type: 'lesson.created'; payload: { id: string } }
  | { type: 'lesson.published'; payload: { id: string; at: Date } }

type EventHandlers<Event extends { type: PropertyKey }> = {
  [Current in Event as Current['type']]:
    (event: Current) => void
}
```

结果近似：

```ts
{
  'lesson.created': (
    event: Extract<LessonEvent, { type: 'lesson.created' }>
  ) => void
  'lesson.published': (
    event: Extract<LessonEvent, { type: 'lesson.published' }>
  ) => void
}
```

每个处理器参数保持对应事件的精确类型。如果增加事件成员，处理器对象会要求补齐新键。

这是映射类型最有价值的能力：不仅复制字段，还保持键、值和变体之间的关系。

## 工具类型遇到联合对象时要先确认语义

```ts
type Result =
  | { ok: true; data: string }
  | { ok: false; error: string }
```

直接对联合应用某些工具类型，结果可能只围绕联合的公共可见键工作，不符合“分别变换每个成员”的直觉。

如果确实要逐成员变换，可以显式分发：

```ts
type PartialEach<Member> =
  Member extends unknown ? Partial<Member> : never

type PartialResult = PartialEach<Result>
```

但对可辨识联合使用 `Partial` 往往会破坏 `ok` 与对应数据的关联。请求状态、支付方式等领域联合通常应显式设计变换后的状态，而不是机械套工具类型。

## 深层工具类型要谨慎

一个简单递归只读类型看似方便：

```ts
type DeepReadonly<Value> =
  Value extends (...args: never[]) => unknown
    ? Value
    : Value extends readonly unknown[]
      ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
      : Value extends object
        ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
        : Value
```

真实项目还要决定如何处理：

- `Date`、Map、Set 和类实例；
- 元组与可变数组；
- 函数和品牌类型；
- 递归深度与编译性能；
- 运行时数据是否真的不可变。

因此优先使用成熟库或明确领域边界。深层工具无法替代运行时冻结，也不能自动建立正确的状态更新策略。

## 完整示例：课程实体、表单和事件

示例展示一条常见派生路线：

```text
LessonEntity
   ├── Pick → CreateLessonInput
   ├── Partial<Pick<...>> → UpdateLessonInput
   └── Pick → LessonForm
                ├── 映射为 FieldTouched
                ├── Partial 映射为 FieldErrors
                └── 映射为 FieldConfig

LessonEvent 联合
   └── 键重映射 → EventHandlers
```

<<< ../../../examples/typescript/mapped-types-and-utility-types.ts

运行：

```bash
node --experimental-strip-types examples/typescript/mapped-types-and-utility-types.ts
```

完整示例中的 `Object.keys(fieldConfig)` 断言依赖一个明确前提：`fieldConfig` 是源码内封闭、完整的对象，没有额外运行时键。通用库不能无条件把所有对象键都断言成 `Array<keyof T>`。

## 常见问题：工具类型为什么让模型更松散

### 所有字段都变成可选后，业务规则消失了

`Partial` 只表达属性可缺失，不理解领域不变量。先 `Pick` 限制允许字段，复杂更新则显式设计 DTO。

### `Readonly` 后嵌套对象仍能修改

标准工具只处理顶层属性。需要深层不可变时，应同时设计运行时所有权和更新策略。

### `Omit` 后真实对象仍有字段

它只改变静态视图，不执行对象删除或安全序列化。公开数据必须运行时白名单化。

### `Record<string, T>` 读取后为什么可能 undefined

开放字典无法保证任意键存在。开启 `noUncheckedIndexedAccess`，并在读取处处理缺失。

### 对联合使用 Partial 后状态关系被破坏

工具类型可能分别或按公共键变换，却不理解业务状态。关键可辨识联合应显式建模。

### 自定义类型比原模型还难读

把复杂变换拆成具名中间类型；如果类型错误无法用业务语言解释，考虑直接声明目标领域类型。

## 选择工具类型的顺序

面对对象变体，可以依次判断：

1. 新类型是否有独立业务含义？先命名它；
2. 它只是原模型的稳定浅层变换吗？使用标准工具；
3. 哪些字段允许进入？先白名单 `Pick`，再改变修饰符；
4. 键集合是有限还是开放？有限用 `Record<Union, T>`，开放字典处理缺失；
5. 是否需要保留每个键的原值类型？使用 `Model[Key]`；
6. 是否在变换可辨识联合？先检查是否会破坏成员关联；
7. 是否试图做深层递归？明确容器、类实例和运行时语义后再决定。

## 下一课

下一节是[模板字面量类型与类型安全契约](/frontend/typescript/template-literal-types-and-type-safe-contracts)。本课已经在键重映射中预览了 `get${Capitalize<Key>}`。下一课会系统解释：

- 怎样组合字符串字面量联合；
- 为什么模板字面量会产生笛卡尔积；
- 怎样把字段名映射为事件名；
- 怎样在字符串协议精度与类型复杂度之间取舍。

## 参考资料

- [TypeScript Handbook：Mapped Types](https://www.typescriptlang.org/docs/handbook/2/mapped-types.html)
- [TypeScript Handbook：Utility Types](https://www.typescriptlang.org/docs/handbook/utility-types.html)
- [TypeScript Handbook：Key Remapping via `as`](https://www.typescriptlang.org/docs/handbook/2/mapped-types.html#key-remapping-via-as)
- [TSConfig：exactOptionalPropertyTypes](https://www.typescriptlang.org/tsconfig/exactOptionalPropertyTypes.html)
- [TSConfig：noUncheckedIndexedAccess](https://www.typescriptlang.org/tsconfig/noUncheckedIndexedAccess.html)
