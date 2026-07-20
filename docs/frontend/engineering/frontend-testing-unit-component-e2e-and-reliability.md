---
title: 前端测试工程化：单元、组件、集成与端到端测试
description: 从风险模型、测试替身和异步确定性出发，使用 Vitest、Testing Library、MSW 与 Playwright 建立可靠的前端测试流水线
outline: deep
---

# 前端测试工程化：单元、组件、集成与端到端测试

上一节建立了格式、lint、类型、测试、构建与 CI 的质量门禁。这一节深入其中的“测试”层：不是再罗列几个 `expect()` API，而是回答一套测试体系最难的问题：

- 一个风险应该放在哪一层测试？
- 单元、组件、集成和 E2E 究竟按什么划分？
- 为什么模拟 DOM 通过，真实浏览器仍可能失败？
- 应该 Mock 函数、模块、网络还是后端？
- 如何让时间、异步请求、数据库数据和并发执行保持确定？
- 重试、覆盖率、Snapshot 和 CI 并行分别解决什么，不能解决什么？

Vue 3 与 React 专题已经分别讲过组件挂载、Router、Store、Hooks 等框架用法。本节聚焦跨框架都成立的工程原理，并用一组可迁移的 Vitest、MSW 与 Playwright 示例串起完整流水线。

> 本工作树没有安装这些测试工具，而且本专题不能修改根 `package.json`。示例中的 `package-scripts.json` 是应合并到真实项目的脚本片段；课程不会假装已实际执行尚未安装的测试运行器。

整套课程只沿着一条决策链展开：

```text
先说清楚要防的风险
  → 选择足以证明它的最低成本边界
  → 控制时间、网络和数据，让失败可以复现
  → 把不同成本的测试放进合适的本地与 CI 阶段
```

## 先决定要防什么风险

测试无法证明系统不存在 Bug。它只能在特定环境、输入和观察范围内，证明某些行为符合预期。

测试价值可以粗略理解为：

```text
测试价值 ≈ 被捕获风险的损失与概率
         × 测试对真实行为的代表性
         × 失败信号的可信度
         ÷ 执行与维护成本
```

因此“每个文件都写一个测试”和“覆盖率必须 100%”都不是可靠策略。真正的起点是风险清单：

- 报名截止时刻的边界是否算错？
- 双击提交是否创建两笔订单？
- 旧搜索请求是否覆盖新请求结果？
- HTTP 409 是否被错误显示成网络断开？
- 路由重写、Cookie、真实 Focus 或浏览器 API 是否在部署后失效？
- 两条并行 E2E 是否争用同一个测试账号和数据？

风险明确后，再选择成本最低、但足以证明该风险的测试层。

### 测试层级与运行环境是两个维度

很多团队把术语混在一起，例如把“在 jsdom 运行”等同于“单元测试”，或者把“使用真实浏览器”等同于“端到端测试”。实际上至少有两个维度。

#### 一次测试跨过多少系统边界

| 测试层 | 典型被测范围 | 擅长发现 | 主要代价 |
| --- | --- | --- | --- |
| 单元 | 纯函数、一个状态转换器 | 边界组合、算法和领域规则 | 无法证明模块接线 |
| 组件 | 一个 UI 组件及其直接协作 | 用户交互、ARIA、状态呈现 | 未必包含真实网络和部署 |
| 集成 | 多模块、Router、Store、HTTP Client | 协议映射、模块协作、错误路径 | 失败定位范围更大 |
| E2E | 浏览器入口到真实服务与数据 | 关键用户旅程和部署形态 | 慢、环境与数据治理复杂 |

#### 代码在哪里执行

| 环境 | 特征 | 适合场景 |
| --- | --- | --- |
| Node.js | 无 DOM，启动快 | 领域规则、转换器、Node 服务集成 |
| jsdom / happy-dom | 在 Node 中模拟 DOM | 大量普通组件交互 |
| Vitest Browser Mode | 测试模块直接在真实浏览器运行 | 原生事件、Observer、Selection、浏览器组件 |
| Playwright E2E | 从页面入口驱动完整应用 | 路由、构建产物、Cookie、跨页面流程 |

所以“浏览器组件测试”仍可能只集成一个组件；“Node 集成测试”也可能真实地跨过 HTTP Client、Fetch 和响应解析多个模块。层级描述系统范围，环境描述执行载体。

### 不要追求固定测试金字塔比例

测试金字塔表达了一个有价值的趋势：底层测试通常更多、更快，上层测试更少、更贵。但它不是要求每个项目达到固定数量比例的 KPI。

更实用的选择方式是：

| 风险 | 首选测试层 |
| --- | --- |
| 日期、价格、权限等大量输入组合 | 纯单元测试 |
| 表单可访问名称、Pending、错误提示 | 组件测试 |
| Fetch URL、Header、Body 和错误映射 | MSW 网络集成测试 |
| Router、Store、Query Cache 协作 | 应用集成测试 |
| 登录、支付、发布、部署 Rewrite | 少量 E2E |
| Focus、Selection、ResizeObserver、真实 CSS | 浏览器组件或 E2E |

同一规则不需要在所有层重复全部排列。比如报名资格的 20 种组合放在纯函数测试；组件测试只证明按钮正确消费该规则；E2E 只验证最重要的成功流程和一两个致命失败流程。

## 让测试只依赖可观察行为

### 观察输入和输出，不观察实现过程

测试应优先观察：

- 输入：函数参数、Props、用户操作、HTTP 请求、当前路由；
- 输出：返回值、DOM、可访问状态、导航、持久化结果、外部协议调用。

脆弱测试通常观察：

- Vue 组件内部 `ref` 名称；
- React 使用了几个 Hook；
- 私有方法调用顺序；
- CSS class 或 DOM 层级；
- 为实现当前算法而产生的中间值。

只要用户可观察行为不变，从布尔变量重构成状态机、从 Options API 重构成 Composition API、从 `useState` 重构成 Reducer，都不应该让大量测试破裂。

### Arrange、Act、Assert 是因果结构

```ts
it('prevents enrollment when the course is full', async () => {
  // Arrange：建立一个名额为 0 的可理解场景
  const course = buildCourse({ capacity: 0 })

  // Act：执行一个用户或调用者真正会执行的动作
  renderEnrollment(course)

  // Assert：观察公共结果
  expect(screen.getByRole('button', { name: '名额已满' })).toBeDisabled()
})
```

这不是必须保留三段注释的格式要求，而是让失败因果清楚：环境是什么、发生了什么、应该观察到什么。

### 用例名应该描述业务结果

不推荐：

```ts
it('works')
it('calls submit')
```

推荐：

```ts
it('keeps the form value when enrollment returns a conflict')
it('rejects enrollment at the exclusive closing boundary')
```

失败报告本身应该帮助定位风险，而不是迫使维护者先打开源码猜测。

### 先把领域决策变成纯函数

示例把报名资格建模为显式输入和互斥输出：

<<< ../../../examples/frontend/testing-pipeline/src/enrollment-policy.ts

这里没有 `Date.now()`、Store、组件实例或网络。调用者必须传入 `now`，因此测试能稳定控制时间。

对应单元测试：

<<< ../../../examples/frontend/testing-pipeline/tests/unit/enrollment-policy.test.mts

#### 为什么测试边界而不只是“正常值”

时间窗口通常是半开区间：

```text
opensAt <= now < closesAt
```

最有信息量的输入是：

- `opensAt - 1`；
- `opensAt`；
- `closesAt - 1`；
- `closesAt`。

只测窗口中间的任意时间，无法发现 `<` 和 `<=` 写反。数组长度、分页、金额、重试次数也遵循同样原则：优先测试边界两侧，而不是堆积大量普通值。

#### Builder 让场景突出差异

`buildContext()` 提供一个有效默认场景，每条测试只覆盖关心字段：

```ts
buildContext({ capacity: 0 })
```

Builder 的默认值必须合法且稳定。一个包含用户、支付、课程、权限和十层嵌套对象的全局巨大 Fixture，会让测试依赖无关字段；领域对象应使用小而专注的 Builder。

#### 表格测试不是把所有行为塞进二维数组

`it.each()` 适合“相同规则，不同输入”的矩阵。每行要有可读的场景名称。若各行的准备、动作和断言完全不同，应拆成独立用例，否则失败只显示某个难以理解的数组索引。

### 测试替身：先决定替换哪条边界

“Mock”经常被用来指所有替身，但不同替身承担不同目的：

| 类型 | 作用 |
| --- | --- |
| Dummy | 只为满足参数，不参与行为 |
| Stub | 返回预先安排的结果 |
| Spy | 记录真实或替代函数如何被调用 |
| Fake | 有简化但可工作的实现，例如内存仓库 |
| Mock | 预先定义交互期望并验证 |

术语不是重点，重点是替换边界的代价。

#### 优先替换进程外副作用

适合建立测试接缝的能力包括：

- HTTP Client、数据库、消息系统；
- Clock、Random、UUID；
- Storage、Clipboard、Observer；
- Analytics、Feature Flag、支付 SDK。

不应该仅为了“更好 Mock”而把每个纯函数都包装成接口。过多抽象会让生产代码也变得难读。

#### 依赖注入通常比深层模块 Mock 更透明

如果组件接收一个 `EnrollmentService` 接口，测试可以传入小型 Fake。它不需要理解 ESM hoist、模块缓存和 import 顺序。

模块 Mock 有合理用途，例如替换不可注入的第三方模块，但要理解：

- `vi.mock()` 会被提升，在 import 前注册；
- 模块顶层已经执行的副作用很难通过之后的 Spy 捕获；
- Browser Mode 使用浏览器原生 ESM，部分 `vi.spyOn`/模块替换能力与 Node runner 不同；
- Mock、Env、Global 和 Timer 状态必须在测试之间恢复。

Mock 越靠近被测实现内部，测试越容易和重构绑定。

### 异步测试的核心是等待条件，不是等待时间

#### 禁止用任意 Sleep 猜系统完成时间

脆弱写法：

```ts
await new Promise(resolve => setTimeout(resolve, 500))
expect(screen.getByText('报名成功')).toBeTruthy()
```

本地 500ms 可能足够，CI 负载升高时却不够；如果操作只需 5ms，每次测试又浪费 495ms。

稳定测试等待可观察条件：

```ts
expect(await screen.findByRole('status')).toHaveTextContent('报名成功')
```

或在 Playwright 中使用会自动重试的 Web-first assertion：

```ts
await expect(page.getByRole('status')).toHaveText('报名成功')
```

#### 精确控制 Pending 状态

如果 Promise 立即 resolve，测试可能根本观察不到 Pending。可以创建可控 Promise：

```ts
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(next => {
    resolve = next
  })
  return { promise, resolve }
}
```

测试先点击并断言按钮处于 Pending，再显式 `resolve()`，最后等待成功状态。这比人为延迟更快，也精确表达状态转换。

#### Fake Timer 只控制被替换的时钟

Fake Timer 适合 debounce、throttle、超时和定时轮询，但它不会自动完成 Fetch、Vue 更新队列或所有 Promise microtask。使用后必须恢复真实 timer。

`user-event` 自身也可能调度 timer。与 Fake Timer 组合时，应把测试运行器的推进函数传给 `userEvent.setup({ advanceTimers })`，不要用 `delay: null` 粗暴绕过交互语义。

#### 时间、随机和时区都应显式控制

- 领域函数注入 `now`；
- 依赖当前日期的模块使用可恢复的系统时间 Stub；
- ID/Random 由接口提供或使用固定种子；
- 日期测试明确时区，不依赖开发机 locale；
- 每个测试结束后恢复 Env、Global、Mock 和 Timer。

确定性不是“测试机器够稳定”，而是测试不依赖未声明的环境状态。

## 选择足够真实、又不过度昂贵的环境

### Vitest Projects 让不同测试使用不同环境

当前 Vitest 使用 `projects` 表达多项目配置；旧资料中的 `workspace` 名称已经被替代。示例把快速领域单测和 MSW 集成测试拆开：

<<< ../../../examples/frontend/testing-pipeline/vitest.config.mts

#### 为什么不让所有测试都运行在 jsdom

纯函数不需要 `window` 和 `document`。统一启用 DOM 模拟会：

- 增加启动与内存成本；
- 让本应属于 Node 的模块误用浏览器 global；
- 隐藏代码运行时边界；
- 让环境升级影响无关测试。

同样，不要把需要 DOM 的组件硬塞进 Node 环境后手写大量浏览器 API Stub。

#### `extends: true` 不是装饰

Vitest project 默认不会自动继承根配置的全部选项。示例显式使用 `extends: true`，让 `restoreMocks`、`unstubEnvs` 和 `unstubGlobals` 等公共约束进入项目。

若每个项目确实需要完全独立的插件、Alias 或设置，可以不继承，再显式声明。关键是理解最终配置，而不是假设根选项天然传播。

#### 测试隔离的不同层次

至少要考虑：

- Mock 调用记录和实现；
- 修改过的 Global、Env、Timer；
- 模块级可变状态；
- DOM 与事件监听器；
- MSW 运行时 Handler；
- Store、Router、Query Client；
- 数据库记录和测试账号。

`restoreMocks` 不能替你清理数据库，`server.resetHandlers()` 也不能恢复模块 Singleton。每种状态由拥有它的层负责清理。

### 组件测试：用户语义比 DOM 结构稳定

Testing Library 的核心原则跨 Vue、React 和原生 DOM 都成立：测试越接近用户使用方式，通常越能提供信心。

查询优先级通常是：

1. `getByRole(role, { name })`；
2. `getByLabelText()`；
3. 可见文本或表单当前值；
4. 只有缺乏合理语义时才使用 `data-testid`；
5. 避免用 class 和 DOM 层级作为默认选择器。

这不只是为了测试稳定。一个无法通过 Role 和 Accessible Name 找到的按钮，也可能真的难以被辅助技术理解。

#### 三类查询代表不同时间语义

| 查询 | 找不到时 | 是否重试 | 用途 |
| --- | --- | --- | --- |
| `getBy*` | 立即抛错 | 否 | 当前必须存在 |
| `queryBy*` | 返回 `null` | 否 | 断言当前不存在 |
| `findBy*` | 超时抛错 | 是 | 等待异步出现 |

不要把所有查询都写成 `findBy`。本应同步渲染的标题若一秒后才出现，测试可能掩盖性能或架构回归。

#### 模拟 DOM 与真实浏览器的边界

jsdom/happy-dom 很适合大量组件逻辑，但它们不是完整渲染引擎。以下能力应考虑真实浏览器测试：

- 布局、尺寸、滚动与 CSS 结果；
- Focus、Selection、复杂输入法和原生事件顺序；
- Canvas、媒体、部分 Observer；
- 浏览器权限、下载、导航和跨源行为；
- 只在真实引擎中出现的兼容性问题。

Vitest Browser Mode 适合仍想直接导入组件、共享 Vite 转换链的测试；Playwright E2E 则从已启动应用入口工作，不导入组件源码。两者真实程度与隔离边界不同。

### 网络集成：为什么使用 MSW 而不是替换 `fetch`

示例 HTTP Client 负责真实协议细节和运行时响应校验：

<<< ../../../examples/frontend/testing-pipeline/src/enrollment-client.ts

客户端没有在内部猜测 `window.location`，而是接收应用配置已经解析过的绝对 API 基址。这样浏览器、SSR 和 Node 测试使用同一份协议代码；Node 原生 `fetch` 也不会因 `/api/...` 这种相对 URL 缺少 origin 而在请求发出前失败。

若直接把 `fetch` Mock 成 `{ ok: true, json() {} }`，测试替身必须手工模仿 Response，而且容易遗漏 Header、Abort、Body、状态码和序列化行为。

MSW 在网络边界拦截请求。在 Node 集成中，它拦截当前进程发出的原生请求；应用代码仍调用真实 `fetch`，得到真实形状的 `Response`。

#### 默认 Handler 表达正常协议

<<< ../../../examples/frontend/testing-pipeline/tests/mocks/handlers.mts

Handler 根据真实请求的 Path、Header 和 JSON Body 决定响应。成功结果由幂等键派生，使测试能够通过客户端输出证明协议接线正确。

不要把大量 `expect(request...)` 塞进 Handler。若请求根本没有发生，Handler 内的断言也不会执行，测试可能产生假阳性。更可靠的做法是让响应行为依赖请求内容，再从被测系统的公开结果断言；若确实要记录请求，再在测试主体明确断言记录数量。

#### Node Server 与生命周期

<<< ../../../examples/frontend/testing-pipeline/tests/mocks/server.mts

<<< ../../../examples/frontend/testing-pipeline/tests/setup.mts

三个生命周期动作缺一不可：

- 所有测试前 `listen()`；
- 每个测试后 `resetHandlers()`，删除用例临时覆盖；
- 所有测试后 `close()`，恢复原生请求模块。

`onUnhandledRequest: 'error'` 很重要。若测试意外访问真实 API，应该立即失败，而不是悄悄依赖网络、测试环境数据或生产服务。

#### 每个测试只覆盖场景差异

<<< ../../../examples/frontend/testing-pipeline/tests/integration/enrollment-client.test.mts

默认 Handler 表达正常服务；错误用例通过 `server.use()` 临时覆盖，并在 `afterEach` 恢复。这样测试不依赖执行顺序。

这些测试分别证明：

- 请求协议正确时，响应被映射为可信领域对象；
- HTTP 409 被映射为带状态与消息的应用错误；
- 即使 HTTP 是 201，错误的 JSON 结构也不能穿过运行时边界。
- API 基址必须是可安全拼接资源路径的绝对 HTTP(S) 目录 URL。

TypeScript 只能检查编译期已知值，无法证明服务器实际发送的数据符合接口。外部 JSON 必须经过运行时校验。

### 契约测试位于 Mock 与真实 E2E 之间

MSW Handler 可能和前端一起写错：客户端期待错误字段，Mock 也返回同一个错误字段，测试依然通过。因此还需要防止 Mock 漂移。

常见策略包括：

- 由 OpenAPI / JSON Schema 生成或校验请求响应类型；
- 前后端共同执行 Schema compatibility checks；
- Consumer-driven contract tests；
- 对少量真实测试环境接口执行 smoke test；
- 让 Mock Handler 复用规范示例，而不是手写两份独立事实。

契约测试证明“双方对协议理解一致”，E2E 证明“部署后的系统能协作”。它们互补，不能仅靠 TypeScript 接口替代。

## 用真实浏览器验证完整用户旅程

Playwright 测试不直接 import 组件，也不读取内部 Store。它从浏览器页面入口开始：

<<< ../../../examples/frontend/testing-pipeline/e2e/enrollment.spec.mts

这里验证了：

- 构建后的路由能打开；
- 页面拿到后端准备的数据；
- 可访问名称和交互真实可用；
- 点击后前后端完成报名；
- UI 最终显示成功并禁止重复报名。

不要在 E2E 中重新覆盖领域规则的所有排列。昂贵的浏览器流程应集中在关键旅程、系统接线和高损失风险。

### Locator 是可重新求值的查询，不是旧 DOM 引用

Playwright Locator 会在动作与断言时重新查找元素，并等待元素达到可交互条件。优先使用 Role、Label、Text 等用户语义。

不要用：

```ts
await page.waitForTimeout(1000)
```

应该等待页面条件：

```ts
await expect(page.getByRole('status')).toHaveText('报名成功')
```

Playwright 的 Web-first assertions 会反复获取 Locator 并检查条件，直到成功或达到断言超时。普通 `expect(await locator.textContent()).toBe(...)` 不具备同样的自动重试语义。

### 一个测试一个 Browser Context

Playwright 默认用隔离的 Browser Context 运行测试，Cookie、Local Storage 与页面状态不会自然泄漏到下一条用例。不要为了“提速”让所有用例共享同一个 Page；这会产生顺序依赖，并让重试和并行执行变得困难。

浏览器隔离仍不会清除服务端数据库。服务端数据需要另一套所有权策略。

### E2E 数据隔离决定能否并行

示例通过自定义 Fixture 为每条测试创建唯一课程，并在结束时删除：

<<< ../../../examples/frontend/testing-pipeline/e2e/fixtures.mts

这比所有用例共用“测试课程 1”可靠，因为：

- 本地和 CI 可以同时运行；
- 两个 worker 不争抢名额；
- 重试不会继承第一次运行的脏状态；
- 测试失败后清理仍在 Fixture teardown 中执行。

#### Test-support API 必须有安全边界

示例假设测试环境提供 `/api/test-support/*` 来创建和清理数据。真实实现必须：

- 只在隔离的测试环境启用；
- 需要专用凭据或网络边界；
- 永远不能在生产环境暴露任意造数/删数能力；
- 记录数据所有者和 TTL，处理进程崩溃后未清理的数据；
- 支持并行 worker 的唯一命名空间。

测试便利不能成为生产后门。

#### 认证状态不是普通构建产物

Playwright 可以复用 `storageState` 加速登录，但其中可能包含能冒充用户的 Cookie 和 Header。认证状态目录必须忽略，不能提交到公开或私有仓库。

若测试会修改服务端状态，共享一个账号仍会相互干扰。此时应给每个并行 worker 独立账号，或让测试创建独立租户/资源。

### Playwright 配置：本地快速，CI 可诊断

<<< ../../../examples/frontend/testing-pipeline/playwright.config.mts

#### `webServer` 管理被测应用生命周期

配置由 Playwright 启动本地 preview server，并等待 URL 可用。本地可以复用已有服务，CI 必须从当前提交的生产构建启动新服务。

E2E 若只连开发者手动启动的 dev server，CI 很难复现；若只连长期共享测试站，又可能被其他部署和数据污染。针对 PR 的本地产物 + 隔离后端，通常更确定。

#### 重试是诊断机制，不是修复机制

示例仅在 CI 重试。Playwright 会把测试分类为：

- 首次通过：passed；
- 首次失败、重试通过：flaky；
- 所有尝试都失败：failed。

“重试后通过”仍然是需要治理的信号，不能把 required check 只看成绿色。不断提高 retries 只会延长流水线并掩盖竞态。

#### Trace 为什么放在第一次重试

每次都记录 Trace 会增加时间和制品体积；完全不记录又让 CI 偶发失败难以复盘。`trace: 'on-first-retry'` 在成本与诊断信息之间折中。

Trace 可以包含 DOM Snapshot、动作日志、Console、Network、截图和源码位置。它可能同时包含用户数据或接口响应，制品访问权限和保留时间也必须治理。

## 判断测试是否值得信任

### 覆盖率发现未执行代码，不证明行为正确

Vitest 示例使用 V8 coverage，并对 `src/**/*.ts` 设定基线：

```text
statement：语句是否执行
branch：if / switch / 条件表达式分支是否执行
function：函数是否调用
line：映射后的源码行是否执行
```

#### 为什么 `include` 很重要

若覆盖率只统计“测试过程中被 import 的文件”，一个从未被任何测试加载的文件可能根本不进入分母，报告看起来异常漂亮。

显式 `include: ['src/**/*.ts']` 让未执行的源文件也进入报告。生成代码、类型声明和不可执行入口再按明确理由排除。

#### 阈值是报警线，不是目标函数

统一 80% 可以防止覆盖率突然下降，却不能说明最危险路径已测试：

- 100% 行覆盖可能没有检查任何正确结果；
- 一条测试可执行所有行，却漏掉错误断言；
- 容易达到的 getter 拉高比例，支付异常路径却没覆盖；
- 为满足数字写的测试会增加维护成本而不增加信心。

更成熟的做法是：全局阈值防回退，关键领域包设更高要求，PR 同时关注 diff coverage，并用风险评审确认高损失路径。

#### Mutation Testing 能检测断言敏感度

变异测试会把 `<` 改成 `<=`、删除条件或替换返回值，再看测试是否失败。若变异存活，说明代码虽然被执行，测试却没有感知行为变化。

它比普通覆盖率昂贵，适合在关键领域包定期运行，而不是每次保存都全仓执行。

### Snapshot、视觉测试和可访问性测试

#### Snapshot 适合稳定、可审查的结构

Snapshot 不是“少写断言”的捷径。巨大组件树 Snapshot 常见问题：

- 无关属性变化制造大面积 diff；
- 评审者习惯直接更新；
- 失败只说明输出不同，不说明业务哪里错；
- 动态 ID、日期和顺序导致噪音。

适合 Snapshot 的内容包括小型序列化协议、稳定 AST、错误对象和经过筛选的结构。更新 Snapshot 前必须理解差异。

#### 视觉回归测试比较像素结果

视觉测试适合布局、主题、图表、字体和响应式断点，但基线受浏览器版本、字体、操作系统、动画和像素密度影响。需要固定运行环境、关闭非确定动画，并让 diff 进入人工评审。

#### 自动可访问性扫描只能发现一部分问题

自动扫描能发现缺失 Label、明显对比度和部分 ARIA 错误，却无法判断交互流程是否易懂、焦点顺序是否符合任务、替代文本是否真正有意义。

语义查询、自动扫描、键盘 E2E 与人工辅助技术测试应分层组合。

### Flaky Test 需要先分类根因

“偶尔失败”不是一个根因。常见类别包括：

| 类别 | 典型表现 | 治理方向 |
| --- | --- | --- |
| 时间竞态 | 固定 sleep、未 await | 等待可观察条件、控制 Promise |
| 状态泄漏 | 单独通过，整组失败 | 每测试重建状态、完整 teardown |
| 共享数据 | 并行时冲突 | 唯一资源、每 worker 账号 |
| 环境漂移 | 只在 CI/某浏览器失败 | 固定版本、记录环境、真实浏览器覆盖 |
| 不稳定选择器 | DOM 微调就失败 | Role/Label/稳定领域标识 |
| 外部依赖 | 第三方服务偶发失败 | 边界 Mock + 少量独立 smoke test |
| 资源不足 | 超时、进程崩溃 | 测量 worker、内存、CPU，合理分片 |

#### 不要永久隔离失败测试

临时 quarantine 必须有：

- 负责人；
- issue；
- 进入日期和删除期限；
- 仍能看见的非阻断运行；
- 根因数据。

把测试改成 `.skip` 而不跟踪，相当于删除门禁却保留一种“好像测过”的错觉。

#### 重复运行用于发现，不用于证明稳定

对可疑测试执行多次能提高复现概率，但连续通过 100 次不等于不存在竞态。仍需通过 Trace、日志、种子、worker 编号和资源指标定位未声明状态。

## 把可靠性带进 CI 和长期维护

### CI 如何分层执行测试

完整示例工作流：

<<< ../../../examples/frontend/testing-pipeline/.github/workflows/frontend-tests.yml

它把快速测试和 E2E 分成两个 job：

```text
unit-and-integration
  └─ npm ci → Vitest + coverage

e2e
  └─ npm ci → 安装 Chromium → build → Playwright → 上传报告
```

#### 为什么 E2E 单独成 job

- 需要浏览器和系统依赖；
- 超时与资源配置不同；
- 失败时需要 HTML Report/Trace 等制品；
- 可以按风险决定是否与快速检查并行；
- 后续更容易独立分片。

#### Sharding 之前先保证数据隔离

分片把测试集合分到多台机器，降低墙钟时间，但不会自动解决共享数据库和账号冲突。只有测试能独立、无序、并行运行后，分片才是安全优化。

合并分片报告时还要保存 shard 编号、重试次数和统一的 blob/report 制品，否则失败难以定位到具体执行环境。

#### Action 与制品安全

示例为可读性使用官方 Action 主版本标签。高安全要求的生产仓库应固定到经过验证的完整 commit SHA，并由依赖更新工具升级。

测试报告、Trace、Screenshot、Video 可能包含接口响应、账号信息和用户数据。工作流应使用最小权限，限制保留期，并避免把 Secret 打进日志或附件。

### 脚本是开发者与 CI 的共同入口

<<< ../../../examples/frontend/testing-pipeline/package-scripts.json

脚本按意图区分：

- `test`：本地 watch 反馈；
- `test:unit` / `test:integration`：定位单一项目；
- `test:coverage`：CI 快速层；
- `test:e2e`：无交互的 E2E；
- `test:e2e:ui`：本地调试；
- `test:ci`：完整顺序验证。

不要让 CI 使用一套只有 YAML 知道的神秘参数。开发者应该能在本地调用相同底层 script 复现。

CI 与本地还应读取同一个 Node.js 版本入口：

<<< ../../../examples/frontend/testing-pipeline/.node-version

测试输出目录和敏感认证状态需要忽略：

<<< ../../../examples/frontend/testing-pipeline/.gitignore.example

### 测试性能优化的正确顺序

测试慢时先测量，再优化：

1. 找出最慢文件、Hook 和环境启动；
2. 检查是否把所有测试放进 DOM 或浏览器；
3. 删除任意 sleep 和真实网络依赖；
4. 把纯规则下沉到 Node 单测；
5. 减少重复应用启动和不必要 Fixture；
6. 确认测试真正隔离后，再增加 worker；
7. CI 墙钟时间仍长，再做项目并行和 sharding；
8. Coverage、视觉与 Mutation 等昂贵检查按风险设定频率。

不要通过关闭隔离、共享 Page 或让测试依赖顺序换取表面速度。那是在用稳定性偿还性能债务。

### 测试代码也是生产资产

测试代码决定团队是否敢重构，也需要质量约束：

- 启用 TypeScript 与 lint；
- Helper 和 Fixture 有清晰所有权；
- 不在用例间共享可变对象；
- 自定义 Matcher 提供领域化失败信息；
- Page Object 封装稳定页面能力，不隐藏所有断言；
- 删除重复、失效和永远不会失败的断言；
- 评审测试是否覆盖需求风险，而不只看生产 diff。

Page Object 若变成数千行“点击第几个 div”的脚本库，只是集中脆弱性。它应暴露用户任务，例如 `enrollmentPage.enroll()`，并保留测试主体对业务结果的可见断言。

### 迁移现有 Vue 2 项目的落地顺序

对于已有三年历史、测试较少的 Vue 2 项目，不建议先追求全仓覆盖率：

1. 记录线上事故、频繁回归和高改动模块；
2. 为纯业务规则建立 Vitest 单测，不依赖 Vue；
3. 给正在修改的组件补公共行为测试；
4. 把 HTTP Client 集中到服务边界，用 MSW 验证协议；
5. 为登录、支付、核心提交等路径建立少量 Playwright E2E；
6. 让 CI 先稳定执行，再建立不会倒退的覆盖率基线；
7. 新功能要求测试，旧代码随修改逐步纳入；
8. 统计 flaky、耗时和失败类别，持续治理测试本身。

Vue 2 组件可以使用与其版本兼容的 Vue Test Utils；纯函数、MSW 与 Playwright 的大部分工程原则不依赖 Vue 主版本。迁移 Vue 3 时，保持用户契约的测试往往比断言组件实例内部的测试更容易复用。

### 完整示例目录

```text
examples/frontend/testing-pipeline/
├── .github/workflows/frontend-tests.yml
├── .gitignore.example
├── .node-version
├── e2e/
│   ├── enrollment.spec.mts
│   └── fixtures.mts
├── package-scripts.json
├── playwright.config.mts
├── src/
│   ├── enrollment-client.ts
│   └── enrollment-policy.ts
├── tests/
│   ├── integration/enrollment-client.test.mts
│   ├── mocks/
│   │   ├── handlers.mts
│   │   └── server.mts
│   ├── setup.mts
│   └── unit/enrollment-policy.test.mts
└── vitest.config.mts
```

迁入真实项目时，应根据锁文件安装匹配版本的 `vitest`、coverage provider、MSW、Playwright、框架组件测试库和 DOM 环境。Vitest、Vite 与 Node.js 有明确兼容要求，不能孤立复制最新配置到旧项目。

### 上线前检查清单

#### 测试选择

- 每条测试对应明确风险，而不是机械对应文件；
- 大量边界组合落在纯函数测试；
- 关键接线由集成测试覆盖；
- E2E 集中在高价值用户旅程；
- 没有在每一层重复相同细节。

#### 确定性

- 不用固定 sleep 等待异步完成；
- 时间、随机、Env 和 Global 可控并恢复；
- 每个测试拥有独立 Store、Router 和 Mock Handler；
- E2E 数据与账号支持并行；
- 未处理网络请求会使测试失败。

#### 可维护性

- 断言公共行为而非内部状态；
- 查询优先使用 Role、Label 与可见名称；
- Builder 默认值小而合法；
- Snapshot 足够小且能人工审查；
- Fixture/Page Object 没有隐藏关键业务断言。

#### CI 与诊断

- 本地与 CI 调用相同 scripts；
- 快速测试与 E2E 的环境和超时分开；
- 重试通过仍被记录为 flaky；
- 失败保留适量 Trace/Report，且不泄露敏感数据；
- 覆盖率包含未被 import 的源文件；
- 分片建立在真正隔离的测试之上。

## 小结

成熟测试体系的核心不是工具数量，而是边界与因果：

- 用风险决定测试层，而不是用文件数量决定用例数量；
- 用纯函数覆盖大量领域边界；
- 用组件测试观察用户语义；
- 用 MSW 验证真实网络协议行为；
- 用契约测试防止 Mock 与服务端漂移；
- 用少量 Playwright E2E 验证完整用户旅程和部署形态；
- 用数据所有权、条件等待和状态清理消除不确定性；
- 用覆盖率发现盲区，而不是把数字当正确性证明；
- 用 CI、Trace 和失败分类形成可治理的反馈系统。

## 参考资料

- [Vitest：Test Projects](https://vitest.dev/guide/projects.html)
- [Vitest：Browser Mode](https://vitest.dev/guide/browser/)
- [Vitest：Coverage](https://vitest.dev/guide/coverage)
- [Vitest：Mocking](https://vitest.dev/guide/mocking.html)
- [Testing Library：About Queries](https://testing-library.com/docs/queries/about/)
- [Testing Library：Guiding Principles](https://testing-library.com/docs/guiding-principles/)
- [MSW：Node.js integration](https://mswjs.io/docs/integrations/node/)
- [MSW：Avoid request assertions](https://mswjs.io/docs/best-practices/avoid-request-assertions)
- [Playwright：Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright：Assertions](https://playwright.dev/docs/test-assertions)
- [Playwright：Retries](https://playwright.dev/docs/test-retries)
- [Playwright：Trace Viewer](https://playwright.dev/docs/trace-viewer)
- [Playwright：Authentication](https://playwright.dev/docs/auth)
- [Playwright：Web server](https://playwright.dev/docs/test-webserver)

下一节：[前端性能：Core Web Vitals、RUM 与性能预算](./frontend-performance-core-web-vitals-rum-and-budgets.md)
