---
title: Spring Boot Bean 生命周期、Java 配置、作用域、代理与循环依赖
description: 从 BeanDefinition 到关闭回调理解 Java @Bean、singleton/prototype/request scope、作用域代理、AOP 代理与不可解析的构造器循环依赖
outline: deep
---

# Spring Boot Bean 生命周期、Java 配置、作用域、代理与循环依赖

> 基准环境：Spring Boot 4.1.0、Spring Framework 7.0.8、Maven 3.9.16；JDK 25 运行，Java 17 编译目标。

## 1. 学习目标

完成本节后，你应该能够：

- 区分 BeanDefinition、Bean 实例、ApplicationContext 与 BeanFactory。
- 按顺序说明 singleton Bean 从定义到销毁的主要阶段。
- 正确选择构造器、`@PostConstruct`、`@Bean(initMethod)`、`SmartInitializingSingleton`、`SmartLifecycle` 等回调。
- 使用 Java `@Configuration` 与 `@Bean` 定义第三方或需精确控制的对象。
- 理解 `proxyBeanMethods = false` 的含义与边界。
- 区分 singleton、prototype、request、session、application 和 websocket scope。
- 知道 prototype 的销毁回调默认不由容器执行。
- 理解为什么把 request scope 直接注入 singleton 需要 scoped proxy 或 provider。
- 区分 scoped proxy 与 AOP proxy 的目的。
- 识别 JDK 动态代理、CGLIB 类代理及 final/self-invocation 限制。
- 解释构造器循环依赖为什么无法解析，且为何不应以 `@Lazy` 作为默认修复。
- 用实际 HTTP 输出观察 scope，用启动/关闭日志观察生命周期。

## 2. 本课示例

示例不是抽象图，而是一个可启动 Web 应用：

```text
spring-boot-bean-lifecycle/
├── pom.xml
└── src/main/
    ├── java/learning/backend/beans/
    │   ├── BeanLifecycleApplication.java
    │   ├── config/LifecycleConfiguration.java
    │   ├── lifecycle/
    │   ├── scope/
    │   ├── web/BeanObservationController.java
    │   └── cycle/BrokenCycleConfiguration.java
    └── resources/application.yaml
```

它提供四个端点：

| 端点 | 观察内容 |
| --- | --- |
| `GET /api/beans/lifecycle` | 构造、初始化、全部 singleton 就绪事件 |
| `GET /api/beans/singleton` | 同一 singleton 两次引用相同 ID |
| `GET /api/beans/prototype` | provider 每次获取新 prototype ID |
| `GET /api/beans/request` | 同一请求共享 target，不同请求获得不同 request target |

`broken-cycle` profile 专门演示构造器循环依赖失败，默认 profile 不会激活它。

## 3. Bean 不是“任意被注解的对象”

Bean 是由 Spring 容器创建、配置、装配和管理生命周期的对象。它可以来自：

- `@Component`、`@Service`、`@Repository`、`@Controller` 扫描。
- `@Bean` 工厂方法。
- 自动配置。
- XML（遗留/特定场景）。
- 编程式注册。

而 `new Course(...)`、DTO、record、集合和临时结果通常只是普通 Java 对象。把每个值对象注册成 Bean 会扩大全局状态和启动图，反而失去边界。

## 4. BeanDefinition 与 Bean 实例

容器先持有“如何创建对象”的描述，再按需或预实例化创建对象：

```text
BeanDefinition
  名称、类型、scope、依赖、factory method、init/destroy 元数据
                         │
                         ▼
                 Bean instance
  真正的 Java 对象、依赖已注入、生命周期回调已执行
```

`BeanDefinition` 不是对象本身。你在条件配置、profile、scope、`@Bean` 参数中主要影响定义；运行时注入到 Controller 的是实例或代理。

## 5. BeanFactory 与 ApplicationContext

`BeanFactory` 是访问 Spring Bean 容器的基础接口；`ApplicationContext` 建立在它之上，并增加：

- 环境和 PropertySource。
- 资源加载。
- 事件发布。
- 国际化。
- `BeanPostProcessor` 自动注册。
- 生命周期处理。

Boot Web 应用创建的是 web-aware ApplicationContext。一般业务代码不应把整个 Context 当 service locator 注入；应通过构造器声明真正依赖。

## 6. singleton 的默认意义

Spring 默认 scope 是 singleton：同一个 ApplicationContext 内、按 BeanDefinition 一个共享实例。

它不等同于 GoF Singleton：

- 不是 JVM 全局唯一。
- 不同 ApplicationContext 可有不同实例。
- 实例由容器创建，不需要 private constructor。
- 测试可创建隔离 Context。

Web Controller、Service、Repository 通常是 singleton，因此不能把每次请求的数据保存为普通可变字段。

## 7. singleton 创建主流程

简化但实用的顺序：

```text
读取 BeanDefinition
  → 实例化（构造器 / factory method）
  → 解析并注入依赖
  → Aware 回调
  → BeanPostProcessor before-initialization
  → @PostConstruct
  → InitializingBean.afterPropertiesSet（若实现）
  → @Bean initMethod（若配置）
  → BeanPostProcessor after-initialization
  → 可能包装为 AOP/scoped proxy
  → 发布为可注入的完成实例
```

不是每个 Bean 都经历所有步骤。这个顺序解释了两个重要事实：初始化方法中不应依赖 AOP advice 已经生效，也不应执行耗时远程任务。

## 8. 销毁主流程

ApplicationContext 正常关闭时大致：

```text
SmartLifecycle stop（按 phase）
  → @PreDestroy
  → DisposableBean.destroy（若实现）
  → @Bean destroyMethod
```

不同机制使用不同方法名时，Spring Framework 文档给出的销毁顺序正是上述顺序。关闭也可能发生在启动失败途中，因此清理代码应能接受“尚未完整 start”的状态。

## 9. `@PostConstruct` 与 `@PreDestroy`

<<< ../../../examples/java/spring-boot-bean-lifecycle/src/main/java/learning/backend/beans/lifecycle/AnnotationLifecycleBean.java{java:line-numbers} [AnnotationLifecycleBean.java]

它们来自 Jakarta Annotations，不把业务类绑到 Spring 接口。适合：

- 在 `@PostConstruct` 检查依赖和配置。
- 创建轻量本地缓存或数据结构。
- 在 `@PreDestroy` 关闭自己拥有的本地资源。

不适合：

- 网络请求、长时间数据库初始化或阻塞等待。
- 假设所有其他 Bean 都已完成初始化。
- 从构造器/`@PostConstruct` 调用需要自身代理的事务、缓存或异步方法。

官方特别提示：`@PostConstruct` 在 singleton 创建锁内执行。需要“所有 singleton 都就绪后”的工作，应使用下一节的回调或 Context 事件。

## 10. 所有 singleton 就绪后

<<< ../../../examples/java/spring-boot-bean-lifecycle/src/main/java/learning/backend/beans/lifecycle/AllSingletonsReady.java{java:line-numbers} [AllSingletonsReady.java]

`SmartInitializingSingleton.afterSingletonsInstantiated()` 在所有非 lazy singleton 初始化后执行。本课将该时刻写入事件日志。

适用场景：建立依赖于完整 Bean 图的本地索引、轻量交叉校验。

更复杂的后台启动使用：

- `@EventListener(ContextRefreshedEvent.class)`。
- `ApplicationRunner` / `CommandLineRunner`（Boot 应用启动后）。
- `SmartLifecycle`（需要可控 start/stop/phase）。

它们不是可互换的装饰品；按“是否需要所有 singleton、是否需要异步/停止协调、是否是应用启动任务”选择。

## 11. Java `@Bean` 配置

<<< ../../../examples/java/spring-boot-bean-lifecycle/src/main/java/learning/backend/beans/config/LifecycleConfiguration.java{java:line-numbers} [LifecycleConfiguration.java]

`@Bean` 方法返回值成为容器管理 Bean。方法参数会按类型从容器解析：

```java
ManagedResource managedResource(LifecycleEventLog eventLog)
```

这比在 `@Configuration` 内手写 `new LifecycleEventLog()` 正确，因为后者绕过容器并创造第二个实例。

典型使用场景：

- 第三方库类型不能添加组件注解。
- 同一类要用不同参数创建多个实例。
- 需要精确声明 init/destroy 方法。
- 将条件、profile、配置属性映射到构造过程。

## 12. `initMethod` 与 `destroyMethod`

<<< ../../../examples/java/spring-boot-bean-lifecycle/src/main/java/learning/backend/beans/lifecycle/ManagedResource.java{java:line-numbers} [ManagedResource.java]

```java
@Bean(initMethod = "open", destroyMethod = "close")
```

目标类型不需要知道 Spring。它只提供普通 `open()`、`close()` 方法，配置层决定其生命周期语义。

本课日志顺序会出现：

```text
managed resource: constructor
managed resource: initMethod open
```

关闭时出现：

```text
managed resource: destroyMethod close
```

`@Bean` 默认还会尝试识别 `AutoCloseable`/`Closeable` 的 close 方法。对于不应关闭或方法名歧义的类型，明确声明 `destroyMethod = ""` 或精确方法名。

## 13. `@Configuration(proxyBeanMethods = false)`

本课使用：

```java
@Configuration(proxyBeanMethods = false)
```

含义：配置类不为了拦截同类 `@Bean` 方法调用而做 CGLIB 增强，启动更轻量。它适合每个 `@Bean` 方法只通过容器调用、彼此不直接调用的配置。

例如错误思维：

```java
@Bean
Client client() { return new Client(connection()); }

@Bean
Connection connection() { return new Connection(); }
```

若 `proxyBeanMethods = false`，这里是普通 Java 直接调用，可能创建额外 Connection。正确方式是把依赖写成参数：

```java
@Bean
Client client(Connection connection) { return new Client(connection); }
```

这与构造器注入一致：让容器显式解析依赖图。

## 14. 生命周期事件日志

<<< ../../../examples/java/spring-boot-bean-lifecycle/src/main/java/learning/backend/beans/lifecycle/LifecycleEventLog.java{java:line-numbers} [LifecycleEventLog.java]

日志用 `CopyOnWriteArrayList` 保存事件快照，并通过 SLF4J 输出。它是 singleton，可能被 HTTP 请求和关闭 hook 并发访问，不能使用未同步的 `ArrayList`。

示例不是建议把所有生产生命周期事件保存在内存；生产应使用结构化日志、指标、trace 和受控管理端点。它只为让学习过程可见。

## 15. scope 决定“何时给谁一个实例”

scope 不是线程安全设置，也不是包可见性。它定义某个 BeanDefinition 的对象实例与上下文的关系。

| scope | 一般含义 | Web 应用中常见用途 |
| --- | --- | --- |
| singleton | 每个 ApplicationContext 一个 | service、controller、client、repository |
| prototype | 每次容器请求创建一个 | 短生命周期可变对象、特殊工厂产物 |
| request | 每个 HTTP 请求一个 | request trace、请求上下文 |
| session | 每个 HTTP session 一个 | 少量会话状态，慎用 |
| application | 每个 ServletContext 一个 | 多个 web context 共享 web 属性 |
| websocket | 每个 WebSocket session 一个 | WebSocket 会话状态 |

request/session/application/websocket 只有 web-aware Context 才有意义。

## 16. singleton 示例

<<< ../../../examples/java/spring-boot-bean-lifecycle/src/main/java/learning/backend/beans/scope/SingletonMarker.java{java:line-numbers} [SingletonMarker.java]

```bash
curl http://127.0.0.1:18081/api/beans/singleton
```

示例响应中 `firstLookup` 和 `secondLookup` 完全相同。跨多个请求也相同，直到 ApplicationContext 重建。

这只说明实例身份相同，不代表可变字段自动安全。若 singleton 保存计数、缓存或临时状态，应使用不可变设计、并发容器、锁或移到合适 scope。

## 17. prototype 示例

<<< ../../../examples/java/spring-boot-bean-lifecycle/src/main/java/learning/backend/beans/scope/PrototypeToken.java{java:line-numbers} [PrototypeToken.java]

`@Scope("prototype")` 意味着每一次 `getBean`/provider lookup 都创建一个新对象：

```bash
curl http://127.0.0.1:18081/api/beans/prototype
```

响应的两个 UUID 不同。

重要边界：容器完成 prototype 的实例化、依赖注入和初始化回调后，默认不跟踪它的完整销毁生命周期。`@PreDestroy` / destroy method 不会在 Context 关闭时自动为每个 prototype 调用；创建者必须负责释放它拥有的资源。

因此不要把“想要新对象”直接等同于 prototype。若对象只是请求内数据，普通局部变量通常更简单。

## 18. 为什么 singleton 注入 prototype 不是每次变新

若 singleton 在构造时直接注入 `PrototypeToken`：

```java
public Service(PrototypeToken token) { ... }
```

注入发生在 singleton 创建时，只得到一次 prototype 实例，随后字段一直引用它。

本课改为：

```java
ObjectProvider<PrototypeToken> prototypeTokens
```

在真正需要时调用：

```java
prototypeTokens.getObject()
```

这才会每次向容器请求新对象。替代方案包括 `@Lookup` 方法注入；一般优先清晰的 `ObjectProvider` 或重审是否真的需要容器管理的 prototype。

## 19. request scope

<<< ../../../examples/java/spring-boot-bean-lifecycle/src/main/java/learning/backend/beans/scope/RequestTrace.java{java:line-numbers} [RequestTrace.java]

`@RequestScope` 使 target 与当前 HTTP request 绑定。一个请求内多次访问同一 target 会保持相同 ID；请求完成后该 scope 结束。

它适合 request ID、已认证主体的派生上下文、请求级缓存等。不应把大量业务状态放入 request scope，因为会让依赖关系隐蔽并增加内存压力。

## 20. request scope 为什么需要代理

Controller 是 singleton，在应用启动时创建；request target 直到请求到达才存在。若直接把具体 request 对象塞进 singleton 字段，会出现时间范围不匹配：

```text
singleton controller: 应用整个生命周期存在
request target:     仅一个 HTTP 请求存在
```

本课显式设置：

```java
@RequestScope(proxyMode = ScopedProxyMode.TARGET_CLASS)
```

注入给 Controller 的是一个可长期存在的代理。每次方法调用时，代理从当前 request scope 取真正的 `RequestTrace` target。

## 21. 观察 scoped proxy

<<< ../../../examples/java/spring-boot-bean-lifecycle/src/main/java/learning/backend/beans/web/BeanObservationController.java{java:line-numbers} [BeanObservationController.java]

连续两次请求：

```bash
curl http://127.0.0.1:18081/api/beans/request
curl http://127.0.0.1:18081/api/beans/request
```

每一条响应内：

```json
{"firstUse":1,"secondUse":2}
```

两条响应之间 `requestId` 不同。`injectedType` 通常含有 `$$SpringCGLIB$$`，说明 singleton 字段保存的是类代理，而不是 request target 本身。

## 22. proxy 的本质

代理是“站在调用者与目标对象之间的对象”。它可以在调用前后附加行为，或延迟选择真正 target：

```text
caller → proxy → target
           │
           ├─ transaction/cache/security/async（AOP）
           └─ 当前 request/session 的 target（scoped proxy）
```

本课 request proxy 解决的是 scope 生命周期错配。事务、缓存、安全、异步等常用的是 AOP proxy；两者都依赖代理机制，但触发条件和职责不同。

## 23. JDK 动态代理与 CGLIB

Spring AOP 可使用：

- JDK dynamic proxy：目标实现接口时，代理接口方法。
- CGLIB class proxy：生成目标类子类，目标无接口时常用。

类代理的限制：

- `final` class 不能被继承代理。
- `final` method 不能被重写增强。
- `private` method 不能被代理增强。
- 某些 Java Module System 场景需额外 `--add-opens`。

不要根据类名中的 `$$` 写业务判断。代理实现细节可能随配置和框架版本改变。

## 24. self-invocation 限制

代理只拦截“通过代理进入”的调用：

```java
public void outer() {
    this.inner(); // 直接 this 调用，绕过本对象代理
}
```

若 `inner()` 标了 `@Transactional`、`@Cacheable` 或 `@Async`，此自调用通常不会触发相应 advice。

常见正确重构：将 `inner` 用例移动到另一个协作 Bean，让调用跨越代理边界。不要把当前代理从 Context 查回自己作为日常模式，它隐藏依赖且使测试困难。

## 25. 生命周期方法与代理

初始化回调运行在原始 target 的创建过程中，目标尚未作为最终代理完全发布。因此不要期待 `@PostConstruct` 内对自身方法的调用能触发事务/缓存/异步 advice。

若需要在整个应用准备完毕后启动被代理的业务调用，应使用 runner、Context refresh event 或显式的应用服务入口。

## 26. `@Lazy` 与延迟创建

singleton 默认在 Context 创建时预实例化，尽早暴露配置、依赖和循环问题。

`@Lazy` 可让某 Bean 第一次请求时才创建：

```java
@Lazy
@Component
class ExpensiveClient { ... }
```

适合昂贵且不一定使用的可选组件；代价是失败从启动期延迟到第一次请求。不要为了“启动快”无差别加 `@Lazy`，那会把故障推给真实用户请求。

## 27. `@DependsOn` 与真实依赖

`@DependsOn("otherBean")` 可以强制创建顺序，但它不传递协作对象，也不替代构造器参数。

若 A 真正需要 B，写：

```java
ServiceA(ServiceB serviceB)
```

只有当依赖是副作用初始化顺序而非对象协作时才谨慎使用 `@DependsOn`。过多排序注解通常提示架构把启动副作用耦合得太紧。

## 28. 构造器循环依赖

本课保留故障配置：

<<< ../../../examples/java/spring-boot-bean-lifecycle/src/main/java/learning/backend/beans/cycle/BrokenCycleConfiguration.java{java:line-numbers} [BrokenCycleConfiguration.java]

它表达：

```text
CycleA 构造需要 CycleB
CycleB 构造需要 CycleA
```

运行：

```bash
java -jar target/spring-boot-bean-lifecycle-1.0.0-SNAPSHOT.jar \
  --spring.profiles.active=broken-cycle
```

容器无法先构造任意一个完整对象，会报告循环引用/`BeanCurrentlyInCreationException` 并失败退出。这是正确的快速失败。

## 29. 不要把 setter 注入当循环修复

Spring 文档说明 setter/字段路径在某些情况下可以暴露早期引用以绕过循环，但这会让一个对象在完全初始化前被另一个对象看到。

风险包括：

- target 尚未执行 init。
- AOP proxy 尚未最终包装。
- 不变量尚未建立。
- 测试和重构更难。
- 依赖方向仍然错误。

首选修复是重新设计职责：提取第三个协调服务、引入端口接口、拆分命令与查询，或让其中一方发布事件而非直接反向调用。

## 30. `@Lazy` 能打破循环吗

给某一边注入点加 `@Lazy` 可注入延迟解析代理，使启动暂时通过。但它改变的是解析时机，不是消除双向业务依赖。

只在确有合理延迟边界且调用时机受控时使用；不要把它当作“循环依赖开关”。若首次真实调用仍形成递归、事务边界混乱或初始化死锁，问题会更难排查。

## 31. profile 隔离故障示例

`BrokenCycleConfiguration` 使用：

```java
@Profile("broken-cycle")
```

默认不激活，因此可正常运行 HTTP 示例。profile 是选择 BeanDefinition 的条件，不是 package 隔离，也不是安全边界。

常用命令：

```bash
java -jar app.jar --spring.profiles.active=dev
```

多个 profile：

```bash
java -jar app.jar --spring.profiles.active=dev,metrics
```

生产 profile 名与秘密管理策略应由部署体系控制，不能靠开发者随意在源码中硬编码。

## 32. POM 与运行基线

<<< ../../../examples/java/spring-boot-bean-lifecycle/pom.xml{xml:line-numbers} [pom.xml]

继续使用 Boot 4.1.0 Parent 和 `spring-boot-starter-webmvc`。Java 17 是编译边界；本机 JDK 25 可运行 jar。

示例启用 `-Xlint:all`。编译警告是设计信号，不应在教学代码中被静默忽略。

## 33. 应用入口与配置文件

<<< ../../../examples/java/spring-boot-bean-lifecycle/src/main/java/learning/backend/beans/BeanLifecycleApplication.java{java:line-numbers} [BeanLifecycleApplication.java]

<<< ../../../examples/java/spring-boot-bean-lifecycle/src/main/resources/application.yaml{yaml:line-numbers} [application.yaml]

主类位于共同根包，所以 components、configuration 和 profile configuration 都能被默认扫描到。日志包级别设为 INFO，使 lifecycle event 对学习者可见；生产环境应按容量、保留策略与敏感信息规则配置日志。

## 34. 构建与运行

```bash
cd examples/java/spring-boot-bean-lifecycle
mvn -ntp package
java -jar target/spring-boot-bean-lifecycle-1.0.0-SNAPSHOT.jar \
  --server.port=18081
```

启动日志的关键片段：

```text
lifecycle-event: annotation bean: constructor
lifecycle-event: annotation bean: @PostConstruct
lifecycle-event: managed resource: constructor
lifecycle-event: managed resource: initMethod open
lifecycle-event: container: all non-lazy singletons instantiated
Tomcat started on port 18081
```

按 Ctrl+C 后可看到 `@PreDestroy` 和 `destroyMethod close`。这证明回调发生在 Context 关闭，而非 HTTP 请求完成时。

## 35. 端点实测解释

生命周期：

```bash
curl http://127.0.0.1:18081/api/beans/lifecycle
```

返回 resource 状态与事件数组。构造和 init 的相对顺序可观察；不要依赖不同 Bean 间偶然的完整排序，除非存在真实依赖或明确生命周期 phase。

singleton：

```json
{"firstLookup":"同一 UUID","secondLookup":"同一 UUID"}
```

prototype：

```json
{"firstLookup":"UUID A","secondLookup":"UUID B"}
```

request：每个响应内 use count 是 1、2；连续响应 requestId 不同。

## 36. 生命周期机制如何选择

| 需求 | 优先方式 |
| --- | --- |
| 依赖已注入后校验本对象 | `@PostConstruct` |
| 关闭本对象拥有资源 | `@PreDestroy` |
| 第三方类型 init/close | `@Bean(initMethod/destroyMethod)` |
| 全部 singleton 创建后轻量操作 | `SmartInitializingSingleton` |
| Boot 应用启动任务 | `ApplicationRunner` / `CommandLineRunner` |
| 可协调的 start/stop 与 phase | `SmartLifecycle` |
| 修改所有 Bean 的创建过程 | `BeanPostProcessor`，仅框架级需求 |

避免实现 `InitializingBean` / `DisposableBean`，除非正在写 Spring 特定基础设施。官方更推荐不耦合 Spring 的注解或配置方法。

## 37. `BeanPostProcessor` 的风险

BeanPostProcessor 能在每个 Bean 初始化前后介入，是 `@PostConstruct`、AOP、自动代理等基础能力的底层扩展点之一。

因为它执行得早且影响范围大：

- 不要在普通业务中用它做初始化。
- 不要让它依赖大量普通 Bean，避免早期创建副作用。
- 不要假设所有 Bean 都经过完全相同的后处理链。
- 要注意顺序和代理包装时机。

写框架/Starter 时才通常需要它。

## 38. `FactoryBean` 不是 `BeanFactory`

`BeanFactory` 是容器基础接口。`FactoryBean<T>` 是一个特殊 Bean，它本身负责生产另一个对象 `T`。

默认按名称获取 `FactoryBean` 时，容器返回它生产的对象；名称前加 `&` 才获取工厂本身。

本课不需要 FactoryBean。不要为了包装一次 `new` 就引入它；`@Bean` 或普通 factory class 更直接。

## 39. JavaScript 对照

| Spring | JavaScript/Node 类比 | 不能混同的地方 |
| --- | --- | --- |
| singleton Bean | module cache / app-level service | Spring 有 Context 边界与生命周期回调 |
| prototype | factory 每次 `create()` | Spring 只管理创建，不默认管理销毁 |
| request scope | Express `req` 附加上下文 | Spring 通过 scope + proxy 解析 target |
| `@PostConstruct` | 显式 async bootstrap 前同步初始化 | 发生在容器创建锁内，不应做慢 I/O |
| `@PreDestroy` | SIGTERM shutdown handler | 由 Context 生命周期协调 |
| AOP proxy | middleware/decorator wrapper | self-invocation 会绕过代理 |
| constructor cycle | ESM/CJS import cycle | Spring 还要在运行时构造完整对象图 |

前端经验能帮助理解“应用生命周期”和“请求上下文”，但 Java 的多线程 singleton 与代理边界需要独立掌握。

## 40. 并发与生命周期

Spring 在 singleton 完整初始化后安全发布它的配置状态。只在初始化阶段修改、之后不变的配置字段通常可安全读取。

但运行时积累的可变状态仍须遵循 Java 并发规则：

- 使用 immutable 值。
- 使用 `ConcurrentHashMap`、`AtomicInteger` 等并发工具。
- 或用锁保护共享状态。
- 停止阶段与请求线程可能并发，资源关闭要有明确协调。

本课 `RequestTrace` 使用 `AtomicInteger`，不是因为一个请求一定多线程，而是明确表达状态更新规则。

## 41. 常见错误

- 认为 singleton 是 JVM 全局唯一。
- 把请求字段存到 singleton Controller/Service。
- 认为 prototype 会在 Context 关闭时自动调用 `@PreDestroy`。
- 将 prototype 直接注入 singleton 后期待每次新建。
- 在 singleton 构造器内直接使用 request scoped target。
- 不使用 proxy/provider 却混合长短生命周期。
- 在 `@PostConstruct` 发起阻塞网络调用。
- 用 `@Lazy`、setter 注入掩盖构造器循环。
- 指望 AOP 拦截 `this.someMethod()`。
- 让 final class/final method 承担需要 CGLIB advice 的边界。
- 在 `@Configuration(proxyBeanMethods=false)` 中直接互调 `@Bean` 方法。
- 用 `@DependsOn` 表达真实业务协作关系。
- 捕获/吞掉关闭回调异常，导致资源泄露无迹可查。
- 根据代理类名写业务逻辑。

## 42. 排查顺序

1. 确认问题发生在 Context refresh、首个 lazy lookup、HTTP request 还是 shutdown。
2. 从最底层 `Caused by` 读 Bean 名、类型和依赖路径。
3. 检查 scope 是否与注入方寿命匹配。
4. 检查 Bean 是组件扫描、`@Bean`、自动配置还是 profile 条件产生。
5. 对 scope 问题打印 `getClass()` 和实例 ID，但不要把代理类名作为长期契约。
6. 对循环依赖画出 A → B → C → A 的职责图，先重构方向。
7. 对 AOP 问题检查调用是否真的经过代理，而非 `this`。
8. 对关闭问题检查信号、Context 是否实际关闭、prototype 是否由调用方清理。
9. 对启动慢问题区分构造、`@PostConstruct`、Runner、外部 I/O 和 server bind。

## 43. 本课验证记录

本示例使用 Maven 3.9.16、Spring Boot 4.1.0、JDK 25 runtime、Java 17 compilation target 验证：

- POM XML 校验通过。
- `mvn -o -ntp clean package` 成功，11 个 Java 文件零警告编译。
- 生成可执行 JAR。
- 嵌入式 Tomcat 在 18081 成功监听。
- lifecycle endpoint 显示 constructor、`@PostConstruct`、initMethod、all-singletons-ready 顺序。
- singleton 两次 lookup ID 相同。
- prototype 两次 provider lookup ID 不同。
- 两个 request 的 ID 不同、各自计数从 1 开始，注入类型为 scoped CGLIB proxy。
- Ctrl+C 触发 graceful shutdown 和 destroy callbacks。
- `broken-cycle` profile 用于验证循环引用启动失败。

## 44. 本节总结

- BeanDefinition 描述创建规则，Bean 是容器管理的实际对象。
- singleton 是每个 ApplicationContext/BeanDefinition 一份，不是自动线程安全。
- 构造、注入、`@PostConstruct`、init method、后处理器、代理和发布是不同阶段。
- `@PostConstruct`/`@PreDestroy` 是常规生命周期回调的优先选择。
- Java `@Bean` 适合第三方类型和精确生命周期配置；方法参数应表达依赖。
- `proxyBeanMethods=false` 时不要直接互调 `@Bean` 方法。
- prototype 每次请求新对象，但默认由创建者负责销毁。
- request scope 与 singleton 的生命周期不匹配，scoped proxy 或 provider 是桥梁。
- scoped proxy 与 AOP proxy 都是代理，但解决的问题不同。
- JDK/CGLIB 代理有接口、final、可见性和 self-invocation 限制。
- 构造器循环依赖是架构信号，应重构而非掩盖。

下一节建议：Spring Boot MVC 参数绑定、输入校验、统一 API 响应与测试。

## 45. 参考资料

- [Spring Framework：Bean Overview](https://docs.spring.io/spring-framework/reference/core/beans/definition.html)
- [Spring Framework：Bean Scopes](https://docs.spring.io/spring-framework/reference/core/beans/factory-scopes.html)
- [Spring Framework：Customizing the Nature of a Bean](https://docs.spring.io/spring-framework/reference/core/beans/factory-nature.html)
- [Spring Framework：Dependency Injection and Circular Dependencies](https://docs.spring.io/spring-framework/reference/core/beans/dependencies/factory-collaborators.html)
- [Spring Framework：Proxying Mechanisms](https://docs.spring.io/spring-framework/reference/core/aop/proxying.html)
- [Spring Framework：AOP Proxies](https://docs.spring.io/spring-framework/reference/core/aop/introduction-proxies.html)
- [Spring Framework：BeanFactory API](https://docs.spring.io/spring-framework/docs/7.0.x/javadoc-api/org/springframework/beans/factory/BeanFactory.html)
