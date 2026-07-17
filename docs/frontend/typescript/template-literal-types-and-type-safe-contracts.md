---
title: TypeScript 模板字面量类型与类型安全契约
description: 从有限字符串规则派生事件名和路由参数，并用 satisfies 校验配置契约
outline: deep
---

# TypeScript 模板字面量类型与类型安全契约

[上一课](/frontend/typescript/mapped-types-and-utility-types)使用映射类型逐键生成对象结构，并在键重映射中见过：

```ts
type Getters<Model> = {
  [Key in keyof Model as `get${Capitalize<string & Key>}`]:
    () => Model[Key]
}
```

其中 `` `get${...}` `` 不是 JavaScript 模板字符串，而是**模板字面量类型**。它在编译阶段描述一组符合规则的字符串。

这项能力适合解决前端中一类常见问题：事件名、路由、配置键看起来只是字符串，实际上各部分之间存在稳定关系。如果所有参数都写成 `string`，拼写和关联错误只能等到运行时才暴露。

本课从一个表单事件开始，再把同一思路扩展到路由与配置表。

## 从普通字符串到有限字符串契约

假设表单库约定字段变化事件由“字段名 + `Changed`”组成：

```ts
interface LessonForm {
  title: string
  durationMinutes: number
  published: boolean
}

function on(eventName: string, callback: (value: unknown) => void) {
  // 注册事件
}
```

这个签名过于宽松：`titleChange`、`titelChanged` 都能通过，回调值也失去了字段类型。

先写一个最小模板字面量类型：

```ts
type Field = 'title'
type ChangeEvent = `${Field}Changed`
// 'titleChanged'
```

它与值位置的模板字符串语法相似，存在阶段却不同：

```ts
const field = 'title'
const eventName = `${field}Changed` // 运行时产生字符串值

type Field = 'title'
type EventName = `${Field}Changed`  // 编译期产生字符串类型
```

类型不会创建真实字符串，也不会为外部输入做运行时校验。

## 联合插入模板后会逐项展开

插值位置是联合类型时，每个成员都会参与组合：

```ts
type Field = 'title' | 'durationMinutes' | 'published'
type ChangeEvent = `${Field}Changed`
// 'titleChanged' | 'durationMinutesChanged' | 'publishedChanged'
```

有多个联合位置时，结果是所有可能组合，也就是笛卡尔积：

```ts
type Resource = 'lesson' | 'course'
type Action = 'created' | 'updated'

type EventName = `${Resource}.${Action}`
// 'lesson.created' | 'lesson.updated'
// | 'course.created' | 'course.updated'
```

若第一个位置有 3 个成员、第二个有 4 个，结果就有 `3 × 4 = 12` 个成员。

### 能组合不等于应该组合

假设课程允许发布，但学习路径不允许：

```ts
type Resource = 'lesson' | 'learningPath'
type Action = 'created' | 'published'
type EventName = `${Resource}.${Action}`
```

这会错误地产生 `learningPath.published`。类型的目标是表达真实规则，不是追求最短写法。组合并非完全规则时，显式联合更准确：

```ts
type EventName =
  | 'lesson.created'
  | 'lesson.published'
  | 'learningPath.created'
```

### 组合规模必须受控

模板字面量适合少量、稳定、可穷举的集合。语言 × 命名空间 × 页面 × 消息可能生成数千个成员，拖慢类型检查和编辑器提示。TypeScript 官方文档也建议大型字符串联合提前生成。

大型国际化资源、OpenAPI 路由或 CMS 动态字段通常应使用代码生成或运行时 Schema，而不是手写越来越复杂的类型运算。

## 从模型键派生事件名

字段名不应重复维护，可以从对象模型获得：

```ts
type ChangeEventName<Model> =
  `${string & keyof Model}Changed`

type LessonChangeEvent = ChangeEventName<LessonForm>
// 'titleChanged' | 'durationMinutesChanged' | 'publishedChanged'
```

为什么不是直接写 `keyof Model`？对象键可能是 `string | number | symbol`，而这里的命名协议只处理字符串键。`string & keyof Model` 取出其中可作为字符串的部分。

也可以写成更直观的工具类型：

```ts
type StringKeyOf<Model> = Extract<keyof Model, string>
type ChangeEventName<Model> = `${StringKeyOf<Model>}Changed`
```

## 事件名与回调参数必须保持关联

只校验事件名还不够：监听 `titleChanged` 时回调应接收 `string`，监听 `publishedChanged` 时应接收 `boolean`。

```ts
type EventSource<Model> = {
  on<Key extends string & keyof Model>(
    eventName: `${Key}Changed`,
    callback: (newValue: Model[Key]) => void
  ): void
}
```

调用时发生的推断过程是：

1. 从 `'titleChanged'` 中匹配出 `Key` 为 `'title'`；
2. 验证 `'title'` 确实属于 `keyof Model`；
3. 用 `Model['title']` 查到值类型 `string`；
4. 把 `string` 传递给回调参数。

```ts
declare const lessonEvents: EventSource<LessonForm>

lessonEvents.on('titleChanged', title => {
  title.toUpperCase() // title: string
})

lessonEvents.on('publishedChanged', published => {
  console.log(published ? '已发布' : '草稿')
})
```

这里真正重要的不是字符串拼接，而是事件名中的字段与回调值之间仍保留对应关系。

## 与映射类型组合生成处理器对象

如果 API 使用一个处理器对象而不是 `on()` 方法，可以把上一课的键重映射接进来：

```ts
type ChangeHandlers<Model> = {
  [Key in keyof Model as `${string & Key}Changed`]:
    (newValue: Model[Key]) => void
}
```

对 `LessonForm` 而言，结果近似：

```ts
type LessonChangeHandlers = {
  titleChanged: (newValue: string) => void
  durationMinutesChanged: (newValue: number) => void
  publishedChanged: (newValue: boolean) => void
}
```

模型新增字段后，处理器对象会要求补上对应事件；字段值类型变化后，处理器参数也会同步变化。

## 内置字符串操作类型只处理命名

TypeScript 内置四个字符串操作类型：

```ts
type A = Uppercase<'lesson'>       // 'LESSON'
type B = Lowercase<'VUE'>          // 'vue'
type C = Capitalize<'lesson'>      // 'Lesson'
type D = Uncapitalize<'Course'>    // 'course'
```

它们常与键重映射组合：

```ts
type Getters<Model> = {
  [Key in keyof Model as `get${Capitalize<string & Key>}`]:
    () => Model[Key]
}
```

这些类型由编译器实现，不是需要导入的运行时函数。其大小写转换不感知 locale，因此适合代码标识符和协议键，不适合生成面向用户的本地化文案。

## 模板匹配可以从字符串中提取信息

模板字面量也能放进条件类型，通过 `infer` 捕获其中一段：

```ts
type ChangedField<Event extends string> =
  Event extends `${infer Field}Changed`
    ? Field
    : never

type A = ChangedField<'titleChanged'> // 'title'
type B = ChangedField<'lesson.created'> // never
```

可以把它理解成编译期的结构拆分，但它不是正则表达式引擎。

```ts
type SplitOnce<Value extends string> =
  Value extends `${infer Head}.${infer Tail}`
    ? [Head, Tail]
    : [Value]

type Parts = SplitOnce<'lesson.created.v1'>
// ['lesson', 'created.v1']
```

第一个 `infer` 会得到匹配结构所需的前一段，剩余内容进入后一段。复杂语法、转义和错误位置仍应交给真正的解析器。

## 路由参数展示了“类型算法 + 运行时实现”

路由模板是很好的边界案例：类型可以提取参数名，真正替换与 URL 编码仍必须由 JavaScript 完成。

```ts
type RouteParamNames<Path extends string> =
  Path extends `${string}:${infer Param}/${infer Rest}`
    ? Param | RouteParamNames<`/${Rest}`>
    : Path extends `${string}:${infer Param}`
      ? Param
      : never
```

逐步看 `/courses/:courseId/lessons/:lessonId`：

1. 第一分支捕获 `courseId`，并把剩余路径递归交给自身；
2. 剩余路径捕获末尾的 `lessonId`；
3. 返回 `'courseId' | 'lessonId'`。

再把联合变为参数对象：

```ts
type ParamsFor<Path extends string> =
  Record<RouteParamNames<Path>, string>
```

```ts
declare function buildRoute<Path extends string>(
  template: Path,
  params: ParamsFor<Path>
): string

buildRoute('/courses/:courseId/lessons/:lessonId', {
  courseId: 'typescript',
  lessonId: 'template-literal-types'
})
```

少写或拼错参数键会在编译时暴露。不过类型仍不能完成这些工作：

- 运行时替换 `:param`；
- 对参数调用 `encodeURIComponent`；
- 验证外部模板可信且语法正确；
- 支持可选参数、通配符和复杂路由规则。

成熟路由库已经有自己的语法和类型时，应使用库提供的能力，避免维护一套不完全兼容的解析器。

## `satisfies` 用来检查契约表而不覆盖推断结果

模板字面量经常用于配置对象。现在需要保证所有接口路径都符合格式：

```ts
type ApiVersion = 'v1' | 'v2'
type Resource = 'lessons' | 'courses'
type ApiEndpoint = `/api/${ApiVersion}/${Resource}`
```

直接使用类型注解：

```ts
const endpoints: Record<string, ApiEndpoint> = {
  lessons: '/api/v1/lessons'
}
```

变量会以目标类型为准，具体属性值的信息可能变宽。`satisfies` 的职责不同：检查表达式可赋给目标类型，同时保留表达式自身的推断结果。

```ts
const endpoints = {
  lessons: '/api/v1/lessons',
  courses: '/api/v2/courses'
} satisfies Record<string, ApiEndpoint>
```

如果写成 `/api/v3/lessons` 会报错，而 `endpoints.lessons` 仍保留更具体的信息。

### 类型注解、断言与 `satisfies` 不是同一件事

```ts
const annotated: Contract = value
const asserted = value as Contract
const checked = value satisfies Contract
```

它们分别表达：

- 类型注解：检查 `value`，变量采用 `Contract`；
- 类型断言：要求编译器按 `Contract` 看待值，可能绕过不兼容问题；
- `satisfies`：检查 `value` 满足 `Contract`，表达式仍保留自身类型。

`satisfies` 不是类型转换，不校验运行时数据，也不会生成 JavaScript。

### `as const satisfies` 各自承担一半职责

```ts
type EndpointName = 'lessonList' | 'courseList'

const endpoints = {
  lessonList: '/api/v1/lessons',
  courseList: '/api/v1/courses'
} as const satisfies Record<EndpointName, ApiEndpoint>
```

- `as const` 保留只读字面量信息；
- `satisfies` 检查键完整且值符合端点格式。

它不会执行 `Object.freeze()`。所谓只读仍是静态约束，不是运行时冻结。

## 外部字符串必须经过运行时校验

下面的函数只接受正确事件名：

```ts
function subscribe(eventName: 'lesson.created' | 'lesson.published') {
  // ...
}
```

但来自地址栏、接口、localStorage 或消息队列的数据通常只是 `string` 或 `unknown`：

```ts
const eventName = JSON.parse(input) as unknown
```

模板字面量无法证明它在运行时有效。需要解析或类型守卫：

```ts
type LessonEventName = 'lesson.created' | 'lesson.published'

function isLessonEventName(value: unknown): value is LessonEventName {
  return value === 'lesson.created' || value === 'lesson.published'
}

if (isLessonEventName(eventName)) {
  subscribe(eventName)
}
```

因此边界很清楚：

```text
程序内部的有限规则 → 模板字面量提供拼写、推断和重构保障
程序外部的动态输入 → 运行时解析、校验和错误处理
```

## 完整示例：事件、端点与路由

完整示例把三条关系放在一起：

```text
表单模型的键 ──→ `${Key}Changed` ──→ 对应值类型的处理器
版本与资源联合 ──→ `/api/${Version}/${Resource}` ──→ 端点配置
路由模板 ──→ 参数名联合 ──→ 必填参数对象 ──→ 运行时 URL
```

<<< ../../../examples/typescript/template-literal-types-and-type-safe-contracts.ts

运行：

```bash
node --experimental-strip-types examples/typescript/template-literal-types-and-type-safe-contracts.ts
```

示例中的路由实现包含一个受控断言。它依赖“类型递归所接受的参数名语法”和“运行时正则捕获的参数名语法”始终一致；若其中一边改变，另一边也必须同步。这正是类型世界和运行时世界衔接时应明确记录的假设。

## 什么时候值得使用

优先考虑模板字面量类型：

- 字符串集合有限且命名规则稳定；
- 规则能消除重复声明或常见拼写错误；
- 字符串的一部分需要决定另一个参数的类型；
- 生成后的联合仍容易阅读和调试。

考虑显式联合、代码生成或运行时 Schema：

- 并非所有组合都有业务意义；
- 联合规模很大或来源由外部系统维护；
- 协议包含转义、可选段或复杂语法；
- 类型实现已经比业务规则更难解释。

一个实用判断是：如果团队成员看见类型错误后，不能快速用业务语言说明哪里错了，这个类型可能已经过度设计。

## 本课小结

模板字面量类型的核心不是“在类型里拼字符串”，而是建立关系：

1. 联合成员放入模板后形成有限字符串集合；
2. 多个联合会交叉组合，规模与业务合法性都要控制；
3. `infer` 可以从字符串结构中反向提取信息；
4. 它与 `keyof`、索引访问、条件类型和映射类型组合后，能保持名称与值类型的对应；
5. `satisfies` 适合校验配置契约，同时保留表达式的具体推断；
6. 所有动态输入和真实字符串处理仍需要运行时代码。

## 下一课

下一节是[项目配置与模块边界](/frontend/typescript/project-configuration-and-module-boundaries)。前面的课程主要解决“一个文件里的类型如何准确”，下一课转向工程层面：

- `tsconfig.json` 怎样决定哪些代码被检查、以什么规则检查；
- `module` 与 `moduleResolution` 为什么必须匹配真实运行环境；
- 类型导入、包导出和项目引用怎样形成模块边界；
- 为什么能通过编辑器检查的代码，仍可能在 Node.js 或打包器中运行失败。

## 参考资料

- [TypeScript Handbook：Template Literal Types](https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html)
- [TypeScript 4.9：The `satisfies` Operator](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html#the-satisfies-operator)
- [TypeScript Handbook：Mapped Types](https://www.typescriptlang.org/docs/handbook/2/mapped-types.html)
- [TypeScript Handbook：Creating Types from Types](https://www.typescriptlang.org/docs/handbook/2/types-from-types.html)
