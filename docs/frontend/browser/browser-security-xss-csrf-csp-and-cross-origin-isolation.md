---
title: 浏览器安全模型：XSS、CSRF、CSP 与跨源隔离
description: 从同源策略理解前端威胁边界，系统掌握 XSS、CSRF、CORS、CSP、Trusted Types、跨窗口通信和跨源隔离
outline: deep
---

# 浏览器安全模型：XSS、CSRF、CSP 与跨源隔离

前端安全不是给表单加几个正则，也不是部署一组“推荐响应头”。它首先是一个**信任边界问题**：浏览器同时运行来自大量站点的代码，必须允许链接、图片、表单和第三方资源互联，又要阻止恶意站点读取用户在另一个站点中的邮件、账户与内网数据。

浏览器用同源策略建立默认隔离，再用 CORS、`postMessage` 等协议有条件地开放边界。XSS、CSRF 和错误的跨源配置，都是在不同方向上破坏或误用这些边界。

为了避免缩写堆叠，先把本课归结为三个权限问题：攻击者能否在当前 Origin 执行代码，能否借浏览器自动携带的身份制造副作用，以及能否读取或嵌入另一个 Origin 的资源。XSS、CSRF、CORS、CSP 和跨源隔离分别约束这些问题的不同方向，不能互相替代。

## 从威胁模型和同源策略出发

### 威胁模型：先问攻击者已经能控制什么

安全设计不能从“攻击者什么都做不到”开始。一个现实的 Web 威胁模型通常假设攻击者可以：

- 构造用户访问的 URL、查询参数、片段和跨站表单；
- 在自己的 origin 中运行任意 HTML 与 JavaScript；
- 诱导已登录用户点击、跳转、打开弹窗或访问嵌入页面；
- 提交会被系统保存和再次展示的昵称、评论、Markdown 或富文本；
- 控制某个第三方脚本、广告、统计服务或被接管的子域名；
- 观察请求是否成功、加载时序、窗口数量等有限侧信道；
- 重放之前观察到的合法请求。

同时，不应假设前端能够完成服务器职责。前端隐藏按钮不是授权；CORS 不是 API 身份认证；TypeScript 不是输入校验；混淆代码不是秘密保护。真正的权限和业务不变量必须由服务器在每次请求上校验。

### 浏览器的基础隔离：Same-Origin Policy

两个 URL 同源，当且仅当 scheme、host 和 port 相同：

| URL | 与 `https://app.example.com` 的关系 | 原因 |
| --- | --- | --- |
| `https://app.example.com/course/1` | same-origin | 只有路径不同 |
| `http://app.example.com` | cross-origin | scheme 不同 |
| `https://api.example.com` | cross-origin | host 不同 |
| `https://app.example.com:8443` | cross-origin | port 不同 |

“site”通常围绕可注册域名和 scheme 建模，因此 `https://app.example.com` 与 `https://api.example.com` 可以是 same-site，却不是 same-origin。这个区别直接影响 SameSite Cookie 和 Fetch Metadata；不要把“同站”误写成“同源”。

同源策略对跨源交互采取的默认态度并不统一：

- **跨源写入常常允许**：链接跳转、重定向和传统 HTML 表单能发出请求；
- **跨源嵌入常常允许**：图片、样式、脚本、iframe 等可以按各自规则加载；
- **跨源读取通常受限**：恶意页面不能直接读取另一个 origin 的 DOM 或 `fetch` 响应；
- **跨源窗口引用能力受限**：仍可导航某些窗口或用 `postMessage` 通信；
- **本地存储通常按 origin 隔离**：Web Storage 和 IndexedDB 不能被其他 origin 直接读取。

这解释了两个关键结论：

1. “攻击者读不到响应”不等于“攻击者发不出请求”，所以仍可能发生 CSRF；
2. 加载一个跨源脚本意味着允许它以**当前页面 origin 的权限**执行，而不是把它关在来源站点的权限里。

不要用已废弃的 `document.domain` 放宽子域边界。它无法统一影响所有 Web API，还会模糊安全模型。跨 origin 系统应使用明确的 HTTP API 或消息协议。

## 阻止不可信数据获得代码执行权

### XSS 的本质：不可信数据获得了当前 Origin 的代码权限

XSS 不是“弹出一个 alert”。一旦攻击代码在应用 origin 中执行，它通常可以：

- 读取和修改页面 DOM、Web Storage、IndexedDB 中脚本可访问的数据；
- 以用户身份发出同源请求，即使会话 Cookie 是 `HttpOnly`；
- 读取前端可读取的 API 响应并外传；
- 记录输入、篡改转账目标、植入持久后门或攻击后台管理员。

按恶意数据进入执行环境的路径，常见分类是：

- **反射型 XSS**：请求参数进入服务器生成的响应，立即反射给当前用户；
- **存储型 XSS**：恶意内容进入数据库，之后攻击所有查看它的用户；
- **DOM 型 XSS**：客户端代码把 URL、消息或存储数据传入危险 DOM API；
- 这些分类可以重叠，核心分析方法始终是追踪 `source → transformation → sink`。

常见 source 包括 URL 参数、`location.hash`、`postMessage`、服务端响应、本地存储和第三方 SDK。常见危险 sink 包括：

- `innerHTML`、`outerHTML`、`insertAdjacentHTML`；
- `document.write`、`Range.createContextualFragment`、iframe `srcdoc`；
- `eval`、`new Function`、字符串形式的 `setTimeout`；
- 动态脚本 URL、`javascript:` URL、内联事件处理器；
- 框架中的 `v-html`、`dangerouslySetInnerHTML` 等原始 HTML 入口。

### 第一原则：如果只需要文本，就永远不要进入 HTML 解析器

Vue 模板插值和 React JSX 文本通常会转义值，但一旦使用原始 HTML API，框架的默认保护就被绕过。最稳妥的渲染方式是创建元素并使用 `textContent`：

<<< ../../../examples/frontend/browser-security/safe-dom.ts

这里不需要手写 `escapeHtml()`，因为数据从未被解释为 HTML。浏览器知道它是文本，不存在“漏转义一个字符或上下文”的问题。

编码必须与输出上下文匹配。HTML 文本、HTML 属性、URL、CSS 和 JavaScript 字符串的语法不同，一套替换规则不能安全处理所有上下文。尤其不要把不可信数据直接插进：

```html
<script>const value = "{{ untrusted }}"</script>
<style>.target { background: {{ untrusted }} }</style>
<div {{ untrusted }}>...</div>
```

JSON 数据可以放进独立、非执行的数据响应中再解析；服务端模板则应使用默认转义，并避免让变量控制属性名、标签结构或脚本上下文。

### URL 也是一种有语法和能力的输入

`href`、`src` 被设置为字符串不代表绝对安全。某些上下文允许 `javascript:`，外部跳转可能导致钓鱼、数据泄露或 opener 风险。URL 策略要先解析，再根据用途限制 protocol、origin 和路径：

<<< ../../../examples/frontend/browser-security/safe-navigation.ts

不要用 `startsWith("https://example.com")` 验证 origin，因为 `https://example.com.attacker.test` 也能通过这种字符串前缀。应使用 `new URL()` 后比较结构化的 `origin` 或 hostname。

现代浏览器通常会让 `_blank` 链接具有隐式 `noopener` 行为，但显式写出 `rel="noopener noreferrer"` 能表达兼容和 Referrer 策略意图。是否使用 `noreferrer` 要结合业务归因需求决定。

### 当业务确实需要富文本：清洗，而不是编码成文本

若用户输入 Markdown 并最终生成有限 HTML，需求是保留允许的结构、删除危险能力。这时需要 **sanitization**：根据 allowlist 删除危险标签、事件属性、URL scheme 和命名空间技巧。

清洗 HTML 很难，不能靠几个正则。应采用经过审计、持续更新的专用库，并配置允许的标签、属性和 URL 协议。还要注意：

- 清洗后再次字符串拼接或 DOM 修改可能重新引入危险内容；
- 服务端和客户端清洗器配置不一致会造成 SSR / hydration 差异；
- SVG、MathML、模板元素和 URL 属性有额外攻击面；
- 已清洗内容也应标记 schema / sanitizer 版本，升级规则后可重新处理。

**编码**用于“把内容当文本显示”；**清洗**用于“保留一部分 HTML”。二者不能互换。

### Trusted Types：强制危险 Sink 经过统一策略

大型项目最难的问题往往不是“有没有清洗函数”，而是“是否还有某个角落绕过了它”。Trusted Types 将普通字符串与 `TrustedHTML`、`TrustedScript`、`TrustedScriptURL` 区分；配合 CSP：

```text
require-trusted-types-for 'script'; trusted-types app-html
```

支持该机制的浏览器会拒绝把普通字符串传给受保护的注入 sink，并限制只能创建名为 `app-html` 的策略。

Trusted Types **不提供清洗算法**。策略如果原样返回输入，只是给漏洞盖章。下面的边界要求调用者注入经过审计的 sanitizer，并让不支持 Trusted Types 的浏览器仍走相同清洗路径：

<<< ../../../examples/frontend/browser-security/trusted-types.ts

生产中可以将 `HtmlSanitizer` 绑定到 DOMPurify 等受维护的清洗器。不要在课程示例中伪造一个不完整的“迷你清洗器”，因为它会给出错误安全感。

迁移旧系统时可先在 Report-Only CSP 中观察违规，定位所有 sink；短期 default policy 可协助发现遗留调用，但长期更推荐显式策略，让代码审查能看见哪些位置有意创建 TrustedHTML。

Trusted Types 的浏览器支持需要按目标环境验证。它是纵深防御，不是放弃安全 DOM API、框架转义和 HTML 清洗的理由。

### CSP：即使注入成功，也限制什么可以执行

Content Security Policy 通过响应头声明页面允许加载和执行的资源。严格 CSP 的核心不是维护一份越来越长的域名白名单，而是只信任带每响应随机 nonce 或构建期 hash 的入口脚本。

<<< ../../../examples/frontend/browser-security/csp-headers.txt

这份策略的关键含义是：

- `default-src 'none'` 从最小权限开始，其他资源类型逐项开放；
- nonce 必须对每个 HTTP 响应重新生成、不可预测，并同时写入 CSP 与可信 `<script>`；
- `'strict-dynamic'` 让带 nonce/hash 的可信脚本可加载后续脚本，同时扩大该引导脚本的责任；
- 不使用 `'unsafe-inline'`，内联事件、无 nonce 脚本和 `javascript:` URL 默认被拒绝；
- 不使用 `'unsafe-eval'`，要求生产包和依赖不依赖字符串执行；
- `object-src 'none'`、`base-uri 'none'`、`form-action 'self'` 收紧常见旁路；
- `frame-ancestors 'none'` 阻止页面被嵌入，用于防御点击劫持；
- Trusted Types 指令约束 DOM XSS sink；
- `report-to` 将违规作为迁移和监控信号。

服务端生成 nonce 时不能给“所有脚本标签”机械补 nonce，否则攻击者注入的标签也可能获得信任。nonce 应只注入模板中已知的引导脚本。

`'strict-dynamic'` 不是免费的安全增强：可信引导脚本如果根据攻击者输入创建 `<script src>`，信任会沿动态加载链传播。因此脚本 URL 仍须结构化校验。

#### CSP 是第二道防线，不是 XSS 修复器

CSP 可能因兼容性、浏览器差异、错误配置或受信任脚本自身的 DOM 漏洞被绕过。首要防线仍是避免危险 sink、按上下文编码和可靠清洗。CSP 的价值是当第一道防线遗漏时，显著减少注入内容获得执行权的机会。

#### 如何上线而不把生产页面直接打坏

1. 先收集当前脚本、样式、连接和 frame 依赖；
2. 部署 `Content-Security-Policy-Report-Only`，去重并分析违规；
3. 移除内联事件、`eval` 和不可控第三方脚本；
4. 小流量启用强制策略，保留更严格候选策略的 Report-Only；
5. 监控业务错误率与 CSP 报告，再扩大流量；
6. 将策略纳入集成测试，防止后续依赖重新要求放宽。

Report-Only 不会阻止攻击，只用于观测。CSP 报告中的 URL、代码位置或 sample 也可能携带敏感信息，收集端需要最小化、脱敏、限流和访问控制。

## 保护带身份的状态变更请求

### CSRF：利用浏览器自动携带的身份发出状态变更

假设应用使用 Cookie 会话。攻击者页面无法读取银行响应，但可以构造表单向银行发送 POST；若浏览器附带用户 Cookie，服务器只看会话就可能执行转账。这就是 CSRF 的核心：攻击者未必看到结果，却能诱导浏览器以用户身份产生副作用。

CSRF 成立通常需要：

- 目标使用浏览器会自动附带的凭证，例如 Cookie；
- 存在可由跨站页面触发的状态变更请求；
- 服务端没有验证请求确实来自自己的应用流程。

Bearer token 若只由 JavaScript 显式添加且攻击者拿不到，传统 CSRF 风险较低，但 token 存在脚本可读存储会放大 XSS 后果。安全选择不是“XSS 与 CSRF 二选一”，而是分别控制两类风险。

### CSRF 的组合防线

#### 不可预测且绑定会话的 Token

服务器把不可预测 token 绑定到用户会话，并安全嵌入页面；前端在状态变更请求中用自定义头回传：

<<< ../../../examples/frontend/browser-security/csrf-client.ts

服务端必须比较当前会话中的 token，不能只检查“头存在”。token 不能进入 URL，因为 URL 容易出现在历史、日志和 Referer 中。

#### Origin、Fetch Metadata 与 Token 一起校验

下面是服务端边界的框架无关示意：

<<< ../../../examples/frontend/browser-security/csrf-server-policy.ts

逻辑先拒绝明确的 `Sec-Fetch-Site: cross-site`，再精确校验 `Origin` 和会话 token。真实服务端应使用框架成熟的 CSRF 实现，处理 token 轮换、登录 CSRF、多节点会话和错误响应。

不能把 `Referer` 当唯一依据，它可能受 Referrer Policy 影响；`Origin` 和 Fetch Metadata 也可能因旧客户端或代理缺失。因此兼容策略必须明确：高风险操作可 fail closed，低风险接口则按受支持客户端定义降级，但不能悄悄全放行。

#### 避免 Simple Request

`application/json` 或自定义请求头会让跨源脚本请求通常需要 CORS 预检。攻击者 origin 未被允许时，浏览器不会发送实际状态变更请求。这个策略适合纯 JavaScript API，但传统表单仍需 CSRF token。

它还依赖正确的 CORS：若服务端把攻击者 origin 加入带凭证 allowlist，预检就会主动打开攻击路径。

#### SameSite 是纵深防御

`SameSite=Strict` 最大限度减少跨站携带 Cookie，但可能影响从外站链接进入后的登录体验；`Lax` 允许部分顶层安全方法导航。SameSite 控制的是 **site**，同一可注册域名下的受控子域可能仍属于 same-site。

因此 SameSite 不能替代 token、Origin 或 Fetch Metadata。状态变更绝不能使用 GET；服务端还要警惕把 GET 通过 method override 转成写操作。

### CORS：服务器授权浏览器中的某些 Origin 读取响应

CORS 是基于 HTTP 响应头的跨源共享协议。它不是：

- 服务器到服务器的访问控制；非浏览器客户端不受浏览器 CORS 约束；
- 用户认证或资源授权；允许某个 origin 不代表允许其中所有用户；
- CSRF 的自动解决方案；某些跨源写入无需读取响应就能造成影响；
- “在前端关闭”的错误；最终许可来自资源服务器响应。

#### 简单请求与预检

满足有限 method、header 和 content type 条件的请求可能直接发送，服务器响应后浏览器才决定脚本能否读取。非简单请求先发送 `OPTIONS` 预检，询问实际 method 和 headers 是否允许。

预检成功不代表业务授权成功。实际请求到达后仍要验证用户身份、权限、CSRF 与输入。预检响应可以缓存，但修改 CORS 策略时要考虑 `Access-Control-Max-Age` 的生效延迟。

#### 带凭证 CORS 的正确边界

当请求使用 Cookie 等凭证时：

- `Access-Control-Allow-Origin` 不能是 `*`，要返回精确允许的 origin；
- 返回动态 origin 前必须与静态 allowlist 做精确匹配；
- 响应应包含 `Vary: Origin`，防止共享缓存把一个 origin 的许可复用于另一个；
- 需要 `Access-Control-Allow-Credentials: true`；
- 客户端还要设置相应 `credentials`，Cookie 自身也受 SameSite 等规则限制。

<<< ../../../examples/frontend/browser-security/cors-policy.ts

示例不仅生成响应头，还返回明确的 `allowed` 决策。Handler 对拒绝结果必须返回错误，不能因为响应里没有 `Access-Control-Allow-Origin` 就继续把一次非法 Preflight 当作成功处理。

不要把请求 `Origin` 无条件反射到 `Access-Control-Allow-Origin`，那等于允许任意攻击站点。也不要用宽松后缀匹配；子域接管会把看似可信的 allowlist 变成攻击入口。

CORS 错误在前端通常表现为不透明的网络失败，详细原因只出现在浏览器控制台。这是避免向脚本泄漏跨源信息的设计；排查时应同时检查预检、实际响应、重定向和代理层加的头。

## 有意开放跨源窗口与资源边界

### `postMessage`：跨 Origin 窗口通信需要完整协议

`postMessage` 是有意穿过同源边界的通信通道，因此 origin 检查只是第一步。接收方还应验证：

- `event.origin` 是否精确匹配；
- `event.source` 是否就是预期 iframe / popup；
- `event.data` 是否符合版本化的运行时 schema；
- 这类消息在当前状态是否被允许，是否可能重放；
- 响应是否只发送最少必要数据。

发送时应使用精确 `targetOrigin`，不要在已知接收 origin 时用 `*`。示例等待 iframe 的 `load` 后再发送握手消息，并在销毁时同时移除两类监听器：

<<< ../../../examples/frontend/browser-security/post-message.ts

只校验 `event.data.type` 不够，因为任何能获得窗口引用的页面都可能发消息。只校验 origin 也不够，因为可信 origin 自身的某个页面可能被 XSS，或发送格式错误的数据。

窗口可能在消息发送前后导航。`event.origin` 表示调用 `postMessage` 当时发送者的 origin，不保证窗口未来仍停留在那里，所以不要把长期秘密或无限期能力交给一个可导航窗口。

### iframe、点击劫持与 Sandbox

点击劫持把目标页面透明叠在攻击者界面上，诱导用户点击真实按钮。优先使用 CSP 响应头：

```text
Content-Security-Policy: frame-ancestors 'none'
```

需要被指定站点嵌入时列出明确来源。`frame-ancestors` 必须通过 HTTP 响应头交付，不能依赖 `<meta>`。`X-Frame-Options: DENY` / `SAMEORIGIN` 可作为遗留客户端的补充，但表达能力较弱。

当你的页面嵌入不完全可信内容时，iframe `sandbox` 从最小能力开始逐项开放。特别谨慎地组合 `allow-scripts` 与 `allow-same-origin`：对同源嵌入同时开放这两项可能让内容移除 sandbox。能使用独立、无敏感 Cookie 的隔离 origin 时，边界更清晰。

Permissions Policy 则限制摄像头、麦克风、定位等浏览器能力能否被当前文档和子 frame 使用。它不替代用户权限提示，也不替代业务授权。

### CORP、COEP、COOP：它们分别保护什么

这些缩写都涉及“跨源”，但作用方向不同：

| 机制 | 主要问题 | 典型效果 |
| --- | --- | --- |
| CORS | 哪些 origin 的脚本可读取响应 | 资源服务器显式授权跨源读取 |
| CORP | 哪些站点/origin 可用 `no-cors` 嵌入资源 | 资源主动拒绝不符合策略的嵌入 |
| COEP | 当前文档是否只嵌入明确同意的跨源资源 | `require-corp` 要求跨源资源通过 CORS 或 CORP |
| COOP | 顶层窗口是否与跨源 opener 共享 browsing context group | `same-origin` 切断跨源 opener 关系 |

跨源隔离通常需要：

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

然后运行时检查 `crossOriginIsolated`。成功隔离后才能在受支持环境中使用 `SharedArrayBuffer` 和更高精度的某些能力：

<<< ../../../examples/frontend/browser-security/cross-origin-isolation.ts

示例始终提供普通 `ArrayBuffer` 降级，避免把响应头配置错误变成白屏。

完整响应头示意如下：

<<< ../../../examples/frontend/browser-security/isolation-headers.txt

这不是“一次开启全部安全头”的复制模板。启用 COEP 后，未返回 CORS 或合适 CORP 的第三方图片、字体、脚本和 iframe 可能被阻止；COOP 也可能影响 OAuth 弹窗、支付和跨源 opener 流程。上线前必须盘点资源链路，并在真实集成环境验证。

`COEP: credentialless` 是另一种模式，会改变 `no-cors` 跨源请求的凭证行为，不能与 `require-corp` 在不了解依赖的情况下随意互换。

### 其他重要响应头与资源边界

- `X-Content-Type-Options: nosniff`：要求浏览器尊重声明的 MIME 类型，降低类型混淆；
- `Referrer-Policy`：控制导航和请求泄露多少来源 URL；
- `Permissions-Policy`：关闭页面不需要的敏感能力，并限制 iframe；
- HSTS：让支持的浏览器只通过 HTTPS 访问；应在确认所有子域 HTTPS 能力后谨慎考虑 `includeSubDomains`；
- `frame-ancestors`：限制谁能嵌入当前页面；
- SRI：用 `integrity` 校验特定外部静态资源内容，需结合正确的 CORS 和更新流程。

响应头的部署位置很重要：CDN、反向代理、应用服务器、静态托管和错误页面可能生成不同响应。只检查首页 `200` 不够，还要覆盖重定向、404、500、下载和 API 响应。

### 第三方脚本与供应链：引入即授权

通过 `<script src="https://third-party.example/sdk.js">` 加载的脚本在你的页面上下文执行，通常拥有与你自己的前端代码相同的 DOM 和网络能力。CORS 并不会把它限制在第三方 origin。

降低风险的措施包括：

- 能自托管且能及时更新时，固定并审计资源版本；
- 对不可变 CDN 资源使用 SRI，避免使用会漂移的 latest URL；
- 缩减第三方脚本数量，记录负责人、用途、数据流与下线日期；
- 能在 sandbox iframe 中运行的内容不要放进主页面执行上下文；
- 锁定依赖解析结果，审计安装脚本、维护者变更和高风险更新；
- CSP 的域名许可尽量小，但不要误以为域名白名单能防住该域本身被入侵。

Service Worker 权限尤其持久且覆盖路径广。注册脚本必须来自可信部署链，响应使用正确 JavaScript MIME，更新和注销流程应可观察。

### 前端凭证和敏感数据边界

`HttpOnly` Cookie 可阻止脚本直接读取会话值，却不能阻止 XSS 以用户身份调用 API。把 access token 放进 `localStorage` 则让同源 XSS 可以直接提取并在其他机器重放。

更合理的判断方式是明确威胁模型：

- 能否使用服务端会话或 BFF，让浏览器只持有 `HttpOnly; Secure; SameSite` Cookie？
- 若前端必须持有短期 token，能否仅放内存、缩短寿命、限制 audience / scope 并安全轮换？
- 刷新 token 是否可被脚本读取，撤销和重用检测如何实现？
- XSS、CSRF、浏览器扩展、本机用户和日志泄漏分别如何控制？

任何前端构建变量、源码、source map 或网络请求中的秘密最终都能被用户看到。真正的服务端 API key 不能打进前端包。

## 把安全边界落到工程与发布

### 完整示例入口

演示入口把安全文本渲染、URL allowlist 和跨源隔离降级串联起来：

<<< ../../../examples/frontend/browser-security/main.ts

完整 HTML 如下。示例中的 CSRF meta 值只是模板占位，生产中必须由服务器按会话安全生成，不能写死在静态文件或公共缓存中：

<<< ../../../examples/frontend/browser-security/index.html

### Vue / React 工程中的具体落点

对于已有 Vue 2 经验的项目，建议优先审计：

- `v-html`、自定义 directive 中的 `innerHTML`；
- 从路由 query、hash、localStorage、`postMessage` 到 DOM 的数据流；
- 动态 `href`、`src`、iframe `srcdoc` 和脚本加载器；
- 服务端下发并被当作组件、表达式或模板再次编译的字符串；
- 第三方富文本、Markdown、图表 tooltip 和微前端容器；
- 是否依赖 inline handler、`eval` 或宽松 CSP 才能运行。

Vue 插值和属性绑定并不等于所有 URL 都经过业务 allowlist；React JSX 转义也不会保护 `dangerouslySetInnerHTML`。框架的默认安全能力只覆盖其明确承诺的渲染路径。

不要把不可信字符串作为 Vue 模板运行，也不要在浏览器中使用包含用户内容的模板编译。服务端模板、客户端 hydration 和微前端之间要统一规定谁负责转义，避免一方认为已经编码、另一方又解码后进入 sink。

### 安全测试与自动化验证

安全测试应验证“防线确实阻止了行为”，而不只是检查头存在：

1. **纯函数测试**：URL allowlist、消息 schema、Origin/CORS/CSRF 决策；
2. **组件测试**：恶意字符串最终是文本，富文本经过真实 sanitizer；
3. **浏览器测试**：CSP 阻止无 nonce 脚本，Trusted Types 拒绝裸字符串 sink；
4. **跨 origin 集成测试**：允许和拒绝的 CORS、iframe、postMessage 来源；
5. **端到端测试**：跨站表单无法产生状态变更，token 失效和会话切换正确；
6. **部署扫描**：所有入口、错误页和静态资源的安全头与 MIME 是否一致；
7. **依赖与构建测试**：生产包不含 `eval` 依赖，不泄漏 source map / key。

测试 payload 不应只用 `<script>alert(1)</script>`。很多环境不会执行动态插入的 script 标签，但事件属性、SVG、URL、模板和属性上下文仍可能危险。重点是覆盖真实 source 与 sink，而不是收集 payload 数量。

CSP Report-Only、服务器拒绝原因、CORS 预检失败与 CSRF 拒绝都应有可聚合指标，但响应给攻击者的信息要克制。日志避免记录完整 token、Cookie、Authorization、敏感 URL 参数或用户正文。

## 用常见误区校准防线

### “Vue / React 自动防 XSS”

它们只在普通模板/JSX 文本等指定上下文做转义。原始 HTML、URL、第三方 DOM 插件和模板编译仍需独立边界。

### “所有输入先过滤一次”

同一个字符串在 HTML、属性、URL 和 JavaScript 上下文的安全规则不同。应在输出边界按上下文处理，并尽量使用不会解析代码的 API。

### “CSP 里写 `script-src 'self'` 就够了”

同源可能存在 JSONP、用户上传文件或可被利用的脚本端点。严格 nonce/hash CSP 更接近“信任具体入口”，但仍需安全 DOM 编码。

### “CORS 报错说明服务器没收到请求”

简单请求往往已经发送，只是响应不向脚本开放。检查服务端日志和请求类型，不能以浏览器脚本读不到作为无副作用保证。

### “有 SameSite 就不需要 CSRF token”

SameSite 是 same-site 边界，且需要在体验和兼容上权衡。使用 token、Origin / Fetch Metadata 等主要防线，再把 SameSite 作为纵深防御。

### “`postMessage('*')` 反正接收方会校验”

发送方使用 `*` 可能把数据交给已经导航到恶意 origin 的窗口。发送和接收两端都必须执行各自校验。

### “把所有安全响应头一次性打开”

COEP、COOP、CSP 会改变脚本、资源和窗口行为。应先盘点依赖、报告模式灰度、测试关键流程，并提供降级。

## 安全评审检查表

在功能进入生产前，至少回答：

1. 不可信数据有哪些 source，最终进入哪些 DOM、URL、脚本或网络 sink？
2. 普通文本是否始终使用文本 API？富文本由哪个受维护清洗器负责？
3. CSP 是否使用每响应 nonce 或 hash？是否仍有 `unsafe-inline` / `unsafe-eval`？
4. Trusted Types 是否在目标浏览器逐步强制，策略能否被随意创建？
5. 哪些请求改变状态？服务端如何验证 CSRF token、Origin 和 Fetch Metadata？
6. CORS allowlist 是否精确？动态响应是否设置 `Vary: Origin`？
7. `postMessage` 是否同时校验 origin、source、schema 和状态？
8. 页面允许被谁嵌入？第三方 iframe 拥有哪些 sandbox / Permissions Policy 能力？
9. COOP / COEP 是否必要？OAuth、支付、第三方资源和降级路径是否验证？
10. 第三方脚本获得了哪些数据与权限，谁负责更新和下线？
11. token、Cookie、日志、缓存、source map 中是否泄漏敏感信息？
12. 防线如何在 CI、真实浏览器和生产报告中持续验证？

## 延伸阅读

- [MDN：Same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy)
- [MDN：Cross-site scripting (XSS)](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/XSS)
- [MDN：Cross-site request forgery (CSRF)](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/CSRF)
- [MDN：Cross-Origin Resource Sharing (CORS)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)
- [MDN：Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP)
- [MDN：Trusted Types API](https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API)
- [MDN：Window.postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)
- [MDN：Cross-Origin-Resource-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Resource-Policy)
- [MDN：Cross-Origin-Opener-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy)
- [MDN：Cross-Origin-Embedder-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy)
- [MDN：Window.crossOriginIsolated](https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated)
- [W3C：Content Security Policy Level 3](https://w3c.github.io/webappsec-csp/)
- [W3C：Trusted Types](https://w3c.github.io/trusted-types/dist/spec/)
- [WHATWG：Fetch Standard](https://fetch.spec.whatwg.org/)

## 本节小结

浏览器安全机制不是互相替代的一组开关，而是不同方向的边界：

- 同源策略默认限制跨源读取，但保留了写入和嵌入能力；
- XSS 让攻击代码进入可信 origin，首要防线是安全 sink、上下文编码和可靠清洗；
- CSP 与 Trusted Types 用于限制执行能力和强制危险 sink 经过策略；
- CSRF 利用自动附带的身份，应组合 token、Origin、Fetch Metadata、非简单请求与 SameSite；
- CORS 是服务器授予浏览器脚本跨源读取能力的协议，不是认证或通用防火墙；
- `postMessage` 必须校验 origin、source、消息 schema 和状态；
- CORP、COEP、COOP 分别控制资源嵌入和浏览上下文隔离，启用时必须验证依赖与降级；
- 真正可靠的安全来自明确威胁模型、最小权限、服务端校验和持续测试。

下一节进入前端工程化模块，从 [Vite 开发服务器、模块图、插件与生产构建](../engineering/vite-dev-server-module-graph-plugins-and-production-build.md)开始。
