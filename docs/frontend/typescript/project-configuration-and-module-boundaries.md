---
title: TypeScript 工程配置与模块边界
description: 从检查、转译和执行过程理解 tsconfig、模块解析、环境隔离与公共 API
outline: deep
---

# TypeScript 工程配置与模块边界

[上一课](/frontend/typescript/template-literal-types-and-type-safe-contracts)完成了 TypeScript 类型语法的主要路线。但类型写得准确，只代表源码能通过静态检查。进入真实工程后，还会遇到另一类问题：

- 编辑器没有报错，Node.js 却找不到模块；
- 浏览器源码中莫名可以使用 `process`、`Buffer` 等 Node 全局；
- Vite 能处理的导入，发布成库后消费者无法加载；
- 只想导入接口，却意外执行了目标模块的副作用；
- 测试中的 `describe`、`expect` 污染了生产代码的类型环境。

这些问题不能靠更复杂的业务类型解决。必须理解 TypeScript 工程由哪些工具共同完成。

## 先分清检查、转译和执行

以 Vite 浏览器应用为例，一份 `.ts` 源码可能经历：

```text
                        ┌─ tsc / vue-tsc：建立完整类型程序并报告错误
TypeScript 源码 ────────┤
                        └─ Vite：转译、处理资源并打包
                                      │
                                      ▼
                                  浏览器执行
```

这里有三个不同职责：

1. **类型检查**：属性是否存在、参数是否匹配、模块类型声明在哪里；
2. **转译或打包**：怎样把 TypeScript、Vue SFC、CSS 和资源变成可运行产物；
3. **模块解析与执行**：浏览器或 Node.js 最终怎样理解每个导入字符串。

Vite 的快速转译不等于完整类型检查，TypeScript 能找到一个模块的类型也不等于运行环境一定能加载它。

因此选择配置的第一问不是“网上流行什么选项”，而是：

> 这组文件最终由谁转译，又由谁解析和执行？

## `tsconfig.json` 同时定义规则和文件边界

```json
{
  "compilerOptions": {
    "strict": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts", "src/**/*.vue"]
}
```

- `compilerOptions` 决定怎样理解、检查或输出代码；
- `include`、`files` 等决定哪些根文件属于这个 TypeScript 程序。

“程序”不是单个文件。TypeScript 会沿着 `import` 继续读取依赖，综合声明文件、全局类型和配置后再检查。配置错误可能让本应检查的源码被遗漏，也可能让不属于当前环境的全局类型混入进来。

## 运行平台由 `target`、`lib` 与 `types` 共同描述

这三个选项经常一起出现，但回答的问题不同。

### `target` 决定输出使用的 JavaScript 语言级别

```json
{
  "compilerOptions": {
    "target": "ES2022"
  }
}
```

如果由 `tsc` 输出 JavaScript，`target` 会影响某些新语法是否需要降级，也会影响默认标准库选择。它不是完整的浏览器兼容策略。

现代前端工程还可能由 Vite、Babel 等工具再次处理产物，所以最终兼容范围必须结合打包目标和 polyfill 策略判断。`target: ES2022` 不能证明所有目标浏览器都支持项目使用的每个 Web API。

### `lib` 决定类型系统认识哪些平台 API

```json
{
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  }
}
```

- `ES2022` 描述 ECMAScript 内建对象和方法；
- `DOM` 描述 `window`、`document`、`fetch` 等浏览器 API；
- `DOM.Iterable` 为部分 DOM 集合补充迭代能力。

Node.js 类型不属于 `lib`，通常来自 `@types/node`。不要为了消除纯 Node 脚本的错误而随手加入 `DOM`，否则类型系统会误以为运行时存在 `document`。反过来，浏览器应用也不应无条件获得全部 Node 全局。

### `types` 限制自动进入全局作用域的类型包

```json
{
  "compilerOptions": {
    "types": ["vite/client"]
  }
}
```

测试配置可以单独加入测试环境：

```json
{
  "compilerOptions": {
    "types": ["vite/client", "vitest/globals"]
  }
}
```

这样生产源码不会因为测试配置而凭空认识 `describe`、`expect`。类型环境越接近真实运行环境，检查越有意义。

## 严格检查是基线，不是一次性开关

```json
{
  "compilerOptions": {
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true
  }
}
```

`strict` 开启一组核心严格检查；其余选项进一步约束可选属性、索引读取和类成员重写。前面课程对 `null`、可选属性和字典读取的解释，都依赖这些规则提供更准确的反馈。

迁移旧 Vue 2 或 JavaScript 项目时可以分阶段启用，但每个错误都应被当作潜在语义问题理解。用 `as any` 批量压制只会让配置看似完成，实际边界仍不可靠。

## `noEmit` 表示 TypeScript 只负责检查

Vite 应用通常不由 `tsc` 生成最终 JavaScript：

```json
{
  "compilerOptions": {
    "noEmit": true
  }
}
```

常见职责分工是：

```text
Vite / Vue 插件：转译、资源处理、开发服务器、生产打包
tsc / vue-tsc：完整类型检查
```

两条流程都需要存在。只运行 Vite 可能漏掉完整类型错误；只运行 `tsc --noEmit` 又没有验证真实打包器能否处理 Vue SFC、资源和插件转换。

本课程工作树的示例只执行类型检查，因为本专题不执行构建或发布。

## 模块配置必须模拟真实加载者

看到这段代码：

```ts
import { createLesson } from './lesson-service.js'
import { ref } from 'vue'
```

TypeScript 需要回答：

- `./lesson-service.js` 在源码阶段对应哪个文件？
- `vue` 应读取包里的哪个导出条件？
- 当前文件是 ESM 还是 CommonJS？
- 导入语法会原样保留还是被改写？

主要相关选项是 `module` 与 `moduleResolution`：

- `module` 描述模块语义以及 TypeScript 输出模块代码的方式；
- `moduleResolution` 描述如何根据模块说明符查找文件与包。

它们应共同模拟真正的模块宿主，而不是分别选择“报错最少”的值。

## Vite 浏览器应用由打包器解析

典型方向如下：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true
  }
}
```

`Bundler` 模式允许 TypeScript 按现代打包器的规则理解包 `exports`、条件导出和相对导入。下面的无扩展名导入通常可由打包器处理：

```ts
import { createLesson } from './lesson-service'
```

这只是方向性配置，不是万能模板。Vue、React 插件和当前 Vite 脚手架可能补充 JSX、类型、条件导出等选项，应优先以所用版本的官方模板为基线。

## Node.js 运行编译产物时由 Node 解析

如果 `tsc` 输出 JavaScript，再由 Node.js 直接执行，应采用 Node 模式：

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "verbatimModuleSyntax": true,
    "strict": true
  }
}
```

`module: NodeNext` 会带出匹配的 Node 模块解析行为。文件被视为 ESM 还是 CommonJS，还与扩展名以及最近的 `package.json` 中 `"type"` 有关。

### 为什么 TypeScript 源码导入 `.js`

Node ESM 要求相对或绝对模块说明符包含扩展名。假设源码为 `lesson-service.ts`，编译后就是 `lesson-service.js`，所以源码应写未来运行时有效的说明符：

```ts
import { createLesson } from './lesson-service.js'
```

Node 模式会在类型检查阶段进行扩展名替换，把 `.js` 说明符关联到 `lesson-service.ts`；生成 JavaScript 后，说明符仍指向真实的 `.js` 文件。

省略扩展名可能被打包器接受，却会让 Node ESM 的输出加载失败。课程示例选择 `.js`，是为了让编译产物可由 Node 直接加载。

### `.mts`、`.cts` 与包级 `type`

- `.mts` 明确表示 ESM TypeScript，通常输出 `.mjs`；
- `.cts` 明确表示 CommonJS TypeScript，通常输出 `.cjs`；
- `.ts` 在 Node 模式下还会参考最近 `package.json` 的 `"type"`。

单一格式应用通常保持包级约定即可。只有确实要在同一包中混用两种格式时，显式文件扩展名才更有价值。

## 一个配置无法准确描述所有环境

一个 Vite 项目常同时包含：

```text
src/**          浏览器、DOM、Vite 打包
vite.config.ts  Node.js、Vite 配置 API
tests/**        测试运行器、可能包含 DOM 模拟
scripts/**      Node.js 命令行脚本
```

这些文件拥有不同的全局变量、模块解析者和运行平台。一个配置若同时加入 DOM、Node 和测试全局，会让任何文件都“看见一切”，类型系统便无法发现跨环境误用。

更准确的结构是共享严格基线，再为环境拆分配置：

```text
tsconfig.base.json
tsconfig.app.json
tsconfig.node.json
tsconfig.test.json
tsconfig.json       根解决方案入口
```

浏览器配置加入 DOM、Vite 与打包器模块规则；Node 配置加入 Node 类型与 Node 模块规则。共同的 `strict` 等规则通过 `extends` 继承。

## `include` 与 `exclude` 不是安全边界

```json
{
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "coverage", "scripts"]
}
```

`include` 选择根文件；这些文件导入的模块仍会沿依赖图进入程序。`exclude` 主要影响扫描，不能阻止已包含文件显式导入被排除目录中的模块。

```ts
// src/main.ts
import '../scripts/read-database.js'
```

真正的环境隔离要依靠目录职责、单向依赖、分离的 TypeScript 项目，以及必要的 lint 或架构检查。文件扫描规则不能代替依赖规则。

`files` 能精确列出少量根文件，适合根解决方案或入口很小的项目；大型应用通常用 `include` 更易维护。

## `import type` 把类型依赖移出运行时图

接口和类型别名在 JavaScript 中不存在：

```ts
import type {
  CreateLessonInput,
  Lesson
} from './lesson-model.js'
```

这表明当前模块只需要目标模块的类型，生成 JavaScript 时导入会被移除。

同一模块同时提供值和类型时：

```ts
import {
  LESSON_STATUS,
  type Lesson,
  type LessonStatus
} from './lesson-model.js'
```

`LESSON_STATUS` 是运行时对象，必须保留；另外两个名字只用于检查。公共入口同样应区分：

```ts
export { LESSON_STATUS }
export type { Lesson, LessonStatus }
```

这不只是格式偏好。它减少意外副作用和运行时循环依赖，并让模块真实成本更容易审查。

两个文件互相 `import type` 通常不会形成运行时循环，但也不能修复错误的职责划分。一旦未来某边需要真实值，隐藏的双向依赖仍会暴露。应优先让依赖方向反映业务层次。

## `verbatimModuleSyntax` 让导入意图保持直接

```json
{
  "compilerOptions": {
    "verbatimModuleSyntax": true
  }
}
```

它的核心行为是：

- 使用 `type` 修饰的导入和导出会被擦除；
- 未标记为 `type` 的模块语法按写法保留；
- TypeScript 不再悄悄把不匹配的 ESM 写法改写成另一种模块格式。

这会更早暴露包格式、扩展名和输出配置的不一致。副作用导入应明确保留：

```ts
import './register-polyfills.js'
```

只导出类型的模块不应暗中执行注册逻辑，否则读者无法从依赖声明判断运行时行为。

## `isolatedModules` 检查单文件转译兼容性

Vite、Babel 等工具常逐文件转译，无法使用整个类型程序的信息决定代码转换：

```json
{
  "compilerOptions": {
    "isolatedModules": true
  }
}
```

这个选项会报告某些无法由单文件转译器安全处理的写法。它不会让模块彼此隔离，也不会代替完整类型检查。

## `paths` 只告诉 TypeScript 去哪里找

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

TypeScript 因此可以理解：

```ts
import { createLesson } from '@/features/lesson'
```

但 `paths` 通常不会改写生成 JavaScript 中的说明符。Vite、测试运行器和 Node.js 也必须通过各自的别名、包 `imports` 或工作区包机制理解它。

这解释了常见现象：编辑器能跳转、`tsc` 能通过，运行时仍报“找不到模块”。类型解析和真实加载只配置了前者。

在 Monorepo 中，也不要只用 `paths` 把一个包名指向另一个项目源码。这可能绕过真实包的 `exports`、声明文件和发布布局，使本地检查比消费者环境宽松。

## 项目引用用于真实的项目边界

根配置可以引用多个子项目：

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

项目引用让 TypeScript 理解子项目依赖、构建顺序和声明边界。被引用项目需要 `composite`，引用方主要通过声明输出来理解其公共 API。

它适合多个运行环境需要硬边界、Monorepo 包存在明确依赖图，或大型工程需要增量检查和构建的情况。小型 Vite 应用不必为了“最佳实践”提前增加引用图。

## 应用与发布库不能机械共用配置

应用知道自己的运行环境，通常由打包器产生最终文件，并使用 `noEmit` 做类型检查。

库会被未知消费者加载，需要额外验证：

- 最低 JavaScript 目标；
- ESM、CommonJS 与包 `exports`；
- 生成的 `.d.ts` 是否能独立解析；
- 外部依赖在消费者环境中的说明符；
- 声明文件是否泄露内部别名。

发布库通常还需要：

```json
{
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "rootDir": "src",
    "outDir": "dist"
  }
}
```

`moduleResolution: Bundler` 对应用可能准确，却可能允许发布库留下只被打包器接受、Node ESM 无法加载的说明符。库必须验证真实产物，而不是只看源码检查通过。

## 完整示例：从领域文件到公共入口

示例依赖方向如下：

```text
index.ts（应用入口）
    │
    ▼
public-api.ts（决定模块对外暴露面）
    ├───────────────┐
    ▼               ▼
lesson-service.ts   lesson-model.ts
    │
    └──────────────→ lesson-model.ts
```

### 领域模型

只声明领域值与类型，不依赖服务：

<<< ../../../examples/typescript/module-boundaries/lesson-model.ts

### 服务模块

值导入状态常量，类型导入输入与实体：

<<< ../../../examples/typescript/module-boundaries/lesson-service.ts

### 公共 API

公共入口控制调用方能依赖哪些值和类型：

<<< ../../../examples/typescript/module-boundaries/public-api.ts

### 应用入口

入口只经过公共 API 使用模块，不穿透内部文件：

<<< ../../../examples/typescript/module-boundaries/index.ts

四个文件都使用 `.js` 相对说明符，因为仓库示例配置使用 `NodeNext`，并假设编译后的 JavaScript 由 Node ESM 加载。检查时 TypeScript 会关联到同名 `.ts` 源文件。

验证类型：

```bash
npm run check:examples
```

本专题不在课程编写阶段执行构建；在自己的 Node 项目中运行时，应先输出 JavaScript，再执行输出目录中的 `index.js`。

## 排错时先取得证据

查看继承和默认值合并后的最终配置：

```bash
tsc -p tsconfig.app.json --showConfig
```

解释文件为何进入项目：

```bash
tsc -p tsconfig.app.json --explainFiles
```

跟踪模块说明符怎样被解析：

```bash
tsc -p tsconfig.app.json --traceResolution
```

推荐排查顺序：

1. 确认出错文件属于哪个运行环境；
2. 用 `--showConfig` 确认工具实际读取的配置；
3. 用 `--explainFiles` 查明文件和全局类型为何进入；
4. 模块找不到时使用 `--traceResolution`；
5. 最后确认真实运行者或打包器是否采用相同规则。

## 常见误区背后的原因

### “复制一份严格配置就结束了”

严格选项只是一部分。浏览器、Node、测试和库消费者的模块及全局环境不同，不存在准确描述所有环境的万能配置。

### “编辑器能跳转，所以运行时一定能加载”

编辑器遵循 TypeScript 解析配置，Node 或打包器遵循自己的算法。`paths` 等设置可能只让前者成功。

### “把 DOM 和 Node 类型都加上最省事”

这会扩大每个文件被允许使用的 API，掩盖跨环境错误。类型越多不代表越安全，准确匹配环境才安全。

### “`exclude` 已经隔离服务端目录”

显式导入仍会把文件带入程序。文件扫描规则不能代替依赖规则。

### “`import type` 只是代码风格”

它决定依赖是否进入生成的运行时模块图，影响副作用、循环依赖和打包结果。

### “`skipLibCheck` 能修复依赖冲突”

它跳过声明文件内部的完整检查，能改善部分性能或临时兼容问题，但没有解决错误声明和版本冲突。它是权衡，不是根治方案。

## 建立配置的实际顺序

为一个子项目选择配置时，可以依次回答：

1. 代码最终运行在浏览器、Node、Worker，还是发布给别人？
2. JavaScript 由 `tsc` 输出，还是由 Vite 等工具转译或打包？
3. 谁负责解析最终保留下来的模块说明符？
4. 当前环境真实拥有哪套 `lib` 与全局 `types`？
5. 哪些文件是根文件，它们允许依赖哪些目录或包？
6. 类型导入、值导入和副作用导入是否清楚？
7. 路径别名是否同时被 TypeScript 和真实运行工具支持？
8. 是否真的需要项目引用、声明输出或发布级兼容验证？

先确定真实环境，再让 TypeScript 模拟它，比逐项猜测哪种配置能消除错误更可靠。

## TypeScript 专题小结

至此，TypeScript 路线形成完整闭环：

```text
JavaScript 迁移与类型边界
  → 对象与函数建模
  → 联合、收窄与状态设计
  → 泛型复用关系
  → keyof / typeof / 索引访问派生类型
  → 条件类型选择和 infer 提取
  → 映射类型批量变换对象
  → 模板字面量建立字符串契约
  → tsconfig 与模块边界把类型放进真实工程
```

本课最重要的结论是：

1. 类型检查、代码转译和模块执行是不同流程；
2. 配置必须匹配真实宿主，一个配置只能准确描述一种环境；
3. 类型依赖、运行时依赖和公共 API 应被显式区分。

## 下一课

下一节进入[Vue 3 Composition API 与组件类型设计](/frontend/vue3/composition-api-and-component-typing)。你已有约三年 Vue 2 经验，因此不会从模板语法重新开始，而会集中解释：

- Composition API 解决的不是“换一套写法”，而是逻辑组织与复用边界；
- `ref`、`reactive`、`computed` 和 `watch` 的依赖关系及所有权；
- `<script setup>` 下 Props、Emits、Slots 与 `v-model` 的类型契约；
- 从 Options API 迁移时哪些心智模型可以保留，哪些必须改变。

## 参考资料

- [TypeScript Modules：Choosing Compiler Options](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options.html)
- [TypeScript Modules：Reference](https://www.typescriptlang.org/docs/handbook/modules/reference.html)
- [TypeScript TSConfig Reference](https://www.typescriptlang.org/tsconfig/)
- [TypeScript TSConfig：verbatimModuleSyntax](https://www.typescriptlang.org/tsconfig/verbatimModuleSyntax.html)
- [TypeScript TSConfig：isolatedModules](https://www.typescriptlang.org/tsconfig/isolatedModules.html)
- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [Node.js：ECMAScript modules](https://nodejs.org/api/esm.html)
