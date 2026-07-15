# Tabs 组件契约

| 维度 | 契约 |
| --- | --- |
| 名称 | `ds-tabs` |
| 简单输入 | `selected-id`、`activation`、`label` Attribute |
| 复杂输入 | `items` DOM Property，禁止 JSON Attribute |
| 输出 | `ds-change` CustomEvent，`detail.selectedId` |
| 传播 | `bubbles: true`、`composed: true` |
| 键盘 | Left/Right、Home/End；手动模式用 Enter/Space 激活 |
| 焦点 | Roving tabindex，只有当前焦点 Tab 进入页面 Tab 顺序 |
| 语义 | `tablist`、`tab`、`tabpanel` 及双向 ID 关联 |
| 样式 | 继承语义 Token；只暴露 `tablist`、`tab`、`tabpanel` Parts |
| 生命周期 | 注册幂等；监听器只绑定当前 Shadow Tree；Adapter 卸载时清理 |
| 兼容性 | 新增可选 Property/Event 属于 Minor；删除或改语义属于 Major |
