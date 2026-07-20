---
title: Vite 开发服务器、模块图、插件流水线与生产构建
description: 从浏览器第一次请求开始，理解 Vite 的按需 ESM、依赖预构建、HMR、插件与生产构建边界
outline: deep
---

# Vite 开发服务器、模块图、插件流水线与生产构建

如果只把 Vite 理解成“启动很快的脚手架”，遇到下面的问题时就只能反复改配置：

- 终端已经显示 ready，浏览器首屏为什么还在加载？
- 修改一个文件，为什么有时保留状态，有时整页刷新？
- 本地 `/api` 正常，部署后为什么突然出现 CORS 错误？
- TypeScript 明明写错了，`vite build` 为什么仍可能成功？
- 开发环境能加载模块，生产构建为什么找不到它？

这些现象都源于同一件事：**开发服务器和生产构建要解决的问题不同**。

```text
开发：浏览器需要哪个源码模块，Vite 就解析、转换并返回哪个模块
生产：构建器从入口遍历模块图，再把它优化成可以长期部署的静态产物
```

本节不从配置项清单开始，而是跟随应用的一次冷启动、一次文件修改和一次生产发布，建立完整心智模型。

> 本文按 2026 年 Vite 8 官方文档核对。Vite 8 使用 Rolldown 与 Oxc，旧项目常见的 Rollup、esbuild 以及部分配置名会不同。维护项目时应先看锁文件中的 Vite 主版本；真正值得长期掌握的是请求、模块图、插件和部署之间的因果关系。

## 冷启动：浏览器和开发服务器怎样配合

假设刚执行 `vite`，随后在浏览器访问首页。事情并不是“Vite 先打出一个完整 bundle，再返回页面”。

### 第一站是 `index.html`

普通 Vite SPA 把 HTML 当作入口，而不是一份原样复制的模板：

<<< ../../../examples/frontend/vite-pipeline/index.html

浏览器读到 `<script type="module">` 后，才请求入口模块。Vite 会处理 HTML 中的模块脚本、资源 URL 和可替换常量；生产构建也从这里发现入口。

于是启动链路是：

```text
GET /index.html
  ↓ 浏览器解析 module script
GET /src/main.mts
  ↓ main 又 import 其他模块
GET /src/app-config.ts、/src/route-registry.ts……
```

终端中的 ready 只代表服务器能接收请求，不代表整个项目已完成编译。动态 import 后面的页面甚至可能还没被请求。这就是 Vite 冷启动快的关键：它把源码处理成本从“启动前全部完成”改成了“随浏览器请求按需完成”。

代价也由此产生。若首屏实际依赖几千个细粒度源码模块，浏览器仍会面对请求瀑布、模块转换和主线程执行成本。“无需预先 bundle”不等于“项目规模没有成本”。Vite 也在继续探索适合超大型应用的开发期 bundle 模式。

上层框架可能接管 HTML、SSR 或多个运行环境。使用 Nuxt、React Router framework mode 等框架时，应遵守框架入口契约，不能假设所有请求都直接经过同一份 `index.html`。

### Vite 返回的不是磁盘原文件

当浏览器请求一个 `.ts` 文件时，Vite 至少可能完成：

```text
请求 URL
  → 解析模块 ID
  → 插件读取或生成内容
  → TypeScript / JSX 等语法转换
  → 分析 import 并改写 URL
  → 注入 HMR 代码、组合 source map
  → 返回浏览器可执行的 ESM
```

所以开发服务器更像“按请求运行的模块转换流水线”，而不是静态文件服务器。

### bare import 为什么必须处理

浏览器认识 URL：

```ts
import { format } from './format.js'
import data from '/src/data.js'
```

却不知道 npm 包名应该落到磁盘的哪个文件：

```ts
import { createApp } from 'vue'
```

`'vue'` 这种写法叫 bare import。Vite 要结合包的 `exports`、模块格式、alias、工作区软链接及当前运行环境找到真实模块，再改写成浏览器可请求的 URL。开发者工具中常能看到 `/node_modules/.vite/deps/...` 和版本查询参数。

这不是简单的字符串替换。若 monorepo 中同时解析出两份 Vue 或 React，运行时对象身份就可能不同，引发 Context、Hook、响应式判断等异常。`resolve.dedupe` 可以应急，但更根本的修复通常在 workspace 依赖、`peerDependencies` 和包导出契约中。

## 为什么依赖还要预构建

源码按需提供，不代表依赖也应该原样拆成无数请求。Vite 的 dependency pre-bundling 只发生在开发期，主要解决两个问题。

### 模块格式兼容

浏览器执行 ESM，但生态中仍有 CommonJS 或 UMD 依赖。预构建先把它们转换为适合开发服务器提供的 ESM。

### 浏览器请求数量

某些依赖虽然是 ESM，内部却有数百个文件。若原样提供，一次 import 会展开成数百个 HTTP 请求。预构建可以把这类依赖合并成较少的模块。

```text
经常变化的业务源码 → 按请求转换，方便快速 HMR
相对稳定的第三方依赖 → 预构建并强缓存，减少兼容与请求成本
```

Vite 会扫描源码中的 bare imports 作为预构建入口。若运行到某个分支才发现新的依赖，它可能补做优化并重新加载页面。由插件生成、扫描阶段看不见的 import 就可能遇到这种情况。

### 缓存“没有更新”时怎样判断

文件系统缓存通常位于 `node_modules/.vite`。锁文件、相关配置、补丁和 `NODE_ENV` 等变化会使它失效；浏览器端依赖 URL还使用长期 immutable 缓存。

不要一上来删除整个 `node_modules`。更有效的顺序是：

1. 在 Network 或解析日志中确认 import 最终指向哪个文件；
2. 检查锁文件、软链接和安装布局是否符合预期；
3. 临时禁用浏览器缓存；
4. 用 `vite --force` 强制重新预构建并刷新。

只有默认发现策略确实不够时，再配置 `optimizeDeps.include` 或 `exclude`。体积大、内部模块多、需要 CommonJS 转换且扫描不到的依赖适合 include；小型有效 ESM 才可能适合 exclude。把所有包都手工列出会增加升级成本。

工作区 linked package 通常被当作源码，因此必须能以有效 ESM 被消费。若它只导出 CommonJS，优先修复包；临时方案才是把它加入预构建。

## TypeScript 能运行，不等于类型正确

Vite 为保持单模块转换速度，不会像 `tsc` 那样建立完整类型图。下面代码去掉类型语法后仍是合法 JavaScript，所以 Vite 可能照常转换：

```ts
const count: number = 'not a number'
```

职责应明确分开：

```text
Vite transform / build → 把模块变成可运行或可部署的 JavaScript
tsc --noEmit           → 检查跨文件的静态类型是否成立
vue-tsc                → 额外理解 Vue SFC 模板中的类型
```

开发时可让 IDE 和独立 typecheck watch 进程持续反馈，CI 再执行硬门禁。不要把完整类型检查塞进每次 transform，否则会破坏按需模型；也不要把 `vite build` 成功误当成 typecheck 成功。

单文件转换还鼓励使用可擦除类型语法、`import type`，并让 tsconfig 的模块解析策略与 bundler 保持一致。

## 文件修改：模块图怎样决定 HMR

加载模块时，Vite 不只返回代码，还记录模块之间的 import / importer 关系。可以把它想成一张有方向的图：

```text
main.ts
├── app-config.ts
└── page.ts
    ├── button.ts
    └── api.ts
```

当 `button.ts` 改变，Vite 从该节点沿 importer 向上寻找愿意接受更新的 **HMR boundary**：

```text
changed module → importer → accepting boundary → 局部更新
                         ↘ 一直找不到 → 整页刷新
```

Vue SFC HMR 和 React Fast Refresh 由框架插件建立边界，并规定哪些状态可以保留。修改组件导出形状、顶层副作用或破坏框架约束时，更新范围可能扩大，甚至整页刷新。因此 HMR 是“尽量保持反馈快”的协议，不是“任何状态永远不丢”的保证。

### 手写 HMR 时最容易漏掉副作用

模块旧代码创建的 timer、listener 或 socket 不会因为新代码下载了就自动消失。下面示例明确保存状态并释放旧计时器：

<<< ../../../examples/frontend/vite-pipeline/src/hmr-lifecycle.mts

这里有三个关键动作：

- `accept()` 表示当前模块愿意成为更新边界；
- `dispose()` 在旧模块被替换前清理副作用；
- `hot.data` 只传递明确允许跨版本保留的状态。

ESM import 虽是 live binding，但闭包或第三方库可能早已保存旧对象，所以不能期待 HMR 替换内存中的所有引用。新旧导出不兼容时，应主动 invalidate 或接受整页刷新。

长期 HMR 会话还可能掩盖冷启动 bug。重要流程要定期整页刷新，并在测试中覆盖干净加载。

## 配置文件运行在哪里

`vite.config.*` 在 Node / 工具进程中执行，不在浏览器中执行。它可以读取文件和服务端环境变量；但一旦把值经 `define`、HTML、虚拟模块或 client env 注入前端，这个值就进入了公开产物。

本课配置如下：

<<< ../../../examples/frontend/vite-pipeline/vite.config.mts

配置中的选择都有具体原因：

- 固定端口并启用 `strictPort`，避免 OAuth callback 等外部配置因自动换端口失效；
- 保持文件系统服务边界，不为了方便 import 任意放宽访问；
- `/api` 代理只承担本地开发拓扑；
- `base` 描述静态资源部署前缀；
- manifest 和 content hash 服务于部署；
- staging 使用 hidden source map，但上传与访问控制仍由部署流程负责。

示例使用 Vite 8 的 `build.rolldownOptions`。Vite 7 及更早项目常见 `build.rollupOptions`；升级时要按迁移文档处理，不能只复制新配置名。

### command、mode、`NODE_ENV` 各管什么

三个概念经常被混在一起：

| 概念 | 回答的问题 | 常见值 |
| --- | --- | --- |
| command | 这次执行开发服务还是构建 | `serve`、`build` |
| mode | 加载哪组 mode 配置 | `development`、`production`、`staging` |
| `NODE_ENV` | 当前依赖/代码采用开发还是生产语义 | `development`、`production` |

`vite build --mode staging` 仍是 build command，但 mode 是 staging。mode 不是 `NODE_ENV` 的别名。配置分支越多，开发与生产行为越容易漂移，应只保留运行环境真正需要的差异。

## 环境变量：公开的构建输入

示例 env 文件如下：

<<< ../../../examples/frontend/vite-pipeline/.env.example

Vite 提供 `import.meta.env.MODE`、`BASE_URL`、`DEV`、`PROD` 和 `SSR` 等内建常量。默认只有 `VITE_` 前缀的自定义值暴露给客户端。

“暴露”意味着它会出现在开发响应或生产 JavaScript 中，因此：

- `VITE_` 变量绝不能保存数据库密码、私钥或真正的服务端 API secret；
- env 文件中的数字和布尔值最初也都是字符串；
- `.env.local` 未提交到 Git，并不改变值进入客户端后可被读取的事实；
- shell 中已有变量优先级更高；
- env 在启动时加载，修改文件后要重启服务；
- 避免依赖反向变量展开等其他工具不一定支持的行为。

类型声明改善编辑器体验：

<<< ../../../examples/frontend/vite-pipeline/src/vite-env.d.ts

但 `.d.ts` 只告诉 TypeScript“开发者声称会有这些值”，不能证明部署系统真的提供了它们。真实边界仍需运行时解析：

<<< ../../../examples/frontend/vite-pipeline/src/app-config.ts

这段解析同时完成必填检查、布尔值转换、URL 解析与跨域 HTTPS 约束。不要直接写 `Boolean(import.meta.env.VITE_ENABLE_LABS)`，因为字符串 `'false'` 也是真值。

`import.meta.env` 通常在构建时替换。构建完成后，把同一份 `dist` 搬到另一个环境不会重新读取 env。若产品需要 “build once, deploy many”，可以在启动时请求经过 schema 校验的 `/runtime-config.json`，或由服务器安全注入非秘密配置；同时明确缓存、CSP 和加载失败策略。

## dev proxy 为什么会掩盖生产问题

本地开发时：

```text
浏览器请求 http://localhost:5173/api/courses
  → Vite dev server 转发到 http://127.0.0.1:8080
```

对浏览器而言，请求仍发往页面同源，所以不会经历跨域 CORS 流程。生产部署到 CDN 后没有 Vite dev server，代理也就不存在。

生产必须另行选择：同源网关转发 `/api`，或让浏览器访问独立 API origin 并正确处理 CORS、Cookie 和 CSRF，也可以使用 BFF/edge 层。至少一个集成环境应使用接近生产的域名、TLS、Cookie 与反向代理拓扑。

`changeOrigin: true` 会改变转发请求的 Host 语义；若后端用 Host 做路由或安全判断，需要共同约定。代理目标只能来自受控服务端配置，不能由浏览器请求决定，否则可能形成开放代理或 SSRF 边界。

## 静态资源也分两条路

从源码 import 的资源会进入模块图：

<<< ../../../examples/frontend/vite-pipeline/src/asset-urls.ts

<<< ../../../examples/frontend/vite-pipeline/src/assets/course-cover.svg

这样 Vite 能追踪引用、生成 content hash、更新 URL，并在资源删除时尽早发现悬空引用。`new URL('./asset.svg', import.meta.url)` 还是原生 ESM 模式，但路径需足够静态，构建器才能发现目标。SSR 中服务器模块 URL 不等于客户端 host，应使用框架的资源 API 或 manifest。

`public` 目录则是原样复制：

<<< ../../../examples/frontend/vite-pipeline/public/robots.txt

它适合 `robots.txt`、必须保持固定文件名或完全不被源码 import 的文件。源码引用时写 `/robots.txt`，不是 `/public/robots.txt`。稳定文件名也意味着缓存失效要自行管理。

一般资源优先进入模块图；只有确实需要固定名字和根路径时才放 public。`?url`、`?raw`、`?inline`、`?worker` 等 query 会改变模块含义，编写跨 bundler 的库时要避免把应用专属约定泄漏给消费者。

## 动态 import：延后成本，也延后失败

静态 import 会进入当前加载链路，动态 import 则通常成为异步 chunk 边界。大型编辑器不一定是首页必需，因此可以在用户进入时再加载。

不要把外部输入直接拼进路径：

```ts
// 构建器无法可靠枚举目标，用户输入还参与了模块选择。
await import(userControlledPath)
```

有限映射既便于静态分析，也建立输入白名单：

<<< ../../../examples/frontend/vite-pipeline/src/route-registry.ts

<<< ../../../examples/frontend/vite-pipeline/src/pages/catalog-page.ts

<<< ../../../examples/frontend/vite-pipeline/src/pages/editor-page.ts

代码分割不是越细越好。它在首屏下载量、请求数量、共享依赖和缓存稳定性之间取舍。低频且体积大的页面适合异步；首屏必需代码切得太碎反而增加等待。

动态加载还引入运行时失败：用户打开旧页面后，部署可能已删除它将要请求的旧 chunk。应用应提供刷新或恢复提示，部署则要先上传新 hash 资源、切换入口，并保留旧资源覆盖最长会话窗口。

手工分 vendor chunk 前先分析真实产物。错误的 manual chunks 可能扩大缓存失效范围、复制共享依赖或改变执行顺序。

## 插件：进入 Vite 流水线的正规入口

插件最重要的三个阶段可以用三个问题理解：

```text
resolveId：这个 import 指向哪个模块 ID？
load：     这个 ID 的原始内容从哪里来？
transform：内容如何转换成下一阶段可理解的代码？
```

开发时，这些钩子随着浏览器的模块请求执行；构建时，它们参与完整模块图遍历，随后还有 chunk 和输出钩子。插件能同时支持两侧，不代表两侧触发次数和上下文完全相同。

插件顺序、`enforce: 'pre'/'post'` 和 hook order 都会影响结果。transform 改写代码时应提供准确 source map；昂贵解析要用 filter 或 ID 判断缩小范围。每个请求都同步读全项目或访问网络，会直接破坏按需转换优势。

### 用虚拟模块理解 resolve 和 load

虚拟模块没有对应的源代码文件，由插件生成。调用方仍像普通模块一样 import：

```ts
import manifest from 'virtual:course-manifest'
```

公共 ID 使用可读名字，插件内部 resolved ID 加 `\0`，避免其他插件把它当作普通磁盘文件。完整插件如下：

<<< ../../../examples/frontend/vite-pipeline/plugins/course-manifest.mts

它的执行链是：

```text
import 'virtual:course-manifest'
  → resolveId 返回 \0virtual:course-manifest
  → load 读取并校验 JSON
  → 返回可执行 ESM
  → JSON 变化时使虚拟模块失效并重新 load
```

这里有几处容易被简化掉但很重要的工程细节：

- 输入路径相对 Vite 的 resolved root，而不是依赖启动命令的当前目录；
- `addWatchFile` 显式声明 readFile 背后的依赖；
- JSON 在运行时校验，不能让 `.d.ts` 假装磁盘内容一定正确；
- HMR 使虚拟模块失效，变化才能沿模块图传播。

虚拟模块适合内容索引、构建元信息和代码生成，但会隐藏真实依赖。插件应让输入文件、缓存条件、watch 行为和错误位置可观察，不要在 transform 中悄悄发业务网络请求。

应用入口最终把配置、资产、虚拟模块和异步路由连在一起：

<<< ../../../examples/frontend/vite-pipeline/src/main.mts

插件读取的原始数据是：

<<< ../../../examples/frontend/vite-pipeline/content/course-manifest.json

## 生产构建为何仍然要 bundle

开发期将工作分散到请求阶段，目标是快速启动与更新；生产面对真实网络、长期缓存和大量用户，深层 ESM 请求会增加往返、压缩和调度成本。

生产构建从 HTML/JS 入口遍历完整模块图，并完成：

- 删除不可达或可证明未使用的代码；
- 合并模块并保持 ESM 执行语义；
- 根据动态 import 和共享关系划分 chunk；
- 处理 CSS 与静态资源；
- 按 target 转换语法并压缩；
- 生成 content hash，重写 HTML、CSS、JS 引用；
- 按需生成 manifest、source map 等部署元数据。

### tree shaking 为什么不是万能删除

tree shaking 依赖静态 ESM import/export、副作用信息和压缩器证明。CommonJS 动态导出、模块顶层副作用、动态属性访问及错误的包元数据都会限制或破坏删除。

库作者不能为了体积随意声明 `sideEffects: false`，否则 CSS import、polyfill 或注册逻辑可能被移除。应用作者也不应只凭源码目录猜体积，要分析实际 chunk。

### target 只解决语法兼容的一部分

`build.target` 控制哪些语法要降级，并不自动补齐所有缺失 Web API。旧浏览器即使能解析代码，也可能没有所需的 `Intl`、URL 或其他能力。

兼容策略需要同时回答：

- 产品到底支持哪些浏览器；
- 哪些问题是语法转换，哪些需要 runtime polyfill；
- 可选能力能否 feature detection 后降级；
- 是否值得承担 legacy 双产物、体积与 CSP 成本；
- 是否在真实目标浏览器执行 smoke/E2E。

示例使用 `baseline-widely-available`。它会随 Vite 版本更新基准；需要多年可重复浏览器矩阵的产品应锁定明确 target，并在升级工具链时审查变化。

## 发布的是一组相互匹配的文件

content hash 让资源可以长期 immutable 缓存，因为内容变化会产生新 URL。HTML 通常不能长期 immutable，它负责指向当前版本的 hash 文件。

错误发布顺序会造成两类 404：

```text
先发布新 HTML，但新 chunk 未上传 → 新访问立刻失败
先删除旧 chunk，但旧页面仍在运行 → 后续动态 import 失败
```

更可靠的顺序是：

1. 上传新 hash 资源；
2. 验证资源可读取；
3. 原子切换 HTML / manifest；
4. 保留旧 hash 资源覆盖最长会话和缓存窗口；
5. 延迟清理。

`base` 决定 `/learning/` 等子路径下生成的公共资源 URL，但不会自动配置前端路由 basename、Service Worker scope、服务器 fallback 或 CDN 重写。它们必须使用一致的部署契约。

manifest 是源码入口到 hash 产物的映射，应和同一次构建的 assets 一起发布，不能混用版本。

### source map 的边界

- `true`：生成外部 map，产物会引用它；
- `'inline'`：map 内嵌进产物，通常不适合生产；
- `'hidden'`：生成 map，但 bundle 不公开引用；
- `false`：不生成，线上错误栈更难还原。

hidden 不等于安全。如果 `.map` 仍被上传到公开目录，知道路径的人仍可下载。部署应先将 map 上传错误监控平台，绑定准确 release/commit，再从公共静态产物中排除或限制访问。还要检查 `sourcesContent`、源码路径和注释是否包含敏感信息。

### `vite preview` 只能做什么

Preview 适合本地确认 `dist` 能否加载，却不是生产服务器。它无法代表真实 TLS、HTTP/2/3、CDN 缓存、压缩、历史 fallback、CORS、Cookie、安全响应头、多地区发布和旧资源保留。

因此 preview smoke test 有价值，但不能替代接近生产拓扑的验证，更不能直接承担生产高可用服务。

## 把开发与生产放在一起检查

| 维度 | 开发服务器 | 生产构建与部署 |
| --- | --- | --- |
| 源码模块 | 浏览器按需请求 ESM | 遍历后合并与分 chunk |
| 依赖 | 预构建并强缓存 | 进入生产依赖图 |
| 更新 | HMR 或 full reload | 新构建、新 URL、新发布 |
| env | 启动时读取 | 通常在构建时固化 |
| API | 可用 dev proxy | 需要真实网关或 CORS |
| 资源 | 接近源码路径 | content hash 与 base |
| 类型 | transform 不检查 | build 也不替代 typecheck |
| 性能目标 | 快速启动与单模块更新 | 下载、缓存、解析、执行 |

一套实用门禁可以是：

```text
format / lint / typecheck / unit test（可并行）
  → production build
  → 检查体积、manifest、source map、敏感字符串
  → preview smoke test
  → 接近生产网络拓扑的浏览器 E2E
  → 先 assets 后入口的原子发布
```

类型检查、测试和构建分开后，更容易并行、缓存和定位失败，不必把所有职责塞进 Vite 插件。

## 排查慢或不一致时，先定位阶段

“Vite 很慢”可能分别指启动、首屏请求瀑布、单模块 transform、HMR 传播、生产构建或用户浏览器执行。先明确阶段，再修改配置：

1. 用 Network 和 Performance 区分请求等待、转换与主线程执行；
2. 查看 Vite debug 信息和 transform 耗时；
3. 二分禁用插件，寻找昂贵 hook；
4. 检查 barrel file 是否让一次 import 扩散到巨大模块图；
5. 检查网络磁盘、文件 watch、杀毒软件与 monorepo 边界；
6. 分析生产 chunk 与 source map，而不是猜 vendor 大小；
7. 在相同 Node、锁文件和冷热缓存条件下比较。

插件中的同步 I/O、每次全项目扫描、无 filter 的 AST 解析和逐请求网络访问都值得优先检查。缓存 key 则必须包含 mode、环境、插件选项和输入内容，否则得到的只是“很快的错误结果”。

遇到问题时可以用这组因果问题代替试配置：

- 浏览器请求了哪个 URL，Vite 把它解析成哪个模块 ID？
- 模块来自磁盘、虚拟 load，还是某个 transform 的输出？
- 依赖处于开发预构建缓存还是源码模块图？
- 文件变化后，HMR 沿哪些 importer 找边界？
- 某个值来自服务端配置、构建时 env，还是运行时配置？
- 问题属于开发请求流水线，还是生产构建/部署流水线？

## 小结

Vite 的“快”不是跳过工作，而是重新安排工作：业务源码在开发期按需转换，稳定依赖先预构建；文件变化则沿模块图寻找 HMR 边界。配置文件运行在工具环境，客户端 env 一旦暴露就是公开构建输入，dev proxy 也只存在于本地。

生产构建需要把完整模块图变成适合网络传输和长期缓存的 chunk、hash 与 manifest。最终是否可靠，还取决于 target、source map、`base`、旧资源保留和发布顺序。这些边界连起来之后，“开发能跑而生产失败”就不再是神秘的工具问题，而是可以逐阶段定位的工程问题。

## 参考资料

- [Vite：Why Vite](https://vite.dev/guide/why)
- [Vite：Features](https://vite.dev/guide/features)
- [Vite：Dependency Pre-Bundling](https://vite.dev/guide/dep-pre-bundling)
- [Vite：Static Asset Handling](https://vite.dev/guide/assets)
- [Vite：Building for Production](https://vite.dev/guide/build)
- [Vite：Env Variables and Modes](https://vite.dev/guide/env-and-mode)
- [Vite：Plugin API](https://vite.dev/guide/api-plugin)
- [Vite：HMR API](https://vite.dev/guide/api-hmr)
- [Vite：Build Options](https://vite.dev/config/build-options)
- [Vite：Performance](https://vite.dev/guide/performance)
- [MDN：JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)

下一节：[代码质量：ESLint、Prettier、TypeScript、Git Hooks 与 CI 门禁](./code-quality-eslint-prettier-typescript-git-hooks-and-ci-gates.md)
