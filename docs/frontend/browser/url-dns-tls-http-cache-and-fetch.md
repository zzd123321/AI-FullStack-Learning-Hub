---
title: 从 URL 到响应：DNS、TLS、HTTP 缓存与 Fetch
description: 系统理解 URL 与 Origin、DNS、TCP/QUIC、TLS、HTTP/1.1 到 HTTP/3、缓存、CORS、Cookie、Service Worker、Fetch 与网络性能诊断
outline: deep
---

# 从 URL 到响应：DNS、TLS、HTTP 缓存与 Fetch

> “在地址栏输入 URL 后发生了什么”不是一条固定瀑布线。Service Worker、HTTP Cache、连接复用、预连接、代理、CDN 和协议协商都可能让某些阶段跳过、重叠或改道。本节建立的是可用于诊断的分层模型，而非要求每次请求都机械经历全部步骤。

前端代码里的一行 `await fetch('/api/lessons')`，可能完全没有访问网络，也可能经历 DNS、连接、TLS、代理和多层缓存；它还可能已经抵达服务器，却因为 CORS 被浏览器拒绝交给 JavaScript。要正确诊断，不能把所有失败都叫“接口报错”。

本课沿一次请求的决策顺序前进：

```text
解析最终 URL 并确定安全策略
  → 查找可复用的 Service Worker / Cache / Connection
  → 必要时解析 DNS、建立连接并协商 TLS/HTTP
  → 收到 Status 与 Headers
  → Fetch/CORS 决定脚本能看到什么
  → 流式读取、解码并校验 Body
  → 用 Timing 和 Network 面板定位慢在哪一层
```

## 请求从 URL 和 Origin 开始

### URL 是解析与安全边界的起点

考虑：

```text
https://user:pass@api.example.com:443/v1/lessons?id=42#section
└scheme┘          └── host ──┘port└── path ──┘query└fragment┘
```

- `scheme` 决定默认端口和处理方式。
- `host` 可以是域名或 IP Literal；域名需要解析。
- `port` 未显式出现时使用 Scheme 默认端口。
- `path + query` 通常组成 HTTP Request Target。
- `fragment` 只在客户端使用，不随普通 HTTP 请求发送给服务器。
- URL 中的 Username/Password 容易泄露到日志、历史和界面，现代应用应禁止。

不要用字符串拼接构造安全敏感 URL：

```ts
const unsafe = base + '/users/' + userInput
```

输入中的 `..`、`//evil.example`、Query/Percent Encoding 会改变含义。使用 `URL`/`URLSearchParams` 解析，再校验最终 Protocol 和 Origin：

<<< ../../../examples/frontend/browser-network-fetch/url-policy.ts

Allowlist 校验必须发生在解析和相对 URL Resolution **之后**。`startsWith('https://api.example.com')` 会错误接受 `https://api.example.com.evil.test`。

### Origin、Site 与 URL 不相同

HTTP(S) Origin 是 `(scheme, host, port)` Tuple。以下 URL 不同源：

```text
https://example.com       vs http://example.com       scheme 不同
https://api.example.com   vs https://www.example.com  host 不同
https://example.com:443   vs https://example.com:8443 port 不同
```

默认端口规范化后，`https://example.com` 与 `https://example.com:443` 同源。Path 不参与 Origin，所以 `/a` 与 `/b` 同源。

“Same-site” 是 Cookie/Site Isolation 等策略使用的另一概念，通常围绕 Registrable Domain 与 Scheme；两个 Subdomain 可能 Same-site 但 Cross-origin。不要看到 Cookie 能发送，就假定 JavaScript 能读取 Cross-origin Response。

`file:`、`data:`、Sandboxed iframe 等还可能具有 Opaque Origin，不能用普通 Host 直觉推理。业务代码用 `URL.origin` 和浏览器安全模型，不手写 Domain Suffix 算法。

### 一次请求的概念路径

```text
JavaScript / Navigation / Parser / CSS
              ↓
Fetch Algorithm：Mode、Credentials、Redirect、CSP、Mixed Content
              ↓
Service Worker（若控制当前页面且请求可被拦截）
              ↓
HTTP Cache / Preload / Existing Connection
              ↓ cache miss / validation
Proxy / DNS / Connection / TLS / HTTP Exchange
              ↓
Response Headers 可用 → Response / Body Stream
              ↓
Decode / Parse / Runtime Validate / Render
```

现实中：DNS Prefetch、Preconnect、HTTP/3 Discovery 可提前发生；现有 H2/H3 Connection 可直接复用；Service Worker 可能完全从 Cache API 返回；HTTP Cache 可能 Fresh Hit，根本没有网络包。

## 浏览器怎样找到并连接服务器

### DNS：域名到可连接端点

DNS Resolution 可能涉及：

1. 浏览器自己的 Host Cache。
2. 操作系统 Cache、Hosts 配置和 Resolver。
3. Recursive Resolver Cache。
4. 从 Root、TLD 到 Authoritative Nameserver 的查询。
5. CNAME/Alias 链与最终 A（IPv4）、AAAA（IPv6）地址。

TTL 控制 DNS Record 可缓存时间，但实际缓存、负缓存和 Resolver 策略可能受实现与运维约束。低 TTL 不等于即时全网切流；旧连接、CDN Cache 和客户端缓存仍可能继续服务。

HTTPS/SVCB 类型可帮助客户端发现 Alternative Endpoint 和协议能力。DoH/DoT 保护 DNS Query 传输链路，但并不自动隐藏所有连接元数据，也不改变 Origin Server 的 HTTP 语义。

应用 JavaScript 通常不能直接获知“本次 DNS 到底查询了哪个 Resolver”。Resource Timing 中 DNS 段为 0 可能表示 Cache Hit、Connection Reuse、Timing 被隐私策略隐藏，不能简单解释成 DNS 瞬间完成。

### 地址选择与连接复用

DNS 可能返回多个 IPv6/IPv4 Address。User Agent/Network Stack 可并行或错开尝试，以避免某一种路径故障拖慢全部连接。最终连接到哪个 IP 不由前端代码稳定控制。

浏览器还会维护 Connection Pool：同一 Origin 的后续请求可复用现有连接。HTTP/2/3 在证书、DNS、Origin 声明等条件满足时还可能 Connection Coalescing，但这是实现与协议约束共同决定的优化，不应当作业务正确性的依赖。

域名切分（Domain Sharding）曾用于 HTTP/1.1 增加并行连接，在 H2/H3 下常会破坏复用、压缩和拥塞控制。现代部署应先测量，不要照搬旧时代优化。

### TCP、QUIC 与“连接建立”

典型 HTTPS over HTTP/1.1 或 HTTP/2 使用 TCP；HTTP/3 使用 QUIC，通常承载于 UDP。简化比较：

| 特征 | HTTP/1.1 | HTTP/2 | HTTP/3 |
| --- | --- | --- | --- |
| 传输 | 通常 TCP | TCP | QUIC/UDP |
| 多路复用 | 协议内没有 | 多 Stream/单连接 | 多 QUIC Stream |
| Header 编码 | 文本字段 | HPACK | QPACK |
| 丢包影响 | 当前 TCP 连接 | TCP 层可阻塞所有 Stream | Stream 之间更独立 |
| 安全 | HTTP 或 HTTPS | 浏览器实践通常 TLS | QUIC 内建 TLS 1.3+ |

HTTP Semantics（Method、Status、Header、Cache）跨版本基本一致。版本升级改变的是 Framing/Transport，不会让 `GET`、ETag 或 404 失去原含义。

### HTTP/1.1：简单但并行能力有限

HTTP/1.1 没有协议级 Request Multiplexing。浏览器通常对一个 Origin 开多个 TCP Connection 以并行请求。Persistent Connection 能复用 Handshake，但每条连接的并发和队列仍有限。

`Connection: keep-alive`、Chunked Transfer Encoding 等属于 H1 语境；不要在 H2/H3 上强行注入 Connection-specific Headers。浏览器和 Server/Proxy 会为协议版本处理 Framing。

### HTTP/2：单 TCP 连接上的多路复用

H2 把 Request/Response 拆成 Binary Frame，多个 Stream 复用同一 TCP Connection，避免 H1 需要大量连接。Header 使用 HPACK 压缩。

但 TCP 向上提供整条连接的有序 Byte Stream：底层一个 Packet 丢失时，后续已到达 Byte 也要等待重传，多个 H2 Stream 都可能受影响。这是 Transport-level Head-of-line Blocking，不等于 H2 没有价值；在低丢包网络中，连接复用、Header 压缩和优先级仍能显著改善效率。

### HTTP/3：HTTP Semantics over QUIC

HTTP/3 使用 QUIC Stream。每个 Request/Response 通常占一个双向 Stream；一个 Stream 的丢包不会要求其他独立 Stream 等待相同 Byte Order。QUIC 还将 TLS 1.3 Handshake 与 Transport 建连结合，并支持 Connection ID 等能力。

它不是无条件更快：

- UDP 可能被网络设备阻止，客户端需要回退到 TCP-based HTTP。
- 首次发现 H3 Endpoint、Server/CDN 配置和拥塞状况都会影响结果。
- CPU、QPACK、Packet Size 和移动网络实现也有成本。
- 同一 Stream 内依旧要求可靠有序交付。

Resource Timing 的 `nextHopProtocol` 能提供实际协商线索，不能根据页面使用 HTTPS 就猜测一定是 h2/h3。

### TLS 1.3 在保护什么

TLS 主要提供：

- **Server Authentication**：通过 Certificate Chain 和 Hostname Validation 确认对端身份。
- **Confidentiality**：网络中间方不能直接读取 Application Data。
- **Integrity**：传输内容被篡改可检测。
- 可选 Client Certificate Authentication，但 Web API 常见身份机制通常是 Cookie/Token。

ClientHello 中的 SNI 帮助同一 IP 上的 Server 选择 Certificate/Virtual Host；ALPN 用来协商 `h2`、`http/1.1` 或 `h3` 等 Application Protocol。Certificate 过期、Hostname 不匹配、Chain 不受信或系统时间错误都可能中止连接。

TLS 不保证 Server 业务可信、不阻止 XSS，也不保护已经到达浏览器后的敏感数据。HTTPS 是必要的 Transport Security，不是应用安全的全部。

### TLS Resumption 与 0-RTT

Session Resumption 可减少后续连接的 Handshake 成本。TLS 1.3/QUIC 的 Early Data（0-RTT）可能让客户端在完整 Handshake 前发送 Application Data，但 Early Data 存在 Replay 风险。

因此会产生不可逆副作用的请求不能只因“TLS 加密”就安全使用 0-RTT。Server/Framework/CDN 必须决定哪些 Method/Route 可接受 Early Data，并对重放建立防护。前端无法单独修复错误的 0-RTT Server Policy。

## 从 HTTP 语义回到 `fetch()`

连接只是传输通道。请求是否安全、能否重试、怎样缓存，仍由 Method、Status 和 Header 的 HTTP 语义决定。

### HTTP Request/Response 语义

一个请求包含 Method、Target、Header 和可选 Content；响应包含 Status、Header 和可选 Content。

Method 属性很重要：

- Safe Method（如 GET/HEAD）语义上只读。
- Idempotent Method 重复执行与执行一次预期效果相同，如 PUT/DELETE 的目标语义通常如此。
- POST 通常既不 Safe 也不天然 Idempotent。

客户端不能靠约定掩盖 Server 错误：如果 GET `/delete?id=1` 会删除数据，预取、Crawler、Cache 和 Retry 都可能触发灾难。Method 语义必须由 Server 正确实现。

### `fetch()` 不是“发一个裸 HTTP 请求”

Fetch Standard 统一了 Redirect、CORS、Credentials、Cache Mode、Service Worker、CSP 和 Response Filtering。浏览器会控制许多 Forbidden Header，前端不能任意伪造 `Host`、`Content-Length`、Cookie 等底层字段。

```ts
const response = await fetch(url, {
  method: 'GET',
  mode: 'cors',
  credentials: 'same-origin',
  cache: 'default',
  redirect: 'follow',
  signal,
})
```

`fetch` Promise 通常在 Response Headers 已可用时 Fulfill，Body 仍可通过 `ReadableStream` 逐步消费。`await response.json()` 才会读取并解析完整 JSON Body。

### Fetch 的错误语义

`fetch()` 在 HTTP 404、409、500 时通常仍然 Fulfill；这些都是成功获得的 HTTP Response。只有 Network Error、CORS Failure、Abort 等使 Promise Reject。

可靠封装必须分层处理：

1. URL/Policy Error。
2. Abort/Timeout。
3. Network/CORS Error（浏览器常刻意不给详细信息）。
4. HTTP Non-2xx。
5. Content-Type/Decode Error。
6. Runtime Schema Error。
7. Domain Error。

<<< ../../../examples/frontend/browser-network-fetch/fetch-json.ts

`response.ok` 只表示 Status 在 200–299，不能证明 JSON 结构正确。TypeScript Generic `fetchJson<User>()` 也不会校验网络数据，所以函数接收 Runtime Parser：

<<< ../../../examples/frontend/browser-network-fetch/api-types.ts

### 超时与取消是不同业务语义

Fetch 没有通用“Server Processing Timeout”配置；可使用 AbortSignal 管理客户端等待上限：

<<< ../../../examples/frontend/browser-network-fetch/request-signal.ts

组合信号保留了两类原因：父级 Abort 可能表示路由离开或请求被替代；Timeout 使用 `TimeoutError`。`finally` 必须 Clear Timer 和移除 Listener。

Abort 表示客户端不再关心结果，不保证 Server 一定停止工作。请求可能已经到达 Server 并完成写入。因此写操作必须靠 Idempotency Key、Transaction 和状态查询保证正确性，不能把“Abort 后没看到 Response”理解为“操作没发生”。

### 重试：先判断能否重复，再谈 Backoff

<<< ../../../examples/frontend/browser-network-fetch/retry-policy.ts

示例只默认重试 GET/HEAD，并只对临时 Status 集合重试。`Retry-After` 可以是秒数或 HTTP Date；指数退避加入 Full Jitter，避免大量客户端同时重试形成 Thundering Herd。

完整执行器：

<<< ../../../examples/frontend/browser-network-fetch/fetch-with-retry.ts

关键细节：

- 每次 Attempt 使用 `request.clone()`，避免重复消费同一 Body Stream。
- 返回最终 Response，由调用方决定 HTTP Error Parsing。
- 重试前 Cancel 不再使用的 Response Body，帮助释放连接资源。
- Delay 同样监听 Abort。
- Server 提供的 Retry-After 仍受客户端最大等待上限约束。
- CORS/永久 DNS 配置错误也表现为 Fetch Reject，盲目重试不会修好它们。

POST 若使用 Idempotency Key，必须由 Server 原子记录 Key 与结果，并定义 Scope、TTL、Payload Conflict；只加一个 Header 而 Server 不实现去重，没有任何保证。

## 跨源请求为什么“发出去了却读不到”

网络连通和浏览器授权是两层问题。CORS 解决的是页面脚本能否读取跨源响应，不负责证明用户是谁，也不负责阻止服务端副作用。

### CORS 控制“读取响应”，不是阻止请求到达

Same-origin Policy 限制 Script 读取 Cross-origin 资源。CORS 是 Server 选择性放宽读取权限的协议。

一些 Cross-origin “Simple Request”不需要 Preflight，浏览器可以直接发送；如果 Server 允许 GET/POST 改状态而没有 CSRF 防护，请求仍可能产生副作用，即使攻击页面读不到 Response。因此：

- CORS 不是 Authentication。
- CORS 不是 Authorization。
- CORS 不是完整 CSRF 防护。
- Server 必须独立校验 Session、Permission、Origin/CSRF Token 和 Method Semantics。

### Preflight 与严格 Allowlist

非 Safelisted Method/Header/Content-Type 等会触发 OPTIONS Preflight。它携带 `Origin`、`Access-Control-Request-Method` 和可能的 `Access-Control-Request-Headers`，询问 Server 是否允许实际请求。

<<< ../../../examples/frontend/browser-network-fetch/cors-policy.ts

这个决策器：

- 精确匹配 Origin，不做易出错的 Suffix/Regex 反射。
- Method/Header 使用 Allowlist。
- 拒绝结果显式返回 `allowed: false`，Server Handler 必须返回错误，不能仍发 204。
- `Vary: Origin` 防止 Shared Cache 把一个 Origin 的许可复用给另一个。
- Credentialed Response 回显具体 Origin，不能使用 `Access-Control-Allow-Origin: *`。

Preflight Cache 与普通 HTTP Cache 分开，由 `Access-Control-Max-Age` 控制且浏览器可能设上限。Preflight Request 按规范不携带 Credentials，但实际请求是否携带由 Credentials Mode 和 Cookie Policy 共同决定。

### Credentials、Cookie 与 SameSite

Fetch `credentials`：

- `same-origin`：默认，只在 Same-origin 场景使用 Credentials。
- `include`：Cross-origin 也尝试包含/接受 Credentials，但仍受 CORS 和 Third-party Cookie Policy 限制。
- `omit`：不使用 Credentials。

安全 Session Cookie 常见属性：

```http
Set-Cookie: __Host-SID=opaque; Path=/; Secure; HttpOnly; SameSite=Lax
```

- `Secure`：只在安全连接发送。
- `HttpOnly`：JavaScript 不能读取，降低 Token 被 XSS 直接窃取的风险。
- `SameSite`：限制 Cross-site 场景发送，不能代替所有 CSRF 防护。
- `__Host-`：要求 Secure、Path=/ 且无 Domain，收紧 Host Scope。

Cookie 自动附带使请求方便，也意味着 Server 必须考虑 CSRF。Access Token 放 LocalStorage 则暴露给同源 XSS；两种方案需要按 Threat Model 设计，而不是寻找“永远最安全”的一句话答案。

## 缓存不是一个开关，而是一组复用契约

缓存问题之所以难，往往不是某条指令记错，而是没有先说清“哪一层缓存、谁能共享、能旧多久、怎样证明仍然有效”。

### HTTP Cache 不只是浏览器内存缓存

链路中可能有：

- Browser Private HTTP Cache（Memory/Disk 实现细节）。
- Shared Proxy/Corporate Cache。
- CDN/Reverse Proxy Managed Cache。
- Origin Application Cache。
- Service Worker Cache API。
- 应用 Query Cache。

它们的 Key、Freshness、Invalidation 和用户隔离不同。不要把 Network 面板的“memory cache”与 Cache API、React Query Cache 或 BFCache 混为一谈。

### Cache-Control 指令精确含义

最常用误区：`no-cache` **允许存储**，只是复用前要求 Validation；`no-store` 才表示 Cache 不应存储该 Response。

| 指令 | 核心含义 |
| --- | --- |
| `max-age=N` | Response 可保持 Fresh 的秒数 |
| `s-maxage=N` | Shared Cache 的 Freshness，优先于 max-age |
| `public` | 可由 Shared Cache 存储（仍需满足其他规则） |
| `private` | 只能由 Private Cache 存储 |
| `no-cache` | 可存，但复用前必须 Validation |
| `no-store` | 不应存储 Request/Response |
| `must-revalidate` | Stale 后必须成功 Validation，不能随意复用 |
| `immutable` | Fresh 期间内容不会改变，避免不必要 Validation |
| `stale-while-revalidate=N` | 允许短期返回 Stale，同时后台更新 |

示例策略生成器：

<<< ../../../examples/frontend/browser-network-fetch/cache-policy.ts

Hashed Asset 内容变化即 URL 变化，适合一年 Fresh + immutable；HTML URL 稳定，需要 `no-cache` + Validator；Personalized Response 至少 `private`，真正敏感数据使用 `no-store`。实际策略还要结合法规、Logout 后残留风险和 CDN 行为。

### Freshness、Validation 与 304

Fresh Response 可直接复用；Stale Response 通常通过 Conditional Request 验证：

```http
GET /app.js
If-None-Match: "build-42"
```

未变化：

```http
HTTP/1.1 304 Not Modified
ETag: "build-42"
Cache-Control: public, max-age=3600
Vary: Accept-Encoding
```

304 没有 Response Body，Cache 将存储的 Body 与更新后的 Metadata 组合。DevTools 可能为了展示 Cache Validation 而显示 304，但 JavaScript `fetch` 通常看到的是 Cache 处理后的正常 Response，而不是要求业务自己拼 Body。

Server-side 示例：

<<< ../../../examples/frontend/browser-network-fetch/conditional-response.ts

`If-None-Match` 对 GET/HEAD 使用 Weak Comparison，所以示例规范化 `W/`。ETag 的 Opaque Tag 可以包含逗号，因此示例不会用普通 `split(',')` 解析 Header。真实 ETag 生成必须稳定且符合 Representation：若 Gzip/Language 版本内容不同，要配合不同 ETag 或正确 `Vary`。

### Strong/Weak Validator 与并发控制

- Strong ETag 表示 Byte-for-byte 等价，可用于 Range 和更强条件。
- Weak ETag（`W/"..."`）表示语义等价但 Byte 可能不同，适合 Cache Validation。
- Last-Modified 精度较低且依赖可靠时间，通常作为兼容 Validator。

ETag 还可避免 Lost Update：客户端更新时带 `If-Match: "version-7"`，Server 只在当前版本仍匹配时执行，否则返回 412。它和 GET Cache Validation 使用同一条件请求体系，但业务语义不同。

### Cache Key 与 Vary

Cache 基础 Key 至少受 Method 与 Target URI 影响；Response 的 `Vary` 声明哪些 Request Header 也决定 Representation：

```http
Vary: Accept-Encoding, Accept-Language
```

若 Server 按语言返回内容却忘记 `Vary: Accept-Language`，Shared Cache 可能把中文 Response 给英文用户。反过来，`Vary: User-Agent` 会制造高基数、显著降低 Hit Ratio。

个性化内容通常用 `Cache-Control: private`，不要简单 `Vary: Cookie`：Cookie 组合基数巨大，也容易在 CDN 配置错误时泄露数据。Managed Cache 还可能有 Surrogate Key/Purge API，它们是产品能力，不属于浏览器标准 Cache API。

### Fetch Cache Mode 不是 Response Cache-Control

Request 的 `cache` Option 控制本次 Fetch 如何与 HTTP Cache 交互：`default`、`no-store`、`reload`、`no-cache`、`force-cache`、`only-if-cached`。它不能代替 Server 正确设置 Response Header。

例如前端到处使用 `{ cache: 'no-store' }` 会绕过正常复用，掩盖 Server Cache Policy 缺陷并增加流量。优先让资源类型决定 Server Header，仅在 Reload/诊断/特殊一致性请求中选择不同 Cache Mode。

`only-if-cached` 还有 Mode 等约束，不能当通用 Offline Fetch。

### Cache API 与 HTTP Cache 是两套系统

Service Worker 的 Cache API：

```ts
const cache = await caches.open('v3')
await cache.put(request, response)
```

这是由应用显式管理的 Request/Response Store，不自动遵守 HTTP Cache-Control Freshness。若 Cache-first 永久返回旧 Response，即使 Origin 已设置 `no-cache`，应用逻辑仍可能绕过网络。

因此每条 Service Worker Strategy 都要定义：

- 哪类 URL 可进入 Cache。
- Cache Key 是否包含 Query/Method/Headers。
- 何时更新、过期和删除旧 Version。
- Personalized/Authorization Response 是否禁止缓存。
- Offline、Timeout、Non-2xx 时如何降级。
- 新 Service Worker 如何 Activate，旧 Tab 如何迁移。

### 一个克制的 Service Worker 策略

<<< ../../../examples/frontend/browser-network-fetch/service-worker.ts

示例只做两件事：

- Navigation 优先访问网络，失败时只回退预缓存的 Offline Page；不缓存任意页面响应，避免把个性化 HTML 跨会话留在 Cache API。
- 带 Content Hash 的 Same-origin Static Asset 使用 Cache-first。

API Response 交给 HTTP Cache/应用数据层，不在 Service Worker 复制一份模糊 Freshness。Install/Activate 使用版本化 Cache Name 并删除旧 Shell Cache。示例不主动调用 `skipWaiting()` 或 `clients.claim()`，让浏览器按正常生命周期接管。

这仍是教学实现：`cache.addAll()` 任一资源失败会使 Install Reject；真实 PWA 应设计 Atomic Shell、更新提示、Storage Quota 和 Offline Data Migration。示例在 Cache-first Miss 后只缓存 Same-origin、成功的 Hashed Asset，避免把错误 Response 永久化。

注册也要处理 Secure Context 与失败。浏览器会按 Service Worker 更新算法检查新脚本，不应在每次页面加载后无条件再调用 `registration.update()` 制造重复检查：

<<< ../../../examples/frontend/browser-network-fetch/register-service-worker.ts

`skipWaiting()`/`clients.claim()` 可能让新旧 Asset/Application State 突然交叉，是否立即接管必须由产品更新策略决定，不能机械复制。

## Body 到达之后，工作仍未结束

Headers 可用只意味着 `fetch()` 可以得到 `Response`。大型 Body 的下载、解码、解析、校验和渲染仍可能决定用户什么时候看到第一条数据。

### Streaming Response 与背压

Fetch Body 是 `ReadableStream<Uint8Array>`。大结果可按 Chunk 解码，减少等待完整 Body 的首条数据延迟：

<<< ../../../examples/frontend/browser-network-fetch/ndjson-stream.ts

NDJSON 每行一个独立 JSON，适合 Incremental Parser。实现处理了：

- `TextDecoder` 跨 Chunk 保留多字节字符状态。
- 一次 Chunk 中多行和跨 Chunk 半行。
- 最大行大小，避免无限 Buffer。
- Parse/Schema Error 时 Cancel Reader。
- `finally` 释放 Lock。

HTTP Chunk Boundary 与业务消息 Boundary 无关，不能假设一次 `read()` 就是一行。普通 JSON Array 不是 NDJSON，不能直接套此 Parser。`response.clone()` 会 Tee Body；若一支消费很慢，Buffer 仍可能增长，不要为日志随意 Clone 大响应。

## 用证据判断慢在哪一层

### Resource Timing：从浏览器获得链路线索

<<< ../../../examples/frontend/browser-network-fetch/resource-timing.ts

可观察：

- `domainLookupStart/End`：DNS 阶段。
- `connectStart/End` 与 `secureConnectionStart`：连接/TLS。
- `requestStart → responseStart`：近似请求到首 Byte（TTFB 组成复杂）。
- `responseStart → responseEnd`：下载。
- `nextHopProtocol`：实际下一跳协议。
- Transfer/Encoded/Decoded Size：网络传输、压缩前后线索。

解释限制：Connection Reuse 会让 DNS/Connect 为 0；Cross-origin Resource 若未返回 `Timing-Allow-Origin`，很多详细值被置 0；Service Worker、Cache、Redirect 和 Proxy 会改变阶段。`transferSize === 0` 可能是 Local Cache，也可能是 Timing 信息受限，必须结合 Same-origin/TAO 与其他字段。

### 完整浏览器入口

<<< ../../../examples/frontend/browser-network-fetch/main.ts

入口体现生产基本线：

- 最终 URL 经过 Protocol/Origin Policy。
- 新请求 Abort 旧请求，避免竞态覆盖。
- Timeout 和 Navigation Abort 可区分。
- Response 做 Status、Content-Type 和 Schema Validation。
- Resource Timing 独立观测，不污染请求逻辑。

实验 HTML：

<<< ../../../examples/frontend/browser-network-fetch/index.html

在本地运行时只允许 `localhost` 使用 HTTP；其他环境要求 HTTPS。正式 Runtime Config 还应明确 API Origin，并由 CSP `connect-src` 形成第二层限制。

### Network 面板诊断顺序

一次慢请求不要只盯总 Duration：

1. **Queueing/Stalled**：连接限制、优先级、Service Worker、主线程发起延迟。
2. **DNS**：是否首次解析、域名过多、Resolver/网络问题。
3. **Initial Connection/TLS**：是否新连接、协议、证书链、Round Trip。
4. **Request Sent**：上传 Body 是否很大。
5. **Waiting/TTFB**：Server Queue/Compute、CDN Miss、上游网络。
6. **Content Download**：Payload、Bandwidth、Compression、Streaming。
7. **Main Thread**：Response 到达后 Parse/Render 是否才是真正卡顿。

检查 Request/Response Header、Remote Address、Protocol、Priority、Initiator、Redirect Chain、Service Worker 标记与 Cache 状态。DevTools 的 Disable Cache 通常只在工具打开时生效，不代表用户真实路径。

## 把原则落成资源策略

### 缓存策略矩阵

| 资源 | 推荐起点 | 原因 |
| --- | --- | --- |
| `app.abcd1234.js` | `public, max-age=31536000, immutable` | 内容变更即换 URL |
| 非个性化 HTML | `no-cache` + ETag | URL 稳定，每次验证版本 |
| 个性化 HTML/API | `private, no-cache` | Private Cache 可验证复用 |
| Token/支付/高度敏感 | `no-store` | 避免持久缓存 |
| 公共短时 API | 短 max-age + Validator/SWR | 降低延迟和 Origin 负载 |
| Mutation Response | 通常 no-store 或明确私有策略 | 避免错误复用写入结果 |

这是起点，不是复制即安全。是否允许 Offline、数据更新频率、Storage/法规、CDN Purge 能力和用户切换行为都要进入设计。

## 用常见故障校准心智模型

### `fetch` 没抛错就当成功

404/500 也 Fulfill。检查 `response.ok/status`，再校验 Content-Type、JSON 和业务 Schema。

### 所有请求都重试三次

可能重复下单、放大故障。只自动重试安全/幂等操作，尊重 Retry-After，加入 Jitter 与总预算。

### 用 `Access-Control-Allow-Origin: *` 修 CORS

Credentialed 请求不允许通配符，而且放宽读取范围可能泄露数据。使用精确 Allowlist，认证授权独立执行。

### 使用 `no-cache` 防止存储敏感数据

`no-cache` 允许存储。敏感数据用 `no-store`，并检查 CDN/Service Worker/应用 Cache。

### HTML 和 Hashed Asset 使用同一策略

HTML 永久 Fresh 会锁死旧 Asset 引用；Hashed Asset 每次验证浪费 Round Trip。按 Resource Identity 分策略。

### Service Worker Cache-first 所有 GET

可能缓存用户数据、错误 Response 和永不过期 API。只为明确资源类别设计 Strategy。

### 看到 DNS/Connect 为 0 就宣称网络无开销

可能是 Connection Reuse、Cache、Service Worker 或 Timing 被隐藏。结合 Protocol、Transfer Size、Initiator 与 Server Timing。

## 生产检查清单

- 最终 URL 是否通过标准 Parser、HTTPS 与 Origin Allowlist？
- CSP `connect-src` 是否只允许必要端点？
- API 是否区分 Network、HTTP、Decode、Schema 和 Domain Error？
- 请求在路由切换/替换时能否取消？Timeout 后 Server 写入如何确认？
- 只有安全/幂等请求自动重试吗？是否有 Jitter、Retry-After 和总预算？
- Credential Mode、Cookie SameSite 和 CSRF Policy 是否一致？
- CORS 是否精确 Origin/Method/Header Allowlist，并正确 `Vary: Origin`？
- Hashed Asset、HTML、公共 API、个性化数据、敏感数据是否分 Cache Policy？
- 是否提供 ETag/Last-Modified，并确保 304 Header 与 200 一致？
- `Vary` 是否覆盖真正的内容协商维度且避免高基数？
- Service Worker Cache 是否有 Version、Eviction、Offline 与用户隔离策略？
- 大 Response 是否可分页/流式，Parser 是否有 Size Limit 和 Abort？
- Resource Timing 是否考虑 TAO、Cache 与 Connection Reuse？
- Field Telemetry 能否关联 DNS/Protocol/TTFB/Status/Release，而不上传敏感 URL Query？

## 完整示例文件

本页已展示目录内所有源码：

```text
examples/frontend/browser-network-fetch/
├─ index.html
├─ main.ts
├─ api-types.ts
├─ url-policy.ts
├─ request-signal.ts
├─ fetch-json.ts
├─ retry-policy.ts
├─ fetch-with-retry.ts
├─ cache-policy.ts
├─ conditional-response.ts
├─ cors-policy.ts
├─ ndjson-stream.ts
├─ resource-timing.ts
├─ service-worker.ts
└─ register-service-worker.ts
```

## 延伸阅读

- [WHATWG Fetch Standard](https://fetch.spec.whatwg.org/)
- [RFC 9110：HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html)
- [RFC 9111：HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111.html)
- [RFC 9114：HTTP/3](https://www.rfc-editor.org/rfc/rfc9114.html)
- [RFC 8446：TLS 1.3](https://www.rfc-editor.org/rfc/rfc8446.html)
- [MDN：Using the Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)
- [MDN：HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching)
- [MDN：Cross-Origin Resource Sharing](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)
- [MDN：Resource Timing](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Resource_timing)

## 本节小结

浏览器请求不是 `fetch → server → JSON` 三步。URL 先确定 Origin 和安全策略；DNS 与连接层找到可通信端点；TLS 验证身份并协商协议；HTTP Cache、Service Worker 和 Connection Pool 可能直接复用已有资源；Fetch 再对 Redirect、CORS、Credentials 和 Response Filtering 应用浏览器规则。

工程正确性建立在明确语义上：HTTP Error 不等于 Network Error，Timeout 不等于 Server 未执行，CORS 不等于授权，`no-cache` 不等于不存储，HTTP/3 不等于永远更快。用 Runtime Validation、幂等重试、分资源缓存策略和 Resource Timing 把每一层变成可验证边界。

下一节继续浏览器模块，深入 [DOM、事件传播、Shadow DOM 与可访问交互](./dom-events-shadow-dom-and-accessible-interactions.md)。
