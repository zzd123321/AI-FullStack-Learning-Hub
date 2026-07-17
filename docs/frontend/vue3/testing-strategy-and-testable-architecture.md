---
title: Vue 3 测试策略与可测试架构
description: 从业务风险出发，使用 Vitest、Vue Test Utils、Pinia、Router 与 Playwright建立分层、稳定的测试体系
---

# Vue 3 测试策略与可测试架构

> 适用环境：Vue 3、TypeScript、Vite、Vitest、Vue Test Utils 2、Pinia、Vue Router 4 与 Playwright。工具配置会随版本变化，本课重点是稳定的测试边界和推理方法。

上一课解释了状态变化如何触发组件更新。这一课要验证的不是“Vue 有没有更新”，而是：

> 当用户以真实方式操作时，系统是否仍然遵守业务契约？

测试不是越多越好。一个断言很多、覆盖率很高的测试集，也可能完全没有覆盖最昂贵的失败。

## 从风险开始，不要从文件列表开始

先想象功能会怎样失败：

- 未登录用户是否能进入受限课程？
- 双击提交会不会创建两条报名记录？
- 请求 A 晚于请求 B 返回时，会不会覆盖新结果？
- 服务端拒绝表单后，用户输入是否丢失？
- 路由参数变化后，页面是否仍显示旧实体？
- 中文输入、时区、真实浏览器导航是否异常？

再选择能以最低成本证明该风险的测试层。

| 层级 | 适合验证 | 不擅长证明 |
| --- | --- | --- |
| 纯单元测试 | 规则、转换、边界组合 | Vue、DOM 和插件接线 |
| Composable / Store | 响应式状态机、Action | 完整页面交互 |
| 组件测试 | Props、Events、Slots、DOM 行为 | 真实布局和完整部署 |
| 集成测试 | Router、Pinia、组件和服务协作 | 后端和生产资源是否正确 |
| E2E | 真实浏览器中的关键流程 | 大量细粒度边界的快速定位 |

这不是要求固定比例的金字塔。同一个风险通常只需要一两个最合适的层级：

- 权限规则有几十种组合：纯函数表格测试；
- 提交按钮的 pending 与错误恢复：组件测试；
- 路由记录和 Props 是否接对：使用真实 Router 的集成测试；
- 登录到支付的核心路径：少量 E2E。

## 一条好测试应该提供什么信号

测试应该尽量同时做到：

- **可读**：用例名和断言能表达业务契约；
- **确定**：同样环境与输入得到同样结果；
- **隔离**：不消费上一用例留下的 Store、Router、计时器或数据库数据；
- **接近使用方式**：点击、输入并观察公开结果，而不是操纵组件私有 ref；
- **失败可定位**：失败信息能指出哪条行为被破坏。

这些属性存在权衡。E2E 最接近真实使用，却更慢、数据隔离更难；纯函数单测极稳定，却无法证明页面接线。测试策略的工作就是做有意识的组合。

### 测试不能证明“没有 Bug”

自动化测试只验证写进用例的输入、环境和观察结果。它的价值是：

- 捕获已知高风险回归；
- 固化业务边界；
- 给重构提供快速反馈；
- 暴露模糊的依赖和所有权；
- 缩小故障定位范围。

覆盖率、用例数和 Snapshot 数量只是间接指标，不是业务信心本身。

## 可测试架构先把纯规则从框架中拿出来

权限规则若藏在模板长表达式里：

```vue
<button v-if="role === 'student' && status === 'published' && !enrolled">
  报名
</button>
```

测试只能先 mount 组件，构造很多无关依赖。把规则提成纯函数：

<<< ../../../examples/frontend/vue3-testing/lesson-policy.ts

测试就可以直接覆盖输入矩阵：

<<< ../../../examples/frontend/vue3-testing/lesson-policy.test.mts

纯函数测试适合：

- 空值、最小值、最大值和越界值；
- 角色与资源状态组合；
- Draft 到 DTO 的转换；
- 排序、规范化和错误映射；
- 异常类型与返回协议。

### Fixture Builder 降低噪声，但不能隐藏关键前提

<<< ../../../examples/frontend/vue3-testing/test-builders.ts

Builder 提供一个业务有效的默认对象，用例只覆盖关心字段：

```ts
buildAccessInput({ role: 'guest' })
```

它能避免每个用例重复十几个无关字段，也把实体新增必填属性的修改集中到一处。

但默认值不能神秘到让测试读不懂。断言依赖的前提应显式传入；时间、随机数和递增序号要能注入或重置。每个用例还应创建新对象，不能共享会被修改的 fixture。

### 用例名应该描述结果

```ts
it('prevents duplicate enrollment while the request is pending')
it('keeps the email when the server rejects enrollment')
```

“works”或“test button”无法在 CI 失败时提供业务信息。Arrange、Act、Assert 不一定要写成注释，但三个阶段应该一眼可辨：

```ts
// Arrange
const service = createService()
const wrapper = mount(Component, { props: { service } })

// Act
await wrapper.get('form').trigger('submit')

// Assert
expect(service.enroll).toHaveBeenCalledOnce()
```

一个用例可以有多个共同证明同一行为的断言，不需要为了断言数量机械拆成多次 mount。

## 组件测试观察公共接口

Vue 组件的公开输入通常是：

- Props；
- Slots；
- provide/inject 的约定；
- 用户输入和浏览器事件；
- 服务或数据流。

公开输出通常是：

- DOM 与可访问状态；
- Emits；
- 导航；
- 服务调用；
- 用户可感知的副作用。

脆弱断言：

```ts
expect((wrapper.vm as any).pending).toBe(true)
```

更稳定的行为断言：

```ts
expect(wrapper.get('button').attributes('disabled')).toBeDefined()
expect(wrapper.get('button').text()).toBe('报名中…')
```

内部变量从 pending 改名成 submitting，不应让测试失败；用户可见行为改变才应该影响测试。

Vue 官方同样建议组件测试关注“做了什么”，而不是“怎样实现”。复杂私有方法若值得独立覆盖，通常说明其中的规则应该提取成纯函数或服务。

## 依赖边界让组件既容易测试也容易维护

报名组件不直接 import 一个全局 HTTP 单例，而是接收明确接口：

<<< ../../../examples/frontend/vue3-testing/enrollment-contract.ts

完整组件：

<<< ../../../examples/frontend/vue3-testing/LessonEnrollment.vue

组件只负责：

- 读取和规范化邮箱；
- 管理 pending、receipt 与可见错误；
- 阻止重复提交；
- 卸载时取消请求。

测试可以传入一个快速、可控制的服务替身，不需要知道 Axios、fetch、Base URL 或认证头细节：

<<< ../../../examples/frontend/vue3-testing/LessonEnrollment.test.mts

依赖注入不是“为了测试污染生产设计”。它同时让：

- 组件职责更小；
- 服务契约可替换；
- SSR、离线实现或不同后端更容易接入；
- 测试控制成功、失败和 pending 时机。

不要把所有依赖都做成 Prop。应用级服务也可通过 provide/inject 或组合根提供；关键是依赖来源明确，不在组件深处偷偷创建不可控制单例。

## Vue Test Utils 帮助我们操作组件，不替我们定义正确性

`mount()` 创建一个真实 Vue 应用实例并挂载组件。常用操作：

```ts
const wrapper = mount(LessonEnrollment, {
  props: { lessonId: 'vue-testing', service }
})

await wrapper.get('input').setValue('student@example.com')
await wrapper.get('form').trigger('submit')
```

### `get()` 和 `find()` 表达不同预期

- `get(selector)`：元素必须存在，否则立即给出清楚错误；
- `find(selector)`：元素可能不存在，可用 `exists()` 判断；
- `findAll(selector)`：得到多个匹配。

如果成功提示本来就必须存在，用 `get()`；如果错误提示应该消失，用 `find().exists()`。

### 选择器优先表达用户语义

在能用的情况下优先：

- label 与表单控件关系；
- role、可访问名称和可见文本；
- 稳定业务语义。

CSS class 多用于样式，重构 class 不应破坏行为测试。`data-test` 适合没有稳定语义或需要精确定位的容器，但不要用它绕过缺失的 label 和可访问名称。

模拟 DOM 环境不完整支持浏览器布局和原生校验。依赖真实几何、Canvas、复杂焦点、拖放或 CSS 行为时，应使用浏览器组件测试或 E2E。

## 异步测试先识别你在等待哪一个时钟

“加一个 await”不是通用答案。Vue 应用里常见四类异步来源：

| 来源 | 应等待什么 |
| --- | --- |
| Vue 响应式 DOM 更新 | `nextTick()`，或 await VTU 的 `trigger/setValue/setProps` |
| 已经排队的 Promise | `flushPromises()` 或具体 Promise |
| setTimeout / debounce | Fake Timer 推进时间 |
| Router 导航 | `router.isReady()`、导航 Promise，再等待相关更新 |

### 为什么 `await trigger()` 不等于接口完成

`trigger()` 返回的 Promise 方便等待 Vue 下一轮 DOM 更新，但组件发出的网络 Promise 可能仍在 pending。

`flushPromises()` 会让已经可结算的 Promise 回调继续执行，它不会：

- 自动推进未到期的 timer；
- 让永远 pending 的 Promise 完成；
- 等待真实网络；
- 替你判断业务究竟应该等待什么。

“到处 flushPromises”经常掩盖测试不理解异步链的问题。优先等待最具体的边界。

### Deferred Promise 能观察中间状态

测试重复提交时，不能让 Mock 立即 resolve，否则 pending 状态转瞬即逝。创建由测试掌握 resolve 的 Promise：

```ts
let resolve!: (receipt: EnrollmentReceipt) => void
const pending = new Promise<EnrollmentReceipt>((done) => {
  resolve = done
})
```

现在测试可以：

1. 提交一次；
2. 在 Promise 未结束时再次提交；
3. 断言服务只调用一次、按钮已禁用；
4. 手动 resolve；
5. 断言按钮恢复和结果出现。

这是控制状态机，不是靠 `setTimeout(100)` 猜请求何时完成。

## 防抖、取消和竞态必须分别测试

可取消搜索 composable：

<<< ../../../examples/frontend/vue3-testing/useDebouncedLessonSearch.mts

它依赖组件作用域来清理 timer 和请求，因此测试通过宿主组件运行：

<<< ../../../examples/frontend/vue3-testing/withSetup.mts

完整测试：

<<< ../../../examples/frontend/vue3-testing/useDebouncedLessonSearch.test.mts

其中三种行为不能互相替代：

1. **防抖**：299ms 不请求，第 300ms 才请求；
2. **取消**：新查询让旧 Signal 进入 aborted；
3. **结果所有权**：即使服务忽略 Signal，晚到的旧结果也不能覆盖新结果。

只断言 `signal.aborted === true` 仍不足以证明 UI 正确，因为底层服务可能无法真正取消。最强的测试会让旧请求故意最后返回，然后断言屏幕仍保留新查询结果。

Fake Timer 用完必须恢复。推进 timer 后还要按实现等待 Promise microtask；不要把假时间和真实时间混在同一个测试中。

## Mock 的目标是控制边界，不是让一切都变成假的

几个词的职责不同：

- **Fake**：可工作的简化实现，例如内存仓库；
- **Stub**：返回预设结果；
- **Spy**：记录真实函数怎样被调用；
- **Mock**：带调用预期的测试替身。

选择范围时先问：这条测试真正想验证什么？

### 注入接口

适合组件或 composable 的业务服务。类型明确、每例独立，不依赖模块加载顺序。

### `vi.mock()`

适合无法轻易注入的模块边界、平台 SDK 或遗留单例。它会受模块缓存和提升语义影响，过量使用会让测试只证明 Mock 之间能合作。

### `vi.spyOn()`

适合保留对象其余真实行为，只观察或临时替换一个公开方法。测试结束后应恢复。

### 网络层

可以在不同层拦截：

- 组件测试 Stub 服务接口；
- 服务测试拦截 fetch/HTTP Client；
- 更真实的集成测试用 Service Worker 或本地测试服务；
- E2E 可路由拦截，也可连接专用后端。

如果目标是验证 JSON 映射和 HTTP 错误处理，就不要把整个 service Mock 掉；如果目标只是按钮状态，也无需启动真实后端。

## Composable 是否需要宿主取决于它使用了什么

只使用 ref、computed 等响应式 API 的 composable，可以直接调用测试。

使用以下能力时需要组件实例：

- 生命周期钩子；
- provide/inject；
- 依赖组件作用域自动停止的 watcher；
- 当前实例上下文。

`withSetup()` 创建最小宿主并返回 app。测试结束必须 `app.unmount()`，这样才能验证并执行 `onScopeDispose()`、定时器取消和订阅清理。

清理本身就是行为。至少应有测试证明卸载后：

- Signal 被取消；
- timer 不再触发；
- 外部事件监听已移除；
- 旧异步结果不能修改活跃状态。

## Pinia 测试每例都要有新的状态容器

Store 示例：

<<< ../../../examples/frontend/vue3-testing/lesson-selection-store.mts

测试：

<<< ../../../examples/frontend/vue3-testing/lesson-selection-store.test.mts

`setActivePinia(createPinia())` 放在 `beforeEach`，使每个用例获得全新 Store 实例。否则测试顺序会决定 selectedIds 初值。

Store 单测重点是：

- Action 如何转换状态；
- Getter / computed 的派生结果；
- 并发请求和错误状态；
- reset、取消与资源清理；
- 业务不变量。

不需要为 Pinia 已经保证的 ref 响应性写大量测试。

### `createTestingPinia()` 的边界

组件测试中可用 Testing Pinia 快速提供 Store，并默认 Stub Actions。但若这条测试要验证 Action 真实改变状态，就必须明确关闭 Stub 或使用真实 Pinia。

“Action 被调用”与“Action 正确完成业务转换”是不同证据。

## Router 测试：导航协议用真实实例更可靠

若组件只是调用一次 `router.push()`，Mock `useRouter()` 可以验证目标对象。

若风险涉及以下行为，应使用隔离的真实 Router：

- path 与 name 是否匹配；
- params 是否转成 Props；
- 嵌套路由渲染；
- query、redirect 和 404；
- 导航守卫；
- RouterLink 与 RouterView 的协作。

完整集成测试：

<<< ../../../examples/frontend/vue3-testing/router.integration.test.mts

它为每个测试创建：

- `createMemoryHistory()`；
- 新 router；
- 最小路由表；
- 只服务当前用例的宿主组件。

初始导航要先 push，再 `await router.isReady()`，否则断言可能发生在首次导航确认之前。

守卫本身若包含复杂权限规则，应把规则提纯做单测，再用少量真实 Router 测试证明规则被正确接线。不要在几十个路由集成用例中重复所有权限排列。

## 表单、Events、Slots 与 Inject 应测契约

表单组件关注：

- label 能否定位控件；
- 用户输入后模型和 DOM 是否一致；
- submit 时 DTO 是否规范化；
- pending 是否阻止重复提交；
- 字段错误和表单错误如何显示；
- 失败是否保留输入；
- 成功后 reset 或导航语义；
- 异步错误是否可能覆盖新值。

Events 关注 payload 和触发条件：

```ts
expect(wrapper.emitted('update:modelValue')).toEqual([['next']])
```

组件 `v-model` 测试可以在一个小宿主中把 `update:modelValue` 写回 Prop，验证完整受控循环，而不只断言 emit 存在。

Slots 关注传入内容是否位于正确语义结构，Scoped Slot 是否收到承诺的 slot props。

provide/inject 测试应通过 `global.provide` 或真实 Provider 宿主注入，不要直接改 composable 私有变量。

Teleport 的目标 DOM 需要在测试前创建、测试后移除；Transition 通常可以 Stub 以避免动画时间，只有动画本身是需求时才进入真实浏览器测试。

## Snapshot 只能回答“输出变了吗”

大型 HTML Snapshot 很容易出现：

- 每次结构调整都大面积更新；
- 审查者直接接受新快照；
- 它记录很多 class，却没有解释什么才算正确；
- 动态 ID、时间使结果不稳定。

Snapshot 适合小而稳定的序列化结构、编译产物或错误对象。组件核心行为仍应写语义断言：

```ts
expect(wrapper.get('[role="alert"]').text())
  .toBe('你已经报名过该课程')
```

更新 Snapshot 不是修复测试，必须先确认变化符合需求。

## 时间、随机数和全局环境都必须归还

不稳定来源常包括：

- `Date.now()`、时区和 Locale；
- `Math.random()` 和随机 ID；
- fake timers 未恢复；
- `window.matchMedia`、ResizeObserver 等全局 Stub；
- localStorage、document.body；
- process env；
- 未恢复的 Spy；
- 未卸载的 Vue app。

策略是注入时钟和 ID 生成器，或在测试中固定时间：

```ts
vi.useFakeTimers()
vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
```

`afterEach` 中恢复 timer、Mock、全局和 DOM。更好的做法是每例只创建自己需要的资源，不把清理压力都交给一个巨大全局 setup。

## E2E 验证的是用户入口和完整接线

E2E 不导入 Vue 组件源码，而是从浏览器访问应用：

<<< ../../../examples/frontend/vue3-testing/lesson-enrollment.e2e.spec.mts

这个场景验证：

- 路由能进入课程页面；
- 标题对用户可见；
- label 能找到邮箱；
- 点击可访问名称为“确认报名”的按钮；
- 请求 DTO 正确；
- 成功状态最终出现。

### Locator 应依赖用户能感知的语义

优先使用：

```ts
page.getByRole('button', { name: '确认报名' })
page.getByLabel('邮箱')
page.getByRole('status')
```

复杂 CSS 链条与 DOM 层级紧耦合。若找不到一个控件，先检查它是否缺少可访问名称，而不是立即添加任意 selector。

### 使用 Web-first Assertions

```ts
await expect(page.getByRole('status'))
  .toContainText('enrollment-e2e-1')
```

Playwright 会在超时范围内重试 locator 和断言。不要写固定等待：

```ts
await page.waitForTimeout(1000)
```

固定时间在快机器上浪费，在慢 CI 上仍不够。等待可观察条件：响应、URL、元素状态或业务结果。

### 网络拦截与真实后端各证明不同事情

示例拦截接口，精确控制响应并断言请求体，适合稳定前端流程。

连接专用测试后端才能证明：

- 数据库约束；
- 认证 Cookie；
- CORS；
- 真正序列化协议；
- 后端部署接线。

核心系统通常同时需要少量拦截型场景和更少量全栈场景。

### 数据隔离是 E2E 稳定性的基础

并行用例不应共享一个会互相修改的账号。可选策略：

- 每例通过 API 创建唯一数据；
- worker 级隔离租户或账号；
- 测试后可靠清理；
- 数据库事务或重置；
- 使用幂等的固定只读 fixture。

登录状态可由 setup project 生成 storage state 复用，但涉及登录安全本身的场景仍要走真实登录。复用认证不能让用例共享业务状态。

跨浏览器测试有递减收益：主流程在 Chromium 全量运行，关键兼容风险再覆盖 WebKit/Firefox，通常比所有用例三倍运行更经济。

## Flaky Test 是系统问题，不是“多重跑几次”

常见根因：

- 固定时间等待；
- 用例顺序依赖；
- 共用账号和数据；
- 未等待导航或异步结果；
- selector 依赖易变 DOM；
- 动画、网络和系统时钟不受控；
- Promise、timer、订阅没有清理；
- CI 资源竞争；
- 生产代码本身存在竞态。

治理顺序：

1. 保存 trace、截图、视频、console 和 network 证据；
2. 找到等待条件、数据所有权或清理缺口；
3. 修复测试或生产竞态；
4. 只把重试作为采集偶发证据的短期手段；
5. 记录 flaky 率和负责人，不能永久静默忽略。

隔离测试虽然能让主分支暂时恢复，但必须有到期和修复责任。

## Coverage 告诉你执行过什么，不告诉你断言是否有意义

100% 行覆盖仍可能漏掉：

- 错误分支没有正确提示；
- 请求调用了两次；
- 旧请求覆盖新值；
- 时区边界错误；
- CSS 让按钮不可点击；
- 断言根本没有观察业务结果。

覆盖率适合发现“完全没执行过”的区域，而不是作为质量分数。阈值应按风险和模块性质设置：

- 领域规则可要求较高分支覆盖；
- UI 外壳更依赖组件和 E2E 行为；
- 生成代码和类型声明通常应排除。

Mutation Testing 会故意改变条件和返回值，看测试是否失败。它比行覆盖更接近“断言是否能发现错误”，但运行成本高，可用于关键领域模块而非全仓默认。

## CI 应按反馈速度分层

一个常见流水线：

```text
静态检查、类型检查、纯单元测试
  ↓
组件与集成测试
  ↓
构建应用
  ↓
关键 Chromium E2E
  ↓
扩展浏览器、视觉或全栈回归
```

前层失败就尽早停止；慢测试按文件或历史耗时并行分片。并行前必须先解决模块单例、端口、数据库和账号共享问题，否则只会放大 flaky。

测试自身也要有性能预算。常见拖慢原因：

- 每例 mount 整个应用；
- 所有测试都使用 DOM 环境；
- 大量真实 timer；
- 重复创建昂贵 fixture；
- E2E 每例重新登录；
- Helper 隐藏了过多无关 setup。

优化不能牺牲隔离。复用不可变构建产物可以，复用会改变的 Store 和数据库实体通常不可以。

## 可测试架构的信号

容易测试的生产代码通常同时具备：

- 纯规则与 I/O 分离；
- 服务接口明确；
- 依赖在边界提供；
- 组件通过 Props/Events/DOM 表达契约；
- Router 和 Store 可以为每个应用实例创建；
- 时间、随机数和存储可以替换；
- 异步任务有取消和结果所有权；
- 错误是结构化协议；
- 资源有明确清理生命周期。

如果一个组件只能靠十几个模块 Mock 才能 mount，往往说明它承担了过多职责。

但不要为了测试暴露私有 ref、添加只供测试调用的方法，或把所有内部细节做成公共 API。测试困难应推动更好的生产边界，而不是破坏封装。

## 当前工作树的验证边界

本仓库当前没有安装 Vitest、Vue Test Utils、Pinia、Vue Router 或 Playwright，也不允许本专题修改根 `package.json`。因此：

- `*.test.mts` 和 E2E 文件是完整参考源码；
- 本课不会声称已实际运行这些测试；
- 可独立的纯 TypeScript 规则仍可由现有 TypeScript 检查覆盖；
- 引入到真实项目时，应按锁文件版本安装依赖并实际运行；
- Vue SFC 还应使用 `vue-tsc` 做模板类型检查。

明确验证边界比给出一条虚假的“全部测试通过”更重要。

## 阅读完整示例的顺序

先看纯业务契约：

<<< ../../../examples/frontend/vue3-testing/lesson-policy.ts

<<< ../../../examples/frontend/vue3-testing/lesson-policy.test.mts

再看组件与可替换服务：

<<< ../../../examples/frontend/vue3-testing/enrollment-contract.ts

<<< ../../../examples/frontend/vue3-testing/LessonEnrollment.vue

<<< ../../../examples/frontend/vue3-testing/LessonEnrollment.test.mts

然后看异步 composable 的作用域和竞态：

<<< ../../../examples/frontend/vue3-testing/withSetup.mts

<<< ../../../examples/frontend/vue3-testing/useDebouncedLessonSearch.mts

<<< ../../../examples/frontend/vue3-testing/useDebouncedLessonSearch.test.mts

最后看真实插件与浏览器边界：

<<< ../../../examples/frontend/vue3-testing/lesson-selection-store.test.mts

<<< ../../../examples/frontend/vue3-testing/router.integration.test.mts

<<< ../../../examples/frontend/vue3-testing/lesson-enrollment.e2e.spec.mts

整条推理链是：

```text
先识别昂贵风险
  ↓
选择最低成本且信号足够的层级
  ↓
从公开输入操作
  ↓
等待真正的异步边界
  ↓
断言用户可观察结果
  ↓
隔离并清理所有资源
```

## 常见反模式

### 只测试“能够 mount”

它只能发现极少量初始化错误，不能证明任何业务行为。

### 主要断言 `wrapper.vm`

测试绑定内部命名和实现。优先从 DOM、Events、导航和服务边界观察。

### 所有子组件都 shallow stub

可能把真正有风险的 Props、Slots 和事件接线全部替换掉。只 Stub 与当前风险无关且昂贵的边界。

### Mock 所有模块

测试最后只证明手写返回值能被手写断言读取。保留真正想验证的实现。

### 到处 `flushPromises()`

它掩盖对 timer、Vue flush、导航或业务 Promise 的混淆。等待具体原因。

### 固定等待

机器快慢会让结果 flaky。等待可观察条件。

### 追求 100% Snapshot

大量输出变化没有业务含义，审查容易失效。关键行为写明确断言。

### E2E 共用账号

并行修改造成顺序依赖。为数据和身份建立隔离策略。

## 本课小结

- 测试从风险出发，不从文件数量或固定层级比例出发；
- 纯规则优先提取成无框架函数，组件测试关注 DOM 和公共契约；
- `nextTick`、`flushPromises`、Fake Timer 和 Router 等待解决不同异步来源；
- 防抖、Signal 取消和旧结果所有权必须分别验证；
- Mock 应控制边界，不能替换掉真正想证明的系统；
- Pinia、Router、宿主组件和全局环境都应每例隔离并清理；
- Playwright 的语义 Locator 与 Web-first Assertions 比固定等待稳定；
- Coverage 是未覆盖区域的线索，不等于业务信心；
- flaky 往往暴露等待、数据所有权或生产竞态，重试不是根治；
- 可测试性来自清晰依赖、明确生命周期和结构化错误，而不是暴露内部实现。

下一节是[Vue 3 SSR、Hydration 与同构应用边界](/frontend/vue3/ssr-hydration-and-universal-application-boundaries)。测试课区分了模拟 DOM 与真实浏览器，SSR 课会继续解释同一组件在服务端请求环境和浏览器环境中为何必须拥有不同的状态与副作用边界。

## 官方资料

- [Vue：测试指南](https://vuejs.org/guide/scaling-up/testing.html)
- [Vue Test Utils 2：入门](https://test-utils.vuejs.org/guide/)
- [Vue Test Utils：异步行为](https://test-utils.vuejs.org/guide/advanced/async-suspense.html)
- [Vue Test Utils：编写易测试组件](https://test-utils.vuejs.org/guide/essentials/easy-to-test.html)
- [Vitest：Mocking](https://vitest.dev/guide/mocking.html)
- [Vitest：Fake Timers](https://vitest.dev/guide/mocking/timers)
- [Vitest：Coverage](https://vitest.dev/guide/coverage.html)
- [Playwright：Locators](https://playwright.dev/docs/locators)
- [Playwright：Auto-waiting](https://playwright.dev/docs/actionability)
- [Playwright：Test Isolation](https://playwright.dev/docs/browser-contexts)
