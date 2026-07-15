---
title: 大型前端架构：模块边界、领域分层与微前端
description: 从变化成本和依赖方向出发，设计可执行的 Feature 边界、Ports 与 Adapters、Monorepo 包契约、跨应用通信和微前端治理
---

# 大型前端架构：模块边界、领域分层与微前端

小型项目里，组件之间直接 import、共享一个 Store、在页面中调用 HTTP 往往足够快。随着业务和团队增长，同样的便利会逐渐变成系统性成本：

- 修改一个课程字段，要同时改接口类型、Store、多个页面和公共组件；
- 所有 Feature 都能 import 任意内部文件，重构时无法知道真实影响范围；
- `shared/` 变成没有业务所有者的巨型杂物间；
- “解耦”后的事件总线让因果关系更难追踪；
- Monorepo 只有一个仓库，却没有真正的模块边界；
- 为了独立开发引入微前端，最终把编译期问题变成线上网络、版本和安全问题。

大型前端架构的核心不是选择某个目录模板，而是建立可验证的约束：谁拥有状态和数据，依赖可以朝哪个方向，跨边界只能使用什么契约，失败由谁处理，以及这些规则如何在 CI 中自动执行。

## 一、架构是变化规则，不是目录截图

两个项目可以拥有相同目录，架构却完全不同：

```text
features/
├── catalog/
├── enrollment/
└── account/
```

如果 `catalog` 可以直接修改 `account` Store，`enrollment` 可以深层 import `catalog/internal/cache.ts`，这个目录并没有形成边界。

架构真正回答：

- 哪类变化应该被限制在一个模块内？
- 哪些依赖稳定，哪些实现容易替换？
- 数据的权威来源在哪里？
- 一个模块能否独立测试、发布或回滚？
- 违反边界时，工具能否在提交阶段失败？

可以把架构质量理解为：

```text
高内聚：一起变化的代码放在一起
低耦合：不需要一起变化的代码只通过小契约协作
显式依赖：模块从参数、接口或公开入口获得能力
单向依赖：稳定规则不依赖易变框架和基础设施
可执行约束：边界由编译器、lint、测试和 CI 保护
```

“低耦合”不是没有依赖。前端必须依赖浏览器、框架、API 和设计系统；目标是让依赖方向与所有权可推理。

## 二、大型前端的复杂度来自四种耦合

### 2.1 代码耦合

一个模块直接 import 另一个模块的内部文件、私有类型或框架实例。被依赖者无法安全重构。

### 2.2 数据耦合

多个模块各自缓存“当前用户”“课程详情”，却没有统一的新鲜度、失效和冲突策略。

### 2.3 运行时耦合

一个 Remote、第三方 SDK、全局 CSS 或路由监听失败，导致其他业务域不可用。

### 2.4 组织耦合

团队名义上独立，却必须同步排期、同步发布，或者没人拥有跨域契约和生产事故。

架构不能消除这些耦合，但能把它们转换成：

```text
代码耦合 → 公开模块契约
数据耦合 → 明确权威来源和失效协议
运行时耦合 → 故障边界、超时、降级和回滚
组织耦合 → 所有权、兼容期和发布责任
```

## 三、先按业务能力切 Feature，再按技术职责分层

不推荐把整个应用只按技术类型组织：

```text
components/
services/
stores/
types/
utils/
```

它让一个业务改动横跨许多顶层目录，也鼓励任何 Service、Store 和类型被全站引用。

更适合增长的第一层通常是业务能力：

```text
features/
├── catalog/
│   ├── domain/
│   ├── application/
│   ├── infrastructure/
│   ├── ui/
│   └── index.ts
├── enrollment/
└── account/
```

这里有两个维度：

1. `catalog`、`enrollment` 是业务所有权边界；
2. Feature 内部的 `domain`、`application`、`infrastructure`、`ui` 是依赖方向。

不要为每个按钮机械创建四层。只有当模块真的存在业务规则、用例和外部依赖时，分层才产生价值。展示型叶子组件可以很简单。

## 四、四层分别承担什么

```text
UI ───────────────┐
                  ▼
Infrastructure → Application → Domain
        ▲               │
        └── 实现 Port ──┘
```

箭头表示源码依赖方向，不是运行时调用方向。

### 4.1 Domain：框架无关的业务事实与规则

<<< ../../../examples/frontend/architecture-boundaries/src/features/catalog/domain/course.ts

Domain 包含：

- 实体、值对象和明确的业务状态；
- 纯规则和不变量；
- 领域错误或决策结果。

它不应该 import Vue、React、Pinia、Router、Axios、Analytics 或 DOM。`Date` 作为值可以存在，但当前时间应由外部传入，避免规则偷偷依赖环境。

示例把报名可用性建模为互斥联合，而不是三个可能矛盾的布尔值：

```ts
{ available: false, reason: 'full' }
```

调用者必须处理成功或具体失败原因。

### 4.2 Application：编排用例并声明所需能力

<<< ../../../examples/frontend/architecture-boundaries/src/features/catalog/application/load-course.ts

Application 负责：

- 描述用户或系统用例；
- 调用领域规则；
- 定义 Repository、Clock、Telemetry 等 Port；
- 管理一个用例内的事务与错误语义。

`CourseRepository` 是 Application 需要的能力，不是 HTTP Client 的镜像。它说“按 ID 查课程”，没有暴露 URL、Header、Axios Response 或缓存库类型。

### 4.3 Infrastructure：实现环境和供应商细节

<<< ../../../examples/frontend/architecture-boundaries/src/features/catalog/infrastructure/http-course-repository.ts

Infrastructure 负责：

- Fetch/GraphQL/Storage/IndexedDB；
- 后端 DTO 到领域对象的转换；
- 第三方 SDK 适配；
- 缓存和序列化细节。

HTTP `200` 不证明 JSON 符合契约，因此适配器在系统边界做运行时解析。内部代码收到的 `Course` 已经是可信领域对象，不需要每个组件重复判断字段。

基础设施可以依赖 Application 的 Port；Application 不能反向 import `HttpCourseRepository`。这就是依赖倒置。

### 4.4 UI：把领域结果变成用户可观察模型

<<< ../../../examples/frontend/architecture-boundaries/src/features/catalog/ui/course-view-model.ts

UI 层负责：

- Framework Component、Composable、Hook；
- 用户交互与可访问状态；
- View Model 和本地展示格式；
- 调用 Application Use Case。

示例 View Model 不依赖具体框架，所以 Vue 2、Vue 3、React 或服务端渲染都可以消费。实际组件仍留在 UI 层。

UI 不直接 new HTTP Repository，也不让领域对象读取浏览器全局。

## 五、公开入口是模块的防火墙

Feature 的唯一公开入口：

<<< ../../../examples/frontend/architecture-boundaries/src/features/catalog/index.ts

消费者看到的是：

- `CatalogFeature` 能做什么；
- 创建它需要哪些公开配置；
- 稳定的 `CourseViewModel`。

消费者看不到：

- HTTP DTO；
- Repository 类；
- Use Case 的内部构造方式；
- UI 层内部文件组织。

这样 Feature 可以在不改变公开契约的情况下替换 Fetch、缓存、目录甚至框架。

### 5.1 Barrel File 不一定是公开 API

`index.ts` 只有在团队明确控制导出内容时才是边界。下面的做法会重新暴露全部内部实现：

```ts
export * from './domain/course.js'
export * from './application/load-course.js'
export * from './infrastructure/http-course-repository.js'
```

公开入口应有意选择最小契约。每新增一个 export，都意味着未来需要兼容、迁移或正式破坏它。

### 5.2 类型公开也会造成耦合

即使 `import type` 不产生运行时代码，消费者仍会依赖类型结构。若把 HTTP DTO、内部 Store State 或组件私有 Props 导出，类型变化仍会扩散全仓。

类型依赖没有运行时包体成本，不代表没有架构成本。

## 六、Composition Root：具体实现只在边缘组装

<<< ../../../examples/frontend/architecture-boundaries/src/app/composition-root.ts

Composition Root 是应用知道所有具体实现的少数位置。它负责：

- 读取并验证公开运行时配置；
- 选择 HTTP、缓存、Telemetry 实现；
- 为每个 Feature 创建依赖；
- 连接路由、Provider 与应用外壳；
- 确定对象生命周期。

不要在每个组件里读取 `window.__CONFIG__`，也不要在 Render 中重复 `new Repository()`。集中装配让环境差异、测试替身和发布配置清晰可控。

### 6.1 依赖注入不等于引入容器

构造函数参数、Factory 和一个普通 Dependencies Object 就能完成多数前端依赖注入。只有在对象图极大、生命周期复杂并且团队理解容器语义时，才考虑 DI Container。

用字符串 Token 和反射隐藏所有依赖，可能让源码更难追踪；显式参数通常更适合前端。

## 七、不要让一种数据模型穿越所有边界

一个常见反模式是定义全局 `Course`，让它同时表示：

- 后端 JSON；
- 领域实体；
- Pinia/Redux State；
- 组件 Props；
- 表单编辑草稿；
- 数据库缓存记录。

这些模型变化原因不同：

| 模型 | 变化原因 |
| --- | --- |
| Transport DTO | 后端协议与版本 |
| Domain Model | 业务规则 |
| Persistence Model | 存储和索引 |
| View Model | 页面展示与本地化 |
| Form Model | 编辑、校验和未提交状态 |

适配器转换看起来多写了一些代码，却阻止传输字段、`null` 语义和 UI 格式泄漏到整个系统。

### 7.1 不要用类型断言跳过边界转换

```ts
const course = (await response.json()) as Course
```

只告诉 TypeScript“相信我”，不会在运行时验证数据，也没有完成 DTO 到领域时间、枚举和不变量的转换。

## 八、状态所有权先于 Store 选型

在选择 Pinia、Redux、Zustand 或其他库之前，先回答：

| 状态 | 推荐所有者 |
| --- | --- |
| 输入框、Popover、临时选择 | 最近 UI 组件 |
| Feature 多步工作流 | Feature Store / State Machine |
| 服务端数据 | Router Data / Query Cache |
| 筛选、分页、可分享选择 | URL |
| 会话和授权事实 | 服务端 + Session Adapter |
| 跨应用已发生事实 | 版本化 Integration Event |

“多个地方需要”不等于“放进全局 Store”。服务端状态有新鲜度、缓存、重试、取消和失效语义；把它复制到全局客户端 Store 后手工同步，通常产生两个权威来源。

### 8.1 单一权威来源不代表只能有一份数据

缓存、View Model 和表单草稿可以同时存在，但必须知道：

- 哪份是权威事实；
- 其他副本何时创建；
- 如何检测过期；
- 冲突时谁获胜；
- 离开页面是否清理。

## 九、同步调用、查询、命令和事件要分开

跨模块通信不是只有“直接调用”与“事件总线”两个选择。

### 9.1 Query：请求当前事实并等待结果

```ts
const course = await catalog.loadCourse(id)
```

调用者需要结果，失败应直接返回或抛出。使用同步/异步函数最清楚。

### 9.2 Command：请求所有者执行动作

```ts
await enrollment.enroll({ courseId })
```

命令可以失败，通常只有一个明确处理者。不要用广播事件模拟需要确认成功的 RPC。

### 9.3 Event：发布已经发生的事实

```text
learning.enrollment-confirmed.v1
```

事件允许零到多个消费者；发布者不应该依赖某个消费者同步执行。事件名使用过去式业务事实，而不是 `update`、`change`。

## 十、跨边界事件必须可版本化并运行时校验

<<< ../../../examples/frontend/architecture-boundaries/src/shared/integration-event.ts

设计原则：

- 名称带业务命名空间和契约版本；
- Payload 只包含必要 ID 和事实；
- 时间使用明确格式；
- 接收端把消息视为 `unknown`；
- 未知版本安全忽略或明确降级；
- 不传框架实例、Store、DOM Node、Token 和巨型对象。

### 10.1 TypeScript 联合不能验证运行时消息

DOM Event、BroadcastChannel、`postMessage`、Remote 和服务端消息都来自运行时边界。发送方与接收方即使共享同一个 TypeScript 类型，也可能运行不同发布版本。

因此必须有 Runtime Parser。类型共享减少编写错误，解析器负责版本不一致和不可信输入。

### 10.2 事件总线容易成为隐形控制流

如果每个动作都变成广播事件：

- 无法从调用处知道谁处理；
- 执行顺序和错误传播不明确；
- 测试需要建立整套全局订阅；
- 重命名和删除消费者难以发现；
- 循环事件可能形成反馈回路。

默认使用显式函数和 Port；只有真正的“一件事已发生，多个独立消费者可响应”才使用事件。

## 十一、Widget 边界要有明确生命周期和 DOM 所有权

框架无关的宿主契约：

<<< ../../../examples/frontend/architecture-boundaries/src/app/widget-host.ts

它定义：

- `contractVersion`：宿主先检查协议版本；
- `mount`：一个容器只有一个所有者；
- `update`：更新输入，不重复 mount Root；
- `unmount`：幂等清理；
- `AbortSignal`：统一取消 Listener、请求和订阅；
- `publish`：只发送版本化领域事件。

Vue 2、Vue 3、React 或 Web Component 都可以适配这个契约。宿主不应该知道 Remote 内部的组件树和 Store。

### 11.1 `unmount` 是架构契约，不是清洁建议

如果宿主替换路由却没有调用 Remote cleanup，会留下：

- React/Vue Root；
- Window Listener；
- Observer、Timer、WebSocket；
- 未完成请求；
- 对 DOM 和大对象的闭包引用。

这会同时造成行为重复、内存泄漏和跨版本幽灵状态。示例通过 `AbortController` 和 `finally` 保证清理路径。

## 十二、用工具执行依赖方向

口头规则“不要深层 import”会随着人员和压力逐渐失效。示例把规则写成数据：

<<< ../../../examples/frontend/architecture-boundaries/architecture-rules.json

依赖矩阵含义：

```text
domain         → domain
application    → domain + application
infrastructure → domain + application + infrastructure
ui             → domain + application + ui
```

此外：

- Shared 不能依赖 App 或 Feature；
- Feature 不能依赖 App Shell；
- 跨 Feature 只能 import 对方 `index.ts`；
- 内部 Workspace Package 禁止任意深层子路径；
- Feature 依赖图不能出现循环。

完整检查器：

<<< ../../../examples/frontend/architecture-boundaries/scripts/check-dependencies.mts

### 12.1 为什么要解析 AST 而不是 grep

正则很容易漏掉：

- `export ... from`；
- 换行 import；
- 字面量动态 `import()`；
- 注释中的假 import；
- TypeScript 和 TSX 语法。

示例使用 TypeScript Compiler API 读取静态 import、re-export 和字面量动态 import。

### 12.2 检查器的边界也必须诚实

它不会知道运行时拼接的动态模块名，也不会自动解析所有 tsconfig alias、Vite plugin virtual module 和 Workspace Package 图。真实仓库应继续扩展：

- 用 TypeScript Module Resolution 解析 Alias；
- 结合 Package Manager Workspace 图；
- 对允许的动态 Remote 建立显式 Manifest；
- 对 CSS、Assets 和全局注册建立额外检查；
- 输出依赖图和变更影响范围。

简单 Checker 的价值是让规则从第一天就可失败，不是假装覆盖所有语言行为。

### 12.3 ESLint 适合做即时反馈

`no-restricted-imports` 可以按 Path/Pattern 禁止特定模块，适合在编辑器中立即提示。但它只处理静态 import，复杂跨 Feature 图和循环检测通常需要专用边界工具。

可以同时使用：ESLint 给快速反馈，Architecture Check 在 CI 做完整裁决。

## 十三、文件夹边界如何升级为 Package 边界

当一个 Feature 足够稳定、需要独立构建或被多个应用消费时，可以变成 Workspace Package。

Package 公开面示例：

<<< ../../../examples/frontend/architecture-boundaries/package-fragment.json

Node.js `package.json` 的 `exports` 不只是发布配置，它还能封装未声明的内部子路径。消费者可以：

```ts
import { createCatalogFeature } from '@learning/catalog'
```

却不能依赖：

```ts
import { HttpCourseRepository } from '@learning/catalog/src/infrastructure/http-course-repository'
```

### 13.1 `exports` 是正式兼容面

一旦添加 `exports`，以前通过任意子路径访问内部文件的消费者可能被阻断。这是有意封装，也可能是破坏性变更。迁移已有 Package 时要先统计真实消费者并提供迁移期。

Conditional Exports 的对象顺序有语义；不要随意混合 `browser`、`node`、`import`、`require` 而不在每个真实运行时测试。

### 13.2 不要用 TypeScript `paths` 伪造 Package

TypeScript 官方模块文档明确提醒：用 `paths` 把 `@scope/pkg` 指向兄弟源码，可能跳过真实 `node_modules`、`exports` 和运行时解析语义。

Monorepo Package 应通过 npm/pnpm/yarn Workspace 链接进入 `node_modules`，让 TypeScript、Bundler 和真实消费者使用一致的 Package Resolution。

## 十四、Monorepo 解决什么，不解决什么

Workspace 提供：

- 一个仓库管理多个本地 Package；
- 统一 Lockfile 与依赖安装；
- 本地 Package 自动链接；
- 原子修改应用与共享契约；
- 统一 CI、lint、类型和发布工具。

它不会自动提供：

- 正确的业务边界；
- 独立发布；
- 团队所有权；
- API 兼容；
- 快速 CI；
- 无循环依赖。

一个 Monorepo 可以是结构良好的 Modular Monolith，也可以是所有 Package 相互 import 的 Distributed Big Ball of Mud。

### 14.1 什么时候先保持单 Package

如果：

- 只有一个应用和一个团队；
- 代码总是一起发布；
- 没有真实复用或独立构建需要；
- 文件夹边界已经能由工具保护；

拆成几十个 Package 只会增加配置、声明文件、构建顺序和依赖版本管理。

Package 是部署/复用/编译边界，不是为了让目录看起来高级。

## 十五、TypeScript Project References 表达编译依赖图

Project References 把一个 TypeScript Program 拆成多个可引用项目。被引用项目需要适当的 `composite`/声明输出配置，`tsc -b` 会按依赖顺序增量构建。

概念结构：

```json
{
  "files": [],
  "references": [
    { "path": "./packages/catalog" },
    { "path": "./packages/enrollment" },
    { "path": "./apps/web" }
  ]
}
```

它的价值包括：

- 降低大型 Program 的内存和检查范围；
- 明确编译顺序；
- 下游读取上游 `.d.ts` 公共面；
- 加速增量构建和编辑器导航。

Project Reference 不是业务架构验证器。一个错误方向仍可以被合法写进 references；因此需要和 Package exports、依赖规则共同使用。

## 十六、API 兼容是大型前端的日常工作

公开契约变化分三类：

| 变化 | 兼容性 | 示例 |
| --- | --- | --- |
| 增加可选能力 | 通常向后兼容 | 新增可选字段 |
| 改变语义但类型不变 | 隐蔽破坏 | `capacity` 从剩余变总量 |
| 删除/收紧/重命名 | 明确破坏 | 删除 Event v1 |

类型检查只能发现结构变化，发现不了相同 `number` 背后的语义变化。公共契约需要：

- 文档和语义命名；
- Contract Test；
- 版本与弃用期；
- Consumer 列表；
- 发布说明和迁移工具；
- 生产版本与可观测性维度。

### 16.1 Expand and Contract

安全迁移通常经历：

1. 新旧字段/事件同时提供；
2. Consumer 逐步迁移；
3. 监控旧契约使用量；
4. 达到兼容窗口后删除旧契约。

直接要求所有团队同一天切换，说明组织上仍是同步发布，只是技术上分了仓库或 Remote。

## 十七、什么时候需要微前端

微前端主要解决**多个团队需要独立交付大型业务域**的问题，而不是一般代码组织问题。

收益更可能成立的条件：

- 多个长期自治团队；
- 业务域和路由边界清晰；
- 发布节奏明显不同；
- 每个团队拥有开发、值班、指标和回滚；
- 同步发布已成为真实瓶颈；
- 可以承担运行时集成、兼容和平台治理成本。

不充分的理由：

- “仓库太大”；
- “想尝试 React/Vue 3”；
- “组件很多”；
- “团队沟通不好”；
- “Build 慢但没分析任务图”；
- “希望以后可能独立部署”。

这些问题通常先用 Modular Monolith、Workspace、Project References、Build Cache 和明确所有权解决。

### 17.1 微前端是组织架构的运行时投影

如果两个团队每天都要同步修改一个全局 Store、同一页面布局和同一后端事务，强行拆 Remote 不会让它们自治，只会增加网络和版本失败模式。

先证明业务和团队边界，再选择运行时组合。

## 十八、从弱到强的集成方式

| 方式 | 独立构建 | 独立部署 | 运行时隔离 | 主要适用场景 |
| --- | --- | --- | --- | --- |
| 同仓 Feature | 否 | 否 | 无 | 默认选择 |
| Workspace Package | 是/可选 | 通常否 | 无 | 多应用复用、编译边界 |
| Build-time Package | 是 | 随宿主发布 | 无 | 稳定库与设计系统 |
| 路由级应用 | 是 | 是 | 中 | 业务路由天然独立 |
| Module Federation | 是 | 是 | 低到中 | 同页面动态组合与共享模块 |
| Custom Element | 是 | 是 | CSS 可隔离 | 跨框架 Widget |
| iframe | 是 | 是 | 强 | 不可信/高隔离内容、独立安全边界 |

默认选择最弱、最简单且足够满足独立性的方案。隔离越强，通信、可访问性、路由、性能和体验整合成本通常越高。

## 十九、Module Federation 的运行时模型

webpack Module Federation 让多个独立 Build 在运行时组成应用：

```text
Host
  ├─ 加载 Remote Container
  ├─ 请求 Exposed Module
  ├─ 协商 Shared Module
  └─ 执行 Remote Factory
```

Remote 加载是异步 Chunk 操作。它不是普通编译期 import，因此新增失败模式：

- Remote Entry/CDN 不可用；
- Host 与 Remote 契约版本不兼容；
- Shared 依赖无法满足版本范围；
- React/Vue 单例重复；
- Remote 发布后旧 Host 仍在缓存；
- Remote 执行错误影响宿主；
- 动态脚本扩大供应链攻击面。

### 19.1 Shared Dependency 不是免费去重

将 Vue、React、Router 设为 shared/singleton，需要治理：

- 谁提供版本；
- 版本不兼容时失败还是降级；
- Remote 是否依赖某个未公开内部行为；
- SSR 与客户端是否解析到同一版本；
- 多版本共存是否比单例冲突更安全。

“全部 shared”会把独立发布重新绑定到一个隐形全局依赖图。

### 19.2 Remote 必须有可验证 Manifest

生产环境至少需要：

- Remote 名称与 Release；
- Host Contract Range；
- Entry URL 与可信 Origin；
- 可选 Integrity/签名策略；
- Feature Flag 与 Kill Switch；
- 超时、重试上限和 Fallback；
- Source Map 与可观测性版本关联。

不要让业务组件随意拼接 URL 并 `import()` 未验证 Remote。

## 二十、Custom Element 与 Shadow DOM

Custom Element 使用浏览器级 Tag、Property、Attribute、生命周期和 DOM Event 形成跨框架契约。

适合：

- 页面内相对独立 Widget；
- 多框架宿主；
- 希望使用标准 DOM 生命周期；
- 可接受显式 Property/Event 协议。

Shadow DOM 能隔离内部 DOM 和 CSS，但不自动解决：

- 设计 Token、字体和主题传播；
- Portal/Overlay；
- 表单参与；
- SSR/Hydration；
- 可访问性关系跨 Shadow Boundary；
- 全局 Custom Element 名称冲突。

现代浏览器还在发展 Scoped Custom Element Registry，但必须基于目标浏览器兼容性选择，不能假设全量用户环境一致。

## 二十一、iframe：强隔离伴随高整合成本

iframe 提供独立 Window、Document、CSS 和相对强的安全/故障边界，适合：

- 不可信第三方内容；
- 独立身份和权限环境；
- 必须隔离全局脚本/CSS 的旧系统；
- 支付、编辑器或沙箱等明确边界。

代价包括：

- 自适应高度和嵌套滚动；
- 键盘、Focus 和可访问性；
- History、深链接和 Analytics；
- 多份运行时与资源；
- Cookie/CSP/跨源策略；
- `postMessage` 契约。

使用 `postMessage` 时，发送方指定精确 `targetOrigin`；接收方同时验证 `event.origin`、`event.source` 和消息结构。`origin` 可信也不代表 Payload 永远可信。

## 二十二、微前端平台必须统一哪些事情

自治不是所有事情各做一套。平台层通常统一：

- 身份会话句柄和权限查询，不共享长期 Token；
- 顶层 Router/History 所有权；
- Design Token 和可访问性基线；
- Release、错误、RUM、Trace Correlation；
- Remote Manifest、CSP 和可信 Origin；
- 契约版本和兼容窗口；
- 灰度、Kill Switch、回滚；
- Local Development 和 Contract Test 工具。

业务团队自治于领域实现和发布节奏，平台统一跨域协议。没有这些治理，微前端只是把内部 import 变成无法编译期验证的网络调用。

## 二十三、路由、会话和样式的所有权

### 23.1 顶层 History 只有一个所有者

Host 负责顶层 URL、鉴权和全局导航；Remote 接收 Base Path 或 Navigation Port。多个 Router 同时修改同一个 Browser History 会造成重复导航、Back 异常和 Analytics 重复。

### 23.2 会话共享事实，不共享可变认证对象

Remote 应通过 Session Port 查询当前会话或请求重新认证。不要把 Access Token 放进 DOM Attribute、Event Payload、Local Storage 广播或 Remote Props。

服务端必须独立执行授权；前端权限只决定体验，不是安全边界。

### 23.3 CSS 需要显式策略

可选择：

- 全局命名规范与 Cascade Layer；
- CSS Modules/Scoped CSS；
- Shadow DOM；
- iframe 强隔离；
- Design Token + 每个 Remote 自己生成样式。

无论选择哪种，都要治理 Reset、字体、Overlay 层级、主题和 SSR 样式顺序。`z-index: 999999` 不是跨应用协议。

## 二十四、独立发布意味着独立故障处理

一个 Remote 能独立发布，必须同时具备：

- 独立版本和变更记录；
- Contract Test；
- 兼容 Host 版本范围；
- 灰度和健康指标；
- Source Map；
- 值班和告警 Owner；
- 一键回滚或 Kill Switch；
- Fallback UI。

如果 Remote 发布失败只能等待宿主团队重新构建，那么它并没有真正独立交付。

### 24.1 回滚不保证数据向后兼容

前端代码回滚后，用户本地 Storage、后端数据和事件可能已经由新版本写入。迁移必须设计：

- Schema version；
- 向前/向后读取兼容；
- 幂等写入；
- 老客户端处理新字段；
- 清理或迁移策略。

发布架构和数据架构不能分开考虑。

## 二十五、渐进式架构迁移

不要先重排全仓目录。更安全的 Strangler 路径：

1. 选一个变化频繁但边界相对清晰的 Feature；
2. 记录当前 Consumer 和数据流；
3. 建立公开 Facade，旧实现先放在 Facade 后面；
4. 禁止新增深层 import；
5. 把领域规则从组件/Store 抽出；
6. 把 HTTP/Storage 移到 Adapter；
7. Consumer 迁到公开入口；
8. 用工具切断旧入口；
9. 删除死代码与兼容层；
10. 用交付时间、事故和依赖图确认收益。

目录移动本身没有业务价值；只有依赖方向改变并被工具保护，迁移才完成。

### 25.1 Vue 2 到 Vue 3/React 的迁移原则

先建立框架无关的 Domain、Application Port 和 Integration Contract，再替换 UI Adapter。这样迁移单位是业务能力，不是“先改完所有 Button”。

双框架共存应是有期限的过渡态，记录：

- 所属路由/Widget；
- 新旧 Owner；
- Bundle 和性能成本；
- 契约；
- 迁移完成条件；
- 删除旧运行时的目标日期。

## 二十六、架构适应度函数

Architecture Fitness Function 是持续验证架构属性的自动化检查，例如：

| 属性 | 自动检查 |
| --- | --- |
| 依赖方向 | AST Import Boundary Check |
| 无 Feature 循环 | Dependency Graph Cycle Check |
| 公开 API | Package `exports`、API Extractor |
| 编译图 | `tsc -b` Project References |
| 运行时契约 | Consumer/Provider Contract Test |
| 包体隔离 | Entry/Remote Bundle Budget |
| 故障隔离 | Remote Failure E2E |
| 所有权 | CODEOWNERS/审批规则 |
| 安全 | CSP、Origin Allowlist、依赖扫描 |
| 可回滚 | 灰度与 Kill Switch 演练 |

脚本入口：

<<< ../../../examples/frontend/architecture-boundaries/package-scripts.json

Node 版本：

<<< ../../../examples/frontend/architecture-boundaries/.node-version

CI 工作流：

<<< ../../../examples/frontend/architecture-boundaries/.github/workflows/architecture.yml

示例工作流先验证依赖方向，再用 `tsc -b` 验证真实 Project Graph。生产仓库仍应固定 Action 完整 commit SHA。

## 二十七、如何衡量架构是否改善

不要用 Package 数量或架构图页数衡量。更有意义的信号：

- 一个 Feature 变更涉及多少无关模块；
- 跨域深层 import 数量；
- Feature 循环依赖；
- 公共 API 破坏频率；
- PR 到生产 Lead Time；
- 构建和类型检查受影响范围；
- 一个模块故障的 Blast Radius；
- 回滚是否需要多团队同步；
- 新成员能否从公开契约理解模块；
- 兼容层和双框架代码是否持续下降。

架构的价值最终体现在更安全、更局部、更可预测的变化。

## 二十八、常见架构反模式

### 28.1 巨型 `shared/`

所有 Feature 都依赖它，任何修改都影响全站。Shared 只保留真正稳定、无业务所有权争议的原语；业务概念应归属明确 Feature。

### 28.2 全局 Store 作为数据库和事件总线

所有模块读写任意字段，状态所有权和失效语义消失。按状态类型选择 Local、Feature、URL、Server Cache 或 Event。

### 28.3 Feature 之间复制类型

短期避免依赖，长期两个“Course”语义漂移。应确认权威 Owner，通过最小公开契约或 Anti-corruption Layer 转换。

### 28.4 为了复用过早抽象

两个相似组件不一定有同一变化方向。等待稳定共同语义，再抽取；复制少量展示代码有时比错误共享更便宜。

### 28.5 所有包互相 peerDependency

版本图和安装错误复杂，仍没有业务边界。只有真正由宿主提供且必须单例的运行时才考虑 Peer Dependency。

### 28.6 用微前端解决团队沟通

网络边界不会消除产品和数据依赖。先明确业务 Owner、契约和决策机制。

### 28.7 Remote 永远只向前兼容

Host、Remote、缓存和灰度会形成版本交叉。必须设计明确兼容范围和失败降级，而不是依赖“大家总是最新”。

### 28.8 架构规则只写在 Wiki

压力最大时最容易被绕过。把关键规则放入 ESLint、Package exports、Checker、Contract Test 和 CI。

## 二十九、完整示例目录

```text
examples/frontend/architecture-boundaries/
├── .github/workflows/architecture.yml
├── .node-version
├── architecture-rules.json
├── package-fragment.json
├── package-scripts.json
├── scripts/
│   └── check-dependencies.mts
└── src/
    ├── app/
    │   ├── composition-root.ts
    │   └── widget-host.ts
    ├── features/catalog/
    │   ├── application/load-course.ts
    │   ├── domain/course.ts
    │   ├── infrastructure/http-course-repository.ts
    │   ├── ui/course-view-model.ts
    │   └── index.ts
    └── shared/
        └── integration-event.ts
```

迁入真实项目时需要：

- 将规则中的目录、内部 Package Scope 和入口名改成真实结构；
- 在项目 `devDependencies` 安装 TypeScript，供 Compiler API 使用；
- 让 Checker 解析真实 tsconfig Alias 和 Workspace 图；
- 为每个 Package 配置真实 `exports`、声明输出和 Project Reference；
- 将脚本接入现有质量工作流；
- 对存量违规建立有期限的迁移基线，不允许新增。

## 三十、架构评审清单

### 模块边界

- Feature 按业务能力而不是纯技术类型组织；
- 每个 Feature 有明确 Owner 和公开入口；
- Domain 不依赖框架和基础设施；
- Application 定义 Port，Infrastructure 实现；
- Consumer 不深层 import 内部文件；
- Feature 图无循环。

### 数据与状态

- Transport、Domain、View、Form Model 的边界清楚；
- 外部数据在 Adapter 做运行时校验；
- 状态有权威来源、失效和冲突规则；
- 服务端缓存没有被无理由复制到全局 Store；
- 跨应用不传播 Token 和框架实例。

### Monorepo 与 Package

- Package 对应真实复用、编译或所有权边界；
- Workspace 使用真实 Package Resolution；
- `exports` 只暴露受支持入口；
- Project References 与业务依赖方向一致；
- 类型、测试、构建任务按依赖图增量执行。

### 微前端

- 独立团队和发布需求已经被证明；
- 选择了足够简单的集成方式；
- Host/Remote 契约有版本与运行时解析；
- Router、Session、CSS、Telemetry 所有权明确；
- Remote 失败有超时、Fallback 和 Kill Switch；
- Shared Dependency 有兼容策略；
- 灰度、回滚和值班责任真实存在。

### 持续治理

- 依赖规则在编辑器和 CI 自动执行；
- 破坏性 API 变化有兼容期；
- 架构指标衡量变化成本和故障范围；
- 临时豁免带 Owner 和截止日期；
- 迁移完成后删除桥接、旧入口和旧运行时。

## 三十一、总结

大型前端架构的主线可以归纳为：

```text
业务能力决定 Feature
  → 变化方向决定内部层次
  → Port 隔离易变基础设施
  → Public Entry 限制消费者
  → Package exports 与 Checker 执行边界
  → Contract 管理跨模块与跨部署协作
  → Fitness Functions 持续阻止架构退化
```

先建立 Modular Monolith，只有组织确实需要独立交付时再引入微前端。微前端不是更高级的组件系统，而是把模块边界、版本兼容、故障隔离和发布责任搬到运行时；没有成熟契约和治理时，它会放大而不是解决耦合。

下一节将进入前端可观测性与生产治理，讨论错误、日志、指标、Trace、Source Map、Release、灰度、Feature Flag、告警和事故响应如何形成完整闭环。

## 参考资料

- [TypeScript：Project References](https://www.typescriptlang.org/docs/handbook/project-references)
- [TypeScript：Modules Reference](https://www.typescriptlang.org/docs/handbook/modules/reference)
- [Node.js：Packages、exports 与 imports](https://nodejs.org/api/packages.html)
- [npm：Workspaces](https://docs.npmjs.com/cli/using-npm/workspaces/)
- [ESLint：no-restricted-imports](https://eslint.org/docs/latest/rules/no-restricted-imports)
- [webpack：Module Federation](https://webpack.js.org/concepts/module-federation/)
- [MDN：Web Components](https://developer.mozilla.org/docs/Web/API/Web_components)
- [MDN：Using Shadow DOM](https://developer.mozilla.org/docs/Web/API/Web_components/Using_shadow_DOM)
- [MDN：Window.postMessage](https://developer.mozilla.org/docs/Web/API/Window/postMessage)
- [MDN：iframe](https://developer.mozilla.org/docs/Web/HTML/Reference/Elements/iframe)
