---
title: Spring Boot 项目结构、启动流程、自动配置、配置系统与第一个 HTTP API
description: 从可执行 JAR 和 ApplicationContext 理解组件扫描、条件化自动配置、外部配置、Spring MVC 请求链与统一错误响应
outline: deep
---

# Spring Boot 项目结构、启动流程、自动配置、配置系统与第一个 HTTP API

> 基准环境：Spring Boot 4.1.0、Spring Framework 7.0.8、Maven 3.9.16；JDK 25 运行构建和示例，Java 17 编译目标。

## 第一次阅读只追踪一个请求

这一课内容很多，但主线只有一条：

```text
main 启动 Spring
  → Spring 创建 Controller 和 Service
  → Tomcat 监听端口
  → HTTP 请求匹配 Controller 方法
  → Service 执行业务
  → 返回值或异常被转换为 HTTP 响应
```

第一次先跑通示例并能说清这条链。starter、条件化自动配置、配置优先级和可执行 JAR内部结构用于解释“为什么不用手工装配”，不要求一次记住。遇到注解时先问它参与启动阶段还是请求阶段。

## 1. 学习目标

完成本节后，你应该能够：

- 说明 Spring Framework、Spring Boot、Spring MVC 和嵌入式 Tomcat 的分工。
- 读懂基于 `spring-boot-starter-parent` 的 Maven POM。
- 理解 starter、依赖管理、自动配置和 Maven Plugin 不是同一概念。
- 按根包组织启动类、配置、控制器、服务和领域对象。
- 展开 `@SpringBootApplication` 的三个核心组成部分。
- 按顺序解释 `SpringApplication.run` 到 HTTP 端口开始监听的过程。
- 理解 Bean、ApplicationContext、组件扫描和构造器注入。
- 理解自动配置的“候选项 + 条件 + 后退”机制。
- 使用 `--debug` 阅读 Condition Evaluation Report。
- 理解 `application.yaml`、环境变量、系统属性和命令行参数的覆盖关系。
- 使用 `@ConfigurationProperties` 完成类型安全、分组化配置绑定。
- 使用 Spring MVC 将方法映射为 GET/POST HTTP 端点。
- 区分路径变量、查询参数、请求头和 JSON 请求体。
- 正确返回 `200`、`201`、`400`、`404` 和 `409`。
- 使用 `ProblemDetail` 和 `@RestControllerAdvice` 统一错误协议。
- 构建可执行 JAR，理解普通 JAR 与 Boot 可执行 JAR 的差异。
- 把 Express/Vite 环境变量和中间件经验映射到 Spring Boot，但不混淆运行模型。

## 2. 版本状态与选择

截至 2026-07-14，Spring 官方项目页与参考文档的当前版本是 Spring Boot 4.1.0。

官方系统要求是：

- 至少 Java 17，最高兼容到 Java 26。
- Spring Framework 7.0.8 或更高的 7.0.x 兼容版本。
- Maven 3.6.3 或更高。
- Servlet 应用可使用 Tomcat 11.0.x 或 Jetty 12.1.x。
- Servlet 规范基线为 6.1。

本学习站继续使用 Java 17 作为项目编译边界，因为它是 Boot 4.1 的最低线，也覆盖很多现有企业环境；本机可用 JDK 25 启动 Maven 和运行产物。两者不冲突：

```text
JDK 25 运行 Maven/jar
          │
          └── 编译时 --release 17
                    └── 生成 Java 17 兼容 class
```

Boot 4 是大版本升级，模块和包结构相对 Boot 3 有变化。本课直接使用 Boot 4 的精确 starter：`spring-boot-starter-webmvc`。维护 Boot 3 项目时，不要机械复制 Boot 4 的 artifact 或 import；应先阅读迁移指南。

## 3. Spring、Spring Boot、Spring MVC 与 Tomcat

四者处于不同层次：

| 名称 | 本课中的职责 |
| --- | --- |
| Spring Framework | IoC 容器、依赖注入、Bean 生命周期、Web MVC 基础设施 |
| Spring Boot | 依赖版本协调、自动配置、外部配置、嵌入式服务器集成、可执行打包 |
| Spring MVC | 基于 Servlet 的请求路由、参数绑定、返回值处理和异常解析 |
| Tomcat | 监听 TCP 端口，实现 Servlet 容器并接收 HTTP 请求 |

Spring Boot 不是另一套 Web 框架，也不会取代 Spring Framework。它在 Spring 之上提供经过协调的默认值和启动方式。

类比前端：React 是 UI 库，Next.js 在其上提供工程约定、路由和构建集成；这个类比有助于入门，但 Spring 的 IoC 容器、Bean 和服务器生命周期仍需按 Java 运行模型理解。

## 4. Boot 解决的核心问题

不用 Boot 时，你仍可手动创建 Spring MVC 应用，但要自己协调：

- Spring 各模块与第三方库版本。
- Servlet 容器创建和部署。
- DispatcherServlet、JSON 映射器和 MVC 基础设施。
- 属性来源和环境切换。
- 日志、错误页和服务器设置。
- 打包和启动方式。

Boot 的策略不是生成大量隐藏代码，而是：

1. starter 聚合一组常用依赖。
2. BOM/parent 管理兼容版本。
3. 自动配置根据 classpath、已有 Bean、属性和应用类型作条件判断。
4. 如果应用没有自己提供某个基础设施 Bean，Boot 才提供合理默认实现。
5. Maven Plugin 把普通 JAR 重新打包成可执行 JAR。

## 5. 完整示例目录

```text
spring-boot-first-api/
├── pom.xml
└── src/main/
    ├── java/learning/backend/springboot/
    │   ├── BackendLearningApplication.java
    │   ├── config/
    │   │   └── LearningProperties.java
    │   ├── course/
    │   │   ├── Course.java
    │   │   ├── CreateCourseRequest.java
    │   │   ├── CourseService.java
    │   │   ├── CourseController.java
    │   │   ├── CourseNotFoundException.java
    │   │   └── CourseAlreadyExistsException.java
    │   └── web/
    │       └── GlobalExceptionHandler.java
    └── resources/
        └── application.yaml
```

示例按业务能力建立 `course` 包，而不是把所有 Controller、Service 放进全局大目录。小项目两种方式都能运行；业务增长后，按能力聚合通常更容易定位修改范围。

## 6. POM：继承 Boot 的工程默认值

<<< ../../../examples/java/spring-boot-first-api/pom.xml{xml:line-numbers} [pom.xml]

父 POM：

```xml
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>4.1.0</version>
    <relativePath/>
</parent>
```

它带来：

- Boot 官方维护的依赖版本管理。
- Java 编译、UTF-8、资源处理等合理默认值。
- 常用 Maven Plugin 的版本与配置。
- `spring-boot-maven-plugin` 的 `repackage` execution 配置。

`<relativePath/>` 表示不要在本地相对路径寻找父 POM，而是按坐标从仓库解析。

## 7. `java.version` 是项目边界

```xml
<java.version>17</java.version>
```

Starter Parent 会将这个属性用于编译配置。本机输出可能显示 Java 25 正在运行应用，但生成的业务 class 仍以 Java 17 为目标。

这和 TypeScript 的 `target` 有相似之处，但 Java 的 `--release` 还限制可见的标准库 API，不能仅把它理解为语法降级。

## 8. Starter 是依赖集合，不是代码生成器

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-webmvc</artifactId>
</dependency>
```

Boot 4 的 Web MVC starter 提供构建传统 Servlet Web API 所需的一组协调依赖，包括 Spring MVC、JSON 支持和嵌入式服务器相关模块。

它不会生成 `CourseController`，也不会自动知道业务路由。你仍要明确编写领域、服务和 HTTP 边界。

查看真实依赖：

```bash
mvn dependency:tree
```

不要给 starter 内的 Jackson、Tomcat、Spring Framework 随意覆盖版本。Boot 每个版本针对一组第三方版本做过集成测试；局部升级可能破坏二进制或行为兼容。

## 9. 编译器与配置元数据处理器

Boot 4.1 官方建议通过 Maven Compiler Plugin 的 annotation processor path 配置处理器：

```xml
<annotationProcessorPaths>
    <path>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-configuration-processor</artifactId>
    </path>
</annotationProcessorPaths>
```

处理器在编译时读取 `@ConfigurationProperties`，生成 `META-INF/spring-configuration-metadata.json`，支持 IDE 对自定义配置键的补全与说明。它只存在于编译器 processor path，不会作为业务运行依赖打进可执行 JAR。

本课同时启用 `-Xlint:all` 和 `showWarnings`，让 javac 在全量构建时报告常见可疑代码；仅关闭“其他运行时注解没有对应编译期处理器”的 `processing` 噪声，因为 Spring 注解主要由运行时容器读取。插件与处理器版本继续由 Starter Parent 管理，而不是隐式追踪最新版本。

## 10. Spring Boot Maven Plugin

```xml
<plugin>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-maven-plugin</artifactId>
</plugin>
```

常用 goal：

- `spring-boot:run`：从项目 classpath 启动应用。
- `spring-boot:repackage`：把 Maven 先生成的 JAR/WAR 重新组织成可执行归档。
- `spring-boot:build-image`：使用 Cloud Native Buildpacks 构建 OCI 镜像。

本课只使用 package/repackage，不构建镜像，也不执行 install/deploy。

## 11. 为什么能不写依赖和插件版本

本课 POM 没给 `spring-boot-starter-webmvc` 和 Boot Plugin 单独写版本，因为 Parent POM 已提供 dependencyManagement 和 pluginManagement。

这不是 Maven 会自动找到最新版。实际版本来自 effective POM：

```bash
mvn help:effective-pom
```

如果公司项目必须继承自己的 parent，可改为 import `spring-boot-dependencies` BOM；但 BOM 只管理依赖版本，不会自动复制 Starter Parent 的插件管理与构建默认值。

## 12. 主类必须位于根包

<<< ../../../examples/java/spring-boot-first-api/src/main/java/learning/backend/springboot/BackendLearningApplication.java{java:line-numbers} [BackendLearningApplication.java]

主类位于 `learning.backend.springboot`，其他包都在它下面。这样默认组件扫描会覆盖：

```text
learning.backend.springboot
├── config
├── course
└── web
```

不要使用无 `package` 声明的默认包。Boot 扫描时可能遍历 classpath 中过多类型，既慢又容易产生意外配置。

如果把主类放进 `learning.backend.springboot.bootstrap`，同级的 `course` 默认不会被扫描。可以显式配置扫描包，但更简单可靠的是把主类放在共同根包。

## 13. `@SpringBootApplication` 展开后是什么

它主要组合三个注解：

```java
@SpringBootConfiguration
@EnableAutoConfiguration
@ComponentScan
```

- `@SpringBootConfiguration`：表明这是主要 Boot 配置类，本质建立在 `@Configuration` 上。
- `@EnableAutoConfiguration`：导入满足条件的自动配置候选项。
- `@ComponentScan`：从当前包向下寻找组件。

通常一个应用只放一个 `@SpringBootApplication`。重复放置会让扫描与自动配置入口难以推断。

## 14. `main` 方法到底做了什么

```java
SpringApplication.run(BackendLearningApplication.class, args);
```

它不是“启动 Tomcat”这一件事，而是协调完整引导流程。简化顺序如下：

```text
JVM 调用 main
  → 创建并配置 SpringApplication
  → 推断应用类型是 Servlet Web
  → 准备 Environment 与配置数据
  → 创建 ApplicationContext
  → 读取配置类、扫描组件、选择自动配置
  → 注册 BeanDefinition
  → 创建单例 Bean 并注入依赖
  → 创建嵌入式 Tomcat 和 DispatcherServlet
  → 刷新上下文、发布生命周期事件
  → Tomcat 绑定端口并开始接收请求
```

任一步失败都会阻止应用进入 ready 状态。日志出现 `Tomcat initialized` 不等于端口已经成功监听；应看到 `Tomcat started` 与应用 `Started ...`。

## 15. ApplicationContext 是运行时对象图容器

Spring 容器主要维护：

- Bean 定义：类型、名称、scope、创建方法和依赖关系。
- 已创建的 Bean 实例。
- Environment 与属性源。
- 事件发布、资源加载、国际化等基础能力。

可把它想成应用级依赖图的构建器和所有者，但不要类比成 JS 中一个简单对象 map。容器还负责条件注册、代理、后处理器、生命周期回调等行为。

## 16. 什么是 Bean

Bean 是由 Spring 容器创建、装配和管理的对象。

本课中：

- `CourseService` 因 `@Service` 成为 Bean。
- `CourseController` 因 `@RestController` 成为 Bean。
- `GlobalExceptionHandler` 因 `@RestControllerAdvice` 成为 Bean。
- `LearningProperties` 由配置属性扫描注册和绑定。
- DispatcherServlet、JSON 映射器、Tomcat 工厂等由自动配置提供。

普通 `new Course(...)` 创建的 record 只是领域值，不需要成为 Bean。不要把每个 Java 对象都交给 Spring。

## 17. 组件 stereotype 注解

常见注解：

| 注解 | 语义 |
| --- | --- |
| `@Component` | 通用组件 |
| `@Service` | 业务服务，当前主要表达架构语义 |
| `@Repository` | 数据访问组件，还参与部分异常转换 |
| `@Controller` | MVC 控制器，常用于返回视图 |
| `@RestController` | `@Controller` + 默认将返回值写入响应体 |
| `@Configuration` | 声明配置和 `@Bean` 工厂方法 |

注解不是按名字直接被 JVM执行。Spring 扫描 class 元数据，把符合条件的类型注册为 Bean 定义，随后再实例化。

## 18. 构造器注入

`CourseController` 的依赖：

```java
public CourseController(CourseService courseService, LearningProperties properties) {
    this.courseService = courseService;
    this.properties = properties;
}
```

只有一个构造器时不必写 `@Autowired`。

构造器注入的优势：

- 依赖是显式、不可缺少的。
- 字段可设为 `final`。
- 对象创建后立即处于有效状态。
- 单元测试可直接 `new` 并传入替身。
- 循环依赖会更早暴露，而不是被字段注入掩盖。

类比 TypeScript：它接近显式 constructor dependency，但对象由容器根据类型图创建，而不是由路由文件手动 `new Service()`。

## 19. 自动配置不是“魔法扫描全部库”

Boot 从各模块的 `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` 找到候选配置类，再评估条件。

典型条件包括：

- `@ConditionalOnClass`：某个类在 classpath 上。
- `@ConditionalOnMissingClass`：某个类不在 classpath 上。
- `@ConditionalOnBean`：容器已有某类 Bean。
- `@ConditionalOnMissingBean`：应用还没提供某类 Bean。
- `@ConditionalOnProperty`：配置键符合要求。
- `@ConditionalOnWebApplication`：当前是 Web 应用。
- `@ConditionalOnResource`：某资源存在。

因此自动配置更接近：

```text
候选配置 + 当前 classpath + 当前 Bean 图 + 当前属性 + 应用类型
                         ↓
                    条件匹配结果
```

## 20. 自动配置的“后退”原则

假设 Boot 看到 Web MVC 和 JSON 库，会提供默认 JSON 映射、消息转换器和 MVC 配置。如果你明确声明同类型关键 Bean，带 `@ConditionalOnMissingBean` 的默认配置会后退。

这叫 non-invasive：先用默认值快速工作，出现真实定制需求时逐步替换。

不要因为看到自动配置类是 public 就直接调用其内部 `@Bean` 方法。官方只把可用于 exclusion 的自动配置类名视为稳定公共边界，其内部实现可能变化。

## 21. 如何知道哪些自动配置生效

启动时加入：

```bash
java -jar target/spring-boot-first-api-1.0.0-SNAPSHOT.jar --debug
```

或：

```bash
mvn spring-boot:run -Dspring-boot.run.arguments=--debug
```

Condition Evaluation Report 通常包含：

- Positive matches：条件满足，配置生效。
- Negative matches：至少一个条件不满足。
- Exclusions：应用显式排除。
- Unconditional classes：不需要额外条件的候选项。

看到 negative match 不等于错误。Boot 会评估大量候选配置，而你的应用只需要其中一部分。

## 22. 排除自动配置应有明确理由

可通过注解：

```java
@SpringBootApplication(exclude = SomeAutoConfiguration.class)
```

也可通过配置：

```yaml
spring:
  autoconfigure:
    exclude: com.example.SomeAutoConfiguration
```

排除前先用 conditions report 确认它真的生效并造成问题。更常见的正确方式是提供自定义 Bean，让默认配置按条件自然后退。

## 23. 外部化配置的目的

同一份应用制品需要在开发、测试和生产环境运行。不同环境变化的是端口、数据库地址、超时和功能开关，而不是业务源码。

```text
同一个 app.jar
  + 开发环境配置 → 开发实例
  + 测试环境配置 → 测试实例
  + 生产环境配置 → 生产实例
```

这与 Vite 的环境变量有相似目标，但关键差异是：Vite 的许多变量在前端构建时替换并进入浏览器资源；Boot 配置主要在服务器启动/运行时解析，秘密不应进入前端 bundle。

## 24. 本课的 `application.yaml`

<<< ../../../examples/java/spring-boot-first-api/src/main/resources/application.yaml{yaml:line-numbers} [application.yaml]

配置分成三组：

- `spring.application.name`：应用名，也会进入默认日志上下文。
- `server.port`：嵌入式服务器监听端口。
- `learning.*`：本应用自己定义的业务配置命名空间。

YAML 用缩进表达层级，不能使用 Tab。真实项目最好统一使用 YAML 或 properties，不要在同一位置混合两种格式制造优先级困惑。

## 25. Boot 默认查找哪些配置位置

Boot 默认从 classpath 和当前工作目录查找 `application.properties`/`application.yaml`，包括常见的 `config/` 目录。外部文件可覆盖 JAR 内默认值。

改变或追加位置：

```bash
java -jar app.jar --spring.config.location=file:./production.yaml
```

```bash
java -jar app.jar \
  --spring.config.additional-location=optional:file:./local-config/
```

`location` 替换默认位置，`additional-location` 在默认位置之外追加。路径不存在且没有 `optional:` 时，应用默认启动失败；这能尽早发现部署遗漏。

## 26. 配置覆盖顺序的核心规则

完整 PropertySource 顺序较长，入门先记住：后加入、优先级更高的来源可以覆盖低优先级来源。

本课常见覆盖关系：

```text
JAR 内 application.yaml
  < JAR 外 application.yaml
  < 操作系统环境变量
  < Java System Property
  < 命令行参数
```

命令行覆盖端口：

```bash
java -jar app.jar --server.port=18080
```

环境变量：

```bash
SERVER_PORT=18080 java -jar app.jar
```

系统属性必须放在 `-jar` 前：

```bash
java -Dserver.port=18080 -jar app.jar
```

排查“配置为什么没生效”时，不要只盯着 YAML；还要检查环境变量、启动脚本、容器参数和命令行。

## 27. 环境变量的 relaxed binding

属性名：

```text
learning.catalog-title
```

常见环境变量形式：

```text
LEARNING_CATALOGTITLE
```

Boot 会执行 relaxed binding，处理 kebab-case、camelCase 和环境变量约定。文档与配置文件中优先使用小写 kebab-case，它是推荐的 canonical form。

不要把 relaxed binding 理解为任意拼写都能绑定。尤其是集合、Map 和数字索引，要按官方环境变量转换规则编写并验证。

## 28. 类型安全配置绑定

<<< ../../../examples/java/spring-boot-first-api/src/main/java/learning/backend/springboot/config/LearningProperties.java{java:line-numbers} [LearningProperties.java]

`@ConfigurationProperties("learning")` 把同一命名空间映射到一个 record：

```text
learning.catalog-title   → catalogTitle
learning.welcome-message → welcomeMessage
```

相较于在多个类中散落：

```java
@Value("${learning.catalog-title}")
```

分组配置类型具有：

- 明确的字段类型和结构。
- relaxed binding。
- IDE 元数据支持。
- 集中校验和文档位置。
- 更容易作为构造器依赖注入。

`@Value` 仍适合极少量或需要 Spring Expression Language 的值，但不应成为复杂配置模型的默认选择。

## 29. `@ConfigurationPropertiesScan`

主类上的：

```java
@ConfigurationPropertiesScan
```

从根包向下查找配置属性类型并注册。另一种方式是在配置类上精确启用：

```java
@EnableConfigurationProperties(LearningProperties.class)
```

扫描适合应用内多组配置；精确启用常用于小范围配置或测试切片。不要同时给同一配置类型随意叠加 `@Component` 和扫描注册，避免重复 Bean。

## 30. 启动时失败优于带错误配置运行

本课 record 的紧凑构造器拒绝 null 或空白：

```java
throw new IllegalArgumentException(propertyName + " 不能为空");
```

缺少关键配置时 ApplicationContext 创建失败，服务器不会假装启动成功。

后续项目可引入 Jakarta Bean Validation，用 `@NotBlank`、`@Min` 等声明约束，并在配置类型上使用 `@Validated`。本课先让校验执行链保持透明。

密码、token 和私钥不应写进仓库内的 `application.yaml`。应由秘密管理系统、挂载文件或受控环境变量提供，并限制日志和 Actuator 暴露。

## 31. 领域值 `Course`

<<< ../../../examples/java/spring-boot-first-api/src/main/java/learning/backend/springboot/course/Course.java{java:line-numbers} [Course.java]

record 自动提供不可变字段、访问器、`equals`、`hashCode` 和 `toString`，适合小型响应值。

紧凑构造器保证：

- slug/title 非空白。
- slug 去除首尾空白并转小写。
- topics 不为 null、不可从外部修改。
- 至少有一个主题。

约束放在模型边界后，无论对象来自 HTTP、测试还是内部代码，都遵循相同不变量。

## 32. 不可变集合边界

```java
topics = List.copyOf(topics == null ? List.of() : topics);
```

如果直接保存请求反序列化得到的可变 ArrayList，其他代码可能在 Course 创建后修改其内容。`List.copyOf` 建立防御性不可变副本。

record 自身字段 final 不代表字段引用指向的集合自动不可变，这是 Java 与 JavaScript `const` 都容易产生的误解。

## 33. 请求 DTO 与领域对象分开

<<< ../../../examples/java/spring-boot-first-api/src/main/java/learning/backend/springboot/course/CreateCourseRequest.java{java:line-numbers} [CreateCourseRequest.java]

`CreateCourseRequest` 表示客户端可提交的 JSON；`Course` 表示系统接受的有效领域值。

当前字段相同，但仍分开，因为后续常出现：

- 领域对象有服务端生成的 ID、创建时间。
- 创建、更新请求允许的字段不同。
- 输入字段名与内部模型不同。
- 输入校验与持久化约束不同。
- 敏感内部字段绝不能被 mass assignment。

不要把数据库实体直接当所有 API 的请求/响应模型。

## 34. 业务服务与线程安全

<<< ../../../examples/java/spring-boot-first-api/src/main/java/learning/backend/springboot/course/CourseService.java{java:line-numbers} [CourseService.java]

Spring Bean 默认是 singleton：一个 `CourseService` 实例会服务多个请求线程。因此内部可变状态必须考虑并发。

本课使用 `ConcurrentHashMap`，创建时调用：

```java
courses.putIfAbsent(course.slug(), course)
```

“检查不存在，再插入”由单个原子操作完成。若使用普通 HashMap 或先 `containsKey` 再 `put`，并发请求可能同时通过检查。

这只是内存演示：

- 进程重启后数据丢失。
- 多实例之间不共享。
- 没有事务和持久化保证。

后续数据访问课会将存储职责替换为数据库 Repository。

## 35. 为什么返回排序后的列表

ConcurrentHashMap 不保证业务顺序：

```java
courses.values().stream()
        .sorted(Comparator.comparing(Course::slug))
        .toList();
```

稳定排序让 API 输出、日志和测试更可预测。不要依赖 HashMap 当前碰巧呈现的迭代顺序。

## 36. 业务异常表达失败语义

<<< ../../../examples/java/spring-boot-first-api/src/main/java/learning/backend/springboot/course/CourseNotFoundException.java{java:line-numbers} [CourseNotFoundException.java]

<<< ../../../examples/java/spring-boot-first-api/src/main/java/learning/backend/springboot/course/CourseAlreadyExistsException.java{java:line-numbers} [CourseAlreadyExistsException.java]

Service 抛出“课程不存在/已存在”，而不直接返回 HTTP 状态码。这样业务层不必绑定到 Web 协议。

Web 层统一映射：

```text
CourseNotFoundException      → 404 Not Found
CourseAlreadyExistsException → 409 Conflict
IllegalArgumentException     → 400 Bad Request
```

若未来由消息消费者调用同一 Service，它可以把相同异常映射成消息拒绝或重试策略。

## 37. REST Controller

<<< ../../../examples/java/spring-boot-first-api/src/main/java/learning/backend/springboot/course/CourseController.java{java:line-numbers} [CourseController.java]

类级别：

```java
@RestController
@RequestMapping("/api/courses")
```

方法级别再添加具体 HTTP method 与子路径。

`@RestController` 的返回对象会交给 HttpMessageConverter。classpath 中存在 JSON 支持且客户端可接受 JSON 时，Jackson 将 record 序列化为响应体。

Controller 应负责协议适配：读取 HTTP 输入、调用业务服务、选择状态和响应。不要把复杂业务规则堆在 Controller。

## 38. GET 集合端点

```java
@GetMapping
public CourseCatalogResponse findAll()
```

完整路由是：

```text
GET /api/courses
```

成功时普通返回值默认产生 `200 OK`。包装响应而不是只返回裸数组，可以稳定加入 `title`、`message`、分页和 links 等元数据。

响应示例：

```json
{
  "title": "AI 全栈后端学习目录",
  "message": "从第一个可观察、可配置的 HTTP API 开始",
  "courses": [
    {
      "slug": "maven",
      "title": "Maven 基础",
      "topics": ["POM", "依赖管理", "生命周期"]
    }
  ]
}
```

## 39. 路径变量

```java
@GetMapping("/{slug}")
public Course findBySlug(@PathVariable String slug)
```

请求：

```http
GET /api/courses/spring-boot
```

`spring-boot` 是资源标识的一部分，适合路径变量。

查询参数更适合筛选、排序、分页等可选条件：

```java
@RequestParam(defaultValue = "0") int page
```

不要把二者仅当不同语法。URL 设计应表达资源定位与查询语义。

## 40. POST 与 JSON 请求体

```java
@PostMapping
public ResponseEntity<Course> create(@RequestBody CreateCourseRequest request)
```

请求：

```http
POST /api/courses
Content-Type: application/json

{
  "slug": "spring-mvc",
  "title": "Spring MVC",
  "topics": ["路由", "JSON"]
}
```

`@RequestBody` 触发 JSON 反序列化。JSON 语法错误或字段类型无法转换时，在进入方法前抛出 `HttpMessageNotReadableException`。

这类似 Express 的 JSON body parser，但 Spring MVC 随后还执行参数解析、类型转换、方法选择和返回值处理。

## 41. 为什么创建返回 201 和 Location

```java
return ResponseEntity.created(location).body(created);
```

响应：

```http
HTTP/1.1 201 Created
Location: /api/courses/spring-mvc
Content-Type: application/json
```

`201 Created` 明确表示服务器创建了资源；`Location` 告诉客户端新资源 URL。若只返回对象，默认会是 200，语义不够精确。

`ResponseEntity` 用于同时控制状态、headers 和 body。不是每个端点都必须使用它；普通 200 JSON 返回值可以保持简洁。

## 42. HTTP 方法语义

| 方法 | 常见语义 | 本课 |
| --- | --- | --- |
| GET | 安全读取，不应修改资源 | 查询课程 |
| POST | 创建或触发非幂等处理 | 创建课程 |
| PUT | 对指定 URI 完整替换，通常应幂等 | 未使用 |
| PATCH | 部分修改 | 未使用 |
| DELETE | 删除资源，重复调用结果应稳定 | 未使用 |

“幂等”指重复执行同一请求的预期服务端状态效果一致，不等于每次响应字节必须完全一样。

浏览器或代理可能重试请求。API 设计不能把 GET 当成隐蔽的写操作。

## 43. DispatcherServlet 请求链

请求进入后大致经历：

```text
客户端
  → Tomcat Connector
  → Servlet Filter 链
  → DispatcherServlet
  → HandlerMapping 找到 Controller 方法
  → HandlerAdapter 解析参数并调用方法
  → CourseService
  → 返回值处理 / Jackson 序列化
  → HTTP response
```

抛出异常时，会交给 HandlerExceptionResolver 链；`@RestControllerAdvice` 声明的 handler 是其中一种解析来源。

这比“URL 直接调用 Java 方法”多了协议解析和扩展层。认证、日志、跨域、异常和内容协商会在不同层参与。

## 44. 统一异常处理

<<< ../../../examples/java/spring-boot-first-api/src/main/java/learning/backend/springboot/web/GlobalExceptionHandler.java{java:line-numbers} [GlobalExceptionHandler.java]

`@RestControllerAdvice` 让异常处理跨 Controller 生效，并默认把返回对象写成响应体。

优势：

- Controller 不必重复 try/catch。
- 相同业务异常始终得到相同状态码和结构。
- 错误 code、日志策略和追踪字段可集中演进。
- 不把 Java stack trace 暴露给客户端。

不要捕获所有 `Exception` 后一律返回 200。HTTP 状态是协议的一部分，监控、客户端和网关都依赖它。

## 45. `ProblemDetail` 与 RFC 9457

Spring 的 `ProblemDetail` 表达标准化 HTTP 问题详情。典型字段：

```json
{
  "type": "https://example.invalid/problems/course_not_found",
  "title": "Not Found",
  "status": 404,
  "detail": "未找到课程：not-exist",
  "instance": "/api/courses/not-exist",
  "code": "course_not_found"
}
```

- `type`：问题类型的稳定标识，真实系统应指向受控文档域名。
- `title`：该类型的简短标题。
- `status`：HTTP 状态。
- `detail`：本次发生的具体说明。
- `instance`：本次请求实例。
- `code`：本课添加的机器可读业务码。

客户端应优先根据 HTTP status 与稳定 code 分支，不要解析自然语言 detail。

## 46. 400、404 与 409 的边界

- `400 Bad Request`：JSON 语法/类型错误，或输入字段不满足约束。
- `404 Not Found`：URI 语法有效，但指定课程不存在。
- `409 Conflict`：请求本身有效，但与当前资源状态冲突，例如 slug 已存在。

这些状态不是为了“看起来 RESTful”，而是给客户端明确的恢复策略：修正请求、停止查找、换 slug 或读取已有资源。

## 47. 不要泄露内部异常

错误响应不应包含：

- Java stack trace。
- SQL 与表结构。
- 文件系统绝对路径。
- 内部主机名、token 或连接串。
- 框架类名和实现细节。

客户端拿到稳定、有限的错误协议；服务端日志保留诊断上下文并配合 request/trace ID。生产环境还要区分可预期业务错误和意外 5xx。

## 48. 内容协商与媒体类型

客户端发送 JSON 应带：

```http
Content-Type: application/json
```

它描述请求体格式。客户端还可发送：

```http
Accept: application/json
```

它描述可接受的响应格式。

请求 Content-Type 不受支持通常得到 `415 Unsupported Media Type`；无法产生 Accept 所需格式可能得到 `406 Not Acceptable`。不要仅凭 URL 后缀猜内容格式。

错误体由 `ProblemDetail` 输出时，本课实测媒体类型是：

```http
Content-Type: application/problem+json
```

## 49. 构建、运行与停止

进入示例目录：

```bash
cd examples/java/spring-boot-first-api
```

构建：

```bash
mvn -ntp package
```

启动：

```bash
java -jar target/spring-boot-first-api-1.0.0-SNAPSHOT.jar
```

临时覆盖端口：

```bash
java -jar target/spring-boot-first-api-1.0.0-SNAPSHOT.jar \
  --server.port=18080
```

按 `Ctrl+C` 时，JVM 收到终止信号，Boot shutdown hook 关闭 ApplicationContext，嵌入式 Tomcat 执行 graceful shutdown。

## 50. 用 Maven 直接运行

开发时也可：

```bash
mvn spring-boot:run
```

两种方式的边界：

- `spring-boot:run` 使用项目构建 classpath，适合本地开发。
- `java -jar` 验证最终可部署制品，最接近生产启动方式。

“IDE 能启动”不代表可执行 JAR 一定正确。交付前应至少验证一次打包产物。

## 51. 实际请求：查询列表

```bash
curl -i http://127.0.0.1:18080/api/courses
```

关键响应：

```http
HTTP/1.1 200
Content-Type: application/json
```

本课示例会稳定按 slug 排序返回 `maven` 和 `spring-boot`。

## 52. 实际请求：创建课程

```bash
curl -i \
  -H 'Content-Type: application/json' \
  -d '{"slug":"spring-mvc","title":"Spring MVC","topics":["路由","JSON"]}' \
  http://127.0.0.1:18080/api/courses
```

关键响应：

```http
HTTP/1.1 201
Location: /api/courses/spring-mvc
Content-Type: application/json
```

此数据只存在当前 JVM 内。停止后重启，`spring-mvc` 不会保留。

## 53. 实际请求：错误路径

不存在：

```bash
curl -i http://127.0.0.1:18080/api/courses/not-exist
```

得到 404 和 code `course_not_found`。

重复创建：

```bash
curl -i \
  -H 'Content-Type: application/json' \
  -d '{"slug":"spring-boot","title":"重复","topics":["冲突"]}' \
  http://127.0.0.1:18080/api/courses
```

得到 409 和 code `course_already_exists`。

无效 JSON：

```bash
curl -i \
  -H 'Content-Type: application/json' \
  -d '{broken-json}' \
  http://127.0.0.1:18080/api/courses
```

得到 400 和 code `invalid_request`。

## 54. 可执行 JAR 结构

普通 Maven JAR 默认只有当前模块的 class/resources，不含全部依赖。Boot Plugin repackage 后大致是：

```text
app.jar
├── META-INF/
├── BOOT-INF/
│   ├── classes/        # 业务 class 与 resources
│   └── lib/            # 依赖 jar
└── org/springframework/boot/loader/  # 启动加载器
```

查看：

```bash
jar tf target/spring-boot-first-api-1.0.0-SNAPSHOT.jar
```

`java -jar` 先进入 Boot Loader，再创建包含 `BOOT-INF/classes` 和嵌套依赖的运行时 classpath，最终调用业务 main class。

## 55. 启动日志如何阅读

本课实测关键日志：

```text
Spring Boot (v4.1.0)
Starting BackendLearningApplication ... using Java 25.0.3
No active profile set ... "default"
Tomcat initialized with port 18080 (http)
Root WebApplicationContext: initialization completed
Tomcat started on port 18080 (http)
Started BackendLearningApplication
```

顺序很重要：

1. 版本与 JVM。
2. profile。
3. Web 容器初始化。
4. ApplicationContext 完成。
5. 端口开始监听。
6. 应用 ready。

若出现 `APPLICATION FAILED TO START`，从最下层 `Caused by` 向上还原根因，不要只复制第一行包装异常。

## 56. 常见启动失败：端口占用

典型信息包含 `Port 8080 was already in use` 或 bind 失败。

处理：

```bash
lsof -nP -iTCP:8080 -sTCP:LISTEN
```

确认进程归属后停止旧进程，或临时换端口：

```bash
java -jar app.jar --server.port=18080
```

不要看到端口冲突就随意 kill 未确认的系统/他人进程。

## 57. 常见启动失败：Bean 找不到

典型错误：

```text
required a bean of type 'X' that could not be found
```

检查顺序：

1. 类型是否应由应用声明，还是预期自动配置。
2. 实现类是否有组件注解或 `@Bean` 注册。
3. 是否位于主类根包下面。
4. profile/condition 是否使它未注册。
5. 需要的 starter 是否真的在 classpath。
6. conditions report 中相关配置为何 negative match。

不要先给字段加 null 或把依赖改成 optional 来隐藏缺失。

## 58. 常见启动失败：多个 Bean 候选

同一接口有多个实现时，构造器按类型无法唯一选择，通常出现 `NoUniqueBeanDefinitionException`。

可通过：

- 让设计只有一个默认实现。
- 在注入点使用 `@Qualifier`。
- 给合理默认实现标注 `@Primary`。
- 注入 `Map<String, Interface>` 明确处理多个实现。

不要靠类名或注册顺序碰巧选中。

## 59. 常见启动失败：配置绑定

典型原因：

- 键名拼错或层级缩进错误。
- 字符串无法转换成数字、Duration、URI 等目标类型。
- 必填值缺失。
- 高优先级环境变量意外覆盖。
- `spring.config.location` 指向不存在文件。

排查时记录最终启动命令、环境变量名、profile 和配置文件位置。敏感值要脱敏。

Actuator 的 `env`、`configprops` 端点能辅助定位，但生产暴露前必须配置访问控制与脱敏策略。

## 60. 常见请求失败：404

区分：

- 路由根本不存在：HandlerMapping 没找到 Controller method。
- 路由存在但业务资源不存在：本课主动抛 `CourseNotFoundException`。

检查请求 method、context path、类/方法映射、路径拼写、组件扫描和启动日志。前端请求 `/courses` 而服务端定义 `/api/courses` 是最常见的边界错误之一。

## 61. 常见请求失败：400/415

400 检查：

- JSON 引号、逗号和括号。
- 字段类型。
- record 构造约束。
- URL 编码和参数转换。

415 检查：

- 是否发送 `Content-Type: application/json`。
- 实际 body 是否与媒体类型一致。
- JSON converter 是否在 classpath。

curl 的 `-d` 默认 Content-Type 不是 JSON，因此本课显式添加 header。

## 62. 生产环境不能直接沿用的部分

本课故意保持第一个 API 的边界清晰，尚未加入：

- 数据库、事务、迁移。
- 身份认证与权限校验。
- Jakarta Validation 请求校验。
- 分页、API 版本策略和 OpenAPI。
- 请求日志、指标、trace、健康检查。
- 超时、限流、幂等键。
- 集成测试与容器化。
- CORS 与反向代理配置。

这不是说它们不重要，而是应在理解启动、IoC、配置和请求链后逐层加入，避免只会复制注解。

## 63. Spring Boot 与 Express 对照

| Spring Boot / MVC | Express/Node 常见概念 | 关键差异 |
| --- | --- | --- |
| `main` + `SpringApplication.run` | `app.listen()` | Boot 还创建 IoC 容器和自动配置图 |
| `@RestController` | router handler | Java 方法有编译期类型，参数由 MVC 解析 |
| `@Service` Bean | service module/object | Bean 生命周期由容器管理 |
| constructor injection | 手动 import/工厂注入 | 容器按类型解析对象图 |
| `@RequestBody` record | `req.body` | JSON 绑定到明确 Java 类型 |
| `@RestControllerAdvice` | error middleware | 通过异常解析链匹配类型 |
| `application.yaml` | `.env`/config module | 有统一 PropertySource 与类型安全绑定 |
| embedded Tomcat worker threads | Node event loop | 默认并发执行模型不同 |
| executable JAR | Node app + node_modules/bundle | Boot Loader 管理嵌套依赖 |

不要把阻塞式 Spring MVC 当 Node event loop。每个请求通常在服务器线程上执行；慢数据库/远程调用会占用该线程。后续应配置超时、连接池和并发边界。

## 64. 包组织的演进

本课按业务包：

```text
course/
  Course
  CourseService
  CourseController
```

规模扩大后可继续细分：

```text
course/
├── api/             # HTTP DTO/controller
├── application/     # use case/service
├── domain/          # domain model/rules
└── infrastructure/  # database/external clients
```

分层名称不是目标。真正目标是依赖方向清晰、业务规则不被 HTTP/数据库细节绑死、变更影响可控。

## 65. 配置类不应变成服务定位器

`LearningProperties` 只承载来自 Environment 的值，不应注入 Repository、HTTP Client 或 Service。

推荐依赖方向：

```text
Environment → LearningProperties → CourseController
```

而不是让任意业务代码随处读取 `Environment.getProperty(...)`。集中绑定能让依赖和配置契约保持显式。

## 66. 安全的默认思维

- 不在响应中返回 stack trace。
- 不把秘密写入 Git 或命令历史。
- 不信任请求 DTO；在边界校验。
- 不允许客户端任意绑定内部实体字段。
- 不用 200 包装所有错误。
- 不在 GET 中修改状态。
- 不在 Controller 捕获后吞掉未知异常。
- 不无限制接收 body、列表或字符串。
- 不默认开放调试/管理端点到公网。

后续 Spring Security 课会系统处理认证、授权、CSRF、CORS 和安全过滤链。

## 67. 本课验证记录

示例在以下环境验证：

```text
Apache Maven 3.9.16
Spring Boot 4.1.0
Spring Framework 7.0.8
Tomcat 11.0.22
JDK 25.0.3 runtime
Java 17 compilation target
```

验证内容：

- POM 通过 XML 校验。
- `mvn -ntp package` BUILD SUCCESS。
- Boot Plugin 成功生成带嵌套依赖的可执行 JAR。
- 应用在 18080 端口成功启动并 graceful shutdown。
- GET 列表返回 200 JSON。
- POST 创建返回 201 与 Location。
- 不存在课程返回 404 `application/problem+json`。
- 重复创建返回 409。
- 非法 JSON 和非法字段返回 400。

## 68. 常见误区清单

- 把 Spring Boot 当成 Spring Framework 的替代品。
- 认为 starter 会生成业务代码。
- 认为未写依赖版本就是使用最新版。
- 主类放在叶子包，导致组件扫描遗漏。
- 每个类都加 `@SpringBootApplication`。
- 把所有 Java 对象都注册成 Bean。
- 用字段注入隐藏必需依赖。
- 认为自动配置无条件生效。
- 看到 negative match 就当启动错误。
- 直接依赖自动配置内部 Bean 方法。
- 同时混用 YAML/properties 却不理解优先级。
- 只查配置文件，不查环境变量和命令行覆盖。
- 用 `@Value` 散落几十个相关配置键。
- 把密码写入仓库配置。
- 默认 singleton Service 保存非线程安全可变状态。
- 用 `containsKey` + `put` 假装原子创建。
- 直接把数据库实体作为请求 DTO。
- POST 创建成功仍一律返回 200。
- 业务不存在、输入错误和冲突全部返回 500。
- 错误响应暴露 stack trace。
- 依赖 HashMap 偶然顺序形成 API 契约。
- 只验证 IDE 启动，不验证可执行 JAR。
- 看到 `Tomcat initialized` 就判断服务 ready。
- 把 Spring MVC 请求线程模型当 Node event loop。

## 69. 故障排查顺序

1. 记录 Maven、JDK、Boot 版本和完整启动命令。
2. 从日志确认 active profiles、配置位置和端口覆盖。
3. 确认失败发生在构建、Context refresh、服务器 bind 还是请求处理阶段。
4. 启动失败从最后一个根因 `Caused by` 向上读。
5. Bean 问题检查包扫描、注册方式、候选数量和 condition。
6. 自动配置问题加 `--debug` 阅读匹配报告。
7. 配置问题检查 canonical key、类型、PropertySource 优先级和秘密注入方式。
8. 404 检查 method、完整 path、context path 和 HandlerMapping。
9. 400/415 检查 Content-Type、JSON、字段类型和校验详情。
10. 5xx 在服务端日志中用 request/trace ID 定位，客户端不暴露内部堆栈。
11. “本机好、CI 坏”比较 JDK/Maven、settings、环境变量、工作目录和网络。
12. “IDE 好、jar 坏”检查 repackage、资源是否进入 BOOT-INF/classes 及实际启动制品。

## 70. 本节总结

- Spring Framework 提供容器和 MVC，Boot 提供约定、自动配置、外部配置与运行集成。
- Boot 4.1.0 至少需要 Java 17 和 Maven 3.6.3，本课以 Java 17 为编译目标。
- Starter 是经过版本协调的依赖集合，不是业务代码生成器。
- Starter Parent 管依赖和插件默认值，Boot Plugin 生成可执行 JAR。
- 主类应位于共同根包，`@SpringBootApplication` 组合主配置、自动配置和组件扫描。
- `SpringApplication.run` 构建 Environment、ApplicationContext、Bean 图和嵌入式服务器。
- Bean 是容器管理对象；领域 record 不必成为 Bean。
- 构造器注入使依赖显式并保持对象有效。
- 自动配置通过 classpath、Bean、属性和应用类型条件选择，并在用户提供实现时后退。
- `--debug` 的 Condition Evaluation Report 是理解自动配置的首要工具。
- 外部配置具有明确优先级，命令行和环境变量可覆盖 JAR 内默认值。
- `@ConfigurationProperties` 适合类型安全、分组配置。
- Controller 负责 HTTP 协议适配，Service 承载业务用例，领域对象维护不变量。
- singleton Service 会被并发请求共享，可变状态必须线程安全。
- POST 创建资源应返回 201 和 Location，输入/不存在/冲突应区分 400/404/409。
- `@RestControllerAdvice` 与 `ProblemDetail` 能建立稳定统一的错误协议。
- 可执行 JAR 包含业务 classes、嵌套依赖和 Boot Loader，应以最终制品验证启动。

下一节：[Spring Boot Bean 生命周期、Java 配置、作用域、代理与循环依赖](/backend/spring-boot/bean-lifecycle-java-config-scopes-proxies-and-circular-dependencies)。

## 71. 参考资料

- [Spring Boot：项目主页与当前版本](https://spring.io/projects/spring-boot/)
- [Spring Boot：System Requirements](https://docs.spring.io/spring-boot/system-requirements.html)
- [Spring Boot：Developing Your First Application](https://docs.spring.io/spring-boot/tutorial/first-application/)
- [Spring Boot：Structuring Your Code](https://docs.spring.io/spring-boot/reference/using/structuring-your-code.html)
- [Spring Boot：Spring Beans and Dependency Injection](https://docs.spring.io/spring-boot/reference/using/spring-beans-and-dependency-injection.html)
- [Spring Boot：Auto-configuration](https://docs.spring.io/spring-boot/reference/using/auto-configuration.html)
- [Spring Boot：Externalized Configuration](https://docs.spring.io/spring-boot/reference/features/external-config.html)
- [Spring Boot：Configuration Metadata Annotation Processor](https://docs.spring.io/spring-boot/specification/configuration-metadata/annotation-processor.html)
- [Spring Boot：Profiles](https://docs.spring.io/spring-boot/reference/features/profiles.html)
- [Spring Boot：Web](https://docs.spring.io/spring-boot/reference/web/index.html)
- [Spring Boot Maven Plugin：Using the Plugin](https://docs.spring.io/spring-boot/maven-plugin/using.html)
- [Spring Boot Maven Plugin：Packaging Executable Archives](https://docs.spring.io/spring-boot/maven-plugin/packaging.html)
- [Spring Boot 4.0 Migration Guide](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Migration-Guide)
- [Spring Framework：ProblemDetail API](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/http/ProblemDetail.html)
