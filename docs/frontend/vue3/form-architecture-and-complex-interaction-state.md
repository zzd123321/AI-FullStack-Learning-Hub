---
title: Vue 3 表单架构与复杂交互状态
description: 从输入草稿出发，逐步建立校验、异步请求、动态字段、无障碍与草稿保存的完整状态模型
outline: deep
---

# Vue 3 表单架构与复杂交互状态

> 适用环境：Vue 3.5+、TypeScript、现代浏览器。本课先讲不依赖表单库的通用模型；以后使用任何表单库，都可以用这套模型判断它在替你管理什么。

上一课用 Router 表达“用户在哪个页面”。进入编辑页之后，我们还要回答：

- 输入到一半的值由谁保存？
- 什么时候显示错误？
- 用户改了什么，能否安全离开？
- 异步校验晚到时，能不能覆盖新值？
- 提交失败后，哪些输入和错误应该留下？

这些问题说明，表单远不只是一个 `reactive()` 对象。

## 先从一次真实输入过程开始

用户创建课程时，可能经历：

```text
页面打开
  ↓
输入标题和 Slug
  ↓
Slug 失焦，开始异步查重
  ↓
继续修改其他字段
  ↓
提交，执行全量校验
  ↓
服务端返回成功 / 字段错误 / 网络错误
```

同一时刻，页面需要记住的不只是字段值：

| 状态 | 它回答的问题 |
| --- | --- |
| `value` | 用户现在输入了什么？ |
| `baseline` | 与哪个版本比较“是否修改”？ |
| `touched` | 用户是否完成过这个字段的交互？ |
| `dirty` | 当前有效内容是否偏离基线？ |
| `errors` | 当前值为什么不能接受？ |
| `pending` | 异步校验或提交是否还在进行？ |
| `result` | 最近一次提交成功还是失败？ |

表单复杂度主要来自这些状态之间的转换，而不是字段数量。一百个互不关联的文本框可能很简单；两个带异步校验和并发保存的字段也可能很复杂。

## 四种数据不要强行共用一个类型

### 浏览器输入值

DOM 中的文本输入天然以字符串工作。数字输入被清空时也是空字符串；用户准备输入 `1.5` 时，还可能短暂出现 `1.` 之类的中间值。

### 表单草稿

草稿必须允许“不完整，但正在合理编辑”的状态：

```ts
interface LessonDraft {
  title: string
  // 输入过程中可以是 ''，通过校验后才转成数字。
  estimatedHours: string
}
```

如果把 `estimatedHours` 一开始就定义成 `number`，代码很快会出现 `NaN`、不安全断言，或者用户清空输入后又被强制填回 0。

### 提交 DTO

只有在草稿校验通过时，才生成提交给接口的数据：

```ts
interface CreateLessonInput {
  title: string
  estimatedMinutes: number
}
```

这里已经没有“输入到一半”的概念，单位也从小时转换成了服务端需要的分钟。

### 服务端实体

服务端返回的实体还可能含有：

- 数据库 ID；
- 创建人和更新时间；
- 并发版本号；
- 当前用户能否编辑；
- 服务端规范化后的值。

它不是可随意修改的草稿。编辑已有实体时，应明确执行 `entity → draft`，提交时再执行 `draft → DTO`。

完整模型把这些边界写进类型和转换函数：

<<< ../../../examples/frontend/vue3-forms/form-model.ts

## `v-model` 到底做了什么

对于文本框：

```vue
<input v-model="model.title" />
```

概念上接近：

```vue
<input
  :value="model.title"
  @input="model.title = ($event.target as HTMLInputElement).value"
/>
```

不同控件使用的属性和事件不同：

- 文本框、`textarea`：`value` 与 `input`；
- checkbox、radio：`checked` 与 `change`；
- `select`：`value` 与 `change`。

Vue 中的 JavaScript 状态是事实来源。模板上写死的初始 `value`、`checked`、`selected` 不会覆盖模型，所以初值应在模型中创建。

### 三个修饰符各自只解决一个小问题

`.trim` 在同步时裁剪首尾空白。它适合 Slug 等明确不保留两端空格的字段，不一定适合密码、正文或对空白敏感的内容。

`.number` 尝试按 `parseFloat()` 语义转换；无法解析时仍可能保留原字符串，空输入尤其会得到 `''`。即使 `input type="number"` 会自动应用 number 行为，运行时值也不能被当作永远是数字。

`.lazy` 把文本同步从 `input` 改到 `change`。它不是防抖器，也不等同于“失焦后才显示错误”。

修饰符改变输入同步规则，却不会替你管理 touched、错误展示、异步校验或提交。

### 中文输入法为什么必须真实测试

中文、日文、韩文输入会经历 composition 阶段。普通 `v-model` 不会把每个尚未确认的组合字符都写入模型，以免把拼字中间态当成最终输入。

因此不要假设：

- 每次键盘事件都对应一个最终字符；
- 自己封装的输入组件只转发 `keydown` 就够了；
- 英文输入正常就代表搜索建议、字符计数也正常。

若产品确实需要读取组合过程，要明确处理 `compositionstart`、`compositionend` 与 `input`，并用真实输入法测试。

## Baseline 决定 dirty 的含义

“改过”不等于“当前和初始值不同”。

用户输入标题后再删回原值：

- 他确实操作过；
- 但当前没有需要保存的有效修改。

因此本课把 dirty 定义成：

```ts
const dirty = computed(
  () => serializeDraft(model) !== baseline.value
)
```

`serializeDraft()` 会先做业务规范化，例如裁剪标题两端空白、把 Slug 转成小写。这样末尾误输入的一个空格可以不算有效修改。

这个定义必须由产品语义决定：

- 标签顺序是否重要？
- `''`、`null` 和“字段缺失”是否等价？
- 富文本中的空段落算不算内容？
- 服务端自动生成字段是否参与比较？

小表单可以规范化后序列化整棵对象。大型表单若每次按键都深度序列化，应改为字段级 dirty、结构化 diff，或由表单库做增量跟踪。

### Reset 不是天然只有一种意思

“重置”可能表示：

1. 创建页回到空白；
2. 编辑页回到首次加载的服务端值；
3. 保存成功后，把当前值设成新基线；
4. 放弃本地草稿，重新加载远端最新版。

实现前必须选定其中一种。示例是创建页，所以 `reset()` 回到新的空白草稿；提交成功则把**本次提交快照**设成新基线。

## touched 和 dirty 不要混用

`touched` 主要决定何时向用户展示反馈，通常在 blur 后设为 true。

`dirty` 主要用于：

- 离开页面提醒；
- 是否需要自动保存草稿；
- 保存按钮或未保存标记；
- 并发更新判断。

两者可以独立：

- 聚焦后什么也没改就离开：touched 为 true，dirty 为 false；
- 浏览器自动填充：可能 dirty 为 true，却还没 blur；
- 修改后又还原：曾经 dirty，现在是 false。

不要用一个 `modified` 布尔值承担所有语义。

## 把同步校验写成纯函数

规则只接收数据并返回错误：

<<< ../../../examples/frontend/vue3-forms/validators.ts

纯规则不应该：

- 弹 Toast；
- 修改别的字段；
- 访问组件实例；
- 发网络请求；
- 决定错误何时出现在屏幕上。

这样同一套规则可以在字段失焦、提交前检查和单元测试中复用。错误的“计算”与“展示时机”是两个不同问题。

### 校验时机需要渐进

页面一打开就把所有空字段标红，会让用户在还没操作前就被告知“做错了”。更友好的常见策略是：

1. 第一次 blur 后显示该字段错误；
2. 一旦错误已经显示，继续输入时及时检查它是否修复；
3. 提交时无条件全量校验，并把有关字段视为 touched。

不同字段可以不同：

- 字符计数适合输入时更新；
- 普通格式适合 blur 后首次显示；
- 跨字段日期区间要在相关任一值变化时重算；
- 最终完整性必须在 submit 再检查。

### 原生校验与自定义校验要选清楚

HTML 已提供 `required`、`minlength`、`pattern`、`min`、`max`、`step` 以及 Constraint Validation API。

简单页面可以直接使用浏览器原生提示。复杂应用也可以在 `form` 上加 `novalidate`，自己统一实现：

- 字段错误；
- 页面错误摘要；
- 焦点移动；
- 服务端错误合并。

示例采用第二种，同时保留 `required`、`min` 等语义属性。

最容易出问题的是“半接管”：浏览器先阻止 submit，应用的提交函数根本没运行，页面却还在等待自己的错误摘要。

无论采用哪一种，客户端校验都只是交互反馈。攻击者可以绕过浏览器，服务端必须重新验证类型、权限、唯一性和业务规则。

## 异步校验为什么是一台状态机

Slug 查重看起来只是一个请求：

```ts
const available = await isSlugAvailable(slug)
```

但用户可以快速输入：

```text
vue        → 请求 A，较慢
vue-form   → 请求 B，较快
B 先返回“可用”
A 后返回“占用”
```

若 A 可以直接写错误，页面会把 `vue-form` 错误地标成不可用。

一个可靠的异步校验至少要处理：

- 同步格式不合法时不请求；
- 新值到来时清理旧请求；
- 取消不显示成网络故障；
- 旧结果不能提交；
- 旧 `finally` 不能关闭新 pending；
- 重置或组件销毁时，未完成请求失去所有权。

### 防抖、取消、序号分别解决什么

它们不是替代关系：

| 机制 | 解决的问题 |
| --- | --- |
| 防抖 | 减少输入过程中发出的请求数量 |
| `AbortController` | 尽量停止已经无用的工作 |
| 请求序号 | 禁止旧请求提交结果 |

本课的 composable 使用取消与序号双保险。Vue 3.5 的 `onWatcherCleanup()` 必须在 watch 回调同步执行期间、也就是第一个 `await` 之前注册：

```ts
const checkId = ++latestSlugCheckId
const controller = new AbortController()

onWatcherCleanup(() => controller.abort())

const available = await isSlugAvailable(slug, controller.signal)

if (checkId !== latestSlugCheckId) return
```

序号表达“谁拥有当前状态”。即便底层任务不能真正取消，旧请求仍没有资格写入。

`finally` 也必须判断：

```ts
if (checkId === latestSlugCheckId) {
  checkingSlug.value = false
}
```

否则 A 比 B 晚结束或更早进入 finally，都可能把 B 的 pending 错误关闭。

## 提交不是“再发一次请求”

提交路径是一条完整事务流程：

```text
清理上次结果
  ↓
全量同步校验
  ↓
创建提交快照
  ↓
最终异步校验
  ↓
Draft 转 DTO
  ↓
发送请求
  ↓
成功更新基线 / 失败保留草稿和映射错误
```

### 为什么提交仍要再次查重

字段刚失焦时显示“Slug 可用”，不代表提交时仍可用。检查与写入之间，其他用户可能先创建相同 Slug。

所以：

- 字段异步校验只提供提前反馈；
- 提交时可以再次检查；
- 真正的唯一性仍必须由服务端数据库约束和写入事务保证。

### 为什么提交要先拍快照

如果请求期间允许继续编辑，直接在 `await` 之后读取响应式 `model`，拿到的可能已经不是用户点击提交时的值。

示例先克隆：

```ts
const submissionDraft = cloneDraft(model)
```

之后：

- 查重、DTO 转换都使用快照；
- 成功后 baseline 指向提交快照；
- 用户请求期间的新修改仍会保持 dirty；
- 服务端字段错误只在当前字段仍等于提交值时写入，避免旧错误描述新输入。

这是“异步结果只能修改它所描述的状态”原则在表单中的应用。

### valid 不等于 canSubmit

同步规则都通过，只能说明 `valid`。是否允许提交还可能取决于：

```ts
const canSubmit =
  valid &&
  !checkingSlug &&
  !submitting &&
  permissions.canCreateLesson
```

不要把 `dirty` 无条件加入所有创建表单的 canSubmit。用户可能通过自动填充或预设值得到有效表单，业务语义要单独判断。

### 防止重复提交不等于幂等

前端用 `submitting` 禁用按钮，可以减少双击，但无法防止：

- 网络超时后的手动重试；
- 浏览器重新发送；
- 多标签页并发；
- 客户端脚本直接调用接口。

重要写操作需要服务端幂等键、唯一约束或业务去重。前端按钮状态只是第一层体验保护。

## 字段错误、表单错误和网络错误要分层

服务层定义了结构化提交错误：

<<< ../../../examples/frontend/vue3-forms/lesson-service.ts

三类错误处理方式不同：

| 错误 | 例子 | 页面行为 |
| --- | --- | --- |
| 字段级 | Slug 已占用 | 映射到对应输入，并进入摘要 |
| 表单级 | 当前状态不允许发布 | 在表单顶部说明 |
| 系统级 | 断网、超时 | 保留全部输入，提供重试 |

不要因为服务端失败就 reset。失败时最有价值的状态正是用户刚输入的内容。

客户端和服务端错误可以共用当前展示位，但必须定义失效规则。例如用户修改了 Slug，旧的“已占用”就不再描述当前值，应清除并重新验证。

大型系统也可以按来源保存：

```ts
interface FieldIssue {
  source: 'client' | 'server'
  message: string
}
```

这样更适合审计、国际化和多条错误；简单表单没必要一开始就引入复杂结构。

## Composable 是表单状态机的所有者

完整实现：

<<< ../../../examples/frontend/vue3-forms/useLessonForm.mts

它集中管理：

- model 与 baseline；
- touched、dirty 和 errors；
- 同步与异步字段校验；
- 动态学习成果；
- 提交快照与服务端错误；
- reset 和作用域销毁时的请求清理。

组件负责把这些状态渲染成界面，不负责重新发明一套业务规则。

### 为什么不是把所有状态放进 Pinia

如果表单只存在于一个页面，组件作用域 composable 更自然：

- 页面销毁时状态和请求一起释放；
- 同时打开两个编辑器不会共享同一份草稿；
- 不需要 Store ID 去区分多个表单实例。

只有草稿确实要跨页面、多区域共享或统一缓存时，才考虑 Pinia。即便使用 Pinia，Draft、DTO、异步所有权这些边界仍然存在。

## 动态字段需要稳定身份

学习成果可以添加、删除和重排。数组下标只代表“现在排第几个”，不代表字段身份。

假设三项的 key 是 `0、1、2`，删除第 1 项后：

```text
删除前：0=A，1=B，2=C
删除后：0=A，1=C
```

Vue 可能把原来 B 的组件实例复用给 C，导致：

- 输入内部状态错位；
- 错误信息挂到另一项；
- 焦点跳动；
- 异步校验结果写错对象。

因此模型为每项创建稳定 ID：

```ts
interface OutcomeDraft {
  id: string
  text: string
}
```

模板用 `:key="outcome.id"`，错误也用 `outcomeById[id]`。删除时同时清理该 ID 的错误元数据。

服务端已有记录 ID 和前端临时 ID 是两个概念。新建项可以有 clientId；保存成功后再记录 serverId，不要在保存过程中突然替换 Vue key。

## 字段组件应该封装关联关系

基础字段组件：

<<< ../../../examples/frontend/vue3-forms/BaseField.vue

它负责重复的展示结构：

- label 与控件 ID；
- hint 和 error 的 ID；
- 组合 `aria-describedby`；
- 根据错误生成 `aria-invalid`；
- 一致的间距与颜色。

它不拥有字段值，也不决定校验规则和请求时机。通过 slot 把 `describedBy` 与 `invalid` 交给真实控件，既减少重复，又不隐藏原生输入能力。

### Label、Hint、Placeholder 分工不同

- label 回答“这个字段是什么”；
- hint 回答“格式、范围或为什么需要”；
- placeholder 只给短暂示例。

placeholder 会在输入后消失，对比度也可能较低，不能代替 label。

### 错误信息要能帮助修复

“格式错误”信息量太低。好的错误应回答：

1. 哪个值不符合要求；
2. 规则是什么；
3. 用户下一步怎么改。

例如“只能使用小写字母、数字和单个连字符”，就比“Slug 无效”更可执行。

## 提交失败后，用户怎样找到错误

完整页面：

<<< ../../../examples/frontend/vue3-forms/LessonForm.vue

字段错误通过 `aria-describedby` 与输入关联，并在真正验证后设置 `aria-invalid="true"`。不要在用户还没尝试输入时，把所有空必填项预先标成无效。

长表单提交失败时只在字段下显示错误，用户可能不知道页面下方还有问题。示例会：

1. 在顶部生成错误摘要；
2. 摘要每一项链接到对应控件；
3. 等 Vue 更新 DOM；
4. 把焦点移动到摘要。

`tabindex="-1"` 让不可自然聚焦的摘要可以被脚本聚焦，又不会进入日常 Tab 顺序。

`role="alert"` 适合需要立即通知的失败；`role="status"` 更适合“正在检查”“保存成功”等非紧急进度。不要把每次按键后的提示都做成 alert，否则读屏软件会被持续打断。

相关控件应使用 `fieldset` 和 `legend` 分组，例如一组单选、地址字段或动态学习成果。视觉上的标题不能自动提供程序化分组语义。

## 本地草稿是缓存，不是真相

用户花很久填写后误关页面，自动保存很有价值。但 localStorage 中的数据可能：

- 来自旧版本；
- 被用户或扩展修改；
- 已经过期；
- 超出配额；
- 在隐私策略下不可用；
- 包含不应落盘的敏感信息。

所以读取草稿也必须经过运行时校验：

<<< ../../../examples/frontend/vue3-forms/draft-storage.ts

示例保存：

- schema 版本；
- 保存时间；
- 深克隆后的 Draft。

读取时：

- 捕获存储和 JSON 错误；
- 验证每个字段类型；
- 拒绝未知版本；
- 拒绝超过 7 天或时间异常的草稿；
- 为损坏的动态数组提供安全回退。

写入和删除返回 boolean，因为 localStorage 操作可能失败。真实产品若承诺“已自动保存”，就必须根据返回值展示成功或失败，不能静默撒谎。

### 自动保存为什么要防抖

每次按键同步写 localStorage 会阻塞主线程，也会制造无意义写入。示例在组件中用 watch + timer：

- 新变化到来时取消旧 timer；
- 用户停顿 500ms 后保存；
- dirty 为 false 时删除草稿；
- 组件卸载时停止 watcher。

对于大型表单，深度 watch 整棵模型会在每次嵌套变化时遍历。应按测量结果改用字段级订阅、显式 mutation、空闲调度或后台序列化。

### 编辑已有实体还要处理版本冲突

本地草稿基于服务端版本 7，但重新打开时服务端已是版本 9，不能直接覆盖。草稿元数据应记录：

```ts
interface StoredEditDraft {
  entityId: string
  baseVersion: number
  savedAt: string
  draft: LessonDraft
}
```

恢复时比较版本，再让用户选择查看差异、保留本地或采用远端。不要悄悄用旧草稿覆盖新数据。

敏感数据、支付信息、密码和令牌通常不应写入 localStorage。草稿策略首先是隐私和产品决策，不只是技术功能。

## 复杂场景如何沿用同一套边界

以下场景看似特殊，实际仍在回答“谁拥有值、何时有效、异步结果属于哪个版本”。

### 多步骤表单

跨步骤共享一份 Draft，但每一步只验证本步需要的数据；最终提交前仍要全量验证。

路由可表达当前步骤：

```text
/courses/new/basic
/courses/new/outcomes
/courses/new/review
```

但完整草稿不应塞进 URL。刷新恢复需要服务端临时记录或经过安全评估的本地草稿。

### 条件字段

字段隐藏后要明确：

- 值保留还是清空？
- 是否仍参与校验和提交？
- 错误何时删除？

隐藏只改变渲染，不会自动改变业务模型。应在 schema 或转换函数里明确规则。

### 跨字段规则

结束时间必须晚于开始时间，这种错误可以归到结束字段或整个分组。关键是错误归属稳定，并观察最小依赖集合，不要每个字段变化都重算整张表。

### 文件上传

文件对象不适合 JSON 草稿。上传通常还需要：

```text
本地 File → 上传进度 → 临时文件 ID → 最终表单提交
```

取消上传、失败重试、大小/MIME 校验、服务端内容扫描、孤儿临时文件清理都应独立建模。

### 富文本和第三方控件

适配组件要明确实现：

- `modelValue` 与 `update:modelValue`；
- focus/blur；
- disabled/readonly；
- label 或可访问名称；
- error 描述关联；
- 组件卸载时的编辑器清理。

富文本还涉及 XSS：客户端预览和服务端存储/输出都必须使用合适的清洗策略。

## Disabled 和 Readonly 不是同义词

- disabled 控件通常不可聚焦，也不会进入原生表单提交；
- readonly 控件仍可聚焦和复制，且通常会提交，但只适用于支持该属性的控件。

“提交中”是否禁用所有字段取决于产品策略。若允许继续编辑，就必须像本课示例一样使用提交快照，并避免旧服务端错误覆盖新值；若完全禁用，交互更简单，但用户无法继续工作。

## 大型表单先找真正的成本

常见成本来源：

- 每次输入深度 watch 整棵对象；
- 每次按键全量 schema 校验；
- 同步序列化并写入存储；
- 大量字段共享一个不断变化的大对象；
- 隐藏步骤仍全部挂载；
- 动态列表使用不稳定 key；
- 重型编辑器和选择器未按需加载。

优化顺序应该是：

1. 用 Vue Devtools 和浏览器 Performance 面板测量；
2. 找到是哪一段计算、渲染或 I/O 变慢；
3. 缩小响应式依赖和更新范围；
4. 再考虑分步挂载、虚拟列表或异步组件。

不要为了“性能”把所有字段拆成几十个互相同步的 ref。边界不清会增加 watcher 和一致性成本。

## 什么时候值得使用表单库

手写 composable 适合：

- 字段较少；
- 交互规则明确；
- 团队需要先掌握原理；
- 不想引入 schema 和适配层成本。

表单库更适合：

- 大量重复表单；
- 动态嵌套数组；
- schema 驱动；
- 统一错误、touched、dirty 与提交协议；
- 团队愿意维护控件适配。

选择时不要只看最短示例，要验证：

- Vue 3 和 TypeScript 类型质量；
- 异步校验取消与竞态语义；
- 服务端字段错误注入；
- 动态字段稳定 ID；
- 无障碍属性能否完整透传；
- SSR 和按需加载；
- 更新频率、包体积和迁移成本。

表单库能管理通用状态，不能替你决定业务校验时机、权限、并发冲突、草稿隐私和错误协议。

## 测试应该沿着边界分层

纯函数测试：

- normalize 是否符合业务语义；
- 空字符串和非法数字能否被拒绝；
- Draft 转 DTO 是否转换单位；
- 动态字段错误是否按 ID 关联。

Composable 测试：

- blur 后才显示首次错误；
- 快速更改 Slug 时旧结果不能覆盖；
- reset 会取消并失效 pending；
- 重复 submit 被阻止；
- 请求期间继续编辑，成功后新修改仍保持 dirty；
- 服务端字段错误只应用于它校验过的值。

组件测试：

- label 与 input 是否关联；
- hint/error ID 是否进入 `aria-describedby`；
- 提交失败后摘要是否出现并获得焦点；
- 摘要链接是否指向真实控件；
- 添加删除动态项后值和错误不串位。

端到端测试：

- 真实键盘与中文 IME；
- 浏览器自动填充；
- 慢网、断网和重试；
- 刷新恢复草稿；
- 多标签页和服务端版本冲突；
- 提交成功后的导航和浏览器后退。

不要只断言“按钮存在”。表单测试的价值在于验证状态转换和用户能否从失败中恢复。

## 阅读完整示例时抓住这条主线

数据模型与转换：

<<< ../../../examples/frontend/vue3-forms/form-model.ts

纯同步规则：

<<< ../../../examples/frontend/vue3-forms/validators.ts

服务层与结构化错误：

<<< ../../../examples/frontend/vue3-forms/lesson-service.ts

状态机 composable：

<<< ../../../examples/frontend/vue3-forms/useLessonForm.mts

字段展示边界：

<<< ../../../examples/frontend/vue3-forms/BaseField.vue

完整页面：

<<< ../../../examples/frontend/vue3-forms/LessonForm.vue

本地草稿：

<<< ../../../examples/frontend/vue3-forms/draft-storage.ts

理解顺序是：

```text
Draft 能表达输入过程
  ↓
纯规则计算错误
  ↓
touched 决定何时展示
  ↓
异步任务用所有权防竞态
  ↓
提交快照转换成 DTO
  ↓
服务端结果只修改它所描述的状态
```

## 常见反模式

### 直接用 DTO 绑定输入

DTO 的数字和必填约束无法表达输入中间态。Draft 与 DTO 分开。

### 页面打开立即显示所有错误

用户还没操作就收到失败反馈。用 touched 和 submit attempt 控制展示。

### 每次输入都全量异步校验

浪费请求且容易竞态。先同步过滤，再按交互策略触发，并管理取消和所有权。

### 服务端失败后清空表单

用户最有价值的数据被丢掉。保留 Draft，映射字段错误并提供重试。

### 动态数组用 index 作 key

删除和重排会复用错误实例。使用稳定 client ID，并按 ID 保存元数据。

### Placeholder 代替 Label

输入后上下文消失，也缺少可靠可访问名称。始终提供真正 label。

### 深度 watch 再双向同步 Props

父子双方互相覆盖，容易循环和丢输入。明确一个所有者，通过事件提交变更或在边界创建一次草稿。

## 本课小结

可靠表单是一台有明确所有权的状态机：

- Draft 允许输入中间态，DTO 只在校验成功后生成；
- baseline 定义 dirty，touched 决定反馈时机，两者不能混用；
- 同步规则保持纯净，客户端校验不替代服务端；
- 防抖减少请求，取消节省资源，序号保证异步结果正确；
- 提交使用快照，服务端错误只能应用到它实际校验过的值；
- 动态字段用稳定 ID，错误、焦点和组件状态才不会错位；
- label、描述、错误摘要、焦点和 live region 共同构成可访问反馈；
- 本地草稿是不可信且可能敏感的缓存，需要版本、校验、过期和失败处理。

下一节是[Vue 3 渲染机制、组件更新与性能优化](/frontend/vue3/rendering-mechanism-component-updates-and-performance)。表单课频繁提到“依赖范围”和“渲染成本”，下一课会从模板编译、虚拟 DOM 和组件更新边界解释这些性能现象为什么发生。

## 官方资料

- [Vue：表单输入绑定](https://vuejs.org/guide/essentials/forms.html)
- [Vue：组件上的 v-model](https://vuejs.org/guide/components/v-model.html)
- [Vue：侦听器与副作用清理](https://vuejs.org/guide/essentials/watchers.html)
- [Vue：无障碍](https://vuejs.org/guide/best-practices/accessibility.html)
- [Vue：性能最佳实践](https://vuejs.org/guide/best-practices/performance.html)
- [MDN：客户端表单校验](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Form_validation)
- [MDN：aria-invalid](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-invalid)
- [W3C WAI：表单校验](https://www.w3.org/WAI/tutorials/forms/validation/)
- [W3C WAI：客户端错误摘要与焦点](https://www.w3.org/WAI/WCAG22/Techniques/client-side-script/SCR32)
