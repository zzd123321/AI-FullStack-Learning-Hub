---
title: DOM、事件传播、Shadow DOM 与可访问交互
description: 深入事件路径、捕获与冒泡、默认行为、委托、Shadow DOM 重定向、Pointer、输入法、焦点和键盘可访问性
---

# DOM、事件传播、Shadow DOM 与可访问交互

## 1. 学习目标

完成本节后，你应该能解释 Event Path、Capture/Target/Bubble，正确区分 `preventDefault()` 与传播控制；使用事件委托和 AbortSignal 管理生命周期；理解 Shadow DOM 的 Retargeting、`composed` 与 `composedPath()`；设计同时支持 Pointer、Keyboard、输入法和辅助技术的交互。

## 2. DOM 是对象树，不只是 HTML 字符串

HTML Parser 构造 Document、Element、Text 等 Node。DOM Mutation 改的是内存对象树，浏览器再据此更新 Style/Layout/Paint。Attribute 与 Property 也不总相同：`input.getAttribute('value')` 是初始内容，`input.value` 是当前状态。

静态 `querySelectorAll()` 返回快照；某些 `children`/`getElementsBy*` Collection 是 Live。遍历 Live Collection 时删除节点可能跳项，工程代码通常先展开为数组。

## 3. Event Dispatch 的三阶段

浏览器先确定 Event Path，再依次调用 Listener：

```text
window → document → html → body → ancestor → target
                 Capture ↓
                           Target
                 Bubble  ↑（仅当 bubbles=true）
```

默认 `addEventListener` 监听 Bubble Phase；`{ capture: true }` 监听 Capture。`event.target` 是最初目标（经过 Shadow Retargeting 后的可见目标），`event.currentTarget` 是当前正在执行 Listener 的对象，Listener 返回后 `currentTarget` 不应被异步保存使用。

不是所有事件都冒泡，例如 `focus`/`blur`；委托可用会冒泡的 `focusin`/`focusout`，或 Capture Listener。必须查看具体 Event 的 `bubbles`、`cancelable`、`composed`。

## 4. 默认行为与传播是两条轴

- `preventDefault()`：请求取消浏览器默认行为，只有 `cancelable` Event 有效。
- `stopPropagation()`：不再走后续 Path，但同一 Node 其他 Listener 仍可能运行。
- `stopImmediatePropagation()`：也阻止同一 Node 后续 Listener。
- `return false`：只在部分旧式/库语境有特殊含义，原生 `addEventListener` 中不要依赖。

取消 Link Navigation 不会自动阻止父层 Listener；停止冒泡也不会自动取消 Form Submit。Passive Listener 承诺不调用 `preventDefault()`，适合不拦截滚动的 Touch/Wheel 观测；若确需改变手势，优先使用 CSS `touch-action` 明确策略。

## 5. Listener Lifecycle

匿名 Listener 难以逐个 `removeEventListener`。现代 API 可把多个 Listener 绑定到同一个 AbortSignal：

<<< ../../../examples/frontend/dom-events/listener-scope.ts

组件卸载只需 `controller.abort()`。`once` 适合只运行一次；`passive` 是行为承诺；`capture` 参与移除匹配，若手工移除应保持配置一致。

## 6. 事件委托

动态列表无需给每个 Row 单独绑定 Listener。父容器利用冒泡处理，并用 `composedPath()` 找实际交互节点：

<<< ../../../examples/frontend/dom-events/delegation.ts

只用 `event.target.closest()` 有两个问题：Target 可能不是 Element；Shadow DOM 会重定向 Target。示例遍历 Composed Path，并验证匹配节点仍属于 Container，避免嵌套组件越界。

委托适合大量同类稳定行为，不等于所有事件只绑 Document。全局 Listener 会模糊 Ownership、增加冲突；在最近的 Feature Boundary 委托更容易清理和测试。

## 7. Event Path 在 Dispatch 开始时确定

Event Dispatch 不是每到一层重新查询 DOM。分发期间移动/删除节点不会简单改写已计算路径。Listener 的添加删除也有精确时序，不应利用边缘顺序设计业务。

同步 Dispatch 遵循 Run-to-completion。`dispatchEvent()` 会同步调用 Listener，并返回“是否未被取消”：Cancel-able Event 被 `preventDefault()` 后返回 `false`。

## 8. CustomEvent 是边界契约

<<< ../../../examples/frontend/dom-events/custom-events.ts

Custom Event 应命名空间化、版本化、Runtime Validate，Payload 只放 DTO/ID。`bubbles: true` 支持委托；`composed: true` 允许跨 Shadow Boundary；`cancelable: true` 只用于调用方确实需要否决动作的协议。不要用全局 Event Bus 隐藏同步命令与错误返回。

## 9. Shadow DOM 的封装模型

Shadow Root 提供独立 Node Tree、Style Scope 与 Slot Composition。外部普通 Selector 不穿透 Shadow Tree；内部样式也通常不泄漏。但 CSS Custom Properties、Inherited Properties、`::part`、Slots 等提供受控 Styling Contract。

Open Shadow Root 可由 `element.shadowRoot` 访问；Closed 只隐藏普通访问入口，不是安全边界。页面同源 Script 仍拥有宿主环境权限，机密不能靠 Closed Shadow DOM 保护。

## 10. Retargeting、composed 与 composedPath

跨 Shadow Boundary 时，外部 Listener 看到的 `event.target` 可能被 Retarget 为 Host，防止内部实现细节泄漏。`event.composedPath()` 展示 Listener Path；Closed Root 的内部节点会对外隐藏。

`composed` 表示事件是否允许穿过 Shadow Boundary，`bubbles` 表示是否沿 Path 冒泡，它们不是同一属性。大多数用户交互 UI Event 是 Composed；自定义 Event 默认三个 Flag 都是 false，必须显式设计。

<<< ../../../examples/frontend/dom-events/lesson-card-element.ts

组件内部用原生 `<button>` 保留 Keyboard、Focus 和 Activation 语义，向外发出稳定业务事件，不暴露内部 Button。

## 11. Slot 与事件路径

Light DOM Node 被分配进 `<slot>` 后，Composed Tree 的视觉/事件关系不等于普通 Parent Node 关系。`parentNode` 仍指 Light DOM Parent，`assignedSlot` 可指向 Slot；事件路径会反映 Slot/Shadow 边界。跨组件委托应查看 `composedPath()`，不要仅沿 `parentElement` 猜测。

## 12. Pointer Events 统一输入

Pointer Events 统一 Mouse、Touch、Pen，提供 `pointerId`、`pointerType`、Pressure 等。拖拽应使用 Pointer Capture：指针移出 Handle 后仍将后续事件送给该元素。

<<< ../../../examples/frontend/dom-events/pointer-drag.ts

示例处理 Primary Button、Capture、Coalesced Move、Pointer Up/Cancel 和清理。视觉更新用 `transform`，高频产品可把最新坐标存起来并在 rAF 中每帧更新一次。不要只监听 Mouse，否则 Touch/Pen 失效；也不要通过阻止所有 Touch Event 破坏页面滚动。

## 13. Click 仍是语义激活事件

Pointer Events 适合连续手势，但“激活按钮”优先监听 `click`。原生 Button 可由鼠标、触摸、键盘和辅助技术触发 Click。若同时在 `pointerup` 和 `click` 执行业务，可能重复提交。

使用 `<button>` 而非 `<div role="button">`。ARIA 只补语义，不自动实现 Focus、Enter/Space Activation、Disabled 和 Form 行为。

## 14. Keyboard Event

使用 `event.key` 表达用户意图（如 `ArrowRight`、`Enter`），`event.code` 表达物理键位。快捷键需考虑平台、输入法、浏览器保留组合键，并避免劫持文本编辑惯例。

只有实现 Composite Widget 时才拦截 Arrow Key，并 `preventDefault()` 阻止相应滚动。不要全局阻止 Space/Arrow。

## 15. Focus 与 Roving tabindex

普通 Tab 顺序应与 DOM/阅读顺序一致。避免正数 `tabindex`；`0` 加入自然顺序，`-1` 可程序化 Focus 但不进入 Tab Ring。

Toolbar、Tabs、Menu 等 Composite Widget 通常整体只有一个 Tab Stop，内部用 Arrow 移动：

<<< ../../../examples/frontend/dom-events/roving-toolbar.ts

示例采用 Roving tabindex：当前项为 0，其余为 -1。正式 Toolbar 还需 Home/End、Disabled Policy、Orientation、动态增删和可见 Focus Style，并遵循对应 WAI-ARIA APG Pattern。

## 16. Focus 不等于 Selection

Focus 是 Keyboard Input 当前落点；Selection/Checked/Expanded 是组件状态。移动 Focus 不一定立即选择，具体遵循 Listbox/Tabs/Tree Pattern。不要用 CSS 移除 Outline；使用 `:focus-visible` 提供清晰指示。

Modal 打开时 Focus 进入 Dialog，Tab 被限制在 Modal，关闭后返回合理 Trigger；还需 Inert Background、Escape 和 Accessible Name。手写完整 Focus Trap 很容易出错，应优先原生 `<dialog>` 或成熟实现并测试辅助技术。

## 17. Input、change 与输入法组合

`input` 在值被用户修改时持续触发；`change` 通常在 Commit 时触发，具体随 Control 类型不同。中文、日文等 IME 输入包含 Composition Session，中间 `input` 不一定是用户最终文本：

<<< ../../../examples/frontend/dom-events/composition-input.ts

搜索可在 `compositionend` 后执行，避免对每个未完成音节请求。还要结合 Debounce、Abort 旧请求和 Screen Reader 实测。不要用 Keydown 推断 Text Value：粘贴、语音、自动填充与辅助技术都可能绕过键盘。

## 18. Form 默认行为

Form Submit 的统一入口是 `submit` 事件，而不是只监听 Button Click：Enter、辅助技术和 `requestSubmit()` 都能提交。先用 Constraint Validation；只有异步接管时才在 Submit Handler `preventDefault()`。

`form.submit()` 绕过 Submit Event/Validation，通常应使用 `requestSubmit()`。Submitter 可由 `SubmitEvent.submitter` 获得。防重复提交还需要 Server Idempotency，Disabled Button 只改善 UI。

## 19. 框架与原生事件

React/Vue 可能在 Root 做 Event Delegation、包装事件或调整 Listener 时机。规则：

- 组件 Template/JSX 中优先框架事件绑定。
- Window/Document/第三方 DOM 用 Effect/Lifecycle 对称清理。
- 不依赖框架内部 Delegation Node 或非公开事件池实现。
- Custom Element 边界使用 DOM Property 与 CustomEvent。
- Portal/Teleport 的 Component Tree 与 DOM Event Path 不一定相同，业务冒泡与原生冒泡要分别理解。

## 20. 完整实验入口

<<< ../../../examples/frontend/dom-events/main.ts

<<< ../../../examples/frontend/dom-events/index.html

入口同时演示动态列表委托、Roving Toolbar、Shadow Custom Element 与 Composed Custom Event。页面上的全部示例源码均直接展示，不依赖隐藏代码。

## 21. 安全边界

不要把不可信字符串交给 `innerHTML`；示例 Custom Element 的固定 Template 不含外部输入。用户内容用 `textContent`，富文本采用成熟 Sanitizer 与严格 Allowlist，并配合 CSP。

`event.isTrusted` 只能区分 User Agent 生成与 Script Dispatch 的事件线索，不能作为授权。攻击者可诱导真实用户点击；敏感操作仍需 Server Authentication、Authorization、CSRF 与业务确认。

## 22. 性能与内存

- 使用委托减少大量 Listener，但不要无边界全局委托。
- 高频 Pointer/Scroll Handler 做最少工作，必要时 rAF Batch。
- Passive Scroll Listener 避免不必要的滚动阻塞。
- Listener Closure 会保持引用；Unmount 时 Abort。
- 避免在 Handler 中交错 DOM Read/Write 引发 Forced Layout。
- DevTools Event Listener Breakpoint、Performance Trace 和 Memory Heap Snapshot 联合诊断。

## 23. 测试策略

- 单元测试纯 Event Parser/Focus Index 算法。
- DOM Integration 验证 Bubbling、Default Prevention 和动态节点。
- Browser Test 验证真实 Focus、Tab、Enter/Space、Pointer Capture、Shadow Path 和 Form Submit。
- 使用 Keyboard-only 完成关键流程。
- 用 Screen Reader 做代表性人工验证；自动 Axe 类检查不能证明交互模式正确。
- 测试 Pointer Cancel、组件断开重连、节点动态删除和 IME Composition。

## 24. 常见错误

1. 到处 `stopPropagation()`：隐藏组件耦合并破坏 Analytics/外层交互；优先收紧 Selector/Boundary。
2. 用 `preventDefault()` 阻止冒泡：两者无关。
3. `event.target as HTMLElement`：Target 可以是 Text/其他 EventTarget；先 Narrow。
4. Clickable Div：丢失原生 Keyboard/Focus/Form 行为。
5. Shadow DOM 当安全沙箱：它是封装，不是不可信代码隔离；不可信内容用 iframe 等安全边界。
6. 只处理 Keydown：无法覆盖粘贴、语音、IME 和辅助技术。
7. Listener 永不清理：路由切换后重复执行并保持对象引用。

## 25. 检查清单

- 事件是否真的 Bubble/Cancelable/Composed？
- 需要取消默认行为，还是停止传播？
- 委托 Selector 是否限制在正确 Feature Boundary？
- Shadow 外部是否只看到稳定 Event Contract？
- 是否优先使用 Button、Link、Input、Select、Dialog 等原生元素？
- Mouse、Touch、Pen、Keyboard、IME 和辅助技术是否可完成同一目标？
- Focus 是否可见、顺序合理、Modal 后可恢复？
- Listener/Pointer Capture/Observer 是否全部清理？
- 高频 Handler 是否造成 Long Task 或 Forced Layout？
- Custom Event Payload 是否版本化并运行时校验？

## 26. 官方资料

- [WHATWG DOM：Events](https://dom.spec.whatwg.org/#events)
- [MDN：Event](https://developer.mozilla.org/en-US/docs/Web/API/Event)
- [MDN：DOM events](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model/Events)
- [MDN：Event.composed](https://developer.mozilla.org/en-US/docs/Web/API/Event/composed)
- [MDN：Pointer events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)
- [WAI-ARIA APG：Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)
- [WAI-ARIA APG：Toolbar Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/)

## 27. 本节小结

DOM Event 是沿预先计算 Path 同步分发的协议。Propagation、Default Action、Shadow Boundary 和 Focus 各有独立规则；把它们混成“点击冒泡”会产生难以维护的补丁。优先原生语义元素，用最近边界委托、AbortSignal 管生命周期、Composed Custom Event 跨组件，并以 Keyboard/Pointer/IME/辅助技术共同验证交互。

下一节将学习浏览器存储、Cookie、Web Storage、IndexedDB、Cache API、配额、序列化与离线数据一致性。
