---
title: Vue 2 到 Vue 3 的渐进式迁移与大型应用架构
description: 用兼容构建、边界适配、自动化验证和可回滚发布，把大型 Vue 2 应用安全迁移到原生 Vue 3
---

# Vue 2 到 Vue 3 的渐进式迁移与大型应用架构

> 适用对象：维护过 Vue 2 Options API、Vue Router 3、Vuex 与传统 Vue CLI/Webpack 项目的开发者。Vue 2 已于 2023 年 12 月 31 日结束官方支持；依赖版本和兼容性必须按项目锁文件及官方迁移说明逐项核对。

## 1. 学习目标

完成本节后，你应该能够：

- 把迁移视为受约束的系统演进，而不是一次大规模语法重写。
- 盘点运行时、模板、插件、组件库、构建链与浏览器支持风险。
- 判断原地升级、`@vue/compat`、Vue 2.7 过渡和并行应用的适用条件。
- 建立可观测、可分批、可回滚的迁移路线。
- 正确迁移 `createApp`、`v-model`、Events、Attrs、Slots 和生命周期。
- 升级 Vue Router 3 到 4，并识别路由行为而非只改 API 名称。
- 在 Vuex 与 Pinia 并存期间按业务域逐步迁移 Store。
- 从 Mixins 和大型 Options 组件中提取稳定的 Composable 与服务边界。
- 使用适配器保持新旧组件契约，降低调用方同时修改的范围。
- 通过契约、组件、路由和 E2E 测试证明行为等价。
- 定义移除兼容构建的客观退出条件。

## 2. 迁移的真正目标

迁移不是让代码“看起来像 Vue 3”，而是在业务持续交付的情况下改变运行平台，同时保持用户可观察行为、数据正确性和可运维性。

应区分三个目标：

1. **运行时迁移**：应用真正运行在标准 Vue 3 上。
2. **生态迁移**：Router、Store、UI 库、测试和构建工具进入受支持版本。
3. **架构改进**：逐步清理全局状态、隐式 Mixins、事件总线和难测试组件。

前两个是必要条件，第三个应按收益实施。把三者一次性绑定成“重写整个前端”，会放大回归范围，也无法判断故障来自框架变化还是架构重构。

完成迁移的定义不应是“本地能打开首页”，而应包括：

- 使用标准 Vue 3 构建，不再 Alias 到 `@vue/compat`。
- 生产依赖不存在 Vue 2 副本或仅支持 Vue 2 的插件。
- 兼容警告为零，控制台无 Vue 运行时警告。
- 关键业务、深层路由、权限、表单和异常路径已验证。
- 性能、错误率和核心转化不劣于迁移前基线。
- 回滚方案经过演练，而不只是文档中的一句话。

## 3. 为什么“大爆炸重写”通常失败

一次性改框架、语言、状态库、路由、构建工具、UI 系统和目录结构，会让每个失败同时拥有多个可能原因。长分支还会持续与业务主线冲突，最后只能在压力下合并一个难以审查的巨型变更。

更稳妥的原则是：

```text
先建立基线 → 解耦环境边界 → 让旧代码跑在新运行时
            → 按业务切片替换旧语义 → 移除兼容层
```

每个阶段都应保持可部署。迁移可以慢，但不能处于长期“只有迁移分支能运行”的状态。

## 4. 第一步不是升级，而是盘点

### 运行与产品约束

- 是否仍需 IE11？Vue 3 不支持 IE11。
- 是否有 SSR、微前端、多入口、内嵌 WebView 或浏览器扩展？
- 哪些流程产生收入、权限变更或不可逆写操作？
- 可以灰度到用户、租户、路由还是构建版本？
- 可接受的维护窗口与回滚时间是多少？

### 代码扫描

优先搜索这些高信号模式：

```text
new Vue(
Vue.use / Vue.component / Vue.mixin / Vue.prototype
$on / $off / $once / $children / $listeners / $scopedSlots
.native / .sync / filters / functional
beforeDestroy / destroyed
Vue.set / this.$set / Vue.delete / this.$delete
<transition-group> / render( / h(
watch: 中被原地修改的数组
```

搜索只能发现语法，不能发现依赖对 Vue 2 私有 VNode、全局构造器或 DOM 时序的假设。还要运行真实页面并收集兼容警告、组件堆栈和第三方调用来源。

### 依赖矩阵

为每个运行时依赖记录：

| 字段 | 要回答的问题 |
| --- | --- |
| Vue 3 支持版本 | 是否有官方兼容版本，迁移说明是什么？ |
| 维护状态 | 是否仍维护，安全与浏览器策略如何？ |
| 替代方案 | 原包停更时是否能替换或内部封装？ |
| 使用范围 | 全局初始化还是只有两个页面？ |
| 私有 API | 是否读取 VNode、`_` 前缀字段或依赖旧 Slot 结构？ |
| CSS/DOM 契约 | 升级后结构、类名和 Teleport 是否变化？ |
| 阻塞等级 | 阻止启动、局部异常，还是仅有警告？ |

不要只看 `peerDependencies`。UI 组件库可能声明支持 Vue 3，但主题、表单验证、日期时区或自动导入插件仍有行为差异。

## 5. 先保存可比较的基线

迁移前记录：

- 锁文件、Node 版本、构建命令和环境变量清单。
- 单元、组件、E2E 当前通过率与已知 flaky case。
- 关键页面截图和可访问性树。
- 路由表、重定向、权限和滚动行为。
- Bundle 大小、构建时长、LCP/INP、JS 错误率。
- 登录、搜索、创建、编辑、支付等关键业务指标。

没有迁移前数据，就无法区分“已有问题”和“迁移回归”，也无法证明新版本可以放量。

## 6. 四种迁移路径

### 直接升级到标准 Vue 3

适合规模较小、依赖简单、自动化覆盖良好的项目。优点是没有长期兼容债务；缺点是一次修改范围较大。

### 使用 `@vue/compat`

迁移构建本质是 Vue 3，但可配置地模拟部分 Vue 2 公共行为，并对已变更 API 发出警告。适合大多数能在同一运行时内升级的大型 SPA。

它不保证兼容：依赖 Vue 2 内部 API、旧 VNode 细节、IE11 或复杂自定义 SSR 的项目可能无法直接使用。即使能运行，也要把 compat 当作临时迁移工具，不是最终运行平台。

典型节奏：

1. 工具链和编译器升级到兼容组合。
2. `vue` Alias 到 `@vue/compat`，版本与 Vue 保持一致。
3. 先用 MODE 2 让旧行为运行，修编译错误和高频警告。
4. 对已迁移组件切换 MODE 3，或逐项禁用兼容特性。
5. 所有警告和依赖清零后移除 Alias，使用标准 Vue 3。

兼容标志不是“消音按钮”。每次临时开启都要有负责人、退出条件和验证证据。

### 先进入 Vue 2.7

Vue 2.7 内置 Composition API 和部分现代 SFC 能力，可先在仍运行 Vue 2 的情况下提取 Composable、更新 Slot 语法和加强 TypeScript 边界。但它不提供 Vue 3 的 Proxy 运行时，也不能替代最终升级；Vue 2 本身已经 EOL。

### 新旧应用并行

当关键依赖无法共存、页面天然分区或后端能按路由分流时，可以让 Vue 2 和 Vue 3 作为两个独立入口：

- 服务端或网关按路径分发。
- Vue 3 新应用逐路由接管。
- 身份、导航、设计 Token 和遥测通过明确协议共享。

不要让两个 Vue 运行时同时管理同一 DOM 子树。微前端带来包体、路由、全局 CSS、通信和运维成本，只应在组织与发布独立性确有价值时采用。

## 7. 推荐的阶段化路线

| 阶段 | 主要产出 | 退出条件 |
| --- | --- | --- |
| 0. 基线 | 测试、监控、依赖矩阵 | 能复现和度量当前版本 |
| 1. 前置清理 | 去除私有 API、更新可双栈语法 | Vue 2 下行为不变 |
| 2. 工具链 | Node、SFC 编译器、测试工具 | CI 可重复构建和测试 |
| 3. Compat 启动 | Vue 3 runtime + 兼容警告 | 关键页面可以运行 |
| 4. 核心生态 | Router 4、Store 策略、UI 库 | 导航与状态行为稳定 |
| 5. 业务切片 | 逐域进入 Vue 3 原生语义 | 切片可独立灰度回滚 |
| 6. 去 Compat | 标准 Vue 3 | 零兼容标志、零旧依赖 |
| 7. 优化 | Composition、Pinia、Vite 等 | 由收益驱动而非迁移阻塞 |

把“工具链换 Vite”与“Vue 运行时迁移”拆开评估。Vite 是 Vue 3 官方推荐工具，但如果旧 Webpack 构建本身复杂，先在原工具链升级运行时可减少变量；也可以先让 Vue 2 在 Vite 上运行。选择取决于哪条路径更易验证和回滚。

## 8. 应用入口：从全局构造器到 App 实例

Vue 2 的 `Vue.use()`、`Vue.mixin()`、`Vue.component()` 和 `Vue.prototype` 修改共享构造器，容易污染测试和同页其他根实例。Vue 3 把可变全局配置收敛到 `createApp()` 返回的应用实例。

```ts
// Vue 2
Vue.use(router)
Vue.prototype.$api = api
new Vue({ store, render: (h) => h(App) }).$mount('#app')
```

标准 Vue 3 入口：

<<< ../../../examples/frontend/vue2-to-vue3-migration/main.mts

迁移插件时检查：

- 插件是否实现 `install(app, options)`。
- 全局组件和指令是否注册到当前 app。
- 是否能用 `provide/inject` 代替 `globalProperties`。
- 测试是否每例创建新 app，而非复用污染后的全局 Vue。
- `mount()` 不再用新根节点替换容器，依赖容器 DOM 的 CSS/测试要复核。

不要机械地把所有 `Vue.prototype.$api` 改成 `app.config.globalProperties.$api`。后者仍是隐式全局依赖；对业务服务优先使用显式导入或带类型的 Provide/Inject。

## 9. Options API 不需要被“消灭”

Options API 在 Vue 3 中仍被支持，也没有官方弃用计划。一个迁移后的 Options 组件可以先只修改破坏性 API，保持业务结构不变：

<<< ../../../examples/frontend/vue2-to-vue3-migration/LegacyLessonSearch.vue

该组件已经使用 Vue 3 的 `beforeUnmount` 与 `emits`，但仍是 Options API。这样做的好处是把“运行时兼容”与“代码组织优化”分成两个可审查步骤。

适合重构为 Composition API 的信号：

- 单个业务关注点散落在 data、computed、watch、methods 和生命周期。
- 多个组件靠 Mixin 复制逻辑，来源和冲突不清晰。
- 依赖 `this` 让 TypeScript 推断困难。
- 同一状态机需要在组件、Store 和测试中复用。

小而稳定的 Options 组件没有迁移压力。为了风格统一改写几百个简单组件，通常收益低于风险。

## 10. 从 Mixin 提取 Composable，而不是逐行翻译

先识别一个完整业务能力的输入、输出、副作用和清理，再提取。课程搜索 Composable：

<<< ../../../examples/frontend/vue2-to-vue3-migration/useLessonSearch.mts

它显式接收响应式关键词和 `LessonGateway`，并处理：

- 旧请求取消。
- 异步竞态隔离。
- Error 边界。
- Scope 销毁时停止 Watch 和 Abort。
- 对外暴露只读状态。

迁移后的页面组件只负责模板契约：

<<< ../../../examples/frontend/vue2-to-vue3-migration/LessonSearch.vue

不要把 Mixin 中所有字段原样塞进一个巨型 `useLegacyPage()`。那只是把隐式耦合从 Options 搬到函数。按搜索、权限、草稿、遥测等业务能力拆分，并显式传入服务。

## 11. 建立与 Vue 无关的服务边界

迁移最容易验证的是纯 TypeScript 契约：

<<< ../../../examples/frontend/vue2-to-vue3-migration/contracts.ts

HTTP 实现在框架外：

<<< ../../../examples/frontend/vue2-to-vue3-migration/lesson-gateway.ts

这样旧 Options 组件和新 Composition 组件可以调用同一个 Gateway，避免迁移时同时重写数据协议。测试也能注入内存实现，不依赖 `this.$http` 或模块 Mock。

边界应处理 URL、Header、状态码和数据验证；组件负责交互状态。不要让组件到处拼 URL，也不要让 API Client 持有 Vue ref。

## 12. `v-model` 与 `.sync` 的契约迁移

Vue 2 自定义组件默认使用：

```text
prop: value       event: input
```

Vue 3 默认使用：

```text
prop: modelValue  event: update:modelValue
```

`.sync` 和组件 `model` Option 被带参数的 `v-model` 取代；Vue 3 还允许一个组件有多个 `v-model`。

原生 Vue 3 Toggle：

<<< ../../../examples/frontend/vue2-to-vue3-migration/BaseToggle.vue

如果几十个旧调用方仍传 `value` / 监听 `input`，先加薄适配器：

<<< ../../../examples/frontend/vue2-to-vue3-migration/LegacyToggleAdapter.vue

适配器让新组件内部只维护一种标准契约，旧调用方可逐步切换。等调用数归零再删除适配器。不要让核心组件永久同时支持两套 Props/Events，否则每个状态都可能出现双写和优先级问题。

## 13. Events、`$attrs` 与组件边界

Vue 3 移除了组件实例的 `$on`、`$off`、`$once`，因此 `new Vue()` 事件总线模式不再成立。先判断通信类型：

- 父子通信：Props / Emits。
- 跨层依赖：Provide / Inject。
- 共享业务状态：Pinia。
- 与 Vue 无关的短生命周期通知：小型外部 emitter。

本课的类型安全 Emitter：

<<< ../../../examples/frontend/vue2-to-vue3-migration/typed-emitter.ts

运行时只创建一个显式实例：

<<< ../../../examples/frontend/vue2-to-vue3-migration/migration-runtime.mts

它仍然需要退订和所有权规则，不能成为新的全局垃圾场。若事件会影响页面可恢复业务状态，应放入 Store，而不是依赖“刚好收到过”某个瞬时事件。

Vue 3 新增 `emits` 声明。未声明的事件监听器会进入 `$attrs`，默认落到根元素；再手动 `$emit` 同名原生事件可能造成触发两次。迁移组件必须盘点公开事件并声明它们。

同时注意：

- `.native` 被移除。
- `$listeners` 合并进 `$attrs`。
- `$attrs` 现在包含 `class` 和 `style`。
- Fragment 多根组件无法自动判断 Attr 应落在哪个根，需要显式 `v-bind="$attrs"`。
- Slot 在 Vue 3 中统一为函数，读取和转发方式需要复核。

## 14. 模板语义变化不能靠类型检查发现

高风险变化包括：

| Vue 2 习惯 | Vue 3 行为/迁移策略 |
| --- | --- |
| 同元素同时写 `v-for` 与 `v-if` | 优先级变化；用外层 `<template>` 或计算属性拆开 |
| 多个 `v-bind` 合并 | 顺序决定覆盖结果；显式安排对象和单项绑定顺序 |
| `<template v-for>` 的 Key 在子节点 | Key 放到 `<template>` 上 |
| Filter `{{ value \| format }}` | 改用方法、Computed 或普通格式化函数 |
| KeyCode 修饰符 | 使用按键名修饰符 |
| `TransitionGroup` 默认有根元素 | 明确 `tag` 或调整 CSS/布局 |
| `*-enter` / `*-leave` 类 | 检查新的 `*-enter-from` / `*-leave-from` 类名 |
| 函数式 SFC 模板 | 改为普通函数或标准组件 |
| 异步组件工厂 | 使用 `defineAsyncComponent()` |

模板编译警告很有价值，但视觉回归、DOM 查询、Transition 和 CSS 选择器仍需浏览器测试。

## 15. 响应式差异与 Watch 陷阱

Vue 3 使用 Proxy，因此通常不再需要 `Vue.set` / `this.$set` / `Vue.delete`。直接新增和删除响应式对象属性即可。

但“删除 `$set`”不代表响应式语义完全相同：

- 对同一原始对象调用 `reactive()` 得到 Proxy，身份比较要谨慎。
- 解构 reactive 属性会失去响应式连接，应使用 `toRefs()` 或直接访问对象。
- 第三方类实例、不可变对象可考虑 `markRaw` / `shallowRef`。
- 不应依赖 Vue 2 Observer 的 `__ob__` 等内部字段。

Watch 数组是常见静默回归。Vue 3 默认只在数组被替换时触发；若要观察 `push/splice`：

```ts
watch(items, handleItemsChange, { deep: 1 }) // Vue 3.5+
```

Vue 3.0—3.4 只能用 `deep: true`，但这还会深度遍历元素。不要为了模拟旧行为给所有 Watch 加 `deep: true`；先确认真正依赖的是数组成员变化、元素内部变化，还是可由 Action 显式触发的业务事件。

## 16. 生命周期与指令迁移

主要命名变化：

```text
beforeDestroy → beforeUnmount
destroyed     → unmounted
```

自定义指令 Hook 也与组件生命周期对齐，例如 `bind` → `beforeMount`、`inserted` → `mounted`、`componentUpdated` → `updated`、`unbind` → `unmounted`。指令的 Binding、VNode 参数也要按官方说明检查，不能只重命名函数。

迁移时重点验证资源清理：Timer、Observer、EventListener、Socket、AbortController 是否确实在卸载时释放。`KeepAlive` 页面还要区分 deactivated 与 unmounted。

## 17. Vue Router 3 到 4

完整 Vue Router 4 示例：

<<< ../../../examples/frontend/vue2-to-vue3-migration/router.mts

关键变化：

- `new VueRouter()` → `createRouter()`。
- `mode: 'history'` → `history: createWebHistory(base)`。
- Hash/abstract 分别对应 `createWebHashHistory()` / `createMemoryHistory()`。
- `onReady()` → 返回 Promise 的 `isReady()`。
- `router.currentRoute` 现在是 Ref，组件外读取 `.value`。
- Catch-all 从 `*` 改为 `/:pathMatch(.*)*`。
- `scrollBehavior` 的 `x/y` 改为 `left/top`。
- 导航守卫可返回值，不再要求到处调用 `next()`。
- `<RouterView>` 与 Transition/KeepAlive 组合使用 scoped slot。

迁移 Router 不能只让 TypeScript 通过。必须验证：

- 直接打开深层 URL 时服务器回退配置正确。
- Base path、编码参数、Query 和尾斜线行为。
- 登录重定向和 return URL 不形成循环或开放重定向。
- 重复导航、取消导航、异步权限和 404。
- Back/Forward、滚动恢复、KeepAlive 缓存 Key。
- 手写 `history.pushState()` 不破坏 Router 自己的 state。

## 18. Vuex 到 Pinia 应与 Vue 3 迁移解耦

Vuex 4 可以运行在 Vue 3，因此最稳方案常是先升级运行时和 Router，保留 Store 行为；之后再按业务域迁到 Pinia。不要在最脆弱的运行时切换阶段同时重写全部状态。

Pinia 官方迁移策略是：一个 namespaced Vuex module 通常对应一个独立 Store；嵌套模块也可拆成 Store，并通过函数调用组合。

示例 Pinia Store：

<<< ../../../examples/frontend/vue2-to-vue3-migration/lesson-store.mts

渐进迁移原则：

- 新 Store 可以读取尚未迁移的 Vuex，但依赖方向应单向并可追踪。
- 不要对同一业务实体在 Vuex 与 Pinia 双写；定义唯一 Source of Truth。
- 先迁叶子模块，再迁被大量模块依赖的核心状态。
- 保持 Action 的异步错误与返回值契约。
- 对持久化、SSR 序列化和跨 Tab 同步单独验证。
- Store ID 是命名空间和 DevTools 身份，必须稳定且唯一。

完成某域后删除 Vuex 旧模块和桥接代码，避免“临时双栈”永久化。

## 19. 用业务切片组织大型迁移

按文件类型迁移容易形成“所有 Store 已改，但没有一条业务链能上线”。按业务切片迁移更容易端到端验证：

```text
课程搜索切片
├── 路由入口
├── 搜索页面与子组件
├── LessonGateway
├── 选择状态
├── 权限与遥测
└── 组件/路由/E2E 测试
```

完整迁移页同时保留旧、新搜索实现，并由发布标志选择：

<<< ../../../examples/frontend/vue2-to-vue3-migration/MigrationPage.vue

这里的静态 Flag 只是代码示例。生产 Flag 系统应明确：

- Flag 在启动、请求还是会话级求值。
- 同一用户是否稳定分桶。
- Flag 服务失败时采用哪个安全默认值。
- 回滚是否只切流量，还是还涉及数据 Schema。
- Flag 何时删除以及由谁负责。

同一接口契约使新旧实现能被同一套测试驱动，也让回滚不需要转换数据。

## 20. 兼容警告必须成为可管理的工作项

浏览器控制台滚过几千条 Warning 不等于迁移计划。把每类问题建立台账：

<<< ../../../examples/frontend/vue2-to-vue3-migration/migration-ledger.ts

建议记录：

- Compat Feature ID 与组件堆栈。
- 自有代码或第三方依赖来源。
- 影响页面和风险等级。
- 负责人、目标版本和回滚 Flag。
- 修复 PR、测试、灰度和生产证据。

台账摘要只有在没有 blocked 和 compat 项时才允许移除兼容层。`assertAssignedOwners()` 保证每项都有负责人；真实系统还应验证 ID 唯一、Flag 存在和证据链接有效。

## 21. 组件库与 Design System 是迁移放大器

底层 Button、Input、Dialog 被上千个页面调用，契约变化会被放大。优先为公共组件建立：

- Props、Events、Slots、Expose 的类型和文档。
- Vue 2/3 契约适配层。
- 视觉回归、键盘和屏幕阅读器测试。
- Teleport Target、Z-index、焦点锁定和滚动锁定验证。
- CSS Token，而不是依赖内部 DOM 层级的全局选择器。

先迁叶子业务组件还是基础组件没有统一答案。若 Design System 已有成熟 Vue 3 版本，应先建立兼容适配；若公共组件本身高度不稳定，可以先迁一个垂直切片来验证新实现，再逐步扩大。

## 22. TypeScript 迁移不要用 `any` 掩盖框架变化

常见临时做法是给 `this`、Router、Store 和组件实例全部加 `any`，结果运行时错误只是从编译期被推迟。更有效的顺序：

1. 先为 API DTO、路由 Meta、Store State 建立领域类型。
2. Options 组件使用 `defineComponent()` 改善 `this` 推断。
3. 明确 Props 默认值、Emits Payload 和 Template Ref。
4. 用 `unknown` 接错误和外部输入，再收窄。
5. 局部兼容声明必须带删除条件，不能覆盖整个 `vue` 模块。

第三方包缺类型时，可在边界写最小 Module Declaration；不要声明成一个无所不包的 `any`，否则升级真正改变 API 时编译器无法帮助发现。

## 23. 测试：验证行为等价，不验证代码形状

### 契约测试

旧搜索组件和新搜索组件应共享同一行为套件：

- 首次加载调用 Gateway。
- 输入关键词产生正确查询。
- 旧请求被取消，慢响应不覆盖新响应。
- 错误可访问地展示。
- 点击结果发出相同的领域 Payload。

### 组件测试

验证 Props、Events、Slots、Attrs 和 DOM 行为，尤其关注：

- `v-model` 是否单次更新，避免 input/update 双发。
- 未声明事件是否意外落到根 DOM。
- Fragment 的 class/style/listener 是否正确透传。
- 卸载后异步回调不会继续写状态。

### Router 集成测试

每个测试创建新的 Router，`push()` 后等待 `isReady()`。覆盖权限、重定向、404、动态参数和 navigation failure。

### 真实浏览器 E2E

关键流程同时在旧版和迁移版执行，比较用户可见结果、API 写操作和遥测。把 Vue Warning、Unhandled Rejection 和 Console Error 视为失败，而不是人工忽略。

### 视觉与性能回归

Transition、UI 库 DOM 和 Attr 变化可能不触发功能断言。对核心页面做截图与可访问性检查，并比较 Bundle、LCP、INP 和错误率。

## 24. 灰度、监控与回滚

发布顺序建议：

1. 内部环境和自动化全量。
2. 员工或测试租户。
3. 少量稳定用户，保持分桶粘性。
4. 按指标逐步扩大。
5. 全量后保留短期回滚窗口。
6. 稳定后删除 Flag 和旧实现。

监控至少按构建版本、Vue 模式和 Flag 维度切分：

- JS Error、白屏、Chunk load failure。
- API 错误和重复写请求。
- 路由导航失败与登录循环。
- Web Vitals 和长任务。
- 核心流程成功率和业务转化。

回滚不一定只是部署旧 Bundle。如果迁移同时改变 API 或本地持久化 Schema，旧前端可能读不懂新数据。使用向后兼容 Schema、版本化存储和 Expand/Contract 发布，确保回滚链路真实成立。

## 25. 移除 `@vue/compat` 的 Gate

只有同时满足以下条件才切换标准构建：

- 自有代码和依赖产生的 Compat Warning 为零。
- 没有启用的 Compat Feature Flag 或 MODE 2 组件。
- 所有生产 Vue 插件明确支持当前 Vue 3 版本。
- Lockfile 只有预期 Vue Runtime，编译器版本匹配。
- 关键测试、视觉测试和性能门禁通过。
- 灰度期错误率与业务指标稳定。
- 标准构建已在 CI 和预生产独立验证。

切换标准构建后，再运行一次全量回归。兼容构建“零警告”和标准构建仍不是绝对等价，第三方包可能存在没有警告覆盖的隐式依赖。

## 26. 常见失败模式

### 把 Warning 全部关闭

控制台安静了，但旧语义仍在。只允许针对已知第三方阻塞短期配置兼容，并建立退出项。

### 先改所有组件为 `<script setup>`

代码 Diff 巨大，运行时仍未升级。先获得标准 Vue 3 运行能力，再按维护收益重构。

### Vuex 和 Pinia 双向同步

一处更新触发两个订阅系统，循环、竞态和调试成本迅速增加。按域确定唯一所有者，通过只读适配过渡。

### 新旧组件契约同时扩散

所有调用方都写版本判断。应把版本差异封装在边界 Adapter，内部只维护一种新契约。

### 只测 Happy Path

迁移回归集中在权限、取消、卸载、深链接、表单错误和第三方组件。风险矩阵必须覆盖异常路径。

### Compat 永久留在生产

临时层没有日期和负责人就会变成平台本身。用退出 Gate 和台账控制兼容债务。

## 27. 完整示例结构

```text
examples/frontend/vue2-to-vue3-migration/
├── BaseToggle.vue
├── LegacyLessonSearch.vue
├── LegacyToggleAdapter.vue
├── LessonDetailPage.vue
├── LessonSearch.vue
├── MigrationPage.vue
├── NotFoundPage.vue
├── contracts.ts
├── lesson-gateway.ts
├── lesson-store.mts
├── main.mts
├── migration-ledger.ts
├── migration-runtime.mts
├── router.mts
├── typed-emitter.ts
└── useLessonSearch.mts
```

前文已经展示核心文件。以下补齐剩余完整源码，保证页面可以直接阅读整套示例。

### 课程详情占位页

<<< ../../../examples/frontend/vue2-to-vue3-migration/LessonDetailPage.vue

### 404 页

<<< ../../../examples/frontend/vue2-to-vue3-migration/NotFoundPage.vue

示例没有包含 `@vue/compat` 的 Vite 配置，因为本专题不得修改根 `package.json` 和构建配置，而且兼容版本必须与真实项目锁定的 Vue/SFC 编译器版本匹配。迁移时应从 Vue 官方 Migration Build 配置开始，而不是复制一个脱离版本上下文的配置片段。

## 28. 生产检查清单

### 规划

- 有依赖矩阵、业务风险、负责人和阶段退出条件。
- 迁移前功能、性能与错误率基线可重复。
- 目标浏览器和 SSR/微前端约束已确认。

### 代码边界

- 不依赖 Vue 2 私有 API、VNode 结构和全局事件总线。
- API、领域规则和迁移台账可在 Vue 外测试。
- 新旧契约差异集中在 Adapter。
- 每个业务状态只有一个 Source of Truth。

### Vue 语义

- `v-model`、Emits、Attrs、Slots 和数组 Watch 已审计。
- 生命周期和自定义指令完成清理验证。
- Template、Transition、异步与函数式组件已扫描。
- Router 深链、权限、History 和 404 已验证。

### 发布

- Flag 有稳定分桶、安全默认值和删除日期。
- 指标能区分旧版、新版和迁移切片。
- 回滚兼容数据、缓存与持久化 Schema。
- 标准 Vue 3 构建已经过独立灰度。

## 29. 进一步阅读

- [Vue 3 Migration Guide](https://v3-migration.vuejs.org/)
- [Vue：Migration Build](https://v3-migration.vuejs.org/migration-build.html)
- [Vue：Breaking Changes](https://v3-migration.vuejs.org/breaking-changes/)
- [Vue：Composition API FAQ](https://vuejs.org/guide/extras/composition-api-faq.html)
- [Vue Router：Migrating from Vue 2](https://router.vuejs.org/guide/migration/)
- [Pinia：Migrating from Vuex ≤4](https://pinia.vuejs.org/cookbook/migration-vuex.html)
- [Vue 2 EOL](https://v2.vuejs.org/eol/)

## 30. 本节小结

大型 Vue 迁移的核心能力不是记住破坏性 API 清单，而是控制变化：先建立基线和边界，让旧行为在新运行时中可观测；再按业务切片替换语义，用 Adapter、Flag、测试和监控降低每次发布风险；最后以零兼容项和标准 Vue 3 构建作为明确终点。

Options API、Vuex 和旧构建工具不必在同一时间被重写。真正需要尽快消除的是不受支持的运行时、私有 API、跨域隐式状态和无法回滚的发布路径。迁移完成后，Composition API、Pinia 与 Vite 才能作为持续架构优化，而不是一次高风险升级的附加负担。
