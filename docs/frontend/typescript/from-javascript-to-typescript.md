---
title: 从 JavaScript 到 TypeScript
description: 从一个真实的接口数据错误出发，循序渐进理解类型推断、函数契约、对象类型、unknown、严格模式和运行时校验
outline: deep
---

# 从 JavaScript 到 TypeScript

你已经有 Vue 2 开发经验，应该很熟悉这样的代码：请求课程列表，把结果放进 `data`，然后在模板里展示。真正麻烦的通常不是请求怎么写，而是接口少了字段、字段类型变化，错误要到某个用户打开某个页面时才出现。

TypeScript 的作用，就是尽量让这类“数据和代码的假设不一致”在运行前暴露出来。

> 本课只使用长期稳定的 TypeScript 基础语法。第一次阅读建议先完成“基础部分”和“完整示例”；进阶与原理部分可以在写过一些 TypeScript 后再回来阅读。

## 本课在学习路线中的位置

```text
已有 JavaScript / Vue 2 经验
          ↓
本课：理解 TypeScript 在解决什么问题
          ↓
下一课：更系统地描述对象和函数
          ↓
后续：联合类型、泛型和类型运算
```

学完本课，你不需要会写复杂类型，但应该能够：

- 看懂常见的 TypeScript 函数和对象类型；
- 判断哪些类型可以由工具推断，哪些边界需要明确声明；
- 区分编译时类型检查和运行时数据校验；
- 用 `unknown` 接住不可信数据，并通过判断逐步缩小类型；
- 理解为什么新项目应该尽早开启严格模式。

## 从一个真实问题开始

假设接口以前返回：

```js
const lesson = {
  id: 1,
  title: 'TypeScript 入门',
  progress: 80
}
```

页面直接格式化进度：

```js
function formatProgress(lesson) {
  return `${lesson.progress.toFixed(0)}%`
}
```

后来某些草稿课程没有 `progress`。JavaScript 仍能启动，但用户打开草稿时才会得到：

```text
TypeError: Cannot read properties of undefined
```

问题的根源不是 `toFixed`，而是代码一直隐含地假设：

```text
每一门课程都有 progress，而且 progress 一定是 number。
```

JavaScript 没有地方集中表达这个假设。TypeScript 让我们把它写进函数契约。

---

## 第一部分：基础——先让常见代码安全起来

### TypeScript 仍然是 JavaScript

TypeScript 不是在浏览器里运行的新语言。它是在 JavaScript 语法之上增加类型描述，并在代码运行前进行检查。

```ts
const courseName: string = 'TypeScript 入门'
```

生成 JavaScript 后，`: string` 会被移除：

```js
const courseName = 'TypeScript 入门'
```

可以先建立一个简单模型：

```text
.ts 源码
  ↓ TypeScript 检查类型是否一致
  ↓ 移除类型语法
.js 代码
  ↓ 浏览器或 Node.js 执行
运行结果
```

因此，类型检查发生在运行前；网络失败、权限错误和真实接口数据仍然发生在运行时。

### 先相信类型推断

TypeScript 经常能从右侧的值推断类型：

```ts
let title = 'TypeScript 入门'
let completed = false
let lessonCount = 3
```

把鼠标放到变量上，会看到它们分别被推断为 `string`、`boolean` 和 `number`。不需要机械重复：

```ts
// 可以工作，但这些标注没有提供额外信息。
let title: string = 'TypeScript 入门'
let completed: boolean = false
```

推断不是“没有类型”。相反，下面的赋值仍会被阻止：

```ts
let title = 'TypeScript 入门'
title = 100
// 错误：不能把 number 赋给 string。
```

可以先记住：

- 局部、明显的值优先交给推断；
- 函数参数、接口数据和公共模块边界更值得明确声明。

### 函数签名就是输入输出契约

JavaScript 函数不会说明参数应该是什么：

```js
function calculatePercentage(completed, total) {
  return Math.round((completed / total) * 100)
}
```

TypeScript 可以把约定写进函数签名：

```ts
function calculatePercentage(completed: number, total: number): number {
  // 空列表没有完成比例，单独返回 0，避免产生 NaN。
  if (total === 0) return 0
  return Math.round((completed / total) * 100)
}
```

这里表达了三件事：

1. `completed` 必须是数字；
2. `total` 必须是数字；
3. 函数承诺返回数字。

调用错误会在运行前出现：

```ts
calculatePercentage('3', 5)
// 错误：string 不能传给 number 参数。
```

返回类型有时也能推断。公共函数显式写出返回类型的价值，是防止以后重构时无意改变对外契约。

### 对象类型描述我们真正需要的字段

课程对象可以这样描述：

```ts
type Lesson = {
  id: number
  title: string
  completed: boolean
}

const lesson: Lesson = {
  id: 1,
  title: '从 JavaScript 到 TypeScript',
  completed: false
}
```

如果漏掉 `title`，或者把 `completed` 写成字符串，检查器会指出对象不满足 `Lesson`。

数组只是在元素类型后加 `[]`：

```ts
const lessons: Lesson[] = [lesson]
```

这一课先把对象类型理解成“使用这份数据至少需要满足的结构”。对象类型的组合、只读属性和函数类型会在下一课展开。

### 可选字段表示“可能不存在”

草稿课程可能没有进度：

```ts
type Lesson = {
  id: number
  title: string
  progress?: number
}
```

`progress?: number` 的意思不是“随便传什么都可以”，而是：

```text
要么没有 progress
要么 progress 存在，并且它是 number
```

所以使用前必须处理缺失情况：

```ts
function formatProgress(lesson: Lesson): string {
  if (lesson.progress === undefined) {
    return '尚未开始'
  }

  // 通过判断后，这个分支中的 progress 已确定为 number。
  return `${lesson.progress.toFixed(0)}%`
}
```

这就是最基础的类型收窄：代码先做真实的运行时判断，TypeScript 再根据判断更新它对变量的认识。

### 联合类型表达“几种可能之一”

接口可能使用数字 ID，路由参数却是字符串：

```ts
type LessonId = number | string
```

竖线 `|` 表示这个值可能是 `number`，也可能是 `string`。在确定具体类型前，只能使用两者共有的能力。

```ts
function normalizeLessonId(id: LessonId): string {
  if (typeof id === 'number') {
    return String(id)
  }

  // number 分支已经返回，因此这里的 id 只可能是 string。
  return id.trim()
}
```

联合类型和收窄会在第三课系统学习；这里先理解“先表达可能性，再通过判断排除可能性”。

### `any` 与 `unknown` 的差别

接口返回的数据在运行前并不可信。最省事的写法是 `any`：

```ts
function readTitle(value: any) {
  return value.lesson.title.toUpperCase()
}
```

但 `any` 基本关闭了后续类型检查，原来的 JavaScript 风险又回来了。

`unknown` 同样表示“现在不知道它是什么”，区别是使用前必须判断：

```ts
function printValue(value: unknown): void {
  if (typeof value === 'string') {
    console.log(value.toUpperCase())
    return
  }

  console.log('这不是字符串')
}
```

可以把两者理解为：

```text
any：我不知道，但先别检查我
unknown：我不知道，所以使用前必须确认
```

---

## 第二部分：进阶——从局部类型走向真实项目边界

### 类型声明不会验证接口响应

下面的代码看起来得到了 `Lesson`：

```ts
type Lesson = {
  id: number
  title: string
}

const response = await fetch('/api/lessons/1')
const lesson = await response.json() as Lesson
```

但 `as Lesson` 只是在告诉检查器“请相信我”。它不会检查响应，也不会给缺失字段补默认值。

如果服务器返回：

```json
{ "id": 1, "title": null }
```

运行时的 `title` 仍然是 `null`。因此外部数据的正确流程是：

```text
接口、localStorage、URL、postMessage
              ↓
            unknown
              ↓ 运行时解析和校验
        可信的领域类型
              ↓
       组件和业务函数使用
```

### 严格模式让隐含假设显形

新项目应尽早启用 `strict`：

```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

严格模式不是代码格式检查。它会让参数、`null`、`undefined`、函数赋值等隐含假设得到更完整的检查。

例如下面的函数明确承认标题可能缺失：

```ts
function normalizeTitle(title: string | null): string {
  if (title === null) return '未命名课程'
  return title.trim()
}
```

关闭相关检查时，签名可能写着 `string`，实际却悄悄接收到 `null`。开启严格模式后，调用方和函数实现必须共同面对这个事实。

### 用一种状态代替多个冲突布尔值

常见页面会同时保存：

```ts
let loading = false
let error: string | null = null
let lessons: Lesson[] = []
```

它们可能组合出矛盾状态，例如既 `loading` 又有 `error`。进阶做法是让状态只能是几种合法情况之一：

```ts
type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; lessons: Lesson[] }
  | { status: 'error'; message: string }
```

现在 `success` 才能读取 `lessons`，`error` 才能读取 `message`。这叫可辨识联合；本课只建立直觉，第三课再解释完整写法。

### 已有 JavaScript 项目怎样迁移

不要从“给所有变量补类型”开始。更稳妥的顺序是：

1. 建立独立、可重复执行的类型检查命令；
2. 先描述接口响应、组件 Props、路由参数和共享状态；
3. 外部数据先使用 `unknown`，不要一开始大面积使用 `any`；
4. 局部变量尽量依靠推断；
5. 按目录逐步收紧规则，并记录临时例外的清理计划。

迁移的目标不是让代码里出现更多类型文字，而是让错误数据更难穿过关键边界。

---

## 第三部分：原理——TypeScript 为什么能发现这些问题

### 静态类型世界与运行时世界

TypeScript 同时要求你理解两个世界：

```text
静态世界：类型、联合、可赋值性、控制流分析
                    ↓ 类型擦除
运行时世界：真实对象、网络响应、异常、DOM 和 JavaScript 值
```

`number | string` 不是运行时创建的特殊容器。运行时仍然只有一个具体值；联合类型只是检查器对“这个位置有哪些可能性”的描述。

这解释了为什么类型不能替代：

- 接口响应校验；
- 用户输入解析；
- 权限检查；
- 网络错误处理；
- 单元测试和端到端测试。

### TypeScript 主要比较结构

TypeScript 通常关心一个值是否具有目标要求的结构，而不是它是否由某个类型“创建”：

```ts
type Named = { name: string }

const account = { id: 1, name: 'Ada', role: 'admin' }
const named: Named = account
```

`account` 至少包含 `Named` 需要的 `name: string`，所以可以赋值。这个特性让现有 JavaScript 对象容易迁移到 TypeScript。

代价是：两个业务含义不同但结构相同的值，默认可能互相兼容。后面的类型设计课程会讨论如何收紧这种边界。

### 控制流分析沿代码路径排除可能性

```ts
function printLength(value: string | null): void {
  if (value === null) return
  console.log(value.length)
}
```

检查器看到 `null` 分支已经 `return`，所以最后一行只剩 `string` 的可能性。这就是控制流分析。

好的 TypeScript 代码通常通过真实判断证明类型，而不是连续使用 `as` 强迫检查器闭嘴。

---

## 完整示例：从接口数据到学习进度

下面的完整示例把本课概念连起来：

1. 接口响应先保存为 `unknown`；
2. 类型守卫在运行时逐字段验证；
3. 验证后得到可信的 `Lesson[]`；
4. 业务函数依靠明确输入输出契约计算进度；
5. 局部变量继续使用类型推断。

<<< ../../../examples/typescript/from-javascript-to-typescript.ts

第一次阅读时，不必立刻掌握 `value is Lesson` 的全部原理。先把它理解为：这个函数用真实判断向 TypeScript 证明了数据结构。类型守卫会在联合类型课程中进一步解释。

## 常见错误：看到现象后怎样定位

### 错误一：用 `any` 快速消除所有红线

```text
现象：编辑器不再报错
真实结果：后续属性访问也不再受保护
修复：边界使用 unknown，通过判断或解析函数收窄
```

### 错误二：以为类型断言会转换数据

```ts
const value = '42' as unknown as number
console.log(value + 1) // 运行结果仍是字符串 "421"
```

类型断言不会执行 `Number(value)`。需要数字时必须做真实转换和合法性检查。

### 错误三：每个变量都写类型标注

```text
现象：代码里的类型文字很多
问题：信息重复，真正重要的函数和数据边界反而不突出
修复：局部值使用推断，公共契约和不可信边界明确声明
```

### 错误四：认为通过类型检查就不会出错

TypeScript 只能检查它知道的类型假设。接口撒谎、断言错误、业务公式错误、竞态和权限问题都可能继续存在，因此仍需运行时校验和测试。

## 本节知识链

### 第一次学习必须掌握

- TypeScript 最终仍生成 JavaScript；
- 类型推断不等于没有类型；
- 函数参数和返回值构成契约；
- 可选字段使用前需要判断；
- `unknown` 比 `any` 更适合真正未知的数据；
- `as` 不会转换或验证运行时值。

### 第二次阅读再理解

- 严格模式为什么让隐含假设显形；
- 外部数据为什么要先验证再进入业务层；
- 联合状态怎样排除非法组合；
- JavaScript 项目为什么应先迁移边界。

### 进阶阶段需要建立的原理

- 类型在生成 JavaScript 时会被擦除；
- TypeScript 主要采用结构化类型系统；
- 控制流分析会沿分支排除不可能类型。

## 下一课

下一节是[对象类型与函数类型](/frontend/typescript/object-and-function-types)。你会在本课 `Lesson` 和进度函数的基础上，继续学习：

- 对象的可选、只读和索引属性；
- 函数参数、回调和重载；
- 怎样设计既清楚又不啰嗦的公共契约。

## 参考资料

- [TypeScript Handbook：Introduction](https://www.typescriptlang.org/docs/handbook/intro.html)
- [TypeScript Handbook：The Basics](https://www.typescriptlang.org/docs/handbook/2/basic-types.html)
- [TypeScript Handbook：Everyday Types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html)
- [TypeScript Handbook：Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
- [TSConfig：strict](https://www.typescriptlang.org/tsconfig/strict.html)
