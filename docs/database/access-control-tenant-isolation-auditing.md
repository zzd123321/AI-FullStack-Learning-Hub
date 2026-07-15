---
title: 数据库权限、租户隔离与审计
description: 从接口身份到数据库角色建立最小权限，理解凭据、TLS、SQL 注入、PostgreSQL RLS、MySQL 行级隔离边界、审计、敏感数据和 break-glass
prev:
  text: 数据库变更、在线 DDL 与安全发布
  link: /database/schema-migrations-online-ddl
next:
  text: 数据库容量规划、SLO 与压测
  link: /database/capacity-planning-slo-load-testing
---

# 数据库权限、租户隔离与审计

后端已经验证用户能访问租户 42，不代表数据库查询一定安全。漏写一个 `tenant_id` 条件、把排序字段直接拼进 SQL、让应用账号拥有 DDL 权限，或者在连接池复用时遗留上一请求的 session 上下文，都可能越过接口层保护。

数据库安全需要多层共同成立：网络限制谁能连接，认证确认数据库身份，授权限制它能做什么，查询和行级策略限制它能访问哪些数据，审计记录关键行为，备份与密钥保护离线副本。任何单层都不是完整答案。

本课从接口用户、租户、服务账号和数据库角色的映射开始，建立最小权限与职责分离，再讲参数化查询、凭据轮换、TLS、PostgreSQL Row-Level Security、MySQL 行级隔离方案、审计、敏感数据与紧急访问。

## 先建立威胁模型

至少考虑以下入口：

- 外部用户通过 SQL 注入读取或修改数据。
- 合法用户利用漏掉租户条件的接口读取其他客户数据。
- 应用容器被攻陷，数据库凭据被盗。
- 内部人员、运维脚本或 BI 工具拥有过大权限。
- migration/backup 账号被应用误用。
- 数据库网络被监听或连接到了伪造服务端。
- 慢查询、错误日志、审计日志泄露参数或个人数据。
- 备份、快照、CDC、缓存和测试数据绕过在线权限。
- 表 owner、superuser 或安全函数绕过行级策略。

先说明要防谁、保护什么、可接受什么运维成本，才能选择控制。把所有账号都改成只读会让业务无法写；给应用 superuser 虽然“不会权限报错”，却把一次注入升级为整个集群失陷。

## 认证、授权与业务身份不是一回事

```text
终端用户 Alice
  ↓ OAuth/session 验证
应用身份 order-api
  ↓ 数据库认证
数据库登录角色 app_orders_runtime
  ↓ 查询上下文
tenant_id = 42, user_id = Alice, request_id = ...
```

- **终端用户身份**决定接口是否允许 Alice 操作某个资源。
- **服务身份**决定哪个 workload 可以建立数据库连接。
- **数据库角色**决定该连接可访问哪些 schema/table/function。
- **租户上下文**决定共享表中允许看到哪些行。

连接池通常让许多终端用户共享少量数据库连接，所以数据库看到的往往是服务角色，而不是每个 Alice/Bob 对应一个数据库账号。不要假装数据库账号天然等于终端用户；需要可靠地把已认证的租户上下文传入查询或受控 session，并在日志中关联 request ID。

## 最小权限从职责拆分开始

推荐把角色按能力而不是按人员临时创建：

| 角色 | 典型权限 | 不应拥有 |
| --- | --- | --- |
| runtime-readwrite | 指定表 SELECT/INSERT/UPDATE，执行指定函数 | DDL、GRANT、用户管理、任意文件访问 |
| runtime-readonly | 指定视图/表 SELECT | 写入、DDL |
| migration | 目标 schema 的受控 DDL | 日常应用登录、全局管理员 |
| backup | 执行备份所需读取/复制能力 | 业务写入、删除备份 |
| replication | 复制协议所需能力 | 普通业务表任意写入 |
| monitoring | 读取必要状态/指标 | 敏感业务行、账号管理 |
| object-owner | 拥有对象，通常 NOLOGIN | 被应用直接使用 |
| break-glass | 临时高权限，审批后启用 | 常驻应用凭据 |

对象 owner 与登录角色分离很重要。应用若拥有表，可能天然获得超出普通 GRANT 的能力；PostgreSQL 表 owner 默认还可绕过该表的 RLS。让 NOLOGIN owner 持有对象，migration 经受控角色切换管理结构，runtime 只获明确 DML 权限，边界更清晰。

### 避免全局通配授权

`database.*` 或整个 schema 的广泛权限会自动包含后来新增的敏感表。优先按业务 schema 与对象集合授权，并定义新对象的 default privileges/授权自动化。

每次权限变化都应经过代码评审和漂移检查。手工 GRANT 后忘记写入声明，会让灾难恢复的新环境权限不同于生产。

### WITH GRANT OPTION 与角色管理

能使用权限和能转授权限是两种能力。runtime 不应拥有 `GRANT OPTION`、创建用户/角色或切换到高权限角色的成员资格。

PostgreSQL 的 role membership、`INHERIT` 与 `SET ROLE` 会影响有效权限；MySQL 角色还涉及 default/active role。只创建角色但未激活，或误把管理员角色设为默认，都会让审计结果与预期不同。诊断应查看当前 effective/active roles，而不只看定义。

## 应用账号不应是管理员或 owner

应用运行时不需要：

- 创建、删除或修改表。
- 创建用户、授予权限。
- 终止其他会话、修改全局配置。
- 读取所有系统表、服务器文件或任意备份。
- 绕过 RLS、复制或审计策略。

把 migration 和 runtime 分离后，代码注入最多作用于 runtime 已获对象；它仍然严重，但 blast radius 小得多。migration 凭据只在部署任务短时可用，不进入应用环境变量。

## 凭据生命周期

### 不把秘密写进代码和日志

数据库密码、客户端私钥和 token 应由 secret manager/workload identity 在运行时提供。注意连接 URL 会被异常、进程列表、APM 或启动日志完整打印；使用驱动的独立字段或受控 DSN 脱敏。

日志只能记录 secret version/credential ID，不记录值。错误处理中也不要回显完整连接字符串。

### 短生命周期优于永久密码

若平台支持短期 token、证书或工作负载身份，泄露窗口更小，但客户端必须处理过期：

- 新建连接使用新凭据。
- 旧连接在有界窗口排空。
- token 刷新失败不应无限重试压垮认证服务。
- 连接池要知道凭据版本，轮换后淘汰旧连接。

### 双凭据轮换

永久密码轮换常用重叠窗口：

```text
创建/启用 secondary credential
→ 应用刷新 secret 并建立新连接
→ 观察旧凭据连接归零
→ 撤销 primary/旧凭据
→ 将新凭据设为稳定版本
```

MySQL 支持 dual passwords 等密码管理能力，但具体云平台/代理可能有自己的机制。轮换必须验证实际新连接，而不是仅确认 secret manager 中的值已更新。

## 网络与 TLS：加密还要验证身份

数据库端口应只允许应用、运维跳板、备份和复制网络访问；不要把“有密码”当作公网暴露理由。安全组、防火墙、私网和数据库认证是叠加控制。

TLS 有两个目标：

1. 防止链路内容被窃听或篡改。
2. 验证连接的服务端确实是目标数据库。

只要求加密但不验证 CA/主机名，仍可能连到持有其他证书的错误或恶意节点。MySQL 客户端应采用能验证 CA 和 identity 的模式（例如目标环境支持的 `VERIFY_IDENTITY`），PostgreSQL/libpq 对应 `sslmode=verify-full`。证书主机名、代理地址和故障切换 DNS 必须纳入设计。

服务端也可按账号/连接规则强制 TLS。MySQL 账号可使用 `REQUIRE SSL/X509` 等限制；PostgreSQL `pg_hba.conf` 的 `hostssl` 只匹配 SSL 连接，但还必须启用 server SSL，且规则按“第一条匹配”决定，没有失败后继续匹配下一条的回退。

## SQL 注入的边界

### 值使用绑定参数

危险写法：

```js
const sql = `SELECT * FROM orders WHERE tenant_id = ${tenantId}`;
```

正确方向：

```js
const sql = `
  SELECT id, state_code
  FROM orders
  WHERE tenant_id = ? AND id = ?
`;
await db.execute(sql, [tenantId, orderId]);
```

PostgreSQL 驱动常用 `$1`、`$2`；MySQL 常用 `?`，以实际驱动为准。参数绑定让值按协议传递，而不是成为 SQL 语法。

### 标识符不能普通绑定

列名、排序方向、表名通常不能作为 value parameter。列表接口的 `sort` 应映射到服务端 allowlist：

```text
"createdAt" → created_at
"amount"    → amount_cents
"desc"      → DESC
```

未命中立即拒绝，不能把客户端字符串直接拼接，也不要仅靠替换引号自制 escaping。

### 参数化不解决授权

下面没有注入，但仍越权：

```sql
SELECT id, amount_cents FROM orders WHERE id = ?;
```

若 ID 属于其他租户，参数化不会自动阻止读取。查询必须带已认证 `tenant_id`，并可由 RLS/视图作为额外保护。

### 动态 SQL 与存储函数

存储过程中的 dynamic SQL 同样需要安全格式化。PostgreSQL `SECURITY DEFINER` 函数以 owner 权限执行，必须固定安全 `search_path`、限定可执行者、schema-qualify 对象并避免用户可控对象遮蔽；否则低权限用户可能劫持函数解析路径。

## 多租户隔离的三种模型

### 独立数据库/实例

每个租户独立库，隔离和定向恢复较清晰，但连接、迁移、成本和跨租户运营复杂。

### 独立 schema

同一实例不同 schema，权限可按 schema 分隔；仍共享实例资源，schema 数量和迁移会增长。动态设置 `search_path` 不能成为唯一隔离边界。

### 共享表 + tenant_id

运营最简单、资源利用率高，但每张业务表、唯一键、JOIN、索引和查询都要携带租户维度：

```sql
PRIMARY KEY (tenant_id, id)
UNIQUE (tenant_id, external_key)
INDEX (tenant_id, created_at, id)
```

外键最好也包含 tenant_id，防止租户 42 的子行引用租户 7 的父行。仅依赖随机全局 ID 难猜，不是访问控制。

## 应用层租户条件

从认证 token/session 解析 tenant，而不是相信 body/query 中自报的 `tenant_id`：

```text
authenticated principal → allowed tenant membership → trusted tenant context
```

Repository API 可以强制接收 `TenantContext`，不暴露无租户版本：

```text
getOrder(context, orderId)
listOrders(context, cursor)
```

管理后台的跨租户读取使用独立方法、角色和审计，而不是给普通 API 一个可选 `tenantId = null` 表示查询全部。

## PostgreSQL Row-Level Security

RLS policy 在数据库层按行限制 SELECT/INSERT/UPDATE/DELETE。启用 RLS 且没有适用 policy 时默认拒绝，是重要的 fail-closed 属性。

概念模板：

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_orders ON orders
  USING (tenant_id = current_setting('app.tenant_id')::bigint)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::bigint);
```

- `USING` 控制哪些既有行可见/可更新/可删除。
- `WITH CHECK` 控制新行或更新后的行能否进入该租户范围。

只有 SELECT policy 而漏掉写入检查，可能导致跨租户插入/改租户。具体 command、role、permissive/restrictive policy 组合必须显式评审。

### owner、superuser 与 BYPASSRLS

superuser 和带 `BYPASSRLS` 的角色绕过所有 RLS；表 owner 默认也绕过自己表的 RLS，除非对表启用 `FORCE ROW LEVEL SECURITY`。因此 runtime 不能是 owner，也不应拥有 BYPASSRLS。安全测试要用真实 runtime role，不要只用 postgres/owner 测试后得出结论。

`FORCE` 仍不约束 superuser/BYPASSRLS，不能把 RLS 当作对数据库管理员的绝对隔离。

### 连接池中的租户上下文

若用自定义 session setting 传 tenant，最安全的常见模式是：

```text
checkout connection
→ BEGIN
→ SET LOCAL app.tenant_id = trusted value
→ 执行业务 SQL
→ COMMIT/ROLLBACK
→ pool reset/归还
```

`SET LOCAL` 只在事务内生效，降低跨请求泄漏；但事务失败后仍要 rollback，连接归还前要验证 reset。transaction-pooling proxy 对 session state 有额外限制，必须在真实部署模式测试。

自定义 setting 本身不是可信认证源：普通会话可能有能力设置它。安全性来自“只有受控 runtime 能连库 + tenant 来自已认证中间件 + 查询/RLS + 最小权限 + 测试与审计”的组合。若应用已遭 SQL 注入，攻击者可能尝试改 session 上下文，因此 DB 角色、函数接口或更强身份映射仍很重要。

### RLS 的性能与语义

policy 谓词进入每次查询，`tenant_id` 必须在索引前缀和统计/查询设计中。复杂函数、子查询或跨表 policy 可能增加开销与死锁/一致性难度。

RLS 也存在错误、唯一约束、外键等侧信道和完整性检查边界；安全敏感设计应测试“看不见的行是否能通过冲突或错误被推断”。数据库升级时也要复核 planner 与 policy 行为。

## MySQL 的行级隔离边界

MySQL 8.4 角色和 GRANT 主要提供全局、数据库、表、列、存储程序等对象级权限，并没有与 PostgreSQL RLS 等价的通用 table policy 机制。

共享表租户隔离通常组合：

- 应用 repository 强制 tenant predicate。
- 复合主键/唯一键/外键包含 tenant_id。
- 仅授权访问受控 view 或 stored procedure。
- 管理路径使用独立账号与接口。
- 测试、审计和数据泄漏监控。

view 的 `WITH CHECK OPTION` 可限制通过可更新视图写入不满足条件的行，但如何安全绑定每个请求 tenant、definer/invoker 权限以及动态上下文仍需单独设计。不能把“建了一个 view”直接宣称为通用 RLS。

对隔离要求极高或不信任 workload 的场景，数据库/实例级隔离通常比在共享 MySQL 表上模拟复杂行策略更容易证明。

## 审计与普通日志不同

### 审计要回答谁、何时、做了什么

关键字段：

- 数据库认证身份与有效角色。
- 应用/service、client address、request/trace ID。
- 目标 database/schema/object 和操作类型。
- 成功/失败、错误类型、受影响行数。
- 权限变更、DDL、账号登录、导出与 break-glass 使用。

不要默认记录完整参数和结果集。密码、token、身份证、支付数据和医疗信息进入审计日志，会制造第二份更难管控的敏感数据库。使用语句 fingerprint、对象、操作和受控字段摘要。

### 审计日志要防篡改和丢失

- 异步发送到独立安全域，限制数据库管理员删除。
- 有缓冲、背压、磁盘满和发送失败策略。
- 时钟同步、完整性签名/不可变保留和访问审计。
- 明确保留期、法务冻结、隐私删除与查询权限。
- 定期验证规则确实覆盖目标事件。

审计系统故障时是 fail-open 继续业务还是 fail-closed 阻止敏感操作，应按风险分类；不能等磁盘满时临场决定。

### 产品差异

MySQL Enterprise Audit 是 MySQL Enterprise Edition 的商业插件能力，需安装并配置 filter；官方文档指出基于规则的过滤默认不会自动记录所有可审计事件，必须验证实际 filter。社区版/云服务的审计能力取决于发行版与平台。

PostgreSQL 核心提供连接、语句、时长和错误等日志配置，但“打开 `log_statement`”不自动成为完整、最小泄露、不可篡改的合规审计。可评估平台审计或扩展，并明确版本、覆盖、性能和失败语义。

## 敏感数据与加密

### 分类优先于加密

先知道哪些列是凭据、身份、财务、医疗、商业秘密，谁需要读取，保留多久。没有分类时，团队会把所有数据给同一账号，再试图用“磁盘加密”补救。

### at-rest、in-transit 与 field-level

- 存储/表空间加密保护丢失磁盘或快照，但运行中的数据库仍会解密给有权限查询者。
- TLS 保护传输，不限制查询权限。
- 字段/应用层加密可减少数据库管理员直接看到明文，但搜索、索引、轮换、密钥可用性和恢复更复杂。

加密不是授权替代品。密钥与数据放在同一账号、同一备份中，攻击者拿到该账号仍可全部读取。

密码应使用专用慢哈希算法和独立盐验证，不可逆加密后再解密比较。API token 通常存可验证摘要，只在创建时展示明文。

### 脱敏与非生产数据

生产 dump 复制到开发机是常见泄漏路径。非生产使用合成数据或不可逆、保持必要分布的脱敏数据；脱敏流程要覆盖 JSON、日志、附件和关联表，并验证无法通过 join 重新识别。

## Break-glass 紧急访问

紧急高权限账号应：

- 默认禁用或凭据分片保管，不进入普通 secret。
- 需要工单、原因、时间窗和双人审批。
- 使用强 MFA/短期凭据和独立安全通道。
- 记录完整会话与数据库审计事件。
- 到期自动撤销，并验证连接全部断开。
- 事后复盘执行内容和是否应自动化为低权限 runbook。

不要让 on-call 为解决权限故障长期共享 root/postgres 密码。紧急路径必须定期演练，否则真正事故时会发现凭据、证书或审批系统不可用。

## 权限变更与撤销的发布协议

授权也应 expand/contract：

```text
先授予新对象最小权限
→ 发布使用新对象的代码
→ 验证旧对象访问归零
→ 撤销旧权限
```

直接先 REVOKE 可能打断仍运行的旧实例。反过来，先广泛 GRANT 后忘记收回会留下永久权限膨胀。权限清单应检测 drift，并为临时授权设置自动到期。

撤销凭据后还要处理已建立连接：很多数据库在连接建立后不会因为 secret 被删就立即断开所有 session。需要识别连接、排空/终止策略和连接池重建。

## 可观测性与安全告警

### 身份与权限

- runtime 是否拥有 super/admin/owner/BYPASSRLS/GRANT OPTION。
- 活跃角色、角色继承和默认权限是否漂移。
- 长期未使用账号、无到期密码和通配 host/address。
- break-glass 启用、权限提升和角色切换。

### 连接与查询

- 非 TLS 或未验证身份的连接。
- 新 client address、异常时段、认证失败爆发。
- 跨租户拒绝、RLS policy violation 和无 tenant context。
- 大规模导出、异常受影响行数和高敏对象访问。

### 审计管道

- 最近成功发送水位、积压、丢弃和磁盘余量。
- filter/rule 覆盖测试与配置 checksum。
- 日志读取、保留变更和删除尝试。
- 审计事件能否与 request/trace 和部署版本关联。

告警要避免直接带敏感 SQL 参数；用 fingerprint、对象名、账号与事件 ID 跳转到受控调查系统。

## 示例说明

### 租户上下文与连接池模型

运行：

```bash
node examples/database/23-tenant-isolation-model.mjs
```

脚本只在内存中验证：

- 请求中的 tenant 必须由已认证 membership 推导。
- Repository 查询始终携带 tenant 占位参数。
- transaction-local context 在连接归还前清除，避免跨请求泄漏。
- 普通 runtime 受行策略约束，owner/bypass 角色为何危险。

### MySQL 8.4 只读诊断

`examples/database/23-mysql-security-posture.sql` 检查当前身份、TLS session、全局/表权限、active roles 与 audit plugin 是否存在，不创建账号或授权。

### PostgreSQL 18 只读诊断

`examples/database/23-postgresql-security-posture.sql` 检查 TLS、特权角色、RLS 表/policy、当前表权限和 `pg_hba_file_rules` 解析错误，不修改角色或策略。

## 上线检查清单

### 身份与网络

- 数据库仅对受控私网/workload/跳板开放。
- TLS 强制且客户端验证 CA 与 hostname/identity。
- 终端用户、服务身份、数据库角色和租户上下文边界清楚。
- secret 不进入源码、URL 日志、镜像和普通配置。
- 凭据轮换会验证新连接并排空旧池。

### 权限

- runtime、migration、backup、replication、monitoring 和 owner 分离。
- runtime 不是 owner/admin，不能 DDL、GRANT 或绕过行策略。
- 权限按对象/职责授予，GRANT OPTION 与角色继承受控。
- 新对象 default privileges 和 drift 检查自动化。
- 临时权限自动到期，撤销后处理现存连接。

### 查询与租户

- 所有值参数化，动态标识符使用服务端 allowlist。
- tenant 来自认证 membership，不信任客户端自报。
- 主键、唯一键、FK 和索引包含 tenant_id。
- 管理跨租户路径使用独立方法、角色和审计。
- 连接池在每次事务后 rollback/reset tenant context。

### RLS/隔离

- PostgreSQL RLS 使用真实 runtime role 测试 SELECT 与 WITH CHECK。
- runtime 非 owner/BYPASSRLS；需要时评估 FORCE RLS。
- 无 context、错误 tenant、连接复用、批处理和 replica 路径均测试。
- MySQL 不把对象角色误认为通用行级策略。
- 高隔离租户评估独立 database/instance。

### 审计与数据

- 登录、权限、DDL、导出、break-glass 和敏感对象访问可审计。
- 审计规则经过事件回放验证，管道失败和磁盘满语义明确。
- SQL/参数/结果按分类脱敏，审计存储独立且防篡改。
- 备份、CDC、缓存、日志和非生产数据纳入相同安全模型。
- 加密密钥与数据权限隔离，轮换和灾难恢复经过演练。

## 常见误区

### “数据库在私网，所以不需要 TLS”

私网减少暴露面，不保证链路或 DNS/代理不被误配。TLS 还要验证服务端身份。

### “使用参数化查询就没有越权风险”

参数化防止值变成 SQL 语法，不会自动添加 tenant 条件或验证资源所有权。

### “应用使用一个数据库账号，所以无法审计用户”

数据库账号代表服务；应用仍应传递受控 request/user/tenant 关联标识到审计管道，但避免记录敏感 token。

### “启用 PostgreSQL RLS 后 owner 也会被限制”

owner 默认可绕过，superuser/BYPASSRLS 也绕过。runtime 不应是 owner，并需按威胁模型评估 FORCE。

### “MySQL role 可以限制 tenant 行”

MySQL role 主要组合对象级权限，不是通用行级 policy。共享表仍要应用谓词、复合约束及受控 view/procedure 等组合保护。

### “打开所有 SQL 日志就是完整审计”

它可能泄露参数、造成巨大存储与性能压力，也未必防篡改或准确表达终端用户。审计需要规则、身份关联、保护和覆盖验证。

### “磁盘加密后管理员看不到明文”

数据库运行时会为有权限查询者解密。at-rest encryption 主要保护离线介质，不替代数据库授权或字段级保护。

## 本课小结

- 数据库安全由网络、认证、授权、查询、行级隔离、审计和数据保护共同构成。
- 终端用户、服务身份、数据库角色与租户上下文是不同层，连接池会复用服务账号。
- runtime、migration、backup、replication、monitoring 与 NOLOGIN owner 应职责分离。
- 参数绑定防注入但不防越权；tenant 必须来自认证 membership，动态标识符需 allowlist。
- PostgreSQL RLS 默认无策略即拒绝，但 owner、superuser、BYPASSRLS 有绕过边界，连接池 context 必须事务化清理。
- MySQL 没有等价通用 RLS，共享表隔离依赖应用谓词、复合键、受控对象和审计组合。
- TLS 必须同时加密并验证服务端身份；凭据应短期化、可轮换且不进入日志。
- 审计要关联身份、对象和操作，同时脱敏、防篡改并监控管道失败。
- 加密不替代授权，备份、日志、CDC、缓存和非生产副本都要纳入数据安全。
- break-glass 与权限撤销需要审批、到期、连接处理和完整审计。

## 官方资料

- [MySQL 8.4：Access Control and Account Management](https://dev.mysql.com/doc/refman/8.4/en/access-control.html)
- [MySQL 8.4：Using Roles](https://dev.mysql.com/doc/refman/8.4/en/roles.html)
- [MySQL 8.4：Password Management](https://dev.mysql.com/doc/refman/8.4/en/password-management.html)
- [MySQL 8.4：Encrypted Connections](https://dev.mysql.com/doc/refman/8.4/en/using-encrypted-connections.html)
- [MySQL 8.4：MySQL Enterprise Audit](https://dev.mysql.com/doc/refman/8.4/en/audit-log.html)
- [PostgreSQL 18：Database Roles](https://www.postgresql.org/docs/18/user-manag.html)
- [PostgreSQL 18：Privileges](https://www.postgresql.org/docs/18/ddl-priv.html)
- [PostgreSQL 18：Row Security Policies](https://www.postgresql.org/docs/18/ddl-rowsecurity.html)
- [PostgreSQL 18：CREATE POLICY](https://www.postgresql.org/docs/18/sql-createpolicy.html)
- [PostgreSQL 18：pg_hba.conf](https://www.postgresql.org/docs/18/auth-pg-hba-conf.html)
- [PostgreSQL 18：SSL Support](https://www.postgresql.org/docs/18/ssl-tcp.html)
