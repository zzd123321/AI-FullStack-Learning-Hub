---
title: Spring Boot 生产运行：打包、外部配置、健康检查、代理与优雅停机
description: 理解一个可执行 JAR 从构建、配置和启动，到接收流量、健康探测与收到 SIGTERM 后安全停止的完整生命周期
outline: deep
---

# Spring Boot 生产运行：打包、外部配置、健康检查、代理与优雅停机

> 版本基线：Spring Boot 4.1.0、Spring Framework 7.0.8、Maven 3.9.16；Java 17 编译目标，JDK 25 运行。本文讲部署合同，不修改本站的实际部署配置。

## 1. 为什么本机启动只是第一步

在 IDE 里点击运行后看到 `Started Application`，只证明应用在当前机器、当前配置和当前启动方式下创建成功。生产平台还要回答：

- 构建出的文件是不是测试过的同一个文件；
- 运行机器从哪里取得 JRE 和配置；
- 密码等秘密是否进入 Git、JAR 或日志；
- 平台什么时候可以把真实请求交给新实例；
- 应用还活着但暂时不能接请求时怎样表达；
- 反向代理怎样告诉应用原始 HTTPS 地址和客户端信息；
- 发布新版本时，旧实例怎样完成正在处理的请求；
- 进程卡住不退出时，平台等多久才强制终止；
- 多个实例是否错误地共享本地内存或文件状态。

生产运行不是“换一条启动命令”，而是一份应用与运行平台共同遵守的合同。

## 2. 先看完整生命周期

```mermaid
flowchart LR
    A["源码和 pom.xml"] --> B["mvn clean package"]
    B --> C["经过测试的可执行 JAR"]
    C --> D["平台注入配置并启动 JVM"]
    D --> E["Spring 创建 ApplicationContext"]
    E --> F["Readiness 接受流量"]
    F --> G["处理请求与后台工作"]
    G --> H["收到 SIGTERM"]
    H --> I["Readiness 拒绝新流量"]
    I --> J["完成在途请求并停止组件"]
    J --> K["JVM 退出"]
```

任何一步失败，都应有明确结果：构建失败、启动失败、保持未就绪、退出非零状态或触发回滚，而不是带着半有效配置继续运行。

## 3. 本课目标

完成本课后，你应该能解释：

- 普通 JAR 与 Spring Boot 可执行 JAR 的关系；
- 为什么应构建一次、在不同环境运行同一制品；
- classpath 默认配置、环境变量、命令行参数和外部文件怎样覆盖；
- 配置、秘密与代码的边界；
- process、JVM、container、instance、pod 与 service 的区别；
- liveness、readiness 和 startup probe 分别回答什么；
- 为什么存活探针不应依赖共享数据库等外部系统；
- 反向代理、Forwarded Header 和应用之间的信任边界；
- SIGTERM、优雅停机超时和强制终止如何协作；
- `SmartLifecycle` 组件怎样参与启动与关闭；
- 发布、回滚和多实例运行需要哪些工程约束。

## 4. 完整示例结构

```text
spring-boot-production-runtime/
├── pom.xml
└── src/
    ├── main/
    │   ├── java/learning/backend/runtime/
    │   │   ├── ProductionRuntimeApplication.java
    │   │   ├── config/RuntimeProperties.java
    │   │   ├── lifecycle/ManagedWorker.java
    │   │   └── web/RuntimeController.java
    │   └── resources/application.yaml
    └── test/java/learning/backend/runtime/
        └── ProductionRuntimeApplicationTest.java
```

示例不连接数据库，也不创建真实部署清单，专门观察制品、配置、可用性状态和生命周期。

## 5. `mvn package` 产生什么

Spring Boot Maven Plugin 的 `repackage` goal 会把普通应用 JAR 重新组织为可执行归档：

```text
spring-boot-production-runtime-1.0.0-SNAPSHOT.jar
├── META-INF/MANIFEST.MF
├── org/springframework/boot/loader/...   Spring Boot launcher
└── BOOT-INF/
    ├── classes/                         应用 class 与资源
    └── lib/                             运行依赖 JAR
```

操作系统不是直接执行 Java bytecode。命令：

```bash
java -jar target/spring-boot-production-runtime-1.0.0-SNAPSHOT.jar
```

先启动 `java` 进程，JAR manifest 指向 Boot launcher，launcher 再建立 classpath 并调用应用入口。

完整 POM：

<<< ../../../examples/java/spring-boot-production-runtime/pom.xml{xml:line-numbers} [pom.xml]

## 6. 构建一次，提升同一制品

更可靠的发布流程是：

```text
同一 commit 构建一次
  → 自动测试
  → 记录制品版本与摘要
  → 同一份不可变制品进入测试环境
  → 再提升到生产环境
```

不要在每个环境重新编译。重新构建可能解析到不同依赖、使用不同 JDK、包含不同时间或资源，使“测试通过的东西”与“生产运行的东西”不再相同。

环境差异应该通过外部配置表达，而不是重新修改源码和构建 JAR。

## 7. JDK 运行版本与编译目标是两件事

POM 中：

```xml
<java.version>17</java.version>
```

表示项目生成面向 Java 17 的 class 文件和 API 基线，不表示 Maven 进程一定由 JDK 17 启动。验证时同时检查：

```bash
java -version
mvn -version
```

生产镜像或主机必须提供兼容的 JRE/JDK。不要让 CI 使用 JDK 25、生产却偶然运行在更旧环境，也不要只看本地终端中的 `java` 而忽略容器内实际版本。

## 8. 配置为什么必须在 JAR 之外可覆盖

同一应用在不同环境会有不同端口、公开地址、下游地址、容量和凭证。若全部写死在源码：

- 每个环境都要重新构建；
- 密码容易进入版本库与制品；
- 修改配置变成修改代码；
- 无法确认两个环境差异究竟来自代码还是配置。

Spring Boot 把多个 property source 合并成 `Environment`。简化理解是：JAR 内默认值提供可运行基线，外部来源按规定优先级覆盖。

本课配置：

<<< ../../../examples/java/spring-boot-production-runtime/src/main/resources/application.yaml{yaml:line-numbers} [application.yaml]

例如：

```bash
APP_INSTANCE_NAME=prod-a \
APP_PUBLIC_BASE_URL=https://api.example.com \
java -jar app.jar
```

`${APP_INSTANCE_NAME:local-development}` 表示优先使用环境变量，没有时使用冒号后的默认值。

## 9. 配置不是秘密，秘密也不只是环境变量

配置包括公开 URL、超时、线程数和功能开关；秘密包括密码、API key、私钥和 token。秘密需要额外保证：

- 不进入源码、Git 历史和 JAR；
- 不打印到启动日志、异常消息和诊断 API；
- 只授予需要它的进程；
- 支持轮换和审计；
- 进程退出后不留下不必要副本。

环境变量比硬编码好，但并非自动安全：某些平台、进程查看工具、崩溃报告或错误脚本可能暴露环境。生产应使用平台 Secret、挂载文件、config tree 或专用秘密管理系统，并理解访问权限。

Spring Boot 不会自动替你加密配置值。把密文写进 YAML 但把解密密钥放在同一个 JAR，也没有形成有效安全边界。

## 10. 类型安全配置把启动错误提前

示例用 `@ConfigurationProperties` 把外部字符串绑定为明确类型：

<<< ../../../examples/java/spring-boot-production-runtime/src/main/java/learning/backend/runtime/config/RuntimeProperties.java{java:line-numbers} [RuntimeProperties.java]

因果链：

```text
Environment 中找到 app.runtime.*
  → Binder 转换 String 到 String/URI
  → 创建 RuntimeProperties
  → 构造规则校验
  → 失败则 ApplicationContext 启动失败
```

对于必须正确才能运行的配置，启动失败通常比带着错误地址接收真实流量更安全。

不要给秘密设置看似方便的生产默认密码。开发可用默认值只适合不敏感且不会制造危险行为的设置。

## 11. Process、JVM、Container 和 Service

这些概念经常被混用：

| 概念 | 本课边界 |
| --- | --- |
| Process | 操作系统运行的 `java` 进程，有 PID 和退出状态 |
| JVM | 进程中执行 bytecode、管理堆和线程的运行时 |
| ApplicationContext | Spring 管理 Bean 和生命周期的容器，不是 OS container |
| Container | 对进程提供文件系统、网络和资源隔离的运行单元 |
| Instance/Pod | 应用的一次运行副本；具体含义由平台决定 |
| Service | 给一组可替换实例提供稳定访问入口的逻辑能力 |

一个 container 通常运行一个主 Java process，但这不是 Java 语言规则。一个 service 也通常对应多个 instance，不能把单实例内存当成全局事实。

## 12. 健康检查不是一个布尔值

至少要区分：

### Liveness：这个进程是否已经无法自行继续

若存活状态损坏，平台可能重启实例。它不应依赖数据库、Redis 或外部 API：共享依赖失败时，如果所有实例都因此被判死并反复重启，故障会被放大。

### Readiness：这个实例现在是否应该接收新流量

启动未完成、正在关闭或关键本地准备未完成时，应拒绝新流量。暂时未就绪不等于进程必须被杀死。

### Startup probe：是否仍处于允许的慢启动窗口

启动本来较慢时，startup probe 给应用更长初始化机会，避免 liveness 过早重启它。具体 probe 调度属于运行平台配置，不由 Controller 自己循环请求。

## 13. 为什么健康端点使用 Actuator

Actuator 把 Spring Boot 的可用性状态暴露为健康组。本课启用：

```text
/actuator/health/liveness
/actuator/health/readiness
/livez
/readyz
```

`add-additional-paths: true` 让 `/livez` 和 `/readyz` 经过主应用端口。如果管理端点位于完全独立的端口与 Web 基础设施上，管理端口健康不一定证明主端口仍能接请求。

不要暴露全部 Actuator 端点。`env`、`configprops`、heap dump 等端点可能包含敏感或高成本信息，需要网络隔离、认证授权与审计。

## 14. 自定义健康检查必须考虑故障放大

把数据库加入 readiness 可能合理，但必须回答：

- 检查超时是多少；
- 每个实例多频繁执行；
- 依赖变慢时健康检查是否反过来增加压力；
- 短暂失败是否立刻摘除全部实例；
- 共享依赖故障时，应用是否仍能提供降级能力。

健康检查本身也是流量。它必须快速、有界、低成本，不能执行全表查询或调用一串下游服务。

## 15. 应用状态怎样被读取

示例只返回允许公开的运行信息：

<<< ../../../examples/java/spring-boot-production-runtime/src/main/java/learning/backend/runtime/web/RuntimeController.java{java:line-numbers} [RuntimeController.java]

`ApplicationAvailability` 是应用内部观察 liveness/readiness 的入口。Controller 返回它是为了教学；真实业务不必再创造一套与 Actuator 重复的健康协议。

实例名用于日志和排查，不应用来保存业务身份。实例随发布、扩缩容和故障替换而变化。

## 16. 反向代理站在浏览器与应用之间

生产请求常经过 CDN、负载均衡器、Ingress 或反向代理：

```text
浏览器 HTTPS api.example.com
  → 可信代理终止 TLS
  → 内网 HTTP application:8080
  → Spring Boot
```

应用直接看到的 scheme、host、port 和 client address 可能属于最后一跳代理，而不是浏览器原始请求。代理可通过标准 `Forwarded` 或 `X-Forwarded-*` 传递原始信息。

## 17. Forwarded Header 是信任边界

应用不能无条件信任任意客户端发送的 `X-Forwarded-For`。否则攻击者可以伪造客户端地址、scheme 或 host，影响：

- 审计与限流；
- HTTPS 重定向；
- 绝对 URL；
- 安全判断；
- OAuth redirect URI。

正确做法是：只有请求确定经过受信代理，并且代理会删除外部伪造头、重新写入可信值时，应用或服务器才处理 forwarded headers。具体模式必须与平台拓扑一起配置，不能从网上复制一个 `server.forward-headers-strategy` 值就认为安全。

## 18. 容器不是更轻的虚拟机教程

对 Spring Boot 应用，container image 至少包含：

- 可运行 JRE；
- 应用 JAR 或拆分后的层；
- 明确入口命令；
- 非 root 运行用户；
- 必需的证书、时区或本地资源；
- 可审计的基础镜像与补丁版本。

Spring Boot 支持 Dockerfile 和 Cloud Native Buildpacks，也能在 JAR 中生成 layer index，让变化较少的依赖层与变化频繁的应用层分开，提高缓存利用率。

本课不提供一份“万能 Dockerfile”，因为基础镜像、用户、证书、架构、镜像签名、SBOM、漏洞策略和平台约束必须由实际运行环境决定。复制一个能启动的 Dockerfile 不等于生产安全。

## 19. Container 内的状态默认应可丢弃

实例可能随时被替换。不要把以下内容只保存在实例本地：

- 用户上传的唯一副本；
- 必须跨实例共享的 session；
- 消息处理唯一进度；
- 定时任务唯一锁；
- 业务事实的唯一记录。

本地文件可以用于临时缓存或受控工作目录，但必须允许实例消失，并设置容量与清理策略。多实例请求可能落到任意副本，本地 `HashMap` 也不是分布式缓存。

## 20. 资源限制会改变 JVM 运行环境

Container 的 CPU 与 memory limit 不是建议值。超过内存限制，平台可能直接杀死进程，JVM 没有机会优雅关闭或生成完整诊断。

内存预算不能只写 `-Xmx`：

```text
container memory
  = Java heap
  + Metaspace
  + thread stacks
  + code cache
  + direct/native buffers
  + JVM/native library overhead
```

CPU 限额也会影响 GC、ForkJoinPool、Web 并发和启动时间。容量参数必须在接近生产限制的环境压测，并保留非堆余量。

## 21. SIGTERM 是关闭请求，不是“立刻消失”

滚动发布或缩容时，平台通常向主进程发送 SIGTERM。JVM 开始关闭，Spring 关闭 ApplicationContext，Web Server 和生命周期 Bean 参与停止。

Spring Boot 4 对支持的嵌入式服务器默认启用 graceful shutdown。关闭阶段：

```text
收到 SIGTERM
  → Readiness 转为 REFUSING_TRAFFIC
  → Web Server 不再接受新请求
  → 已进入的请求在宽限时间内完成
  → SmartLifecycle 按 phase 停止
  → Context 关闭，JVM 退出
```

不同 Web Server 拒绝新请求的网络细节可能不同，持久连接也会影响观察结果。不要把优雅停机理解为一个固定 HTTP 状态码。

## 22. 超时必须从外向内递减

示例配置 Spring 关闭阶段最多 20 秒：

```yaml
spring:
  lifecycle:
    timeout-per-shutdown-phase: 20s
```

平台从 SIGTERM 到 SIGKILL 的总宽限时间必须大于应用内部等待时间，还要留出代理摘流量和 JVM 退出余量。否则 Spring 仍在等待请求，平台已经强制杀死进程。

反过来，无限等待也不可取。一个永不返回的下游调用不应阻塞发布。请求、HTTP client、数据库语句、消息处理和关闭阶段都要有相互一致的 deadline。

## 23. 后台组件也必须加入生命周期

Web Server 停止接请求，并不会自动知道自建线程、消费者或 scheduler 如何清理。示例使用 `SmartLifecycle`：

<<< ../../../examples/java/spring-boot-production-runtime/src/main/java/learning/backend/runtime/lifecycle/ManagedWorker.java{java:line-numbers} [ManagedWorker.java]

真实消息消费者通常应：

1. 停止拉取新消息；
2. 等待正在处理的消息完成；
3. 成功后确认，失败则让 broker 按协议重投；
4. 关闭 client 与 executor；
5. 在宽限时间耗尽前退出。

`phase` 越大，组件启动越晚、停止越早。接受工作的入口通常应先停，底层连接和监控资源稍后停。

## 24. Ctrl+C、IDE Stop 与 SIGTERM 不一定相同

终端 Ctrl+C 通常发送 SIGINT；平台滚动发布通常发送 SIGTERM；某些 IDE 的强制停止可能直接结束进程，来不及执行完整关闭流程。

因此不能只用 IDE 红色停止按钮证明优雅停机。验证应启动真实可执行 JAR，发送平台会使用的信号，并观察：

- readiness 是否停止接流量；
- 在途请求是否完成；
- 后台任务是否停止领取；
- 是否在宽限时间内退出；
- 退出码与日志是否符合预期。

## 25. 启动任务也需要有界

`ApplicationRunner`、迁移、缓存预热和模型加载发生在接流量之前或附近。如果它们：

- 没有超时；
- 无限重试下游；
- 失败后只记录日志继续启动；
- 持有锁却不释放；

应用可能永远不 ready，或者更危险地在未准备好时接流量。

必要依赖准备失败应使启动失败；可选能力可以降级，但必须在状态与监控中明确表达。

## 26. 数据库迁移属于发布流程边界

数据库由独立专题讲解，这里只说明发布约束：多个新实例同时启动时，不应无计划地并发执行不兼容迁移。schema 变更应支持滚动期间新旧版本短暂共存，常见策略是 expand/migrate/contract：

```text
先增加兼容结构
  → 发布同时兼容新旧结构的代码
  → 迁移数据和调用方
  → 确认旧版本退出
  → 最后删除旧结构
```

“应用能启动”不能证明迁移在生产数据规模和锁行为下安全。

## 27. 滚动发布不是零风险同义词

滚动发布期间同时存在新旧实例。必须考虑：

- API 与消息格式是否前后兼容；
- 新版本写出的数据旧版本能否读取；
- session 是否依赖本机；
- 后台任务是否被多实例重复执行；
- readiness 是否真的在准备完成后才接受流量；
- 旧实例是否在终止前停止领取新工作。

若新版本健康但业务错误，平台的健康检查不会自动识别。还需要错误率、延迟、关键业务指标和人工/自动发布判断。

## 28. 回滚需要在发布前设计

“出问题就回滚”只有在以下条件成立时才可执行：

- 旧制品仍可获得且摘要明确；
- 配置仍与旧版本兼容；
- 数据格式和 schema 没有不可逆变化；
- 消息没有被新版本写成旧版本无法处理的格式；
- 回滚步骤与负责人已明确。

代码回滚不能自动回滚外部副作用和数据。数据库破坏性变更、一次性任务和消息协议尤其需要前向修复方案。

## 29. 生产日志写到哪里

容器化应用通常把结构化日志写向 stdout/stderr，由平台采集。应用不应假设本地日志文件永久存在，也不应让无限增长的文件填满容器磁盘。

日志至少关联：

- timestamp 与 timezone；
- service/version/instance；
- request/trace ID；
- level、event 与错误 cause；
- 安全处理后的业务上下文。

绝不记录密码、Authorization header、完整 token 或未脱敏个人信息。

## 30. 运行示例

构建并运行测试：

```bash
cd examples/java/spring-boot-production-runtime
mvn clean package
```

预期：

```text
Tests run: 2, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

启动可执行 JAR：

```bash
APP_INSTANCE_NAME=local-a \
APP_PUBLIC_BASE_URL=http://localhost:8080 \
java -jar target/spring-boot-production-runtime-1.0.0-SNAPSHOT.jar
```

另一个终端查看：

```bash
curl http://localhost:8080/livez
curl http://localhost:8080/readyz
curl http://localhost:8080/api/runtime
```

示例响应：

```json
{
  "application": "production-runtime",
  "instance": "local-a",
  "publicBaseUrl": "http://localhost:8080",
  "liveness": "CORRECT",
  "readiness": "ACCEPTING_TRAFFIC",
  "workerRunning": true
}
```

本例已使用 JDK 25.0.3、Maven 3.9.16 完成测试、可执行 JAR 打包、真实端口健康检查和 SIGTERM 退出验证。

## 31. 常见失败与排查顺序

### JAR 启动时报 `UnsupportedClassVersionError`

运行 JRE 低于 class 文件目标版本。比较构建 `--release`、CI JDK 与生产 `java -version`。

### 配置看起来没有生效

确认属性名、环境变量 relaxed binding、profile、外部文件位置和 property source 优先级。不要打印秘密值排查。

### 健康端点 UP，但业务请求失败

健康端点覆盖不足，或管理端口与主端口故障域不同。检查主 Web Server、依赖和真实业务指标。

### 发布时出现 502/连接重置

检查代理摘流量时序、readiness、连接保持、平台 termination grace period 与应用 graceful timeout。

### 进程收到信号后一直不退出

采集线程转储，检查非 daemon 自建线程、阻塞调用、未关闭 executor、`SmartLifecycle` callback 和 shutdown hook。

### Container 被 OOMKilled，却没有 Java OOM 日志

可能是平台在进程越过 container memory limit 后直接终止。比较 heap、RSS、direct memory、线程栈和限制，而不是只调大 `-Xmx`。

## 32. 生产运行检查清单

- 制品由受控 CI 构建一次并记录版本/摘要。
- JDK vendor、版本、CPU 架构和启动参数明确。
- 配置外部化，秘密不进入 Git、JAR、日志与诊断响应。
- 必需配置错误会阻止实例 ready。
- liveness 不依赖共享外部系统。
- readiness 与真实接流量能力一致。
- Actuator 暴露面经过网络和权限控制。
- 代理会清理并重写 forwarded headers，应用只信任可信路径。
- 请求和下游调用都有 deadline。
- SIGTERM、应用宽限时间和平台 SIGKILL 时间相互匹配。
- 自建线程、消费者和 executor 参与 Spring 生命周期。
- 本地状态允许实例被替换。
- JVM 内存预算包含非堆与 native 开销。
- 发布支持新旧版本短暂共存，并有可执行回滚/前向修复方案。

## 33. 本课完成标志

你不需要背所有属性名，但应能从一次发布过程解释：

1. 哪个不可变制品正在运行；
2. 配置和秘密从哪里进入；
3. 平台根据什么开始和停止发送流量；
4. 应用收到 SIGTERM 后按什么顺序关闭；
5. 为什么健康、优雅停机和回滚都需要平台与应用共同配合。

## 34. 与后续综合项目的衔接

Spring Boot 基础专题至此形成完整闭环：开发对象与 HTTP API、访问数据、处理安全与异步、自动化测试，最后把同一制品安全地运行起来。

综合项目会把 Spring Boot 作为核心业务服务，把 FastAPI 作为 AI 推理服务。届时会实际使用本课的配置、健康、超时和关闭合同，而不是先拆成大量微服务。

## 35. 参考资料

- [Spring Boot 4.1 Packaging for Production](https://docs.spring.io/spring-boot/reference/using/packaging-for-production.html)
- [Spring Boot Executable JAR Format](https://docs.spring.io/spring-boot/specification/executable-jar/index.html)
- [Spring Boot Externalized Configuration](https://docs.spring.io/spring-boot/reference/features/external-config.html)
- [Spring Boot Actuator Endpoints and Probes](https://docs.spring.io/spring-boot/reference/actuator/endpoints.html)
- [Spring Boot Graceful Shutdown](https://docs.spring.io/spring-boot/reference/web/graceful-shutdown.html)
- [Spring Boot Container Images](https://docs.spring.io/spring-boot/reference/packaging/container-images/)
- [Spring Boot Efficient Container Images](https://docs.spring.io/spring-boot/reference/packaging/container-images/efficient-images.html)
- [Spring Boot Cloud Native Buildpacks](https://docs.spring.io/spring-boot/reference/packaging/container-images/cloud-native-buildpacks.html)
