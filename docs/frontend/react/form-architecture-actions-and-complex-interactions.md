---
title: 表单架构、Actions 与复杂交互状态
description: 系统掌握 React 受控与非受控表单、FormData、React 19 Actions、异步校验、乐观更新、文件上传、可访问性与安全边界
---

# 表单架构、Actions 与复杂交互状态

> 资料基线：React 19.2。React 19 的 Client Action 可直接用于浏览器应用；Server Function、Server Action 的编译、传输和部署能力依赖支持它们的框架，不能把普通 Vite SPA 中的函数误认为服务端代码。

## 1. 学习目标

完成本节后，你应该能够：

- 根据交互需求选择受控、非受控或混合表单。
- 理解 `value`、`defaultValue`、`checked` 与 `defaultChecked` 的所有权差异。
- 正确解析 `FormData` 中的文本、复选框、重复字段和文件。
- 区分浏览器原生表单、React Client Action、Server Function 与 Router Action。
- 用 `useActionState` 表达提交结果、字段错误和 Pending 状态。
- 在正确的组件层级使用 `useFormStatus`。
- 处理 Action 完成后的非受控表单重置。
- 取消过期异步校验，避免晚到响应覆盖新结果。
- 用 `useOptimistic` 建立可回滚的乐观界面。
- 设计重复提交、幂等、文件上传、鉴权和 CSRF 边界。
- 建立能被辅助技术理解的错误提示与焦点流程。

## 2. 表单首先是数据协议

复杂表单并不是“一堆 Input 加一个 Submit”。它至少横跨五层：

```text
DOM 控件
  ↓ name / value / successful controls
FormData 编码
  ↓ parse + normalize
领域校验
  ↓ authenticated command
服务端写入
  ↓ field/form/transport result
UI 反馈与焦点恢复
```

如果组件同时承担所有层，常见结果是：字段值、Touched、错误、Pending、接口响应、Toast 和重试逻辑混在一个对象里。更稳健的分层是：

- DOM 负责输入和原生交互。
- Form Contract 负责把不可信输入解析为领域值。
- Action 负责一次提交的状态转换。
- Service 负责 HTTP 协议。
- 组件只负责渲染、即时交互与可访问性。

示例领域类型：

<<< ../../../examples/frontend/react-form-architecture/types.ts

`LessonDraft` 允许 `level` 暂时是任意字符串，因为表单输入尚未通过校验；`LessonValues` 则只允许三个领域值。不要为了省一个类型，假装未经校验的字符串已经是合法联合类型。

## 3. 受控与非受控不是风格之争

### 3.1 受控控件

传入 `value` 或 `checked` 后，React State 是当前值的唯一来源。每次用户输入都必须同步调用 `onChange` 更新 State，否则控件看起来不可编辑。

<<< ../../../examples/frontend/react-form-architecture/ControlledProfileForm.tsx

受控模式适合：

- 输入立即驱动预览、价格计算或其他组件。
- 一个字段改变后要同步重置/限制另一个字段。
- 需要明确保存草稿、撤销或状态机。
- 值不是简单 DOM 字符串，例如结构化编辑器。

代价是每次输入都会触发拥有 State 的组件重新渲染。通常这并不可怕；真正的问题是把巨大页面和所有字段绑在同一个高层 State 上。先缩小状态所有者和组件边界，再考虑 Memo。

### 3.2 非受控控件

传入 `defaultValue` 或 `defaultChecked` 只设置初始值，此后当前值由 DOM 持有；提交时用 FormData 读取。它适合提交时才消费、字段间没有高频联动的普通表单。

关键区别：

| 意图 | 文本/选择 | 复选框 |
| --- | --- | --- |
| React 持续控制 | `value` | `checked` |
| 只提供初值 | `defaultValue` | `defaultChecked` |

控件生命周期中不要在受控与非受控之间切换。受控文本值从第一帧就应是字符串，例如 `value={name ?? ''}`；不能先传 `undefined`，加载后再传字符串。

### 3.3 混合模式

一个表单可以让普通字段保持非受控，只把强联动字段、富文本或即时预览字段做成受控。模式选择以字段为单位，不必全表统一。

但同一个控件只能有一个当前值所有者。不要同时传 `value` 和 `defaultValue`，也不要一边让表单库注册 DOM，一边又用本地 State 强行覆盖。

## 4. FormData 的真实语义

`new FormData(form)` 或函数 Action 的参数不是组件 State 快照，而是浏览器按 HTML “成功控件”规则构造的数据集：

- 只有带 `name` 的控件才会提交，`id` 不参与编码。
- Disabled 控件及 Disabled Fieldset 内控件通常不会提交；只读文本控件会提交。
- 未勾选 Checkbox 不产生条目，勾选但未写 `value` 时通常得到 `"on"`。
- 同名 Checkbox、`select[multiple]` 会产生重复 Key，要用 `getAll()`。
- 被点击的 Submit Button 可贡献自己的 `name=value`，可用于“保存草稿/发布”多意图提交。
- 文件字段产生 `File`，所以 `get()` 的值可能不是字符串。
- FormData 保留字符串与 Blob/File，不会自动得到 Number、Boolean 或业务联合类型。

本课把解析、修剪和校验放进纯 Contract：

<<< ../../../examples/frontend/react-form-architecture/form-contract.ts

这里的类型收窄发生在运行时检查之后。`as LessonValues` 本身不会验证浏览器输入；直接断言只是隐藏风险。

## 5. 三条提交流程

### 5.1 传统 `onSubmit`

```tsx
function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault()
  const formData = new FormData(event.currentTarget)
  // parse → request → update state
}
```

它适用于所有现代 React 版本，控制流明确，也便于接入现有请求库。注意异步代码开始前保存 `event.currentTarget` 或立即构造 FormData，不要在异步边界后依赖事件对象。

### 5.2 React 函数 Action

React 19 允许给 `<form action={fn}>` 传函数。React 会把 FormData 交给函数，并把这次更新纳入 Transition。无论 JSX 上写了什么 Method，函数 Action 都以 POST 语义处理。

普通 Vite 客户端项目中的 `fn` 仍运行在浏览器。它可以调用 Fetch，但源码和秘密都在客户端，不能访问私有数据库凭据。

### 5.3 Server Function 与 Router Action

Server Function 是框架识别并部署到服务端的函数，常用 `'use server'` 标记。它可以结合表单实现无 JavaScript 提交/渐进增强，但具体能力取决于框架。

React Router Action 则属于匹配 Route 的数据写边界，提交完成后还会协调 Loader Revalidation、导航和 Route Error Boundary。上一课的 Router Action 和本课的 React Form Action 名字相似，但所有权不同：

| 机制 | 所有者 | 自动协调 |
| --- | --- | --- |
| `onSubmit` | 组件 | 无，全部手动 |
| React `<form action={fn}>` | Form/React | Transition、Pending、表单重置 |
| Framework Server Function | 框架服务端运行时 | RPC/渐进增强等，依框架而定 |
| React Router Action | Route | 导航、Loader 重新验证、Route Error |

不要在同一写操作上叠加两套 Action 生命周期。

## 6. `useActionState`：把上次结果带入下次提交

`useActionState(action, initialState)` 返回：

```ts
const [state, action, isPending] = useActionState(actionFn, initialState)
```

包装后的 Action 会比原函数多一个首参数 `previousState`：

```ts
async function actionFn(previousState: State, formData: FormData): Promise<State>
```

这会改变参数位置。把原来只接收 FormData 的函数直接套上去，常会把 State 误当成 FormData。

本课 Action 先做领域校验，再调用 Service，并把可预期结果转换为 State：

<<< ../../../examples/frontend/react-form-architecture/lesson-action.ts

HTTP 协议集中在 Service：

<<< ../../../examples/frontend/react-form-architecture/lesson-service.ts

这里有三个重要边界：

1. 字段错误是可恢复的领域结果，返回 State，而不是抛异常。
2. 未知异常不会把原始 Error、Stack 或服务端实现细节显示给用户。
3. 幂等 Key 由可信状态拥有，而不是相信隐藏字段传回的值。

隐藏字段仍是客户端输入。用户可以修改 `lessonId`、`role`、价格或幂等 Key；服务端必须重新验证身份、资源权限与命令字段。

## 7. 完整 Action 表单

<<< ../../../examples/frontend/react-form-architecture/LessonActionForm.tsx

表单主要使用非受控字段，因此不需要为每个按键维护 React State。浏览器的 `required`、`minLength` 和类型约束提供第一层即时反馈，Contract 和服务端仍然执行权威校验。

### Action 成功后的重置

函数 Action 正常完成后，React 会重置表单中的非受控控件。这里的“正常完成”是 JavaScript 调用正常 Resolve，不等于业务一定成功。因此校验失败或网络失败时，State 必须带回已提交值。本例递增 `revision`，用 Form 的 `key` 明确重建控件，再通过 `defaultValue/defaultChecked` 恢复快照；行为不依赖 DOM Reset 与 React 提交更新的先后细节。

真正保存成功时返回 `values: null` 和新的幂等 Key，表单才回到空状态。若产品要求成功后也保留内容，可改用受控字段，或把成功值继续作为默认值。

### 不要重复保存两份当前值

错误 State 中的 `values` 是“最近一次提交的快照”，不是每个按键的实时副本。DOM 仍拥有用户正在输入的值。这与受控表单双写每次输入不同。

### 多种提交意图

可用按钮自己的值表达意图：

```tsx
<button name="intent" value="draft">保存草稿</button>
<button name="intent" value="publish">发布</button>
```

Action 中解析 `formData.get('intent')`，然后分别做授权和校验。不要从按钮文本推断业务命令。单个按钮也可用 `formAction` 覆盖 Form 的 Action，但过多分支会使生命周期难以追踪。

## 8. Pending 状态与 `useFormStatus`

`useFormStatus()` 读取最近父级 Form 的提交状态：

<<< ../../../examples/frontend/react-form-architecture/SubmitButton.tsx

它必须在 Form 的后代组件中调用。若在渲染 `<form>` 的同一组件顶部调用，它看不到自己即将返回的 Form，因为 Hook 只读取祖先上下文。

`pending` 的正确用途包括：

- 修改按钮文案，给出即时反馈。
- 防止用户在同一个操作完成前连续点击。
- 设置 `aria-busy`，但保留页面的可读内容。

Disabled 只是 UX 防护，不是并发正确性。用户可能重发网络请求、打开多个标签页，代理也可能重试；服务端仍需事务、唯一约束或 Idempotency-Key。

`useActionState` 返回的 `isPending` 适合拥有 Action 的组件；`useFormStatus` 适合深层 SubmitButton。两者不需要为了“统一”再复制进本地 State。

## 9. 同步校验、异步校验与服务端校验

### 三层职责

- 浏览器约束：快速反馈 `required`、`minLength`、`pattern`、输入类型。
- 客户端领域校验：跨字段规则与更友好的错误映射。
- 服务端校验：最终权威，处理唯一性、权限和当前数据库状态。

不要认为客户端已经校验，所以服务端可以跳过。客户端代码和请求都可被绕过。

### 原生校验与 `noValidate`

默认保留原生校验能获得键盘、移动端与基础可访问性收益。只有在设计系统确实要完全控制错误 UI 时才加 `noValidate`，并补齐所有校验、焦点、ARIA 和国际化行为。

### 异步字段校验

“标题是否重名”不能只在首次提交时才提示，但也不应每次按键立即发请求。常用策略是 Blur 或短暂防抖，并取消旧请求：

<<< ../../../examples/frontend/react-form-architecture/AsyncTitleField.tsx

请求由 Blur 事件直接触发，不由 Effect 间接触发；Effect 只负责组件卸载时取消资源。新检查会 Abort 旧检查，同时用递增 Request ID 拒绝晚到结果，避免旧标题响应覆盖新标题状态。

异步预检仍只是提示。检查后、提交前，另一用户可能占用同一标题；数据库唯一约束和提交 Action 必须再次校验。

## 10. 错误不是一个 Boolean

建议把失败至少分成四类：

| 类型 | 示例 | 呈现位置 |
| --- | --- | --- |
| 字段错误 | 标题太短 | 对应控件附近 |
| 表单错误 | 日期范围冲突 | 表单顶部 Summary |
| 传输/暂时错误 | 超时、503 | 表单顶部，可重试并保留值 |
| 未预期程序错误 | Bug、契约破坏 | Error Boundary + 监控 |

不要把所有错误都 Toast。字段错误需要和字段建立稳定关系，用户返回修改时仍应可见。

本课使用：

- `aria-invalid` 标记错误控件。
- `aria-describedby` 关联帮助与错误文本。
- `role="alert"` 通告新出现的失败。
- `role="status"` 通告成功或非紧急进度。
- 校验失败后把焦点移到错误摘要。

错误节点最好一直存在，只改变内容，以保持 `aria-describedby` 指向稳定。若要自动聚焦第一个错误字段，应按 DOM 顺序寻找 `[aria-invalid="true"]`，不要依赖 Object Key 顺序表达视觉顺序。

## 11. 乐观更新：提前显示可回滚的未来

`useOptimistic(baseState, updateFn)` 在 Action 或 Transition 进行期间派生临时状态。适合延迟明显、失败可撤销、结果容易预测的操作，例如添加标签、点赞或轻量排序。

<<< ../../../examples/frontend/react-form-architecture/OptimisticTagManager.tsx

流程是：

```text
提交 → 插入 pending 临时项 → 请求
  ├─ 成功：权威 Tag 写入 base state，替代临时视图
  └─ 失败：base state 未改变，临时项自然消失，并显示错误
```

临时项需要稳定而不冲突的 ID，不能只用数组索引。服务端返回的规范化名称、ID、排序和权限结果才是权威值。

不适合乐观处理的场景包括支付、不可逆删除、库存最后一件、权限变更等。即使使用乐观 UI，也要让失败可见，不能静默回滚让用户猜测。

## 12. 文件上传

文件控件本质上是非受控的。浏览器不允许应用把任意本地文件路径写入 `value`，重置通常通过 Form Reset 或更换组件 Key 完成。

完整示例：

<<< ../../../examples/frontend/react-form-architecture/FileUploadForm.tsx

Service 把 FormData 直接作为 Fetch Body，不能手动设置 `Content-Type: multipart/form-data`；浏览器需要自动附加正确的 Boundary。手写 Header 会导致服务端无法解析 Body。

`accept`、文件 MIME 和客户端大小检查都只是 UX。服务端必须重新检查：

- 实际文件签名，而非只相信扩展名/MIME。
- 大小、数量、压缩炸弹和解析资源上限。
- 文件名清理与随机对象 Key，避免路径穿越和覆盖。
- 恶意内容扫描与隔离。
- 下载时的 Content-Disposition、Content-Type 与权限。

大文件通常应使用对象存储的预签名上传、分片和进度 API，而不是让应用服务器把整个文件缓存在内存中。

## 13. 安全边界

### 鉴权与越权

Action 每次执行都应验证 Session，并检查当前用户是否有权操作目标资源。能猜到 `lessonId` 不代表有权编辑它；这是典型 IDOR/BOLA 风险。

### Mass Assignment

不要把 `Object.fromEntries(formData)` 直接展开进 ORM Update。显式挑选允许字段，解析成命令 DTO，拒绝 `ownerId`、`role`、审核状态等越权字段。

### CSRF

Cookie Session 会自动随请求发送，因此服务端写操作要采用 SameSite Cookie、CSRF Token 和 Origin/Host 校验等组合策略。`credentials: 'same-origin'` 不是完整 CSRF 防护。

### XSS

React 默认转义文本插值，但富文本预览和 `dangerouslySetInnerHTML` 会绕过这层保护。HTML 必须按允许列表在可信边界清洗；存储型 XSS 也不能靠 TypeScript 阻止。

### 重复提交

按钮 Disabled 只能减少误触。资金、订单或不可重复创建应使用服务端 Idempotency-Key：同一用户、同一命令、同一 Key 返回相同结果，且并发写入受事务/唯一索引保护。

## 14. 状态建模与工程取舍

不要默认建立如下全能对象：

```ts
{ values, initialValues, touched, dirty, errors, validating, submitting, success }
```

先判断哪些是源状态、哪些可派生：

- `dirty` 通常可由当前值与 Initial Snapshot 比较得到。
- `isValid` 通常可由 Errors 派生。
- Pending 应来自 Action/Transition，不要再维护一份容易失步的 Boolean。
- Server Data 应由 Router/缓存层拥有，不要成功后复制到 Form Local State。
- Touched 只有产品确实要求“离开字段后才显示错误”时才需要。

大型多步骤流程、动态条件分支、可撤销编辑适合 Reducer 或显式状态机：

```text
editing → validating → submitting → success
   ↑          │             │
   └─ invalid ┘             └─ recoverable-error
```

状态机的价值不只是写法整齐，而是禁止不可能组合，例如 `success && submitting && serverError` 同时为真。

## 15. 测试策略

### Contract 单元测试

对 `parseLessonForm()` 构造真实 FormData，覆盖：

- Trim 后的边界长度。
- 缺失 Checkbox 与重复 Tags。
- 非法 Level 和文件占据文本字段。
- 多语言字符与空白。

这是投入产出比最高的一层，因为它不需要渲染 React。

### 组件集成测试

使用用户级事件验证：输入、Blur、提交、Pending、字段错误、焦点和成功重置。不要直接调用组件内部 Handler；那会跳过浏览器表单语义。

对异步重名检查，令旧请求晚于新请求返回，确认旧响应不会覆盖新结果。对乐观标签分别验证成功替换和失败回滚。

### 端到端测试

覆盖浏览器原生校验、键盘提交、多 Submitter、真实 Multipart、重复点击和登录过期。文件、安全 Header、Cookie 与代理重试只能在更完整的系统边界得到可信验证。

## 16. 完整应用入口

组合各场景的应用：

<<< ../../../examples/frontend/react-form-architecture/App.tsx

浏览器入口：

<<< ../../../examples/frontend/react-form-architecture/main.tsx

本课所有核心源码都已在页面中逐文件展示，不需要跳转仓库才能看到完整实现。

## 17. 决策清单

开始实现表单前，逐项确认：

1. 哪些字段需要输入时即时驱动 UI，哪些只在提交时读取？
2. 未经校验的 Draft 类型与合法领域类型是否分开？
3. FormData 的缺失、重复、File 和类型转换是否显式处理？
4. 使用的是 Client Action、Server Function 还是 Router Action？
5. Action Resolve 后的非受控重置是否符合产品需求？
6. 校验失败和网络失败是否保留用户输入？
7. Pending、重复提交和服务端幂等是否各自处理？
8. 异步校验能否取消，晚到响应会不会覆盖新状态？
9. 乐观操作是否真正可撤销，失败是否明确可见？
10. 错误是否关联字段、可被读屏通告并有合理焦点？
11. 服务端是否重新做校验、鉴权、资源授权与 CSRF 防护？
12. 文件是否按不可信二进制内容处理？

## 18. 官方资料

- [React `<form>`](https://react.dev/reference/react-dom/components/form)
- [React `<input>`](https://react.dev/reference/react-dom/components/input)
- [React `<select>`](https://react.dev/reference/react-dom/components/select)
- [React `<textarea>`](https://react.dev/reference/react-dom/components/textarea)
- [React `useActionState`](https://react.dev/reference/react/useActionState)
- [React `useFormStatus`](https://react.dev/reference/react-dom/hooks/useFormStatus)
- [React `useOptimistic`](https://react.dev/reference/react/useOptimistic)
- [MDN FormData](https://developer.mozilla.org/docs/Web/API/FormData)
- [MDN Using FormData Objects](https://developer.mozilla.org/docs/Web/API/XMLHttpRequest_API/Using_FormData_Objects)

## 19. 下一节预告

下一节进入 **React 渲染性能、并发特性与 Suspense**：从 Render/Commit 成本、Profiler 和 Memo 化边界出发，再理解 `useTransition`、`useDeferredValue`、Suspense 数据流、Streaming 与可中断渲染。
