---
title: 从 JavaScript 到 TypeScript
description: 理解 TypeScript 的价值、静态检查、类型推断、联合类型与类型收窄
outline: deep
---

# 从 JavaScript 到 TypeScript

> 适用环境：TypeScript 5.x、Node.js 22 或更高版本。本文聚焦稳定的语言基础，不依赖特定框架。

## 1. 学习目标

完成本节后，你应该能够：

- 解释 TypeScript 与 JavaScript 的关系。
- 区分编译阶段的类型检查和运行时行为。
- 使用类型推断、类型标注和联合类型。
- 通过条件判断完成类型收窄（Type Narrowing）。
- 理解 `type` 与 `interface` 的基本使用边界。
- 把一段简单的 JavaScript 代码迁移到 TypeScript 严格模式。

## 2. 前置知识

你需要熟悉 JavaScript 变量、函数、对象、数组和条件语句。暂时不需要了解泛型、装饰器或 Vue 3。

## 3. 为什么需要 TypeScript

JavaScript 的类型错误经常要等代码执行到特定路径后才会暴露：

```js
function formatUser(user) {
  return user.name.trim().toUpperCase()
}

formatUser({ name: null })
```

这段代码语法正确，但运行后会因为 `null` 没有 `trim` 方法而报错。

TypeScript 在代码运行前检查值与操作是否匹配：

```ts
type User = {
  name: string
}

function formatUser(user: User): string {
  return user.name.trim().toUpperCase()
}

formatUser({ name: null })
// 开启 strictNullChecks 后，编辑器和编译器都会指出错误。
```

TypeScript 的核心价值不是让代码显得更“高级”，而是让数据结构、函数输入输出和模块边界可以被工具验证。

## 4. TypeScript 与 JavaScript 的关系

TypeScript 是 JavaScript 的带类型超集。合法的 JavaScript 语法通常也是合法的 TypeScript 语法，但 TypeScript 增加了一套静态类型系统。

关键过程如下：

```text
TypeScript 源码（.ts）
        ↓ 类型检查
发现类型错误或通过检查
        ↓ 移除类型信息并转换
JavaScript 源码（.js）
        ↓
浏览器或 Node.js 执行
```

类型只服务于开发和构建阶段，通常不会保留在最终 JavaScript 中。因此，TypeScript 不能替代运行时数据校验。

```ts
type ApiUser = {
  id: number
  name: string
}

const response = await fetch('/api/user/1')
const user = (await response.json()) as ApiUser
```

这里的 `as ApiUser` 只是告诉编译器“请相信我”，并没有检查服务器返回的数据。真实项目中，外部数据仍然需要运行时校验。

## 5. 类型推断与类型标注

### 类型推断

TypeScript 能从初始值推断类型：

```ts
let courseName = 'TypeScript 入门'
let completed = false

courseName = 100
// 不能将 number 赋值给 string。
```

这里不必重复写 `let courseName: string`。当类型一目了然时，优先使用推断。

### 类型标注

函数参数通常无法仅靠上下文推断，需要明确标注：

```ts
function calculateProgress(completed: number, total: number): number {
  if (total === 0) return 0
  return Math.round((completed / total) * 100)
}

console.log(calculateProgress(3, 5)) // 60
```

标注说明了函数契约：输入两个数字，返回一个数字。

## 6. 对象类型

可以直接描述对象结构：

```ts
type Lesson = {
  id: number
  title: string
  completed: boolean
  summary?: string
}

const firstLesson: Lesson = {
  id: 1,
  title: '从 JavaScript 到 TypeScript',
  completed: false
}
```

`summary?: string` 表示属性可以不存在；但如果存在，它必须是字符串。

数组类型可以写成：

```ts
const lessons: Lesson[] = [firstLesson]
```

## 7. 联合类型与类型收窄

联合类型（Union Type）表示一个值可能属于多个类型：

```ts
type LessonId = number | string

function normalizeLessonId(id: LessonId): string {
  if (typeof id === 'number') {
    return `lesson-${id}`
  }

  return id.trim().toLowerCase()
}
```

在判断之前，`id` 是 `number | string`，不能直接调用只属于字符串的 `trim`。经过 `typeof` 判断后，TypeScript 在不同分支中缩小了它的类型，这就是类型收窄。

对于多个状态，推荐使用可辨识联合类型（Discriminated Union）：

```ts
type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; lessons: Lesson[] }
  | { status: 'error'; message: string }

function renderMessage(state: LoadState): string {
  switch (state.status) {
    case 'idle':
      return '尚未加载'
    case 'loading':
      return '加载中…'
    case 'success':
      return `已加载 ${state.lessons.length} 节课程`
    case 'error':
      return `加载失败：${state.message}`
  }
}
```

这比同时维护 `loading`、`error`、`data` 三个互相可能冲突的变量更可靠。

## 8. `type` 与 `interface`

两者都能描述对象结构：

```ts
interface UserProfile {
  id: number
  name: string
}

type UserSettings = {
  theme: 'light' | 'dark'
  notifications: boolean
}
```

入门阶段可以遵循简单规则：

- 描述对象或类的公开契约时，`interface` 很自然。
- 表示联合类型、元组或组合类型时使用 `type`。
- 团队已有统一风格时，优先遵循团队规范。
- 不要为了“选出唯一正确答案”而过度纠结；两者在普通对象场景中高度重叠。

## 9. 严格模式

新项目应该启用 `strict`：

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext"
  }
}
```

`strict` 会启用一组更严格的检查，其中最直观的是不再把 `null` 和 `undefined` 当成任意类型都能接受的值。

```ts
function printTitle(title: string | undefined): void {
  if (title === undefined) {
    console.log('未命名课程')
    return
  }

  console.log(title.toUpperCase())
}
```

不要用大量 `any` 或类型断言消除错误。错误通常在提示：数据边界还没有被描述清楚。

## 10. 完整示例：学习进度统计

新建 `progress.ts`：

```ts
type Lesson = {
  id: number
  title: string
  completed: boolean
}

type ProgressSummary = {
  total: number
  completed: number
  percentage: number
}

function summarizeProgress(lessons: Lesson[]): ProgressSummary {
  const completed = lessons.filter((lesson) => lesson.completed).length
  const percentage = lessons.length === 0
    ? 0
    : Math.round((completed / lessons.length) * 100)

  return {
    total: lessons.length,
    completed,
    percentage
  }
}

const lessons: Lesson[] = [
  { id: 1, title: '类型推断', completed: true },
  { id: 2, title: '联合类型', completed: true },
  { id: 3, title: '类型收窄', completed: false }
]

console.log(summarizeProgress(lessons))
```

预期输出：

```text
{ total: 3, completed: 2, percentage: 67 }
```

执行过程：

1. `Lesson[]` 保证数组中的每项都具有一致结构。
2. `filter` 找出完成的课程。
3. 空数组单独返回 `0`，避免出现无意义的除法结果。
4. 返回值必须满足 `ProgressSummary`，缺少字段或字段类型错误都会被检查。

## 11. 常见错误

### 把 `any` 当作逃生按钮

```ts
function handleData(data: any) {
  return data.user.profile.name
}
```

`any` 会关闭后续检查。类型未知时优先使用 `unknown`，并通过判断逐步收窄。

### 误以为类型断言会转换数据

```ts
const value = '42' as unknown as number
console.log(value + 1) // 运行结果仍然是 "421"
```

断言不会执行 `Number(value)`，也不会改变运行时的字符串。

### 给所有变量重复标注显而易见的类型

```ts
const name: string = 'Ada'
const count: number = 1
```

这些标注不是错误，但会增加噪声。让推断处理局部简单值，把明确类型用在函数边界、对象结构和公共 API 上。

## 12. 最佳实践

- 新项目开启 `strict`，不要等项目变大后再集中修复。
- 优先让类型表达业务状态，避免多个布尔值组合出非法状态。
- 在接口响应、浏览器存储和用户输入等外部边界做运行时校验。
- 函数保持单一职责，让输入输出类型容易理解。
- 使用 `unknown` 表示真正未知的数据，缩小后再操作。
- 类型名称表达业务含义，而不仅是数据形状。

## 13. 练习题

### 基础题

1. TypeScript 的类型信息会不会保留到普通 JavaScript 运行时？为什么？
2. `string | undefined` 表示什么？在调用字符串方法前需要做什么？
3. 类型推断和类型标注分别适合哪些场景？

### 进阶题

1. 为什么 `response.json() as User` 不能保证接口数据一定符合 `User`？
2. 把 `loading: boolean`、`error: string | null`、`data: Lesson[] | null` 改成可辨识联合类型，并说明它避免了哪些非法状态。

### 代码练习

为下面的 JavaScript 代码补充严格的 TypeScript 类型：

```js
function findLesson(lessons, id) {
  return lessons.find((lesson) => lesson.id === id)
}
```

要求：

- `id` 同时支持数字和字符串。
- 返回值正确表达“可能找不到”。
- 调用方在读取 `title` 前必须处理未找到的情况。
- 不允许使用 `any` 和双重类型断言。

## 14. 面试题

### TypeScript 能完全消除运行时错误吗？

不能。TypeScript 主要在编译阶段检查类型一致性，无法自动验证接口返回值、用户输入或第三方脚本等运行时数据，也无法消除业务逻辑、网络和资源错误。

### `any` 和 `unknown` 有什么区别？

`any` 基本关闭类型检查，可以直接执行任意操作；`unknown` 表示值的类型未知，使用前必须通过判断或校验完成收窄，因此更安全。

### 什么是类型收窄？

类型收窄是通过 `typeof`、`instanceof`、属性判断或可辨识字段等运行时条件，让 TypeScript 在某个代码分支中确定更具体类型的过程。

## 15. 本节总结

- TypeScript 在 JavaScript 之上增加静态类型检查。
- 类型帮助我们描述并检查数据结构、输入输出和业务状态。
- 类型信息通常在生成 JavaScript 时被移除，不等于运行时校验。
- 局部简单值依靠推断，模块边界和公共契约使用明确类型。
- 联合类型配合类型收窄，可以准确表达真实业务状态。
- 新项目应尽早启用严格模式，并谨慎使用 `any` 和类型断言。

下一节建议：TypeScript 对象类型、函数类型与可选属性。

## 16. 参考资料

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [The Basics](https://www.typescriptlang.org/docs/handbook/2/basic-types.html)
- [Everyday Types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html)
- [Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
- [TSConfig：strict](https://www.typescriptlang.org/tsconfig/strict.html)
