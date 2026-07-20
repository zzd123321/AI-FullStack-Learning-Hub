---
title: 前端多租户、权限系统与企业级管理后台架构
description: 从可信租户上下文出发，理解租户隔离、RBAC/ABAC/ReBAC、权限投影、缓存与实时边界、批量命令、支持会话、审计和租户生命周期
outline: deep
---

# 前端多租户、权限系统与企业级管理后台架构

管理员先打开 Acme 租户的成员列表，立即切到 Beta。Acme 的慢请求在切换完成后返回，如果页面只把结果写进同一个 `members` Store，Beta 页面就会短暂显示 Acme 的员工邮箱。

这不是一个普通的“请求竞态”问题，而是租户隔离失败。即使后端 API 从未越权，错误的前端缓存键、旧 WebSocket 订阅、共享 IndexedDB 或迟到响应仍可能把数据展示给错误的用户上下文。

因此，多租户后台不能只在导航栏增加一个租户下拉框。**经过验证的 subject、tenant、policy version 和当前 generation 必须贯穿路由、请求、缓存、消息、批量任务与审计。** 本课从这条上下文链路出发，再逐步加入权限模型、管理表格、支持人员代操作和租户生命周期。

## 学习目标

完成本课后，你应该能够：

- 区分 Subject、Tenant、Membership、Role、Permission、Policy 与 Entitlement；
- 解释为什么 URL/Header 中的 tenant ID 只是目标声明，不是可信身份；
- 理解共享表、Schema/Database per Tenant 和 RLS 各自的隔离边界；
- 组合 RBAC、ABAC、ReBAC 与职责分离表达资源级授权；
- 设计经过运行时校验、带版本的前端 Authorization View；
- 隔离 Query Cache、本地存储、实时连接和迟到响应；
- 正确实现租户切换、菜单、路由、字段和行级能力；
- 设计“全选全部匹配结果”、异步批量命令和并发控制；
- 管理邀请、角色委派、平台管理员与支持会话；
- 用自动化攻击测试、审计和租户生命周期证明隔离有效。

## 从一条请求认识租户边界

假设 Alice 访问：

```http
DELETE /api/tenants/acme/members/user-42
```

服务端不能因为路径写着 `acme` 就相信请求属于 Acme。完整决策至少需要：

```text
已认证 Subject：Alice 是谁？会话是否仍有效？
        ↓
Membership：Alice 当前是否是 Acme 的 active member？
        ↓
Permission：她是否拥有 member:remove？
        ↓
Resource Scope：user-42 是否确实属于 Acme 和她可管理的团队？
        ↓
Business Constraint：能否删除自己、最后一个 Owner 或受保护成员？
        ↓
最新 Policy / Environment：策略版本、风险、再认证是否满足？
```

任何一步不满足都应该默认拒绝。前端可以提前预测结果、解释原因，但服务端必须在每个请求上使用可信属性重新决策。

### 先统一领域词汇

| 概念 | 含义 | 示例 |
| --- | --- | --- |
| Subject | 发起动作的身份 | 用户、服务账号、支持人员 |
| Tenant | 数据、策略、配额与生命周期隔离边界 | Acme 公司 |
| Membership | Subject 与 Tenant 的关系及状态 | Alice 是 Acme Active Member |
| Role | 便于运营分配的一组权限 | Billing Admin |
| Permission | 对资源类型执行业务动作的能力 | `invoice:approve` |
| Policy | 综合主体、资源、动作与环境的决策规则 | 只能审批自己部门之外的发票 |
| Entitlement | 套餐或合同给予 Tenant 的产品能力 | 企业版可以导出审计日志 |

“Acme 购买了审计导出”只说明 Entitlement；“Alice 可以导出 Acme 审计”还需要 Active Membership、具体 Permission、资源范围和可能的 recent authentication。套餐开关与人员授权不能合并成一个 `canExport` 布尔值。

### 路由中的 tenant ID 只是用户请求

`/t/acme/members`、`X-Tenant-ID: acme` 或 `acme.example.com` 都能被客户端构造。可信流程是：认证 Session 返回或服务端查询当前有效 Membership，路由 ID 只用于从中选择目标；API 仍在每次请求中验证 Membership 与资源归属。

<<< ../../../examples/frontend/multi-tenant-admin-architecture/tenant-context.ts

示例先运行时校验 `/session` 中的 Subject、Membership、状态和策略版本，拒绝重复/畸形租户，再只解析 Active Membership。Suspended 租户不会因为用户还保留旧页面就重新变成可访问。

Token 内的 Membership Claim 也可能陈旧。高风险请求应查询或使用能及时撤销的最新服务端事实，而不是把登录时的长期 JWT 当永久成员关系。

## 多租户隔离必须覆盖每一层

多租户的数据库拓扑通常有三类：

- 共享数据库、共享表，以 `tenant_id` 分区；
- 共享数据库、Schema per Tenant；
- Database per Tenant；
- 大型系统还会按风险、地区或规模采用混合模式。

独立数据库能缩小某些误查询和运维爆炸半径，却不自动修复错误路由、共享缓存或平台管理员越权；共享表也不必然不安全，但必须把 Tenant Scope 强制带入每次读写。

### Tenant Scope 不是可选筛选条件

危险查询：

```sql
SELECT * FROM documents WHERE id = :document_id;
```

更安全的基本形态：

```sql
SELECT * FROM documents
WHERE tenant_id = :verified_tenant_id
  AND id = :document_id;
```

Repository/API 应从已经验证的请求上下文获得 Tenant，而不是让每个调用者随手传一个可选参数。资源使用随机 ID 可以降低枚举，但不能替代对象级授权。

同一维度还要进入：

- Redis/CDN/Service Worker Cache Key；
- 对象存储 Path、下载签名和加密密钥；
- 搜索索引与向量集合；
- 队列消息、定时任务、Webhook 和导出文件；
- 日志、Trace、配额和 Rate Limit；
- SSE/WebSocket Subscription。

一个遗漏点就可能成为跨租户数据通道。OWASP 的多租户指南同样强调从已认证会话派生上下文、资源查询同时包含 tenant ID，并隔离 Cache、Storage 和异步任务。

### Row-Level Security 是纵深防御

PostgreSQL RLS 等数据层策略可以让即使应用遗漏过滤条件，普通数据库角色也只看到允许行。启用 RLS 且没有适用策略时，PostgreSQL 使用默认拒绝；`USING` 约束可见旧行，`WITH CHECK` 约束新写入行。

但 RLS 不是“一开就结束”：Superuser、`BYPASSRLS` 角色和通常情况下的表 Owner 可以绕过；Owner 需要时使用 `FORCE ROW LEVEL SECURITY`。策略组合、Security Definer、View、外键/唯一约束和并发子查询也可能产生意外行为。生产连接角色、Migration/Backup 路径和策略回归测试都必须审计。

应用层资源授权与数据层 RLS 应互相补强，而不是把所有业务决策塞进一条难以验证的 SQL Policy。

### Noisy Neighbor 也是隔离失败

一个 Tenant 的全量导出、复杂搜索或错误重试如果耗尽线程、内存和队列，会影响其他 Tenant 的可用性。按 Tenant 设计并发、配额、Job 队列和成本观测；高风险 Tenant 可以使用独立资源池或加密密钥。

## 权限模型从角色开始，但不能停在角色

### RBAC 解决“怎样方便地分配”

RBAC 把 Permission 放进 Role，再把 Subject 的 Membership 关联 Role。业务组件依赖稳定动作，例如 `member:remove`，而不是散落：

```vue
<!-- 角色名称渗入页面后，策略一变就到处漂移 -->
<button v-if="user.role === 'admin' || user.role === 'owner'">删除</button>
```

Role 是管理工具，不应该成为每个页面的业务协议。角色层级还要防循环和意外继承；“能否委派”与“自己拥有”也不是同一权限。

### ABAC/ReBAC 说明“对哪一个资源”

拥有 `member:remove` 不代表可以删除所有成员。NIST 对 ABAC 的定义包含 Subject、Object、Operation 和可选 Environment Attribute：部门、资源 Tenant/Owner/Status、时间、设备 Assurance 或风险都可以参与决策。

ReBAC 更适合“项目成员”“文档所有者”“直属经理”等关系。常见组合是：

```text
RBAC：Alice 拥有 member:remove
ABAC：目标成员属于 Alice 可管理的 team
ReBAC：Alice 与目标项目存在 manager 关系
业务约束：不能删除自己或最后一个 owner
```

这些属性必须来自服务端可信资源。浏览器提交的 `ownerId`、`teamId` 或 `risk=low` 只是定位/输入，不能直接成为授权事实。

### 职责分离限制权限组合

财务、发布和高风险审批常要求申请人与审批人不同，或同一人不能同时拥有创建供应商和付款权限。静态职责分离限制角色组合，动态职责分离限制一次流程中的实际参与者。

服务端在 Role 保存、成员赋权和业务动作时都要检查，不能只靠角色编辑器隐藏 Checkbox。高风险 Role 变更可以要求双人审批、recent authentication、MFA 和生效延迟。

## 前端拿到的是权限投影，不是策略引擎

浏览器通常不需要下载完整策略。服务端可以返回当前 Tenant 的有限 Authorization View：Permission 集、必要资源范围、Policy Version 和稳定 Reason Code。

<<< ../../../examples/frontend/multi-tenant-admin-architecture/authorization.ts

示例把 JSON Array 校验后转成 Set，绑定预期 Tenant，并限制未知 Permission 和 Team 数量。`canRemoveMember()` 先检查 Tenant，再检查 Permission、Scope 与 Self Action，避免后续错误理由泄露另一租户资源的属性。

这仍只是 UI 预测。服务端必须使用最新 Subject、Membership、资源和 Policy 重复决策。Authorization View 的用途是：

- 决定菜单是否显示或说明升级；
- 决定字段只读、按钮禁用与原因文案；
- 避免用户发出必然失败的操作；
- 让 403 后刷新能力投影并恢复界面。

### Deny by Default 与每请求检查

新页面、新 API 或未识别动作不应因为“没有匹配拒绝规则”而通过。默认拒绝，只有明确 Policy 允许才执行。OWASP 授权指南强调每个请求、具体对象都要检查，因为攻击者只需要找到一个遗漏入口。

GraphQL Resolver、批量 API、导出、文件下载和后台 Job 都是入口。只在路由 Middleware 检查 `role=admin`，而不检查具体对象，并不能防止 BOLA/IDOR。

### Policy Version 处理撤权和变化

权限不是登录后永不改变的 Claim。Membership Suspended、Role 被移除、策略发布或合同到期后，旧页面会陈旧。

Authorization View 带 `policyVersion`。变更可以通过短期重新获取、SSE/WebSocket 失效提示或 Session Refresh 传播。写请求可携带 `expectedPolicyVersion`：版本落后时服务端拒绝并要求刷新，但无论客户端传什么，服务端都使用最新 Policy 授权。

401 表示认证失效；403 表示当前身份有效但动作不允许。403 不应该无限跳登录，而应刷新 View、清理已不可访问的数据并显示稳定原因。

## 让 Tenant Scope 贯穿前端运行时

### Query 与 Storage Key 至少包含 Subject 和 Tenant

`['members']` 会让 Tenant 切换直接命中旧 Cache。敏感 Query Key 通常包含 Subject、Tenant、Policy/Entitlement Version、当前 Generation 和查询参数：

<<< ../../../examples/frontend/multi-tenant-admin-architecture/query-keys.ts

Generation 让“切到 Beta 再切回 Acme”也不会自动接受第一次 Acme 会话的在途响应。是否保留旧的安全 Cache 是产品取舍，但任何复用都必须重新验证 Subject、Membership 和 Policy。

本地 UI 偏好也包含 Subject/Tenant，避免共享设备账号切换后复用。成员、财务和审计数据不应默认长期放 localStorage；需要离线时，IndexedDB/Cache Storage 使用独立 Namespace、设备策略、清理与撤销生命周期。

前端 Query Key 不能修复 CDN 混租户。HTTP Cache 的 `private`、`Vary`、Cache Key 和 Service Worker Handler 也必须逐层验证，带认证的租户数据不能误入公共缓存。

### 租户切换是一笔边界事务

只改 `currentTenantId` 会留下旧请求、Store、WebSocket 和缓存。正确顺序是：

1. 先让旧 Generation 失效；
2. Abort 旧请求并关闭实时订阅；
3. 清理敏感 Cache，失败时不要进入新 Tenant；
4. 重置领域 Store；
5. 激活新 Tenant Scope 并导航；
6. 每个响应/消息应用前再次核对 Subject、Tenant 与 Generation。

<<< ../../../examples/frontend/multi-tenant-admin-architecture/tenant-switch.ts

Abort 只能尽力取消。旧响应可能已经完成，所以 `TenantScopeCoordinator.accepts()` 才是最后的写入门。新导航失败时示例再次 Invalidate，避免留下“URL 在旧页面、全局 Scope 却是新租户”的混合状态。

如果存在未保存表单，应在真正切换任何全局状态之前询问用户。一旦用户确认，再按完整事务切换，不能在对话框等待期间先更新一半 Scope。

### 实时消息同样要带 Scope 与 Version

WebSocket/SSE 在服务端按已认证 Subject 和 Tenant 建立 Subscription。消息只发送资源 ID、Version 和安全摘要；客户端检查 Tenant、Subscription Generation 和资源 Version 后使 Query 失效或应用快照。

收到 `role.updated` 不能让浏览器自行合成更高权限，只能重新拉取 Authorization View。页面从后台或 bfcache 恢复时也重新确认 Scope。

## 企业表格的难点是集合语义

成员、账单、审计通常由服务端搜索、筛选、排序与 Cursor Pagination。虚拟滚动只减少 DOM 节点，不会减少网络、数据库和授权成本。

稳定查询需要：明确 Filter Schema、确定排序 Tie-Breaker、Cursor/Query Version、URL 中可分享但不敏感的查询状态，以及服务器返回的总数语义。Offset 在数据持续变化时可能重复/漏项，Cursor 更适合稳定翻页。

### “全选”至少有三种含义

- 当前页 50 条；
- 当前浏览器已经加载的 300 条；
- 当前筛选条件匹配的全部 12,430 条。

第三种不能把所有 ID 拉到浏览器。服务端签发短期 Query Token，绑定 Subject、Tenant、Filter、Sort、Query Version 和过期时间；前端只保存 Token 与少量排除 ID。

<<< ../../../examples/frontend/multi-tenant-admin-architecture/bulk-selection.ts

示例限制显式 ID/排除数量，校验 Count 和 Token，并生成稳定排序的 JSON Command。服务端仍要验证 Token 签名/存储、期限、当前 Membership、Policy Version，以及每个对象是否仍可操作。

确认文案必须说“将影响 12,430 个匹配成员”，而不是“已选 50 行”。还要说明集合是创建 Token 时的快照，还是执行时重新匹配；两种都合理，但结果和审计完全不同。

### 大批量写入应该创建 Job

禁用上万成员、导出或迁移不要保持一个 HTTP 请求直到完成。前端用 Operation ID、Tenant、Expected Policy Version 和 Selection 创建 Job，服务端返回：

```text
queued → running → succeeded
                   ↘ partially_failed / failed
running → cancel_requested → canceled
```

取消一般表示停止未开始项，不能承诺回滚已经完成的动作。逐项失败通过分页或有权限、短期的下载报告提供。Job 创建和消费者都要幂等，Tenant 有并发/资源配额。

### 并发编辑需要 Version/ETag

多人同时编辑 Role、成员或配置时，响应携带 Version/ETag，写请求使用 `If-Match` 或 Expected Version。409/412 表示冲突，应展示变化并让用户刷新/重做，不能 Last Write Wins 静默覆盖。

字段 Disabled 也不等于字段级授权。服务端使用明确 Command DTO，只接收允许字段，并对每个字段执行最新策略，防止 Mass Assignment。动态表单 Schema 只引用 Allowlist 组件和规则，不能把后端字符串当 Vue/React/HTML 执行。

## 成员、角色和平台权限都有生命周期

### 邀请不只是一个可转发链接

邀请绑定 Tenant、目标身份、预期 Role、邀请人、期限与一次性 Token。接受时验证当前登录身份是否符合邀请目标；否则转发链接可能让错误账号加入。

Membership 可以是 invited、active、suspended、removed。移除后撤销相关 Session/API Key、停止后台任务并使权限投影失效。重新邀请不能意外恢复旧高权限和私有关系。

“最后一个 Owner”“唯一 Billing Admin”等约束必须用服务端事务保证。两个管理员同时删除对方时，前端按钮禁用无法保护不变量。

### Role Editor 展示影响，不替代服务端约束

角色页面应显示 Permission 的业务含义、风险等级、继承来源、冲突和影响人数。保存前展示 Diff，例如“新增 `billing:write`，影响 28 名成员”，比完整 JSON 更适合审核。

服务端检查未知 Permission、循环继承、职责分离、越权委派和最后 Owner。管理员不能因为自己拥有某能力，就默认有权把它授予任何人。

### 平台控制面不是一个超级 Tenant Role

平台运维与租户管理员属于不同控制面。平台入口应使用更强认证、短期授权、明确工单/理由和严格审计，不把 `platform_admin` 混入普通 Tenant Role。

即使平台人员也不默认拥有全租户搜索。Break-glass 访问要限定 Tenant、资源范围和时间，要求审批/告警，并在结束后撤销。

## 支持人员代操作必须保留两个身份

错误做法是把 Session 中 `userId` 替换为客户 ID。这样审计只看到“客户修改了设置”，真实 Support Actor 消失，也很难限制哪些动作是代操作允许的。

正确上下文同时保留：

```text
actor = support_17
represented_subject = customer_42
tenant = acme
support_session = support_session_9
reason = ticket-123
expires_at = ...
allowed_actions = [...]
```

<<< ../../../examples/frontend/multi-tenant-admin-architecture/support-session.ts

示例对服务端返回的支持会话运行时校验，页面持续显示真实 Actor 和被代表用户。Action 使用明确 Allowlist；退款、Secret、MFA Reset、删除 Tenant 等能力即使 Support Session 请求了也在 UI 投影中永久阻止。

前端仍不是最终控制：服务端每次请求验证 Support Session 未过期、Tenant/Represented Subject 匹配、Action 已委派，并记录双身份。默认只读，升级到受控操作需要额外审批；用户可以看见或在政策允许时获知访问记录。

## 高风险操作和租户生命周期需要可追溯状态

删除 Tenant、轮换 Secret、大规模撤权和权限提升都需要：准确对象名、影响范围、不可逆说明、recent authentication、权限/职责检查、Operation ID 和审计。输入租户名只是防误触，不是安全授权。

### 删除不是一个瞬间

Tenant Offboarding 可以是：

```text
active → suspended → deletion_scheduled → deleting → deleted
                         ↘ canceled during grace period
```

服务端定义导出窗口、写入冻结、Session/Key 撤销、Job/Integration 停止、数据保留、备份和法务 Hold。前端展示服务端状态，不能一个 200 后就声称所有副本已经物理删除。

Onboarding 同样是可重试 Workflow：创建默认策略、首位 Owner、密钥、配额、区域、域名和集成。Provisioning 未完成时不要进入半配置控制台。

区域迁移、数据 Residency 和 Tenant 合并是独立高风险 Job，需要 Freeze/Dual-write 策略、校验、回滚边界和持续审计。

### 审计回答的不只是“修改成功”

一条有用的审计事件至少回答：

- 真实 Actor 和 Represented Subject；
- Tenant、资源类型/ID 与 Action；
- 时间、Session/Support Session、Correlation ID；
- Before/After Diff 或安全摘要；
- Policy Version、Decision 与 Reason Code；
- Operation/Job ID 和最终结果。

审计存储要防篡改、限制读取、遵守保留/隐私规则。普通应用日志不能替代审计；日志也不要保存另一租户的敏感资源内容。

## 用攻击路径验证隔离，而不是只测正常页面

### 可运行示例

<<< ../../../examples/frontend/multi-tenant-admin-architecture/admin-runtime.test.ts

示例验证了：

- `/session` Membership 和 Authorization View 先做运行时校验；
- Unknown/Suspended Tenant 与重复 Membership 失败关闭；
- 授权先检查 Tenant，再判断 Permission 和 Team Scope；
- Query/Storage Key 同时隔离 Subject、Tenant、Policy/Entitlement 和 Generation；
- 租户切换后旧 Generation 的响应被拒绝；
- All-matching Selection 校验 Count、Token 和命令上下文；
- 支持会话保留真实 Actor，高风险 Action 始终阻止且过期失败关闭。

### 服务端安全测试直接修改每个边界

浏览器 E2E 只能证明 UI 没有暴露入口，不能证明 API 安全。自动化测试应该以 Tenant A 用户身份：

- 修改 URL、Header、GraphQL ID 和嵌套 Resource ID 指向 Tenant B；
- 对 List、Detail、Create、Update、Delete、Export、File Download 分别测试；
- 操作 Suspended/Removed Membership 和刚撤权的 Session；
- 使用同名 Cache Key、对象存储路径和 Search Filter 尝试串租户；
- 伪造/过期 Query Token、Expected Policy Version 和 Job ID；
- 测试 RLS 的普通角色、Owner、Security Definer/View 和 Backup 路径；
- 在 Tenant 切换、bfcache、WebSocket 重连和迟到响应中检查 UI；
- 尝试越权委派、删除最后 Owner、绕过职责分离和 Support Allowlist。

每个新 API 都要有对象级授权测试。安全回归不能依赖开发者记得给某个 Controller 手工补测试，最好由契约/资源矩阵自动生成基础用例。

### 可访问性与大数据量一起验收

企业表格优先使用语义化 Table + 分页。只有确实需要二维单元格编辑时才实现 ARIA Grid，并完整支持键盘导航、焦点和选择语义。虚拟化列表还要处理读屏顺序、焦点移出窗口和动态行高。

Permission Denied、部分失败、批量进度和租户切换都有文本状态。全选文案明确作用集合；Dangerous Action 不只靠颜色；Support Banner 持续可见且可聚焦。

性能测试按 Tenant 数据分布覆盖查询、Cursor、虚拟化和 Job，而不是把十万行 JSON 拉到浏览器后测渲染。

### 观测隔离与撤权速度

日志和 Trace 使用**已验证**的 `subjectId/tenantId/representedSubjectId/policyVersion/resource/action/decision/reasonCode/correlationId`。不要从用户 Header 原样复制 Tenant 字段后就标成可信标签。

监控跨租户拒绝、403 激增、撤权传播延迟、Support Session、Break-glass、Job Backlog、Cache Scope Mismatch、Noisy Neighbor 和 Offboarding 停滞。Tenant ID 高基数需要采样/聚合策略，但安全事件仍能关联到具体租户。

### 常见错误为什么会发生

#### 把 tenant ID 当作授权证据

路径和 Header 只说明客户端想访问谁。服务端必须把目标与已验证 Membership、资源 Tenant 同时匹配。

#### 隐藏菜单就认为 API 安全

用户能直接构造请求。Menu、Route、Button 都只是体验投影，服务端每请求默认拒绝并明确授权。

#### 切换 Tenant 只更新一个 Store 字段

旧 Cache、Request 和 WebSocket 仍在运行。必须 Invalidate Generation、Teardown 旧 Scope，再激活新上下文。

#### Query Key 只有 tenant ID

共享设备账号切换、撤权和重新进入时仍可能复用旧数据。Subject、Policy/Generation 与查询参数同样重要。

#### “全选”实际只操作当前页

用户认为处理全部筛选结果，服务端只收到 50 个 ID。使用绑定查询的 Token，并明确快照/执行时集合语义。

#### 支持冒充直接覆盖 userId

真实 Actor 消失，权限边界和审计都失真。请求上下文必须同时保留 Actor 与 Represented Subject。

#### RLS 开启后停止应用层授权

RLS 可能被 Owner/特权角色绕过，也不适合表达所有业务 Action。它是数据层纵深防御，不是唯一策略层。

### 渐进落地路线

先建立经过验证的 Session/Membership 和请求级 Tenant Context，让 Repository 查询、Cache、Storage、Queue 和日志都显式绑定 Tenant，并补上对象级授权测试。

随后统一 Permission/Authorization View，加入 Policy Version，让 Menu、Route、字段和行 Action 使用同一 Capability API。前端实现 Subject/Tenant/Generation Query Key 与完整租户切换事务。

再建设 Cursor Query、All-matching Token、异步 Bulk Job、ETag/Expected Version、邀请与 Role Lifecycle。最后加入职责分离、Platform Control Plane、Support Session、Break-glass、租户生命周期和持续隔离/灾难演练。

### 上线检查清单

- [ ] Tenant Context 来自已认证 Membership，URL/Header 只声明目标；
- [ ] 新资源和未知动作默认拒绝，每个 API 对具体对象授权；
- [ ] 查询使用 `tenant_id + resource_id` 或等价强制 Scope；
- [ ] Cache、Storage、Search、File、Queue、Job、Webhook 和日志都带 Tenant；
- [ ] RLS/Schema/Database 隔离的 Owner、Bypass、Backup 和策略组合已测试；
- [ ] RBAC 管理 Permission，ABAC/ReBAC/业务约束收紧资源范围；
- [ ] Entitlement 与人员授权分开，职责分离由服务端保证；
- [ ] Authorization View 运行时校验、带 Policy Version 且能及时撤权；
- [ ] Menu/Route/Button 只作体验预测，不替代服务端授权；
- [ ] Query Key 包含必要 Subject、Tenant、Policy/Entitlement/Generation 和参数；
- [ ] 租户切换先 Invalidate，再取消请求、关闭实时、清 Cache 和重置 Store；
- [ ] 每个响应/实时消息验证 Subject、Tenant、Generation 与 Version；
- [ ] All-matching 使用短期绑定 Query Token，并准确说明集合语义；
- [ ] 大批量操作使用幂等 Job，支持部分失败、取消和结果报告；
- [ ] 写操作使用 ETag/Expected Version，字段 Command 明确且逐字段授权；
- [ ] 邀请、最后 Owner、Role 委派和职责分离有事务约束；
- [ ] Platform Admin、Break-glass 与 Support Session 是独立短期控制面；
- [ ] 支持会话始终保留 Actor/Represented Subject，并默认限制高风险动作；
- [ ] 审计包含双身份、Tenant、Diff、Policy、Decision、Operation 和结果；
- [ ] Onboarding/Offboarding、保留/删除、配额和 Noisy Neighbor 有恢复流程；
- [ ] 跨租户恶意请求、Cache 污染、撤权竞态和 RLS Bypass 持续自动测试。

## 总结

多租户后台的核心不是更复杂的菜单，而是一条不会丢失的安全上下文：

- Subject 通过 Active Membership 进入 Tenant，客户端 tenant ID 只负责选择目标；
- Tenant Scope 贯穿数据库、Cache、Storage、Queue、文件、实时连接与日志；
- RBAC 便于分配，ABAC/ReBAC 与业务约束决定具体资源，默认拒绝；
- Authorization View 帮助 UI 预测，Policy Version 和服务端每请求检查处理变化；
- Subject + Tenant + Generation 隔离 Cache 与迟到响应，切换租户是一笔边界事务；
- Query Token 表达全部匹配集合，Bulk Job 和 Version 保护大规模并发修改；
- Platform/Support 控制面保留真实 Actor、短期范围和完整审计；
- 自动攻击测试、RLS 纵深防御和租户生命周期共同证明隔离，而不是依赖页面看起来正确。

下一节：[前端复杂表单、审批工作流与低代码配置架构](./frontend-complex-forms-approval-workflow-and-low-code-architecture.md)，会把本课的字段权限、并发版本、职责分离和异步命令继续应用到动态表单、审批状态与配置化渲染。

## 参考资料

- [NIST：Role-Based Access Control](https://csrc.nist.gov/Projects/Role-Based-Access-Control)
- [NIST SP 800-162：Guide to Attribute Based Access Control](https://csrc.nist.gov/pubs/sp/800/162/upd2/final)
- [OWASP：Multi-Tenant Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html)
- [OWASP：Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP：Insecure Direct Object Reference Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html)
- [PostgreSQL：Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [MDN：HTTP Conditional Requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Conditional_requests)
- [WAI-ARIA APG：Grid Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/)
