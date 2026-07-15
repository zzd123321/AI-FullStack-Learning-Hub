---
title: Vite 开发服务器、模块图、插件流水线与生产构建
description: 理解 Vite 的开发期原生 ESM、依赖预构建、HMR、配置与环境变量、插件钩子和生产构建边界
---

# Vite 开发服务器、模块图、插件流水线与生产构建

很多前端项目把 Vite 理解为“比 webpack 启动更快的脚手架”。这种理解只能解释表象，无法回答工程中的关键问题：为什么开发环境能运行，生产构建却失败？为什么改一个文件有时热更新、有时整页刷新？为什么 `.env` 改了必须重启？为什么代理只在本机有效？为什么动态 import 没有产生预期的 chunk？

真正需要掌握的是 Vite 的执行模型：

```text
开发：浏览器按原生 ESM 请求模块 → Vite 按需解析、加载、转换并返回
生产：从 HTML / JS 入口遍历完整模块图 → 合并、摇树、分块、压缩并输出静态产物
```

两条流水线共享配置和插件契约，但触发时机、可见模块、性能目标和最终输出不同。

> 本节示例采用 2026 年 Vite 8 官方文档中的术语，包括 Rolldown、Oxc 和 `build.rolldownOptions`。Vite 6/7 及更早版本的内部实现和部分配置名不同；维护现有项目时必须对照锁文件中的实际 Vite 主版本。稳定知识是模块图、插件契约和开发/构建边界，而不是某个内部工具永远不变。

## 1. 学习目标

完成本节后，你应该能够：

- 解释 Vite 开发服务器为什么不需要启动时打完整 bundle；
- 理解 bare import 重写、依赖预构建及其缓存失效条件；
- 用模块图和 HMR boundary 分析热更新与整页刷新；
- 区分 command、mode、`NODE_ENV`、客户端环境变量和服务端配置变量；
- 正确处理 TypeScript 检查、静态资源、`public` 目录和部署 `base`；
- 理解插件的 resolve、load、transform、HTML 与 HMR 钩子；
- 使用虚拟模块建立可验证的构建期边界；
- 解释生产构建中的 tree shaking、动态 import、chunk、hash 和 manifest；
- 识别开发代理、source map、浏览器 target 和 `vite preview` 的真实边界；
- 建立开发与生产一致性验证及构建性能诊断方法。

## 2. 从 bundle-first 到按需 ESM

传统 bundle-first 开发服务器通常先遍历入口可达的模块，生成一个或多个开发 bundle，之后浏览器才能加载页面。项目越大，首次遍历与打包成本越明显。

Vite 开发服务器利用浏览器原生 ESM：

1. 服务器先快速启动；
2. 浏览器请求 `index.html`；
3. HTML 中的 `<script type="module">` 触发入口模块请求；
4. Vite 解析入口 import，只转换浏览器实际请求到的模块；
5. 动态 import 对应的分支在真正访问时才请求。

因此“服务器 ready”不等于“整个应用已经编译”。成本从启动阶段分散到了请求阶段。大型项目若首屏需要数千个细粒度模块，浏览器请求、转换和网络瀑布仍会变慢；Vite 8 也继续探索开发期 bundle 模式来处理这种极端规模。

开发期响应不是原文件的简单静态托管。Vite 会做 URL 解析、插件转换、import analysis、HMR 注入和 source map 组合，然后把合法 ESM 返回给浏览器。

## 3. `index.html` 是模块图入口的一部分

在普通 Vite SPA 中，`index.html` 不是复制模板，而是被 Vite 处理的入口：

<<< ../../../examples/frontend/vite-pipeline/index.html

Vite 会解析 module script、CSS、资源 URL 和 HTML 中的环境常量。生产构建也从 HTML 发现入口资源，生成带 hash 的链接。

这与某些框架不同：Nuxt、React Router framework mode、SvelteKit 等可能自己管理 HTML 或多个运行环境，插件的 `transformIndexHtml` 不一定经过相同路径。使用上层框架时应优先遵守框架的构建契约，而不是绕过它直接假设底层 Vite 行为。

项目 `root` 决定 Vite 从哪里解析 HTML、公共目录和相对路径。不要为了修复一个 import 随意扩大文件系统访问范围；monorepo 中应明确 workspace 根、包边界和允许服务的目录。

## 4. 浏览器不认识 bare import，Vite 必须重写

浏览器原生 ESM 能理解相对或绝对 URL：

```ts
import { format } from './format.js'
import data from '/src/data.js'
```

但不能原生解析 npm 风格的 bare import：

```ts
import { createApp } from 'vue'
```

Vite 根据 Node/npm 包解析规则、package exports 和配置找到实际依赖，再把请求重写成浏览器可访问的 URL。开发工具中经常能看到类似 `/node_modules/.vite/deps/...` 的地址和版本查询参数。

解析并非简单拼路径，还会受这些因素影响：

- 包的 `exports` / `imports` 条件和 ESM / CommonJS 格式；
- `resolve.alias`、扩展名和 main fields；
- monorepo 软链接、重复依赖与 package manager 布局；
- client、SSR、Worker 等不同运行环境；
- 插件 `resolveId` 对模块 ID 的接管。

别用 alias 掩盖错误的包结构。共享包应该声明正确 exports、依赖与模块格式；否则开发服务器可能碰巧从源码工作，发布包后消费者却无法解析。

## 5. 依赖预构建解决两个不同问题

开发期 dependency pre-bundling 不是生产 bundle。它主要解决：

1. **兼容性**：把 CommonJS / UMD 依赖转换成开发服务器可提供的 ESM；
2. **请求数量**：把包含大量内部模块的 ESM 依赖合并，避免浏览器同时请求数百个文件。

Vite 会扫描 source 中的 bare imports，把发现的依赖作为预构建入口。若运行后才遇到扫描阶段没发现的依赖，可能重新优化依赖并触发页面 reload。

### 缓存为什么有时“像没更新”

预构建结果通常保存在 `node_modules/.vite`，并根据锁文件、相关配置、补丁和环境等因素失效。依赖 URL 还会使用强 HTTP 缓存，版本查询参数负责切换缓存身份。

排查本地依赖修改时按因果顺序处理：

1. 确认导入最终解析到哪个文件；
2. 确认锁文件和软链接是否符合预期；
3. 浏览器 Network 面板临时禁用缓存；
4. 必要时用 `vite --force` 重新预构建；
5. 不要把“每次都删除全部 node_modules”当作首个诊断步骤。

`optimizeDeps.include` 适合主动包含扫描不到、体积大或需要 CJS 转换的依赖；`exclude` 适合让小型、有效 ESM 直接提供。配置它们之前先证明默认发现策略确实有问题，过度手工维护会让升级更困难。

### monorepo linked dependency

Vite 通常把不在 `node_modules` 中解析出的 linked package 当作源码处理。这有利于 HMR，但要求包能以有效 ESM 被消费。若共享包只输出 CommonJS，可能要修正包本身，或临时加入预构建 include。

monorepo 中出现两份 Vue / React 运行时可能导致实例身份、Context、Hook 或响应式判断异常。应从 workspace 依赖声明、peerDependencies 和解析结果解决，而不是首先依赖 `resolve.dedupe` 掩盖发布契约问题。

## 6. Vite 转译 TypeScript，但不负责类型检查

Vite 为速度按单文件转译 `.ts`，不会像 `tsc` 一样理解完整类型图并报告类型错误。下面代码即使类型不正确，也可能被转成可运行 JavaScript：

```ts
const count: number = 'not a number'
```

因此开发和 CI 至少要把两个职责分开：

```text
快速运行/构建：Vite transform
静态正确性：tsc --noEmit（或 vue-tsc）
```

不要依赖 Vite build 作为类型检查。也不要把 `tsc --noEmit` 塞进每次模块 transform，破坏按需模型；可以让 IDE 常驻检查、独立 watch 进程并行运行，CI 再作为硬门禁。

单文件转译还意味着某些需要跨文件类型信息的 TypeScript 行为不适合依赖。现代项目应优先使用可擦除类型语法、`import type` 和与 bundler module resolution 一致的 tsconfig。

## 7. 模块图是 HMR 的基础数据结构

Vite 维护模块节点及 import / importer 关系。文件变化时，它从变化模块沿 importer 向上查找能够接受更新的 **HMR boundary**：

```text
changed module → importer → importer → accepting boundary
                                      ↘ 找不到 → full reload
```

Vue SFC HMR 和 React Fast Refresh 由框架插件定义边界和状态保留语义。不是“任何修改都无损保留状态”：组件导出形状、模块副作用或边界失效时，插件可以扩大更新范围或整页刷新。

### HMR 不是替换已经被其他模块捕获的所有值

ESM import 是 live binding，但应用中的闭包、单例、事件监听器和第三方库可能已经保存旧对象。手写 HMR 必须定义：

- 谁接受新模块；
- 哪些状态允许跨版本保留；
- 旧模块的 timer、listener、socket 如何释放；
- 新导出不兼容时是否主动 invalidate。

下面的示例在 `dispose` 中清除 interval，并通过 `hot.data` 显式传递状态：

<<< ../../../examples/frontend/vite-pipeline/src/hmr-lifecycle.mts

`if (import.meta.hot)` 守卫也让 HMR 代码可以在生产构建中被消除。业务应用通常不需要手写组件 HMR，但插件、状态容器和带副作用的基础模块必须理解这个生命周期。

HMR 成功不代表冷启动正确。开发中长期保留的状态可能掩盖初始化 bug，所以重要流程要定期整页刷新，并在测试中覆盖干净加载。

## 8. 配置文件本身运行在构建工具环境

`vite.config.*` 不是浏览器代码。它在 Node / 工具进程中执行，可以读取文件和服务端环境，但任何通过 `define`、HTML、虚拟模块或 client env 注入的值都会进入浏览器产物。

本课完整配置如下：

<<< ../../../examples/frontend/vite-pipeline/vite.config.mts

这个配置做了几件有意的限制：

- `APP_` 变量只由配置读取，不自动暴露给客户端；
- dev server 使用固定端口并在占用时失败，避免自动换端口破坏 OAuth callback；
- `server.fs.strict` 保持文件系统服务边界；
- `/api` 代理只用于本地开发；
- `base` 明确子路径部署前缀；
- build 输出 manifest 和 content hash；
- staging 生成 hidden source map，但仍需单独安全上传和禁止公开访问。

示例采用 Vite 8 的 `build.rolldownOptions`。旧版本通常使用 `build.rollupOptions`；Vite 8 将其保留为 deprecated alias。不要在不知道项目主版本时机械批量改名。

### command、mode 与 `NODE_ENV` 不是同一个概念

- command 通常是 `serve` 或 `build`，表示执行开发服务器还是构建；
- mode 默认在开发为 `development`、构建为 `production`，也可用 `--mode staging` 改变；
- `NODE_ENV` 影响依赖和 `import.meta.env.PROD/DEV` 等判断，但不能当作 mode 的同义词；
- preview 是预览构建产物的本地服务器，不是生产部署形态。

配置函数可以根据 command / mode 返回差异，但分支越多，开发与生产偏差越大。优先让差异来自运行环境必需的能力，而不是长期维护两套应用逻辑。

## 9. 环境变量是构建输入，不是运行时秘密

Vite 暴露 `import.meta.env.MODE`、`BASE_URL`、`DEV`、`PROD`、`SSR` 等内建常量。默认只有 `VITE_` 前缀的自定义变量进入客户端。

<<< ../../../examples/frontend/vite-pipeline/.env.example

关键规则：

- 所有 `.env` 值最初都是字符串，`"false"` 在 JavaScript 中仍为 truthy；
- `VITE_` 变量会被打进客户端代码，绝不能存真正秘密；
- `.env.local` / `.env.[mode].local` 应被 git 忽略，但“未提交”不等于“可以暴露到客户端”；
- shell 中已有变量优先级高于 env 文件；
- env 文件只在启动时读取，修改后应重启；
- 不要依赖 dotenv 反向展开等跨工具不一致行为。

TypeScript 声明能提供拼写提示：

<<< ../../../examples/frontend/vite-pipeline/src/vite-env.d.ts

声明仍不能验证部署系统实际提供了值，所以应用启动时要运行时解析：

<<< ../../../examples/frontend/vite-pipeline/src/app-config.ts

### 构建时配置与运行时配置

`import.meta.env.VITE_API_BASE_URL` 通常在构建时替换。构建一次后把同一静态目录部署到测试和生产，环境变量不会自动重新读取。

需要“build once, deploy many”时，可由服务器返回经过校验的 `/runtime-config.json`，或在 HTML 中安全注入非秘密配置，并在应用启动前读取。要定义缓存策略、schema、CSP 和失败行为，而不是用 `window.__CONFIG__` 随意塞字符串。

直接静态 property access 更有利于常量替换和 dead code elimination。过度动态访问 env key 会降低静态分析能力。

## 10. dev proxy 只存在于开发服务器

配置中的：

```text
/api → http://127.0.0.1:8080
```

让浏览器仍请求 Vite origin，由开发服务器转发到后端，因此本地看起来没有 CORS。生产静态文件部署到 CDN 后，Vite dev server 不存在，代理自然消失。

生产必须明确选择：

- 由同源反向代理把 `/api` 转发到后端；
- 前端调用独立 API origin，并正确配置 CORS、Cookie 和 CSRF；
- 使用 BFF / edge 层聚合。

“本地请求正常、生产 CORS 失败”通常不是 Vite bug，而是开发代理隐藏了真实拓扑。集成测试应至少有一个环境使用接近生产的域名、TLS、Cookie 和代理布局。

`changeOrigin: true` 会改变转发请求的 Host 语义，后端基于 Host 做安全判断时必须理解这一点。代理目标来自本地配置，不应由浏览器请求动态决定，否则可能形成开放代理或 SSRF 边界。

## 11. 静态资源：进入模块图还是原样复制

从源码 import 的资源属于模块图：Vite 能追踪引用，在生产中生成 hash 文件名、更新 URL、内联小资源并由插件处理。

<<< ../../../examples/frontend/vite-pipeline/src/asset-urls.ts

示例资源完整源码：

<<< ../../../examples/frontend/vite-pipeline/src/assets/course-cover.svg

`new URL('./asset.svg', import.meta.url)` 是原生 ESM 模式；生产转换要求路径足够静态以便分析。完全动态的字符串可能无法被构建工具发现。SSR 中 `import.meta.url` 指向服务器模块，无法预先知道客户端 host，因此需要使用框架资产 API或 manifest。

`public` 目录中的文件不会进入同样的依赖图，而是以原文件名复制到输出根：

<<< ../../../examples/frontend/vite-pipeline/public/robots.txt

适合 `robots.txt`、必须保留固定名称或不会被源码 import 的文件。源码中引用 public 文件要用根绝对路径 `/robots.txt`，不要写 `/public/robots.txt`。

一般优先 import 资源，因为 content hash 可长期缓存并能检测删除后的悬空引用。public 文件名稳定也意味着更新时要自己处理缓存失效。

`?url`、`?raw`、`?inline`、`?worker` 等 query 会改变模块含义。它们是 Vite 契约的一部分，编写跨 bundler 的库时不要让消费者无意依赖应用专属 query。

## 12. 动态 import 是代码分割边界，也是运行时失败边界

静态动态 import：

```ts
const module = await import('./pages/editor-page.js')
```

在生产构建中通常形成异步 chunk。路由按需加载可减少首屏 JavaScript，但会增加导航时请求和失败可能。

不要构造无法静态枚举的任意路径：

```ts
await import(userControlledPath)
```

构建工具无法知道所有目标，也把模块选择权交给不可信输入。显式 loader map 更可靠：

<<< ../../../examples/frontend/vite-pipeline/src/route-registry.ts

对应的两个模块如下：

<<< ../../../examples/frontend/vite-pipeline/src/pages/catalog-page.ts

<<< ../../../examples/frontend/vite-pipeline/src/pages/editor-page.ts

代码分割策略要从用户路径和缓存变化率出发：

- 首屏必需代码不应被切得过碎；
- 很少访问的大编辑器适合异步；
- 共享依赖会影响 chunk 归属，不能只看源目录；
- 动态 chunk 加载失败要提供重试、刷新或版本漂移恢复；
- 部署时旧 HTML 与新 chunks 的保留窗口必须匹配。

手工 `manualChunks` 可能破坏执行顺序、造成共享依赖重复或把小变化扩散到大 vendor chunk。先用构建可视化证明默认分块有问题，再针对稳定边界优化。Vite 8 底层选项也在演进，升级时复核输出而不是只确认配置通过类型检查。

## 13. 插件流水线：resolve → load → transform

Vite 插件 API 继承 bundler 插件约定，并增加开发服务器、HTML、HMR 等能力。核心阶段可以理解为：

1. `resolveId`：一个 import specifier 对应哪个模块 ID？
2. `load`：这个 ID 的原始内容是什么？
3. `transform`：内容如何转换成下一个插件可处理的代码？
4. 构建阶段再进入 chunk 和输出生成钩子；
5. 开发期则按每次模块请求调用通用钩子，不生成完整输出 bundle。

插件顺序会影响结果。`enforce: 'pre'/'post'`、hook order 和插件数组位置应有明确理由。多个插件都解析同一 ID 或重复转换代码时，问题往往只在某种 mode / SSR 环境出现。

transform 插件若改写代码必须提供准确 source map，否则浏览器调试、错误上报和后续插件映射都会失真。不要对所有文件做昂贵解析；用 filter 或快速 ID 判断缩小范围。

### 虚拟模块：把构建期信息包装成正常 import

虚拟模块没有直接磁盘文件，由插件 resolve/load 生成。公共 ID 通常采用 `virtual:name`，内部 resolved ID 加 `\0`，避免其他插件把它当普通文件处理。

<<< ../../../examples/frontend/vite-pipeline/plugins/course-manifest.mts

插件的因果链是：

```text
import 'virtual:course-manifest'
  → resolveId 返回 \0virtual:course-manifest
  → load 读取并运行时校验 JSON
  → 返回可执行 ESM
  → manifest 文件变化时失效虚拟模块
```

必须校验 JSON，而不能让 `.d.ts` 假装任意磁盘内容都符合类型。HMR 时重新读取，保证开发期变化沿模块图传播。

虚拟模块适合构建信息、内容索引和代码生成，但会隐藏真实依赖。插件应让输入文件、缓存条件、错误位置和 watch 行为可观察，不要把业务网络请求悄悄塞进 transform。

## 14. 完整应用入口

入口把 client env 校验、虚拟 manifest、资源 URL 和路由动态 import 连接起来：

<<< ../../../examples/frontend/vite-pipeline/src/main.mts

构建期内容数据如下：

<<< ../../../examples/frontend/vite-pipeline/content/course-manifest.json

数据文件不是 TypeScript，所以插件自己承担 schema 校验。类型声明服务于调用方体验，运行时校验服务于真实边界。

## 15. 生产构建为什么仍然需要 bundling

开发期数百或数千个 ESM 请求在本机 HTTP/2 环境尚可接受，生产中深层 import 会增加网络往返、压缩开销和调度成本。生产构建遍历完整入口图并执行：

- 移除不可达或可证明未使用的代码；
- 合并模块并保持 ESM 执行语义；
- 根据动态 import 和共享关系分 chunk；
- 提取/分割 CSS 与静态资源；
- 按 target 转换语法并压缩；
- 为输出文件生成 content hash；
- 重写 HTML、CSS、JS 中的资源引用；
- 可选生成 manifest、source map、license 等元数据。

Vite 8 使用 Rolldown/Oxc 统一演进工具链；旧版本常见描述是开发转译用 esbuild、生产 bundle 用 Rollup。阅读排障文章时先确认文章针对哪个主版本。

### tree shaking 依赖静态语义

tree shaking 不是“自动删除所有没运行的代码”。它依赖静态 ESM import/export、side effects 判断和压缩器分析。以下因素会限制删除：

- CommonJS 动态 exports；
- 模块顶层副作用；
- 包 `sideEffects` 元数据错误；
- 动态属性访问和无法证明的控制流；
- 把整库导入后交给运行时反射。

不要为了追求体积随意给包声明 `sideEffects: false`，这可能删除 CSS import、polyfill 或注册逻辑。库作者要精确标记有副作用的文件，应用作者要用 bundle 分析验证实际产物。

## 16. target 是语法兼容目标，不是完整 polyfill 策略

`build.target` 控制构建工具把哪些现代语法转换到目标浏览器能力。它通常不会自动为缺失的 Web API 注入所有 polyfill。例如目标浏览器没有某个 `Intl` 功能，即使语法能执行，API 仍不存在。

兼容策略应包含：

- 基于产品数据定义 browsers / baseline，而不是“支持所有浏览器”；
- 区分语法转译与运行时 API polyfill；
- 用 feature detection 和可接受降级处理可选能力；
- 需要旧浏览器时评估官方 legacy plugin 及其体积、CSP 和双产物成本；
- 在真实目标浏览器运行 smoke / E2E，而不是只看构建成功。

示例使用 `baseline-widely-available`。这是会随 Vite 版本更新的目标别名；要求可重复、长期固定浏览器矩阵的产品应审慎选择明确 target，并在升级 Vite 时审查变化。

## 17. hash、base 与部署原子性

带内容 hash 的资源可以使用长时间 immutable 缓存，因为内容变化会产生新 URL。HTML 本身通常不能长期 immutable，它负责指向当前一组 hash 资源。

部署失败的常见时序：

```text
先发布新 HTML → 新 chunk 尚未上传 → 用户请求 404
先删除旧 chunk → 旧页面仍在运行 → 动态 import 404
```

更可靠的流程是：

1. 上传新的 hash 资源；
2. 验证资源可读取；
3. 原子切换 HTML / manifest；
4. 保留旧 hash 资源覆盖最长会话与缓存窗口；
5. 延迟清理。

`base` 决定部署在 `/learning/` 等子路径时生成的公共 URL。它不是路由 basename 的自动替代；前端路由器、Service Worker scope、服务器 fallback 和 CDN 路径必须一致。

构建 `manifest.json` 适合由后端模板读取源入口到 hash 文件的映射。manifest 是部署契约，应与对应 assets 一起原子发布，不能混用不同构建版本。

## 18. source map：调试能力与源码暴露之间的取舍

- `sourcemap: true` 生成外部 map 并让产物引用它；
- `'inline'` 把 map 放进产物，通常不适合生产；
- `'hidden'` 生成 map 但不在 bundle 尾部公开引用，适合单独上传错误平台；
- `false` 不生成，线上堆栈可读性下降。

hidden 不会自动保护文件。如果 `.map` 仍被部署到公开静态目录，知道路径的人可能下载。部署流程应在上传监控平台后排除或限制 map，并设置 release / commit 标识确保堆栈使用完全匹配的产物。

source map 还可能包含 `sourcesContent`、源码路径和注释。安全评审应检查真实输出，而不是只看配置值。

## 19. `vite preview` 不是生产服务器

Preview 用于本地检查 `dist` 产物，不能代表生产 CDN / 反向代理：

- TLS、HTTP/2/3、压缩和缓存头不同；
- SPA fallback、子路径、重写和错误页可能不同；
- API 代理、Cookie domain、CORS 和 CSP 不同；
- 多地区 CDN、旧资源保留和原子发布无法复现；
- 安全加固、日志、限流和高可用不是它的职责。

可以把 preview 当作构建产物 smoke test 的一个步骤，不能直接作为生产部署方案。

## 20. 开发与生产差异清单

| 维度 | 开发服务器 | 生产构建/部署 |
| --- | --- | --- |
| 模块 | 浏览器按需请求原生 ESM | 遍历图后 bundle / chunk |
| 依赖 | 预构建并强缓存 | 进入生产依赖图和 chunk |
| 更新 | HMR / full reload | 新构建、新 URL、新部署 |
| env | 启动时读取 | 通常在构建时固化 |
| API | 可使用 server proxy | 需要真实网关或 CORS |
| 资源名 | 接近源码路径 | content hash 和 base |
| source map | 为调试即时提供 | 按安全与监控策略发布 |
| 类型检查 | 不由 transform 完成 | build 同样不会替代 tsc |
| 性能目标 | 启动和单模块更新快 | 下载、缓存、解析、执行最优 |

凡是只在一侧测试的能力，都可能在另一侧暴露问题。最低限度要把 typecheck、生产 build、产物 smoke test 和关键浏览器 E2E 作为独立门禁。

## 21. 性能诊断：先定位阶段，再修改配置

“Vite 很慢”至少可能指：

- 服务器启动慢；
- 首页模块请求瀑布慢；
- 单个模块 transform 慢；
- 文件保存到 HMR 到达慢；
- 生产构建慢；
- 产物在用户浏览器解析/执行慢。

诊断顺序：

1. 用浏览器 Network / Performance 区分网络瀑布与主线程执行；
2. 查看 Vite debug 日志和 transform 时间；
3. 暂时二分禁用插件，寻找昂贵 hook；
4. 检查 barrel file 是否让单个 import 扩散到巨大模块图；
5. 检查文件系统 watch、杀毒软件、网络磁盘和 monorepo 边界；
6. 分析生产 chunk 与 source map，而不是猜 vendor 大小；
7. 在相同 Node、锁文件和冷/热缓存条件下测量。

插件中同步文件 I/O、全项目重复扫描、无 filter 的 AST parse 和每请求网络访问都会破坏按需优势。缓存必须把 mode、环境、插件选项和文件内容纳入 key，否则快但错误。

## 22. 常见反模式及其根因

### “Vite 能跑 TS，所以类型一定正确”

Vite 做单文件转译，不做完整类型检查。把 `tsc --noEmit` / `vue-tsc` 作为独立硬门禁。

### “把密钥写成 `VITE_API_KEY`”

`VITE_` 的含义正是暴露给客户端。真正秘密放服务端，由后端代表浏览器调用受保护服务。

### “本地 proxy 正常，生产也会自动代理”

proxy 属于 dev server。生产拓扑必须在 CDN、网关、BFF 或 CORS 层明确实现。

### “HMR 保留状态，所以无需清理副作用”

旧 listener、timer 和 socket 会累积，形成只在长时间开发会话出现的重复行为。使用 dispose，并测试冷启动。

### “所有资源放 public 最省事”

这会放弃依赖追踪与 hash 缓存，也更容易留下未使用资源。只有确实需要稳定原名和根路径的文件进入 public。

### “手工 vendor chunk 一定缓存更好”

大 vendor 可能因一个依赖更新整体失效，也可能增加首屏无用代码。先观察真实用户路径、变化频率和输出图。

### “构建成功就能部署”

构建不知道 CDN base、历史 fallback、Cookie、CORS、缓存头和旧 chunk 保留是否正确。产物必须在接近生产的环境验证。

## 23. 工程门禁建议

一个可维护的 Vite 应用可以按并行和串行成本安排门禁：

```text
快速反馈：format check + lint + typecheck + unit tests（可并行）
          ↓
生产构建：使用锁定 Node、包管理器与 lockfile
          ↓
产物检查：预算、manifest、source map、敏感字符串、license
          ↓
浏览器验证：preview smoke + 接近生产拓扑的 E2E
          ↓
部署：先 assets、再入口，保留旧 hash，验证后切流
```

不要为了减少 CI 时间把所有检查塞进 Vite transform；职责分离后更容易并行、缓存和定位失败。

## 24. 参考资料

- [Vite：Why Vite](https://vite.dev/guide/why)
- [Vite：Features](https://vite.dev/guide/features)
- [Vite：Dependency Pre-Bundling](https://vite.dev/guide/dep-pre-bundling)
- [Vite：Static Asset Handling](https://vite.dev/guide/assets)
- [Vite：Building for Production](https://vite.dev/guide/build)
- [Vite：Env Variables and Modes](https://vite.dev/guide/env-and-mode)
- [Vite：Plugin API](https://vite.dev/guide/api-plugin)
- [Vite：HMR API](https://vite.dev/guide/api-hmr)
- [Vite：Shared Options](https://vite.dev/config/shared-options)
- [Vite：Build Options](https://vite.dev/config/build-options)
- [Vite：Performance](https://vite.dev/guide/performance)
- [Vite：Troubleshooting](https://vite.dev/guide/troubleshooting)
- [MDN：JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
- [Node.js：Packages](https://nodejs.org/api/packages.html)

## 25. 本节小结

Vite 的速度来自对开发期工作方式的重新划分，而不是跳过工程约束：

- 开发服务器按浏览器请求转换源码模块，依赖则单独预构建；
- bare import、缓存与 linked package 都属于模块解析边界；
- HMR 沿模块图寻找接受边界，副作用和状态必须显式治理；
- Vite 转译 TypeScript，但类型检查必须独立执行；
- env 是构建输入，`VITE_` 变量公开且最初都是字符串；
- dev proxy 不存在于生产，真实网络拓扑必须单独设计；
- 插件通过 resolve/load/transform 参与流水线，虚拟模块仍需运行时 schema；
- 生产构建负责 tree shaking、分块、hash 和引用重写，不能假设与开发逐模块执行完全相同；
- target、source map、base、manifest 和旧资源保留共同构成部署契约；
- 工具内部实现会随 Vite 主版本演进，升级要验证行为和产物，而不是只改配置名。

下一节将继续工程化，系统设计 ESLint、Prettier、TypeScript、Git Hooks 与 CI 质量门禁，重点解释各工具的职责边界、增量反馈和规则治理。
