---
title: React 表单架构、Actions 与复杂交互
description: 从输入所有权和浏览器表单协议出发，理解 FormData、React Actions、校验、乐观更新、上传与安全边界
outline: deep
---

# React 表单架构、Actions 与复杂交互

> 资料基线：React 19.2。普通 Vite SPA 中的函数 Action 仍在浏览器运行；Server Function 的编译、传输和服务端执行依赖支持它的框架，不能因为函数写在 `action` 属性里，就把客户端代码误认为后端代码。

对 Vue 2 开发者来说，React 表单最容易被简化成“`v-model` 换成 `value + onChange`”。这只解释了受控输入，却没有解释真实表单还承担的协议：哪些字段会被提交、怎样解析字符串与文件、错误属于哪个层级、提交期间如何反馈，以及服务器怎样保证一次写操作安全可靠。

一份表单至少经过这些边界：

```text
用户操作 DOM 控件
      ↓ name / value / checked
浏览器构造 FormData
      ↓ 解析、归一化、领域校验
Action 编排一次提交
      ↓ HTTP 命令
服务器鉴权、授权、校验与写入
      ↓ 字段错误 / 表单错误 / 成功 / 意外失败
React 显示反馈并恢复焦点
```

本课会沿着这条数据流逐步展开，而不是先给每个输入框配一份 State。

## 先决定谁拥有输入的当前值

React 有两种基本所有权模式。

### 受控输入：React State 拥有当前值

传入 `value` 或 `checked` 后，React State 就是唯一事实来源：

```tsx
const [name, setName] = useState('')

<input
  value={name}
  onChange={(event) => setName(event.currentTarget.value)}
/>
```

如果只传 `value` 却不在 `onChange` 中更新，下一次 Render 仍会把旧值写回去，输入看起来就无法编辑。

完整受控示例：

<<< ../../../examples/frontend/react-form-architecture/ControlledProfileForm.tsx

受控模式适合当前输入必须立即参与 React UI 的场景：

- 输入时同步更新预览、价格或字符统计；
- 一个字段会立刻限制或重置另一个字段；
- 需要撤销、草稿状态机或跨组件协作；
- 编辑器的值不是普通 DOM 字符串。

每次输入会让 State 所有者重新 Render，这通常不是问题。真正容易变慢的是把几十个字段和整张复杂页面放在同一个高层组件中。优先缩小 State 所有者和组件边界，再根据 Profiler 决定是否优化。

受控输入在整个生命周期都应保持受控。文本值第一帧就传字符串，例如 `value={name ?? ''}`，不要先传 `undefined`，数据加载后再切换成字符串。

### 非受控输入：DOM 拥有当前值

`defaultValue` 和 `defaultChecked` 只提供初值。此后用户怎样编辑由 DOM 保存，提交时再读取 `FormData`：

```tsx
<input name="title" defaultValue="React 表单" />
```

| 意图 | 文本、选择控件 | Checkbox |
| --- | --- | --- |
| React 持续控制 | `value` | `checked` |
| 只设置初始值 | `defaultValue` | `defaultChecked` |

非受控模式适合提交时才消费、字段之间没有高频联动的普通表单。它不是“低级写法”，而是充分利用浏览器原生表单能力。

一个表单可以混合两种模式：普通字段交给 DOM，即时预览字段使用 State。选择单位是“字段”，不是整张表单。但同一个控件只能有一个当前值所有者，不能同时传 `value` 与 `defaultValue`，也不要让表单库和本地 State 同时争夺它。

### File Input 天生接近非受控

浏览器不允许网页把任意本地文件路径写进文件输入框。应用可以读取用户选择的 `File`，但不能像普通文本那样控制其 `value`。清空文件通常使用 Form Reset 或重建控件。

## FormData 是浏览器协议，不是领域对象

`new FormData(form)` 或函数 Action 收到的 `FormData`，遵循 HTML 的“成功控件”规则：

- 只有带 `name` 的控件才提交，`id` 只用于 Label/ARIA；
- Disabled 控件通常不提交，Readonly 文本控件会提交；
- 未勾选 Checkbox 不产生条目；
- Checkbox 没有显式 `value` 时，勾选值通常是 `"on"`；
- 同名 Checkbox 与 `select[multiple]` 产生重复 Key，应使用 `getAll()`；
- 被点击的 Submit Button 可以提交自己的 `name=value`；
- 文件字段得到 `File`，所以 `get()` 不保证是字符串；
- Number、Boolean 和联合类型不会自动转换。

因此下面的断言没有验证作用：

```ts
const values = Object.fromEntries(formData) as LessonValues
```

用户可以构造任意请求，字段也可能缺失、重复或变成 File。正确做法是把原始输入解析成领域结果。

本课先区分两种类型：

<<< ../../../examples/frontend/react-form-architecture/types.ts

`LessonDraft.level` 仍是任意字符串，因为它尚未验证；`LessonValues.level` 只能是三个合法领域值。不要为了少写一个类型，假装浏览器输入已经可信。

纯表单契约负责 Trim、重复字段读取和运行时收窄：

<<< ../../../examples/frontend/react-form-architecture/form-contract.ts

类型守卫在真实比较之后才把 `rawLevel` 收窄为联合类型，不需要用 `as` 掩盖风险。固定标签选项也应在服务端重新验证；如果标签来自动态数据，则可以把允许集合显式传入解析器。

### 多个提交按钮可以表达不同意图

```tsx
<button name="intent" value="draft">保存草稿</button>
<button name="intent" value="publish">发布</button>
```

浏览器只提交实际点击的 Submitter。Action 读取 `intent` 后分别执行不同校验和授权，比根据按钮文案猜业务命令可靠。分支过多时，应拆成更清晰的命令或路由 Action，避免一张表单变成万能入口。

## React 中常见的四种提交流程

“Action”在不同体系中含义相近，却不等同。

| 机制 | 运行与所有权 | 自动协调 |
| --- | --- | --- |
| `onSubmit` | 组件 Event Handler | 全部手动 |
| React `<form action={fn}>` | 普通 SPA 中在浏览器运行 | Transition、Pending、非受控重置 |
| Framework Server Function | 框架部署到服务器 | RPC、渐进增强等，取决于框架 |
| React Router Action | 匹配的 Route | 导航、错误边界、Loader Revalidation |

### `onSubmit` 仍然完全有效

```tsx
function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
  event.preventDefault()
  const formData = new FormData(event.currentTarget)
  // parse → command → render result
}
```

它适用于所有现代 React 版本，流程直接，也容易接入已有请求库。应在同步阶段读取 `event.currentTarget` 或立即构造 FormData，不要等过异步边界后再依赖 Event 对象和 DOM 状态。

### 函数 Action 仍可能只是客户端函数

React 19 允许：

```tsx
<form action={saveAction}>...</form>
```

React 会把 FormData 传给函数，并在 Action/Transition 语义中跟踪 Pending。普通 Vite SPA 的 `saveAction` 仍打包进浏览器，不能持有数据库密码或绕过 API 授权。

Server Function 则由框架识别并在服务器运行，常见 `'use server'` 指令也依赖构建工具支持。源码看起来像普通异步函数，不代表任意工程都获得了远程调用和安全边界。

上一课的 Router Action 属于 Route 数据生命周期。对同一个写操作，应选择清楚的所有者，不要同时叠加组件 Action 与 Router Action，再维护两套 Pending 和错误状态。

## `useActionState` 把提交结果带回 UI

`useActionState` 返回三项：

```ts
const [state, dispatchAction, isPending] = useActionState(
  reducerAction,
  initialState,
)
```

包装后的函数签名比普通 Form Action 多一个首参数：

```ts
async function reducerAction(
  previousState: FormState,
  payload: FormData,
): Promise<FormState> {
  // ...
}
```

如果忽略这个变化，原来接收 FormData 的函数会误把 `previousState` 当表单数据。

本课的 Action 先解析领域值，再调用 Service，最后返回可渲染状态：

<<< ../../../examples/frontend/react-form-architecture/lesson-action.ts

HTTP Service 负责协议、幂等 Header 与响应校验：

<<< ../../../examples/frontend/react-form-architecture/lesson-service.ts

职责可以这样分开：

```text
Form Contract：原始 FormData → 合法值或字段错误
Action：提交编排 → invalid / success / recoverable error
Service：HTTP 请求、状态码与响应 JSON 边界
Server：认证、资源授权、权威校验、事务与幂等
```

字段错误是预期业务结果，应返回 State；接口不可用也可返回保留输入的可恢复结果。程序缺陷和错误响应结构应记录到监控，不要把 Stack 或内部信息展示给用户。

### 幂等键为什么不来自隐藏字段

隐藏字段仍是客户端输入，用户可以修改。示例由可信组件状态生成 `Idempotency-Key`，校验失败和结果不确定的网络失败继续复用同一 Key；确认成功后才创建下一枚 Key。

服务器应把“当前用户 + 命令 + Key”作为去重边界，在事务或唯一索引下让重复请求返回同一结果。按钮 Disabled 只能减少误触，不能阻止多标签页、代理重试或手工请求。

## 非受控表单重置需要明确设计

完整 Action 表单：

<<< ../../../examples/frontend/react-form-architecture/LessonActionForm.tsx

React 的函数 Form Action 正常完成后会重置非受控控件。这里“正常完成”是函数 Resolve，并不自动知道返回的 State 代表校验失败还是业务成功。

因此示例采用清晰策略：

1. 校验失败或可恢复错误时，State 保存“最近一次提交快照”；
2. `revision` 改变 Form 的 Key，重建控件；
3. 新控件通过 `defaultValue/defaultChecked` 恢复快照；
4. 真正成功时返回 `values: null`，重建为空表单。

错误 State 中的 `values` 不是每次按键的实时副本。用户编辑时仍由 DOM 拥有当前值，只有提交时才产生快照，因此没有维护两份实时 State。

`useActionState` 本身没有内置 Reset Setter。若产品需要主动重置，可以把 Reset 建模成 Action Payload，或改变拥有该 Hook 的组件 Key。不要假设重新计算 `initialState` 会重置一个已经存在的 Hook；初始参数只用于初始化。

## Pending 属于正在发生的 Action

拥有 `useActionState` 的组件可以读取 `isPending`。深层按钮则可以读取最近祖先 Form 的状态：

<<< ../../../examples/frontend/react-form-architecture/SubmitButton.tsx

`useFormStatus()` 必须在 Form 的后代组件中调用。如果在“正在返回这个 `<form>` 的同一个组件”顶部调用，它看不到自己即将创建的 Form，只会读取更外层 Form 或得到非 Pending 状态。

除了 `pending`，Hook 还提供正在提交的 `data`、`method` 和函数 `action`。这些值适合显示“正在保存某标题”等提交反馈，但不要把密码等敏感字段回显到页面或日志。

Pending UI 应：

- 立即改变按钮文案；
- 防止同一控件连续误触；
- 用 `aria-busy` 或 Live Region 提供辅助技术反馈；
- 保留用户仍需阅读的页面内容。

不需要再复制一份 `isSubmitting` State。并发正确性依然由服务器事务、版本与幂等保证。

## 错误需要回到能解决它的位置

“提交失败”不是一种单一状态：

| 错误 | 示例 | 合理位置 |
| --- | --- | --- |
| 字段错误 | 标题太短 | 对应字段旁边 |
| 表单错误 | 日期范围冲突 | 表单顶部摘要 |
| 暂时/传输错误 | 超时、503 | 摘要，可重试并保留输入 |
| 未预期异常 | Bug、契约破坏 | Error Boundary、监控、安全通用文案 |

不要把所有错误都做成几秒后消失的 Toast。用户需要知道哪个字段有问题，并能返回修改。

示例使用：

- `aria-invalid` 标记无效控件；
- `aria-describedby` 关联帮助和错误文本；
- `role="alert"` 通告新失败；
- `role="status"` 通告成功或非紧急进度；
- 提交失败后把焦点移动到错误摘要。

错误节点保持稳定，只改变文本，可以让 `aria-describedby` 关系持续存在。若要聚焦第一个错误字段，应按 DOM 顺序查找 `[aria-invalid="true"]`，不要依赖 JavaScript 对象 Key 顺序替代视觉顺序。

### 三层校验各自有职责

- 浏览器约束：`required`、`minLength`、输入类型，提供最快反馈；
- 客户端领域校验：跨字段规则和友好错误映射；
- 服务端校验：唯一性、权限和数据库当前状态，是最终权威。

客户端校验不能成为服务器省略校验的理由。请求可以绕过页面。

默认原生校验带来移动端输入、键盘和基础可访问性收益。只有设计系统确实要完全接管错误体验时才使用 `noValidate`，并补齐校验、ARIA、焦点和国际化。

## 异步字段检查要管理旧请求的写权限

“标题是否已存在”需要访问服务器，但没必要每次按键都立即请求。常见触发方式是 Blur，或正确处理 IME 的短暂 Debounce。

完整字段：

<<< ../../../examples/frontend/react-form-architecture/AsyncTitleField.tsx

Blur 是明确用户事件，所以直接发起检查，不需要先设置 State 再让 Effect 猜测原因。每次新检查：

1. Abort 上一请求；
2. 递增 Request ID；
3. 进入 checking；
4. 只有 ID 仍是最新且 Signal 未取消时，才写入结果；
5. 输入再次变化时立即废弃旧结论，不能继续显示上一标题“可用”；
6. Effect 只负责组件卸载时释放仍存活的请求。

Abort 减少资源浪费，Request ID 收回旧响应写入当前 UI 的权限。不要只识别某一种异常类，因为请求封装可能使用不同取消错误。

异步预检仍然只是提示。检查完成到最终提交之间，另一位用户可能占用同一标题；数据库唯一约束和提交 Action 必须再验证。

## 乐观 UI 展示一个可回滚的未来

`useOptimistic(baseState, reducer)` 在 Action 或 Transition Pending 期间，基于权威 State 派生临时视图：

<<< ../../../examples/frontend/react-form-architecture/OptimisticTagManager.tsx

```text
提交标签
  → 立即插入 pending 临时项
  → 请求服务器
      ├─ 成功：把服务器 Tag 写入 base state
      └─ 失败：base state 不变，临时项随 Action 结束而消失
```

乐观 Setter 必须在 Action 或 `startTransition` 中调用；函数 Form Action 已经提供 Action 上下文。Reducer 写法还能在 Base State 于等待期间变化时，基于最新 Base 重新计算临时列表。

临时项要有稳定且不冲突的 ID，不能使用数组索引。服务端返回的 ID、规范化名称、顺序和权限结果才是权威值。

乐观交互适合延迟明显、结果容易预测、失败能安全撤销的操作，例如点赞和添加轻量标签。支付、权限变更、库存最后一件或不可逆删除不应仅靠静默乐观回滚；即使采用乐观显示，也必须清楚展示失败与后续处理。

## 文件上传跨越的是不可信二进制边界

完整上传表单：

<<< ../../../examples/frontend/react-form-architecture/FileUploadForm.tsx

上传 Service 直接把 FormData 作为 Body，不手工设置 `Content-Type: multipart/form-data`。浏览器需要生成包含 Boundary 的 Header；手写一个没有 Boundary 的 Header 会让服务器无法解析。

`accept`、客户端 MIME 与大小检查只是提前反馈。服务器仍需验证：

- 文件签名，而不是只信扩展名或 MIME；
- 大小、数量、压缩炸弹和解析资源上限；
- 文件名与对象 Key，防止路径穿越和覆盖；
- 恶意内容扫描、隔离和下载权限；
- `Content-Disposition` 与安全 `Content-Type`。

大文件通常使用对象存储预签名上传、分片和进度协议，避免应用服务器把整个文件缓存在内存中。上传接口可能成功返回 204，因此示例只检查状态码，不强迫空响应解析成 JSON。

## 安全边界不在按钮上

### 认证与资源授权

每次写操作都要在服务器验证 Session，并检查当前用户能否操作目标实体。用户能猜出 `lessonId`，不代表有权编辑它；这是常见 IDOR/BOLA 风险。

### 防止 Mass Assignment

不要把 `Object.fromEntries(formData)` 直接展开进 ORM Update。服务器应显式挑选允许字段并构造命令 DTO，拒绝 `ownerId`、`role`、价格和审核状态等客户端无权修改的字段。

### CSRF

Cookie 会自动随请求携带。SameSite Cookie、CSRF Token、Origin/Host 校验应根据认证方式和部署组合使用；`credentials: 'same-origin'` 只控制凭据发送，并不是完整 CSRF 防护。

### XSS

React 默认转义普通文本插值，但富文本和 `dangerouslySetInnerHTML` 会绕过它。用户 HTML 必须在可信边界按允许列表清洗；存储型 XSS 也不能靠 TypeScript 阻止。

## 状态复杂时先分清源数据与派生数据

不要默认给每张表单建立一个全能对象：

```ts
{ values, initialValues, touched, dirty, errors, validating, submitting, success }
```

其中不少值可以派生：

- `dirty` 可由当前值与初始快照比较；
- `isValid` 可由 Errors 派生；
- Pending 来自 Action/Transition；
- 服务器实体继续由 Router 或数据缓存层拥有；
- Touched 只有产品要求“离开字段后才显示错误”时才需要。

多步骤、动态分支、可撤销编辑和复杂权限流程可以使用 Reducer 或显式状态机。它们的价值是禁止 `success && submitting && error` 之类不可能组合，而不是单纯增加 Action 文件。

## 完整示例与验证方法

应用组合所有场景：

<<< ../../../examples/frontend/react-form-architecture/App.tsx

浏览器入口：

<<< ../../../examples/frontend/react-form-architecture/main.tsx

示例目录共 12 个文件，前文源码引用已覆盖全部实现：

```text
examples/frontend/react-form-architecture/
├── App.tsx
├── AsyncTitleField.tsx
├── ControlledProfileForm.tsx
├── FileUploadForm.tsx
├── LessonActionForm.tsx
├── OptimisticTagManager.tsx
├── SubmitButton.tsx
├── form-contract.ts
├── lesson-action.ts
├── lesson-service.ts
├── main.tsx
└── types.ts
```

表单 Contract 最适合先做纯单测。用真实 FormData 覆盖 Trim 边界、缺失 Checkbox、重复 Tags、非法 Level，以及文本字段被替换为 File。Service 还要验证错误 JSON 和 204 上传响应。

组件测试应从真实输入、Blur 与 Submit 出发，断言浏览器校验、Pending、字段关联、错误摘要焦点和成功重置。异步标题检查要让旧请求晚于新请求返回，确认旧结果无权覆盖；乐观标签分别验证成功收敛与失败回滚。

端到端测试再覆盖键盘提交、多 Submitter、真实 Multipart、登录过期、重复请求和服务端幂等。Cookie、安全 Header、代理重试和文件扫描只有在完整系统边界中才能得到可信验证。

仓库当前没有 React 19 类型与组件测试运行时，本专题也不修改根 `package.json`。纯 TypeScript Contract/Service 接受严格检查和可运行契约验证，TSX 接受源码与语义审查；不会把未运行的 React 交互测试描述为已通过。

## 本节小结

React 表单不是“每个 Input 配一个 State”，而是 DOM 输入所有权、HTML FormData 协议、领域校验和服务端命令的交汇点。需要即时驱动 UI 的字段适合受控；只在提交时消费的字段可以让 DOM 持有。未经验证的 FormData 永远不是领域对象。

函数 Action、`useActionState`、`useFormStatus` 和 `useOptimistic` 帮助组织提交、Pending 与临时反馈，但不会替代服务器授权、校验、事务、CSRF 和幂等。可靠表单应在失败时保留输入，让过期异步结果失去写权限，让乐观变化可回滚，并通过字段关系、Live Region 与焦点帮助所有用户理解结果。

下一课进入 [React 渲染性能、并发与 Suspense](./rendering-performance-concurrency-and-suspense.md)：先学会用 Profiler 找到真正成本，再理解 Memo、Transition、Deferred Value、Suspense 与可中断渲染各自解决什么问题。

## 延伸阅读

- [React：`<form>`](https://react.dev/reference/react-dom/components/form)
- [React：`<input>`](https://react.dev/reference/react-dom/components/input)
- [React：`useActionState`](https://react.dev/reference/react/useActionState)
- [React：`useFormStatus`](https://react.dev/reference/react-dom/hooks/useFormStatus)
- [React：`useOptimistic`](https://react.dev/reference/react/useOptimistic)
- [React：Server Functions](https://react.dev/reference/rsc/server-functions)
- [MDN：FormData](https://developer.mozilla.org/docs/Web/API/FormData)
- [MDN：Using FormData Objects](https://developer.mozilla.org/docs/Web/API/XMLHttpRequest_API/Using_FormData_Objects)
