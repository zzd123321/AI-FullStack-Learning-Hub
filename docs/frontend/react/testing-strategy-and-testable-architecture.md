---
title: React 测试策略与可测试架构
description: 从风险与信心出发，用纯单元、组件、HTTP、Router 和 E2E 测试建立可靠验证体系
outline: deep
---

# React 测试策略与可测试架构

> 资料基线：React 19.2、Testing Library `user-event` 14、Vitest 4、MSW 2 与当前稳定版 Playwright Test。测试工具更新较快，配置、Timer 与 Mock 行为必须以项目锁文件对应版本为准。

测试课程最容易变成 API 清单：`getByRole` 怎么写、`vi.mock` 怎么写、Playwright 怎么点按钮。但真正困难的问题是：我们想对哪种风险建立信心，应该在哪个边界用最低成本证明它？

一条测试的价值可以粗略理解为：

```text
价值 ≈ 能发现的重要风险 × 接近真实使用方式 × 稳定性
       ─────────────────────────────────────────
                   执行与维护成本
```

覆盖组件内部 State 和 Hook 调用次数的测试可能很多，却会在安全重构时全部破碎。相反，一条“用户点击报名，服务收到正确课程 ID，页面显示成功”的测试更接近产品契约。

## 先把风险放到合适的测试层

测试层级不是必须遵守固定比例的金字塔。应该为每个风险选择最便宜、但证据足够直接的边界。

| 层级 | 擅长证明 | 不能充分证明 |
| --- | --- | --- |
| 纯单元 | 领域规则、解析、Reducer、边界组合 | DOM、网络和框架装配 |
| 组件 | React 交互、ARIA、Pending、错误 UI | 真布局、浏览器兼容、后端 |
| HTTP 集成 | URL、Method、Body、状态码和响应解析 | 真服务器、Cookie/代理全链路 |
| Router 集成 | Loader、Action、导航和错误边界接线 | 浏览器 History 与部署 Rewrite |
| Browser Component | Focus、Selection、Observer、CSS/布局 | 完整后端和跨页面流程 |
| E2E | 浏览器、部署、服务端和持久化共同工作 | 大量异常排列，成本较高 |

同一规则不用在每层复制所有组合。报名资格的边界排列放在快速纯函数测试；组件只确认拒绝原因正确显示；E2E 保留少量关键业务路径。

测试应回答可观察问题：

- 用户能否完成任务？
- 领域规则在边界值上是否正确？
- HTTP 请求和响应契约是否正确？
- 失败、取消、重试与乱序是否安全？
- Router 和数据失效是否正确连接？
- 服务端写入在刷新后是否仍然存在？

组件从 `useState` 改成 Reducer，只要行为不变，测试就不应失败。

## 可测试性首先是生产架构的结果

示例领域类型：

<<< ../../../examples/frontend/react-testing-architecture/types.ts

容易测试的代码通常同时具备：

- 领域决策是纯函数，而不是散在 JSX 条件中；
- 网络、时间、随机数和 Storage 集中在外部边界；
- 组件接收小型领域服务接口，不在深处硬编码可变单例；
- Router 配置可由依赖创建，生产和测试只替换运行环境；
- 状态是互斥联合，不是多个矛盾 Boolean；
- UI 有真实 Label、Role、Accessible Name 和状态通告。

这些设计首先让生产代码更清楚，测试只是自然获得接缝。不要为了测试额外暴露 `setStateForTest()`、私有 Ref 或组件实例。

### 什么值得依赖注入

适合替换的是有环境差异、失败模式或副作用的能力：

- HTTP/GraphQL Client；
- Clock、Random 与 ID Generator；
- Analytics、Feature Flag；
- Storage、Clipboard 和 Observer Adapter；
- Repository、Router 等应用边界。

不必把每个纯格式化函数都变成 Prop。简单模块单例也不是绝对错误，只是测试时要承担 Module Mock、缓存重置和 Hoist 的额外成本。

## 第一层：用纯函数穷举领域规则

报名资格与用户提示：

<<< ../../../examples/frontend/react-testing-architecture/enrollment-policy.ts

测试 Builder 给出一份合法默认对象：

<<< ../../../examples/frontend/react-testing-architecture/test-builders.ts

表驱动测试只覆盖与当前场景相关的字段：

<<< ../../../examples/frontend/react-testing-architecture/enrollment-policy.test.mts

纯函数测试不需要 DOM、React、Provider 或网络，因此很适合大量边界组合。失败信息也直接指向领域规则。

Builder 的默认值必须合法且语义清楚。一个同时包含用户、订单、权限和支付的巨大 Fixture，会让无关 Schema 改动污染整套测试。下面的 Override 一眼就能看到场景只关心名额：

```ts
buildLesson({ seatsRemaining: 0 })
```

Expected 应是具体业务结果，不要在测试里复制同一套 `if` 重新计算预期，否则实现和测试可能一起犯错。

## Service 是进程外副作用的接缝

接口与真实 Fetch Adapter：

<<< ../../../examples/frontend/react-testing-architecture/enrollment-service.ts

组件依赖 `EnrollmentService`，组件测试可传最小 Stub；HTTP 集成测试则传真实 Adapter 并让 MSW 拦截网络。这样同一个架构允许选择不同证据强度。

真实 Adapter 仍不能信任 TypeScript 泛型。示例先接收 `unknown`，逐字段校验课程和报名回执，还确认详情/回执 ID 与请求 ID 一致。Node/jsdom 的原生 Fetch 不接受相对 URL，因此 Adapter 把路径解析为当前同源绝对 URL；浏览器与测试仍走同一协议。

状态码与结构错误含义不同：409 可以映射为“名额刚刚变化”，200 但 JSON 畸形则是契约破坏，应进入错误监控。测试层应分别覆盖。

## 组件测试只观察用户契约

报名组件：

<<< ../../../examples/frontend/react-testing-architecture/EnrollmentPanel.tsx

它对用户暴露的行为是：

- 标题和剩余名额可见；
- 不满足资格时按钮 Disabled，并解释原因；
- 请求期间显示“报名中”，阻止同一按钮重复提交；
- Service 收到课程 ID 与 AbortSignal；
- 成功使用 Status，失败使用 Alert；
- 组件离开或同一实例切换课程时取消旧请求；提交状态携带课程身份，即使某个 Client 忽略 Abort，旧结果也不能污染新课程 UI。

测试不需要知道 `SubmitState` 使用 State、Reducer 还是状态机，也不应通过 CSS Class 猜 Pending。

### Query 应尽量与用户感知一致

优先顺序通常是：

1. `getByRole(role, { name })`；
2. `getByLabelText()`、`getByPlaceholderText()`；
3. `getByText()`、`getByDisplayValue()`；
4. 没有合理语义时才用 `getByTestId()`。

```ts
screen.getByRole('button', { name: '立即报名' })
```

它同时验证元素是按钮且有可访问名称，比 `.primary-button` 更抗 DOM 重构。Canvas、拖拽 Handle 和可视化内部节点可能需要稳定 Test ID，但它应是显式测试契约，不是默认选择器。

### 同步存在、当前不存在与异步出现

| Query | 找不到时 | 是否重试 | 用途 |
| --- | --- | --- | --- |
| `getBy*` | 立即抛错 | 否 | 当前必须存在 |
| `queryBy*` | 返回 `null` | 否 | 断言当前不存在 |
| `findBy*` | 超时抛错 | 是 | 等待异步出现 |

多元素版本分别是 `getAllBy*`、`queryAllBy*` 和 `findAllBy*`。匹配多个元素时，单元素 Query 会失败，这能防止测试静默操作错误目标。

```ts
expect(screen.queryByRole('alert')).not.toBeInTheDocument()
expect(await screen.findByRole('status')).toHaveTextContent('报名成功')
```

不要所有内容都用 `findBy`，否则本应同步出现的回归会被重试时间掩盖。`waitFor` 适合等待调用次数或组合条件，其回调必须通过抛出 Assertion Error触发重试：

```ts
await waitFor(() => expect(save).toHaveBeenCalledOnce())
```

不要在 `waitFor` 回调里 Click，因为回调可能执行多次。

### `user-event` 表达一次完整交互

`fireEvent` 只派发指定底层事件；真实输入包含 Focus、Keyboard、BeforeInput、Input 和 Selection 等步骤。推荐每个测试创建 User Session，并等待每个操作：

```ts
const user = userEvent.setup()
render(<Form />)

await user.type(screen.getByLabelText('标题'), 'React')
await user.click(screen.getByRole('button', { name: '保存' }))
```

忘记 `await` 会让断言与仍在进行的更新竞争。特定 Drag/Drop、Resize 或自定义底层事件在 `user-event` 尚不支持时仍可使用 `fireEvent`，但测试要明确承担更低层假设。

## 可控 Promise 比任意 Sleep 更可靠

测试辅助函数统一 User、Render、Service Stub 和 Deferred Promise：

<<< ../../../examples/frontend/react-testing-architecture/test-utils.tsx

组件测试：

<<< ../../../examples/frontend/react-testing-architecture/EnrollmentPanel.test.tsx

除成功、资格拒绝和失败外，测试还在请求 Pending 时把同一组件切换到另一课程：旧 Signal 必须 Abort，随后即使旧 Promise Resolve，新页面也不能出现旧报名编号。这类用例比单纯断言“调用过 abort”更完整，因为它同时验证资源释放与 UI 写权限。

如果 Mock 立即 Resolve，Pending UI 可能一闪而过，测试无法稳定观察；如果写 `setTimeout(1000)`，测试变慢且依赖机器速度。Deferred Promise 把外部响应时刻交给测试：

```text
用户点击
  → Promise 保持 Pending
  → 断言按钮 Disabled、Service 参数
  → 测试显式 Resolve
  → 等待成功 Status
```

一次行为可以有多个相关断言，不必机械限制“一个测试只能一个 Expect”。应避免的是一个测试串联五个无关业务场景，前一步失败后其余问题全部失去诊断价值。

### `act()` 完成一次 React 更新单位

Testing Library 的 Render、`user-event` 和异步 Query 已经集成 `act`，通常不需要再手工包一层。出现 Warning 时不要隐藏 Console；它常表示测试结束时还有未等待更新。

常见原因：

- 忘记等待 `user.click/type()`；
- Deferred Promise 在测试结束后才完成；
- Timer 在断言后更新 State；
- 订阅、请求或 Router 没清理；
- 直接调用 Hook Setter 却没在 `act` 中推进。

手动 `act` 适合测试直接控制的非用户更新，例如 Fake Timer：

```ts
act(() => vi.advanceTimersByTime(300))
```

React 官方建议使用异步 `act` 作为一般形式。不要用 `act(async () => sleep())` 猜完成时间，应等待可观察结果或直接控制异步源。

## Timer 测试要同时管理宏任务与用户事件

Debounce Hook：

<<< ../../../examples/frontend/react-testing-architecture/useDebouncedValue.mts

Timer 测试：

<<< ../../../examples/frontend/react-testing-architecture/useDebouncedValue.test.tsx

测试证明旧 Timer 在依赖变化时被 Cleanup，只有最后一个值经过完整延迟才发布。每例恢复 Real Timer，避免影响其他测试。

Fake Timer 不会自动完成所有 Promise/Microtask。`user-event` 自己也可能使用 Timer；二者组合时应配置：

```ts
const user = userEvent.setup({
  advanceTimers: vi.advanceTimersByTime,
})
```

不要把 `delay: null` 当成修复挂起的捷径，也不要无条件 `runAllTimers()` 跳过真实交互步骤。

Hook 只是单个组件的小细节时，优先通过组件行为测试。只有 Hook 有公共复杂契约、多个消费者或精确时间状态时，`renderHook` 才更有价值。

## HTTP 集成测试保留真实协议形状

直接替换 `EnrollmentService` 很适合组件隔离，却不能证明真实 Adapter 是否正确构造 URL、Method、Credentials、Body，或怎样解释 409、500 与错误 JSON。

MSW 在协议层拦截请求，应用继续运行真实 Fetch 和 Service。Vitest 官方也推荐这种方式。

Handlers：

<<< ../../../examples/frontend/react-testing-architecture/msw-handlers.mts

Node Server 与全局 Setup：

<<< ../../../examples/frontend/react-testing-architecture/test-server.mts

<<< ../../../examples/frontend/react-testing-architecture/setup-tests.mts

`onUnhandledRequest: 'error'` 让未声明请求立即失败，避免测试意外访问开发服务或公网。每例 `resetHandlers()` 清除局部覆盖，DOM Cleanup 和 Mock/Timer 也要分别恢复。

### 用同一个组件验证成功、错误与重试

课程目录：

<<< ../../../examples/frontend/react-testing-architecture/LessonCatalog.tsx

网络集成测试：

<<< ../../../examples/frontend/react-testing-architecture/LessonCatalog.integration.test.tsx

它验证真实 Fetch Adapter 与组件组合：初始 Loading、成功 List、首次 503、用户重试和空状态。组件 Cleanup 同时 Abort 并设置 `ignore`，即使测试替身忽略 Signal，旧 Promise 也不能覆盖新请求结果。

还应按风险补充：

- 200 但 JSON 畸形进入可观测错误；
- Unmount 后 Signal Abort 且没有错误提示；
- 401 会话过期、409 冲突和 Retry-After；
- 首次请求晚于重试完成时，新结果不被覆盖。

## Router 应作为完整应用边界测试

Route Tree、Loader、Action 和页面共享一份配置：

<<< ../../../examples/frontend/react-testing-architecture/router.tsx

生产创建 Browser Router，测试用同一 Route Objects 创建 Memory Router。替换的是 History 环境和初始 URL，不是复制一套业务路由。

集成测试：

<<< ../../../examples/frontend/react-testing-architecture/router.integration.test.tsx

它证明：

```text
Initial URL
  → Route Match
  → Loader 调用 Service
  → Heading Render
  → 用户提交 Form
  → Action 调用 Service
  → Action Data / Revalidation
  → Status UI
```

404 用例明确让 Service 抛 Route Response，因此断言“课程不存在”；普通 Error 则应得到安全的通用错误。Action 遇到导航取消时继续抛出 Abort，而不是转换成“报名失败”。

复杂 Params 解析适合直接测试 Loader/Action 函数；Memory Router 适合证明配置、导航、错误边界和 UI 确实接好。二者证据不同。

## Mock 应放在被测目标之外

术语不必教条，但目的要清楚：

- Stub：提供固定输出；
- Spy：观察函数调用；
- Mock：替换行为并验证交互；
- Fake：能工作的轻量实现，例如内存 Repository。

`vi.mock()` 会被转换并提升，Factory 时机和普通代码不同；Vitest Browser Mode 还受原生 ESM 约束。优先顺序通常是：

1. 参数或 Provider 依赖注入；
2. HTTP 使用 MSW；
3. 时间使用 Fake Timer 或 Clock Adapter；
4. 只有难注入的第三方模块才用 Module Mock。

不要 Mock React Hook 来让组件进入某状态。应通过公开 Props、Provider、Router 或用户交互建立状态。

`mockClear`、`mockReset` 与 `mockRestore` 的细节会随 Vitest/Jest 版本不同。即使配置 `restoreMocks: true`，MSW Handler、Timer、DOM、Storage、数据库和自建 Singleton 仍要分别清理。

## Snapshot 和 Coverage 只提供有限证据

巨大页面 Snapshot 常包含无关 DOM，Review 时容易被直接更新。Snapshot 更适合小而稳定的序列化结果，例如 AST 转换、设计 Token 或有限 Error Payload。更新前必须阅读 Diff，不能把 `-u` 当修复命令。

Vitest 配置：

<<< ../../../examples/frontend/react-testing-architecture/vitest.config.mts

Statement、Branch、Function 和 Line Coverage 只说明代码执行过，不证明断言正确：

```ts
render(<Checkout />) // 可能覆盖很多行，却没有验证结果
```

领域核心可以设置更高 Branch 门槛，薄 UI Adapter 不必追求 100%。Coverage Report 更像风险地图：查看未覆盖分支是否重要。对关键规则还可以使用 Mutation Testing，检查测试能否杀死错误实现。

## jsdom 不是完整浏览器

jsdom 快速且适合多数 DOM 行为，但它没有真实 Layout、Paint 和像素；`getBoundingClientRect`、Resize/Intersection Observer、Selection、Clipboard、字体和滚动行为都可能不完整。

涉及布局、Canvas、ContentEditable、Observer、拖拽或浏览器兼容时，使用 Vitest Browser Mode、Playwright Component 或 E2E。不要不断堆 jsdom Mock，最后自己维护一套不准确浏览器。

语义 Query 会推动 Role、Label 与 Accessible Name，但自动化可访问性扫描仍只能发现部分问题。组件测试应断言 Focus、Disabled、Alert/Status；E2E 覆盖键盘路径；关键流程还需要真实读屏与人工审计。

## E2E 证明浏览器与后端共同工作

Playwright 配置：

<<< ../../../examples/frontend/react-testing-architecture/playwright.config.mts

本专题不能修改根启动脚本，所以配置只声明 `baseURL`，假定应用与 API 已由本地编排或 CI 启动。不要伪造一个实际无法启动本示例的 `webServer.command`。

关键路径：

<<< ../../../examples/frontend/react-testing-architecture/lesson-enrollment.e2e.spec.mts

测试先通过受控 Test Support API 建立已知数据库和账号状态，再让浏览器访问真实 Route、提交真实报名接口，最后刷新页面，证明结果已经持久化，而不只是客户端显示一句成功。

Test Support API 只能存在于隔离测试环境，使用独立凭据与数据库，生产路由不可访问，否则造数据接口会成为越权入口。

### Browser Context 隔离不等于后端状态隔离

Playwright 每例创建新的 Browser Context，Cookie、LocalStorage 和 SessionStorage 不会串线。但数据库、消息队列和对象存储仍需：

- 每例独立 Tenant/User/ID Namespace；
- Fixture API 或数据库创建与清理；
- 并行 Worker 不共享可变记录；
- 任意顺序和单独运行都能通过。

不要让测试 B 依赖测试 A 先注册账号。

### Locator 与 Web-first Assertion 会等待条件

```ts
await page.getByRole('button', { name: '报名' }).click()
await expect(page.getByRole('status')).toHaveText('报名成功')
```

Locator 每次操作时重新解析当前 DOM，并检查目标唯一、可见、稳定、可接收事件和 Enabled。Web-first Assertion 自动重试到满足或超时。

`page.waitForTimeout(1000)` 在快机器浪费时间，在慢机器仍可能失败。Trace、Screenshot 和 Video 适合在失败/重试时保留；Retry 能收集诊断，却不能把长期 Flaky 测试变成可靠测试。

## Flaky Test 要按因果排查

| 症状 | 常见原因 | 正确方向 |
| --- | --- | --- |
| CI 偶发找不到元素 | 异步未等待 | `await user`、异步 Query、Web-first Assertion |
| 单独通过、全套失败 | 状态泄漏 | 恢复 Timer/Spy/Handler，销毁 Store，隔离数据库 |
| 排序、时间、ID 偶变 | 数据不确定 | 注入 Clock/ID，固定 Locale/Timezone |
| DOM 包装一改就失败 | 选择器脆弱 | Role/Label 或明确业务 Test ID |
| 并行时超时 | CPU/内存或共享资源竞争 | 调整 Worker、缩小 Fixture、隔离端口/数据 |
| 偶发看到旧响应 | 真产品竞态 | 检查 Abort、Request ID、事务和幂等 |

不要先加 Sleep 或无限提高 Timeout。有些 Flaky 测试正在正确发现产品竞态，重跑只会隐藏它。

## 完整示例与实际验证边界

应用 Router 所有权：

<<< ../../../examples/frontend/react-testing-architecture/App.tsx

浏览器入口：

<<< ../../../examples/frontend/react-testing-architecture/main.tsx

示例目录共 22 个文件，前文源码引用已经覆盖全部生产、测试与配置文件。

当前仓库没有 React、Vitest、Testing Library、MSW、React Router 与 Playwright 依赖，本专题也不修改根 `package.json`。因此：

- `examples/**/*.ts` 由仓库严格 TypeScript 检查覆盖；
- `.mts` 可做 Node 语法检查，但引用未安装测试包的文件无法真正执行；
- `.tsx` 进行源码和契约审查；
- 不会声称 Vitest、jsdom、Router 集成或 Playwright E2E 已实际运行。

真实项目接入这些示例时，必须按锁文件版本安装依赖，并让 CI 真正启动测试环境后执行完整套件。

## 本节小结

测试策略的核心不是 Mock 更多模块，而是为重要风险选择最便宜但足够直接的证据。纯函数覆盖领域边界，组件通过可访问 DOM 验证用户行为，MSW 保留 HTTP 协议，Memory Router 证明路由数据流，少量 Playwright E2E 证明浏览器、服务端与持久化共同工作。

异步必须由 Deferred Promise、Signal、Timer 或可重试断言精确控制；Mock 必须位于被测目标之外；Coverage 和 Snapshot 只能提供辅助线索；Flaky 必须当成测试设计或真实产品竞态处理。最好的可测试架构，也通常是所有权最清晰的生产架构。

下一课进入 [Server Components、Server Functions 与现代全栈边界](./server-components-functions-and-fullstack-boundaries.md)，区分 RSC、SSR、Hydration 和 Server Function，并讨论序列化、缓存、流式、安全和框架职责。

## 延伸阅读

- [React：`act`](https://react.dev/reference/react/act)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Testing Library：Queries](https://testing-library.com/docs/queries/about/)
- [Testing Library：Async Methods](https://testing-library.com/docs/dom-testing-library/api-async/)
- [Testing Library：user-event](https://testing-library.com/docs/user-event/intro/)
- [Vitest：Mocking Requests](https://vitest.dev/guide/mocking/requests)
- [Vitest：Mocking](https://vitest.dev/guide/mocking)
- [Vitest：Coverage](https://vitest.dev/guide/coverage)
- [MSW Documentation](https://mswjs.io/docs/)
- [React Router：Testing](https://reactrouter.com/start/data/testing)
- [Playwright：Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright：Locators](https://playwright.dev/docs/locators)
- [Playwright：Isolation](https://playwright.dev/docs/browser-contexts)
