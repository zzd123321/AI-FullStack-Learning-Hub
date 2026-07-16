---
title: 前端包管理、模块发布、Monorepo 与依赖治理
description: 系统掌握依赖声明、lockfile、ESM、exports、类型发布、Tree Shaking、工作区任务图、缓存、SemVer、发布流水线与供应链安全
---

# 前端包管理、模块发布、Monorepo 与依赖治理

`npm install` 成功只说明包管理器找到了一棵可安装依赖树，不代表运行时一定能解析模块、打包器一定能摇树、类型声明一定能找到、多个框架实例一定兼容，也不代表发布包只包含预期文件。

本课把“依赖管理”拆成几个不同问题：manifest 声明允许的版本与运行关系，lockfile 固定一次解析结果，Node/浏览器/打包器解析模块入口，workspace 连接本地包，任务图安排构建，发布流程把源码变成稳定公共契约，安全治理再约束来源、脚本、权限和可追溯性。

## 学习目标

- 区分 package manifest、lockfile、安装树、模块图与任务图；
- 正确选择 dependencies、devDependencies、peerDependencies 和 optionalDependencies；
- 理解 SemVer range、lockfile 与可复现安装的关系；
- 用 ESM、`type`、`exports` 和 subpath 定义公共模块契约；
- 正确发布 JavaScript、类型声明、CSS 与 source map；
- 理解 Tree Shaking、side effects、external 与双模块风险；
- 设计 workspace、内部依赖协议与 TypeScript project references；
- 用有向无环任务图实现 affected build 和可靠缓存；
- 设计独立/统一版本、变更集、预发布与回滚策略；
- 建立最小权限发布、provenance、依赖审计与供应链响应。

## 一、先区分五张图

```text
Package graph：workspace 中包之间的声明依赖
Resolution graph：包管理器按版本范围解析出的具体版本树
Module graph：某个入口的 import/require 动态与静态引用
Task graph：build/test/lint 等任务及其先后依赖
Release graph：一次变更影响哪些包、版本和消费者
```

它们相关但不等价。A 包依赖 B，不意味着 A 的每个页面 bundle 都导入 B；build 依赖 types，也不意味着发布版本必须一起升级。排障前先问自己观察的是哪张图。

## 二、应用与库的依赖目标不同

应用拥有最终部署和完整依赖树，可以固定框架、打包器与运行环境。库要在未知消费者环境中运行，必须把公共入口、宿主兼容范围、side effects、类型和运行时外部依赖写清楚。

应用通常不发布到 registry，应设 `private:true` 防误发。库则需要 name/version/license/files/exports/repository 等发布契约，并在真实消费者项目验证。

## 三、package.json 是声明，不是安装快照

manifest 的版本范围表达“这个项目接受哪些版本”，还描述脚本、模块类型、入口、发布文件和平台要求。它不能记录一次安装中每个传递依赖最终选了哪个版本。

同一个 `^1.2.0` 在不同日期可能解析到不同 patch/minor；registry 元数据、平台和包管理器版本也会影响结果。不要只复制 package.json 后声称环境可复现。

## 四、lockfile 固定解析结果

lockfile 记录足够信息，让后续安装重建相同依赖树并校验完整性。应用和 workspace 通常应提交 lockfile；发布库的消费者不会继承你的 lockfile，而会把库放入自己的解析图。

lockfile 冲突不要整文件删除再生成。那会把大量无关升级混入业务 PR。使用同一包管理器版本、重放目标变更并审查解析差异。

## 五、本地安装与 CI 安装

开发安装允许修改 manifest/lockfile；CI 应使用 frozen/clean install，例如 npm 的 `npm ci`，当声明与 lockfile 不一致时失败，并从干净安装树开始。

缓存包管理器的内容寻址 store 与缓存整个 `node_modules` 风险不同。缓存键至少包含 lockfile、包管理器版本、Node 版本、平台/架构和相关配置。

## 六、dependencies 是消费者运行需要

包被安装和执行时必须存在、并且应由这个包拥有版本的依赖放在 dependencies。不要因为源码 `import` 过就机械放这里：构建期插件、测试框架和类型工具通常不是消费者运行依赖。

前端应用中 dependencies 与 devDependencies 是否进入生产 bundle 由模块图和构建决定，不由字段名字直接决定；字段仍影响生产安装、审计与库消费者。

## 七、devDependencies 支撑开发与构建

编译器、lint、测试、构建器和本包测试用的宿主框架通常属于 devDependencies。发布产物必须已包含可消费 JS/声明，不能要求消费者安装你的 TypeScript 才能运行。

库可能同时把 Vue 放在 peerDependencies 与 devDependencies：peer 表达消费者兼容契约，dev 让本仓库能够构建和测试。这不是错误重复。

## 八、peerDependencies 表达宿主兼容

插件、框架适配器和 UI 库常要求与消费者共享同一个 Vue/React 实例。把宿主放 dependencies 可能安装第二份实例，造成 context、hook、symbol 或响应系统身份不一致。

peer range 应覆盖实际测试过的兼容版本，不锁死到单个 patch。现代 npm 会自动处理 peer，但冲突仍可能让解析失败；这正是在暴露不可能同时满足的宿主契约。

## 九、可选依赖有两种含义

optionalDependencies 表示安装失败仍可继续，适合平台加速器等真正可选运行能力。peerDependenciesMeta optional 表示消费者不必安装某个宿主集成；一旦使用该入口，代码仍需提供清晰错误或独立 subpath。

不要 catch 所有 import 错误假装可选，否则包损坏与网络问题会被吞掉。能力检测、fallback 与可观测性要明确。

## 十、版本范围不是越宽越好

精确版本限制更新，`~` 通常接受 patch，`^` 在主要版本语义下接受向后兼容更新，`*`/`latest` 几乎放弃约束。0.x 的 caret 行为与 1.x 不同，不能凭记忆推断。

库要兼顾兼容覆盖和真实测试矩阵；应用可通过自动更新与 lockfile 控制节奏。Git/URL/file 依赖难审计、缓存和重建，生产使用需要明确例外。

## 十一、依赖策略可以代码化

<<< ../../../examples/frontend/package-monorepo-dependency-governance/dependency-policy.ts

示例从未知程度较高的 manifest 结构检查公共包契约、危险范围、字段冲突和禁止进入 runtime 的工具。真实治理还会检查许可证、owner、deprecated、来源、年龄、允许 registry、脚本和漏洞豁免。

策略要返回可解释错误，不只给一个失败 exit code。每条例外包含包、版本、风险、owner、到期时间和移除计划。

## 十二、overrides/resolutions 是临时手术

根项目可强制传递依赖版本以处理漏洞或兼容问题，但它改变上游作者声明的解析结果，可能组合出未经测试的版本。先验证修复和回归，再记录原因与退出条件。

发布库不能假定消费者会继承自己的根 overrides。长期修复应推动直接依赖升级或上游发布兼容版本。

## 十三、ESM 与 CommonJS 是加载语义

ESM 有静态 import/export、URL 风格解析和 live bindings；CommonJS 以 require/module.exports 为核心。它们不只是两种输出语法，缓存、执行顺序、顶层 await 和互操作也不同。

Node 建议包作者显式声明 `type`。`.mjs` 永远按 ESM，`.cjs` 永远按 CommonJS；相对 ESM specifier 在 Node 中通常要写完整扩展名。不要依赖模糊语法探测。

## 十四、exports 是公共 API 防火墙

`main` 只能表达主入口；`exports` 可以定义主入口、subpath 和条件，并封锁未声明的深层路径。消费者只能依赖公开 surface，包作者才有空间重构内部文件。

给已有包新增 exports 可能让旧 deep import 立即失败，是潜在 breaking change。迁移前审计真实消费者并临时导出兼容 subpath。

## 十五、一个完整包契约

<<< ../../../examples/frontend/package-monorepo-dependency-governance/package-contract.json

示例显式声明 ESM、发布 allowlist、根/框架/CSS subpath、类型、side effects、peer、engine、license 和 publish 设置。版本只是教学样例，真实项目由支持矩阵统一管理。

`files` 是 npm tarball allowlist；还需用 `npm pack --dry-run`/实际 tarball 检查，因为 README、LICENSE、package.json 和 ignore 规则有特殊行为。

## 十六、条件导出的顺序和环境

条件对象按键顺序从具体到通用匹配，常见条件有 `import`、`require`、`node`、`browser`、`default`，工具还可能识别 `types`。不要发明消费者不认识的条件后假设会选中。

不同条件最好保持等价公共 API。若 browser 与 node 导出不同函数，类型文件和测试矩阵必须反映差异，否则同一 import 在 SSR/CSR 得到不同行为。

## 十七、Subpath 优于万能主入口

`@scope/pkg/vue`、`@scope/pkg/react`、`@scope/pkg/styles.css` 让能力和可选依赖边界清晰，也减少主入口导入所有适配器。公开路径一旦发布就是长期 API。

谨慎使用 `./*` 通配导出，它可能意外把内部目录变成承诺。显式 subpath 更容易文档化、测试和做 SemVer 判断。

## 十八、类型声明也是发布 API

`.d.ts` 会暴露泛型、条件类型、模块 specifier 与第三方类型。源码能编译不代表消费者在自己的 moduleResolution、strict 和 lib 配置下能使用。

发布前在打包 tarball 上建立 type consumer tests，并至少验证支持的 TypeScript 下限。声明中引用的外部类型必须可解析；不要把 dev-only 私有路径泄漏进去。

## 十九、TypeScript 构建配置

<<< ../../../examples/frontend/package-monorepo-dependency-governance/tsconfig.library.json

示例为库生成 declaration/declarationMap，启用 strict、composite 与明确 root/out。`moduleResolution:Bundler` 适合由打包器处理的前端库；直接在 Node 运行的产物应验证 NodeNext 等真实解析语义。

`skipLibCheck:false` 能在库作者侧更早发现声明冲突，但大型应用可能为性能做不同选择。不要用它掩盖自己产出的无效 `.d.ts`。

## 二十、Project References 建模编译边界

composite project 产生可被下游引用的声明和构建信息，`tsc -b` 按引用图增量构建。它解决 TypeScript 项目边界，不自动决定 npm 发布、运行时 bundle 或任务缓存。

引用图应与允许的包依赖方向一致。通过 path alias 直接穿越到另一个包 `src` 会绕开 exports 和发布产物，造成本地正常、消费失败。

## 二十一、Tree Shaking 依赖静态可分析性

打包器从静态 ESM 引用判断未使用导出，但 dynamic access、CommonJS、top-level side effect 和工具配置会限制结果。`export *` 不必然有罪，关键是模块是否静态且无意外执行。

`sideEffects:false` 是作者承诺模块顶层执行可安全删除，不是性能开关。CSS import、polyfill、custom element registration 和全局初始化通常有副作用，需列入 allowlist。

## 二十二、Bundle 与 external 是产品边界

把依赖 bundle 进库可简化单文件消费，却复制代码、许可证和漏洞，并可能产生多份框架。External 让消费者解析依赖，但要求正确声明和文档。

一般把 peer external；普通 runtime dependency 是否 bundle 取决于部署形态、大小、实例身份和平台。用 tarball consumer bundle 分析验证，不凭字段猜测。

## 二十三、Vite Library Mode

<<< ../../../examples/frontend/package-monorepo-dependency-governance/vite.library.config.mjs

示例构建 ESM 多入口、external Vue、稳定入口名和 source map。Vite library mode 适合浏览器库；复杂非浏览器库或高度定制输出需要评估更底层工具。

Vite 不替 TypeScript 生成完整类型契约，通常把 JS bundle 与 declaration build 分开。最终 exports 必须与真实 dist 文件逐项一致。

## 二十四、CSS 与资产发布

库导入 CSS 时构建可能生成独立文件，应通过明确 subpath 导出，并说明消费者是否必须导入。CSS Modules 的 hash、字体 URL、图片 base 和 public path 在消费者构建中要验证。

不要在 JS import 中偷偷注入全局 reset，除非这是明确产品契约。样式包同样需要 layer、token、浏览器基线和 breaking change 策略。

## 二十五、双模块包风险

同一逻辑同时提供 import 与 require 条件时，消费者可能在同一进程加载两份实例，单例、class identity 和缓存状态分裂。ESM/CJS 互操作还可能改变 default/named export 形态。

能只发 ESM时保持单一语义；必须双发时使用一致 wrapper/state 策略，并在 Node、bundler、SSR、require/import 混用下测试，不能只检查文件存在。

## 二十六、Workspace 只解决本地联接

npm/pnpm workspaces 让多个 package 共享安装和命令。Monorepo 的价值是原子变更、统一治理和可见依赖，不是目录越多越先进。

包边界错误时，Monorepo 会让深层 import 和循环依赖更容易发生。必须结合 exports、lint boundary、owner 和发布测试。

## 二十七、pnpm workspace 配置

<<< ../../../examples/frontend/package-monorepo-dependency-governance/pnpm-workspace.yaml

示例声明 workspace 范围、共享 catalog、单 lockfile 与禁止循环。Catalog 统一常用版本声明，但升级仍需兼容测试；统一文本版本不保证运行时只有一个实例。

pnpm 的严格链接模型帮助暴露幽灵依赖：包只能使用自己声明的依赖。不要通过 hoist 配置长期掩盖漏声明。

## 二十八、workspace: 协议

内部依赖使用 `workspace:` 可要求只能解析本地包，避免版本不匹配时悄悄从 registry 下载。发布/pack 时包管理器会按协议转换为普通版本范围。

选择 `workspace:*`、`workspace:^` 或精确策略要与独立/统一版本方案一致。发布前检查转换后的 tarball manifest，而不是只看源码 package.json。

## 二十九、任务必须形成 DAG

build 可能依赖上游 build，test 可能只依赖本包 types 或 build。循环任务意味着无法定义稳定先后，通常暴露包边界或初始化问题。

<<< ../../../examples/frontend/package-monorepo-dependency-governance/workspace-graph.ts

示例验证缺失节点和循环并给出拓扑顺序。任务 ID 要包含 package 和 task，例如 `@learning/ui#build`，避免跨包重名。

## 三十、缓存键必须覆盖真实输入

可靠缓存键包含源码、配置、环境变量白名单、工具版本、lockfile 片段和所有上游产物键；输出列表决定恢复内容。漏一个输入就会命中错误结果。

时间、绝对路径、机器随机值和不稳定文件顺序会破坏可重复构建。远端缓存涉及源码/产物泄漏、租户隔离和访问撤销，不能默认公开共享。

## 三十一、Affected Build 的边界

变更一个包时，受影响集合通常是该包及其反向依赖，再按任务规则传播。全局 tsconfig、lockfile、构建镜像和共享工具可能让所有包失效。

只看 Git 文件路径会漏掉隐式依赖。把全局输入、生成代码、环境和包图显式建模，定期用 clean full build 校验增量系统没有漂移。

## 三十二、SemVer 是消费者契约

Patch 表示向后兼容修复，minor 表示向后兼容能力，major 表示 breaking change。类型收窄、CSS selector/token 变化、exports 移除、默认行为和最低运行环境提升都可能 breaking，不只函数签名删除。

0.x 不等于可以随意破坏；团队要写清预稳定版本承诺。SemVer 只有在公共 API 被定义和测试时才有意义。

## 三十三、发布计划传播

<<< ../../../examples/frontend/package-monorepo-dependency-governance/release-plan.ts

示例把显式 bump 沿内部反向依赖传播，并检测未知包。真实工具还要判断依赖 range 是否需要更新、peer 兼容、fixed group、prerelease 和 changelog。

传播应计算到稳定点。若 tokens 更新导致 ui patch，app 又依赖 ui，则 app 也需要重新验证或发布，而不是只处理一层。

## 三十四、统一版本与独立版本

统一版本便于理解兼容矩阵，但无关包频繁发布；独立版本减少噪声，却增加内部范围和 release graph 复杂度。可按紧耦合产品组 fixed group，而非全仓一刀切。

应用部署版本与库 SemVer 可以分开。内部从不发布的 app 不必为了每次部署修改 npm version，但需要可追溯 build/release ID。

## 三十五、变更集与预发布

开发者在 PR 中记录受影响包、bump 类型和面向消费者的说明；合并后自动聚合版本与 changelog。机器可建议 bump，最终 breaking 判断仍需要 owner 审核。

预发布用 prerelease version 和独立 dist-tag，避免把未验证版本设为 latest。验证 tarball、registry 安装和真实 consumer 后再推广。

## 三十六、发布流水线

典型流程：clean install → lint/type/test → build → API/size/license 检查 → pack → 在临时消费者安装 tarball → 核对内容/exports/types → 计算版本 → 发布 → 验证 registry → 创建 tag/release notes。

构建一次并发布同一不可变产物，不在不同 job 重新构建。npm 包版本通常不可覆盖；坏版本应 deprecate 并发布修复版，不能假设 registry 是可变文件服务器。

## 三十七、最小权限与 provenance

发布优先使用 OIDC trusted publishing/短期身份，而不是长期 npm token。环境保护、review、受保护 tag/branch 和 registry 2FA 限制谁能发包。

Provenance 连接 registry 包、源码和受支持 CI 构建信息，提高可追溯性，但不证明代码无恶意。仍需 review、隔离构建、依赖治理和产物检查。

## 三十八、供应链治理

威胁包括 typosquatting、账号接管、恶意维护者、install script、依赖混淆、token 泄漏和被篡改 runner。新依赖评估维护状态、owner、权限、体积、许可证、脚本、传递树和替代方案。

漏洞扫描是信号，不是自动修复按钮。按可达性、运行环境和利用条件分级；自动 major force fix 可能引入更严重回归。保留 SBOM、lockfile、构建来源和事故响应流程。

## 三十九、测试与门禁

纯逻辑测试覆盖 manifest 策略、任务图、循环、缓存材料与发布传播：

<<< ../../../examples/frontend/package-monorepo-dependency-governance/governance.test.mts

发布包还需测试：pack 文件 allowlist、每个 exports 条件/subpath、Node import/require（若支持）、浏览器 bundler、SSR、类型下限、CSS/asset、Tree Shaking、peer 缺失/冲突、不同包管理器和干净 consumer。

## 四十、常见失败模式与上线清单

常见失败包括：把 package graph 当 bundle graph；不提交 lockfile；CI 使用可变安装；所有 import 都放 dependencies；框架适配器自带第二份框架；peer range 锁死 patch；长期依赖 latest/Git URL；overrides 无退出计划；package 不声明 type；消费者 deep import 内部文件；新增 exports 不当 breaking；声明引用 src/private 类型；sideEffects:false 删除 CSS；把 peer bundle 进库；只在 Monorepo 源码联调、不测 tarball；path alias 穿透包边界；任务图漏隐式输入；远程缓存泄漏；版本只看函数签名；长期 token 发包；audit force 自动升级。

上线前确认：

- [ ] package、resolution、module、task 和 release graph 已分别建模；
- [ ] app/library/private/public 身份明确；
- [ ] manifest range 与 lockfile 职责明确，CI 使用 frozen clean install；
- [ ] dependencies/dev/peer/optional 按所有权和运行关系分类；
- [ ] peer 兼容矩阵经过真实宿主版本测试；
- [ ] override、漏洞和许可证例外有 owner 与到期时间；
- [ ] package 显式声明模块类型，不依赖模糊探测；
- [ ] exports/subpath/conditions 定义并测试全部公共入口；
- [ ] files allowlist 与实际 tarball 内容一致；
- [ ] JS、`.d.ts`、CSS、assets 和 source map 路径可消费；
- [ ] declaration 未泄漏源码、私有 alias 或缺失类型依赖；
- [ ] Tree Shaking/sideEffects 承诺经过 consumer bundle 验证；
- [ ] peer 被 external，双 ESM/CJS 情况有实例一致性测试；
- [ ] workspace 内部依赖显式声明并禁止循环/幽灵依赖；
- [ ] TypeScript references、package graph 与允许边界一致；
- [ ] task graph 为 DAG，缓存键覆盖全部输入与上游产物；
- [ ] affected build 定期与 clean full build 对照；
- [ ] SemVer 同时覆盖运行时、类型、CSS、exports 和环境要求；
- [ ] 变更集、版本传播、预发布和 dist-tag 流程明确；
- [ ] 发布基于验证过的同一不可变 tarball；
- [ ] trusted publishing/provenance/2FA 和环境保护启用；
- [ ] 依赖引入、install script、SBOM、漏洞和事故响应受治理。

## 总结

包治理的核心是把隐含关系变成可验证契约：manifest 描述允许范围与角色，lockfile固定解析结果，exports 限定公共模块面，类型和 CSS 与 JavaScript 一起成为发布 API，workspace 连接本地包但不取代边界，任务 DAG 与完整缓存键保证增量构建可信，release graph 和 SemVer 向消费者解释变化，最小权限与 provenance 让发布可追溯。工具可以自动执行规则，但团队必须先定义什么是正确的依赖、构建和兼容关系。

## 参考资料

- [Node.js：Modules—Packages](https://nodejs.org/api/packages.html)
- [npm Docs：package.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/)
- [npm Docs：package-lock.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/)
- [npm Docs：npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/)
- [npm Docs：Workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces/)
- [npm Docs：Semantic Versioning](https://docs.npmjs.com/about-semantic-versioning/)
- [npm Docs：Generating provenance statements](https://docs.npmjs.com/generating-provenance-statements/)
- [npm Docs：npm audit](https://docs.npmjs.com/cli/v11/commands/npm-audit/)
- [pnpm：Workspace](https://pnpm.io/workspaces)
- [pnpm：Catalogs](https://pnpm.io/catalogs)
- [TypeScript：Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [Vite：Building for Production—Library Mode](https://vite.dev/guide/build.html#library-mode)
