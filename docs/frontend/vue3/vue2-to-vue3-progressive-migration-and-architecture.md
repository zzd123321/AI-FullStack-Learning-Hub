---
title: Vue 2 到 Vue 3 的渐进式迁移与大型应用架构
description: 用兼容构建、契约适配、业务切片和可回滚发布，把大型 Vue 2 应用迁移到原生 Vue 3
---

# Vue 2 到 Vue 3 的渐进式迁移与大型应用架构

> 适合维护过 Vue 2 Options API、Vue Router 3、Vuex 与 Vue CLI/Webpack 项目的开发者。Vue 2 已在 2023 年底结束官方支持；迁移时必须以项目锁文件、依赖矩阵和官方迁移说明为准。

你已经学完 Vue 3 的组件、响应式、Pinia、Router、表单、性能、测试和 SSR。回到一个运行多年的 Vue 2 项目，真正的问题不是“怎样把 data 改成 ref”，而是：

> 怎样在业务继续迭代的同时替换运行平台，并且随时知道改坏了什么、怎样回退？

迁移成功的标志不是代码看起来像 `<script setup>`，而是系统已经运行在受支持的 Vue 3 生态上，关键行为有证据，兼容层可以删除。

## 先把三个目标拆开

大型迁移常把不同目标混成“前端重写”：

1. **运行时迁移**：从 Vue 2 真正切到标准 Vue 3；
2. **生态迁移**：Router、Store、UI 库、测试和构建链进入受支持版本；
3. **架构改进**：清理 Mixins、事件总线、隐式全局和巨型组件。

前两个通常是必要工作，第三个要按收益安排。

若同时替换框架、Router、Vuex、HTTP Client、UI 库、目录、TypeScript 和全部组件写法，一次回归会有八种可能原因。长迁移分支还会持续与业务代码冲突。

更稳的路线是：

```text
建立可比较基线
  ↓
清理最危险的旧边界
  ↓
让旧业务先跑在 Vue 3 / compat
  ↓
按业务切片迁移契约
  ↓
每片独立验证、灰度、回滚
  ↓
清零 compat 与旧依赖
  ↓
再做有收益的架构优化
```

## 完成定义要在动代码前写清楚

“首页能打开”远远不够。迁移完成至少应满足：

- 标准 Vue 3 构建，不再把 `vue` alias 到 `@vue/compat`；
- 生产依赖没有 Vue 2 副本和只支持 Vue 2 的插件；
- compat 警告和 Vue runtime 警告为零；
- 深层路由、权限、表单、异常和回退路径已验证；
- 关键性能、错误率和业务指标不劣于基线；
- 监控能区分旧实现和新实现；
- 回滚流程真正演练过。

这份定义会影响每个阶段的证据和退出条件。如果最后才讨论“怎样算完成”，compat 很容易永久留在生产。

## 第一步不是升级依赖，而是建立事实

### 运行环境和产品约束

先回答：

- 是否仍要求 IE11？Vue 3 不支持 IE11；
- 是否有 SSR、微前端、多入口、WebView 或浏览器扩展；
- 哪些流程涉及收入、权限和不可逆写操作；
- 能否按用户、租户、路由或发布版本灰度；
- 可接受的回滚时间是多少；
- 当前 Node、包管理器、构建环境和浏览器范围是什么。

这些答案可能直接决定能否原地升级。

### 用搜索找到高风险语法

```text
new Vue(
Vue.use / Vue.component / Vue.mixin / Vue.prototype
$on / $off / $once / $children / $listeners / $scopedSlots
.native / .sync / filters / functional
beforeDestroy / destroyed
Vue.set / this.$set / Vue.delete / this.$delete
watch 数组原地修改
render( / h(
```

搜索只能找到显式语法。第三方库还可能依赖 Vue 2 VNode 私有字段、旧 Slot 形状或特定 DOM 时序。必须运行真实页面，记录 compat 警告、组件堆栈和来源。

### 建立依赖矩阵

每个运行时依赖至少记录：

| 字段 | 要回答的问题 |
| --- | --- |
| Vue 3 支持 | 官方支持哪个版本，迁移说明是什么 |
| 维护状态 | 是否仍维护，安全公告和浏览器策略如何 |
| 使用范围 | 全局初始化还是只在两个页面 |
| 私有依赖 | 是否读取 VNode、`_` 字段或旧 Slot |
| DOM/CSS 契约 | 升级后结构、class、Teleport 是否变化 |
| 替代方案 | 停更时能否替换或包一层适配器 |
| 阻塞等级 | 无法启动、局部异常还是仅警告 |

不要只看 peerDependencies。组件库即使“支持 Vue 3”，主题、表单校验、日期时区和自动导入插件也可能有行为差异。

### 保存迁移前基线

至少记录：

- 锁文件、Node 版本、构建命令和环境变量；
- 当前测试通过率与已知 flaky；
- 路由、重定向、权限、滚动；
- 关键页面截图和可访问性树；
- Bundle、构建时长、LCP、INP、JS 错误率；
- 登录、搜索、创建、支付等业务指标。

没有基线，就无法区分旧问题和迁移回归，也无法证明新版本可以扩大流量。

## 选择路径：不是所有项目都适合同一种迁移法

### 直接切标准 Vue 3

适合依赖少、规模小、测试充分的项目。优点是没有 compat 债务；代价是一次修改范围更大。

### 使用 `@vue/compat`

Migration Build 本质上是 Vue 3，但能模拟一部分 Vue 2 公共行为，并为已变化特性发出警告。

典型节奏：

1. 升级到兼容的 Vue、compiler-sfc、loader/plugin 组合；
2. 将 `vue` alias 到同版本 `@vue/compat`；
3. MODE 2 让大部分旧行为先运行；
4. 修启动错误和高频警告；
5. 对已迁移组件启用 MODE 3，或逐项关闭 compat；
6. 警告和旧依赖清零后删除 alias。

Compat 不是完整 Vue 2 模拟器。依赖内部 VNode、IE11、旧 SSR 或特殊私有 API 的项目可能不适用。

每个临时 compat flag 都应有：

- 对应代码范围；
- 负责人；
- 为什么暂时保留；
- 行为验证；
- 删除条件和日期。

关闭 warning 只会移除观察能力，不会完成迁移。

### Vue 2.7 作为短期桥梁

Vue 2.7 内置 Composition API 和部分现代 SFC 能力，可以先提取 Composable、改善 TypeScript 和更新可双栈语法。

但它仍是 Vue 2 响应式运行时，且 Vue 2 已 EOL。它只能降低后续改动量，不能成为新的长期目标。

### 新旧应用并行

关键依赖不能共存、页面天然分区或团队需要独立发布时，可以让 Vue 2 与 Vue 3 成为两个入口，由网关按路由分发。

必须明确共享协议：

- 登录与会话；
- 顶层导航；
- 设计 Token；
- 埋点与 request ID；
- 跨应用跳转；
- 错误和版本标识。

两个 Vue runtime 不能同时管理同一 DOM 子树。微前端还会增加包体、全局 CSS、路由和运维成本，只有组织与发布独立性真正有价值时才采用。

## 推荐按可部署阶段推进

| 阶段 | 主要产出 | 退出证据 |
| --- | --- | --- |
| 基线 | 测试、监控、依赖矩阵 | 能复现和度量旧版本 |
| 前置清理 | 去私有 API、统一服务边界 | Vue 2 下行为不变 |
| 工具链 | 受支持 Node、编译和测试 | CI 可重复构建 |
| Compat 启动 | Vue 3 runtime + 警告台账 | 核心页面可运行 |
| 生态升级 | Router、UI、Store 策略 | 导航和状态有集成证据 |
| 业务切片 | 每个领域进入原生语义 | 可独立灰度回滚 |
| 去 Compat | 标准 Vue 3 | 所有台账项已验证 |
| 后续优化 | Pinia、Vite、Composition | 由收益而非迁移阻塞驱动 |

工具链换 Vite 与运行时升级也可以拆开。旧 Webpack 极复杂时，先在原工具链切运行时可能变量更少；也可以先让 Vue 2 运行在 Vite。选择“更容易验证和回滚”的顺序，不要把工具偏好当作唯一答案。

## 应用全局从构造器变成实例边界

Vue 2 的：

```ts
Vue.use(plugin)
Vue.mixin(mixin)
Vue.component('BaseButton', BaseButton)
Vue.prototype.$api = api
```

修改共享 Vue 构造器，容易污染测试和同页面其他根实例。

Vue 3 把这些配置放在 `createApp()` 返回的实例上：

<<< ../../../examples/frontend/vue2-to-vue3-migration/main.mts

这不是单纯 API 改名，而是隔离模型改变：

- 每个 app 安装自己的插件、组件和指令；
- 测试可以创建独立 app；
- 微前端根实例不必共享所有配置；
- SSR 可以每请求创建 app。

不要机械地把所有 `Vue.prototype.$api` 改成 `app.config.globalProperties.$api`。它仍是隐式全局。业务服务优先显式 import，或通过带类型的 provide/inject 从应用边界提供。

示例 Router 也改成工厂：

<<< ../../../examples/frontend/vue2-to-vue3-migration/router.mts

普通 SPA 可以只创建一次；测试、SSR 或多入口则能获得独立实例。

## Options API 不需要在迁移中消失

Vue 3 继续支持 Options API。下面的组件已经满足 Vue 3 语义，却仍保留熟悉结构：

<<< ../../../examples/frontend/vue2-to-vue3-migration/LegacyLessonSearch.vue

它只修改迁移必需项：

- 声明 emits；
- `beforeDestroy` 改为 `beforeUnmount`；
- 请求取消和竞态有明确所有权；
- 依赖通过 typed Prop 输入。

把“能在标准 Vue 3 正确运行”和“重构成 Composition API”分成两个提交，审查者才能判断行为变化来自哪里。

适合进一步重构的信号：

- 一个业务关注点散落在 data、computed、watch、methods 和生命周期；
- 多个组件依赖相同 Mixin，字段来源和冲突不清；
- `this` 让类型推断困难；
- 同一状态机需要独立测试和复用。

小而稳定的 Options 组件没有强制改写价值。

## 从 Mixin 提取业务能力，而不是翻译语法

先画出 Mixin 的：

```text
输入 → 状态 → 派生值 → 异步副作用 → 清理 → 对外操作
```

再按一个完整能力提取：

<<< ../../../examples/frontend/vue2-to-vue3-migration/useLessonSearch.mts

它显式接收 keyword 和 Gateway，并管理：

- 立即搜索；
- 新请求取消旧请求；
- 旧结果所有权；
- error/loading；
- Scope 销毁时停止 watch、取消请求并失效旧结果。

页面只负责展示契约：

<<< ../../../examples/frontend/vue2-to-vue3-migration/LessonSearch.vue

不要创建一个包含原 Mixin 所有字段的 `useLegacyPage()`。那只是把隐式耦合换了语法。按搜索、权限、草稿、遥测等能力拆分。

## 先建立与 Vue 无关的服务契约

新旧组件共享：

<<< ../../../examples/frontend/vue2-to-vue3-migration/contracts.ts

HTTP Gateway：

<<< ../../../examples/frontend/vue2-to-vue3-migration/lesson-gateway.ts

组件不再依赖 `this.$http`，也不到处拼 URL。Gateway 负责：

- query 和 Header；
- AbortSignal；
- HTTP 状态；
- 把响应 unknown 校验成领域类型。

旧 Options 组件和新 Composition 组件可调用同一接口。这样迁移组件时不同时改后端协议，契约测试也能对两种实现复用。

TypeScript `as LessonSearchResult` 不能证明旧 API 真返回该结构。迁移期间后端版本、代理和 Mock 更容易不一致，运行时校验尤其重要。

## 组件契约变化要在边界适配

### `v-model` 和 `.sync`

Vue 2 默认：

```text
value + input
```

Vue 3 默认：

```text
modelValue + update:modelValue
```

Vue 3 原生组件：

<<< ../../../examples/frontend/vue2-to-vue3-migration/BaseToggle.vue

若几十个旧调用方仍使用 value/input，先加薄适配器：

<<< ../../../examples/frontend/vue2-to-vue3-migration/LegacyToggleAdapter.vue

适配器的价值是把同时修改的范围变小：

```text
旧调用方 → 旧契约适配器 → 唯一 Vue 3 核心契约
```

调用方逐批切换，数量归零后删除适配器。不要让核心组件永久同时支持两套 Prop/Event，否则会出现双写和优先级问题。

`.sync` 改为带参数 `v-model:visible`；Vue 3 也允许多个 v-model。迁移要核对事件名和修饰符行为，不只是模板能编译。

### Emits、Attrs 和原生监听器

Vue 3 移除了实例 `$on/$off/$once`；父子通信使用 Props/Emits，跨层依赖用 provide/inject，共享业务状态用 Store。

确实与 Vue 无关的短生命周期事件可以用类型化 emitter：

<<< ../../../examples/frontend/vue2-to-vue3-migration/typed-emitter.ts

订阅必须返回取消函数，并在作用域销毁时调用。不要重新创建一个无边界的全局事件总线。

`$listeners` 合并进 `$attrs`，class/style 也进入 attrs；组件声明了 emits 后，相应监听器不会作为普通 attrs 透传。若忘记声明 emits，父级监听可能既被组件 emit 触发，又作为原生监听落到根元素，造成双触发。

多根组件没有自动 Attr fallthrough 目标，必须显式 `v-bind="$attrs"` 到正确元素。

## 模板差异要靠行为测试发现

高风险变化包括：

- filter 移除；
- `.native` 移除；
- `.sync` 变化；
- key 和 template v-for 语义；
- Transition/TransitionGroup 根结构；
- Slot API 统一为函数；
- 自定义指令钩子更名；
- 多根 Fragment 改变 attrs 与 CSS 选择器假设。

类型检查无法证明点击只触发一次、Slot 放在正确位置或 Transition 时序没变。每修一类语义，都应有最小组件测试和关键页面 E2E。

模板 filter 应改成方法或 computed，而不是注册另一个全局管道。格式化逻辑进入普通 TypeScript 后更容易测试、tree-shake 和服务端复用。

## 响应式升级改变了限制，也改变了观察语义

Vue 2 基于 Object.defineProperty：

- 新增对象属性需要 `Vue.set/this.$set`；
- 删除需要 `Vue.delete`；
- 数组索引和 length 有特殊限制。

Vue 3 Proxy 能观察新增、删除和索引更新，因此这些辅助 API 被移除。

但迁移不只是删掉 `$set`：

- 持有原始对象与代理对象的身份比较要复核；
- 第三方对象可能更适合 shallowRef/markRaw；
- 解构 reactive 属性会失去响应连接；
- 依赖 Vue 2 Watch 时序的代码需要测试。

### 数组 watch 是常见回归

Vue 3 默认 watch 数组只在数组被替换时触发，不因 push/splice 自动回调；需要观察变更时要按当前版本使用合适 deep 选项。

不要机械给所有数组 watch 加 deep。先问它真正想观察：

- 数组引用变化；
- 项目增删；
- 项目内部任意深层属性；
- 某个可声明的派生值。

最后一种通常更适合 computed 或精确 getter。深度 watch 巨大结构会增加成本，也让副作用来源难懂。

## 生命周期迁移要检查资源所有权

常见改名：

- `beforeDestroy → beforeUnmount`；
- `destroyed → unmounted`。

名称替换以后还要检查：

- timer 和事件监听是否真的清理；
- KeepAlive 使用 activated/deactivated 还是 unmounted；
- 异步结果在销毁后是否失效；
- 浏览器专用副作用是否在 mounted；
- 指令的 bind/inserted/update/componentUpdated/unbind 如何映射。

迁移是修正旧泄漏的机会，但应单独提交并保留行为证据。

## Router 3 → Vue 3 Router 要验证导航行为

核心变化：

- `new VueRouter` → `createRouter`；
- `mode` → 显式 History 工厂；
- base 传给 History；
- `currentRoute` 变成 ref；
- catch-all 语法变化；
- 初始导航与所有导航异步；
- push/replace 使用 Promise；
- RouterView Slot 和 Transition 组合变化。

示例：

<<< ../../../examples/frontend/vue2-to-vue3-migration/router.mts

迁移后至少验证：

- 深链接直接刷新；
- params/query 编码；
- 重定向和 404；
- 登录与权限守卫；
- back/forward 和滚动恢复；
- 重复导航和失败；
- 动态 import；
- initial navigation 是否需要 `router.isReady()`。

当前 Vue Router 文档也包含 v5 过渡版本；不使用文件路由的 v4 项目升级 v5通常无代码破坏。迁移项目仍应按锁定目标版本阅读相应指南，不要把“Vue 3”理解成一个永远固定的 Router 版本号。

## Vuex → Pinia 可以与运行时迁移解耦

Vuex 4 可运行在 Vue 3，所以不必在切 runtime 同时重写所有 Store。可选顺序：

1. 先保留 Vuex，稳定 Vue 3 runtime；
2. Vuex 与 Pinia 并存；
3. 按业务 Module 迁成独立 Pinia Store；
4. 调用方迁完后删除旧 Module。

Pinia 官方迁移指南明确支持并存。

新 Store：

<<< ../../../examples/frontend/vue2-to-vue3-migration/lesson-store.mts

不要让 Vuex 和 Pinia 双向同步同一状态。它会制造两个事实来源和循环更新。迁移一个领域时，应明确所有权切换点，并通过适配读取旧 Store 或新 Store，而不是双方互相复制。

Module 到 Store 也不是逐行改名：

- 每个 namespaced Module 通常成为独立 Store；
- mutations 变成 Action 或直接赋值；
- rootState 依赖改成显式 Store 组合；
- 插件持久化和订阅语义要复核；
- Option Store 与 Setup Store 的 reset 行为不同；
- Store 外使用要绑定正确 Pinia 实例。

## 用业务切片，而不是按文件类型迁移

不推荐：

```text
本周改完所有 Button
下周改完所有 Store
再下周统一改所有页面
```

更好的切片是一个可交付用户能力：

```text
课程搜索
├── 路由入口
├── 搜索组件
├── Gateway
├── 选择状态
├── 测试与指标
└── Feature Flag / 回滚
```

示例页面让新旧搜索实现保持同一 Props/Events 契约：

<<< ../../../examples/frontend/vue2-to-vue3-migration/MigrationPage.vue

同一调用方可以在 flag 下切换实现。这个 Flag 必须由可靠配置与发布系统管理，示例常量只用于展示边界。

切片完成时要能独立回答：

- 功能是否等价；
- 数据是否同一份；
- 指标是否能区分实现；
- 出错能否只回退这一片；
- 旧代码何时删除。

## 兼容警告必须进入迁移台账

<<< ../../../examples/frontend/vue2-to-vue3-migration/migration-ledger.ts

每项记录：

- area 和具体 ID；
- owner；
- blocked / compat / native-vue3 / verified；
- rollback flag；
- 验证证据。

`native-vue3` 只表示代码已经改成原生语义，不代表行为已证明。只有所有项都是 `verified`，台账才允许移除 compat。

这一区分非常重要：

```text
代码已改 ≠ 页面能运行 ≠ 行为等价 ≠ 可以扩大流量
```

## 组件库是迁移放大器

升级组件库要验证：

- v-model 和 change/input payload；
- 表单校验触发时机；
- Dialog/Dropdown 的 Teleport 位置；
- DOM 与 class 变化；
- 日期、Locale 和时区；
- Tree shaking 和按需导入；
- SSR/Hydration；
- 无障碍角色和键盘行为。

若旧组件库停更，可先在业务与组件库之间建立应用级 Adapter。业务只依赖稳定内部契约，底层实现逐步替换。

不要在同一迁移提交中顺便重做视觉系统。除非旧库完全阻塞 Vue 3，否则把视觉改版独立发布，回归原因更清楚。

## TypeScript 迁移不能用 any 吞掉差异

高价值类型边界：

- Props 与 Emits；
- Route params/query 转换；
- Store state/actions；
- provide/inject key；
- API unknown 响应验证；
- Feature Flags；
- 错误类型。

短期适配器确实可能需要断言，但每个断言应局部、有原因、有删除条件。把 `this`、Route、Store 全部转成 any，会让编译器失去发现破坏性变化的能力。

类型正确仍不等于运行正确。Attrs 透传、DOM 结构、Watch 时序和 Hydration 需要运行时测试。

## 测试迁移的是“行为等价”

### 契约测试

旧 Gateway 和新 Gateway 跑同一套：

- query 规范化；
- 分页；
- 404/500；
- 畸形响应；
- AbortSignal；
- 错误转换。

### 组件测试

旧搜索和新搜索跑同一行为：

- 初始搜索；
- 输入后请求；
- loading/error/empty；
- 快速输入旧结果不覆盖；
- select payload 一致；
- unmount 后清理。

### Router 集成

用真实 Router 验证路径、Props、守卫、重定向、404 和滚动。

### E2E 与视觉/性能

关键用户旅程在真实浏览器验证。组件库升级补充视觉回归和无障碍；迁移前后比较 Bundle、LCP/INP、错误率和 API 重复请求。

不要主要测试“这个组件使用 Composition API”或“调用了某个新方法”。用户不关心代码形状。

## 灰度、监控和回滚是实现的一部分

每个切片应能被区分：

- build version；
- migration cohort；
- feature flag；
- route/domain；
- Vue 2/compat/native Vue 3 实现。

关注：

- JS 错误和未处理 Promise；
- Router 失败；
- API 错误、超时、重复提交；
- 核心转化；
- LCP/INP 和内存；
- compat warning 数量。

推荐逐步：

```text
内部用户 → 小比例真实流量 → 扩大租户/路由 → 全量
```

回滚不能依赖“再发一个修复版本”。Feature Flag、旧静态资源和 API 兼容窗口要事先准备。若新旧前端共用后端，数据库和接口变化要向前、向后兼容。

Flag 也有生命周期：迁移稳定后删除旧分支和 Flag，否则代码会永久承担双实现成本。

## 删除 compat 的 Gate

只有以下证据齐全才删除：

- compat 警告为零；
- 台账全部 verified；
- 没有组件级 MODE 2 和临时 flag；
- 依赖树无 Vue 2 与仅 Vue 2 插件；
- 标准 Vue 3 构建、类型检查和测试通过；
- 关键 E2E 与深链接通过；
- 错误、性能和业务指标达到基线；
- 生产灰度稳定；
- 回滚演练完成。

删除 alias 后重新安装依赖并检查产物，避免 lockfile 或预构建缓存仍带旧 runtime。

## 阅读完整示例的顺序

稳定领域契约：

<<< ../../../examples/frontend/vue2-to-vue3-migration/contracts.ts

<<< ../../../examples/frontend/vue2-to-vue3-migration/lesson-gateway.ts

旧、新实现共享行为：

<<< ../../../examples/frontend/vue2-to-vue3-migration/LegacyLessonSearch.vue

<<< ../../../examples/frontend/vue2-to-vue3-migration/useLessonSearch.mts

<<< ../../../examples/frontend/vue2-to-vue3-migration/LessonSearch.vue

组件契约适配：

<<< ../../../examples/frontend/vue2-to-vue3-migration/BaseToggle.vue

<<< ../../../examples/frontend/vue2-to-vue3-migration/LegacyToggleAdapter.vue

运行边界：

<<< ../../../examples/frontend/vue2-to-vue3-migration/main.mts

<<< ../../../examples/frontend/vue2-to-vue3-migration/router.mts

<<< ../../../examples/frontend/vue2-to-vue3-migration/lesson-store.mts

切片与台账：

<<< ../../../examples/frontend/vue2-to-vue3-migration/MigrationPage.vue

<<< ../../../examples/frontend/vue2-to-vue3-migration/migration-runtime.mts

<<< ../../../examples/frontend/vue2-to-vue3-migration/migration-ledger.ts

## 常见失败方式

### 先把所有文件改成 script setup

变化范围巨大，却没有先证明 runtime 和生态兼容。先修必要语义。

### 关闭所有 compat warning

失去迁移雷达，旧行为仍在。警告进入有 owner 的台账。

### Vuex 与 Pinia 双向同步

形成两个事实来源。按领域一次转移所有权。

### 新旧契约同时扩散

核心组件永久支持两套输入，复杂度倍增。旧契约限制在薄 Adapter。

### 只测 Happy Path

最容易漏的是取消、错误、权限、深链接、返回导航和重复提交。

### Compat 永久生产化

依赖和 warning 越积越多，最终没人敢删除。开始时就定义退出 Gate。

### 迁移分支长期脱离主线

业务改动持续冲突，最后只能巨型合并。每个阶段保持可部署并小批合入。

## 本课小结

- 运行时、生态和架构优化是三个目标，不要一次绑成重写；
- 迁移前先建立依赖矩阵、行为基线和完成定义；
- 直接升级、compat、Vue 2.7 桥梁和并行应用适合不同约束；
- Vue 3 App 实例边界替代 Vue 2 共享构造器，全局依赖应逐步显式化；
- Options API 可以继续使用，Composition API 重构应由业务聚合和复用收益驱动；
- 新旧组件通过服务契约和薄 Adapter 共存，不让双契约进入核心；
- Router 与响应式升级要验证行为，不能只改 API 名；
- Vuex 和 Pinia可以按业务域并存，但同一状态只能有一个所有者；
- Feature Flag、监控、台账和回滚属于迁移实现；
- native-vue3 不等于 verified，只有证据齐全才删除 compat。

至此 Vue 3 模块完成。下一阶段进入[React 核心心智模型与 TypeScript 组件设计](/frontend/react/core-mental-model-and-typescript-components)，会对照 Vue 已经建立的响应式、组件所有权、路由、表单、性能和测试模型，学习 React 的不同取舍。

## 官方资料

- [Vue 3 Migration Guide：Migration Build](https://v3-migration.vuejs.org/migration-build.html)
- [Vue 3 Migration Guide：Breaking Changes](https://v3-migration.vuejs.org/breaking-changes/)
- [Vue：Options API FAQ](https://vuejs.org/guide/extras/composition-api-faq.html)
- [Vue Router：从 Vue Router 3 迁移](https://router.vuejs.org/guide/migration/)
- [Pinia：从 Vuex ≤4 迁移](https://pinia.vuejs.org/cookbook/migration-vuex.html)
- [Vue 2 EOL](https://v2.vuejs.org/eol/)
