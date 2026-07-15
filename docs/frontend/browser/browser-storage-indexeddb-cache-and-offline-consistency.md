---
title: 浏览器存储、IndexedDB、Cache API 与离线一致性
description: 从数据生命周期出发选择浏览器存储，掌握 IndexedDB 事务、迁移、多标签页协调、离线队列和 Cache API
---

# 浏览器存储、IndexedDB、Cache API 与离线一致性

浏览器提供 Cookie、Web Storage、IndexedDB、Cache API、OPFS 等多种存储机制。真正困难的并不是记住它们的方法名，而是回答这些问题：

- 这份数据的权威来源是谁？
- 页面崩溃、浏览器退出、用户清理数据或磁盘空间不足后，允许丢失吗？
- 多个标签页同时修改时，谁负责排序和解决冲突？
- 本地修改怎样与服务器同步，才能避免重复提交和“只成功一半”？
- 数据结构升级后，旧版本页面和旧记录还能否被读取？

本节把浏览器存储看成一个小型分布式系统：磁盘不是绝对可靠的，多标签页是并发写入者，服务器是另一份状态副本，而网络可能断开、超时或返回得太晚。

## 1. 学习目标

完成本节后，你应该能够：

- 按数据语义选择 Cookie、`sessionStorage`、`localStorage`、IndexedDB 或 Cache API；
- 理解 origin、storage partition 与配额边界，而不是把“同域”当成万能规则；
- 正确处理 IndexedDB 的打开、升级、请求、事务和连接生命周期；
- 区分数据库结构版本与业务记录版本，并设计可恢复的迁移；
- 用原子事务、Outbox、租约、幂等键和版本条件实现可靠离线同步；
- 正确理解 Cache API 与 HTTP 缓存、Service Worker 的关系；
- 处理配额、驱逐、隐私模式、跨标签页失效通知和用户切换；
- 建立可测试、可观察、可清理的浏览器数据层。

## 2. 先按数据职责分类，而不是先选 API

一个常见错误是：“数据要持久化，所以放 `localStorage`。”持久时间只是一个维度。先把数据分成以下角色更可靠：

| 数据角色 | 例子 | 推荐机制 | 核心原因 |
| --- | --- | --- | --- |
| HTTP 会话凭证 | 服务端登录会话标识 | `HttpOnly` Cookie | 浏览器随请求发送，脚本不可直接读取 |
| 标签页临时状态 | 多步骤表单当前步骤、回跳位置 | `sessionStorage` 或内存 | 与单个标签页生命周期一致 |
| 少量非敏感偏好 | 主题、紧凑模式 | `localStorage` | 简单、小、同步读取成本可控 |
| 可查询的结构化数据 | 草稿、离线实体、同步队列 | IndexedDB | 异步、事务、索引、结构化克隆 |
| HTTP 请求与响应 | 静态资源、公开 GET 响应 | Cache API | 原生保存 `Request` / `Response` |
| 大文件和流式文件访问 | 离线媒体、编辑器工作文件 | OPFS | 文件语义和较高效的二进制访问 |
| 页面当前渲染状态 | 弹窗是否打开、当前输入 | 组件状态/内存 | 不需要磁盘生命周期 |

还要为每份数据写出三个属性：

1. **权威性**：服务器、本地，还是两者需要合并？
2. **可重建性**：丢失后能从网络重新获取吗？
3. **敏感性**：一旦被同源脚本读取或被本机用户检查，会造成什么后果？

例如，课程列表缓存可重建，适合被驱逐；尚未上传的长篇草稿不可重建，应尽快同步、请求持久存储并向用户显示同步状态。即便如此，也不能承诺浏览器本地数据永不丢失。

## 3. 存储边界：origin 不是完整答案

通常所说的 origin 由协议、主机和端口组成：

```text
https://learn.example.com:443
│       │                 └── port
│       └──────────────────── host
└──────────────────────────── scheme
```

`https://learn.example.com` 与 `http://learn.example.com` 不同源，`https://api.example.com` 也不是前者的同源。路径 `/a`、`/b` 不参与 origin 判断，因此同一 origin 下的多个产品会竞争同一份存储配额，也可能发生键名冲突。

现代浏览器为限制跨站跟踪，还会按顶层站点进一步进行 **storage partitioning**。所以“iframe 与顶层页面中的目标地址同源”不必然意味着它们共享同一存储分区。工程上不要依赖第三方嵌入场景中的未分区状态；需要跨站访问时，应使用明确的身份、授权和 Storage Access 等机制。

这也解释了为什么 `BroadcastChannel` 更准确的通信边界是“同一存储分区”，而不只是口语中的“同域”。

## 4. Cookie：HTTP 状态，不是通用前端数据库

Cookie 的独特价值是参与 HTTP：匹配 domain、path、secure 等条件的 Cookie 会由浏览器附加到请求。服务端可用 `Set-Cookie` 建立会话，并使用以下属性收紧边界：

- `HttpOnly`：禁止 JavaScript 通过 `document.cookie` 读取，降低会话凭证被 XSS 直接窃取的风险；
- `Secure`：只通过安全连接发送；
- `SameSite`：限制跨站请求携带 Cookie，是 CSRF 防线的一部分，不替代 CSRF token 和来源校验；
- `Max-Age` / `Expires`：控制持久时间；未设置时通常是会话 Cookie；
- `Partitioned`：用于支持该属性的浏览器中的分区 Cookie 场景，并要求 `Secure`。

Cookie 并不适合保存大型 JSON、列表缓存或草稿。它容量小，而且会增加匹配请求的网络负担。认证 Cookie 也不等于前端“已登录”状态的唯一来源：前端可以缓存用户概况用于渲染，但授权决定必须由服务器完成。

即使凭证是 `HttpOnly`，XSS 仍能以用户身份发起同源请求，因此真正的防线仍包括输出编码、CSP、依赖治理和敏感操作的服务端校验。

## 5. Web Storage：简单，但同步且只有字符串

`localStorage` 和 `sessionStorage` 都提供字符串键值存储：

- `localStorage` 通常按 origin 共享，跨浏览器重启保留；
- `sessionStorage` 同时按 origin 和顶层标签页隔离，标签页会话结束后清除；
- 所有读写都是同步操作，会占用当前 JavaScript 线程；
- `JSON.stringify` 只是序列化，不会自动提供类型校验、迁移或并发控制；
- 访问或写入可能因用户策略、隐私环境或配额而抛错。

因此 Web Storage 适合“小、低频、非敏感、允许回退默认值”的配置，不适合大对象、高频输入、离线实体集合或可靠任务队列。

下面的偏好设置实现有四个重要细节：键名带命名空间和版本、读取后做运行时校验、任何访问都允许失败、失败时回退到默认值。

<<< ../../../examples/frontend/browser-storage/preferences.ts

不要在每次 `input` 事件中同步序列化整个表单到 `localStorage`。若数据确实很小，可以节流；若是持续增长的草稿，应转向 IndexedDB。

### `storage` 事件不是本标签页的变更回调

一个文档修改 `localStorage` 后，`storage` 事件会通知共享该存储区域的**其他**文档，而不会在执行写入的文档自身触发。事件会带来 `key`、`oldValue`、`newValue` 和 `storageArea`，适合兼容性要求高的简单失效通知。

不要把 `storage` 事件当成事务日志：事件接收者可能晚加入、刷新或崩溃。收到消息后应重新读取权威数据，而不是假设自己收到了全部历史事件。

## 6. 跨标签页通信：通知失效，而不是复制真相

`BroadcastChannel` 可以在同一存储分区内的窗口、标签页、iframe 与 Worker 之间发送结构化克隆消息。它比 `storage` 事件更适合定义明确的消息协议，但仍不是持久消息队列：没有历史回放，也不保证一个关闭中的页面处理完消息。

推荐模式是：

```text
标签页 A：提交 IndexedDB 事务 → 广播“draft-42 已变化”
                                      ↓
标签页 B：收到失效通知 → 从 IndexedDB 重新读取 draft-42
```

消息只是“缓存失效提示”，IndexedDB 才是本地权威副本。协议必须带版本并做运行时校验，页面销毁时关闭 channel：

<<< ../../../examples/frontend/browser-storage/cross-tab-invalidation.ts

如果不同标签页可能同时编辑同一实体，仅广播不能解决写冲突。至少要比较 revision；需要实时协作时，则应设计操作变换、CRDT 或服务端仲裁，而不是用“最后一次 `put` 获胜”掩盖冲突。

## 7. IndexedDB 的正确心智模型

IndexedDB 是浏览器内异步、事务型的对象数据库。它不是关系数据库，也不是“异步版 localStorage”。核心对象的职责如下：

| 概念 | 职责 | 容易混淆的点 |
| --- | --- | --- |
| database | 一个有整数版本的数据库 | 连接长期存在，升级时必须协调旧连接 |
| object store | 按键保存结构化克隆值 | 类似表，但没有 SQL join |
| key / key path | 唯一定位记录 | 可内联在对象字段，也可外部提供 |
| index | 从另一个字段有序定位主记录 | 会增加写入与存储成本 |
| request | 单个异步操作的结果 | 成功不等于整个事务已提交 |
| transaction | 一组对象仓库上的原子操作 | 生命周期由事件循环与待处理请求决定 |
| cursor | 按键或索引逐条遍历 | 适合范围扫描和边遍历边更新 |

IndexedDB 使用结构化克隆算法，可以保存对象、数组、`Date`、`Blob` 等；函数、DOM 节点等不能直接保存。能够保存并不代表应该保存：领域对象仍需显式 schema、迁移和校验。

## 8. 打开和升级：这是多标签页协议

只有提升数据库整数版本时才会触发 `upgradeneeded`。创建/删除 object store 或 index 必须在这个 `versionchange` 事务内完成。

<<< ../../../examples/frontend/browser-storage/database.ts

这里有三条关键因果链：

1. 新标签页请求版本 3，但旧标签页仍持有版本 2 的连接，升级会被 `blocked`；
2. 旧连接收到 `versionchange` 后应尽快 `close()`，让新版本继续升级；
3. 用户需要知道为什么页面在等待，以及何时需要刷新。

升级回调中的 `oldVersion` 位于 `IDBVersionChangeEvent`，它决定要顺序执行哪些迁移。迁移应设计为从任意仍受支持的旧版本向前推进，而不是只考虑“上一版本 → 当前版本”。

不要在升级事务中请求网络、等待用户输入或执行不可控的长异步流程。升级事务一旦中止，结构变更整体回滚；部署后的修复通常只能再提升版本，而不是假设所有设备都完成了上一次升级。

## 9. 两种版本：数据库结构版本与记录 schema 版本

数据库版本回答：“有哪些 object store 和 index？”记录的 `schemaVersion` 回答：“这条记录有哪些字段、字段含义是什么？”二者不能互相替代。

假设版本 1 的草稿只有 `savedAt`，版本 2 增加了 `title` 并改名为 `updatedAt`。可以在读取边界做惰性迁移：

<<< ../../../examples/frontend/browser-storage/draft-migration.ts

惰性迁移的优点是升级数据库时不必扫描全部数据；代价是读取路径暂时要兼容多个版本。若需要批量重写，应该分批进行、记录进度并允许中断恢复，避免一次长事务阻塞其他操作。

迁移策略还要考虑前端灰度和回滚：新版本页面写出的记录若旧版本完全不认识，回滚后就会失败。可选方案包括先部署兼容读取、延后写新格式，或让记录在过渡期保留必要的兼容字段。

TypeScript 类型只约束当前编译期代码。磁盘中可能是旧数据、损坏数据或其他版本写入的数据，所以读取 IndexedDB 后仍必须做运行时校验。

## 10. Request 成功不等于 Transaction 提交

IndexedDB 的单次 `put()` 返回 `IDBRequest`。它的 `success` 表示请求已成功执行，但事务后续仍可能因约束错误、显式 abort 或环境错误而失败。调用方若要承诺“已保存”，必须等待事务的 `complete`。

<<< ../../../examples/frontend/browser-storage/idb-helpers.ts

仓储层把 request、事务完成和记录迁移封装起来：

<<< ../../../examples/frontend/browser-storage/draft-repository.ts

`readonly` 事务允许并发读取；`readwrite` 才能修改现有仓库。`versionchange` 由数据库升级创建，用于改变结构。

`durability: "strict"` 是一个耐久性提示：浏览器应更谨慎地确认写入已落到持久介质，但它不等于跨设备备份，也不能抵抗用户清理、硬件损坏或浏览器策略。对于可重新获取的缓存，默认耐久性往往更合适。

### 事务生命周期为什么容易踩坑

事务只有在其作用域内仍有待处理请求时保持活跃。把网络请求放在事务中间是危险的：

```ts
const tx = db.transaction("drafts", "readwrite")
const draft = await requestToPromise(tx.objectStore("drafts").get(id))

await fetch("/slow-api") // 此时事务可能已经自动提交并变为 inactive

tx.objectStore("drafts").put({ ...draft, synced: true })
```

正确做法通常是把流程拆成：短事务读取 → 事务外网络请求 → 新短事务写入；如果必须保证本地两项状态同时改变，则把它们放在同一个短事务中，但仍不要把网络放进去。

## 11. 索引和查询：为真实访问路径建模

object store 主键适合按 ID 查找。需要按更新时间列出草稿时，可建立 `by-updated-at` 索引；同步队列则可以用 `by-next-attempt` 找到到期任务。

索引本质上是额外的有序数据结构：每次写入都要维护它，也会占用存储。不要为每个字段机械建索引，应从访问模式反推：

- 查询条件和排序是什么？
- 是否需要唯一性？
- 是精确键、上下界范围还是前缀范围？
- 一次 `getAll()` 会不会把数万条记录全部搬进内存？

大结果集优先使用 cursor 分页或逐条处理。分页游标最好使用稳定、有唯一补充键的排序，例如 `(updatedAt, id)`，避免相同时间戳造成漏项或重复。

## 12. 离线写入的核心：本地状态与同步意图必须原子化

假设先保存草稿，再单独写入“待同步”队列：

```text
保存草稿成功 → 页面崩溃 → 尚未写入同步任务
```

用户看到本地新内容，但系统永远不知道要上传。反过来，先写任务再写草稿也会产生不存在的任务。解决方法是在同一个 IndexedDB `readwrite` 事务中同时修改两个 object store：

<<< ../../../examples/frontend/browser-storage/unit-of-work.ts

这就是本地 **Outbox Pattern**：领域写入与“稍后发送”的意图共享一个原子提交点。事务成功时二者都存在，失败时二者都不存在。

一个容易被忽视的限制是：IndexedDB 事务无法与服务端数据库组成跨网络原子事务。网络同步必须接受“请求可能已到达服务器，但客户端没收到响应”的不确定性，因此还需要幂等设计。

## 13. Outbox 状态机、多标签页租约与重试

示例队列记录包含：

<<< ../../../examples/frontend/browser-storage/types.ts

队列不能只是一个 `pending: boolean`。至少需要尝试次数、下次执行时间、最近错误和失败状态，才能诊断和恢复。

多个标签页可能同时启动同步器。若它们都读取同一 pending 记录再发送，会产生重复请求。下面的 `claimNext` 在一个 `readwrite` 事务中通过 cursor 找候选项并写入短租约，使“选择 + 占用”成为原子操作：

<<< ../../../examples/frontend/browser-storage/outbox-repository.ts

租约不是永久锁。标签页发送中崩溃后，`leaseExpiresAt` 到期，其他执行者可以接管。租约时长必须覆盖大多数请求，但仍要依赖服务端幂等，因为请求可能超过租约或客户端时钟发生变化。

同步引擎执行状态转换，并对可重试失败使用带随机抖动的指数退避：

<<< ../../../examples/frontend/browser-storage/sync-engine.ts

退避用于防止离线恢复时所有客户端同时重试。`navigator.onLine` 只能作为调度提示：`true` 可能只能连接到需要认证的门户，`false` 也不应该替代真正的请求结果。最终判断必须来自 `fetch` 的异常和 HTTP 响应。

## 14. 幂等、HTTP 分类和版本冲突

超时具有歧义：服务器可能已经保存成功，只是响应丢失。客户端重试同一个逻辑操作时必须复用原记录中的 `idempotencyKey`，而不是每次生成新键。

<<< ../../../examples/frontend/browser-storage/sync-transport.ts

服务端应在用户或租户边界内持久记录幂等键及结果，使相同键重复提交返回同一逻辑结果。幂等键不能只在单个进程内存中保存，否则进程重启或负载均衡后会失效。

失败应分类，而不是一律重试：

- 网络异常、`408`、`429`、多数 `5xx`：通常可重试，并尊重 `Retry-After`；
- `401`：暂停并等待重新认证，不能无限重试；
- `403`、大部分业务 `4xx`：需要修复数据或权限，自动重试无意义；
- `409` / `412`：表示版本冲突，需要获取服务端新版本并让领域策略解决；
- `2xx`：只有业务契约确认成功后才能删除 outbox 记录。

示例用 `If-Match` 表达“仅当远端仍是 baseVersion 时更新”。这比不加条件的最后写入获胜更诚实，因为后者会悄悄覆盖另一设备的修改。

冲突解决策略取决于领域：计数器可以合并增量，标签集合可以按集合规则合并，长文本可能需要三方合并或用户选择。时间戳最后写入获胜依赖时钟且会丢数据，不应被当作默认正确答案。CRDT 适合真正的多写者实时协作，但会引入元数据、删除语义和压缩治理成本。

## 15. Cache API：显式的 Request / Response 仓库

Cache API 保存 `Request` 到 `Response` 的映射。它与浏览器 HTTP 缓存不是一回事：

- HTTP 缓存根据响应头、验证器和请求缓存模式参与正常网络栈；
- Cache API 由应用代码显式 `match`、`put`、`delete`；
- Cache API 不会自动根据 `Cache-Control: max-age` 删除或刷新旧响应；
- Cache API 可在窗口和 Worker 中使用，Service Worker 只是最常见的协调者；
- `fetch()` 对 `404`、`500` 仍会正常返回 `Response`，只有网络级失败才 reject。

下面只缓存同源、无 Authorization、成功、未声明 `no-store`，并由服务端通过 `X-App-Cache-Scope: public` 明确标记为公开的 GET 响应，同时用缓存名版本做清理：

<<< ../../../examples/frontend/browser-storage/response-cache.ts

真实系统还要定义缓存策略：

- **cache first**：版本化静态资源，速度优先；
- **network first**：经常变化的文档，失败时回退缓存；
- **stale while revalidate**：先返回旧响应，同时后台更新；
- **network only / cache only**：明确不缓存，或离线包中的固定资源。

不要缓存带用户隐私的响应，除非缓存键、用户隔离、退出清理和威胁模型都已设计清楚。只检查 URL 或 `Authorization` 请求头通常不够，因为身份也可能来自 Cookie；请求头、语言、租户和身份都可能影响响应内容。示例中的自定义响应头是一项应用契约，服务器只有确认响应与用户身份无关时才能设置它。

### Service Worker 不是 Cache API 的前置条件

页面可以直接调用 `caches.open()`，但只有 Service Worker 能拦截导航和子资源请求，从而在应用尚未启动时提供离线响应。Service Worker 自己也可能被终止，因此不能依赖全局变量保存队列状态；持久状态仍应放 IndexedDB 或 Cache API。

Service Worker 更新还涉及旧 worker 与新页面并存。缓存名要版本化，删除旧缓存应在新版本激活阶段谨慎进行，并避免清除仍由旧客户端使用的资源集合。

## 16. 容量、持久存储与驱逐

IndexedDB、Cache API、OPFS 等通常受 origin 存储配额共同管理。默认是 best-effort：只要低于配额、设备空间充足且用户未清理，数据通常会保留，但在存储压力下可能被浏览器驱逐。

`navigator.storage.estimate()` 返回估计的 `usage` 和 `quota`，不是精确承诺；浏览器可能为隐私而填充统计。`persist()` 请求将 origin 设为持久存储，是否批准由浏览器策略决定：

<<< ../../../examples/frontend/browser-storage/storage-capacity.ts

完整示例只在用户明确产生重要离线内容后请求持久化，而不是首次访问就请求。即使返回 `true`，用户仍可主动清除站点数据。

写入可能抛出 `QuotaExceededError`。恢复策略应按价值清理：先删可重建响应缓存和过期数据，再处理旧快照；不要静默删除尚未同步的用户内容。容量告警也应包含“哪类数据占用多少”的应用级统计，而不只记录一个总 usage。

浏览器驱逐通常以 origin 为边界，IndexedDB 与 Cache API 可能一起消失。因此把“索引在 IDB、正文在 Cache API”分开并不能形成两份独立备份。

## 17. 安全、隐私与用户边界

浏览器本地持久化不是秘密保险箱：

- 同源 XSS 通常能够读取 JavaScript 可访问的 Web Storage 和 IndexedDB；
- 把密钥和密文一起存在同一 origin，只能降低磁盘直接检查风险，不能抵抗正在运行的 XSS；
- 敏感令牌优先使用恰当属性的 `HttpOnly` Cookie，并在服务端完成授权；
- 日志、错误上报和调试导出不能顺带上传草稿、token 或个人数据；
- 数据要有保留期、清理入口和账户删除语义。

多用户共用设备时，键名不能只写 `current-user`。登录用户或租户切换后，应关闭连接、停止同步器、清除或切换命名空间，再加载新用户数据。否则可能把上一用户草稿展示给下一用户，或用新凭证上传旧用户队列。

登出时是否清除离线草稿是产品决定，但必须显式设计：清除会造成未同步内容丢失，不清除会产生本机隐私风险。可以在登出前提示、完成同步、导出或确认清除。

## 18. 完整示例如何串联

页面入口负责打开数据库、监听其他标签页的失效通知、保存草稿并在退出时释放资源：

<<< ../../../examples/frontend/browser-storage/main.ts

演示页面源码如下，确保课程页面能够看到完整 HTML，而不是只给出无法追踪的局部片段：

<<< ../../../examples/frontend/browser-storage/index.html

生产流程可以概括为：

```text
用户编辑
  ↓
短事务：保存领域数据 + 添加 Outbox
  ↓ commit
立即更新 UI，并广播失效通知
  ↓
任一标签页/Worker 原子领取任务（带租约）
  ↓
事务外发送携带幂等键和版本条件的请求
  ├─ 成功 → 短事务删除任务
  ├─ 临时失败 → 退避并重新排期
  ├─ 版本冲突 → 保存冲突状态，等待合并
  └─ 永久失败 → 标记 failed，向用户提供恢复入口
```

## 19. 测试策略：不要只测 happy path

存储层测试至少分三层：

1. **纯函数单元测试**：记录迁移、运行时解析、退避计算、HTTP 错误分类；
2. **仓储契约测试**：在临时数据库中验证事务提交、索引查询、唯一性和 abort；
3. **真实浏览器集成测试**：升级阻塞、多标签页领取、刷新恢复、Service Worker 与配额错误。

内存版 IndexedDB 模拟器适合快速反馈，但不一定完全复现真实事务自动提交、结构化克隆、浏览器关闭和配额行为。关键并发与生命周期测试必须落到目标浏览器。

建议覆盖以下故障注入：

- 从数据库版本 1、2 和空数据库分别升级到当前版本；
- 升级时保留一个旧标签页连接，确认新页显示 blocked 状态；
- 在“领域写入 + Outbox”中让第二次写入失败，确认两者都回滚；
- 两个同步器同时领取，确认同一时刻只有一个获得任务；
- 服务端已成功但客户端超时，确认重试复用幂等键；
- 模拟 `QuotaExceededError`、存储访问被拒和损坏记录；
- 用户切换、登出和缓存版本升级后，确认数据不会串号；
- 页面在写入、发送或迁移中间关闭，重新打开后能够恢复。

## 20. 可观察性与用户体验

“离线优先”不等于把失败藏起来。用户至少需要区分：已保存到本机、正在同步、已同步、存在冲突、永久失败。界面上的“已保存”必须说明保存到哪里。

监控指标可以包括：

- outbox 长度、最老任务年龄、尝试次数分布；
- 按错误类别统计的同步失败率；
- 数据库打开与升级耗时、blocked 次数；
- `QuotaExceededError` 次数和缓存清理量；
- 记录迁移失败数与未知 schema 版本；
- 冲突率和人工解决耗时。

记录诊断信息时使用实体类型、任务 ID 和错误类别，不要直接记录正文、Cookie、Authorization 或完整个人数据。

## 21. 常见反模式及其根因

### 把所有数据塞进 `localStorage`

根因是只看 API 简单，不看同步阻塞、容量、查询和事务需求。结果是主线程卡顿、整块 JSON 竞争覆盖、损坏后全部不可读。

### TypeScript 接口当作磁盘校验

类型在编译后不存在，无法验证旧版本或损坏数据。必须在 I/O 边界做运行时解析和迁移。

### request success 时立即提示“已保存”

事务仍可能失败。应等待 `complete`，失败时保留用户输入并给出恢复路径。

### 在 IndexedDB 事务里等待网络

网络等待会让事务失活，也会不必要地延长锁竞争。短事务只做本地原子操作，网络放到事务外。

### 依赖 `navigator.onLine` 决定是否成功

它只表示浏览器感知到的网络连接，不代表目标服务可达。以实际请求结果为准。

### 失败后一律无限重试

权限错误和校验错误不会因为等待而消失。分类、限制次数、退避，并提供人工恢复入口。

### 把 BroadcastChannel 当数据库

晚加入或关闭的标签页会错过消息。消息用于失效通知，持久数据和状态机仍放 IndexedDB。

### Cache API 放进去就永远新鲜

Cache API 不自动执行 HTTP 新鲜度策略。应用必须定义匹配、更新、版本和删除规则。

## 22. 选型检查表

为一份新数据选择存储前，按顺序回答：

1. 它是否应该进入每个匹配的 HTTP 请求？只有少量 HTTP 状态才考虑 Cookie。
2. 是否只需活到当前页面或标签页？优先内存或 `sessionStorage`。
3. 是否只是少量、低频、非敏感偏好？可用有防御性封装的 `localStorage`。
4. 是否需要结构化数据、查询、事务或较大容量？使用 IndexedDB。
5. 是否天然是 HTTP Request / Response？考虑 Cache API，并定义新鲜度策略。
6. 是否是大型文件或需要文件式访问？评估 OPFS，同时检查兼容性与降级。
7. 丢失能否重建？不能重建的数据必须尽快同步、明确状态，并考虑持久存储。
8. 谁会并发修改？单页、多标签页、Worker、其他设备分别需要不同协调协议。
9. schema 如何升级和回滚？谁校验磁盘数据？
10. 用户切换、登出、清理、配额不足和永久失败时怎么办？

## 23. 参考资料

- [MDN：Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)
- [MDN：Using IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB)
- [MDN：IDBTransaction](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction)
- [MDN：Broadcast Channel API](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API)
- [MDN：Cache](https://developer.mozilla.org/en-US/docs/Web/API/Cache)
- [MDN：PWA caching strategies](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Caching)
- [MDN：StorageManager](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager)
- [MDN：Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [MDN：Using HTTP cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies)
- [WHATWG：Indexed Database API 3.0](https://w3c.github.io/IndexedDB/)
- [WHATWG：Storage Standard](https://storage.spec.whatwg.org/)

## 24. 本节小结

浏览器存储的核心不是“哪个 API 能把值留下来”，而是数据所有权、生命周期和失败语义：

- Cookie 服务于 HTTP 状态；Web Storage 只适合少量简单状态；
- IndexedDB 用短事务、索引和运行时 schema 管理结构化数据；
- 数据库结构迁移与记录内容迁移是两个独立问题；
- 离线写入要把领域数据和 Outbox 意图原子提交；
- 多标签页用租约协调执行，用广播做失效通知；
- 网络重试必须配合服务端幂等与版本冲突检测；
- Cache API 是显式响应仓库，不会自动实现 HTTP 缓存策略；
- 本地数据默认不是永久备份，配额、驱逐、用户清理和安全边界都必须进入设计。

下一节将进入浏览器安全模型，系统分析 XSS、CSRF、CSP、Trusted Types、跨源隔离，以及这些机制如何共同构成前端安全边界。
