---
title: 测试策略与可测试架构
description: 使用 Vitest、Testing Library、MSW、React Router Memory Router 与 Playwright 建立可靠的 React 测试体系
---

# 测试策略与可测试架构

> 资料基线：React 19.2、Testing Library `user-event` 14、Vitest 4、MSW 2 与当前稳定版 Playwright Test。测试工具更新较快，配置和 Mock 行为必须以项目锁文件对应版本为准。

## 1. 学习目标

完成本节后，你应该能够：

- 根据风险选择单元、组件、集成、浏览器组件与端到端测试。
- 把领域规则从 React 中抽离为可独立验证的纯函数。
- 使用语义 Query 和 `user-event` 从用户视角测试组件。
- 区分 `getBy*`、`queryBy*`、`findBy*` 与 `waitFor`。
- 正确等待 React 异步更新，理解 `act()` 的职责。
- 使用可控 Promise 精确断言 Pending，而非依赖任意 Sleep。
- 通过依赖注入控制领域服务，避免滥用模块 Mock。
- 使用 MSW 在 Fetch/HTTP 协议边界进行网络集成测试。
- 测试 Abort、错误、重试、空状态与乱序结果。
- 使用 Fake Timer 验证 Debounce，并避免 Timer 与 User Event 死锁。
- 使用 Memory Router 串联 Loader、Action、导航与错误边界。
- 使用 Playwright Locator、Web-first Assertion 和 Browser Context 隔离。
- 正确理解覆盖率、Snapshot、可访问性扫描和测试稳定性边界。
- 让应用架构天然形成可替换、可观测的测试接缝。

## 2. 测试目标不是行数，而是风险信心

一个测试的价值可以粗略理解为：

```text
Confidence = 失败时能发现的重要风险
             × 与真实使用方式的相似度
             × 稳定性
             ÷ 执行与维护成本
```

大量断言组件内部 State、私有方法和 Hook 调用次数的测试，可能覆盖率很高，却在安全重构时全部破碎。相反，一条从“点击报名”到“服务收到课程 ID、用户看到成功”的组件测试更接近产品契约。

测试应回答可观察问题：

- 用户能否完成任务？
- 领域规则是否在边界值上正确？
- 前后端协议是否正确编码和解释？
- 并发、失败、权限和重试是否安全？
- 路由、缓存和数据失效是否协同？

不要把实现方式本身当需求。例如组件从 `useState` 重构为 Reducer，只要可观察行为不变，测试不应失败。

## 3. 测试层级与责任

与其坚持固定“测试金字塔”比例，不如按风险选择最便宜且足够真实的边界：

| 层级 | 运行环境 | 擅长证明 | 无法充分证明 |
| --- | --- | --- | --- |
| 纯单元 | Node | 规则、解析、状态转换、边界组合 | DOM、浏览器与集成配置 |
| 组件 | jsdom/真实浏览器 | React 交互、ARIA、Pending、错误 UI | 真布局、浏览器兼容、后端 |
| 网络集成 | jsdom + MSW | Fetch 方法、URL、Body、响应映射 | 真服务器实现、代理、Cookie 全链路 |
| Router 集成 | Memory Router | Loader/Action/导航/错误边界 | Browser History 细节、部署 Rewrite |
| Browser Component | 真浏览器 | Focus、Selection、Observer、CSS/布局 | 完整后端和跨页面流程 |
| E2E | 浏览器 + 真系统 | 用户关键路径、部署与跨层契约 | 所有异常排列，速度较慢 |

同一行为不必在每层重复所有细节。领域规则的 20 个边界组合放纯函数测试；组件只验证关键规则被正确呈现；E2E 只保留高价值主路径和少量致命失败路径。

## 4. 可测试性来自架构，不来自特殊 API

本课领域模型：

<<< ../../../examples/frontend/react-testing-architecture/types.ts

可测试架构通常具有这些特征：

- 领域决策是纯函数，而不是藏在 JSX 条件中。
- 时间、随机数、网络、Storage 等副作用集中在边界。
- 组件接收领域服务接口，而不是在深处硬编码 Singleton。
- Router 配置可由依赖创建，生产和测试只替换运行环境。
- 状态是互斥联合，而不是多个相互矛盾的 Boolean。
- UI 有真实 Label、Role、Name 和状态通告。

这些设计首先改善生产代码的边界与可维护性，测试只是自然受益。不要为了测试暴露 `setStateForTest()`、私有 Ref 或组件实例。

## 5. 第一层：纯领域规则

报名资格与提示映射：

<<< ../../../examples/frontend/react-testing-architecture/enrollment-policy.ts

测试数据 Builder 提供合理默认值，只覆盖与当前场景相关的字段：

<<< ../../../examples/frontend/react-testing-architecture/test-builders.ts

表驱动测试：

<<< ../../../examples/frontend/react-testing-architecture/enrollment-policy.test.mts

纯函数测试的优势：

- 不需要 DOM、React、Provider 或网络。
- 快速覆盖边界组合和异常输入。
- 失败信息直接指向领域规则。
- 可用于前后端共享规范或属性测试。

### Builder 不是万能 Fixture

Builder 默认值必须合法且语义清楚。若一个全局巨大 Fixture 同时包含用户、订单、权限、课程和支付，测试会依赖大量无关字段，Schema 小改动就造成整库噪音。

Builder 的 Override 应尽量少：

```ts
buildLesson({ seatsRemaining: 0 })
```

读者一眼就知道该场景只关心名额。

### 不要复制实现

测试不要重新写一遍同样的 `if` 再计算 Expected。Expected 应是具体业务结果，或来自独立规范数据；否则实现和测试可能一起犯同一个错误。

## 6. Service 接缝：类型化依赖，而非全局替换

生产 Service 接口及真实 Fetch 适配器：

<<< ../../../examples/frontend/react-testing-architecture/enrollment-service.ts

组件依赖 `EnrollmentService`，测试可传入最小 Fake/Mock。这样 Mock 的是进程外副作用边界，不是 React、日期格式函数或被测模块内部实现。

依赖注入不意味着把每个纯函数都变成 Prop。适合注入的是有环境差异、失败模式或外部副作用的能力：

- HTTP/GraphQL Client。
- Clock、Random/ID Generator。
- Analytics、Feature Flag。
- Storage、Clipboard、Observer Adapter。
- Router/Repository 等应用边界。

模块级 Singleton 在简单应用可以接受，但测试需要模块 Mock、重置缓存和处理 Hoist，隔离成本更高。

## 7. 被测组件：只暴露用户契约

完整报名组件：

<<< ../../../examples/frontend/react-testing-architecture/EnrollmentPanel.tsx

它可观察的契约包括：

- 标题和剩余名额可见。
- 不满足资格时按钮 Disabled 并解释原因。
- 提交期间按钮变为“报名中”且禁止重复提交。
- Service 收到正确课程 ID 与 AbortSignal。
- 成功以 Status 通告，失败以 Alert 通告。
- 卸载时取消未完成请求。

测试不需要知道 `SubmitState` 是 State、Reducer 还是状态机，也不应查询 CSS Class 来猜 Pending。

## 8. Testing Library Query 优先级

优先使用用户和辅助技术能感知的语义：

1. `getByRole(role, { name })`。
2. `getByLabelText()`、`getByPlaceholderText()`。
3. `getByText()`、`getByDisplayValue()`。
4. 只有缺乏合理语义时才用 `getByTestId()`。

`Role + Accessible Name` 同时验证元素类型与名称。例如：

```ts
screen.getByRole('button', { name: '立即报名' })
```

比 `container.querySelector('.primary')` 更抗 DOM 重构，也会暴露按钮没有可访问名称的问题。

`data-testid` 并非绝对禁止。Canvas、无语义的拖拽 Handle、动态可视化节点可能需要稳定测试标识；它应是逃生口，而不是默认选择器。

## 9. `getBy`、`queryBy`、`findBy`

| Query | 找不到 | 多个匹配 | 重试 | 典型用途 |
| --- | --- | --- | --- | --- |
| `getBy*` | 立即抛错 | 抛错 | 否 | 当前必须存在 |
| `queryBy*` | 返回 `null` | 抛错 | 否 | 断言当前不存在 |
| `findBy*` | 超时抛错 | 超时抛错 | 是 | 等待异步出现 |
| `getAllBy*` | 抛错 | 返回数组 | 否 | 当前至少一个 |
| `queryAllBy*` | 返回空数组 | 返回数组 | 否 | 可为零个 |
| `findAllBy*` | 超时抛错 | 返回数组 | 是 | 等待至少一个 |

正确写法：

```ts
expect(screen.queryByRole('alert')).not.toBeInTheDocument()
expect(await screen.findByRole('status')).toHaveTextContent('报名成功')
```

不要用 `getByRole` 断言不存在，因为它会先抛错；也不要所有内容都 `findBy`，否则本应同步出现的回归会被一秒重试掩盖。

`findBy` 本质是 Query 加 `waitFor`。`waitFor` 回调必须通过抛出 Assertion Error 触发重试；返回 `false` 不会等待：

```ts
await waitFor(() => expect(save).toHaveBeenCalledOnce())
```

等待消失使用 `waitForElementToBeRemoved`，传入元素或返回元素的回调。若元素调用前已经消失，它会报错，因而应先确认 Loading 存在。

## 10. `user-event` 模拟完整交互

`fireEvent` 只派发指定底层事件；真实输入通常涉及 Focus、Keyboard、BeforeInput、Input、Selection 等多个步骤。`user-event` 14 会模拟更完整交互，并检查元素是否可见、可交互或 Disabled。

推荐每个测试创建实例并等待操作：

```ts
const user = userEvent.setup()
render(<Form />)
await user.type(screen.getByLabelText('标题'), 'React')
await user.click(screen.getByRole('button', { name: '保存' }))
```

不要忘记 `await`。用户操作可能跨多个异步步骤，不等待会导致断言与更新竞争。

`fireEvent` 仍适合 `user-event` 尚未实现、且业务明确依赖的低层事件，例如特定 Drag/Drop、Resize 或自定义浏览器事件。此时测试必须承担更精确的事件假设。

## 11. 测试工具与可控异步

测试辅助函数统一 Render、User 和类型化 Service Stub：

<<< ../../../examples/frontend/react-testing-architecture/test-utils.tsx

组件交互测试：

<<< ../../../examples/frontend/react-testing-architecture/EnrollmentPanel.test.tsx

### 为什么使用 Deferred Promise

若 Mock 直接 `mockResolvedValue()`，Promise 可能太快完成，测试无法稳定观察 Pending。若使用 `setTimeout(1000)`，测试又会变慢且依赖时机。

Deferred Promise 把控制权交给测试：

```text
点击 → Promise 保持 Pending → 断言 Disabled/文案
→ 测试显式 Resolve → 等待成功 UI
```

这不是实现细节，而是在精确控制外部系统何时响应。

### 每个测试只断言一件事吗？

不必机械限制单个 Expect。一次用户行为可合理断言相关结果：按钮 Pending、Service 参数、最终 Status。应避免的是一个测试串联五个互不相关场景，导致前一步失败阻断所有诊断。

## 12. `act()`：完成一次 UI 更新单位

React 的 `act(async () => ...)` 会让相关更新在断言前被处理。React 官方建议使用异步形式；同步 `act` 将来会移除。

Testing Library 的 Render、`user-event`、`findBy` 等常用帮助函数已经正确集成 `act`，一般不需要手动包裹。出现 Act Warning 时不要第一反应隐藏 Console：它通常意味着测试触发了未等待的更新。

手动 `act` 适合测试直接控制的非用户更新，例如推进 Fake Timer：

```ts
act(() => vi.advanceTimersByTime(300))
```

常见 Warning 原因：

- 忘记 `await user.click/type()`。
- Promise 在测试结束后才 Resolve。
- Timer 在断言后触发 State Update。
- 未清理订阅或请求。
- 直接调用 Hook 返回的 Setter，却没使用 `act`。

不要用 `await act(async () => sleep())` 猜测完成时间；等待用户可观察结果或显式控制 Promise。

## 13. Hook 测试与 Fake Timer

Debounce Hook：

<<< ../../../examples/frontend/react-testing-architecture/useDebouncedValue.mts

Timer 测试：

<<< ../../../examples/frontend/react-testing-architecture/useDebouncedValue.test.tsx

测试验证旧 Timer 被 Cleanup，只有最后值在完整延迟后发布。每例结束恢复 Real Timer，避免污染后续测试。

### Fake Timer 的边界

Fake Timer 会替换 `setTimeout/setInterval/Date` 等时钟能力，但不会自动完成所有 Promise/Microtask。Vitest 对 `nextTick/queueMicrotask` 也有独立选项。

`user-event` 内部可能使用 Timer。两者组合时应通过 `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })` 告知如何推进；不要简单把 User Event 和 Fake Timer 混在一起再调用 `runAllTimers()`，容易产生挂起或跳过真实步骤。

若 Hook 只是组件内部小细节，优先通过使用它的组件行为测试。只有 Hook 有复杂公共契约、多个消费者或精确时间状态时，`renderHook` 才更有价值。

## 14. 网络边界：为什么选择 MSW

直接 `vi.mock('./enrollment-service')` 能隔离组件，但无法证明：

- URL 是否正确编码。
- Method、Header、Cookie 与 Body 是否正确。
- 204、409、500 或非法 JSON 如何解释。
- AbortSignal 是否传给 Fetch。

MSW 在网络协议层拦截请求，应用继续执行真实 Fetch 和 Service 代码。Vitest 官方也推荐 MSW 处理请求 Mock。

Handlers：

<<< ../../../examples/frontend/react-testing-architecture/msw-handlers.mts

Node 测试服务器：

<<< ../../../examples/frontend/react-testing-architecture/test-server.mts

全局 Setup：

<<< ../../../examples/frontend/react-testing-architecture/setup-tests.mts

`onUnhandledRequest: 'error'` 非常重要：未声明请求应让测试失败，而不是意外访问开发/公网服务或返回神秘 Network Error。每例 `resetHandlers()` 清除局部覆盖，避免测试顺序依赖。

## 15. Effect Fetch 与重试集成测试

课程目录组件：

<<< ../../../examples/frontend/react-testing-architecture/LessonCatalog.tsx

网络集成测试：

<<< ../../../examples/frontend/react-testing-architecture/LessonCatalog.integration.test.tsx

这里故意不 Mock `global.fetch`，而是验证真实 Service 与组件的组合。测试覆盖：

- 首帧 Loading。
- 成功响应映射为语义 List。
- 首次 503 显示 Alert。
- 用户点击重试后重新发请求。
- 空数组映射为空状态。

还可增加的重要边界：

- 返回畸形 JSON 时进入可观测错误。
- 组件卸载后请求被 Abort，且不显示错误。
- Retry-After、401 Session 过期、409 冲突。
- 首个请求晚于重试请求返回时，不覆盖新结果。

不要在 `waitFor` 回调中执行 Click 等副作用，因为它可能重试多次。先执行一次用户操作，再让 `waitFor/findBy` 只负责观察。

## 16. Mock、Stub、Fake 与 Spy

术语不必教条，但要清楚目的：

- **Stub**：提供预设输出，让被测对象能运行。
- **Spy**：观察真实或替换函数的调用。
- **Mock**：既替换行为，也验证交互期望。
- **Fake**：可工作的轻量实现，例如内存 Repository。

Vitest 常用能力：

- `vi.fn()` 创建可调用替身。
- `vi.spyOn(object, key)` 观察/替换现有方法。
- `mockClear()` 清调用记录，保留实现。
- `mockReset()` 清记录并重置实现。
- `mockRestore()` 恢复 Spy 原始 Property Descriptor。

Vitest 4 的 Restore 行为与旧版/Jest 并非完全相同，迁移时必须查版本文档。本课配置 `restoreMocks: true`，但 MSW Handler、Fake Timer、DOM、Storage 和自建 Singleton 仍需各自清理。

### Module Mock 要谨慎

`vi.mock()` 会被转换并提升，Factory 执行时机与普通代码不同；Browser Mode 又受原生 ESM 限制。优先使用：

1. 参数/Provider 依赖注入。
2. HTTP 用 MSW。
3. 时间用 Fake Timer/Clock Adapter。
4. 只有难以注入的第三方 Module 才做 Module Mock。

不要 Mock React Hook 来让组件进入某状态；通过公开 Props、Provider、Router 或用户交互建立状态。

## 17. Router 是一个集成边界

Route Tree、Loader、Action 和页面：

<<< ../../../examples/frontend/react-testing-architecture/router.tsx

生产使用 Browser Router，测试使用相同 Route Objects 创建 Memory Router。差异只有 History 环境和 Initial Entries，不复制业务路由。

Router 集成测试：

<<< ../../../examples/frontend/react-testing-architecture/router.integration.test.tsx

它验证完整链路：

```text
Initial URL
→ Route Match
→ Loader(service.getLesson)
→ Heading Render
→ 用户提交 <Form>
→ Action(service.enroll)
→ Action Data / Revalidation
→ Status UI
```

直接调用 Loader 单测适合复杂解析和 Response 状态；Memory Router 测试适合证明 Loader/Action 与 UI 配置正确连接。两者关注点不同。

错误测试应区分：

- Loader/Action 抛出的 Route Response。
- 未预期 Error。
- 404 与 500 的不同用户反馈。
- Parent/Child Error Boundary 的接管范围。

## 18. Snapshot 测试的合理边界

巨大页面 Snapshot 常见问题：

- 差异包含大量无关 DOM，Review 容易直接更新。
- 文案、顺序或动态 ID 造成噪音。
- Snapshot 通过不代表按钮可用、Label 正确或流程成功。

Snapshot 适合小而稳定的序列化结果，例如：

- AST/编译器转换输出。
- 复杂但稳定的 Error Payload。
- 设计系统 Token 或有限 DOM Fragment。

更新 Snapshot 前必须阅读 Diff，不能把 `-u` 当修复命令。用户关键行为仍用语义断言表达。

## 19. 覆盖率是地图，不是目标函数

Vitest 配置：

<<< ../../../examples/frontend/react-testing-architecture/vitest.config.mts

V8 与 Istanbul 都可生成 Coverage。Statement、Branch、Function、Line 覆盖只能说明代码是否被执行，不能说明断言有意义：

```ts
render(<Checkout />) // 可能覆盖很多行，却没验证任何结果
```

合理策略：

- 对纯领域核心设置较高 Branch 阈值。
- 对薄 UI Adapter 不追求 100%。
- 新代码阈值与全库阈值结合，防止历史债务阻断所有改动。
- 查看未覆盖分支是否代表真实风险。
- 对关键规则考虑 Mutation Testing，验证测试能否杀死错误变体。

为了覆盖率调用私有分支、断言实现细节，会降低测试质量。

## 20. jsdom、Browser Mode 与真实浏览器

jsdom 快速、适合大部分 DOM 行为，但它不是完整浏览器：

- 没有真实 Layout、Paint 和像素。
- `getBoundingClientRect` 通常没有真实几何意义。
- Resize/Intersection Observer、Selection、Clipboard 等需适配或 Polyfill。
- CSS、字体、Focus Scroll、原生表单细节可能不同。

涉及布局、Canvas、ContentEditable、Observer、拖拽和浏览器 API 时，使用 Vitest Browser Mode 或 Playwright Component/E2E。不要写越来越复杂的 jsdom Mock 来模拟一个浏览器。

## 21. 可访问性测试

语义 Query 本身会促使组件提供 Role、Label 和 Accessible Name，但不能代替完整无障碍验证。

自动检查可发现：

- 缺失 Label、错误 ARIA 属性。
- 部分对比度、Landmark 和 Name 问题。
- 重复 ID、无效层级。

自动化无法充分判断：

- Focus 顺序是否符合任务。
- 错误通告是否在正确时机出现。
- 文案是否可理解。
- 键盘流程和读屏体验是否连贯。

组件测试应断言 Focus、Disabled、Alert/Status；E2E 覆盖键盘路径；关键产品还需真实读屏和人工审计。

## 22. Playwright E2E：验证真系统边界

Playwright 配置：

<<< ../../../examples/frontend/react-testing-architecture/playwright.config.mts

配置假设测试应用与 API 已由本地编排或 CI 在 `baseURL` 启动。本专题无权修改根脚本，因此没有伪造一个无法启动该示例的 `webServer.command`；真实项目可在 Playwright `webServer` 中填写应用专属启动命令，或由容器编排先完成健康检查。

关键路径：

<<< ../../../examples/frontend/react-testing-architecture/lesson-enrollment.e2e.spec.mts

这条测试不拦截报名接口，而是：

1. 通过受控 Test Support API 建立已知数据库与登录状态。
2. 浏览器打开真实 Route。
3. 用 Role Locator 操作页面。
4. 用 Web-first Assertion 自动重试可见结果。
5. 刷新页面，证明写入已经持久化，而非只改了客户端 State。

Test Support API 必须只存在于隔离测试环境，使用独立凭据和数据库，且生产构建/路由不可访问；否则“方便造数据”的端点会成为直接越权入口。

### Test Isolation

Playwright 每例创建隔离 Browser Context，Cookie、LocalStorage 和 SessionStorage 不会跨测试泄漏。但数据库、消息队列、对象存储等服务器状态不会自动隔离，仍需：

- 每例独立 Tenant/User/ID Namespace。
- API/数据库 Fixture 创建与清理。
- 并行 Worker 不共享可变记录。
- 测试可独立、任意顺序运行。

不要依赖“测试 A 先注册，测试 B 再登录”。这会阻断并行化，并让单例调试失败。

### Locator 与 Web-first Assertion

```ts
await page.getByRole('button', { name: '报名' }).click()
await expect(page.getByRole('status')).toHaveText('报名成功')
```

Locator 每次操作/断言时重新解析 DOM，适合动态页面；Playwright 的 Web-first Assertion 会重试到满足或超时。`await page.waitForTimeout(1000)` 是固定 Sleep：快环境浪费时间，慢环境仍会失败。

Trace、Screenshot 和 Video 应主要在重试/失败时保留。Retry 能收集诊断，但不能把长期 Flaky 测试变成绿色；首次失败率仍应作为质量指标。

## 23. Flaky Test 系统排查

遇到间歇失败，按因果分类：

### 未等待的异步

症状：本地通过、CI 偶发找不到元素。解决：等待可观察结果、`await user`、Web-first Assertion，不加 Sleep。

### 状态泄漏

症状：单独运行通过、全套失败。解决：恢复 Timer/Spy/Handler、清数据库、销毁 Store/Router，避免可变 Module Singleton。

### 不确定数据

症状：排序、时区、随机 ID 变化。解决：注入 Clock/ID、固定 Locale/Timezone、使用唯一 Fixture，不用生产数据。

### 选择器脆弱

症状：DOM 包装或 CSS 改动导致 E2E 失败。解决：Role/Label/Text 或稳定业务 Test ID，不依赖 `nth-child` 和深层 CSS。

### 系统资源竞争

症状：并行 CI 才超时。解决：分析 CPU/Memory/Worker 数，缩小 Fixture，隔离端口和数据库，而不是无限增加 Timeout。

### 真产品竞态

症状：测试偶发看到旧请求覆盖新请求。测试可能正确发现 Bug；不要先重跑隐藏它，应检查 Abort、Request ID、事务与幂等。

## 24. 测试代码也需要工程质量

- 测试名称描述行为和结果，不重复函数名。
- Arrange/Act/Assert 分段清晰，但不必添加机械注释。
- Helper 只隐藏无关样板，不隐藏关键用户步骤。
- 避免条件分支和循环让一个测试产生多种不透明路径；表驱动例外。
- 失败消息应能直接定位角色、值和场景。
- Test Data 使用固定时区和 ISO 时间。
- 禁止真实公网请求、真实邮件、支付或生产 Analytics。
- 测试依赖也要锁版本，升级时阅读迁移说明。

## 25. 完整应用入口

应用 Router 所有权：

<<< ../../../examples/frontend/react-testing-architecture/App.tsx

浏览器入口：

<<< ../../../examples/frontend/react-testing-architecture/main.tsx

本课 22 个源码文件全部在页面中展示。示例配置用于解释完整测试体系，但没有修改站点根 `package.json` 或现有部署配置。

## 26. 测试评审清单

提交测试前确认：

1. 测试覆盖的是重要可观察行为，还是实现细节？
2. 这个风险能否在更快、更确定的层级验证？
3. 领域边界组合是否提取成纯函数测试？
4. Query 是否优先使用 Role、Label 和 Accessible Name？
5. 每个 User Event 和异步 Query 是否正确 `await`？
6. 是否使用 Deferred Promise/协议 Handler，而不是任意 Sleep？
7. Mock 是否位于进程外边界，是否可在每例后完全恢复？
8. 未声明网络请求是否会立即失败？
9. Fake Timer、MSW、DOM、Store 和数据库是否隔离？
10. Router 测试是否使用真实 Route 配置而非复制一份？
11. jsdom 能否真实模拟所测浏览器能力？
12. E2E 是否证明服务端持久化，而不只是客户端文案变化？
13. Retry 是否在隐藏 Flaky Test？
14. Coverage 提升是否对应真实风险覆盖？
15. 测试能否独立运行、并行运行、任意顺序运行？

## 27. 官方资料

- [React `act`](https://react.dev/reference/react/act)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Testing Library Queries](https://testing-library.com/docs/queries/about/)
- [Testing Library Async Methods](https://testing-library.com/docs/dom-testing-library/api-async/)
- [user-event Introduction](https://testing-library.com/docs/user-event/intro/)
- [Vitest Mocking Requests](https://vitest.dev/guide/mocking/requests)
- [Vitest Mock Functions](https://vitest.dev/guide/mocking/functions)
- [Vitest Timers](https://vitest.dev/guide/mocking/timers)
- [Vitest Coverage](https://vitest.dev/guide/coverage)
- [MSW Documentation](https://mswjs.io/docs/)
- [React Router `createMemoryRouter`](https://reactrouter.com/api/data-routers/createMemoryRouter)
- [Playwright Test](https://playwright.dev/docs/intro)
- [Playwright Isolation](https://playwright.dev/docs/browser-contexts)
- [Playwright Assertions](https://playwright.dev/docs/test-assertions)

## 28. 下一节预告

下一节进入 **React Server Components、Server Functions 与现代全栈边界**：区分 RSC、SSR、Hydration 和 Client Component，理解序列化边界、缓存、流式、Server Function 安全以及框架为何不可替代。
