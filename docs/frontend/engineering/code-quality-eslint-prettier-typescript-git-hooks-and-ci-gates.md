---
title: 代码质量：ESLint、Prettier、TypeScript、Git Hooks 与 CI 门禁
description: 建立从编辑器反馈到持续集成的前端质量体系，理解格式化、静态分析、类型检查、本地钩子与 CI 的职责边界
---

# 代码质量：ESLint、Prettier、TypeScript、Git Hooks 与 CI 门禁

在 Vue 2 项目里，你可能已经使用过 ESLint、Prettier 和 Git Hooks，却仍然遇到这些问题：

- 保存文件时没有报错，提交后 CI 却失败；
- ESLint、Prettier 互相改同一段代码；
- `vite build` 能通过，类型检查却有错误；
- 本地钩子很慢，于是团队成员开始使用 `--no-verify`；
- CI 安装依赖、Node.js 版本或检查命令与本地不同；
- 配置越来越多，却没人能说明每一道检查究竟防住了什么。

根因通常不是“工具不够多”，而是没有把它们设计成一套分层反馈系统。本节会从错误发现时机、工具工作原理、Vue SFC 解析链、类型感知 lint、Git 暂存区语义，一直讲到 CI 的可信执行边界。

> 本节示例是一组可移植的配置片段。为了不改变学习站根目录的依赖，它把应合并进真实 `package.json` 的 `scripts` 单独保存在 `package-scripts.json` 中。

## 一、先建立质量门禁的心智模型

质量体系的目标不是证明代码“绝对正确”。静态工具无法知道产品需求是否正确，单元测试也无法枚举所有真实环境。它的目标是：让不同种类的问题尽可能早、稳定且低成本地暴露。

同一个问题被发现得越晚，修复成本通常越高：

```text
编辑器保存
  ↓ 几百毫秒
本地增量检查
  ↓ 几秒
提交前钩子
  ↓ 十几秒
拉取请求 CI
  ↓ 数分钟
代码评审 / 测试环境
  ↓ 数小时或数天
生产事故
```

这不是说所有检查都应该塞进保存动作。正确做法是按反馈速度和可信程度分层：

| 层级 | 典型检查 | 主要价值 | 是否权威 |
| --- | --- | --- | --- |
| 编辑器 | 格式化、单文件诊断、TypeScript Language Service | 最快反馈 | 否，个人环境可不同 |
| 手动命令 | `lint`、`typecheck`、测试 | 开发者主动验证 | 否，可以忘记执行 |
| Git Hook | 只检查将要提交的文件 | 拦截低成本错误 | 否，可以绕过且可能未安装 |
| CI | 从干净环境执行完整门禁 | 合并前统一裁决 | 是 |

因此要记住两个原则：

1. **越靠近开发者的检查越快，越靠近合并点的检查越完整。**
2. **Git Hook 是体验优化，CI 才是仓库规则的执行者。**

## 二、每个工具只解决它擅长的问题

### 2.1 职责矩阵

| 工具 | 输入模型 | 擅长发现 | 不应该承担 |
| --- | --- | --- | --- |
| EditorConfig | 文本文件 | 缩进、换行符、文件末尾换行 | JavaScript 语义与代码格式布局 |
| Prettier | 解析后的语法树与自己的打印器 | 稳定、统一的代码排版 | 未处理 Promise、错误依赖、业务正确性 |
| ESLint | AST，可选 TypeScript 类型信息 | 可疑语法、框架约束、团队编码规则 | 完整类型系统、任意代码格式化 |
| `tsc` / `vue-tsc` | 整个 TypeScript 程序和模块图 | 类型不一致、不可达契约、Vue 模板类型错误 | 运行时业务断言、格式问题 |
| 测试 | 可执行行为 | 输入输出、状态变化、用户交互 | 穷举所有类型和环境 |
| 构建 | 真实生产打包流水线 | 模块解析、资源处理、产物生成 | 取代独立类型检查和测试 |

这些工具有少量交集，但交集不是合并职责的理由。例如 ESLint 能检查一部分风格规则，不代表应该让它负责换行和引号；Vite 能转译 TypeScript，不代表它已经运行了 TypeScript 类型检查器。

### 2.2 Vite 为什么能构建有类型错误的代码

Vite 的常见转译器主要做“擦除类型并生成 JavaScript”，不会建立完整 TypeScript 程序去证明类型关系。以下代码在语法层面完全可以被转译：

```ts
const count: number = '3'
```

类型标注被移除后仍是合法 JavaScript：

```js
const count = '3'
```

所以生产门禁必须显式运行 `tsc --noEmit`；Vue 项目还需要 `vue-tsc` 检查 `.vue` 文件及模板表达式。`build` 和 `typecheck` 是两道不同的门。

## 三、可复现性是所有检查的地基

如果同一提交在两台机器上解析出不同依赖或使用不同 Node.js 主版本，规则再严格也无法形成可靠门禁。

最低限度需要固定：

- 包管理器的 lockfile，并在 CI 使用面向 lockfile 的干净安装命令；
- Node.js 版本；
- ESLint、Prettier、TypeScript、插件及 shareable config 的版本；
- 被所有环境共同调用的 npm scripts。

示例用 `.node-version` 表达项目运行时：

<<< ../../../examples/frontend/quality-gates/.node-version

`npm ci` 与 `npm install` 的意图不同：前者要求 `package.json` 与 lockfile 一致，并以 lockfile 描述的依赖树进行干净安装；不一致时应直接失败，而不是悄悄重写 lockfile。这正适合 CI。

缓存只能缩短下载时间，不能成为正确性的来源。缓存丢失后，流水线仍必须能够仅凭仓库内容和包注册表重建环境。

## 四、Prettier：把排版从代码评审中移走

### 4.1 它不是一组普通 ESLint 规则

Prettier 会先解析代码，再用自己的文档模型重新打印。`printWidth` 也不是“任何一行都不得超过这个字符数”的验证规则，而是打印器选择换行布局时的目标值。

这带来一个重要结果：团队不应该逐条讨论空格、引号、尾逗号的写法。配置保持克制，让工具产生唯一且稳定的布局即可。

<<< ../../../examples/frontend/quality-gates/prettier.config.mjs

检查模式和写入模式必须分开：

```bash
# 本地明确请求修改文件
prettier --write .

# CI 只验证，不修改工作树
prettier --check .
```

CI 若自动修改再通过，会隐藏仓库中实际未格式化的事实，也会产生无法反馈到原提交的变更。

### 4.2 忽略的是不应由人维护的内容

<<< ../../../examples/frontend/quality-gates/.prettierignore

典型忽略对象包括：构建产物、覆盖率报告、第三方 vendored 文件、生成代码。不要为了让检查通过而忽略整个 `src/` 子树；那只是把质量债务藏了起来。

### 4.3 为什么推荐 `eslint-config-prettier`，而不是把 Prettier 当 ESLint 规则运行

有两件事容易混淆：

- `eslint-config-prettier`：**关闭**可能与 Prettier 冲突的 ESLint 格式类规则；
- 把 Prettier 包装成 ESLint rule 的插件：在 ESLint 运行过程中再次执行 Prettier，并把差异报告为 lint 错误。

官方集成建议倾向于前者，并让两个工具各自运行。这样速度更好，错误来源也更清楚。最终配置要放在 ESLint 配置数组末尾，保证关闭冲突规则的结果不会又被后续配置覆盖。

### 4.4 EditorConfig 是更底层的文本约定

<<< ../../../examples/frontend/quality-gates/.editorconfig

EditorConfig 负责编辑器都能理解的基础属性，例如 LF、UTF-8、文件末尾换行。Prettier 负责它支持的语言如何排版。两者可以同时存在，但不要用 EditorConfig 模拟完整 JavaScript 格式化规则。

## 五、ESLint Flat Config：按文件集合组合规则

### 5.1 配置不是一个大对象，而是有顺序的配置数组

现代 ESLint 的主配置文件是 `eslint.config.*`。对某个文件而言，ESLint 会找到所有匹配的配置对象，再按顺序合并。

可以把它理解成：

```text
全局忽略
  + 浏览器 / Vue 源码规则
  + JavaScript 的无类型覆盖层
  + Node.js 工具脚本规则
  + 最后的 Prettier 冲突关闭层
```

这种模型解决了老式配置中环境和 override 隐藏得太深的问题，但也要求你明确理解：

- `files` 决定配置作用于谁；
- `ignores` 在普通配置对象中只排除该对象的匹配；
- `globalIgnores()` 表达全局忽略；
- 后面的配置可以覆盖前面的规则；
- 给配置对象添加 `name`，能让配置检查器和调试输出更可读。

完整示例：

<<< ../../../examples/frontend/quality-gates/eslint.config.mjs

### 5.2 为什么浏览器与 Node.js 必须分开

浏览器代码能合法访问 `window`、`document`，Node.js 工具脚本则能访问 `process`、`Buffer`。如果粗暴地把两组 global 同时开放，下面的错误边界就消失了：

```ts
// 本应只能在服务端工具中使用，却被误写进浏览器入口。
console.log(process.env.SECRET)
```

分开环境不仅是在消除 `no-undef`，更是在声明模块的运行时能力。这个思想也适用于 Web Worker、Service Worker、测试环境与 SSR 服务端代码。

### 5.3 JavaScript 文件为什么关闭类型感知规则

示例对 TypeScript 源码开启 `recommendedTypeChecked`，又对普通 JavaScript 文件应用 `disableTypeChecked`。原因是类型感知规则需要把文件纳入 TypeScript 项目；配置文件或遗留 JS 未必已经进入类型项目。

这不是说 JavaScript 完全不 lint。`eslint.configs.recommended` 仍负责基础语义检查，只是不会强迫每个 JS 文件都具备完整类型信息。

### 5.4 不要让 disable 注释永久失效

当规则确实不适合某一行时，可以局部禁用，但要写出原因：

```ts
// 第三方 SDK 类型错误，升级到 sdk@4 后删除此禁用。
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- SDK issue #418
sendToLegacySdk(payload)
```

示例开启 `reportUnusedDisableDirectives`。规则调整或代码删除后，已无作用的 disable 会成为错误，从而避免“历史豁免”无限累积。对于长期豁免，最好再记录责任人、上游 issue 或删除条件。

## 六、Vue SFC 为什么需要两层 parser

`.vue` 文件不是纯 TypeScript：顶层包含 `<template>`、`<script>`、`<style>` 等区块。解析链应当是：

```text
App.vue
  ↓ vue-eslint-parser 识别 SFC 与 template AST
<script lang="ts">
  ↓ @typescript-eslint/parser 解析脚本内容
TypeScript AST + parser services
```

`eslint-plugin-vue` 的 flat recommended 配置会建立 Vue 顶层解析器。示例中的：

```js
languageOptions: {
  parserOptions: {
    parser: tseslint.parser,
    extraFileExtensions: ['.vue'],
  },
}
```

设置的是 `<script>` 内层 parser。不要把 `languageOptions.parser` 直接改为 TypeScript parser，否则 TypeScript parser 会面对整个 SFC，模板相关规则也失去正确的 AST。

Vue 2 项目应选择插件提供的 Vue 2 规则集，例如 `flat/vue2-recommended`；Vue 3 才使用 `flat/recommended`。这是框架语义差异，不只是严格程度差异。

## 七、类型感知 ESLint：规则为什么能看懂 Promise

### 7.1 只有 AST 时能知道什么

普通 lint 能看见语法形状：变量是否声明、分支是否重复、是否使用 `==`。但只看下面一行的语法树，无法确定调用返回什么：

```ts
saveLesson(input)
```

如果 ESLint 获得 TypeScript 类型服务，它就能知道 `saveLesson` 返回 `Promise<Lesson>`，进而由 `no-floating-promises` 判断这个 Promise 是否被 `await`、返回、捕获或明确忽略。

### 7.2 `projectService: true` 做了什么

`typescript-eslint` 的类型感知规则需要 TypeScript 建立程序。`projectService: true` 使用与编辑器相近的 TypeScript Project Service，为每个文件找到相应的 `tsconfig.json`，并提供类型信息。

因此示例增加了一个 solution 配置，明确项目由浏览器应用和 Node.js 工具两部分组成：

<<< ../../../examples/frontend/quality-gates/tsconfig.json

如果 ESLint 提示“文件不在项目中”，不要立刻扩大 `include` 到整个仓库。先问：

1. 该文件实际在哪个运行时执行？
2. 它应属于应用、测试、Node 工具还是独立包？
3. 是否应该为该边界建立单独的 tsconfig？

### 7.3 类型感知 lint 为什么更慢

普通 ESLint 可以近似逐文件工作；类型感知规则必须解析依赖、建立类型图并维护 TypeScript Program。冷启动时它必然更昂贵。

优化顺序应该是：

1. 让 tsconfig 的 `include` 精确，不扫描产物和无关目录；
2. 使用 ESLint cache 加速未变化文件；
3. 将本地 staged 检查与 CI 全量检查分层；
4. 大型 monorepo 按包建立项目边界；
5. 测量慢规则后再决定是否调整，而不是先关闭所有类型感知规则。

## 八、TypeScript 配置表达运行时边界

### 8.1 不要让一份 tsconfig 同时假装运行在浏览器和 Node.js

示例把共同严格规则抽到 base：

<<< ../../../examples/frontend/quality-gates/tsconfig.base.json

应用配置使用 `moduleResolution: "Bundler"`，因为真实解析器是 Vite，并声明 DOM 与 Vite 客户端类型：

<<< ../../../examples/frontend/quality-gates/tsconfig.app.json

工具脚本由 Node.js 执行，使用 `NodeNext`，只声明 Node 类型：

<<< ../../../examples/frontend/quality-gates/tsconfig.node.json

这样做会让边界错误真正暴露出来：浏览器源码不能凭空访问 Node globals，Node 脚本也不会误以为一定存在 DOM。

### 8.2 几个严格选项背后的契约

- `strict`：开启一组相互配合的严格检查，是新项目的基线；
- `noUncheckedIndexedAccess`：索引读取可能不存在，因此结果包含 `undefined`；
- `exactOptionalPropertyTypes`：属性缺失与“属性存在但值为 `undefined`”不再被随意混同；
- `useUnknownInCatchVariables`：捕获值先视为 `unknown`，因为 JavaScript 可以抛出任意值；
- `noImplicitOverride`：重写父类成员必须显式写 `override`；
- `verbatimModuleSyntax`：类型导入、值导入及模块输出意图更加明确。

严格选项的价值不在“报错更多”，而在让隐含假设变成可审查的契约。

### 8.3 `skipLibCheck` 的真实含义

`skipLibCheck: true` 跳过声明文件内部的类型检查，常用于降低大型项目检查成本以及缓解依赖声明之间的冲突。它不会让你的源码停止使用这些声明文件的类型。

它也不是解决重复依赖类型的根治方案。如果同一库的两个版本产生不兼容声明，应优先统一依赖版本或修复上游声明。

### 8.4 `tsc`、`vue-tsc` 与项目引用

- 普通 TS/TSX 或 Node 工具可以由 `tsc` 检查；
- Vue SFC 应由 `vue-tsc` 补充模板与组件层面的检查；
- 多包仓库可以使用 project references 和 `tsc -b` 表达依赖图并增量构建。

不要因为 `vue-tsc` 最终依赖 TypeScript，就假设它与 `tsc` 的覆盖范围完全相同；脚本约定应明确每种源文件由谁负责。

## 九、让规则保护真实异步错误

下面的服务层示例展示了类型与 lint 如何分工：

<<< ../../../examples/frontend/quality-gates/src/lesson-service.ts

这里有几个值得观察的设计：

- `response.ok` 是 HTTP 语义检查，类型系统不会替你完成；
- `response.json()` 得到的外部数据先作为 `unknown`，再通过解析边界转换为可信领域类型；
- 调用者必须处理返回的 Promise；
- `AbortSignal` 被建模为可选能力，而不是藏在全局变量中。

静态工具最有效的地方，是保护已经明确表达出来的契约。若把外部数据直接断言成 `Lesson`，工具只能相信这个断言，无法替你验证服务器响应。

## 十、npm scripts 是本地与 CI 的公共 API

不要在 CI YAML 中重新拼一套难以在本地复现的命令。仓库应先提供稳定 scripts，CI 只负责按顺序调用。

<<< ../../../examples/frontend/quality-gates/package-scripts.json

这组脚本刻意区分：

- 会修改文件的 `format`、`lint:fix`；
- 只验证的 `format:check`、`lint`、`typecheck`、`test:run`、`build`；
- 开发者可一键执行的 `verify`；
- Git Hook 调用的 `precommit`。

`--max-warnings=0` 表示 CI 不允许新的 warning 静默累积。否则团队很容易形成“已有 437 个 warning，再多一个也无所谓”的债务。

但不要把所有规则一夜之间从关闭改成 error。遗留项目更适合采用棘轮策略：记录基线、优先修复高风险规则、禁止新增违规，再逐步收紧存量。

## 十一、Git 暂存区与 lint-staged

### 11.1 为什么提交前只检查 staged 文件

开发者可能同时修改多个任务，只暂存其中一部分。Git Hook 应检查“这次提交的内容”，而不是工作树里所有未完成内容。

`lint-staged` 从 Git 暂存区找出匹配文件，将文件名传给任务，并在任务修改文件后更新暂存内容。它还会处理部分暂存文件，尽量避免把未暂存改动意外带入提交。

### 11.2 匹配模式避免重叠副作用

<<< ../../../examples/frontend/quality-gates/lint-staged.config.mjs

对象中的不同 glob 任务可能并发执行。如果同一个 `.ts` 文件同时匹配两个会写入的任务，就可能发生两个进程竞争修改同一文件。

示例使用互斥 glob：

- JS/TS/Vue 先由 ESLint 修复，再由 Prettier 排版；
- 其余 JSON、CSS、Markdown 等只由 Prettier 处理。

同一数组中的命令按顺序执行；不同 key 才可能并发。这个区别决定了配置是否存在竞态。

### 11.3 自动修复的边界

提交前自动格式化通常风险较低。ESLint `--fix` 则要审查启用的规则是否可能改变语义，尤其是在大版本升级后。

适合自动修复的标准是：

- 结果确定且幂等；
- 不依赖外部服务；
- 不产生大量无关 diff；
- 失败时能给出开发者可操作的信息。

## 十二、Husky 与 Git Hooks：便利层，不是安全边界

Git 原生 hooks 位于 hooks 目录，在特定 Git 操作前后执行。Husky 的作用是让项目能够版本化、安装和维护这些脚本。

<<< ../../../examples/frontend/quality-gates/.husky/pre-commit

这个 hook 故意很薄，只调用公共 npm script。不要把复杂业务逻辑复制进 shell 文件，否则 Windows、macOS、CI 与不同 shell 环境很容易产生漂移。

`prepare: "husky"` 让依赖安装后配置 hooks；CI 示例设置 `HUSKY=0`，因为 CI 不需要安装本地提交钩子。

必须明确：hooks 可以因为以下原因不执行：

- 开发者使用 `git commit --no-verify`；
- 使用的客户端不触发或未正确安装 hook；
- 依赖尚未安装；
- 仓库通过 API 或其他自动化产生提交。

所以 hook 失败应帮助开发者快速修复，但分支保护不能信任 hook 已执行。

## 十三、CI：在干净环境中执行统一裁决

### 13.1 一条可信流水线需要哪些属性

示例 GitHub Actions 工作流包含：

- 对拉取请求和主分支 push 执行；
- 最小 `contents: read` 权限；
- 同一分支有新提交时取消旧运行；
- 为 job 设置超时；
- 从项目文件读取 Node.js 版本；
- 基于 lockfile 使用 npm 下载缓存；
- 使用 `npm ci` 干净安装；
- 分别展示每道门的失败位置。

<<< ../../../examples/frontend/quality-gates/.github/workflows/frontend-quality.yml

示例为了教学可读性使用官方 Action 的主版本标签。生产仓库若把供应链安全作为威胁模型的一部分，应把第三方和官方 Action 固定到**经过验证的完整 commit SHA**，再由依赖更新工具提交升级 PR。完整 SHA 是不可变引用；可移动 tag 不是。

### 13.2 最小权限与不可信输入

`permissions: contents: read` 是最小权限思维的起点。某个 job 若确实需要写入检查结果或制品，应只给该 job 对应权限，不要给整个 workflow 广泛写权限。

来自 fork 的 PR、issue 标题、分支名和仓库内容都可能是不可信输入。不要把它们未经处理拼进 shell 命令，也不要在执行不可信 PR 代码的 job 中暴露部署密钥。

特别要谨慎使用具备基准分支权限和 secrets 的触发方式。质量检查通常只需要读代码，不需要生产凭据。

### 13.3 为什么把检查拆成多个 step

单个 `npm run verify` 最容易本地复现；CI 拆成多个 step 则能立即看出是格式、lint、类型、测试还是构建失败。

两者并不冲突：底层命令仍来自同一组 npm scripts，CI 只是为了可观测性逐项调用。不要在 YAML 中写出与 scripts 不同的参数。

### 13.4 串行还是并行

小型项目串行执行更简单，失败日志也清楚。检查耗时增长后，可以把 lint、typecheck、test、build 拆成并行 jobs，但要权衡：

- 每个 job 都可能需要 checkout、安装依赖和恢复缓存；
- 并行降低墙钟时间，却可能增加计算费用；
- 构建是否依赖类型检查产物；
- 分支保护需要等待哪些 required checks；
- fail-fast 是否会让一次 PR 无法看到全部问题。

先记录每一步耗时，再优化最长路径，不要凭感觉把所有命令并行化。

## 十四、门禁应该检查多大范围

### 14.1 本地增量，CI 全量

推荐默认策略：

```text
编辑器：当前文件 / 当前 TypeScript 项目增量
pre-commit：暂存文件的 lint 与格式化
本地 verify：当前应用全量
PR CI：受影响包 + 必须的仓库级检查
主分支 / 合并队列：完整权威门禁
```

类型检查很难安全地只检查“被修改的单文件”，因为公共类型变化会影响大量下游文件。测试也可能因为共享依赖而跨目录受影响。因此所谓 affected checks 必须来自可靠的项目依赖图，而不是简单按 `git diff` 文件后缀猜测。

### 14.2 Monorepo 的边界

大型仓库通常需要：

- 每个 package 自己的 tsconfig、lint 范围和测试入口；
- 根脚本负责任务编排，而不是混合所有运行时 globals；
- 缓存 key 包含 lockfile、配置和相关源码输入；
- 公共包改变时重新检查所有下游消费者；
- 合并队列在最终基线组合上重新验证，避免两个各自通过的 PR 合并后冲突。

“只跑受影响任务”是依赖图问题，不只是 CI 条件表达式问题。

## 十五、规则治理比规则数量更重要

### 15.1 如何决定规则等级

可以按后果分层：

| 等级 | 适用问题 | 示例 |
| --- | --- | --- |
| error | 高确定性 bug、契约破坏、合并前必须修复 | floating Promise、未定义变量 |
| warning | 迁移期信号或尚需观察误报率的规则 | 新架构边界的初期告警 |
| off | 与项目不适配、由其他工具完整覆盖 | 与 Prettier 冲突的格式规则 |

如果 CI 使用 `--max-warnings=0`，warning 仍然会阻止合并；它主要表达诊断分类，而不是“以后再修”。如果团队确实需要迁移缓冲，应建立可量化基线或限定目录，而不是无限容忍 warning。

### 15.2 升级依赖时要像升级编译器一样谨慎

ESLint、TypeScript、Vue parser 或规则集的大版本变化，可能带来：

- 新规则进入 recommended；
- 旧规则重命名或删除；
- parser 对新语法的支持变化；
- 自动修复结果变化；
- Node.js 运行时要求提升；
- 类型声明变严格，从而暴露旧问题。

升级 PR 应单独进行，先读迁移指南，再查看配置解析结果和 diff，最后逐类处理新增诊断。不要把工具大版本升级混进业务功能 PR。

### 15.3 配置本身也需要可观测性

排查“为什么这条规则没生效”时，不要只盯着配置源文件。应该查看目标文件最终得到的合并配置，并确认：

- 文件是否被全局忽略；
- 哪些 `files` glob 匹配；
- 后续配置是否覆盖了规则；
- parser 与 globals 是否属于正确运行时；
- 文件是否进入对应 TypeScript 项目；
- 编辑器 ESLint 扩展是否使用工作区版本。

现代 ESLint 提供配置检查器和打印最终配置等调试能力。最终生效配置才是事实，配置文件的视觉顺序只是输入。

## 十六、常见失败设计及原因

### 16.1 ESLint 和 Prettier 同时负责格式

**表现：** 保存后反复变化，CI 报另一套风格。

**原因：** 两个打印/规则系统对同一布局有不同答案。

**处理：** Prettier 负责排版；`eslint-config-prettier` 最后加载；ESLint 聚焦语义和框架规则。

### 16.2 只在 pre-commit 执行全部测试与构建

**表现：** 每次提交等待很久，开发者频繁绕过 hook。

**原因：** 把完整权威门禁放进了高频交互路径。

**处理：** hook 只做快速 staged 检查；完整类型、测试和构建放在本地 `verify` 与 CI。

### 16.3 只运行 `vite build`

**表现：** 构建成功，编辑器和 CI 类型错误仍然存在。

**原因：** 转译器擦除类型，不执行完整类型检查。

**处理：** 明确运行 `vue-tsc --noEmit` / `tsc --noEmit`。

### 16.4 所有目录共享 browser + node + test globals

**表现：** 浏览器代码误用 `process`，生产代码误用测试全局却不报错。

**原因：** 配置抹平了运行时边界。

**处理：** 使用精确 `files` 配置对象分别声明能力。

### 16.5 为了速度关闭类型感知 lint

**表现：** 最有价值的 Promise、安全调用等规则消失。

**原因：** 未先定位扫描范围、缓存或项目图问题。

**处理：** 先测量并优化 tsconfig、cache 和包边界，再权衡具体规则。

### 16.6 CI 使用浮动环境

**表现：** 无代码变化却突然失败，或本地无法复现。

**原因：** Node、依赖、Action 或系统环境发生变化。

**处理：** 锁定 Node 与依赖；CI 使用 lockfile；关键 Action 固定 SHA；升级通过显式 PR 完成。

### 16.7 生成文件既被生成器管理，又被格式化器重写

**表现：** 每次生成都有巨大 diff，或者生成后立即格式变化。

**原因：** 产物所有权不清晰。

**处理：** 首选让生成器直接输出最终格式；否则明确生成后的统一步骤。若文件不应人工维护，则集中忽略并记录生成来源。

## 十七、落地顺序：从可复现到强门禁

在现有 Vue 2 或混合技术栈项目中，可以按以下顺序渐进落地：

1. 固定 Node、包管理器与 lockfile，先保证环境可复现；
2. 建立只读的 `format:check`、`lint`、`typecheck`、`test:run`、`build` scripts；
3. 让开发者在本地能运行与 CI 完全相同的底层命令；
4. 明确浏览器、Node、测试、Vue 2/3 的 ESLint 与 tsconfig 边界；
5. 先接入 CI 全量门禁，确保规则无法靠跳过 hook 绕过；
6. 再用 lint-staged 和 Husky 缩短日常反馈；
7. 测量耗时、失败类别、warning 数和跳过率，再优化缓存与任务图；
8. 逐步偿还遗留基线，删除临时禁用和过宽忽略。

顺序很重要：如果本地命令不可复现，Git Hook 只会放大混乱；如果 CI 尚未权威执行，hook 再严格也无法保护主分支。

## 十八、团队检查清单

### 配置职责

- Prettier 只负责格式，ESLint 负责语义与框架规则；
- `eslint-config-prettier` 位于 ESLint 配置末尾；
- Vue SFC 保留 `vue-eslint-parser` 外层解析；
- 浏览器、Node、测试与 SSR globals 分开；
- 类型感知规则对应的文件进入正确 tsconfig。

### 本地体验

- 编辑器使用仓库安装的工具版本；
- 保存动作快速且不会与其他工具来回改写；
- pre-commit 只检查 staged 文件；
- hook 失败信息能直接指向修复命令；
- 完整验证能通过一个公共 script 在本地复现。

### CI 可信度

- 使用 lockfile 的干净安装；
- Node.js 与包管理器版本稳定；
- workflow 权限最小化；
- job 有 timeout，并取消同分支过期运行；
- 不可信 PR 代码接触不到部署 secrets；
- Action 使用受控版本，生产环境优先固定完整 SHA；
- 分支保护要求真正的权威 checks 通过。

### 长期治理

- warning 不会无上限增长；
- disable 注释带原因并清理失效项；
- 工具升级使用独立 PR；
- 生成代码和第三方代码的所有权明确；
- 根据真实耗时与失败数据调整门禁，而不是凭感觉关闭检查。

## 十九、完整示例目录

```text
examples/frontend/quality-gates/
├── .editorconfig
├── .github/workflows/frontend-quality.yml
├── .husky/pre-commit
├── .node-version
├── .prettierignore
├── eslint.config.mjs
├── lint-staged.config.mjs
├── package-scripts.json
├── prettier.config.mjs
├── src/lesson-service.ts
├── tsconfig.app.json
├── tsconfig.base.json
├── tsconfig.json
└── tsconfig.node.json
```

把示例迁入真实项目时，还需要在 `devDependencies` 中安装与配置对应的工具，并把 `package-scripts.json` 中的 `scripts` 合并进项目 `package.json`。版本应依据项目的 Node.js、Vue 主版本与插件兼容矩阵统一选择，不要孤立升级某一个 parser。

## 二十、总结

一套成熟的前端质量体系不是“装了 ESLint 就完成了”，而是清楚回答这些问题：

- 问题由格式化器、lint、类型系统、测试还是构建发现？
- 它应在编辑器、提交前还是 CI 被发现？
- 浏览器、Node、Vue 模板和测试文件分别由哪个项目配置解释？
- 本地和 CI 是否调用同一份命令、依赖和运行时？
- 检查能否被绕过，最终由谁做合并裁决？

最核心的边界是：**Prettier 统一表达形式，ESLint 发现危险模式，TypeScript 验证静态契约，测试验证运行时行为，构建验证生产流水线，Git Hook 提前反馈，CI 统一裁决。**

下一节将进入测试工程化，系统讨论单元测试、组件测试与端到端测试的边界，如何选择测试替身，以及怎样设计稳定、可维护的前端测试。

## 参考资料

- [ESLint：Configuration Files](https://eslint.org/docs/latest/use/configure/configuration-files)
- [typescript-eslint：Typed Linting](https://typescript-eslint.io/getting-started/typed-linting/)
- [eslint-plugin-vue：User Guide](https://eslint.vuejs.org/user-guide/)
- [Prettier：Configuration File](https://prettier.io/docs/configuration)
- [Prettier：Integrating with Linters](https://prettier.io/docs/integrating-with-linters)
- [TypeScript：Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [lint-staged 文档](https://github.com/lint-staged/lint-staged)
- [Husky 文档](https://typicode.github.io/husky/)
- [Git：githooks](https://git-scm.com/docs/githooks)
- [GitHub Actions：Workflow syntax](https://docs.github.com/actions/writing-workflows/workflow-syntax-for-github-actions)
- [GitHub Actions：Secure use reference](https://docs.github.com/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions)
