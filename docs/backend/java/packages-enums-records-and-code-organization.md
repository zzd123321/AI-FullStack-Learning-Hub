---
title: Java 包、枚举、记录类与代码组织
description: 使用命名包组织类型，以枚举表达有限状态，并用记录类建立值对象
outline: deep
---

# Java 包、枚举、记录类与代码组织

> 适用环境：JDK 25 LTS。本节只使用 JDK 17、21 和 25 都稳定支持的语法，不使用 JDK 25 的模块导入声明。

## 为什么这一课同时出现三个主题

上一课已经出现多个类和接口。如果继续把它们全部塞进一个文件或默认包，代码很快会出现重名、查找困难和边界不清。与此同时，一些业务数据并不适合普通可变类：课程级别只有固定几种，课程编号更像一个只表示值的小对象。

因此本课分别解决三个组织问题：

- **package**回答“这个类型属于哪一组”。
- **enum**回答“这个值只能从哪几个合法选项中选择”。
- **record**回答“怎样简洁表示主要由一组值定义的数据”。

它们不是彼此依赖的语法技巧，只是都会在把单文件示例整理成小型项目时出现。第一次学习优先掌握包名与目录的对应关系；枚举和记录类先理解适用场景，再记语法。

## 1. 学习目标

完成本节后，你应该能够：

- 使用 `package` 声明命名包，并让目录结构与包名对应。
- 区分全限定名、简单名、`import` 与类路径。
- 使用枚举表达有限且类型安全的业务状态。
- 为枚举添加字段、构造方法、实例方法和解析方法。
- 使用记录类建立透明值对象，并在紧凑构造方法中校验数据。
- 理解记录类的自动成员、浅不可变性和适用边界。
- 编译并运行包含多个包内类型的 Java 程序。

## 2. 为什么不能一直使用默认包

前几课为了聚焦语法，把类放在默认包中。真实项目会有大量同名类型，例如不同模块都可能存在 `User`、`Config` 或 `Result`。包提供分层命名空间：

```java
package learning.backend.catalog;
```

类的全限定名由包名和类名组成：

```text
learning.backend.catalog.CourseCatalogApp
```

包还参与访问控制、模块导出和框架扫描。默认包不适合可维护应用，也会给 Spring Boot 等框架的组件扫描带来不清晰的边界。

## 3. 编译单元的结构

普通 `.java` 编译单元通常按以下顺序组织：

```java
package learning.backend.catalog;

import java.util.Locale;

public record CourseId(String value) {
    // 类型声明
}
```

1. `package` 声明最多一个，并位于导入和类型声明之前。
2. `import` 声明只影响当前编译单元。
3. 随后是顶层类、接口、枚举或记录类声明。

一个源文件通常只声明一个 `public` 顶层类型，文件名与类型名一致。虽然 Java 允许附带非公开顶层类型，但独立文件通常更容易定位和维护。

## 4. 包名与目录结构

示例使用：

```text
examples/java/language-organization/
└── src/
    └── learning/backend/catalog/
        ├── CourseCatalogApp.java
        ├── CourseId.java
        ├── CourseLevel.java
        └── CourseSummary.java
```

包名中的点对应源码目录层级。`learning.backend.catalog.CourseId` 位于 `learning/backend/catalog/CourseId.java`。

生产项目常使用组织拥有的域名倒序作为前缀，例如拥有 `example.com` 的组织可能使用 `com.example.catalog`。本地课程示例使用中性的 `learning.backend.catalog`，不要假装拥有并不属于你的域名。

包名惯例是全小写，避免与类名混淆。包名看起来有层级，但 `learning.backend` 和 `learning.backend.catalog` 是不同包，子包不会自动获得父包的包访问权限。

## 5. `import` 只是名称简写

如果另一个包的类型是公开且可访问的，可以使用全限定名：

```java
java.util.Locale locale = java.util.Locale.ROOT;
```

导入后可使用简单名：

```java
import java.util.Locale;

Locale locale = Locale.ROOT;
```

`import` 不会下载依赖、复制类或让类型进入运行时。依赖是否存在由编译类路径或模块路径决定；导入只是让当前文件能用短名称引用已有类型。

`java.lang` 中的公开类型会被隐式导入，所以 `String`、`Integer` 和 `System` 不需要显式导入。同包类型也不需要导入。

### 避免通配符误解

```java
import java.util.*;
```

它按需引入 `java.util` 中可访问的顶层类型，不会递归导入 `java.util.concurrent` 子包。显式单类型导入更容易看出依赖来源，团队应遵循统一格式化规则。

静态导入可简写静态成员，但过量使用会隐藏来源：

```java
import static java.lang.Math.max;
```

## 6. 包访问与公开类型

没有访问修饰符的顶层类型或成员具有包访问权限，只能从同包代码访问。`public` 顶层类型可以从其他包访问，但其公开 API 中涉及的其他类型也必须对调用方可访问。

包不是安全沙箱。它主要提供代码组织和语言级可见性；真正的服务安全仍需身份认证、授权、输入校验和部署隔离。

## 7. 枚举表达有限状态

课程级别只有三个合法值：

```java
public enum CourseLevel {
    BASIC,
    INTERMEDIATE,
    ADVANCED
}
```

相比字符串：

```java
String level = "advnaced"; // 拼写错误仍能存在
```

枚举把候选值限制在类型定义中。方法参数声明为 `CourseLevel` 后，调用方不能随意传入其他字符串。

枚举常用于订单状态、权限角色、任务类型等稳定有限集合。若候选值由管理员在数据库中动态配置，则不适合每次新增值都重新发布代码，应该使用普通实体或配置数据。

## 8. 枚举也是类

枚举可以有字段、构造方法和行为：

```java
public enum CourseLevel {
    BASIC("基础"),
    INTERMEDIATE("进阶"),
    ADVANCED("高级");

    private final String displayName;

    CourseLevel(String displayName) {
        this.displayName = displayName;
    }

    public String displayName() {
        return displayName;
    }
}
```

枚举常量后有字段或方法时，常量列表必须以分号结束。枚举构造方法不能由业务代码通过 `new` 调用；常量在类初始化过程中创建。

常用自动方法包括：

- `CourseLevel.values()`：按声明顺序返回所有常量组成的新数组。
- `CourseLevel.valueOf("BASIC")`：按常量名查找，找不到时抛出异常。
- `name()`：返回稳定常量名，例如 `"BASIC"`。
- `ordinal()`：返回声明位置，不应作为数据库持久化值，因为调整顺序会改变它。

外部输入应通过自己的解析方法转换，这样能统一大小写、错误信息和兼容别名。

## 9. 使用枚举的 `switch`

枚举与 `switch` 配合时，编译器可以检查所有常量：

```java
return switch (level) {
    case BASIC -> 45;
    case INTERMEDIATE -> 60;
    case ADVANCED -> 90;
};
```

没有 `default` 时，未来新增枚举常量会促使编译器提醒此处需要更新。若业务确实需要兜底，再明确添加 `default`，不要为了消除提示而放弃穷尽检查。

## 10. 记录类适合值对象

普通类若只承载数据，需要手写字段、构造方法、访问器、`equals`、`hashCode` 和 `toString`。记录类用组件列表声明同一组状态：

```java
public record CourseSummary(
        CourseId id,
        String title,
        CourseLevel level
) {
}
```

编译器会提供：

- 对应组件的私有 `final` 字段。
- 规范构造方法。
- 名为 `id()`、`title()`、`level()` 的访问器，而不是 `getId()`。
- 基于所有组件的 `equals` 与 `hashCode`。
- 包含类型名、组件名和值的 `toString`。

记录类隐式为 `final`，不能继承其他普通类，但可以实现接口。所有记录类都以 `java.lang.Record` 为直接父类。

## 11. 紧凑构造方法

记录类可以在紧凑构造方法中验证或规范化组件：

```java
public record CourseId(String value) {
    public CourseId {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("课程 ID 不能为空。");
        }

        value = value.trim().toUpperCase(Locale.ROOT);
    }
}
```

紧凑构造方法不重复参数列表。代码体结束后，规范化后的参数会赋给对应字段；不要在其中直接给最终字段重复赋值。

使用 `Locale.ROOT` 处理面向协议和标识符的大小写，避免服务器默认地区设置改变结果。面向用户的自然语言转换则可能需要明确用户语言环境。

## 12. 记录类不等于深度不可变

记录组件不能重新指向别的值，但组件引用的对象仍可能可变：

```java
record WeeklyPlan(int[] minutes) {
}
```

`minutes` 字段是最终引用，但调用方仍可修改数组元素。需要真正不可变时，应在构造和访问边界进行防御性复制，或使用不可变组件类型。

记录类适合透明数据载体和值对象，不适合需要隐藏内部表示、复杂可变生命周期或继承层级的实体。不要因为语法短就把所有类改成记录类。

## 13. JavaScript 与 TypeScript 对照

| 关注点 | Java | JavaScript / TypeScript |
| --- | --- | --- |
| 包与模块 | `package` 提供命名空间；类路径决定类型位置 | ES module 通过文件路径和 `import/export` 连接模块 |
| 导入 | 引用已有类型的简单名 | 会建立模块依赖并影响加载/打包 |
| 枚举 | 运行时存在的特殊类和固定实例 | JS 无原生 enum；TS enum/联合类型有不同生成行为 |
| 记录类 | 运行时类，自动生成值相等方法 | 普通对象默认仍按引用相等 |
| 访问器 | 记录组件使用 `component()` | 对象通常使用属性访问 `object.component` |

Java 包名不是文件系统模块导入语法，`import` 也不是 Node.js 的模块加载。Maven 依赖和 Java 模块系统会在后续课程分别学习。

## 14. 完整示例：课程目录值对象

示例包含一个应用入口、一个枚举和两个记录类。页面直接导入真实源码：

::: code-group

<<< ../../../examples/java/language-organization/src/learning/backend/catalog/CourseLevel.java{java:line-numbers} [CourseLevel.java]

<<< ../../../examples/java/language-organization/src/learning/backend/catalog/CourseId.java{java:line-numbers} [CourseId.java]

<<< ../../../examples/java/language-organization/src/learning/backend/catalog/CourseSummary.java{java:line-numbers} [CourseSummary.java]

<<< ../../../examples/java/language-organization/src/learning/backend/catalog/CourseCatalogApp.java{java:line-numbers} [CourseCatalogApp.java]

:::

从示例根目录显式列出源文件编译：

```bash
cd examples/java/language-organization
mkdir -p out
javac --release 17 -Xlint:all -d out \
  src/learning/backend/catalog/CourseLevel.java \
  src/learning/backend/catalog/CourseId.java \
  src/learning/backend/catalog/CourseSummary.java \
  src/learning/backend/catalog/CourseCatalogApp.java
```

Windows PowerShell 可以把四个源文件写在同一行。`-d out` 会按照包结构生成 `out/learning/backend/catalog/*.class`。

运行时使用全限定类名：

```bash
java -cp out learning.backend.catalog.CourseCatalogApp java-006 "包与记录类" intermediate
```

预期输出：

```text
课程 ID：JAVA-006
课程标题：包与记录类
课程级别：进阶
建议时长：60 分钟
相同值对象：true
记录内容：CourseSummary[id=CourseId[value=JAVA-006], title=包与记录类, level=INTERMEDIATE]
```

执行过程：

1. JVM 根据全限定名从 `out` 类路径定位入口类。
2. 应用把字符串级别解析成 `CourseLevel` 常量。
3. `CourseId` 的紧凑构造方法校验并统一 ID 大小写。
4. `CourseSummary` 校验三个组件，并根据枚举计算建议时长。
5. 两个独立创建但组件相同的记录对象通过自动生成的 `equals` 比较为相等。
6. 非法 ID、空标题或未知级别会写入标准错误并返回状态码 `2`。

## 15. 常见错误

- `package` 声明与目录结构不一致，导致编译器或类加载器找不到类型。
- 运行有包的入口时只写简单类名，而不是全限定名。
- 误以为 `import` 会安装依赖，或使用通配符递归导入子包。
- 把外部字符串长期留在业务模型中，而不是在边界转换为枚举。
- 把 `ordinal()` 保存到数据库，枚举调整顺序后产生数据错位。
- 认为记录组件引用的集合或数组会自动深度不可变。
- 用记录类表示需要隐藏状态和复杂可变行为的实体。

## 16. 本节总结

- 包建立类型命名空间，源码目录通常与点分包名一致。
- `import` 只提供名称简写；类路径或模块路径才决定编译和运行时能否找到类型。
- 枚举是有限、类型安全的类实例集合，可以包含字段和行为。
- 枚举 `switch` 能利用穷尽检查，持久化时优先使用稳定名称而非序号。
- 记录类自动提供组件字段、访问器和值语义方法，适合透明值对象。
- 紧凑构造方法用于校验和规范化组件，但记录类只保证浅层状态固定。

下一节：[Java 异常体系、错误传播与资源清理](/backend/java/exceptions-error-propagation-and-resource-cleanup)。

## 17. 参考资料

- [Java 语言规范 25：包与模块](https://docs.oracle.com/javase/specs/jls/se25/html/jls-7.html)
- [Java 语言规范 25：枚举类](https://docs.oracle.com/javase/specs/jls/se25/html/jls-8.html#jls-8.9)
- [Java 语言规范 25：记录类](https://docs.oracle.com/javase/specs/jls/se25/html/jls-8.html#jls-8.10)
- [Java SE 25：`Enum` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Enum.html)
- [Java SE 25：`Record` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Record.html)
- [Oracle：记录类](https://docs.oracle.com/en/java/javase/25/language/records.html)
