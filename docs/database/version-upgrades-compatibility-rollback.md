---
title: 数据库版本升级、兼容性与回退设计
description: 区分小版本与主版本升级，比较原地、蓝绿、pg_upgrade 和逻辑复制，建立兼容预检、影子验证、切换、观察与回退门禁
prev:
  text: 数据库事故响应、故障切换与复盘
  link: /database/incident-response-failover-postmortem
---

# 数据库版本升级、兼容性与回退设计

数据库升级不是替换一个二进制文件。新版本可能改变保留字、默认参数、认证方式、系统目录、执行计划、collation、复制协议和扩展 ABI；应用驱动、代理、备份工具与监控也必须兼容。即使实例成功启动，也可能在晚高峰才出现计划回归或在真正恢复时发现旧工具不能读取新备份。

本课建立“清单—预检—复制生产特征的演练—canary—切换—业务验证—回退资格关闭”的升级协议，并分别说明 MySQL 与 PostgreSQL 的版本边界。

## 先区分升级类型

| 类型 | 示例 | 典型特点 |
| --- | --- | --- |
| 补丁/小版本 | PostgreSQL 18.x 内更新、MySQL 8.4 LTS 内更新 | 数据格式通常兼容，但仍有行为与扩展变化 |
| 主版本/LTS 跨代 | PostgreSQL 17 → 18、MySQL 8.0 → 8.4 | 需要专门数据升级、复制或逻辑迁移 |
| 平台迁移 | 自建 → 云、x86 → ARM、OS/文件系统变化 | 同时改变硬件、网络和运维控制面 |

不要把数据库、OS、架构、存储和参数大改塞进一个窗口，否则出现回归时无法定位变量。确需合并时，必须用蓝绿环境把组合整体预演。

## 升级清单不是只有 server

- server、client library、JDBC/语言驱动与连接池。
- proxy/router、HA 编排、备份与恢复工具。
- extension/plugin、共享库、UDF、字符集和 collation。
- ORM、migration 工具、CDC、BI 和数据导入导出。
- 监控查询、系统视图、日志解析和安全审计。
- primary、replica、分片、灾备和延迟副本。

为每项记录 owner、当前/目标版本、兼容矩阵、验证方法和回退路径。没有 owner 的依赖就是升级风险。

## 选择升级方式

### 原地升级

在原实例/数据上升级。优点是数据搬运少、成本低；缺点是切换与数据格式变化耦合，回退可能受限。适合受支持路径、窗口可接受且恢复演练充分的场景。

### Dump/restore

逻辑导出到新版本，跨平台和清理旧对象较灵活，但大库恢复、索引重建和停机时间可能很长。必须同时覆盖角色、权限、扩展、序列和大对象。

### 蓝绿/逻辑复制

建立新版本环境，持续同步，验证后切流。停机可较短，也便于性能比较；代价是双环境、DDL/sequence/large object 兼容、复制延迟和切换后反向同步问题。

### PostgreSQL pg_upgrade

`pg_upgrade` 通过建立新系统目录并复用/复制用户文件快速跨主版本，`--check` 可只做兼容检查。外部模块二进制兼容无法全部自动判断；link/swap 等模式还会影响旧集群能否安全回启。选择传输模式前必须阅读目标版本文档并演练。

## 预检分为六层

1. **路径**：源到目标是否官方支持，是否需中间版本。
2. **对象**：废弃类型、保留字、损坏对象、扩展和插件。
3. **应用**：驱动、认证、SQL、ORM 和错误码。
4. **数据语义**：collation、时区、JSON、精度、排序与唯一性。
5. **拓扑**：复制方向、混合版本窗口、slot/GTID 和 failover。
6. **恢复**：目标版本备份、PITR、回退与旧主 fencing。

MySQL Shell Upgrade Checker 能发现许多目标版本不兼容，但官方也要求人工检查；“checker 通过”不是完整验收。PostgreSQL `pg_upgrade --check` 同样只覆盖工具能判断的集群兼容条件。

## Release notes 要转换成测试

不要只阅读后勾选。每个相关变化生成：

```text
变化 → 受影响对象/接口 → 测试数据 → 预期 → 负责人
```

例如 collation 变化要测试排序、唯一索引和游标分页；优化器变化要比较 top query 的计划和 p99；认证变化要用真实代理、证书轮换和连接池重连验证。

## 用生产特征做影子演练

演练环境需要接近生产：数据量/倾斜、扩展、参数、硬件、查询 digest、复制与备份。至少执行：

- 升级预检和完整升级计时。
- schema、行数摘要、约束和业务不变量比较。
- top SQL 计划、延迟、临时文件和资源回归。
- 应用关键旅程、后台任务、CDC 和报表。
- 目标版本备份、PITR 与故障切换。
- 回退演练，而不只升级演练。

合成小数据无法暴露 collation 冲突、扩展对象、长升级和真实执行计划。

## MySQL 升级边界

- 先核对官方 Upgrade Paths 与平台支持。
- 运行目标版本匹配的 MySQL Shell Upgrade Checker。
- 检查 system schema、用户对象、认证 plugin、SQL mode 和保留字。
- 复制拓扑按官方兼容顺序滚动，混合版本期禁止不兼容新特性。
- 新版本稳定前保留可恢复备份和完整 binlog/GTID 水位。

降级能力不是升级的镜像。MySQL 官方对版本组合和方法有严格限制；部分路径只能逻辑迁移/复制，甚至必须恢复升级前备份。升级后若数据已经使用新功能，旧版本可能无法解释，不能承诺“换回旧二进制即可”。

## PostgreSQL 升级边界

PostgreSQL 小版本通常替换二进制并重启，不使用 `pg_upgrade`；主版本数据迁移使用 dump/restore、`pg_upgrade` 或逻辑复制。

`pg_upgrade` 前检查：

- 新旧 binary/initdb 参数和平台兼容。
- 所有 extension 的目标版本 shared library。
- tablespace、自定义全文检索文件和外部依赖。
- 工具报告的 rebuild/reindex/post-upgrade 脚本。
- standby 如何重建/同步，不在每个 standby 独立盲跑。

逻辑复制升级可降低切换停机，但 schema DDL、sequence、large object 和未被复制对象需单独同步。切换后旧库继续接收写入就会形成分叉；必须 fencing，并在决定回退前处理反向变更同步。

## 执行计划回归

新版本优化器、统计和成本模型可能选择不同计划。升级前保存 top query：fingerprint、调用频率、参数分布、计划、p95/p99、读页和临时数据。升级后用相同窗口比较。

不要把所有计划变化视为坏事，也不要只比较 EXPLAIN cost。以真实执行、业务 SLO 和资源为准。准备可逆的 query/index/config 缓解方案，但避免用全局禁用优化器特性掩盖所有查询。

## Canary 与拓扑顺序

可行时先升级不承担关键写入的实例/副本，接入受控只读或影子流量，观察：崩溃、错误、计划、复制、备份和监控。canary 必须有代表性 workload，不是空闲 24 小时。

滚动顺序由产品复制兼容规则决定，不能凭“副本先升级总是安全”概括。每一步验证角色、位置、lag 和回退资格，再进入下一节点；始终保持足够 HA 容量。

## 切换协议

```text
冻结不兼容 DDL
→ 确认同步水位与备份
→ 排空/短暂停写
→ 最终追平和校验
→ fencing 旧写入口
→ 提升/路由到新版本
→ 重建连接并验证角色
→ 关键旅程与业务不变量
→ 分阶段恢复流量
```

连接池必须淘汰旧连接，prepared statement/session 参数重新建立。切流后监控未知提交、错误码变化、延迟、计划、replication/archive 和连接风暴。

## 回退必须预先定义“资格”

回退路径可能是：

- 原地模式下恢复升级前备份 + 日志（会产生 RPO/RTO）。
- 蓝绿在尚未接受新写或已有可靠反向同步时切回。
- 应用回退但数据库保持新版本，前提是 schema/协议向后兼容。
- roll forward 修复参数、查询或扩展。

记录 rollback deadline 和 disqualifier：一旦启用新数据格式/DDL、旧日志链中断、旧环境落后无法追平，简单切回资格就关闭。此时继续声称“一键回退”会误导事故决策。

## 升级完成标准

- 数据库与应用关键旅程、业务不变量通过。
- top query 无未解释回归，完整峰值/soak 窗口稳定。
- 所有副本/分片版本、schema、扩展和参数一致。
- backup、PITR、HA、监控、审计和安全扫描正常。
- post-upgrade rebuild/analyze/reindex 清单完成。
- 临时兼容、旧环境、双写和权限按观察期清理。
- 回退资格变化已明确沟通。

“新 server 启动成功”只表示升级进入验证阶段。

## 示例说明

运行 `node examples/database/26-upgrade-gate-model.mjs`，验证预检、canary、回退资格与切换门禁。

- `examples/database/26-mysql-upgrade-readiness.sql` 只读采集版本、平台、字符集、SQL mode、plugin 与对象特征。
- `examples/database/26-postgresql-upgrade-readiness.sql` 只读采集版本、collation、extension、对象类型和复制配置。

## 上线检查清单

- 官方路径、release notes、checker 和人工兼容检查完成。
- 驱动、代理、扩展、备份、CDC、监控均有目标版本验证。
- 生产特征环境完成升级、负载、恢复和回退演练。
- canary 有代表流量，滚动顺序符合复制兼容规则。
- 切换前冻结不兼容 DDL、确认水位并 fencing 旧写入口。
- 回退方法、deadline、数据损失边界和 disqualifier 明确。
- 计划回归按业务 SLO 判断，准备可逆缓解。
- 完成后验证备份/PITR/HA，而不只验证查询。

## 常见误区

### “小版本升级一定无风险”

它仍可能改变 bug 行为、计划、扩展或认证，需要 release notes、canary 和恢复验证。

### “Upgrade Checker 通过就能上线”

自动工具不能验证所有应用 SQL、驱动、业务语义、扩展和性能。

### “蓝绿随时能切回”

新库接受写入后旧库会落后；没有可靠反向同步，切回会丢数据或分叉。

### “pg_upgrade 很快，所以维护窗口很短”

还要算停写、检查、扩展、统计/重建、验证、连接恢复与失败回退。

### “换回旧二进制就是降级”

数据字典/格式和新特性可能不可逆，必须遵循产品支持路径或从备份恢复。

## 本课小结

- 升级覆盖 server、驱动、代理、扩展、工具、拓扑和恢复体系。
- 小版本、主版本与平台迁移使用不同路径，先查官方支持矩阵。
- checker 是预检的一部分，release note 必须转换为应用与数据测试。
- 影子环境要复制生产数据特征、workload、扩展和恢复流程。
- canary 与滚动顺序受复制兼容规则约束，切换必须 fencing 旧写入口。
- 执行计划用真实参数、SLO 和资源比较，不能只看 cost。
- 回退有 deadline 与 disqualifier；启用新格式后可能只能 roll forward 或恢复备份。
- 升级完成必须包含业务、性能、复制、备份、PITR、HA 与审计验证。

## 官方资料

- [MySQL 8.4：Upgrade Best Practices](https://dev.mysql.com/doc/refman/8.4/en/upgrade-best-practices.html)
- [MySQL 8.4：Preparing for Upgrade](https://dev.mysql.com/doc/refman/8.4/en/upgrade-prerequisites.html)
- [MySQL Shell 8.4：Upgrade Checker](https://dev.mysql.com/doc/mysql-shell/8.4/en/mysql-shell-utilities-upgrade.html)
- [MySQL 8.4：Downgrading](https://dev.mysql.com/doc/refman/8.4/en/downgrading.html)
- [PostgreSQL 18：Upgrading a Cluster](https://www.postgresql.org/docs/18/upgrading.html)
- [PostgreSQL 18：pg_upgrade](https://www.postgresql.org/docs/18/pgupgrade.html)
