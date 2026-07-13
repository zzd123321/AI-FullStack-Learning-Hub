---
title: Vue 3 测试策略与可测试架构
description: 使用 Vitest、Vue Test Utils、Pinia、Router 与 Playwright建立稳定、分层且关注用户行为的测试体系
---

# Vue 3 测试策略与可测试架构

> 适用环境：Vue 3、TypeScript、Vite、Vitest 4.x、Vue Test Utils 2.x、Pinia 3.x、Vue Router 4、Playwright。本节重点是稳定原则；具体版本配置应以项目锁文件和官方迁移指南为准。

## 1. 学习目标

完成本节后，你应该能够：

- 根据风险选择单元、组件、集成与端到端测试。
- 区分“代码覆盖”与“业务信心”。
- 使用 Vitest 测试纯 TypeScript 规则、异常与边界。
- 使用 Vue Test Utils 从 DOM 和公共接口测试组件。
- 正确等待 Vue 更新、Promise、Timer 和 Router 导航。
- 判断何时注入依赖、Mock 模块、Mock 网络或使用真实实现。
- 为生命周期 Composable 构建宿主组件并验证清理。
- 隔离 Pinia 与 Vue Router 的每个测试实例。
- 测试 Props、Events、Slots、v-model、表单与异步错误。
- 使用 Playwright 编写依赖可访问语义、自动等待的 E2E。
- 识别并治理 flaky tests、全局污染和过度 Snapshot。
- 设计更易测试且生产边界更清晰的组件与服务。

## 2. 测试的目标不是证明“没有 Bug”

测试只能验证被覆盖的输入、环境和行为。它的工程价值是：

- 捕获重要回归。
- 让重构有快速反馈。
- 固化业务契约和边界条件。
- 迫使依赖与状态所有权更清晰。
- 在 CI 中阻止已知错误进入生产。
- 缩短故障定位范围。

测试数量、覆盖率和断言数量都不是最终目标。真正的问题是：“如果这段代码以最可能、最昂贵的方式出错，哪一层测试能及时发现？”

## 3. 测试分层不是固定金字塔配额

| 层级 | 主要对象 | 优势 | 局限 |
| --- | --- | --- | --- |
| 单元测试 | 纯函数、领域规则、转换器 | 快、定位精确、边界覆盖多 | 不验证 Vue、DOM 与系统接线 |
| Composable/Store | 响应式状态机、Actions | 快，能验证 Vue 状态逻辑 | 可能遗漏真实组件交互 |
| 组件测试 | Props、Events、Slots、DOM 行为 | 接近用户交互，反馈仍快 | 模拟 DOM 与真实浏览器有差异 |
| 集成测试 | Router、Pinia、多个组件、服务边界 | 验证接线和协作 | 设置更多、失败定位更宽 |
| E2E | 真实浏览器中的关键用户流程 | 信心最高，覆盖部署形态 | 慢、数据与环境成本高 |

不是每个功能都需要每一层。领域边界组合很多时，多写单元表格测试；组件交互复杂时，加强组件测试；支付、登录、核心发布流程必须有少量可靠 E2E。

## 4. 从风险而不是文件开始

“每个文件一个测试”容易产生低价值断言。先列风险：

- 未报名用户是否误看到学习入口？
- 双击是否创建两次订单？
- 路由权限是否被错误重定向？
- 服务端字段错误是否丢掉输入？
- 请求 B 是否被旧请求 A 覆盖？
- 中文输入、时区和货币是否异常？
- 离开页面是否丢草稿？

再为每个风险选择成本最低、信号最强的测试层。

## 5. 好测试的四个属性

### 可读

失败时能从用例名和断言看懂业务契约。

### 确定

同样输入和环境得到相同结果，不依赖真实时间、随机数、公共测试账号或用例顺序。

### 隔离

每个测试创建自己的状态、Router、Pinia 和 Mock，不消费前一个测试遗留数据。

### 接近使用方式

组件测试点击按钮、填写控件、观察 DOM；不要直接调用组件私有方法然后断言内部 ref。

这四项常有权衡。真实后端 E2E 接近使用方式，但隔离和速度更难；纯函数单测极稳定，但无法验证页面接线。

## 6. 测试公共行为，不测试实现细节

组件公共可观察面主要是：

- 输入 Props、Slots、Provide/Inject、用户操作。
- 输出 DOM、可访问状态、Events、导航、服务调用。

脆弱测试：

```ts
expect((wrapper.vm as any).pending).toBe(true)
```

更稳定：

```ts
expect(wrapper.get('button').attributes('disabled')).toBeDefined()
expect(wrapper.get('button').text()).toBe('报名中…')
```

内部 ref 从 `pending` 改名为 `submitting` 不应破坏测试；用户可见行为变化才应触发更新。

## 7. Vitest 为什么适合 Vite 项目

Vue 官方推荐在 Vite 项目中使用 Vitest，因为它复用 Vite 的解析、转换、Alias 和插件流水线。优势包括：

- ESM 与 TypeScript 支持。
- Watch 模式和按文件筛选。
- Mock、Spy、Fake Timer。
- Coverage。
- Node、DOM 模拟和 Browser Mode。
- 与 Vite 配置协作。

本工作树没有安装这些测试依赖，且本专题禁止修改 `package.json`。本课提供的是完整参考文件，不会假装已经运行 Vitest。

## 8. 典型 Vitest 配置

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    restoreMocks: true,
    clearMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html']
    }
  }
})
```

不要复制后直接假设适合所有项目。纯 Node 领域测试使用 DOM 环境会增加成本；可按测试项目或文件注释分环境。

## 9. Node、模拟 DOM 与真实浏览器

### Node Environment

适合纯函数、服务转换、无 DOM Store。速度快，没有 `document`。

### happy-dom / jsdom

在 Node 中模拟 DOM，适合大部分 Vue Test Utils 测试。但布局、CSS、Canvas、导航、原生事件和部分 Web API 与真实浏览器不同。

### Vitest Browser Mode / 浏览器组件测试

在真实浏览器环境运行，适合依赖原生事件、样式和浏览器 API 的组件，成本更高且 Mock 能力与 Node Mode 存在差异。

### Playwright E2E

通过用户入口访问完整应用，不导入组件源代码。验证路由、构建、资源和浏览器集成。

环境要按风险选择，不是越真实越好。

## 10. 测试结构：Arrange、Act、Assert

```ts
it('prevents a second enrollment', async () => {
  // Arrange：准备服务与组件
  const service = createService()
  const wrapper = mount(Component, { props: { service } })

  // Act：按用户方式操作
  await wrapper.get('form').trigger('submit')

  // Assert：验证公开结果
  expect(service.enroll).toHaveBeenCalledOnce()
})
```

不用强制写注释，但逻辑阶段应清楚。一个用例可以有多个相关断言，共同证明一个行为；不要为每个属性机械拆成独立 mount。

## 11. 用例名描述业务结果

不推荐：

```ts
it('works')
it('test button')
```

推荐：

```ts
it('prevents duplicate submission while enrollment is pending')
it('keeps the email when the server rejects enrollment')
```

失败报告本身应能帮助定位风险。不要把实现方法名当作全部语义。

## 12. 纯函数优先单元测试

权限和业务策略不应藏在模板中的长表达式：

<<< ../../../examples/frontend/vue3-testing/lesson-policy.ts

它不依赖 Vue、DOM、Router 或 Pinia，因此测试无需 mount：

<<< ../../../examples/frontend/vue3-testing/lesson-policy.test.mts

这样的测试速度快，适合覆盖大量角色、状态和边界组合。

## 13. 表格测试

`it.each()` 适合相同规则的输入矩阵：

```ts
it.each([
  ['guest', guestInput, false],
  ['eligible student', studentInput, true]
])('%s', (_name, input, expected) => {
  expect(canEnroll(input)).toBe(expected)
})
```

表格不要塞进完全不同的行为；失败只显示“row 17”会难读。为复杂场景提供描述列，并保持输入对象清晰。

边界值比大量随机正常值更有价值：空、最小、最大、最大 + 1、未知枚举、重复、时区转换点。

## 14. Fixture Builder

<<< ../../../examples/frontend/vue3-testing/test-builders.ts

Builder 提供有效默认值，测试只覆盖关心字段：

```ts
buildAccessInput({ role: 'guest' })
```

优点：

- 实体新增必填字段时集中更新。
- 用例噪声更少。
- 默认对象保持业务有效。

风险：默认值过于隐蔽会让测试看不懂。断言依赖的重要字段应显式覆盖。Builder 的序号、时间和随机数也要可重置或注入。

## 15. 不要共享可变 Fixture

错误：

```ts
const lesson = buildLesson()

it('A', () => { lesson.status = 'draft' })
it('B', () => { expect(lesson.status).toBe('published') })
```

B 是否通过取决于执行顺序。每个测试内部创建新对象，或在 `beforeEach` 创建。深层对象也要避免浅复制后共享嵌套数组。

测试并行执行会放大任何模块全局可变状态问题。

## 16. 组件可测试性来自依赖边界

组件若直接 import 一个全局 HTTP 单例、读取全局 Store、操作 location 并弹 Toast，测试必须 Mock 整个世界。

更清晰的设计：

- I/O 放在 Service。
- 组件通过 Props/Inject/Store Action 获取稳定接口。
- 领域错误有明确类型。
- 组件负责用户状态和渲染。

报名服务契约：

<<< ../../../examples/frontend/vue3-testing/enrollment-contract.ts

依赖注入不是“为了测试而污染生产代码”；它让运行时依赖本身变得明确。

## 17. 完整异步组件

<<< ../../../examples/frontend/vue3-testing/LessonEnrollment.vue

组件公开行为包括：

- 输入邮箱。
- 提交时禁用按钮。
- 调用服务并传递 AbortSignal。
- 成功显示 status。
- 领域失败显示 alert 且保留输入。
- 卸载时取消请求。

测试无需知道内部 ref 名称，也无需 Mock Vue 响应式系统。

## 18. Vue Test Utils 的 mount

```ts
const wrapper = mount(LessonEnrollment, {
  props: { lessonId, service },
  global: {
    plugins: [],
    provide: {},
    stubs: {}
  },
  attachTo: document.body
})
```

- `props` 提供组件输入。
- `global.plugins` 安装 Pinia、Router、i18n。
- `global.provide` 提供 Inject。
- `global.stubs` 替换无关边界。
- `attachTo` 只在需要真实 document 关系、Teleport 或焦点时使用；用后必须 unmount/清理。

默认尽量使用完整 mount，只有明确隔离目的时才 shallow/stub。

## 19. `get` 与 `find`

- `get(selector)` 找不到会立即抛出，适合元素必须存在。
- `find(selector)` 返回空 Wrapper，适合断言不存在。

```ts
expect(wrapper.get('[role="alert"]').text()).toContain('失败')
expect(wrapper.find('[role="status"]').exists()).toBe(false)
```

选择表达测试意图的 API。不要到处 `find(...).exists()` 后再 `get()`。

## 20. Selector 优先级

优先使用用户可感知语义：

1. Role + accessible name。
2. Label / 文本。
3. 稳定业务属性。
4. `data-testid` 作为无法表达语义时的最后手段。

Vue Test Utils 是低层 API，常用 CSS selector。即使如此也应选 `input[type=email]`、`[role=alert]` 等契约，而不是 `.mt-4 > div:nth-child(2)`。

类名主要用于样式，DOM 层级经常重构，不应成为默认测试 API。

## 21. 完整组件测试

<<< ../../../examples/frontend/vue3-testing/LessonEnrollment.test.mts

它验证三条高风险路径：

- 成功时输入规范化、服务调用和回执。
- Pending 时禁止重复提交。
- 领域错误可见且用户输入保留。

测试 Service 是协作者，而不是重新实现 HTTP。Service 自身的请求/响应映射应另有契约测试。

## 22. Vue DOM 更新为什么要 await

Vue 会批量缓冲 DOM 更新。测试运行器会继续同步执行，因此：

```ts
wrapper.get('button').trigger('click')
expect(wrapper.text()).toContain('新值') // 可能太早
```

Vue Test Utils 中会导致 DOM 更新的方法通常返回 `nextTick()`：

```ts
await wrapper.get('button').trigger('click')
await wrapper.get('input').setValue('Vue')
```

这个 await 只等待 Vue 的更新，不保证独立 Promise 已完成。

## 23. `nextTick` 与 `flushPromises`

### `nextTick()`

等待 Vue 当前 DOM flush。

### `flushPromises()`

让已经排队的未决 Promise 回调继续执行，适合 Mock HTTP Promise 或 Router 导航后的异步链。

典型顺序：

```ts
await wrapper.get('form').trigger('submit')
expect(wrapper.get('button').text()).toBe('保存中…')

resolveRequest(response)
await flushPromises()
expect(wrapper.get('[role=status]').text()).toContain('成功')
```

不要用反复 `await nextTick()` 猜网络 Promise 何时结束。

## 24. Deferred Promise 测 Pending 状态

直接 `mockResolvedValue()` 可能在断言前很快完成。手动控制 Promise：

```ts
let resolve!: (value: Result) => void
const pending = new Promise<Result>((done) => { resolve = done })
service.call.mockReturnValue(pending)
```

先触发提交并断言 Loading/Disabled，再调用 `resolve()`，最后 `flushPromises()` 断言成功。

这比在 Mock 中 `setTimeout(1000)` 更快、更确定。

## 25. Mock、Stub、Fake、Spy

术语在不同团队略有差异，实用区分：

- Stub：返回预设结果，不关心调用。
- Spy：记录真实或替代函数如何被调用。
- Mock：带预期的替代依赖，常泛指上述工具。
- Fake：有简化但可工作的实现，如内存仓库。

选择最简单、最能表达风险的测试替身。不要为一个返回值搭建复杂通用 Mock 框架。

## 26. 依赖注入与模块 Mock 的选择

### 注入接口

优点：类型清晰、每个实例独立、无 hoist 困惑，适合 Service/Clock/Storage。

### `vi.mock()`

适合难以注入的第三方模块或模块边界。它会被提升到 import 前，Factory 不能随意引用后声明变量；可使用 `vi.hoisted()`。

### `vi.spyOn()`

适合观察对象方法，默认可保留真实实现。但 Browser Mode 对 ESM Namespace Spy 有限制。

Vitest 官方强调测试后清理/恢复 Mock。可用配置 `restoreMocks`，也可在 `afterEach` 明确执行。

## 27. 不要 Mock 你真正想验证的东西

如果测试目标是“Router 守卫组合后是否进入详情页”，就使用真实 Router；如果目标只是“点击按钮向 Router 请求导航到哪个位置”，可 Mock `push`。

如果目标是“组件如何显示服务端 422”，Mock Service 返回领域错误即可；如果目标是“HTTP 422 能否转换为领域错误”，测试真实 Service + Mock 网络。

先写一句测试目标，再决定替换哪一层。

## 28. 网络 Mock 的层级

### Mock Service 方法

组件测试最简单，验证组件与 Service 契约。

### Mock fetch/HTTP Client

验证 Service 的 URL、Headers、序列化和错误映射。不要在每个组件测试重复。

### Service Worker/网络拦截

MSW 等工具从请求边界响应，组件、Store、Service 均保持真实。适合集成测试，但 Handler 也需要按用例重置。

### 测试后端

真正端到端，验证部署、鉴权和数据库，数据治理成本最高。

不要在单元测试调用真实公共 API；它慢、易变、有速率限制且可能产生数据。

## 29. Composable 测试分两类

### 只用响应式 API

可以直接调用并断言 refs/computed。

### 依赖组件实例

使用以下 API 时需要宿主：

- `onMounted` / `onUnmounted` / `onScopeDispose`。
- Provide / Inject。
- Template Ref 或实例上下文。

创建 App 并 mount，使生命周期真正发生；结束时 unmount 验证清理。

## 30. 生命周期 Composable 宿主

<<< ../../../examples/frontend/vue3-testing/withSetup.mts

Helper 返回 Composable 结果和 App：

```ts
const [result, app] = withSetup(() => useFeature())
// assertions
app.unmount()
```

不要忘记 unmount。计时器、监听器和请求清理只有在卸载时才会被验证。

复杂 Composable 若与 DOM 或多个组件协作，写一个测试宿主组件往往比直接断言 refs 更自然。

## 31. 可取消防抖搜索 Composable

<<< ../../../examples/frontend/vue3-testing/useDebouncedLessonSearch.mts

它包含多种异步来源：

- Vue watcher 调度。
- `setTimeout` 防抖。
- Service Promise。
- AbortController。
- Scope Disposal。

测试必须分别控制这些时钟，不能靠真实等待。

## 32. Fake Timer 测试

<<< ../../../examples/frontend/vue3-testing/useDebouncedLessonSearch.test.mts

关键顺序：

1. `vi.useFakeTimers()`。
2. 修改 query。
3. `await nextTick()` 让 watcher 创建 timer。
4. `advanceTimersByTimeAsync()` 推进 timer 和异步回调。
5. 断言请求与结果。
6. `app.unmount()` 验证生命周期结束。
7. `afterEach` 恢复真实 Timer。

Fake Timer 会改变 Date/Timer 行为，若不恢复会污染后续测试。不要同时混合真实睡眠和 Fake Timer。

## 33. 测试取消与竞态

只测最后结果不够。竞态测试应控制两个请求：

- 启动 A，捕获 A 的 signal。
- 输入新值，确认 A aborted。
- 启动 B 并先完成。
- 即使 A 之后错误/完成，也不能覆盖 B。

若客户端不支持 AbortSignal，注入 Deferred Promise 并反序 resolve，验证请求序号策略。

这类测试对搜索、路由数据、自动保存和异步校验非常重要。

## 34. Pinia Store 单测隔离

每个用例创建新 active Pinia：

```ts
beforeEach(() => {
  setActivePinia(createPinia())
})
```

否则 Store 实例缓存和状态会跨测试泄漏。不要从应用入口 import 已安装的全局 Pinia。

完整 Store：

<<< ../../../examples/frontend/vue3-testing/lesson-selection-store.mts

完整测试：

<<< ../../../examples/frontend/vue3-testing/lesson-selection-store.test.mts

## 35. Store 应测试什么

- 初始状态。
- Getter 派生结果。
- Action 成功和失败状态。
- 异步竞态与取消。
- Reset。
- 与其他 Store 的协作边界。

不要断言“内部 ref 被设置了三次”，应断言 action 完成后的公开状态和 Service 调用。

如果 Store 依赖插件，Pinia 插件只有安装到 App 后才生效，测试必须创建空 App 并 `app.use(pinia)`。

## 36. `createTestingPinia`

`@pinia/testing` 适合组件测试：

```ts
const testingPinia = createTestingPinia({
  initialState: {
    session: { authenticated: true }
  },
  stubActions: true,
  createSpy: vi.fn
})
```

默认 Stub Action 便于验证“组件请求调用 action”，但不会执行 action 逻辑。若测试需要真实状态转换，设置 `stubActions: false`。

不要一边以为 Action 在运行，一边只断言 Mock 状态。明确测试目标是组件协作还是 Store 行为。

## 37. Router 测试：Mock 还是 Real

### Mock Router

适合只验证导航意图：

```ts
expect(push).toHaveBeenCalledWith({
  name: 'lesson-edit',
  params: { lessonId: 'vue-testing' }
})
```

### Real Router

适合验证路径匹配、Props、Redirect、Guard、Nested RouterView 和真实 RouterLink。

每个测试创建新 Router，优先 `createMemoryHistory()`，先 push 初始地址并等待 `router.isReady()`。

## 38. 完整 Router 集成测试

<<< ../../../examples/frontend/vue3-testing/router.integration.test.mts

测试过程：

- 创建独立 memory router。
- 等待初始导航完成。
- 作为 Plugin 安装到 mount。
- 通过真实 RouterLink 点击。
- `flushPromises()` 等待异步导航。
- 同时断言 URL 与渲染内容。

若每个组件测试都如此设置会很重；把 Router 集成测试集中在真正需要匹配行为的地方。

## 39. 导航守卫怎么测

把纯权限判断提取为函数，先用表格单测；再用少量真实 Router 测试保证 Guard 接线正确：

- 未登录进入受保护页 → Login + redirect。
- 无角色 → Forbidden。
- 已授权 → 目标页。
- Login 本身不会循环重定向。

Guard 依赖 Pinia 时，每个测试创建同一 App 上下文的 Pinia 和 Router。SSR 还要确保实例不跨请求。

## 40. 表单组件测试

覆盖用户状态转换：

- 输入前不显示错误。
- Blur 或 submit 后显示字段错误。
- 修复输入后错误消失。
- 异步校验 pending 和竞态。
- Submit DTO 正确。
- 服务端字段错误映射。
- 错误摘要和焦点。
- 动态字段添加删除使用正确 ID。

使用 `setValue` 和 `trigger('blur')`，不要直接写 `wrapper.vm.model.title`。

注意模拟 DOM 不会完整实现原生 Constraint Validation、布局和真实文件选择；关键浏览器行为要用浏览器组件测试或 E2E。

## 41. Events 与 v-model 测试

事件：

```ts
await wrapper.get('button').trigger('click')
expect(wrapper.emitted('select')).toEqual([['lesson-1']])
```

组件 v-model 可建立受控宿主，让 emitted update 回写 Props，再断言 DOM：

```ts
const wrapper = mount(Input, {
  props: {
    modelValue: '',
    'onUpdate:modelValue': value => wrapper.setProps({ modelValue: value })
  }
})
```

只断言 emit 而不模拟父级回写，可能遗漏组件依赖受控值更新的行为。

## 42. Slots 测试

提供真实 Slot 内容并观察渲染：

```ts
mount(Card, {
  slots: {
    default: '<p>课程内容</p>',
    actions: ({ save }) => h('button', { onClick: save }, '保存')
  }
})
```

Scoped Slot Props 是公共 API，应验证名称和用户操作，而不是 Snapshot 整个内部 VNode。

## 43. Provide / Inject 测试

简单 Consumer：

```ts
mount(Consumer, {
  global: {
    provide: {
      [key as symbol]: fakeContext
    }
  }
})
```

需要验证 Provider 与 Consumer 协作时完整 mount 二者。必需 Inject 缺失应抛出清晰错误，也值得测试。

避免在全局 Test Setup 提供所有依赖；用例会在不知道的情况下通过，掩盖组件真实契约。

## 44. Teleport 测试

Teleport 内容不在 Wrapper 根 DOM 中，但仍属于组件 VNode。通常：

- 在 document 创建目标节点。
- `attachTo: document.body` mount。
- 从 document 或 `findComponent` 断言内容。
- 测试后 wrapper.unmount 并移除目标。

也可全局 Stub Teleport 进行简单单元测试，但必须保留至少一个真实集成测试验证目标和焦点管理。

## 45. Transition 测试

Vue Test Utils 默认可 Stub Transition，使内容同步出现。组件逻辑测试不应依赖 CSS 动画毫秒数。

真正需要验证：

- 进入/离开后最终可见状态。
- Reduced Motion。
- 动画期间交互是否被阻塞。
- Transition Hook 是否调用必要清理。

视觉时序和 CSS 应在真实浏览器测试，不要在模拟 DOM 重造浏览器动画引擎。

## 46. Suspense 与 async setup

使用 async setup 的组件必须在 Suspense 中 mount：

```ts
const Host = defineComponent({
  components: { AsyncView },
  template: '<Suspense><AsyncView /></Suspense>'
})

const wrapper = mount(Host)
await flushPromises()
```

外层 Wrapper 的 vm 是 Host，不是 AsyncView；需要时用 `findComponent(AsyncView)`。

测试 fallback、成功和拒绝路径，不要只等待最终 DOM。

## 47. KeepAlive 测试

关注业务行为：

- 切回后本地草稿是否保留。
- Deactivated 时轮询是否暂停。
- Activated 时是否正确恢复。
- 超出 max 后最旧实例是否被销毁。
- 权限/退出登录后缓存是否失效。

不要测试 Vue 自身 LRU 算法的所有细节；测试你的 include/key/生命周期接线和资源清理。

## 48. Snapshot 测试的边界

Snapshot 适合稳定、结构化且人工能审查的输出，例如：

- 小型序列化 AST。
- 邮件/文档模板。
- 有意稳定的复杂错误结构。

组件整个 HTML Snapshot 常见问题：

- 小 class 变化产生巨大 diff。
- 团队习惯直接更新。
- 看不出关键业务断言。
- 多个状态被压成一张静态图。

Snapshot 可补充，不能替代“按钮被禁用”“错误关联字段”“事件载荷正确”等明确断言。

## 49. Mock 时间与随机数

涉及 `Date.now()`、时区、过期和 ID 时：

```ts
vi.useFakeTimers()
vi.setSystemTime(new Date('2026-07-13T00:00:00Z'))
```

测试后恢复真实 Timer。更清晰的领域代码可注入 Clock：

```ts
interface Clock { now(): Date }
```

随机 ID 可注入 `IdGenerator`。不要在测试里只用正则接受任何值，结果仍不可复现。

时区测试要明确运行环境 TZ，避免本机上海通过、CI UTC 失败。

## 50. 全局与环境清理

测试常污染：

- `window.location`、localStorage、matchMedia。
- Fake Timer 和系统时间。
- Mock/Spy 调用记录和实现。
- document.body、Teleport target。
- Event Listener、Observer。
- Pinia、Router、模块单例。
- `import.meta.env`。

使用 `afterEach` 和 Vitest 的 restore/unstub 配置。清理应紧邻创建资源的测试 Helper，而不是依赖某个远处全局脚本。

## 51. Coverage 应如何看

Coverage 常见指标：

- Statements。
- Branches。
- Functions。
- Lines。

高行覆盖仍可能遗漏：

- 错误分支。
- 并发顺序。
- 浏览器集成。
- 业务断言。
- 不正确但被执行的逻辑。

Coverage 用于发现明显空白，不应作为唯一质量 KPI。分支覆盖对权限、校验和状态机通常比行覆盖更有提示价值。

## 52. 覆盖率阈值

阈值能防止覆盖率持续下降，但统一 100% 会鼓励无意义测试和忽略难测架构问题。

更合理：

- 核心领域规则高分支覆盖。
- 生成代码、类型声明和简单导出合理排除。
- 新改动不得显著降低基线。
- 关键风险必须有显式行为测试，不以百分比替代。

定期审查未覆盖代码是否是死代码，而不只是补测试。

## 53. Mutation Testing

Mutation Tool 会故意把 `>` 改成 `>=`、true 改 false、删除语句，看测试是否失败。它能发现“代码执行了但断言不敏感”。

Mutation Testing 成本高，适合核心领域规则或抽样运行。不是每次本地保存都必须全量执行。

即使不用工具，也可问：如果把这个条件反过来，哪个测试会红？若答案不明确，断言可能没有保护契约。

## 54. E2E 应覆盖什么

少量关键旅程：

- 登录、退出和会话过期。
- 注册/购买/报名。
- 核心创建、编辑、发布流程。
- 权限拒绝。
- 路由刷新和深链接。
- 上传、下载等浏览器能力。

不要把所有字段边界组合放进 E2E；纯函数或组件测试更快、更易定位。

## 55. Playwright Locator

优先：

```ts
page.getByRole('button', { name: '确认报名' })
page.getByLabel('邮箱')
page.getByRole('status')
```

Locator 会在执行操作时重新查找元素，并有自动等待和可操作性检查。不要缓存 `elementHandle` 或使用易变 XPath/CSS 层级。

语义 Locator 同时推动页面可访问名称更清晰，但它不等于完整无障碍审计。

## 56. Web-first Assertions

```ts
await expect(page.getByRole('status')).toContainText('报名成功')
```

Playwright assertion 会在超时内重试，适合异步 UI。不要写：

```ts
await page.waitForTimeout(1000)
expect(await locator.textContent()).toContain('成功')
```

固定 Sleep 既慢又不稳定：CI 可能需要 1200ms，本机只需 50ms。等待用户可观察条件或明确网络响应。

## 57. 完整 Playwright 场景

<<< ../../../examples/frontend/vue3-testing/lesson-enrollment.e2e.spec.mts

这个示例使用浏览器页面和真实组件，但拦截报名 API，因此更准确地说是“浏览器级前端 E2E/契约场景”，不是全栈数据库 E2E。

它同时验证：

- URL 可直接进入。
- 标题和表单可访问语义。
- 请求 DTO。
- 成功响应后的 UI。

另保留少量连接真实测试后端的全栈场景，验证鉴权、数据库和部署接线。

## 58. E2E 数据隔离

稳定策略：

- 每个测试生成唯一用户/实体。
- 通过受控 API 创建前置数据，而不是 UI 重复铺设所有步骤。
- 测试后清理，或每个 Worker 独立数据库 Schema。
- 不依赖用例顺序。
- 不共用一个会被修改的账号。
- 并行 Worker 的数据命名包含 Worker/Test ID。

对第三方支付、邮件、地图，测试自己的集成边界，不要自动化测试第三方网站本身。

## 59. Authentication State

Playwright 可在 Setup Project 登录一次并保存 `storageState`，供多个测试复用。注意：

- State 文件可能包含敏感 Cookie，不应提交仓库。
- 共享账号仍可能产生数据冲突。
- 权限矩阵需要不同角色 State。
- 测试登录流程本身仍要有独立用例。
- 会话过期场景不能全部复用永不过期状态。

优化登录速度不能牺牲用例隔离。

## 60. Cross-browser 策略

Playwright 支持 Chromium、Firefox、WebKit。不是所有用例都必须三浏览器全跑：

- 核心冒烟流程可跨浏览器。
- 大部分功能回归跑主浏览器。
- 浏览器差异高风险功能（文件、日期、输入法、媒体）重点覆盖。
- PR 与 Nightly 使用不同矩阵。

跨浏览器覆盖有递减收益，应依据用户分布和失败历史调整。

## 61. Visual Regression

适合：

- 设计系统组件。
- 图表、复杂布局。
- 响应式断点。
- 打印页面。

稳定视觉测试需要固定：

- 浏览器、Viewport、DPR。
- 字体与操作系统。
- 动画、光标和时间。
- 网络数据和图片。

视觉 diff 发现“看起来变了”，不能证明交互和语义正确。与行为断言并用。

## 62. 自动化无障碍测试

axe 等工具可发现：

- 缺失 label。
- 部分 ARIA 错误。
- 对比度和结构问题。
- 重复 ID。

它不能完全验证：

- 键盘流程是否自然。
- 焦点移动是否合理。
- 读屏文案是否有上下文。
- 动态通知是否过度。
- 认知负担。

组件语义断言 + 自动扫描 + 键盘 E2E + 人工辅助技术检查共同构成无障碍质量。

## 63. Flaky Test 的常见来源

- 固定 Sleep 与时序猜测。
- 未 await Vue/Promise/Router。
- 真实时间、随机数和时区。
- 共享全局 Store/Router/数据库。
- CSS/文本 selector 易变。
- 网络、第三方服务和速率限制。
- 动画未关闭。
- 用例依赖顺序。
- 并行 Worker 操作同一实体。
- 测试后未清理 Timer、DOM、Mock。

Flaky 不是“多重跑几次就好”。重试可收集诊断，但必须记录、分流并修复根因。

## 64. Flaky Test 治理

1. 保存 Trace、Screenshot、Video、Console、Network。
2. 判断产品 Bug、测试 Bug、环境 Bug。
3. 建立负责人和截止时间。
4. 隔离时保持可见告警，不要永久 skip。
5. 统计 flaky 率和高频文件。
6. 修复后移除不必要重试。

若套件长期红绿随机，团队会忽略失败，测试系统失去价值。

## 65. 并行执行与模块单例

Vitest 文件可并行，Playwright Worker 也并行。以下模块状态危险：

```ts
export const router = createRouter(/* ... */)
export const store = useStore()
export let currentUser = fixture
```

测试工厂应返回新实例：

```ts
createTestRouter()
createTestPinia()
createFakeService()
```

生产中的 SSR 同样受益：可实例化架构防止请求间状态泄漏。

## 66. Test Helper 也需要克制

过度封装：

```ts
await completeEntireApplicationHappyPath(page)
```

失败时不知道哪一步，测试也看不出业务意图。更好的 Helper：

- `loginAs(role)`。
- `buildLesson(overrides)`。
- `mountWithPlugins(component, options)`。
- Page Object 中稳定的领域动作。

Helper 应隐藏技术样板，不隐藏本用例的关键业务步骤和断言。

## 67. Page Object

Page Object 可集中 Locator 与常用动作：

```ts
class EnrollmentPage {
  constructor(readonly page: Page) {}
  email = this.page.getByLabel('邮箱')
  submit = this.page.getByRole('button', { name: '确认报名' })
}
```

不要让 Page Object 内部包含所有断言和分支，变成另一个应用。测试仍应清楚表达期待结果。

## 68. CI 测试流水线

典型顺序：

1. 静态类型与 Lint。
2. 快速 Unit/Component。
3. 构建生产产物。
4. 关键 E2E 冒烟。
5. 更大跨浏览器/视觉矩阵按 Nightly 或合并后运行。

可按修改路径选择测试，但核心跨模块场景不能永远被跳过。CI 应缓存依赖而不是缓存测试结果到掩盖变更。

失败产物需要保留足够时间，尤其 Playwright Trace。

## 69. 测试性能

慢测试套件会降低运行频率。定位：

- 过多 DOM Environment。
- 每个测试重复 mount 巨大 App。
- 未恢复的 Timer/Open Handle。
- 大量 Module Reset。
- 过度全局 Setup。
- 无差别 E2E 登录和数据创建。

优化反馈时间不能把所有测试变成浅 Stub。按风险保留不同层，使用并行、工厂和合理 Project 拆分。

## 70. 可测试架构的信号

- 领域规则能作为纯函数测试。
- Service 有稳定接口和错误类型。
- 组件通过 Props/Events/Inject 使用依赖。
- Router/Pinia 可由 Factory 创建。
- 时间、随机数和存储可替换。
- 异步操作接受 AbortSignal。
- UI 使用语义 HTML 和明确可访问名称。
- 状态所有者能重置并清理资源。

“很难测试”常是架构反馈：依赖隐藏、职责混合、全局状态过多或副作用没有边界。

## 71. 不要为测试破坏封装

不推荐：

- 导出私有 ref 只为了断言。
- 给生产 DOM 到处加无语义内部类。
- 把私有方法暴露到 `defineExpose()`。
- 增加仅测试环境分支改变行为。

应该：

- 提取真正独立的领域纯函数。
- 注入真实的外部依赖接口。
- 通过 DOM、Event、Service 调用观察结果。
- 在测试工具层提供工厂与 Fixture。

## 72. 常见反模式

### 只测试 mount 不报错

几乎没有业务保护。至少断言关键输入对应的渲染或操作。

### 断言组件内部 State

重构易碎，且可能 UI 根本没更新。断言公开行为。

### 所有子组件 shallow stub

Props/Event/Slot 接线错误无法发现。默认完整 mount，明确昂贵/无关边界才 Stub。

### Mock 所有模块

测试只证明 Mock 按设定工作。保留真实领域与 Vue 协作，Mock 外部边界。

### 到处 `flushPromises()`

掩盖不知道等待什么。优先 await 明确操作/Promise/条件。

### 固定等待

慢且 flaky。使用 Fake Timer、Deferred Promise、Web-first Assertion。

### 追求 100% Snapshot

Diff 噪声大且缺少意图。用明确行为断言。

### E2E 共用一个账号

并行冲突、状态泄漏。每例/Worker 数据隔离。

## 73. Vue 2 测试迁移提示

- Vue Test Utils v2 面向 Vue 3，API 与 v1 有差异，应按官方迁移指南更新。
- `propsData` 改为 `props`。
- `mocks`、`stubs`、`plugins` 等位于 `global` Mount Option。
- Vuex 测试可重新评估 Pinia 的每例 active instance。
- Vue Router 4 导航异步，需要 `isReady()` / `flushPromises()`。
- Composition API Composable 可直接或通过宿主测试。
- 不要机械保留对 `wrapper.vm`、私有 methods 和 `$nextTick` 的大量白盒断言。
- 从 Jest 迁移 Vitest 时注意 ESM、Mock Hoist、Fake Timer 和 Browser Mode 差异。

## 74. 工程检查清单

- 测试是否围绕风险和用户行为，而不是文件数量？
- 纯业务规则是否从组件提取并单测？
- 组件断言是否通过 DOM、Events 和依赖调用？
- 是否正确区分 nextTick、flushPromises 和 Fake Timer？
- 每个测试是否创建独立 Pinia/Router/Fixture？
- Mock 是否位于正确边界且测试后恢复？
- 异步 Pending、失败、取消和竞态是否覆盖？
- 表单是否覆盖错误时机、服务端错误与焦点？
- Router 是否分别测试导航意图与真实匹配？
- E2E 是否使用语义 Locator 和 Web-first Assertion？
- 是否避免固定 Sleep、共享账号和第三方真实 API？
- Coverage 是否用于发现空白而非替代风险分析？
- Flaky 是否有追踪、负责人和诊断产物？
- CI 是否先快后慢，并保留失败 Trace？
- Test Helper 是否隐藏样板而不隐藏业务意图？

## 75. 面试知识

### `nextTick()` 与 `flushPromises()` 有什么区别？

`nextTick()` 等待 Vue 的 DOM 更新队列；`flushPromises()` 推进 Vue 不知道的 Promise 回调，例如 Mock HTTP 或 Router 异步导航。

### 为什么组件测试不应主要断言 `wrapper.vm`？

它耦合私有实现，不能保证最终 DOM 和用户行为正确。应通过 Props、DOM、Events 和协作者调用观察公共契约。

### Pinia Store 测试为什么每例创建 active Pinia？

Store 实例缓存在 Pinia 中；复用实例会让状态跨用例泄漏并产生顺序依赖。

### Router 测试何时 Mock，何时使用真实 Router？

只验证导航意图时 Mock `push`；验证匹配、守卫、重定向、Props 和 RouterView 时使用每例独立真实 Router。

### Fake Timer 有什么风险？

它会替换 Timer，并可能改变 Date；若 watcher 尚未运行就推进时间、或测试后未恢复，会产生错误结果和全局污染。

### Coverage 100% 为什么仍可能有严重 Bug？

代码被执行不代表断言正确，也可能遗漏输入组合、竞态、真实浏览器和系统接线。

### 如何降低 E2E Flaky？

使用稳定语义 Locator、Web-first Assertion、隔离数据、控制网络与时间、避免固定 Sleep，并保留 Trace 定位根因。

## 76. 本节总结

- 测试策略从业务风险出发，不从文件或覆盖率配额出发。
- 纯规则用单元测试，组件通过 DOM/Events 测公共行为，关键旅程用少量 E2E。
- Vue DOM 更新、普通 Promise、Timer 和 Router 导航需要不同等待方式。
- 注入 Service 接口能同时改善生产边界和测试隔离。
- 生命周期 Composable 需要宿主与 unmount 验证清理。
- Pinia 和 Router 每例创建独立实例，避免状态污染。
- Mock 要位于不想验证的边界，不能替换测试目标本身。
- Playwright 使用语义 Locator、自动等待和隔离数据，不使用固定 Sleep。
- Coverage、Snapshot 和重试只是工具，不能代替有意图的行为断言。
- Flaky 必须作为缺陷治理，否则团队会失去对测试信号的信任。

## 77. 下一步学习

下一节建议学习：**Vue 3 SSR、Hydration 与同构应用边界**。

将继续讲解服务端渲染流水线、每请求实例、数据预取、序列化安全、Hydration mismatch、客户端专属 API、流式渲染、缓存与 Nuxt 架构边界。

## 78. 参考资料

- [Vue 官方指南：Testing](https://vuejs.org/guide/scaling-up/testing.html)
- [Vue Test Utils：Getting Started](https://test-utils.vuejs.org/guide/)
- [Vue Test Utils：Asynchronous Behavior](https://test-utils.vuejs.org/guide/advanced/async-suspense.html)
- [Vue Test Utils：Testing Vue Router](https://test-utils.vuejs.org/guide/advanced/vue-router.html)
- [Vitest：Getting Started](https://vitest.dev/guide/)
- [Vitest：Mocking](https://vitest.dev/guide/mocking.html)
- [Vitest：Coverage](https://vitest.dev/guide/coverage.html)
- [Pinia：Testing Stores](https://pinia.vuejs.org/cookbook/testing.html)
- [Playwright：Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright：Assertions](https://playwright.dev/docs/test-assertions)
- [Playwright：Test Fixtures](https://playwright.dev/docs/test-fixtures)
- [Playwright：Authentication](https://playwright.dev/docs/auth)
