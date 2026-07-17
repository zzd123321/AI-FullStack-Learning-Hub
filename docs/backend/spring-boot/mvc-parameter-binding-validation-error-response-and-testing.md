---
title: Spring Boot MVC 参数绑定、输入校验、统一错误响应与测试
description: 从 DispatcherServlet 参数解析链理解路径、查询、Header、JSON、类型转换、Jakarta Validation、ProblemDetail 与 MockMvc 切片测试
outline: deep
---

# Spring Boot MVC 参数绑定、输入校验、统一错误响应与测试

> 基准环境：Spring Boot 4.1.0、Spring Framework 7.0.8、Maven 3.9.16；Java 17 编译目标。

## Controller 参数不是凭空变成 Java 对象

第一课展示了一个能返回响应的方法，本课把进入方法之前的过程放大：网络上只有路径、Header 和 JSON 字节，Spring MVC 必须先匹配路由、读取数据、转换类型并校验，全部成功后才调用 Controller。

第一次先掌握 `@PathVariable`、`@RequestParam`、`@RequestBody`、`@Valid` 与统一错误结构。方法校验异常分类和复杂参数解析属于出现对应失败后再查的第二层。

## 用同一个请求观察四个失败阶段

假设接口声明：

```java
@PostMapping("/courses/{courseId}/lessons")
LessonView create(
        @PathVariable long courseId,
        @Valid @RequestBody CreateLessonRequest request) {
    return service.create(courseId, request);
}
```

1. `PUT /course/1/lessons` 的 method/path 不匹配，Controller 不执行。
2. `POST /courses/abc/lessons` 匹配路径，但 `"abc"` 无法转成 `long`，Service 不执行。
3. JSON 能解析，但空标题违反 `@NotBlank`，方法体仍不执行。
4. 输入完全合法，但课程已归档，由 Service 抛出业务冲突。

```text
HTTP bytes
  → route matching
  → argument resolution/type conversion
  → JSON deserialization
  → Jakarta Validation
  → Controller
  → Service business rule
```

统一异常处理不是把所有失败都变成同一个 400，而是让不同阶段映射为稳定、可区分的 problem type。

## `@Valid` 不会替你定义规则

```java
record CreateLessonRequest(
        @NotBlank String title,
        @Positive int durationMinutes) {}
```

约束在字段/类型上定义；`@Valid` 只告诉参数解析器对对象执行级联验证。没有约束的对象加 `@Valid` 不会凭空知道什么是合法业务数据。

还要区分输入约束和业务不变量：标题为空适合请求模型约束；“归档课程不能新增课时”需要查询当前课程状态，应留在业务层，不能伪装成一个脱离状态的 annotation。

## 测试要证明方法有没有被调用

只断言 status 不够。校验失败测试还应验证 Service 没有被调用，从而证明不可信输入停在 HTTP 边界；业务异常测试则让 mock Service 抛出明确异常，验证 advice 的映射。这样失败阶段才不会在重构中悄悄移动。

## 1. 学习目标

完成本节后，你应该能够：

- 解释请求从 HandlerMapping 到 Controller 参数就绪的完整过程。
- 区分 `@PathVariable`、`@RequestParam`、`@RequestHeader`、`@RequestBody` 和 `@ModelAttribute`。
- 理解字符串输入如何转换为数字、枚举与 `LocalDate`。
- 区分绑定失败、类型转换失败、JSON 读取失败和约束校验失败。
- 使用 Jakarta Validation 为请求 record 声明字段和容器元素约束。
- 理解 `@Valid` 是级联触发标记，不是约束本身。
- 区分 `MethodArgumentNotValidException` 与 `HandlerMethodValidationException`。
- 在 Spring Framework 6.1+ 使用 MVC 内建 method validation，而不在 Controller 类上滥加 `@Validated`。
- 使用 `ProblemDetail`、稳定错误码和字段 violation 建立统一错误协议。
- 使用 `@WebMvcTest` 和 MockMvc 验证路由、转换、校验、异常处理与 JSON。
- 区分普通单元测试、MVC slice test 和真实服务器端到端测试。
- 设计不依赖执行顺序的测试。

## 2. 为什么需要统一的 HTTP 输入边界

浏览器地址栏、前端表单和其他服务发送的内容，进入服务器时本质上都是不可信的协议数据。Controller 方法看起来已经拿到了 `long`、枚举、日期或 DTO，但网络上实际传来的是 URI 字符串、Header 字节和 JSON 字节。

若每个 Controller 手工读取请求、解析数字、反序列化 JSON、检查字段并拼错误响应，会造成：

```text
同一种输入在不同端点重复解析
  → 转换与校验规则逐渐不一致
  → 框架调用方法前的失败没有统一处理
  → 前端收到不稳定的状态码与错误结构
  → 重构时很难用自动化测试守住协议
```

Spring MVC 的价值不是省掉几个注解，而是建立一条统一边界：先根据参数声明选择数据来源，再转换、绑定和校验；成功后才调用业务方法，失败则进入异常解析链。理解这条执行顺序，才能解释为什么某些断点没有进入 Controller、为什么不同失败产生不同异常，以及统一错误响应应该放在哪一层。

### 本课示例能力

本课构建课程 API：

```text
GET  /api/lessons
GET  /api/lessons/{id}
POST /api/lessons
```

查询端点支持：

- `page`、`size` 分页参数。
- `level` 枚举筛选。
- `publishedAfter` ISO 日期筛选。
- `X-Client-Version` 请求头。

创建端点支持 JSON 请求体、嵌套集合元素校验、201 与 Location。所有预期错误都输出 `application/problem+json`。

## 3. 完整项目结构

```text
spring-boot-mvc-validation/
├── pom.xml
└── src/
    ├── main/
    │   ├── java/learning/backend/mvc/
    │   │   ├── MvcValidationApplication.java
    │   │   ├── lesson/
    │   │   │   ├── CreateLessonRequest.java
    │   │   │   ├── LessonController.java
    │   │   │   ├── LessonService.java
    │   │   │   ├── LessonView.java
    │   │   │   ├── LessonPage.java
    │   │   │   └── ...
    │   │   └── web/ApiExceptionHandler.java
    │   └── resources/application.yaml
    └── test/java/.../LessonControllerTest.java
```

## 4. Maven 依赖

<<< ../../../examples/java/spring-boot-mvc-validation/pom.xml{xml:line-numbers} [pom.xml]

Boot 4 采用更细的 starter：

- `spring-boot-starter-webmvc`：Servlet MVC 与嵌入式服务器。
- `spring-boot-starter-validation`：Jakarta Validation API、实现与 Boot 自动配置。
- `spring-boot-starter-webmvc-test`：Boot 4 的 Web MVC 测试 starter，仅 test scope。

不要把测试 starter 放入运行依赖。它包含 Spring Test、JUnit、AssertJ、JSON 测试和 MVC 测试支持，不应进入生产制品。

## 5. 应用入口与配置

<<< ../../../examples/java/spring-boot-mvc-validation/src/main/java/learning/backend/mvc/MvcValidationApplication.java{java:line-numbers} [MvcValidationApplication.java]

<<< ../../../examples/java/spring-boot-mvc-validation/src/main/resources/application.yaml{yaml:line-numbers} [application.yaml]

主类仍位于根包，Controller、Service 和 Advice 都能被组件扫描。配置只保留应用名和默认端口，课程重点放在 MVC 输入边界。

## 6. MVC 参数解析链

HTTP 请求到达后，简化流程是：

```text
Tomcat
  → Filter chain
  → DispatcherServlet
  → HandlerMapping 选择 Controller method
  → HandlerAdapter
      → 为每个参数选择 HandlerMethodArgumentResolver
      → 读取 path/query/header/body
      → ConversionService / HttpMessageConverter
      → DataBinder 与 Validator
  → 调用 Controller
  → 返回值处理与 JSON 序列化
```

Controller 方法不是直接接收原始 socket 字节。参数解析、转换与校验可能在方法执行前失败，因此异常处理必须覆盖这些框架阶段。

## 7. Controller 完整代码

<<< ../../../examples/java/spring-boot-mvc-validation/src/main/java/learning/backend/mvc/lesson/LessonController.java{java:line-numbers} [LessonController.java]

Controller 只做协议适配：

1. 声明输入来源和约束。
2. 调用 Service。
3. 选择 HTTP status、Location 和 body。

它不负责保存数据，也不把 BindingResult 细节传入业务层。

## 8. `@PathVariable`

```java
@GetMapping("/{id}")
LessonView findById(@PathVariable @Positive long id)
```

`id` 来自 URI template：

```http
GET /api/lessons/2
```

处理分三层：

1. 路径 pattern 匹配。
2. 字符串 `"2"` 转换为 long。
3. `@Positive` 验证数值大于 0。

`/api/lessons/abc` 是类型转换失败；`/api/lessons/-1` 是约束失败；`/api/lessons/999` 则是合法 ID 对应的业务资源不存在。三者不能混成同一种错误。

## 9. `@RequestParam`

```java
@RequestParam(defaultValue = "0") int page
```

查询参数适合筛选、分页、排序和可选控制项：

```http
GET /api/lessons?page=0&size=10&level=BEGINNER
```

`defaultValue` 同时意味着该参数不是 required。若不写默认值且 required=true，缺失会在方法调用前失败。

不要依赖编译器参数名推断来省略所有 annotation name。公开 API 的关键参数显式命名更利于重构和阅读。

## 10. 查询参数约束

```java
@Min(0) int page
@Min(1) @Max(50) int size
```

这些 constraint 直接位于 Controller 方法参数上，会触发 Spring MVC 内建 method validation。失败异常是：

```text
HandlerMethodValidationException
```

它与 `@Valid @RequestBody` 的对象级校验路径不同，统一异常处理必须同时支持。

## 11. 枚举转换

<<< ../../../examples/java/spring-boot-mvc-validation/src/main/java/learning/backend/mvc/lesson/LessonLevel.java{java:line-numbers} [LessonLevel.java]

请求：

```http
GET /api/lessons?level=INTERMEDIATE
```

默认枚举转换区分大小写。`intermediate` 通常不会自动变成 `INTERMEDIATE`，会产生类型转换错误。

如果产品契约要求小写值，应明确实现 `Converter<String, LessonLevel>` 或自定义 wire model，不要偷偷依赖 `toUpperCase()` 和默认 locale。

## 12. 日期转换与格式

```java
@DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
LocalDate publishedAfter
```

接受：

```text
2026-07-10
```

不接受模糊的 `07/10/26`。API 日期格式应稳定、无 locale 歧义。`LocalDate` 不包含时区和时刻；若表达真实时间点，应使用 `Instant` 或带 offset 的类型，并明确序列化规则。

## 13. `@RequestHeader`

```java
@RequestHeader(name = "X-Client-Version", defaultValue = "unknown")
String clientVersion
```

Header 适合元数据，例如认证、追踪、条件请求、内容协商和客户端版本，不应承载大型业务对象。

HTTP header 名大小写不敏感，但应用应使用稳定规范名称。敏感 header 不应直接记录到日志。

## 14. `@RequestBody`

```java
@Valid @RequestBody CreateLessonRequest request
```

`@RequestBody` 让 HttpMessageConverter 根据 Content-Type 读取请求。JSON 由 Jackson 反序列化为 record。

常见失败：

- JSON 语法无效。
- 字段类型不兼容。
- 枚举不存在。
- 请求体为空但 required=true。

这些通常产生 `HttpMessageNotReadableException`，发生在 Jakarta Validation 之前。

## 15. 表单与 JSON 不要混淆

JSON API：

```http
Content-Type: application/json
```

使用 `@RequestBody`。

HTML form 或 URL encoded data：

```http
Content-Type: application/x-www-form-urlencoded
```

通常使用 `@RequestParam` 或 `@ModelAttribute`。Servlet 参数解析可能提前消费 form body，官方不建议把 form data 当普通 `@RequestBody` 读取。

## 16. 请求 DTO

<<< ../../../examples/java/spring-boot-mvc-validation/src/main/java/learning/backend/mvc/lesson/CreateLessonRequest.java{java:line-numbers} [CreateLessonRequest.java]

DTO 同时定义输入结构和声明式约束：

- `@NotBlank`：不为 null、空串或纯空白。
- `@Pattern`：slug wire format。
- `@Size`：字符串或集合大小。
- `@NotNull`：枚举必须提供。
- `@Min` / `@Max`：时长边界。
- `@NotEmpty`：topics 不能为 null 或空集合。

校验是输入契约，不是数据库 schema 的替代品。数据库仍需 NOT NULL、UNIQUE、CHECK 等最终约束。

## 17. 容器元素校验

```java
List<@NotBlank String> topics
```

`@NotEmpty` 约束集合本身；类型参数上的 `@NotBlank` 约束每个元素。

只写：

```java
@NotEmpty List<String> topics
```

仍可能接受 `[""]`。容器和元素是两个不同校验层次。

## 18. primitive 的缺失语义

`durationMinutes` 使用 `int`。JSON 缺失时 Jackson 可能给 primitive 默认值 0，再由 `@Min(5)` 拒绝。

若必须区分“未提供”与“明确提供 0”，应改用 `Integer` 并组合：

```java
@NotNull @Min(5) Integer durationMinutes
```

API 类型选择会影响缺失值语义，不能只从 Java 内存开销考虑。

## 19. `@Valid` 是什么

`@Valid` 本身不是 constraint，不表达“值必须有效”的具体规则。它告诉 validation 引擎进入对象并检查其声明的 constraint，且可级联到嵌套对象。

因此只有：

```java
@Valid @RequestBody CreateLessonRequest request
```

且 DTO 具备 `@NotBlank` 等 constraint 时，才产生字段错误。

## 20. `@Valid` 与 `@Validated`

`@Validated` 是 Spring 提供的扩展，可指定 validation groups。对于简单请求体，`@Valid` 足够。

Spring Framework 6.1+ 的 Controller method validation 已由 MVC 原生支持。官方明确建议：若要使用这条内建路径，移除 Controller 类级别 `@Validated`；否则会走 AOP method validation，异常类型与处理链不同。

本课 Controller 没有类级别 `@Validated`。

## 21. 两种主要校验异常

### `MethodArgumentNotValidException`

典型来源：

```java
@Valid @RequestBody CreateLessonRequest request
```

它围绕一个绑定对象，包含 BindingResult、FieldError 与 ObjectError。

### `HandlerMethodValidationException`

典型来源：

```java
@Min(0) int page
@Positive long id
```

它围绕整个 handler method 的参数验证结果，可能包含多个方法参数及容器元素错误。

应用应处理两者，而不是测试一个 400 就假设所有输入错误结构一致。

## 22. BindingResult 应放在哪里

Controller 可在已校验参数后紧跟：

```java
create(@Valid @RequestBody Request request, BindingResult result)
```

这样方法可自行处理该对象错误。但统一 JSON API 更适合让异常进入全局 Advice，避免每个端点重复判断。

如果 BindingResult 没有紧跟对应参数，Spring 不会将其视为该对象的错误接收器。

## 23. 响应 DTO

<<< ../../../examples/java/spring-boot-mvc-validation/src/main/java/learning/backend/mvc/lesson/LessonView.java{java:line-numbers} [LessonView.java]

<<< ../../../examples/java/spring-boot-mvc-validation/src/main/java/learning/backend/mvc/lesson/LessonPage.java{java:line-numbers} [LessonPage.java]

响应 DTO 与创建 DTO 分开：服务端增加 ID、发布日期；客户端不能控制这些字段。

`List.copyOf` 防止外部修改 DTO 内集合。分页 wrapper 提供 page、size、totalElements 和 items，后续可增加 totalPages、links，而不改变 items 的含义。

## 24. Service 与演示存储

<<< ../../../examples/java/spring-boot-mvc-validation/src/main/java/learning/backend/mvc/lesson/LessonService.java{java:line-numbers} [LessonService.java]

Service 使用 ConcurrentMap 和 AtomicLong 支持并发请求。它演示：

- 过滤与稳定排序。
- 分页边界。
- not found。
- slug 冲突。
- 创建服务端字段。

但 `stream().anyMatch` 再 put 不是跨线程原子唯一约束。真实系统应依赖数据库 UNIQUE 并将冲突转换为 409。本课明确保留这一限制，避免把内存 demo 当生产存储。

## 25. 统一错误处理

<<< ../../../examples/java/spring-boot-mvc-validation/src/main/java/learning/backend/mvc/web/ApiExceptionHandler.java{java:line-numbers} [ApiExceptionHandler.java]

Advice 覆盖：

| 异常 | 状态 | code |
| --- | --- | --- |
| `MethodArgumentNotValidException` | 400 | `validation_failed` |
| `HandlerMethodValidationException` | 400 | `constraint_violation` |
| type mismatch / unreadable JSON | 400 | `invalid_input` |
| `LessonNotFoundException` | 404 | `lesson_not_found` |
| `LessonConflictException` | 409 | `lesson_conflict` |

## 26. Violation 结构

每个字段错误输出：

```json
{
  "field": "durationMinutes",
  "message": "durationMinutes 不能小于 5",
  "rejectedValue": 1
}
```

客户端可以把 field 映射到表单控件，用 message 展示当前语言说明。

生产系统应谨慎返回 rejectedValue：密码、token、身份证号和大型 payload 不应回显。本课字段不敏感；通用框架应增加脱敏策略。

## 27. ProblemDetail

完整错误示例：

```json
{
  "type": "https://example.invalid/problems/validation_failed",
  "title": "Bad Request",
  "status": 400,
  "detail": "请求体校验失败",
  "instance": "/api/lessons",
  "code": "validation_failed",
  "timestamp": "2026-07-14T...Z",
  "violations": []
}
```

`type` 在真实项目应使用受控文档域名。`code` 是应用稳定机器码；自然语言 message 可以国际化，不应作为客户端分支条件。

## 28. 类型转换错误不要泄露内部信息

枚举错误的底层异常可能包含 Java 类名、转换器和原始异常链。客户端只需要：

```text
参数 level 的格式或取值不正确
```

服务端日志可保留详细根因并关联 request/trace ID。统一 Advice 是协议输出，不是替代日志和可观测性。

## 29. 创建成功

合法请求：

```bash
curl -i \
  -H 'Content-Type: application/json' \
  -d '{
    "slug":"mvc-testing",
    "title":"MVC 测试",
    "level":"INTERMEDIATE",
    "durationMinutes":60,
    "topics":["MockMvc","JSON"]
  }' \
  http://127.0.0.1:18082/api/lessons
```

响应关键部分：

```http
HTTP/1.1 201
Location: /api/lessons/3
Content-Type: application/json
```

## 30. 非法请求体

```bash
curl -i \
  -H 'Content-Type: application/json' \
  -d '{"slug":"Bad Slug","title":"","level":null,
       "durationMinutes":1,"topics":[""]}' \
  http://127.0.0.1:18082/api/lessons
```

多个约束可同时失败。不要假设 violations 固定顺序；规范只应保证每个 violation 的字段和语义。

## 31. 分页安全

本课限制 size 在 1 到 50。若不限制，客户端可请求极大列表导致：

- 数据库/内存压力。
- 序列化 CPU 和响应体膨胀。
- 网络与网关超时。

分页约束是资源保护，不只是 UI 便利。数据库课程会继续讨论 offset 与 cursor pagination。

## 32. 普通单元测试的边界

你可以直接：

```java
new LessonController(service).findById(1);
```

它能快速验证 Java 分支，但不会验证：

- URL mapping。
- 参数解析和类型转换。
- Jackson JSON。
- Jakarta Validation。
- ControllerAdvice。
- status、header、media type。

因此 Controller 的主要协议应至少有 MVC test。

## 33. MockMvc 是什么

MockMvc 通过 DispatcherServlet 和 mock Servlet API 执行完整 Spring MVC 请求处理，但不绑定真实 TCP 端口。

它覆盖 MVC 基础设施，速度通常比启动真实服务器快；但不验证真实容器 connector、网络、TLS、反向代理和部署配置。

官方还提供 AssertJ 风格的 `MockMvcTester`。本课使用经典 MockMvc matcher，因为请求、执行和断言步骤更容易逐层观察。

## 34. `@WebMvcTest`

<<< ../../../examples/java/spring-boot-mvc-validation/src/test/java/learning/backend/mvc/lesson/LessonControllerTest.java{java:line-numbers} [LessonControllerTest.java]

Boot 4 annotation 包：

```java
org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest
```

它聚焦 MVC 组件，不加载完整业务应用。Controller 依赖的 Service 和 Advice 通过：

```java
@Import({LessonService.class, ApiExceptionHandler.class})
```

明确加入。

复杂系统通常用 mock/stub 替代 Service；本课 Service 是无外部依赖的内存实现，直接导入能测试完整输入/业务错误映射而不引入 Mockito 行为设置。

## 35. 测试 JSON 请求

```java
mockMvc.perform(post("/api/lessons")
        .contentType(MediaType.APPLICATION_JSON)
        .content("""..."""))
```

必须设置 Content-Type，否则请求可能在 media type 协商阶段失败，根本不会进入 JSON converter。

`jsonPath("$.code")` 验证协议字段；不要只断言 400，因为错误 handler 可能返回了错误的 code 或结构。

## 36. 测试 201 与 Location

```java
.andExpect(status().isCreated())
.andExpect(header().string("Location", "/api/lessons/3"))
.andExpect(jsonPath("$.slug").value("mvc-testing"));
```

状态、header、body 都是 API 契约。只验证 body 会漏掉 200/201 错误，前端和缓存层可能据此产生不同逻辑。

## 37. 测试 method validation

```java
get("/api/lessons").queryParam("page", "-1")
```

期望：

```text
400
code = constraint_violation
violations[0].field = page
```

这条测试证明 MVC 原生 method validation 和 Advice 的 `HandlerMethodValidationException` 分支确实生效。

## 38. 测试不能依赖执行顺序

JUnit 默认不保证业务所想的顺序。一个创建测试会改变共享 Spring Context 内的内存 Service。

本课查询测试使用不会被创建测试影响的 BEGINNER 筛选。更一般的解决方式：

- 每个测试准备并清理数据。
- 数据库测试使用事务回滚。
- 使用不可变 stub。
- 必要时重建 Context，但要接受性能成本。

不要通过 `@TestMethodOrder` 掩盖数据污染。

## 39. Slice test 与完整 Context

### `@WebMvcTest`

- 只加载 MVC slice。
- 快、定位清晰。
- 外部协作者需 mock/import。
- 不验证完整自动配置组合。

### `@SpringBootTest` + MockMvc

- 加载完整 ApplicationContext。
- 可验证更多 Bean 和自动配置协作。
- 更慢，失败范围更大。
- 仍可不启真实 server。

### `@SpringBootTest(webEnvironment = RANDOM_PORT)`

- 启动真实嵌入式 server。
- 通过网络客户端访问随机端口。
- 最接近运行时，但成本最高。

测试金字塔通常组合三者，而不是只选择一种。

## 40. 测试什么，不测试什么

MVC slice 应重点验证：

- mapping 和 HTTP method。
- path/query/header/body 绑定。
- conversion、validation。
- status、headers、media type、JSON shape。
- Advice 错误协议。

Service 复杂规则应由快速单元测试覆盖；数据库映射应由 data slice/integration test 覆盖；真实部署、网关、TLS 应由更高层测试覆盖。

## 41. 与 Express/TypeScript 对照

| Spring MVC | Express/TypeScript 常见做法 | 关键差异 |
| --- | --- | --- |
| `@RequestParam int` | `req.query` + 手动 parse | Spring 先转换到声明类型 |
| `@RequestBody record` | JSON body + interface/schema | TS interface 运行时消失，仍需 schema validator |
| Jakarta constraint | Zod/Joi/class-validator schema | constraint 由 Java runtime provider执行 |
| ControllerAdvice | error middleware | Spring 按异常类型和 MVC resolver 链选择 |
| MockMvc | supertest-like request testing | MockMvc 不绑定真实 TCP 端口 |
| `HandlerMethodValidationException` | middleware validation error | Spring 区分方法参数与对象绑定链 |

Java 的静态类型不能替代不可信输入校验；TypeScript 类型同样不能校验网络 JSON。两边都需要运行时边界验证。

## 42. 常见错误

- 把所有输入都声明成 String，再在业务层手动 parse。
- 把 path ID、query filter 和 JSON body 混为一种 DTO。
- 只加 `@Valid`，DTO 上没有 constraint。
- 只校验 List 非空，不校验元素。
- primitive 字段无法区分缺失与 0，却假设 `@NotNull` 有效。
- Controller 类加 `@Validated`，又期望 MVC 6.1+ 原生异常类型。
- 只处理 `MethodArgumentNotValidException`。
- 所有输入问题都返回 500 或同一模糊字符串。
- 返回 rejected password/token。
- 只测试 Controller Java 方法，不测试 MVC mapping。
- 只断言 status，不断言 code、header 和 JSON。
- 测试共享可变状态并依赖执行顺序。
- 用 MockMvc 成功推断真实 TLS/网关部署一定正确。

## 43. 排查顺序

1. 确认请求 method、path 和 Content-Type。
2. 确认失败发生在 mapping、argument resolver、conversion、JSON、validation 还是 Service。
3. 查看 resolved exception 的精确类型。
4. JSON 失败先检查语法、枚举和字段类型，再检查 constraint。
5. query/path 失败区分 type mismatch 与 constraint violation。
6. Advice 未生效时检查它是否进入 component scan / `@WebMvcTest` slice。
7. violation field 为 null 时检查参数编译元数据和 MethodParameter。
8. 测试偶发失败时检查共享状态、时间、locale、timezone 和执行顺序。
9. MockMvc 通过而运行失败时补真实 server integration test。

## 44. 运行与验证

```bash
cd examples/java/spring-boot-mvc-validation
mvn -ntp clean package
```

本课验证结果：

```text
main sources: 10
test sources: 1
tests: 5
failures: 0
errors: 0
Java target: 17
Spring Boot: 4.1.0
Spring Framework: 7.0.8
```

构建同时生成可执行 JAR：

```bash
java -jar target/spring-boot-mvc-validation-1.0.0-SNAPSHOT.jar \
  --server.port=18082
```

## 45. 本节总结

- Spring MVC 在调用 Controller 前完成来源解析、转换、绑定和校验。
- path、query、header、body 和 model attribute 表达不同协议语义。
- 类型转换失败与约束失败是不同阶段。
- `@Valid @RequestBody` 通常产生 `MethodArgumentNotValidException`。
- 方法参数 constraint 产生 `HandlerMethodValidationException`。
- Spring Framework 6.1+ Controller 原生 method validation 不需要类级别 `@Validated`。
- 请求 DTO 应声明字段、集合和容器元素约束。
- ProblemDetail、稳定 code 和 violations 共同构成可消费错误协议。
- MockMvc 经 DispatcherServlet 验证 MVC 协议，但不启动真实网络服务器。
- `@WebMvcTest` 是聚焦 slice；完整 Context 和随机端口测试用于更高集成层。
- 测试必须隔离可变状态，不能依赖执行顺序。

下一节：[Spring Boot 配置分层、Profiles、日志、Actuator 与可观测性基础](/backend/spring-boot/config-profiles-logging-actuator-and-observability)。

## 46. 参考资料

- [Spring Framework：Annotated Controller Method Arguments](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-methods/arguments.html)
- [Spring Framework：RequestBody](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-methods/requestbody.html)
- [Spring Framework：Spring MVC Validation](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-validation.html)
- [Spring Framework：Java Bean Validation](https://docs.spring.io/spring-framework/reference/core/validation/beanvalidation.html)
- [Spring Framework：MockMvc](https://docs.spring.io/spring-framework/reference/testing/mockmvc.html)
- [Spring Framework：MockMvc Overview](https://docs.spring.io/spring-framework/reference/testing/mockmvc/overview.html)
- [Spring Boot：Testing Spring Applications](https://docs.spring.io/spring-boot/reference/testing/spring-applications.html)
- [Spring Boot 4.1 API：WebMvcTest](https://docs.spring.io/spring-boot/api/java/org/springframework/boot/webmvc/test/autoconfigure/WebMvcTest.html)
