---
title: PWA、Service Worker、后台同步与离线应用架构
description: 系统掌握 Service Worker 生命周期、缓存策略、离线一致性、Outbox、后台同步、Web App Manifest、更新发布、安全与生产治理
---

# PWA、Service Worker、后台同步与离线应用架构

PWA 不是“加一个 manifest，再把所有请求塞进 Cache”。它是一组渐进增强能力：可安装外壳、Service Worker 网络代理、本地数据、离线交互、后台事件，以及与操作系统更接近的启动体验。

一旦 Service Worker 开始控制页面，它就位于应用和网络之间。错误缓存可以让用户长期运行旧 JavaScript，错误更新可能把新页面与旧 API 契约混在一起，错误离线写入会在联网后重复下单或覆盖他人修改。因此，PWA 首先是分布式状态与发布问题，然后才是安装按钮。

## 学习目标

完成本课后，你应该能够：

- 解释 PWA、Web App Manifest、Service Worker 和 Cache API 的职责边界；
- 准确描述 download、install、waiting、activate 与 control 生命周期；
- 理解 `skipWaiting()`、`clients.claim()` 为什么不是无条件最佳实践；
- 为导航、不可变资源、图片和 API 选择正确缓存策略；
- 区分 Cache Storage、HTTP 缓存、IndexedDB 与业务服务器的数据真相；
- 使用 Outbox、幂等键和冲突策略设计离线写入；
- 在 Background Sync 不可用时提供前台恢复路径；
- 设计可安装体验、更新提示、缓存迁移、回滚和生产观测；
- 处理认证、隐私、存储配额、浏览器兼容和可访问性。

## 一、先定义产品的离线承诺

“支持离线”至少有四个等级：

| 等级 | 用户能力 | 主要工程要求 |
| --- | --- | --- |
| 离线提示 | 看到品牌化错误页 | 预缓存最小 fallback |
| 离线浏览 | 打开最近内容 | 页面壳、响应缓存或 IndexedDB |
| 离线编辑 | 本地保存草稿 | 本地领域模型、Outbox、冲突处理 |
| 离线协作 | 多设备最终汇合 | 操作日志、版本向量/CRDT 或明确合并协议 |

不要只写“离线可用”。应逐项说明哪些页面可打开、数据有多旧、哪些操作只保存到本机、什么时候同步、冲突如何呈现、用户怎样撤销。

## 二、PWA 的五个平面

```text
展示面：安装入口、离线提示、更新提示、同步状态
网络面：Service Worker fetch 路由与缓存策略
数据面：Cache Storage、IndexedDB、Outbox、服务端版本
生命周期面：install、waiting、activate、controllerchange
治理面：配额、安全、观测、发布、清理与兼容
```

Manifest 描述应用如何被系统展示，不负责缓存；Service Worker 可以工作在未安装的网站中；安装 PWA 也不自动让业务数据离线可用。把这些概念分开，才能定位问题。

## 三、Service Worker 是可终止的事件处理器

Service Worker 没有 DOM，运行在 worker 上下文，浏览器可在空闲时终止它，再为事件重新启动。不要依赖模块级变量长期存在，也不要在其中使用 `localStorage`。

可靠状态应放在：

- Cache Storage：HTTP Request/Response；
- IndexedDB：结构化业务数据、Outbox 和元数据；
- 服务端：跨设备权威状态；
- 事件 payload：本次处理所需的有限信息。

`event.waitUntil(promise)` 把异步工作与事件生命周期关联。若在 install、activate、sync 或消息处理中启动 Promise 却不传给 `waitUntil`，worker 可能在工作完成前被终止。

Service Worker 一般要求安全上下文；本地开发的 localhost 有特殊便利。脚本位置和注册 scope 决定它能控制哪些 URL，不能靠 manifest 的 scope 扩大 Service Worker 控制范围。

## 四、生命周期的安全意图

典型流程：

```text
首次：download → install → activate → 控制后续页面
更新：download → install → waiting → activate → 控制后续页面
```

浏览器比较 Service Worker 脚本内容发现新版本后，会让新 worker 安装，但在旧 worker 仍控制页面时通常进入 waiting。这样一个页面生命周期内不会突然换掉网络代理和缓存协议。

### install

适合准备当前版本运行不可缺少的最小应用外壳。`cache.addAll()` 任何一个资源失败都可能使 install 失败，这是保证原子安装的一种方式，但预缓存列表过大也会降低安装成功率。

### activate

适合删除明确属于旧版本的缓存、执行兼容迁移。不要删除同源所有 cache，因为其他子应用也可能使用 Cache Storage。

### control

worker activate 不等于当前页面已经受控。页面在创建时确定 controller，默认通常要下一次导航才受控。`clients.claim()` 可让新激活 worker 接管现有页面，但也会增加版本混用风险。

## 五、skipWaiting 不是“修复更新”的魔法

`skipWaiting()` 让 waiting worker 尽快 activate。如果随后 `clients.claim()`，已经打开的旧页面可能立即由新 worker 处理请求。

设想旧页面的 JS 发送 v1 请求，而新 worker 只认识 v2 cache key；或者新 worker 删除了旧页面仍要动态加载的 chunk。立即接管就可能制造无法恢复的混合版本。

更稳妥的更新流程：

1. 新 worker 安装并进入 waiting；
2. 页面显示“新版本可用”；
3. 用户在安全时机确认；
4. 页面向 waiting worker 发送 `SKIP_WAITING`；
5. 监听 `controllerchange`；
6. 只刷新一次，让页面、worker 与资源版本重新对齐。

对于无状态、向后兼容且可安全重载的应用，可以自动更新；这是经过验证的产品决策，不是复制模板的默认值。

## 六、注册与更新控制器

<<< ../../../examples/frontend/pwa-offline-architecture/register-service-worker.ts

示例保留稳定脚本 URL，并使用 `updateViaCache: "none"` 控制更新检查对 HTTP cache 的使用。不要给 Service Worker 文件名加内容 hash 后不断注册新 URL；浏览器更新机制本来就会检查稳定 URL 的内容差异。

`updatefound` 还会发生在首次安装，只有已经存在 controller 时，新的 installed worker 才代表应用更新。`controllerchange` 可能触发多次，因此刷新需要一次性保护。

更新提示应该可访问、可稍后处理，并说明刷新是否会影响未保存内容。

## 七、Cache API 不等于 HTTP Cache

HTTP cache 由响应头和浏览器缓存算法管理；Cache API 是应用显式操作的 Request/Response 存储。调用 `cache.match()` 不会自动判断业务数据是否过期，调用 `cache.put()` 也不会自动遵循你的认证、租户或隐私规则。

重要事实：

- Cache API 不会自动删除旧版本；
- `cache.put()` 会覆盖匹配 key；
- Response body 是流，存入 cache 与返回消费者时通常需要 clone；
- HTTP 404/500 对 Fetch 来说通常是正常 resolve，不会自动进入 catch；
- opaque response 无法读取状态和 header，缓存它会失去许多校验能力；
- 浏览器可在存储压力下回收站点数据。

因此 Cache API 是机制，缓存新鲜度、上限、隔离和失效仍是应用协议。

## 八、先做显式路由决策

不同资源不能共用一个“离线优先”策略：

<<< ../../../examples/frontend/pwa-offline-architecture/cache-policy.ts

示例只缓存同源 GET，并将请求分为：

- navigation：network first，离线时回退页面；
- 带内容 hash 的静态资源：cache first；
- 图片：stale while revalidate；
- 其他请求：network only。

它刻意不缓存 API。生产中只有明确分析了身份、租户、敏感性、失效和容量后，才为某类 API 添加规则。不能用 `/api/` 一个前缀决定所有数据的安全语义。

`mayStore` 只是客户端最后一道保守判断；服务端仍应发送正确的 `Cache-Control`、认证和变化标识。

## 九、四种常见策略

### 1. Network only

始终请求网络。适合实时、敏感、不可安全重放的请求。离线时明确失败。

### 2. Cache first

命中立即返回，否则请求并缓存。适合文件名含内容 hash 的不可变 JS/CSS/font；不适合 URL 不变但内容会更新的数据。

### 3. Network first

优先网络，失败时读 cache。适合导航和强调新鲜度但允许旧副本的内容。需要超时策略，否则“网络存在但极慢”时离线副本迟迟不显示。

### 4. Stale while revalidate

有 cache 就立即返回，同时在后台刷新。适合允许短暂陈旧的图片或公共内容。UI 必须接受本次仍看到旧值，下一次才更新。

完整策略实现：

<<< ../../../examples/frontend/pwa-offline-architecture/cache-strategies.ts

后台刷新通过 `waitUntil` 延长事件生命周期。缓存写入使用 `response.clone()`，避免同一 body 被两个消费者争用。network-first 只把网络异常和 5xx 视为回退信号；401、403、404 等业务响应原样返回，避免旧缓存掩盖权限变化或资源删除。

## 十、一个可审查的 Worker Runtime

<<< ../../../examples/frontend/pwa-offline-architecture/service-worker-runtime.ts

这个 factory 将 worker scope 和构建产生的配置注入，避免在教学代码中伪造真实 chunk 文件名。生产构建应根据 manifest 生成 `precacheUrls`，不能手工维护容易漏掉或不存在的资源。

缓存名包含应用前缀、用途和版本。activate 只删除属于当前应用且不再使用的旧 cache。fetch 未匹配时直接 return，让浏览器执行正常网络行为。

示例在 activate 中调用 `clients.claim()`，因此部署前必须保证新 worker 的路由对当前已打开页面向后兼容。如果不能保证，应去掉 claim，让新页面自然受控。

## 十一、预缓存应当尽量小

适合预缓存：

- 离线 fallback；
- 当前版本启动必需的最小 HTML/CSS/JS；
- 很小且稳定的品牌资源。

不适合无条件预缓存：

- 全站所有课程、图片和视频；
- 用户未访问的语言包；
- 带身份的数据；
- 大型 source map；
- URL 不稳定或跨源 opaque 资源。

预缓存越大，首次 install 越慢，任意资源失败导致整次安装失败的概率越高，存储和流量也越多。其他资源按访问运行时缓存，并设置条目数、年龄和总字节预算。

## 十二、导航离线与 SPA/SSR

对 SPA，离线 navigation 常回退到 app shell，但不能把所有 404 URL 都改成 200 首页，否则服务器路由语义、搜索引擎和错误监控会失真。

对 SSR，network-first 可以缓存最近 HTML，但 HTML 可能包含用户信息、CSRF token、实验分组或短期数据。缓存前需要明确：

- 是否按用户隔离；
- 登出时删除哪些响应；
- HTML 与静态 chunk 是否版本兼容；
- 陈旧页面提交 mutation 是否安全；
- fallback 是通用离线页还是最近页面。

认证页面更常使用离线壳 + IndexedDB 中经过设计的最小数据，而不是直接缓存整份个性化 HTML。

## 十三、API 缓存与身份隔离

Cache key 主要来自 Request URL、method 及匹配选项，不会自动按当前登录账号划分。若 Alice 登出、Bob 在同一浏览器登录，错误设计可能向 Bob 返回 Alice 的缓存响应。

可选方案：

- 敏感 API 永不进入 Cache Storage；
- 使用按账号和 schema version 隔离的 IndexedDB 数据库；
- 登出时执行明确清理并等待完成；
- 服务端返回 `Cache-Control: no-store`；
- 缓存公共、不可个性化的数据，并在 key 中包含合法版本维度。

不要把 access token 放进 URL 来区分 cache，它会泄漏到历史、日志和监控。也不要缓存带 `Set-Cookie` 的响应。

## 十四、离线读取：Cache Storage 还是 IndexedDB

使用 Cache Storage，当数据天然是 HTTP Request/Response，主要按 URL 读取，并希望直接返回给 fetch。

使用 IndexedDB，当你需要：

- 按字段查询、排序和分页；
- 保存结构化领域实体；
- 执行事务；
- 管理 schema migration；
- 保存离线 mutation、草稿和同步元数据。

同一份业务数据同时存在 HTTP cache、IndexedDB、内存 store 和服务端时，必须定义谁是权威、各副本何时失效。否则“离线支持”会变成四套无法解释的缓存。

## 十五、离线写入必须保存业务意图

不要简单缓存失败的原始 POST Request。请求体可能含过期 token、一次性签名或已经失效的临时字段。更可靠的 Outbox 保存领域意图：

```text
operation: renameLesson
entityId: lesson-42
payload: { title: "新标题" }
idempotencyKey: stable-operation-id
baseVersion: 7
```

同步时用当前认证重新构造请求。服务端用 idempotency key 去重，并通过 base version/ETag 检测冲突。

示例把成功、可重试失败和永久失败分开：

<<< ../../../examples/frontend/pwa-offline-architecture/outbox.ts

永久失败进入 dead letter，让用户修正、放弃或导出；可重试失败停止本轮顺序处理，避免后续依赖操作越过前一项。`OutboxFlusher` 合并同一 JavaScript 上下文的并发 flush；窗口和 Service Worker 之间仍可能竞争，所以服务端幂等键不可省略。独立操作可以按实体分区并行，但必须由领域规则证明安全。

## 十六、冲突不是网络重试

离线期间，另一设备可能修改同一实体。重新联网收到 409/412 时，继续退避不会解决问题。常见策略：

- last-write-wins：简单但可能静默丢数据；
- compare-and-swap：携带 base version，冲突后由用户选择；
- 字段级 merge：仅适合字段相互独立且规则明确；
- operation transform/CRDT：适合高价值实时协作，但复杂度更高；
- append-only：评论、事件等可使用唯一 operation ID 追加。

UI 应展示“已保存在此设备”“正在同步”“需要处理冲突”“同步失败”，而不是离线点击后立刻显示与服务器成功相同的状态。

## 十七、Background Sync 是增强能力

Background Sync 可以注册 tag，让浏览器在认为网络恢复时唤醒 Service Worker 处理 `sync` 事件。但它不是所有主流浏览器都支持，也不保证在特定时刻执行。

因此架构必须先有前台 flush：应用启动、回到前台、用户手动重试或 `online` 事件时尝试同步；支持 Background Sync 的浏览器再额外注册。

<<< ../../../examples/frontend/pwa-offline-architecture/sync-scheduler.ts

`navigator.onLine === true` 只表示浏览器认为存在网络连接，不保证 API 可达、认证有效或门户登录完成。它是触发尝试的提示，不是成功证明。

后台任务应短小、幂等、有重试上限。大量上传、长视频处理或必须持续运行的任务不能假设 Service Worker 永不终止，应交给服务端长任务系统。

## 十八、Web App Manifest

Manifest 描述安装后的名称、图标、启动 URL、scope、主题色和 display 模式：

<<< ../../../examples/frontend/pwa-offline-architecture/app.webmanifest

关键字段：

- `id`：应用稳定身份，不应随营销参数变化；
- `start_url`：从系统图标启动的入口；
- `scope`：安装应用的导航边界，不等于 Service Worker scope；
- `display`：期望的显示模式，用户和平台可能有最终决定权；
- `icons`：提供足够尺寸，并为自适应图标准备 maskable 版本；
- `theme_color` / `background_color`：帮助启动和系统 UI 衔接。

Manifest 应使用稳定 URL，在可安装页面通过 `<link rel="manifest">` 引用，并以正确 JSON MIME 类型返回。平台更新 manifest 的时间和支持字段存在差异，不能假设部署后所有已安装客户端立刻更新图标。

## 十九、安装体验要渐进增强

浏览器和平台的安装入口不同，某些环境没有可编程安装提示。产品应：

- 网站本身先完整可用；
- 在用户理解价值后提示安装，而不是首次访问即打断；
- 仅在确实可安装时展示对应操作；
- 对 iOS/桌面等平台提供准确但不过时的说明；
- 记住用户暂时拒绝，避免每次访问重复弹出；
- 不把“安装”作为访问核心功能的门槛。

安装状态也不能只靠某一个事件永久判断；用户可能从系统卸载或在其他浏览器打开。

## 二十、存储配额、驱逐与持久化

离线数据不是永久磁盘。浏览器按实现和设备情况分配配额，并可能在存储压力下驱逐站点数据。可以使用 Storage API 估算 usage/quota，并在合适场景请求 persistent storage，但请求可能被拒绝。

设计原则：

- 关键未同步草稿有明确备份/导出能力；
- runtime cache 有条目、年龄和字节上限；
- 大媒体按需缓存并允许用户清理；
- 数据库 migration 可恢复，失败时不直接删除用户草稿；
- UI 展示离线内容占用和清理后果；
- 永远能从服务器重新构建可派生缓存。

不要在 activate 中进行无上限的大迁移；事件可能超时，失败还会阻止新 worker 正常启用。大迁移需要可分批、可重入并记录进度。

## 二十一、安全与隐私

Service Worker 能拦截 scope 内请求，属于高权限代码。必须：

- 只在 HTTPS 部署；
- Worker 脚本来自可信同源位置，配置严格 CSP；
- 不缓存认证响应、支付数据和敏感文档，除非有明确加密与威胁模型；
- 登出时清理账号隔离数据并撤销后台任务；
- Outbox 不保存长期 token，重放时取当前凭据；
- 消息事件校验结构和来源语义，不接受任意命令；
- 推送 payload、通知内容和离线日志遵循最小化原则；
- 防止 cache poisoning，把可缓存状态和来源限制写进策略。

客户端加密不能自动解决所有问题：密钥若与数据一起留在同一浏览器上下文，XSS 仍可能同时取得两者。首先减少敏感离线数据并加强应用安全。

## 二十二、框架与构建集成

Vite/框架插件可以生成 precache manifest、注入版本并封装 Workbox，但不能替你决定业务缓存和更新语义。

推荐边界：

```text
构建系统：生成带 hash 的资源与 precache 清单
Worker runtime：生命周期、路由、缓存和后台事件
应用 service：Outbox、IndexedDB、同步与冲突
UI store：可序列化的在线、更新和同步状态
组件：提示、操作与可访问反馈
```

开发环境中的 Service Worker 容易缓存旧资源，造成“改代码不生效”。使用浏览器开发工具的 update on reload、清理注册与独立测试 origin，但不要把仅开发环境的强制更新逻辑带到生产。

## 二十三、测试策略

### 1. 纯逻辑

缓存决策应脱离 worker 全局测试：

<<< ../../../examples/frontend/pwa-offline-architecture/cache-policy.test.mts

Outbox 测试验证成功删除、失败计数和顺序停止：

<<< ../../../examples/frontend/pwa-offline-architecture/outbox.test.mts

### 2. Worker 集成

用可控 Cache/Fetch 环境验证 install 原子性、旧 cache 清理范围、404/500、opaque response、离线 fallback、SWR 后台更新和非 GET 旁路。测试 Promise 是否确实交给 `waitUntil`。

### 3. 生命周期 E2E

至少部署 v1/v2 两个真实版本：

1. 打开两个 v1 tab；
2. 部署 v2；
3. 确认 v2 waiting 且 v1 不被破坏；
4. 用户确认更新；
5. 两个 tab 的 controller、刷新和未保存状态符合协议；
6. 验证旧 chunk、旧 cache 与数据库 schema 的迁移。

单纯在 DevTools 勾选 offline 不能覆盖更新竞态。

### 4. 离线与恢复

覆盖首次访问即离线、缓存后离线、慢网络、DNS 失败、API 5xx、认证过期、账号切换、Outbox 重放、409 冲突、Background Sync 缺失、浏览器清理存储和设备休眠。

## 二十四、可观测性

建议观测：

- worker version、页面 build version 与 controller version 是否一致；
- install/activate 失败原因与 waiting 时长；
- 各路由策略的 cache hit、network fallback 和响应时延；
- offline fallback 展示次数；
- Outbox 长度、最老项年龄、重试和 dead letter；
- 冲突率、同步成功时延和后台/前台触发来源；
- Cache/IndexedDB 大小估算和清理结果；
- 更新确认、刷新失败和回滚率。

Service Worker 可能在页面关闭后运行，不能只依赖页面内日志。遥测本身也需要离线缓冲上限，避免网络恢复时形成请求风暴。日志不得包含敏感缓存内容或完整 mutation payload。

## 二十五、发布、回滚与兼容窗口

用户可能数周不打开应用，因此生产中长期存在多个客户端版本。服务端 API、数据库 schema 和缓存策略要有兼容窗口。

发布原则：

- HTML 尽量不被长期缓存，能指向当前带 hash 资源；
- 已发布的 hash 静态资源保留足够长时间，不立即删除；
- Worker 脚本 URL 稳定且更新检查可达；
- 新 Worker 能理解旧页面请求，或等待页面刷新后接管；
- IndexedDB migration 向前兼容、幂等且可恢复；
- 服务端支持旧 Outbox operation 一段时间；
- 回滚同时考虑页面、worker、cache、schema 和 API。

“重新部署旧代码”不一定回滚：客户端可能已有新数据库迁移和新缓存。每次发布都应记录版本矩阵与恢复方案。

## 二十六、常见失败模式

### 失败一：install 时缓存全站

首次安装慢且容易因单资源失败而失败。只预缓存最小可靠外壳。

### 失败二：所有 GET 都 cache first

用户长期看到陈旧 API 和 HTML。按资源不变量选择策略。

### 失败三：无条件 skipWaiting + claim

旧页面立刻遇到新 worker，产生混合版本。验证兼容或让用户确认刷新。

### 失败四：更新 Service Worker 文件名

旧注册仍指向旧 URL，无法按预期更新。保持注册脚本 URL 稳定。

### 失败五：activate 删除同源所有 cache

误删其他应用或仍被旧页面使用的资源。使用应用前缀和版本所有权。

### 失败六：把 online 当作 API 可用

连接可能经过门户、DNS 或服务故障。实际请求成功才是事实。

### 失败七：失败 POST 原样无限重放

凭据过期、重复副作用、永久 4xx 形成风暴。保存领域意图、幂等键和重试分类。

### 失败八：Background Sync 是唯一同步路径

不支持的浏览器永远无法同步。应用启动、前台和手动操作必须能 flush。

### 失败九：账号切换不清理离线数据

下一账号读取上一账号内容。按身份隔离并在登出事务中清理。

### 失败十：缓存 404/500 当成功

Fetch 不会因 HTTP 错误自动 reject。写 cache 前检查 status 和策略。

### 失败十一：依赖 Worker 内存保存队列

Worker 随时可被终止。队列持久化到 IndexedDB。

### 失败十二：只测试首次安装

真正危险的是 v1/v2 并存、waiting、刷新和回滚。测试完整版本序列。

## 二十七、渐进落地路线

### 阶段一：可靠更新和离线提示

- 稳定 Worker URL 与明确 scope；
- 最小 offline fallback；
- 小型 precache 与版本化 runtime cache；
- waiting 更新提示和一次性刷新；
- 生命周期 E2E 与监控。

### 阶段二：离线读取

- 按路由不变量选择缓存策略；
- 公共与身份数据分离；
- IndexedDB 领域数据和 schema migration；
- 配额、清理和陈旧度 UI；
- SSR/SPA 的导航 fallback 语义。

### 阶段三：离线写入和系统集成

- 领域 Outbox 与服务端幂等；
- 冲突协议和 dead letter UI；
- 前台同步为基础，Background Sync 渐进增强；
- manifest、安装体验与平台矩阵；
- 多版本 API 兼容、灰度和回滚演练。

## 二十八、上线检查清单

- [ ] 离线承诺按页面和操作定义，不使用模糊的“全站离线”；
- [ ] Worker 使用 HTTPS、稳定 URL、正确 scope 和最小权限；
- [ ] install 只预缓存最小可靠资源，并正确使用 `waitUntil`；
- [ ] activate 只清理本应用拥有且确定废弃的 cache；
- [ ] `skipWaiting`、`clients.claim` 与刷新策略经过版本兼容验证；
- [ ] 导航、hash 资源、图片和 API 使用各自明确策略；
- [ ] 非 GET、跨源、opaque、错误和 `no-store` 响应处理清晰；
- [ ] 用户/租户敏感数据不会因 Cache key 泄漏给其他账号；
- [ ] Cache Storage、IndexedDB、内存和服务端的权威关系明确；
- [ ] Outbox 保存业务意图、当前认证外置并使用幂等键；
- [ ] 409/412 进入冲突流程，不作为普通网络错误无限重试；
- [ ] Background Sync 有应用启动、前台、online 和手动兜底；
- [ ] manifest 的 id、start_url、scope、icons 和颜色已在目标平台验证；
- [ ] 安装提示渐进增强，不阻止普通网页使用；
- [ ] 缓存条目、年龄、字节、Outbox 与数据库迁移有上限；
- [ ] 登出、账号切换、存储驱逐和用户清理流程已测试；
- [ ] v1/v2 多 tab、waiting、controllerchange、回滚完成 E2E；
- [ ] 服务端 API、静态资源和 Outbox operation 有足够兼容窗口；
- [ ] 观测能区分页面、worker、cache、数据库和同步版本；
- [ ] 日志、离线内容和通知遵守隐私与最小化原则。

## 总结

成熟 PWA 的价值不是“像原生应用”，而是在不可靠网络和长期多版本客户端中仍保持可理解、可恢复：

- Manifest 管理安装元数据，Service Worker 管理 scope 内网络事件；
- 生命周期的 waiting 默认保护页面版本一致性，立即接管必须有兼容证明；
- Cache API 只提供存储原语，路由策略、失效和身份隔离由应用负责；
- Cache Storage 适合 Request/Response，IndexedDB 适合结构化离线领域数据；
- 离线写入用 Outbox、幂等与冲突协议，不重放过期原始请求；
- Background Sync 是增强能力，前台同步路径始终存在；
- 配额、驱逐、迁移、更新 E2E 和版本兼容决定 PWA 能否安全上线。

当用户能清楚知道当前数据是否最新、操作是否只保存在本机、何时同步、冲突怎样解决以及新版本何时生效，离线体验才真正可靠。

## 参考资料

- [MDN：Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [MDN：Using Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)
- [MDN：Cache](https://developer.mozilla.org/en-US/docs/Web/API/Cache)
- [MDN：Cache.put](https://developer.mozilla.org/en-US/docs/Web/API/Cache/put)
- [MDN：SyncManager](https://developer.mozilla.org/en-US/docs/Web/API/SyncManager)
- [web.dev：The service worker lifecycle](https://web.dev/articles/service-worker-lifecycle)
- [web.dev：Web app manifest](https://web.dev/learn/pwa/web-app-manifest)
- [web.dev：Update](https://web.dev/learn/pwa/update)
- [W3C：Service Workers](https://w3c.github.io/ServiceWorker/)
- [W3C：Web Application Manifest](https://www.w3.org/TR/appmanifest/)
