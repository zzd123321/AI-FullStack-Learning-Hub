---
title: JSON 与半结构化数据建模
description: 在关系模型中安全使用 JSON，理解类型差异、路径语义、schema 验证、部分更新、索引、并发、迁移与容量治理
prev:
  text: ORM、数据库驱动与 Repository 边界
  link: /database/orm-drivers-repository-boundaries
next:
  text: 数据库全文检索、相关度与搜索架构
  link: /database/full-text-search-ranking-architecture
---

# JSON 与半结构化数据建模

商品接口需要支持服装的颜色和尺码、电脑的 CPU 和内存、图书的作者与 ISBN。为每个品类建立几十张属性表可能过重，把整个商品原样塞进一个 JSON 又会失去约束、关联和高效查询。

JSON 真正适合的是：**边界清楚、结构会演进、主要随所属实体一起读写、很少独立参与关系约束的附属数据**。它不是“暂时不想设计 schema”的许可证。

## 先判断哪些字段属于关系模型

假设商品表：

```text
products
  id                  -- 主键
  tenant_id           -- 租户隔离
  sku                 -- 业务唯一键
  status              -- 状态机与筛选
  price_cents         -- 精确金额
  category_id         -- 外键
  attributes          -- JSON 附属属性
  attributes_version  -- JSON schema 版本
  row_version         -- 并发控制
```

以下字段通常不应只藏在 JSON：

- 主键、租户键、外键和幂等键。
- 需要 `UNIQUE`、`NOT NULL`、外键或复杂 `CHECK` 的不变量。
- 金额、库存、订单状态等核心事实。
- 高频筛选、排序、JOIN、分区和权限谓词。
- 需要独立生命周期或被其他实体引用的子对象。

JSON 更适合：

- 不同品类拥有不同、变化较快的展示属性。
- 外部系统原始响应的受控快照，同时另存关键规范化字段。
- 事件 payload、审计 before/after，但要有版本和保留策略。
- 很少单独更新、总是随父实体读取的嵌套配置。

若 JSON 数组元素需要独立 ID、单独更新、外键引用、唯一约束或无限增长，它们通常已经是实体，应拆成子表。

## 数据库 JSON 类型解决了什么

与 `TEXT` 相比，原生 JSON 类型通常提供：

- 写入时验证 JSON 语法。
- 路径提取、包含、存在、构造和修改函数。
- 专用内部表示与查询能力。
- 针对路径、表达式、包含或数组成员的索引方案。

但“语法合法”只证明括号、字符串和数字符合 JSON，不证明：

- `color` 必须是字符串。
- `weightGrams` 必须为正整数。
- `schemaVersion` 是应用支持的版本。
- 对象没有敏感或未知字段。
- 数组长度、嵌套深度和文档字节数在预算内。

业务 schema 仍要由应用验证、数据库约束关键字段，或在适合的场景使用 JSON Schema 工具。验证失败必须拒绝写入，而不是“先存进去以后再清理”。

## MySQL JSON 与 PostgreSQL json/jsonb

### MySQL JSON

MySQL 原生 `JSON` 会验证输入并转换为优化的内部二进制格式，能按 key 或数组位置访问，而无需每次把整段文本重新解析。它会规范化对象，包括处理重复 key、空白和内部 key 顺序；不能依赖原始文本格式或对象 key 顺序做签名。

MySQL JSON 列不能像普通标量列一样直接建立常规索引。常见方式是：

- 从稳定路径提取标量到生成列，再给生成列建立 B-Tree。
- 使用与查询表达式匹配的函数/表达式索引能力。
- 对 JSON 数组成员评估 InnoDB multi-valued index，并核对类型和限制。

MySQL 能在满足特定条件时对 `JSON_SET`、`JSON_REPLACE`、`JSON_REMOVE` 执行部分就地更新，但这是优化条件，不是所有部分修改都保证只写少量字节。binary log 是否记录 partial JSON 还有独立配置与复制语义。

### PostgreSQL json

`json` 类型保存输入文本的精确副本，因此保留空白、key 顺序甚至重复 key 的文本表现；处理时通常需要重新解析。若上游签名或法规要求保留原始文档字节，更稳妥的是独立保存原始 payload/哈希，不能只依赖后续 JSON 序列化仍完全相同。

### PostgreSQL jsonb

`jsonb` 保存分解后的二进制形式，写入转换成本更高，读取与处理通常更快，并支持索引、包含和更多运算符。它不保留空白、对象 key 顺序或重复 key；重复 key 只保留一个值。

大多数需要数据库内查询和索引的 PostgreSQL 场景从 `jsonb` 开始评估；只需原样保存、很少查询且确实需要文本表现时再考虑 `json`/原始字节列。

两种数据库的路径语法、返回类型、数字范围、重复 key、包含语义和索引能力不同。ORM 提供统一 JSON API 不代表语义完全一致。

## 对象 key 无序，数组顺序有业务含义

JSON object 是键值集合，不应依赖输出 key 顺序。数据库或序列化库可能重新排序。若需要稳定摘要/签名，应定义 canonical JSON：

- 对象 key 使用确定排序。
- 明确 Unicode、数字、负零和转义规范。
- 数组保持业务顺序，除非该数组在领域上明确是集合。
- 规范化发生在哪一层、使用哪个版本必须固定。

数组默认有顺序。商品图片、工作流步骤不能为了生成摘要擅自排序；标签若业务上是集合，可在写入前去重排序，但这应是明确 schema 规则。

## SQL NULL、JSON null 与缺失 key

三个状态必须分开：

```json
{}
{ "nickname": null }
{ "nickname": "Ada" }
```

- 缺失：属性没有出现，可能表示未知、未提供或沿用默认。
- JSON null：属性明确存在且值为 JSON null，可能表示主动清空。
- SQL `NULL`：整个 JSON 列没有 SQL 值。

路径提取函数在“缺失”“类型不匹配”“JSON null”时返回 SQL NULL、JSON null、false 或错误，取决于产品、函数和 strict/lax 模式。不能只写 `IS NULL` 就假设能区分。

Patch API 必须定义语义：

```text
字段缺失 → 保留原值
字段为 null → 清空该可空字段
removePaths 包含路径 → 删除 key
```

JSON Merge Patch 中 null 有删除成员的标准语义；JSON Patch 又使用显式 operation。选择一种协议并写进 API 契约，不要把普通对象浅合并称为标准 patch。

## JSON 数字不是数据库 DECIMAL 契约

JSON 语法只有 number，没有 `BIGINT`、`DECIMAL(19,4)` 或货币 scale。不同解析器可能把数字转成双精度浮点、任意精度数或文本。

因此核心金额仍使用关系型精确列。JSON 中必须携带大整数或精确小数时，可采用受 schema 约束的字符串，并在边界解析：

```json
{
  "externalOrderId": "9223372036854775806",
  "quotedPrice": "1234567890.1234"
}
```

不要让应用先把数字解析成不精确 `number`，再把已经损坏的值写回 JSON。PostgreSQL `jsonb` 对 number 的可接受范围还受其 numeric 类型约束，而 `json` 文本接受范围的行为不同；跨库导入必须测试极值。

## 路径查询要固定类型和错误行为

同一路径可能存：

```json
{ "weightGrams": 1200 }
{ "weightGrams": "1200" }
{ "weightGrams": null }
{}
```

若查询直接把提取结果转整数，坏数据可能让整条查询报错；若使用 lax/silent 模式，坏数据又可能静默变成“不匹配”。两种策略都要有意识选择：

- 写入时严格验证，读取可假设类型并让异常暴露数据事故。
- 对历史异构文档先检查类型，再安全转换并统计坏数据。
- 数据探索可使用宽松路径，关键账务/权限不能静默忽略结构错误。

路径和 JSONPath 表达式本身属于 SQL 结构，用户输入不能直接拼接。允许客户端筛选的属性应映射为服务端白名单路径、预期类型、操作符和查询预算。

PostgreSQL SQL/JSON path 有 strict 与 lax 模式；lax 会自动适配某些结构，可能展开数组并产生意外重复。`@?`/`@@` 还会抑制部分缺失字段、类型、日期和数字错误。理解返回的 `false`、SQL NULL 与异常，才能写出正确接口。

## 关系约束不能跨进任意 JSON

数据库外键不能自然指向 JSON 中任意路径的字符串。把 `supplierId`、`categoryId`、`ownerId` 藏在 attributes 中意味着：

- 被引用行删除时无法可靠限制或级联。
- JOIN 要反复提取、转换，类型错误难处理。
- 租户边界可能遗漏。
- 引用完整性只能靠应用扫描或异步对账。

需要关系身份的值应提升为明确列和外键。可以在 JSON 中保留外部原始 ID 快照，但规范化列才是本系统关系事实。

同理，JSON 数组中的多个对象不能代替多对多连接表；连接表能保证唯一、外键、独立元数据和高效反向查询。

## 何时把 JSON 路径提升为列

以下信号出现时，应考虑把路径提升为普通列或生成列：

- 几乎每个请求都按它筛选、排序或 JOIN。
- 它已经成为业务不变量、权限或分区依据。
- 路径类型稳定，缺失/NULL 规则已明确。
- 多个索引重复提取同一路径。
- 统计信息不足导致计划长期不稳定。

选择普通列意味着应用显式双写，能建立强类型、约束和外键；生成列减少双写漂移，但表达式、类型、collation、写成本和迁移限制需要验证。

迁移采用 expand/contract：新增列 → 新写入同步 → 回填 → 分桶校验 → 切换查询 → 约束收紧。不要一次锁表把多年 JSON 全量提取到新列。

## MySQL JSON 索引设计

假设高频查询按商品颜色精确筛选：

```sql
-- 说明性结构，实际类型、路径和在线 DDL 按目标版本验证。
color VARCHAR(32)
  GENERATED ALWAYS AS (JSON_UNQUOTE(attributes->'$.color'))
```

然后索引 `(tenant_id, color, status, id)`，而不是只给 color 建一个脱离接口形状的索引。需要注意：

- 提取结果字符集/collation 与比较语义一致。
- JSON number 与字符串转换不会把坏数据混在一起。
- 查询表达式能匹配生成列/函数索引。
- 缺失与 JSON null 如何映射到 SQL NULL。
- 所有 JSON 写入都要维护派生索引，增加写放大。

数组成员检索可评估 multi-valued index，但它有可索引元素类型、每行键数量、JSON null、在线 DDL 等限制。数组无限增长会让单行对应大量索引条目；此时拆子表往往更清晰。

## PostgreSQL jsonb 索引设计

PostgreSQL 常用 GIN 支持 `jsonb` 包含、key existence 和部分 jsonpath 查询。默认 `jsonb_ops` 支持更广的操作；`jsonb_path_ops` 支持范围较窄，但某些包含查询索引更小、更有针对性。选择由真实操作符决定。

```sql
-- 广泛查询整个文档的说明性示例
CREATE INDEX products_attributes_gin
ON products USING GIN (attributes);

-- 高频固定路径可使用表达式索引
CREATE INDEX products_color_idx
ON products (tenant_id, (attributes->>'color'));
```

不要同时建立“全 JSON GIN + 每个路径表达式索引 + 多个联合索引”而不测工作负载。GIN 会占空间并增加写入维护；表达式索引只服务匹配表达式与操作符。索引也不会替 JSON schema 验证。

查询必须写成索引支持的运算符形状。看似等价的文本提取、cast、jsonpath 或包含表达式可能使用不同索引。用 `EXPLAIN (ANALYZE, BUFFERS)` 在代表性文档和参数下验证。

## 选择性与统计信息

JSON 文档结构异构，路径分布、缺失比例和数组长度可能极不均匀。优化器对深层表达式的统计不一定像普通列充分。

可以：

- 为稳定表达式建立统计目标/表达式统计能力（按产品版本）。
- 提升高价值路径为列，让统计更直接。
- 按 schemaVersion/category 分开查询，减少混合类型。
- 用真实大租户、小租户和极端数组长度测试计划。

“已经建 GIN/生成列索引”不等于计划必然使用；选择性低、返回比例高或表达式不匹配时扫描可能更合理。

## 部分更新与丢失更新

两个请求同时读取：

```json
{ "color": "red", "stockNote": "A" }
```

请求 A 把 color 改为 blue，请求 B 把 stockNote 改为 B。如果两者在应用内读取整文档、修改后整段覆盖，后提交者可能抹掉前者变化。

解决方式：

- 使用 `row_version` 条件更新，冲突后重新读取并按业务规则合并。
- 使用数据库路径更新函数，让不同路径在单条原子 UPDATE 中修改；仍要处理同路径并发和状态前置条件。
- 对关键状态拆成普通列，使用明确条件更新。

路径更新不等于没有写放大。PostgreSQL MVCC 更新仍产生新 row version；大 jsonb 的 TOAST、WAL、vacuum 和索引维护需要测量。MySQL 是否满足 partial in-place 和 partial binlog 条件也要观察实际指标。

不要把深层 merge 交给一个含义不清的通用函数。数组是整体替换、按索引修改、按 ID 合并还是集合 union，必须由领域协议定义。

## Schema 版本与读取升级

JSON 灵活并不代表无版本。文档应显式携带或由关系列记录 schema version：

```json
{
  "schemaVersion": 2,
  "color": "blue",
  "dimensionsMm": { "width": 120, "height": 40 }
}
```

常见演进策略：

### 读取时升级

保留旧文档，mapper 按 version 转成当前领域结构。发布快、写放大小，但旧转换代码和查询路径长期复杂。

### 后台迁移

逐批把旧文档改成新 version，带水位、幂等、校验和限速。查询最终简单，但会产生写放大、日志与复制压力。

### 双读/双写过渡

短期同时支持旧、新字段，消费者迁移后删除旧字段。必须定义单一事实来源和冲突优先级，避免永久双写。

每个 reader 声明支持版本范围。遇到未来未知版本应隔离并告警，不能当空对象继续处理。

## 大文档和无限数组

单行 JSON 很大时：

- 每次读取即使只需一个字段，也可能产生更多 I/O、解码与网络传输。
- 更新小路径仍可能写大量页、TOAST/WAL/binlog。
- 复制、备份、CDC、缓存和日志都被放大。
- ORM 容易无意把全文档加载并序列化。
- 热点父行让无关子元素更新互相锁冲突。

设置文档字节、深度、object key 数、数组长度和单字符串长度上限。附件正文、无限事件列表、评论集合不应内嵌；保存对象存储引用或拆表，并维护独立生命周期。

MySQL JSON 存储还受 `max_allowed_packet` 等边界影响，但把 packet 调大不是无限文档的架构修复。

## 安全与隐私

JSON 的灵活性很容易绕过列级治理：新字段可能悄悄加入身份证号、token 或内部提示词。需要：

- allowlist schema，拒绝未知敏感字段。
- 字段级分类、保留期和删除传播清单。
- 日志、APM、CDC、备份、缓存与非生产脱敏覆盖 JSON 深层路径。
- API 输出使用显式 DTO，不直接返回数据库 document。
- JSONPath/过滤 DSL 只允许有限路径与操作符，并设置复杂度和结果上限。

PostgreSQL RLS 和 MySQL 行权限设计主要在行/表边界，不会自动理解 JSON 内嵌 tenantId。真正的 tenant key 应是明确列并参与每个查询。

## 对账与可观测性

至少监控：

- 各 schemaVersion 行数、未知/过期版本数量。
- 文档 P50/P95/P99 字节数、深度和数组长度。
- 缺失、JSON null、类型错误和非法枚举比例。
- 路径查询调用量、扫描行数、计划和索引命中。
- JSON 更新产生的 WAL/binlog、复制延迟和行膨胀。
- 普通列与 JSON 镜像字段的分桶差异。
- schema 验证失败与未知 key；敏感值不进入指标 label。

对账需要 canonical form，但对象 key 排序不能改变数组语义。摘要用于定位差异，不替代逐字段业务不变量。

## 测试策略

覆盖：

- 缺失、JSON null、SQL NULL 和空字符串。
- number/string 类型漂移、最大整数和精确小数。
- 重复 key、对象 key 顺序、Unicode 与转义。
- 空数组、超长数组、嵌套上限和超大文档拒绝。
- 旧版升级、未知未来版本和非法组合。
- 两请求修改不同/相同路径的并发结果。
- 路径索引在缺失多、热点值和大数组下的真实计划。
- ORM/驱动读写后不会改变精度或 null 语义。

配套 `examples/database/36-json-contract-model.mjs` 演示 schema 版本升级、未知字段拒绝、缺失与 null 的不同 patch 语义、canonical object 和基于 row version 的并发保护。

## 常见误区

### “JSON 没有 schema”

只是 schema 不一定由表列完整声明。应用消费者仍依赖结构；不版本化只会得到隐式、不可治理的 schema。

### “部分更新函数不会写整行”

逻辑上改一个路径不等于物理写放大恒小。存储引擎、值大小、WAL/binlog 和索引决定实际成本。

### “给整个 JSON 建一个索引就够了”

索引支持具体操作符与表达式。查询形状不匹配、选择性低或类型混乱时仍可能扫描。

### “把外键放进 JSON 更灵活”

这会丢失数据库引用完整性、删除规则和稳定 JOIN 类型。关系身份应使用明确列。

### “对象序列化字符串相同才相等”

空白和 key 顺序不应决定对象语义；但数组顺序、数字和 null 仍要按业务规则比较。

## 上线检查清单

- 为什么选择 JSON，而不是普通列、子表或外部对象存储？
- 主键、租户、金额、状态、外键和高频查询字段是否仍为明确列？
- 文档是否有 schema/version、类型、大小、深度和未知字段验证？
- 缺失、JSON null、SQL NULL 与 patch 删除语义是否明确？
- 大整数、精确小数、时间和 Unicode 是否端到端无损？
- 路径是否来自服务端白名单，strict/lax 错误行为是否符合业务？
- 索引是否匹配实际操作符、类型、tenant predicate 与排序？
- 部分更新是否有 row version/条件写防止丢失更新？
- 大文档、数组增长、WAL/binlog、复制和备份成本是否量化？
- schema 升级是否可分批、可续跑、可对账、可回退读取？
- 敏感字段的日志、CDC、缓存、备份和删除传播是否覆盖？
- JSON 结构漂移、文档大小、查询计划和镜像列差异是否可观测？

## 本课小结

- JSON 适合边界清楚、结构易变的附属数据，不替代核心关系事实和约束。
- MySQL JSON、PostgreSQL json 与 jsonb 的保存、规范化、查询和索引语义不同。
- 对象 key 无序，数组顺序通常有业务含义；签名与对账需明确 canonical 规则。
- 缺失 key、JSON null 和 SQL NULL 是三个不同状态，patch 协议必须定义它们。
- 大整数和精确小数不能依赖普通 JSON number 穿过所有解析器。
- 路径查询要固定预期类型、错误模式和白名单，不能让客户端提供任意 JSONPath。
- 高频、受约束或参与关系的路径应提升为普通列/生成列并兼容迁移。
- JSON 路径修改仍需 row version 防丢失更新，并实测物理写放大。
- 半结构化数据仍要 schema 版本、容量上限、安全治理、对账和可观测性。

## 官方资料

- [MySQL 8.4：The JSON Data Type](https://dev.mysql.com/doc/refman/8.4/en/json.html)
- [MySQL 8.4：JSON Function Reference](https://dev.mysql.com/doc/refman/8.4/en/json-function-reference.html)
- [MySQL 8.4：Functions That Search JSON Values](https://dev.mysql.com/doc/refman/8.4/en/json-search-functions.html)
- [MySQL 8.4：Functions That Modify JSON Values](https://dev.mysql.com/doc/refman/8.4/en/json-modification-functions.html)
- [MySQL 8.4：Multi-Valued Indexes](https://dev.mysql.com/doc/refman/8.4/en/create-index.html#create-index-multi-valued)
- [PostgreSQL 18：JSON Types](https://www.postgresql.org/docs/18/datatype-json.html)
- [PostgreSQL 18：JSON Functions and Operators](https://www.postgresql.org/docs/18/functions-json.html)
- [PostgreSQL 18：GIN Indexes](https://www.postgresql.org/docs/18/gin.html)
- [PostgreSQL 18：Index Types](https://www.postgresql.org/docs/18/indexes-types.html)
