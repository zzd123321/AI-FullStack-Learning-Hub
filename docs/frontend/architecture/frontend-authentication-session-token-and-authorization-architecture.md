---
title: 前端身份认证、会话、Token 与授权架构
description: 从一次受保护请求出发，理解 Cookie Session、OAuth/OIDC、Authorization Code + PKCE、BFF、CSRF/XSS、刷新协调、权限模型与完整会话生命周期
outline: deep
---

# 前端身份认证、会话、Token 与授权架构

登录成功后把 `isLogin = true` 存进 Pinia，并不能构成认证系统。刷新页面后这个值从哪里恢复？Cookie 过期时十个并发请求怎么办？用户被管理员撤权后，旧页面为什么还能显示编辑按钮？攻击者复制了 Token，又为什么能在另一台机器上使用？

这些问题看似分散，实际上都围绕同一条链路：**浏览器如何获得身份事实，如何在后续请求中证明会话，服务端又如何对每个资源重新做授权决定**。

本课先建立这条链路，再逐步加入 OAuth/OIDC、Cookie、CSRF、XSS、刷新、多标签页和权限模型。目标不是记住一组安全名词，而是知道每一种机制解决哪一个问题、不能解决什么，以及它为什么必须放在当前边界。

## 学习目标

完成本课后，你应该能够：

- 区分认证、会话、OAuth 授权、OIDC 身份与业务授权；
- 根据威胁模型选择 Cookie Session、浏览器 OAuth Client 或 BFF；
- 解释 Authorization Code + PKCE 中 code、state、nonce 与 verifier 的职责；
- 正确理解 HttpOnly、Secure、SameSite、Domain、Path 和 Cookie 前缀；
- 解释 XSS 与 CSRF 为什么需要两组相互补充的防线；
- 设计 `unknown → authenticated/anonymous` 的前端会话状态机；
- 正确处理刷新 single-flight、请求重放、跨标签同步与登出；
- 把前端权限预测与服务端最终授权清楚分开；
- 用测试、日志和事故响应证明会话生命周期可靠。

## 从一次受保护请求建立心智模型

假设用户已经登录，现在点击“修改课程标题”。系统至少经历下面几步：

```text
Vue / React 页面
  │  根据 session view 决定是否显示“编辑”按钮
  ▼
浏览器发送 PATCH /api/lessons/42
  │  携带 session cookie，或由客户端附加 access token
  ▼
会话 / Token 验证
  │  这份凭证是否有效、过期、撤销，并且发给了当前服务？
  ▼
业务授权
  │  当前用户是否能编辑“课程 42”，而不只是拥有一个笼统角色？
  ▼
执行业务修改并返回新的资源版本
```

页面隐藏按钮只改善体验。攻击者可以绕开页面直接调用 API，所以真正保护课程 42 的判断必须发生在服务端。

### 五个容易混在一起的概念

| 概念 | 回答的问题 | 典型产物 |
| --- | --- | --- |
| 认证 Authentication | 当前主体是谁？ | 已验证的用户身份、认证强度 |
| 会话 Session | 多次 HTTP 请求怎样持续关联同一登录？ | Session ID、会话记录 |
| OAuth 授权 | Client 怎样获得调用 Resource Server 的授权？ | Access Token、Scope |
| OIDC 身份层 | Client 怎样验证一次标准化登录事件？ | ID Token、UserInfo |
| 业务授权 Authorization | 这个主体能否对这个具体资源执行这个动作？ | allow/deny 决策 |

OAuth 本身不是“登录协议”。它允许一个 Client 获得访问资源的授权。OIDC 在 OAuth 之上增加身份层，才定义 ID Token、UserInfo、`nonce` 等登录语义。

同样要区分三类 Token：

- **Access Token** 给 Resource Server，用来调用特定 audience 的 API；
- **ID Token** 给 OIDC Client，描述认证事件与用户 claims，不拿来调用业务 API；
- **Refresh Token** 给 Client 换取新 Token，通常寿命更长、风险也更高。

JWT 只是其中一种序列化格式，不是认证架构。前端 `decode` JWT 只能得到一段未被当前代码验证的 claims，不能据此执行真实授权。

### 服务端事实与前端投影

可靠前端不把“登录成功”当永久事实，而是向 `/session` 或 `/me` 获取一个最小会话视图：用户显示信息、当前租户、权限提示和必要的会话状态。它是服务端事实在 UI 中的**投影**，可以帮助渲染，但会过期，也不能替代 API 授权。

这一区分会贯穿后面的所有设计：

```text
服务端会话 / 授权策略：安全事实
             ↓
     /session 响应：有限快照
             ↓
前端 store / 路由 / 按钮：体验投影
```

## 先选择凭证放在哪里

“Token 应该存 localStorage 还是 Cookie”是一个过早的问题。应该先决定浏览器与认证服务器、业务 API 之间的架构，再讨论具体存储。

### Cookie Session

浏览器只持有一个不可预测的 Session ID，通常放在 first-party HttpOnly Cookie。服务端根据 ID 查找会话，或验证受保护的会话数据。

优点是业务 JavaScript 不接触 OAuth Token，撤销和权限更新也容易集中处理。代价是服务端要管理会话生命周期，而且浏览器会自动附带 Cookie，所以状态变更接口必须防 CSRF。

### 浏览器作为 OAuth 公共客户端

SPA 直接完成 Authorization Code + PKCE，并在内存中持有 Access Token，随后直接调用 Resource Server。它适合确实需要直连多个 API、离线或部署边界无法提供同源后端的场景。

但浏览器公共客户端无法安全保存传统 client secret。Token 暴露给 JavaScript 后，XSS、第三方脚本和依赖供应链都进入凭证威胁模型；刷新、轮换、跨标签协调和 API CORS 也由前端承担。

“只放内存”可以缩短持久泄漏窗口，却不能阻止正在运行的恶意同源脚本读取或使用 Token。“放 localStorage 方便刷新页面”则会把长期可重放凭证暴露给以后发生的同源脚本注入。

### Backend for Frontend（BFF）

BFF 是专门服务于这个 Web 前端的同源后端：它以机密 OAuth Client 身份处理授权回调，在服务端保存 Access/Refresh Token，只给浏览器一个 first-party HttpOnly 会话 Cookie。浏览器请求 `/api/*`，BFF 再选择正确 audience 的 Token 调上游。

```text
浏览器 ── session cookie + CSRF ──> BFF ── access token ──> Resource Server
                 看不到 OAuth Token       选择正确 audience
```

这通常显著减小浏览器 Token 暴露面，也把多标签刷新集中到服务端，但不是自动安全：BFF 仍要防 CSRF、开放重定向、SSRF、会话固定和越权，且不能把上游 Token 再返回浏览器。

IETF 的 Browser-Based Applications 文档仍处于标准化草案阶段，其中系统描述了 BFF、Token-mediating backend 和纯浏览器 Client。可以用它理解架构，但生产选型仍要结合身份提供商、组织边界和实际威胁模型，不能把草案当成某个框架的强制配置。

### 一个实用的选择顺序

对于同一组织控制的普通 Web 产品，可以先问：

1. 浏览器是否真的必须直接拿 Token 调跨域 Resource Server？
2. 能否提供同源 Session 或 BFF，让 OAuth Token 留在服务端？
3. 如果必须使用浏览器 Client，身份提供商是否完整支持 Authorization Code + PKCE、刷新令牌轮换或发送者约束？
4. 团队能否持续维护 XSS、CORS、刷新、多标签和 Token 生命周期？

这不是“Cookie 永远安全、Token 永远危险”。Cookie 与 Bearer Token 面对的自动发送、脚本可见性和重放方式不同，必须选择与系统边界相匹配的防护。

### Token 格式不会改变信任边界

常见 Access Token 是 Bearer Token：谁拿到它，谁就能在有效期内尝试使用。把它编码成 JWT 不会自动防止复制。降低泄漏影响需要组合短有效期、最小 scope、明确 audience、可靠撤销/轮换，以及在高风险场景采用 DPoP、mTLS 等发送者约束。

Resource Server 对每次请求验证 Token 是否发给自己，并按格式检查 issuer、audience、有效时间、允许的签名算法和必要的撤销/会话状态。不能只因为 JWT 签名正确就接受——一个发给 API A 的有效 Token 不应被 API B 使用。

Opaque Token 让 Resource Server 通过 introspection 或内部会话系统获取状态，JWT 则允许本地验证部分声明。两者是部署和一致性取舍，不改变“前端 decode 不是授权”“Token 不能进入 URL、日志和分析系统”这些原则。

## 登录跳转为什么需要一笔事务

现代 Web 登录通常不会让业务 SPA 自己收集身份提供商密码。应用先把浏览器跳转到 Authorization Server，用户完成登录和授权后，再带着一次性 Authorization Code 回到应用。

### Authorization Code + PKCE 的完整关系

登录开始时，Client 生成高熵 `code_verifier`，计算：

```text
code_challenge = BASE64URL(SHA256(code_verifier))
```

授权请求只携带 challenge；回调拿到 code 后，Token 请求再提交原始 verifier。Authorization Server 只有在二者匹配时才兑换 Token。

<<< ../../../examples/frontend/auth-session-architecture/pkce.ts

如果攻击者只截获 Authorization Code，却没有发起浏览器保存的 verifier，就无法兑换。RFC 9700 要求公共客户端使用 PKCE，并推荐机密客户端也使用；应采用 `S256`，每次事务重新生成，不能使用常量、复用或降级到不安全方法。

PKCE 保护的是 code 与发起 Client 实例的绑定，它不负责决定登录后跳到哪里，也不等同于所有 OIDC 验证。

现代浏览器应用不应改用 Implicit Flow 来“省掉换 code”：它会让 Access Token 从 Authorization Endpoint 经浏览器导航返回，缺少 Code Flow 在兑换阶段提供的绑定与重放保护。也不应使用 Resource Owner Password Credentials 模式让业务 Client 收集身份提供商密码；这会破坏凭据只交给身份系统的边界，也无法自然承载 MFA、Passkey 和联邦登录。RFC 9700 已分别不推荐 Implicit Grant，并明确禁止使用密码模式。

### state、nonce、verifier 各自绑定什么

把一次登录想成一张只使用一次的取件单：

| 值 | 绑定关系 | 回调时怎么用 |
| --- | --- | --- |
| `state` | 授权响应与发起浏览器事务 | 与本地/服务端事务匹配并一次消费 |
| `code_verifier` | Authorization Code 与发起 Client | 在 Token Endpoint 兑换 code |
| `nonce` | OIDC 认证请求与 ID Token | 验证 Token 中 nonce 与原请求一致 |
| return path | 产品登录动作与站内目的页 | 独立校验为允许的本地路径 |

RFC 9700 说明，在确认 Authorization Server 正确支持 PKCE 时，PKCE 也能提供强 CSRF 保护；但 `state` 仍常用于事务关联和携带不透明关联值。不要把用户可控 return URL 原样塞进 `state` 再跳转，也不要把所有字段混成一段无法独立验证的字符串。

<<< ../../../examples/frontend/auth-session-architecture/auth-transaction.ts

示例做了几件有意为之的事：

- `state`、`nonce` 和 verifier 每笔事务独立生成；
- 按 state 分开存储，允许同一标签内两次登录事务并存；
- 回调读取后先删除，再验证内容和十分钟寿命，失败也不能重放；
- return path 只接受长度受限的 `/...` 本地路径，并拒绝 `//`、反斜线和控制字符混淆；
- 对 sessionStorage 中的 JSON 重新做运行时校验，而不是使用类型断言。

sessionStorage 能把事务限制在当前标签，但同源 XSS 仍能读取 verifier 和 nonce。BFF 更适合把事务放在服务端会话或受保护的 HttpOnly transaction cookie 中。前端示例用于解释协议边界，不应替代成熟认证 SDK。

### 回调必须按失败关闭的顺序处理

回调 Service 应集中处理，不要把协议步骤散落在 Vue 页面生命周期中：

1. 确认回调属于预期 issuer、client 和精确注册的 redirect URI；
2. 拒绝互相矛盾或重复的 `code`、`error` 等参数；
3. 根据 state 一次消费本地或服务端事务；
4. 使用 code、verifier 和同一个 redirect URI 请求 Token Endpoint；
5. 验证 ID Token 签名、算法、issuer、audience、时间和已发送的 nonce；
6. 建立新会话，并在认证或权限提升后轮换 Session ID；
7. 用 `history.replaceState` 或服务端跳转清除地址栏中的 code/state；
8. 只跳转到事务中已经规范化的站内 return path。

多身份提供商场景还要防 mix-up：授权响应必须能绑定到预期 issuer，可使用规范定义的 issuer 标识或每个 issuer 独立回调地址。不能根据回调中的任意 URL 动态决定把 code/Token 发往哪个 endpoint。

redirect URI 在 Authorization Server 中应使用精确字符串匹配；通配子域和开放重定向会把一次性 code 送给攻击者。

## Cookie 只是会话信封，不是完整防线

推荐的主机会话 Cookie 形态通常类似：

```http
Set-Cookie: __Host-session=<opaque-id>; Path=/; Secure; HttpOnly; SameSite=Lax
```

- `Secure`：只通过 HTTPS 发送；
- `HttpOnly`：禁止 `document.cookie` 等脚本接口读取；
- `SameSite`：限制某些跨站请求携带 Cookie；
- `Path` 与 `Domain`：决定 Cookie 的发送范围，而不是可靠授权边界；
- `__Host-`：在支持前缀规则的浏览器中要求 `Secure`、`Path=/` 且不能设置 `Domain`；
- `Max-Age` / `Expires`：控制浏览器保留多久，不代表服务端会话一定仍有效。

Cookie 通常只放随机、不可预测的 opaque Session ID。用户资料、权限和撤销状态留在服务端。登录、权限提升和其他信任边界变化要轮换 Session ID，防止会话固定。

确实需要跨站发送 Cookie 时，`SameSite=None` 必须同时设置 `Secure`，并接受第三方 Cookie 策略仍可能阻止它。Cookie 前缀也只在支持规则的浏览器中提供额外约束，服务端仍要自行保证配置正确。

不要依赖浏览器“可能默认 Lax”，也不要为省配置把 `Domain` 放宽到整个父域。Cookie 的 **site** 与 JavaScript 的 **origin** 不是同一个边界：两个子域可以 same-site 却不同源，较弱的兄弟子域可能改变你的威胁模型。

### XSS 与 CSRF 是两条不同攻击路径

| 攻击 | 攻击者利用什么 | HttpOnly 的作用 | 还需要什么 |
| --- | --- | --- | --- |
| XSS | 恶意脚本在应用 origin 内运行 | 降低直接读取 Cookie 的可能 | 输出编码、框架安全 API、CSP/Trusted Types、依赖治理 |
| CSRF | 浏览器自动向目标站点携带 Cookie | 没有直接帮助 | SameSite、CSRF Token、Origin/Fetch Metadata 等 |

HttpOnly 能阻止普通脚本读取 Cookie，但活动 XSS 仍可以在页面内发请求、读取可访问响应、修改转账收款人。因此“Token 偷不走”不等于“账户不能被操作”。反过来，CSRF Token 也不能抵挡同源恶意脚本，因为脚本往往能读取或自动带上该 Token。

### SameSite 为什么还不够

`SameSite=Lax/Strict` 是重要的纵深防御，但业务可能包含顶层导航、同站不同源子域、旧 WebView、外部身份回跳等例外。状态变更接口应组合：

- GET、HEAD 只读取，不产生业务副作用；
- 只接受预期 method 和 content type；
- 校验服务端生成、与会话绑定且不可预测的 CSRF Token；
- 验证 `Origin`，根据兼容策略处理缺失值；
- 用 `Sec-Fetch-Site` 等 Fetch Metadata 拒绝明显跨站的危险请求；
- 高风险操作要求用户再次确认或重新认证；
- 最后仍对具体资源做业务授权和幂等处理。

前端把同步 CSRF Token 放在内存或服务端渲染的安全 bootstrap 中，并作为自定义请求头发送：

<<< ../../../examples/frontend/browser-security/csrf-client.ts

服务端必须比较请求 Token 与当前会话中的期望值，同时检查 Origin 和 Fetch Metadata：

<<< ../../../examples/frontend/browser-security/csrf-server-policy.ts

生产实现还要使用恒定时间比较、代理后的可信目标 origin 配置、旧客户端 fallback 和安全日志。若采用 double-submit Cookie，应使用经过证明的签名并与当前会话绑定，不能只比较两个攻击者都可能设置的相同字符串。

### CORS 不是 CSRF 或授权

跨源 Cookie 请求通常需要前端 `credentials: 'include'`，服务端返回精确的 `Access-Control-Allow-Origin`、允许 credentials，并正确响应预检。credentialed response 不能配 `Access-Control-Allow-Origin: *`。

CORS 决定浏览器是否允许调用方脚本**读取响应**，并不保证请求没有发出，也不验证当前用户能否修改资源。攻击者自己的 HTTP Client 更不受浏览器 CORS 限制。因此 API 同时需要身份验证、业务授权和 CSRF 策略。

第三方 Cookie 策略还可能在 CORS 配置正确时阻止 Cookie。Partitioned Cookie（CHIPS）按顶层站点分区，适合某些嵌入场景，但不会把旧式隐藏 iframe silent login 自动变成可靠的跨站认证架构。优先采用顶层授权跳转、first-party 会话或 BFF，并在目标浏览器真实测试。

## 前端需要的是状态机，不是登录布尔值

页面刚启动时，浏览器可能有有效 HttpOnly Cookie，但 JavaScript 读不到它。因此初始状态应该是 `unknown`，先请求 `/session`，再进入 authenticated 或 anonymous。

如果一开始就设成 anonymous，用户会先看到登录页再跳回内容页；路由守卫可能错误重定向；SSR 输出与客户端 hydration 也会不一致。

### 先验证会话接口的运行时数据

`fetch().json()` 返回 `unknown` 世界的数据。TypeScript 接口不会检查服务端响应、旧版本缓存或被中间层篡改的数据。

<<< ../../../examples/frontend/auth-session-architecture/session-contract.ts

解析器限制用户字段和权限数量，复制并去重权限数组。畸形响应失败关闭，不能直接进入全局 Store。生产契约还可以加入 schema version、tenant、session expiry 提示和策略版本，但不要把 Session ID、Refresh Token 或敏感 claims 返回给页面。

### 状态变化表达不同的用户事实

<<< ../../../examples/frontend/auth-session-architecture/auth-state.ts

核心状态可以理解为：

```text
unknown ── /session 有效 ──> authenticated
   │                             │
   └── 明确无会话 ──> anonymous  ├── 刷新开始 ──> refreshing
                                 └── 网络失败 ──> unavailable
```

`unavailable` 与 anonymous 不同。网络断开只证明“暂时无法向服务器确认”，不证明用户已经登出；示例保留最近一次 UI 投影，但敏感提交应停下并要求重新确认。`expired` 与主动 `signed-out` 也可以显示不同恢复文案。

Store 只保存可序列化的最小会话投影。HttpOnly Cookie 不需要也不应该被复制进 Store，Access/Refresh Token 不进入持久化插件、错误快照或开发工具日志。

### 路由和 SSR 怎样消费状态

路由守卫负责体验：

- `unknown` 时等待一次共享 bootstrap，而不是多个守卫各发一次 `/session`；
- anonymous 时跳转登录，并保存规范化的站内 return path；
- authenticated 但缺少权限时显示 403，而不是再次登录；
- unavailable 时显示可恢复状态，不把短暂离线当作登出。

守卫仍不是安全边界。SSR 应在服务端读取 Cookie，生成同一份最小 Session View 并安全序列化；客户端用这份事实 hydrate，避免重复闪烁。不要把 HttpOnly Cookie 或原始 Token 写进 HTML。

## 会话过期时，先解决并发再谈刷新

页面可能同时加载用户、课程和通知。若它们一起收到 401，并各自发起 Refresh Token Rotation：第一个刷新让旧 Token 失效，其余请求可能看起来像重放，最终导致整条 Token family 被撤销。

### single-flight 只允许一次刷新

<<< ../../../examples/frontend/auth-session-architecture/refresh-coordinator.ts

示例把当前刷新 Promise 共享给同一 JavaScript context 中的所有等待者。刷新成功后，每个原请求最多重放一次，避免 401 → refresh → replay → 401 的无限递归。

它还强制调用方明确两个事实：

- `shouldRefresh(response)`：这个 401 确实代表当前会话过期，而不是登录接口密码错误或另一套认证失败；
- `canReplay`：请求主体能够重建，并且业务语义允许再执行一次。

GET 通常可以重放；带 Idempotency-Key 且服务端正确去重的命令也可能可以。流式 body、上传中间状态和“服务端是否已经执行未知”的支付请求不能因为看到 401 就盲目重放。

single-flight 只协调当前标签页。多个标签仍可能同时刷新。可选方案包括 BFF 统一持有 Refresh Token、服务端设计合理的 Rotation/Replay Detection，或用跨标签选主协议协调。不能只广播 Refresh Token 来解决——那会扩大泄漏面。

RFC 9700 要求公共客户端的 Refresh Token 使用发送者约束，或采用每次刷新都替换旧 Token 的 Rotation。DPoP 可以把 Token 绑定到密钥，但它不是 XSS 万能药：活动恶意脚本可能调用合法密钥接口或预先生成证明。架构仍要减少脚本暴露面并限制 Token 的 audience、scope 和寿命。

### 跨标签消息只是失效提示

<<< ../../../examples/frontend/auth-session-architecture/session-events.ts

BroadcastChannel 只发送版本化的 `signed-out` 或 `session-changed`，不发送 Token、Cookie、完整用户对象或权限表。收到消息后，每个标签重新请求 `/session`，由服务器给出事实。

BroadcastChannel 不可用时，可以使用只含提示的 `storage` event fallback，或者让旧标签在下一次 API 请求时通过 401/403 收敛。事件可能丢失，所以页面从后台恢复可见、`pageshow`/bfcache 恢复以及高风险操作前仍应重新对账。

## 认证成功之后仍要逐资源授权

“用户是 admin”往往太粗。一个多租户系统至少还要问：当前租户是否匹配？用户是不是资源所有者？课程是否处于可编辑状态？订阅是否有效？是否正在受限地区？

### 从角色走向权限与属性

- RBAC 用 Role 聚合权限，便于运营管理；
- Permission/Capability 使用 `lesson:edit` 这类稳定动作，减少前端硬编码角色名；
- ABAC 加入租户、所有者、资源状态、地区、认证强度等属性；
- ReBAC 根据成员、维护者、所有者等主体—资源关系决策。

前端可以使用同一套“需求描述”预测 UI：

<<< ../../../examples/frontend/auth-session-architecture/authorization.ts

但示例中的属性来自页面快照，只能决定按钮和说明。服务端必须使用可信身份和最新资源属性重新计算。批量 API 要对每项资源授权，GraphQL Resolver/字段也要在正确边界检查，不能只验证入口有某个角色。

### 401、403 与隐藏按钮的区别

- **401** 通常表示当前请求缺少有效认证，应按协议判断能否刷新；
- **403** 表示身份可能有效，但这个动作不被允许，不应循环跳登录；
- **隐藏按钮** 只是避免用户点击必然失败的操作；
- **服务端 allow/deny** 才是资源安全边界。

权限快照会陈旧。收到 403 时可以重新获取 Session/Permission View，并显示“权限已变化”，但不能在前端擅自恢复权限。策略响应可携带稳定 reason code，避免暴露内部规则和敏感资源存在性。

### 缓存必须包含身份维度

Query Cache、IndexedDB、Service Worker Cache 和内存实体表如果只按 `/api/profile` 或资源 ID 建 key，账号切换后可能显示上一用户的数据。

登出、账号/租户切换时需要：

- 取消仍在途的旧身份请求；
- 清除或隔离用户/租户敏感缓存；
- 关闭 WebSocket、SSE、Worker 与订阅；
- 重新建立带新身份 epoch 的请求上下文；
- 丢弃在旧 epoch 下迟到的响应。

“刷新页面后自然清掉”不足以覆盖多标签、离线缓存和 Service Worker。

## 登出、再认证与故障恢复是一条生命周期

完整登出不仅是 `store.user = null`：

1. 调用幂等服务端登出，撤销当前 Session/Refresh Token；
2. 用相同 Path/Domain 等属性让 Session Cookie 过期；
3. 根据产品语义决定是否触发 OIDC RP-Initiated Logout；
4. 清理前端敏感缓存、请求、后台连接与离线数据；
5. 广播无敏感数据的失效提示；
6. 跳转到固定或已校验的安全页面。

“只退出当前应用”与“退出整个身份提供商”不是同一个产品动作。全局退出可能影响同组织其他产品，也不能假设所有 IdP 都保证前通道/后通道事件实时到达。

### 高风险操作需要新的认证证据

已有会话可能来自数小时前，也可能是用户暂时离开电脑后被他人操作。修改密码、绑定 MFA、支付、导出数据、删除账号等操作可要求 recent authentication、MFA 或 Passkey user verification。

服务端记录短期 authentication assurance 和认证时间，并在执行动作时重新检查。前端弹出一个密码框后设置 `recentlyVerified = true` 没有安全意义。

### 失败必须保持语义差异

| 现象 | 推荐处理 |
| --- | --- |
| 会话明确过期 | 至多一次受控刷新，失败后进入 expired |
| 403 | 保持身份，刷新权限投影并显示无权状态 |
| 网络离线/超时 | 进入 unavailable，不擅自撤销本地上下文 |
| state/nonce/verifier 不匹配 | 终止回调、一次清理事务并记录安全事件 |
| issuer/audience/签名验证失败 | 失败关闭，绝不降级接受 |
| CSRF 校验失败 | 不自动重放危险请求，重新 bootstrap 后由业务决定 |
| Worker/页面恢复或账号切换 | 重新与服务器对账并隔离旧响应 |

错误页面、URL、分析系统和日志不得显示 Authorization Code、Access/Refresh Token、Cookie、verifier、完整 state 或敏感 claims。

## 用可验证证据守住认证架构

### 示例测试覆盖了什么

<<< ../../../examples/frontend/auth-session-architecture/auth-runtime.test.ts

示例验证了：

- 网络失败不会被归类为登出；
- Session Response 会运行时校验并复制权限；
- 外域、scheme-relative 与反斜线 return path 被拒绝；
- 两笔登录事务可并存、一次消费且会过期；
- PKCE 值每次随机并采用正确 Base64URL 形态；
- 两个并发 401 只运行一次刷新，随后各自至多重放一次；
- 跨标签消息版本、类型和时间戳失败关闭。

纯逻辑测试仍不能证明浏览器 Cookie、OAuth 服务器、CORS 和重定向真实工作。预发布环境还要覆盖：

- 真实 IdP discovery、JWKS 轮换、issuer/audience/nonce 验证；
- redirect URI 精确匹配、错误 state、code 重放与 mix-up；
- Cookie Secure/HttpOnly/SameSite/Path/Domain 和 Session ID 轮换；
- CSRF Token、Origin、Fetch Metadata、旧 WebView fallback；
- 多并发 401、Rotation 重用检测、多标签与 bfcache；
- 401、403、离线、撤权和租户切换的不同 UI；
- SSR/hydration、缓存隔离、登出和账号切换；
- CSP、Trusted Types、依赖注入与 Token 日志泄漏。

### 观测不能变成秘密仓库

可以记录不含秘密的 correlation ID、login attempt 内部 ID、issuer 标识、client、稳定结果码、会话年龄区间、刷新原因、权限策略版本和 deny reason。

需要监控登录成功/取消/失败率、回调校验失败、Refresh Token 重用检测、401/403 激增、会话建立与撤销延迟、MFA 失败、开放重定向拦截和异常多地使用。

日志中禁止出现密码、Authorization Code、Access/Refresh Token、Cookie、verifier、完整 state、原始 ID Token 和敏感用户 claims。安全团队还需要有密钥/Token 泄漏后的撤销、会话失效、用户通知和取证流程。

### 常见错误背后的原因

#### 把 JWT 放进 localStorage 就结束设计

这只解决了页面刷新后“还能读到字符串”，没有解决 XSS 外泄、刷新轮换、撤销、audience、跨标签和服务端授权。

#### 用 ID Token 调业务 API

ID Token 的 audience 是 Client，Resource Server 需要的是发给自己的 Access Token。混用会破坏 Token 接收者边界。

#### 每个 Axios 拦截器各自刷新

并发 401 会产生刷新风暴和 Rotation 竞争。刷新协调应是应用级单例或集中在 BFF，并限制一次重放。

#### HttpOnly 被理解成“防住 XSS”

它降低直接窃取 Cookie 的机会，但恶意同源脚本仍可以代理用户操作。必须同时治理注入和敏感动作确认。

#### SameSite 被理解成“无需 CSRF Token”

同站子域、业务导航和兼容场景会留下边界。根据威胁模型组合 Token、Origin 与 Fetch Metadata。

#### 前端角色判断被当成授权

任何人都能修改前端状态或直接请求 API。权限检查必须使用服务端可信身份与资源属性。

#### 登出只清一个 Store

旧请求、IndexedDB、Query Cache、Service Worker、WebSocket 和其他标签仍可能保留用户数据。登出是跨资源生命周期操作。

### 渐进落地路线

先建立同源 `/session`、运行时响应校验和 `unknown` 状态机，清楚区分 401、403 与网络失败。随后根据边界选择 HttpOnly Cookie Session/BFF，补齐 CSRF、Session ID 轮换和安全 return path。

接入 OAuth/OIDC 时采用成熟 Client，使用 Authorization Code + PKCE、精确 redirect URI、一次性事务和完整 ID Token 验证。之后再加入刷新 single-flight、多标签失效提示、权限投影和身份缓存隔离。

最后通过真实 IdP 与生产构建补齐 MFA/recent auth、Refresh Token Rotation/Replay Detection、审计、灰度和泄漏事故演练。不要一开始自己实现完整 OAuth SDK，也不要等上线后才验证 Cookie 和回调行为。

### 上线检查清单

- [ ] 认证、会话、OAuth、OIDC 和业务授权职责清楚分开；
- [ ] 凭证位置由威胁模型决定，浏览器不无理由持有长期 Token；
- [ ] Cookie 使用 Secure、HttpOnly、明确 SameSite/Path/Domain 与合理期限；
- [ ] 登录及权限提升会轮换 Session ID，服务端支持撤销与超时；
- [ ] Cookie 状态变更接口组合 CSRF Token、Origin/Fetch Metadata 等防护；
- [ ] 使用 Authorization Code + PKCE S256，未采用 Implicit 或密码模式；
- [ ] redirect URI 精确注册，return path 只允许安全站内路径；
- [ ] state、nonce、verifier 每事务生成、限时并一次消费；
- [ ] issuer、audience、签名、算法、时间和 nonce 在可信组件验证；
- [ ] Access/Refresh/ID Token 不混用，也不进入 URL、日志或跨标签消息；
- [ ] Session Response 有运行时校验，启动阶段不会闪烁错误身份；
- [ ] 刷新采用 single-flight，只对明确且可安全重建的请求重放一次；
- [ ] 公共客户端 Refresh Token 使用轮换或发送者约束；
- [ ] 403 与 401 分离，服务端对每个资源和动作最终授权；
- [ ] 登出、账号/租户切换会隔离缓存、请求、连接和迟到响应；
- [ ] 跨标签、bfcache、离线和权限变化最终都与服务器重新对账；
- [ ] 高风险操作有服务端 recent auth/MFA 与完整审计；
- [ ] 真实 IdP、浏览器、生产 CSP/CORS/Cookie 流程已做 E2E 和事故演练。

## 总结

前端认证架构的核心不是保存一个 Token，而是维护一条可以被验证、撤销和恢复的身份链路：

- 认证回答“是谁”，会话延续身份，OAuth 授权 Client，OIDC表达登录，业务授权保护具体资源；
- 先选择 Cookie Session、浏览器 Client 或 BFF，再决定凭证存储；
- Authorization Code + PKCE 依靠一次性事务绑定跳转、code 和发起浏览器；
- HttpOnly 减少脚本读取，SameSite 限制部分跨站发送，但 XSS 与 CSRF 都需要完整纵深防御；
- 前端从 `unknown` 向服务端确认会话，网络失败、过期和主动登出不能混为一谈；
- 刷新要 single-flight，重放必须显式证明安全，多标签只传播失效提示；
- 前端权限是体验投影，服务端逐资源授权才是最终边界；
- 登出、缓存隔离、再认证、观测和事故响应共同组成会话生命周期。

下一节：[前端支付、结算与高风险交易交互架构](./frontend-payment-checkout-and-high-risk-transaction-architecture.md)，会把本课的身份、幂等、再认证和故障语义应用到金额、订单、支付状态与第三方收银台。

## 参考资料

- [RFC 9700：OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700)
- [RFC 7636：Proof Key for Code Exchange](https://www.rfc-editor.org/rfc/rfc7636)
- [RFC 9449：OAuth 2.0 Demonstrating Proof of Possession](https://www.rfc-editor.org/rfc/rfc9449)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
- [IETF Draft：OAuth 2.0 for Browser-Based Applications](https://datatracker.ietf.org/doc/draft-ietf-oauth-browser-based-apps/)
- [MDN：Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)
- [MDN：Secure cookie configuration](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Cookies)
- [MDN：CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)
- [MDN：Fetch Metadata](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Fetch_metadata)
- [MDN：Cookies Having Independent Partitioned State](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies/Partitioned_cookies)
- [OWASP：Cross-Site Request Forgery Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
