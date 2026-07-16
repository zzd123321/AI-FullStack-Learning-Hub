---
title: 数据库全文检索、相关度与搜索架构
description: 从搜索需求分类到分词、倒排索引、相关度、分页、质量评测与外部搜索同步，建立可验证的搜索接口
prev:
  text: JSON 与半结构化数据建模
  link: /database/json-semi-structured-data-modeling
---

# 数据库全文检索、相关度与搜索架构

用户输入“无线降噪耳机”，期望标题精确命中的商品排在前面，也希望“耳麦”“蓝牙耳机”能被找到。普通 `LIKE '%无线降噪耳机%'` 只能做字面子串匹配，无法理解词、词频、字段权重和相关度；给 `name` 建普通 B-Tree 也通常无法加速前置通配符。

搜索不是一个 SQL 操作符，而是一份产品契约：查什么、怎样分词、允许哪些语法、结果如何排序、索引多久更新、权限如何裁剪、质量如何衡量。

## 先分类搜索需求

| 需求 | 例子 | 常见起点 |
| --- | --- | --- |
| 精确值 | SKU = `WH-1000` | B-Tree/Hash 等值索引 |
| 前缀 | 邮箱以 `ada@` 开头 | 合适 collation/operator class 的 B-Tree、专用前缀索引 |
| 任意子串 | 名称包含 `1000` | trigram/ngram 或专用搜索；小表可扫描 |
| 单词检索 | 文档包含 `database` | 全文倒排索引 |
| 布尔/短语 | 必须有 A、排除 B、词组相邻 | 全文查询语言 |
| 相关度 | 标题命中优先于描述 | 权重、词频、位置、业务重排 |
| 拼写/模糊 | `postgre` 找到 PostgreSQL | trigram、编辑距离或搜索引擎 |
| 语义搜索 | “适合通勤的降噪设备” | embedding/vector + 关键词混合召回 |

不要因为接口参数叫 `q` 就默认全文检索。SKU 搜索用全文索引可能失去标点和大小写语义；用户姓名的模糊匹配又涉及 Unicode、隐私与语言规则。

## 倒排索引怎样工作

普通 B-Tree 大致从值定位行：

```text
"database design" → row 42
```

倒排索引则从 token 定位文档集合：

```text
database → [row 2, row 42, row 91]
design   → [row 7, row 42]
```

查询 `database AND design` 时，先求 posting list 交集得到候选 row 42。索引还可能保存词频、位置或权重，以支持短语与相关度。

这解释了两个边界：

- 搜索的是 analyzer 产生的 token，不是原始字符串的任意片段。
- 高频词对应巨大 posting list，即使索引定位快，返回、排序大量候选仍然昂贵。

## Analyzer 决定什么能被找到

文本进入索引和查询时都要经过近似相同的链路：

```text
原始文本
  → parser/tokenizer
  → 大小写/Unicode 规范化
  → stop words
  → stemming/词形归并或词典
  → token/lexeme
```

如果文档用一套配置、查询用另一套配置，索引存在也可能找不到。需要明确：

- 语言与 text search configuration/parser。
- Unicode 规范化、大小写、重音和标点。
- stopword 列表与最短/最长 token。
- stemming、同义词和品牌/专有名词词典。
- 中文、日文、韩文等无空格文本怎样切分。
- analyzer/词典版本升级如何重建索引。

“把所有文本 lower case”不是完整 analyzer。土耳其语大小写、德语词形、中文分词和产品型号都需要真实语料验证。

## Stopword 和短 token 会制造“无结果”

用户输入可能在分析后一个 token 都不剩：全是 stopword、标点，或词长低于阈值。接口必须定义：

- 返回空结果并提示调整关键词。
- 降级为受限前缀/子串搜索。
- 使用另一种 analyzer。

绝不能把“空查询”解释成删除 WHERE 条件并返回全表；这会造成容量事故和信息暴露。

MySQL InnoDB FULLTEXT 默认最短 token 长度、stopword 和 parser 配置会影响索引内容。修改这些配置通常还需要重建相关 FULLTEXT index，不能只改变量就认为历史文档自动更新。

## MySQL FULLTEXT

MySQL 在 `CHAR`、`VARCHAR`、`TEXT` 上建立 FULLTEXT index，通过 `MATCH(columns) AGAINST(query ...)` 查询。`MATCH` 中列列表必须与合适的 FULLTEXT index 定义相符。

### Natural language mode

把查询解释成自然语言并计算 relevance，适合普通关键词搜索。不要假设 score 能跨数据集、版本或查询比较，它主要用于同一次查询内排序。

### Boolean mode

支持必须包含、排除、前缀等操作符。若直接允许用户提交原始 boolean query，用户就能控制查询结构、扩大候选或制造高成本表达式。更安全的是把产品支持的有限筛选编译成受控语法，并限制 token/操作符数量。

### Query expansion

可从初次最相关文档扩展查询，提高召回，也可能引入主题漂移。它不是自动同义词解决方案，必须用离线 relevance set 和线上实验验证。

### 中文与 ngram parser

MySQL 内置 parser 依赖分隔符识别词，不能可靠处理中文等无空格语言。官方提供 ngram parser 处理 CJK。ngram token size 决定召回、噪声、索引大小和写成本：粒度越小，子串召回更多，posting list 与误匹配也可能增加。

更改 parser、token size、stopword 或最短词长后，旧索引与新配置可能不一致。变更应当作 schema/data migration：影子索引/测试、重建、质量对比、容量验证、切换与回退。

## PostgreSQL 全文检索

PostgreSQL 将文档转换为 `tsvector`，将用户查询转换为 `tsquery`，再用匹配操作符判断：

```sql
to_tsvector('english', title || ' ' || description)
@@ websearch_to_tsquery('english', :query)
```

配置名应显式写入查询和索引表达式。依赖 session 的 `default_text_search_config` 会让不同环境、连接或 migration 得到不同 token。

### 构造 tsquery

- `plainto_tsquery` 将普通文本安全转为词项组合。
- `phraseto_tsquery` 表达短语关系。
- `websearch_to_tsquery` 接受更接近 Web 搜索框的有限语法。
- `to_tsquery` 直接使用 tsquery 语法，输入不合法会报错，不能把未经限制的用户文本直接视为可信结构。

选择函数是 API 语义，不是随意替换。记录原始 query、解析后的安全摘要和配置版本，但敏感搜索词应脱敏并受保留策略约束。

### 保存 tsvector 还是查询时计算

查询时 `to_tsvector` 简单，却要为候选行反复解析，并可能无法匹配表达式索引。稳定高频场景可使用：

- 与查询表达式完全匹配的 expression GIN index。
- stored generated `tsvector` column，再建立 GIN index。
- trigger 维护向量，但要承担隐藏写入和回填成本。

生成列/表达式还要显式处理 `NULL`，例如 `coalesce(title, '')`，否则拼接结果可能整体为空。

### GIN 与 GiST

PostgreSQL 官方文档通常推荐 GIN 作为 text search 首选：它为 lexeme 保存 posting list，查询快，但写入和索引更新有成本。GiST text search index 是有损签名，可能需要 recheck，特点不同。

GIN 找出候选并不自动完成 relevance 排序。`ts_rank`/`ts_rank_cd` 往往需要对匹配行计算，再按 score 排序。极常见 token 命中几十万行时，排序仍可能是主要成本。

## 字段权重

标题命中通常应比描述命中重要。PostgreSQL 可给 vector 片段设置 A-D 权重；MySQL 可通过分列 score 组合、不同查询或应用重排实现产品权重。

概念上：

```text
textScore = titleMatch × 4
          + categoryMatch × 2
          + descriptionMatch × 1
```

但总分还可能混合：

- 文本相关度。
- 库存、价格、发布时间、销量和质量。
- 个性化、地区和合规降权。

权重需要可解释、可版本化。不要让销量完全压过文本相关度，使用户搜索具体型号却只看到热门无关商品。

## 排名不是稳定唯一顺序

多个文档可能得到同一浮点 score。分页必须增加确定性 tie-breaker：

```sql
ORDER BY score DESC, product_id ASC
```

offset pagination 在索引内容和 score 变化时可能重复或遗漏。keyset cursor 至少包含排名模型版本、查询摘要、score 和 ID；但浮点序列化、数据更新和 score 重新计算仍会改变结果。

需要用户翻页期间严格稳定时，可创建短生命周期 search snapshot/result set，或接受并明确“结果随库存和索引更新变化”。搜索分页一致性是产品选择，不能由 SQL 偶然决定。

## 先过滤还是先全文召回

典型搜索还带：

```text
tenant_id = ?
status = 'ACTIVE'
category_id IN (...)
price between ...
FULLTEXT match
```

全文索引、B-Tree 过滤和排序怎样组合取决于产品、选择性和计划。必须确保 tenant/权限谓词不会在应用层搜索后才补：

- 先全局取 top 100 再过滤租户，可能导致授权结果缺失并暴露侧信道。
- 每租户独立巨大全文索引不一定可行。
- 共享索引需要在查询阶段强制租户与可见性过滤。

用实际热门词、稀有词、大租户、小租户和空结果执行计划验证，不能只用一个关键词。

## 高亮不是字符串 replace

把原始 query 用正则替换成 `<mark>` 会：

- 与 analyzer 的 stemming/词形不一致。
- 破坏 Unicode 边界。
- 产生 HTML 注入。
- 在大文本上消耗大量 CPU。

PostgreSQL `ts_headline` 等能力可基于文本搜索配置生成片段，但官方也警示输出不保证可直接安全嵌入页面。无论数据库还是搜索引擎返回高亮，都要按输出上下文转义，只允许受控标记。

摘要长度、片段数和每结果高亮成本要设上限。列表通常不需加载完整正文。

## 模糊、拼写和同义词不是普通全文检索的自然结果

Stemming 解决部分词形变化，不等于 typo tolerance。同义词词典可让“耳机/耳麦”关联，但存在方向、上下文和版本问题。trigram 适合相似度和任意子串，但短字符串和低阈值可能召回巨大集合。

PostgreSQL `pg_trgm` 是扩展，需要独立安装、索引和阈值验证；MySQL ngram 与自然语言分词也不是同一语义。把多种召回合并时要去重、归一化 score，并防止低质量模糊结果淹没精确命中。

## 数据库全文检索何时足够

适合留在主数据库：

- 数据规模和查询并发在已测容量内。
- 语言/analyzer 需求有限且数据库原生支持。
- 强事务可见性或简化运维比高级搜索更重要。
- 排名、聚合、模糊与同义词要求不复杂。
- 团队需要用同一 SQL 同时执行严格关系过滤。

考虑独立搜索引擎：

- 多语言 analyzer、复杂同义词、拼写纠错和 autocomplete。
- 大规模 facet/聚合、地理、混合向量检索。
- 搜索流量与主交易库需要独立扩缩容和故障隔离。
- relevance 调优、A/B 实验和索引 alias/version 管理要求高。

引入搜索引擎意味着新增派生系统，不能只比较查询功能。

## 外部搜索索引的一致性

数据库仍是权威事实，搜索索引是可重建读模型：

```text
数据库事务
  ├── products
  └── outbox
       → CDC/consumer
       → search index v3
       → alias cutover
```

必须处理：

- 至少一次投递与 event ID 幂等。
- 同一商品事件乱序，用 aggregate version 拒绝旧写。
- 删除/tombstone，防止商品在搜索中“复活”。
- 索引 lag 与 read-your-writes 产品语义。
- 全量 snapshot 水位 + 增量衔接。
- 影子索引分桶校验后 alias 切换。
- 数据库 schema、event schema、analyzer 和 index mapping 的兼容矩阵。

写数据库成功后同步调用搜索引擎并不能形成分布式原子提交；搜索超时还可能让接口错误但数据库已提交。使用 outbox/CDC，并让接口明确“搜索结果可能短暂延迟”。

## 搜索输入安全与资源治理

参数绑定只能阻止 SQL 注入，不能阻止昂贵搜索。需要限制：

- 原始 query 字节数、token 数和布尔操作符数。
- 通配符、前缀、模糊距离、短语长度和嵌套深度。
- filter 数量、category/ID 集合长度和最大页深。
- 每次候选数、超时、返回字段和高亮片段。
- 匿名用户频率和租户预算。

解析失败返回稳定 400；超时返回可识别错误或受控降级，不能悄悄去掉搜索条件返回全量数据。搜索词可能包含医疗、政治或个人隐私，日志与分析系统需要最小化、脱敏、访问控制和保留期。

## 质量评测不能只看延迟

准备带人工判断的 query set：

```text
query: "无线降噪耳机"
relevant: [p7 highly, p9 highly, p12 acceptable]
must_not_show: [已下架、其他租户、无权限]
```

离线关注：

- Precision@K：前 K 条中有多少相关。
- Recall@K：相关结果有多少被召回。
- MRR/NDCG：高相关结果是否排在更前。
- zero-result rate 与无结果原因。
- 权限、下架、地域等 hard filter 违规必须为零。

线上再观察点击、转化、query reformulation、退出率与延迟，但点击会受位置偏差和 UI 影响，不能直接等同 relevance 真值。每次 analyzer、stopword、权重或同义词变更都跑回归集和 canary/A-B。

## 性能与容量

压测分布应包含：

- 高频词、低频词、完全无结果和全 stopword。
- 单 token、多 token、短语、前缀和允许的模糊查询。
- 大租户、热门分类和深分页。
- 索引更新与搜索并发混合，而非只读静态库。
- 索引重建、合并/维护和副本故障期间的 N+1 容量。

监控 query latency P50/P95/P99、timeout、候选/返回数、索引大小、写入延迟、索引 lag、零结果率、解析失败、重建进度和主库资源争用。

## 配套模型

`examples/database/37-search-contract-model.mjs` 是一个刻意简化的教学模型：它用固定 analyzer 产生 token、拒绝空/过长查询，按标题与描述权重排名，并用 `(score, id)` 稳定决胜。它不模拟 MySQL/PostgreSQL 的真实 parser 或 score；真实质量必须在目标数据库和语料上验证。

## 常见误区

### “有 FULLTEXT/GIN 索引就不会慢”

高频 token 可命中大量候选，排名、过滤和返回仍然昂贵。索引只加速召回的一部分。

### “相关度分数可以跨查询比较”

score 依赖 query、文档集合、算法和配置，通常只用于同一次查询内部排序。

### “中文去掉空格也能用默认英文 parser”

无空格语言需要适合的 tokenizer/parser、词典和真实语料评测。

### “外部搜索引擎能和数据库同步写成功”

双写会部分失败。搜索是通过 outbox/CDC 维护、可按水位重建的派生索引。

### “点击率提高证明 relevance 更好”

位置、广告、UI 和新奇效应都会影响点击。结合离线判断集、护栏和实验设计。

## 上线检查清单

- 精确、前缀、子串、全文、模糊和语义搜索是否已区分？
- 文档与查询是否使用相同且显式版本化的 analyzer/configuration？
- 中文等目标语言是否使用适合 parser，并以真实语料验证？
- 空分析结果是否安全返回，而非退化成全表查询？
- tenant、状态和权限是否在搜索查询内部强制执行？
- 全文索引是否匹配列/表达式/配置，实际计划是否验证？
- 字段权重、业务重排和稳定 tie-breaker 是否明确？
- 深分页、score 变化和 search snapshot 语义是否定义？
- 高亮是否转义，query 语法与资源复杂度是否受限？
- 外部索引是否有幂等、版本、防乱序、tombstone、水位和影子重建？
- relevance set、Precision/Recall/NDCG 和 hard filter 回归是否存在？
- 高频词、索引更新、重建和故障容量是否压测与监控？

## 本课小结

- 搜索需求先区分精确、前缀、子串、全文、模糊和语义，不能统一成 `%q%`。
- 倒排索引从 token 映射到文档，analyzer 决定哪些 token 能被索引和查询。
- MySQL FULLTEXT 的 mode、stopword、token 长度和 CJK parser 会改变结果与重建要求。
- PostgreSQL 使用 `tsvector`/`tsquery`、text search configuration 和 GIN/GiST，匹配与排名是不同阶段。
- 字段权重和业务重排必须可解释、版本化；score 相同还需稳定 ID 决胜。
- 高亮、模糊、同义词和深分页都有独立正确性与容量边界。
- 独立搜索引擎是通过 outbox/CDC 维护的派生读模型，需要水位、幂等、删除和重建。
- 搜索上线既要性能 SLO，也要 relevance 评测、权限零违规和真实语言语料回归。

## 官方资料

- [MySQL 8.4：Full-Text Search Functions](https://dev.mysql.com/doc/refman/8.4/en/fulltext-search.html)
- [MySQL 8.4：Natural-Language Full-Text Searches](https://dev.mysql.com/doc/refman/8.4/en/fulltext-natural-language.html)
- [MySQL 8.4：Boolean Full-Text Searches](https://dev.mysql.com/doc/refman/8.4/en/fulltext-boolean.html)
- [MySQL 8.4：Full-Text Stopwords](https://dev.mysql.com/doc/refman/8.4/en/fulltext-stopwords.html)
- [MySQL 8.4：Fine-Tuning MySQL Full-Text Search](https://dev.mysql.com/doc/refman/8.4/en/fulltext-fine-tuning.html)
- [MySQL 8.4：ngram Full-Text Parser](https://dev.mysql.com/doc/refman/8.4/en/fulltext-search-ngram.html)
- [PostgreSQL 18：Full Text Search](https://www.postgresql.org/docs/18/textsearch.html)
- [PostgreSQL 18：Tables and Indexes](https://www.postgresql.org/docs/18/textsearch-tables.html)
- [PostgreSQL 18：Controlling Text Search](https://www.postgresql.org/docs/18/textsearch-controls.html)
- [PostgreSQL 18：Preferred Index Types for Text Search](https://www.postgresql.org/docs/18/textsearch-indexes.html)
- [PostgreSQL 18：GIN Indexes](https://www.postgresql.org/docs/18/gin.html)
