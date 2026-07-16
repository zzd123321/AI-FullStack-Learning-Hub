---
title: 前端身份认证、会话、Token 与授权架构
description: 系统掌握 Cookie Session、OAuth/OIDC、Authorization Code + PKCE、BFF、CSRF/XSS、刷新协调、权限建模、登出与生产治理
---

# 前端身份认证、会话、Token 与授权架构

登录页只是认证系统最显眼的一小部分。真正困难的是：浏览器如何长期保持会话、OAuth 回跳如何绑定到发起者、多个请求同时 401 如何只刷新一次、多个标签页怎样同步登出、路由守卫怎样避免闪烁，以及前端“没有按钮”为什么从来不等于后端授权。

本课把身份协议、浏览器存储、安全威胁、前端状态和服务端权限分层，建立能够审计和演进的会话架构。

## 学习目标

- 区分 authentication、session、OAuth authorization、OIDC identity 与业务 authorization；
- 比较 Cookie Session、浏览器持有 Token 与 BFF；
- 理解 Authorization Code + PKCE、state、nonce 和精确 redirect URI；
- 正确配置 HttpOnly、Secure、SameSite、Domain、Path 与 cookie prefix；
- 同时防御 XSS、CSRF、token 泄漏、开放重定向和会话固定；
- 设计 unknown/authenticated/refreshing/anonymous 状态机；
- 协调刷新、401 重放、跨标签登出与回跳；
- 区分前端体验控制与服务端最终授权；
- 建立 RBAC/permission/attribute、测试、观测和事故响应。

## 一、先把五个概念分开

```text
认证 Authentication：你是谁？
会话 Session：多次请求如何持续识别你？
OAuth：客户端如何获得调用资源的授权？
OIDC：在 OAuth 之上表达登录身份？
业务授权 Authorization：你能对哪个资源执行什么动作？
```

OAuth access token 面向 resource server，不是给 UI 随意解析的“用户对象”。OIDC ID Token 面向 client，用来证明认证事件，也不是调用业务 API 的 access token。

前端可以根据服务端返回的 session view 显示用户和权限，但最终访问判断必须发生在每个后端资源/动作上。

## 二、浏览器威胁模型

### XSS

攻击脚本与应用同源运行。localStorage/sessionStorage 中 token 可直接被读走；HttpOnly cookie 虽不能读取，但脚本仍可能以用户身份发请求。因此 HttpOnly 降低凭证外泄，不替代 CSP、输出编码、依赖治理和敏感操作再验证。

### CSRF

浏览器可能自动携带 cookie 向目标站点发请求。恶意站点可诱导用户浏览器提交状态变更，因此 cookie 会话需要 SameSite、CSRF token、Origin/Fetch Metadata 检查等组合防御。

### Token 重放

Bearer token 被拿到即可使用。限制 lifetime、audience、scope，并按风险考虑 sender-constrained token；日志、URL、referrer 和错误上报不能包含 token。

### 会话固定与开放重定向

登录后应旋转 session identifier；return URL 和 OAuth redirect URI 必须受控，不能把认证结果送到攻击者地址。

## 三、三种浏览器会话架构

| 架构 | 浏览器持有 | 优点 | 主要风险/成本 |
| --- | --- | --- | --- |
| Cookie Session | HttpOnly session ID | 前端不接触 token | CSRF、会话存储/验证 |
| SPA OAuth client | access token，可能还有 refresh token | 可直调多个 API | XSS 外泄、刷新和协议复杂 |
| BFF | 仅 first-party HttpOnly cookie，BFF 持 token | token 不暴露 JS、集中协议 | 增加后端组件与 CSRF 防护 |

对同一组织控制的 Web 产品，BFF/服务端 session 往往能减少浏览器 token 暴露。它不是自动安全：BFF 仍要校验 CSRF、授权、redirect、cookie 和上游 token audience。

不要因为“SPA”就默认 localStorage token，也不要为了避免 CSRF 把可长期重放的 refresh token 暴露给所有同源脚本。

## 四、Cookie 的安全属性

推荐主机会话形态示意：

```http
Set-Cookie: __Host-session=<opaque>; Path=/; Secure; HttpOnly; SameSite=Lax
```

- `Secure`：仅 HTTPS 传输；
- `HttpOnly`：JavaScript 不能读取；
- `SameSite`：限制跨站携带，Lax/Strict/None 取决于协议；
- `Path`/`Domain`：控制发送范围；
- `__Host-`：要求 Secure、Path=/ 且无 Domain，收紧到当前 host；
- `Max-Age`/`Expires`：持久期限，不等于服务端会话一定有效。

`SameSite=None` 必须配合 Secure。不要依赖浏览器默认 SameSite，也不要把 Domain 放宽到整个父域，任何较弱子域都可能扩大攻击面。

Cookie 中保存随机 opaque ID，而不是敏感用户资料。服务端保存/验证会话、轮换、撤销和绝对/空闲超时。

## 五、SameSite 不是完整 CSRF 防护

同站不同源、顶层导航、旧客户端和业务流程都会影响 SameSite。状态变更接口还应：

- 只接受预期 method/content type；
- 验证 CSRF token（同步 token 或经过证明的模式）；
- 验证 Origin，必要时结合 Sec-Fetch-Site 等 Fetch Metadata；
- CORS 精确 allow origin，credentials 时不能使用 `*`；
- GET/HEAD 不产生副作用；
- 高风险操作要求重新认证/确认；
- 服务端仍执行资源授权和幂等。

CSRF token 不应被第三方脚本或错误日志泄漏。XSS 能绕过大多数页面内 CSRF 防护，所以两类风险必须同时治理。

## 六、OAuth 与 OIDC 的职责

OAuth authorization server 向 client 发放调用 resource server 的授权。OIDC 增加 ID Token、UserInfo、nonce 等身份层协议，让客户端能够验证登录事件。

现代浏览器流程使用 Authorization Code；Implicit 将 token 暴露在前端导航响应中，当前安全 BCP 不再建议。Resource Owner Password Credentials 让 client 收集用户密码，也已被安全 BCP 明确弃用。

不要自己发明“前端拿用户名密码换 JWT”并称为 OAuth。协议发现、issuer、client、redirect URI、token endpoint、JWKS、audience 和 logout 都要使用成熟实现。

## 七、Authorization Code + PKCE

PKCE 每次登录生成高熵 `code_verifier`，Authorization Request 携带其 S256 `code_challenge`；回调换 token 时提交 verifier。即使 authorization code 泄漏，攻击者没有 verifier 也无法兑换。

<<< ../../../examples/frontend/auth-session-architecture/pkce.ts

示例用 32 字节密码学随机数产生 43 字符 Base64URL verifier，再计算 SHA-256 challenge。每次事务重新生成，不能使用常量或跨登录复用。

公共客户端必须使用 PKCE，机密客户端也推荐。Authorization server 还要防止 PKCE downgrade，并只接受预注册 redirect URI 的精确匹配。

## 八、state、nonce 与登录事务

- `state`：把回调绑定到发起浏览器事务，并可防 CSRF；
- `nonce`：OIDC 中绑定认证请求与 ID Token，防重放/注入；
- `code_verifier`：把 authorization code 绑定到发起 client 实例；
- return path：登录后产品回跳目标，必须独立校验。

<<< ../../../examples/frontend/auth-session-architecture/auth-transaction.ts

示例事务放 sessionStorage、一次消费并限制十分钟。生产 runtime schema 还应限制所有字段长度，回调无论成功失败都清理事务。

不要把 return URL 直接塞进 state 后原样跳转。示例 `normalizeReturnPath` 只保留长度受限的同源路径；外域、畸形 URL 和异常输入都安全退回 `/`。事务还必须拒绝未来时间戳和过期时间戳，并在第一次读取后立即删除，避免重放。服务端/BFF 方案更适合把 state/verifier/nonce 绑定到 HttpOnly transaction cookie 或服务端 session，减少脚本可见材料。

## 九、回调处理顺序

安全回调大致顺序：

1. 识别预期 issuer/client/redirect；
2. 拒绝同时含有矛盾 code/error 的异常响应；
3. 一次性消费事务，验证 state；
4. 用 code + verifier 在可信 token endpoint 兑换；
5. OIDC 验证 ID Token 签名、issuer、audience、时间与 nonce；
6. 建立新 session 并旋转 identifier；
7. 清理地址栏中的 code/state；
8. 跳转到校验后的 return path。

SPA 不应在业务组件里分散实现这些步骤。使用认证 SDK 或单一 auth callback service，并固定允许的 issuer 和 endpoint，防止把 token 发给伪造 resource server。

## 十、BFF 流程

```text
浏览器 → /auth/login（BFF 建事务）
→ Authorization Server
→ /auth/callback（BFF 换 token、验证 OIDC）
→ BFF 设置 HttpOnly session cookie
→ 浏览器调用 /api/*（仅 cookie + CSRF）
→ BFF 附加正确 audience 的 access token 调上游
```

BFF 不能把上游 access/refresh token 再返回浏览器。不同 API 使用不同 audience/scope 的 token；不要把一个高权限 token 转发给任意运行时 URL。

## 十一、前端认证状态机

<<< ../../../examples/frontend/auth-session-architecture/auth-state.ts

应用启动时是 `unknown`，不是 anonymous。先调用 `/session`/`/me` 确认，再渲染受保护内容；否则会出现登录页闪烁、错误跳转和 hydration 不一致。

`refreshing` 保留当前 user view 但禁止需要新凭证的敏感提交；`expired` 与主动 signed-out 文案不同；网络失败不应自动当作退出登录，否则短暂离线会清除用户上下文。

状态 store 只保存用户展示信息、权限快照和阶段，不持久化 refresh token。服务器仍是会话与授权真相。

## 十二、401 刷新风暴

页面并发十个请求同时 401，如果各自刷新，会触发 refresh token rotation 竞争：第一个成功后旧 token 失效，其余刷新可能让整个 token family 被视为重放。

<<< ../../../examples/frontend/auth-session-architecture/refresh-coordinator.ts

single-flight 让同一上下文共享刷新 Promise，并且每个请求最多重放一次。`send()` 必须能安全重建请求；流 body 或不可重复读取的主体不能直接复用。

只有确定未执行或具备幂等键的操作才自动重放。刷新再次失败后转 anonymous/expired，不递归刷新。多个 tab 仍可能各自刷新，因此服务端 rotation grace、BFF 集中刷新或跨 tab 协调也要纳入设计。

## 十三、Access Token 与 Refresh Token

Access token 应短期、最小 scope、正确 audience；refresh token 权限更高、寿命更长，需要 rotation、重用检测、撤销和设备/session 绑定。

如果 SPA 必须持 access token，优先内存并在刷新后重新建立会话；这减少持久外泄窗口，但不能阻止活动 XSS。refresh token 是否允许浏览器持有取决于授权服务器、威胁模型和标准实现，不能自行降低保护。

JWT 只是 token 格式。前端 decode payload 只适合提示性 UI，不能验证授权；服务端验证签名、issuer、audience、时间、算法和撤销策略。不要根据客户端解析的 `role=admin` 执行真实权限。

## 十四、跨标签页会话

<<< ../../../examples/frontend/auth-session-architecture/session-events.ts

BroadcastChannel 只广播 `signed-out`/`session-changed` 提示，不广播 token 或用户敏感数据。收到事件后各 tab 重新请求 session view。使用前还应做能力检测；不支持时可用 `storage` 事件发送同样的无敏感数据通知，或者接受旧页面在下一次 API 请求收到 401 后再收敛。降级只影响同步速度，不能降低服务端会话校验强度。

事件可能丢失，页面恢复可见、pageshow/bfcache 恢复和关键操作前仍要向服务器确认。登出接口幂等，多 tab 同时调用应安全。

## 十五、路由守卫的职责

守卫负责体验：unknown 时等待、anonymous 时去登录、缺少权限时显示 403、保存安全 return path。守卫不是授权边界，用户可绕过路由直接调用 API。

SSR 路由在服务器读取 cookie 并生成 session view，客户端 hydrate 必须使用同一初始事实。不要把 HttpOnly cookie 内容序列化到 HTML；只输出最小、经过转义的用户视图和权限快照。

## 十六、认证与授权分开

“已登录”不代表能编辑所有课程。业务授权可以组合：

- RBAC：role 聚合权限，便于管理；
- permission/capability：如 `lesson:edit`，比前端硬编码角色更稳定；
- ABAC：租户、所有者、状态、地区、风险等属性；
- ReBAC：用户与资源关系，如成员/维护者。

<<< ../../../examples/frontend/auth-session-architecture/authorization.ts

示例用于 UI 预测，服务端必须用可信资源属性重新计算。同一页面可能 read 允许、edit 拒绝；批量 API 每项资源都要授权，不能只验第一项。

## 十七、权限变化与缓存

权限快照会陈旧：管理员撤权、租户切换、订阅到期都可能发生。403 不应一律跳登录；它通常表示身份有效但权限不足，应刷新 session/permission view 并显示明确状态。

前端数据缓存 key 应包含身份/租户等必要维度，登出和账号切换时取消请求、清除敏感 query cache、IndexedDB、Service Worker/离线数据和 WebSocket。不能让下一用户看到上一用户缓存。

## 十八、CORS 与 credentials

跨源 cookie 请求需要前端 `credentials: 'include'`、服务端精确 `Access-Control-Allow-Origin`、允许 credentials 和正确预检。`*` 不能与 credentialed response 组合。

CORS 只限制浏览器读取响应，不阻止请求被发送，也不是 CSRF 防护或 API 鉴权。更简单安全的 BFF 常让浏览器只访问同源 `/api`。

第三方 cookie 限制会破坏隐藏 iframe silent auth。不要依赖长期 third-party cookie；采用顶层授权跳转、BFF/session 或符合当前标准的交互流程。

## 十九、登出不是删除前端变量

完整登出包括：

1. 服务端撤销当前 session/refresh token；
2. Set-Cookie 以相同 Domain/Path 清除 cookie；
3. 必要时触发 OIDC RP-Initiated Logout；
4. 清理本地用户数据、缓存和后台连接；
5. 广播跨标签事件；
6. 跳转到固定安全页面。

本地 logout 与身份提供商全局 logout 是不同产品语义。避免开放 post_logout_redirect_uri。账号切换要建立新 session ID，不能复用旧权限快照。

## 二十、敏感操作再验证

已有会话可能来自数小时前或被暂时离开的设备。修改密码、绑定 MFA、导出数据、支付和删除账号可要求 recent authentication、MFA 或 passkey user verification。

再验证结果由服务端记录短期 assurance，不是前端弹一个密码框后自己设 boolean。失败次数、恢复、风控和审计集中在身份系统。

## 二十一、错误与恢复

- 401：未认证/过期，尝试至多一次受控刷新；
- 403：身份有效但授权不足，不循环登录；
- 419/自定义 CSRF：刷新 CSRF/session bootstrap 后只重放安全请求；
- network/offline：保持未知或离线状态，不自动登出；
- callback state/nonce 错误：终止流程、清理事务并记录安全事件；
- issuer/audience/signature 错误：绝不降级接受；
- clock skew：小范围服务端容忍并监控，不能关闭时间验证。

错误页面不显示 code、token、verifier、state 原值或内部 IdP 响应。

## 二十二、测试策略

纯逻辑覆盖状态机、同源 return path 和授权预测：

<<< ../../../examples/frontend/auth-session-architecture/auth-logic.test.mts

还应覆盖：

- PKCE verifier/challenge、每事务随机性；
- state/nonce 缺失、错误、重放和过期；
- 两个并发 401 只刷新一次；
- refresh rotation、失败和一次重放上限；
- Cookie attributes、CSRF、Origin 与 CORS；
- 401/403/网络错误不同 UI；
- 多 tab 登出、bfcache、账号切换和缓存清理；
- redirect allowlist、open redirect 与 mix-up；
- SSR/hydration 和旧 session。

OAuth/OIDC 使用真实兼容身份提供商的预发布契约测试，mock 不能验证 issuer metadata、签名和浏览器 cookie 行为。

## 二十三、可观测性与审计

记录不含秘密的 correlation：loginAttemptId、session 内部 ID、client、issuer、结果 code、刷新原因、权限决策 policy version。禁止记录密码、authorization code、access/refresh token、cookie、verifier、完整 state 和敏感 claims。

指标包括登录成功/取消/失败、callback 校验失败、refresh 成功与重用检测、401/403、会话年龄、MFA、登出、开放重定向拦截和权限拒绝。异常 state/nonce、同一 token 多地使用和刷新重放进入安全告警。

## 二十四、常见失败模式

1. JWT 放 localStorage 就算完成认证；2. ID Token 调业务 API；3. 使用 Implicit/密码模式；4. PKCE verifier 固定或复用；5. redirect URI/return URL 支持任意外域；6. HttpOnly 等于防 XSS；7. SameSite 等于完整 CSRF；8. 每个 401 独立刷新；9. 403 循环跳登录；10. 前端隐藏按钮等于授权；11. 跨 tab 广播 token；12. 登出不清缓存；13. JWT decode 等于验证；14. CORS 等于鉴权。

## 二十五、渐进落地路线

先建立服务端 session view、unknown 状态机、同源 Cookie/BFF 与 CSRF；再接入标准 Authorization Code + PKCE/OIDC、严格事务和回跳；随后加入刷新 single-flight、多标签、权限模型、SSR 和缓存隔离；最后完善 MFA、token rotation/replay detection、审计、灰度和事故演练。

## 二十六、上线检查清单

- [ ] 认证、会话、OAuth/OIDC 和业务授权职责分离；
- [ ] 已根据威胁模型选择 Cookie Session、SPA token 或 BFF；
- [ ] Cookie 使用 Secure、HttpOnly、明确 SameSite/Path/Domain 和合理期限；
- [ ] Cookie 状态变更接口有完整 CSRF 防护；
- [ ] 使用 Authorization Code + PKCE，未使用 Implicit/密码模式；
- [ ] redirect URI 精确注册，return path 只允许安全同源路径；
- [ ] state、nonce、verifier 每事务生成、绑定、限时且一次消费；
- [ ] issuer、audience、签名、时间和 nonce 在可信组件验证；
- [ ] token 不进入 URL、日志、分析、BroadcastChannel 和错误页面；
- [ ] 启动阶段为 unknown，不出现认证内容闪烁；
- [ ] 401 single-flight 刷新，最多重放一次且请求可安全重建；
- [ ] 403 与 401 分离，服务端对每资源/动作最终授权；
- [ ] 登出、账号/租户切换清除所有敏感缓存与连接；
- [ ] 跨标签、bfcache、离线和权限变化均重新对账；
- [ ] CORS、cookie、CSRF、CSP 和依赖治理联合验证；
- [ ] 高风险操作有 recent auth/MFA 与审计；
- [ ] 预发布真实 IdP、浏览器和多版本流程完成 E2E。

## 总结

可靠认证前端不保存“登录成功”这个布尔值，而是维护一个由服务端事实驱动的会话状态机。Authorization Code + PKCE 保护重定向式授权，OIDC 验证认证事件，Cookie/BFF 减少 token 暴露，CSRF/XSS 防护保护浏览器边界，single-flight 和跨标签协议保证生命周期一致。前端权限只改善体验，服务端授权才保护资源。

## 参考资料

- [RFC 9700：OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700)
- [RFC 7636：Proof Key for Code Exchange](https://www.rfc-editor.org/rfc/rfc7636)
- [RFC 6749：OAuth 2.0 Authorization Framework](https://www.rfc-editor.org/rfc/rfc6749)
- [RFC 6750：Bearer Token Usage](https://www.rfc-editor.org/rfc/rfc6750)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
- [MDN：Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)
- [MDN：Secure cookie configuration](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Cookies)
- [MDN：CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)
- [OWASP：Cross-Site Request Forgery Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
