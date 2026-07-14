---
title: Java 继承、接口、多态与组合
description: 从替换变化的通知渠道理解子类型、继承、接口、动态分派、抽象类、组合与可替换性
outline: deep
---

# Java 继承、接口、多态与组合

> 适用环境：JDK 25 LTS；完整示例只使用 JDK 17、21 和 25 都稳定支持的语法。

## 1. 学习目标

完成本节后，你应该能够：

- 解释为什么业务代码需要依赖稳定抽象，而不是到处判断具体实现。
- 区分子类型、类继承、接口实现、代码复用和对象组合。
- 准确说明 `extends`、`implements`、`super`、`abstract`、`final` 与 `@Override`。
- 区分重写、重载和静态方法隐藏，理解它们分别在编译期还是运行期决定。
- 从“引用的编译时类型 + 对象的运行时类型”推导一次多态调用。
- 理解字段访问、静态方法和构造方法不使用实例方法的动态分派规则。
- 在接口、抽象类、具体类和组合之间做有理由的选择。
- 用可替换性检查继承关系，而不是只凭“代码长得相似”。
- 解释完整通知示例中校验模板、渠道实现和业务服务如何协作。

## 2. 为什么需要多态：变化不应扩散到所有调用方

假设学习站最初只发邮件：

```java
final class NotificationService {
    void notify(String recipient, String message) {
        EmailClient.send(recipient, message);
    }
}
```

后来增加短信、站内信和测试用假实现。如果每个调用方都写：

```java
if (type.equals("email")) {
    // 邮件逻辑
} else if (type.equals("sms")) {
    // 短信逻辑
}
```

渠道变化就会扩散到 Controller、定时任务和批处理。分支还会重复校验、错误处理和日志规则。

更稳定的设计是让调用方只依赖“通知渠道能做什么”：

```text
NotificationService
        │ 只依赖 send 契约
        ▼
NotificationChannel
        ▲
        ├── EmailChannel
        └── SmsChannel
```

新增渠道时主要新增一个实现；业务服务无需知道投递协议。这就是本课四个概念共同解决的问题：

- **接口**声明稳定能力边界。
- **子类型关系**允许具体实现出现在接口所需的位置。
- **动态分派**让同一次方法调用落到实际对象的实现。
- **组合**让业务对象持有并委托给可替换协作者。

继承只是建立这些关系的一种机制，不是面向对象设计的最终目标。

## 3. 先分清五个相邻概念

| 概念 | 准确含义 | 不等于什么 |
| --- | --- | --- |
| 子类型 | `S` 的值可在需要 `T` 的位置使用 | 仅仅方法名碰巧相同 |
| 类继承 | 子类用 `extends` 建立父类关系并继承允许继承的成员 | 自动获得父类构造方法 |
| 接口实现 | 类用 `implements` 明确承诺接口契约 | 复制接口代码 |
| 多态 | 同一父类型操作可作用于不同子类型对象 | 任意类型都能在运行时调用任意方法 |
| 组合 | 一个对象持有另一个对象并委托工作 | 父子类型关系 |

Java 是名义类型系统的一部分：一个类即使恰好有 `send(String, String)` 方法，也不会自动成为 `NotificationChannel`。它必须显式 `implements NotificationChannel`，或通过父类型继承这层关系。

这不同于 TypeScript 常见的结构化类型兼容：TypeScript 更关注形状是否匹配；Java 的类和接口关系由声明建立并进入编译期与运行时类型信息。

## 4. 类继承表达受约束的“是一种”

```java
class EmailChannel extends ValidatingChannel {
}
```

`EmailChannel` 是 `ValidatingChannel` 的直接子类。Java 类最多直接继承一个类；若没有显式 `extends`，普通类最终直接或间接继承 `Object`。

继承带来三类影响：

1. **类型关系**：`EmailChannel` 可向上转换为 `ValidatingChannel`。
2. **对象结构**：EmailChannel 对象也包含其父类部分的状态。
3. **成员行为**：子类继承符合访问与继承规则的成员，并可重写允许重写的实例方法。

“父类的 private 字段在子类对象里消失了”是误解。父类状态仍是对象的一部分，只是子类源码不能直接按字段名访问，通常要通过父类提供的方法维护其不变量。

## 5. 继承不等于复制父类源码

编译器不会把父类方法文本粘贴进子类。类文件保留父子关系；对象创建、成员查找和方法调用按语言与 JVM 规则工作。

因此父类实现变化可能影响所有子类，即使子类源码一行没改。这种强耦合正是继承需要谨慎的原因：子类依赖的不只是公开方法名，还可能依赖父类初始化顺序、protected 扩展点和行为约定。

## 6. 构造方法不被继承

父类构造方法负责初始化父类部分，子类构造方法负责完成子类初始化。对于本课使用的 JDK 17 兼容写法，构造子类对象时可先按下面的传统模型理解：

```text
为完整对象分配内存并得到默认值
  → 调用父类构造链
  → 执行当前类字段初始化与实例初始化块
  → 执行当前类构造方法主体
  → 返回完成初始化的对象引用
```

父类没有可用无参构造方法时，子类必须显式调用 `super(...)`，传入父类需要的参数。在 JDK 17 语法中，这个显式构造器调用必须是构造方法主体的第一条语句。

JDK 25 正式加入 Flexible Constructor Bodies，允许在 `super(...)` 或 `this(...)` 前执行受限制的安全语句，例如先校验参数；这个前置区叫 constructor prologue，不能随意读取正在构造的对象。本课示例为了兼容 JDK 17 不使用该语法。新特性改变了“`super` 必须写在第一行”的语法结论，但没有把构造方法变成可继承或可动态分派的普通方法。

构造方法不是普通实例方法：

- 不会被继承或重写。
- `new EmailChannel(...)` 在编译期就确定调用哪个构造方法。
- 返回类型不参与构造方法声明。

## 7. 不要在构造期间调用可重写方法

父类构造方法执行时，实际对象已经是子类对象，所以对可重写实例方法的调用仍可能动态分派到子类：

```java
abstract class Base {
    Base() {
        initialize(); // 危险
    }

    abstract void initialize();
}
```

此时子类字段初始化可能尚未执行，子类方法会看到 `null`、`0` 等默认值。因果链是：

```text
进入父类构造方法
  → 调用可重写方法
  → 动态分派到子类实现
  → 子类字段尚未完成初始化
  → 方法基于半初始化状态运行
```

构造期间应只调用 private、final 或不会依赖子类状态的安全逻辑；更复杂初始化交给工厂方法或对象构造完成后的显式步骤。

## 8. 重写：子类替换继承的实例方法行为

```java
@Override
protected void deliver(String recipient, String message) {
    System.out.printf("[邮件] 发送给 %s：%s%n", recipient, message);
}
```

重写的核心边界：

- 方法签名必须满足 override/subsignature 规则。
- 返回类型必须相同或协变，即返回更具体的引用类型。
- 可见性不能比父方法更窄。
- 受检异常不能比父方法声明得更宽。
- `final` 实例方法不能重写。
- private 方法不被子类重写；子类同名方法是新的声明。

`@Override` 不参与运行时分派，但能让编译器检查“你以为在重写”的方法是否真的重写。应当保留它。

## 9. 重写、重载和隐藏不是一回事

| 机制 | 发生位置 | 决定时机 | 选择依据 |
| --- | --- | --- | --- |
| 重写 overriding | 子类型重新实现实例方法 | 运行时 | 实际对象类型 |
| 重载 overloading | 同名、不同参数列表的方法 | 编译期 | 参数的编译时类型和适用性 |
| 隐藏 hiding | 子类声明同签名 static 方法 | 编译期 | 引用或类型名的编译时类型 |

示例：

```java
class Parent {
    static String kind() { return "parent"; }
    String name() { return "parent"; }
}

class Child extends Parent {
    static String kind() { return "child"; }

    @Override
    String name() { return "child"; }
}

Parent value = new Child();
System.out.println(value.kind()); // parent：static 方法按编译时类型选择
System.out.println(value.name()); // child：实例方法动态分派
```

不要用对象引用调用 static 方法；虽然语法可能允许，却会掩盖它不参与动态分派的事实。应写 `Parent.kind()`。

## 10. 字段访问也不使用动态分派

```java
class Parent {
    String label = "parent";
}

class Child extends Parent {
    String label = "child";
}

Parent value = new Child();
System.out.println(value.label); // parent
```

子类字段只是隐藏同名父类字段。字段由引用的编译时类型决定，不像重写实例方法那样按实际对象选择。

这也是封装状态并通过方法暴露行为的重要原因：多态的主要扩展点是实例方法，不是 public 字段。

## 11. 接口声明能力与协作契约

```java
interface NotificationChannel {
    String name();

    void send(String recipient, String message);
}
```

接口适合表达调用方真正需要的能力。类可以实现多个接口，因此没有共同业务父类的对象也能进入同一协作边界。

接口可以声明：

- 抽象实例方法。
- `default` 实例方法。
- `static` 工具方法。
- private 辅助方法。
- 常量字段；接口字段隐式是 `public static final`。

接口没有普通对象实例字段，不能像抽象类那样保存每个对象的可变状态。接口也不是“完全没有实现”：default、static 和 private 方法都可有方法体。

## 12. 接口契约不只是方法签名

`void send(String recipient, String message)` 只说明类型层面的输入输出，还不完整。真实契约还应说明：

- `recipient` 允许哪些格式，是否接受空白。
- 失败是抛异常、返回状态还是异步通知。
- 重复调用是否可能重复发送。
- 方法是否线程安全、是否阻塞。
- 成功返回代表“已提交”还是“对方已收到”。

如果不同实现对这些问题给出互相矛盾的答案，调用方仍无法安全替换它们。多态减少类型分支，但不会自动创造一致的业务语义。

## 13. 接口 default 方法的边界与冲突

default 方法允许接口演进时提供公共行为：

```java
interface NamedChannel {
    default String displayName() {
        return "通知渠道";
    }
}
```

它适合由接口其他公开操作推导出的通用行为，不适合偷偷引入实现需要的可变状态。

多个来源出现相同 default 方法时，规则不能靠猜：类中的具体方法优先于接口 default；更具体的子接口优先；若两个无关接口仍冲突，实现类必须显式重写并消除歧义。

## 14. 抽象类是部分实现，不是“更强的接口”

```java
abstract class ValidatingChannel implements NotificationChannel {
    @Override
    public final void send(String recipient, String message) {
        // 公共校验
        deliver(recipient.trim(), message.trim());
    }

    protected abstract void deliver(String recipient, String message);
}
```

抽象类不能直接实例化，但可拥有：

- 实例字段和构造方法。
- public/protected/package/private 方法。
- 已实现、抽象和 final 方法。
- 受控的初始化与共享不变量。

本课抽象类使用**模板方法**：公开 `send` 固定算法骨架，`deliver` 是子类扩展点。

```text
send(recipient, message)
  → 检查 recipient
  → 检查 message
  → trim
  → 动态调用 deliver
```

`send` 是 final，防止子类绕过公共校验；`deliver` 是 protected abstract，只向继承体系开放投递差异。

## 15. 接口、抽象类与具体类如何选择

| 问题 | 优先选择 |
| --- | --- |
| 无关类需要提供同一种能力 | 接口 |
| 调用方只应依赖小型稳定契约 | 接口 |
| 紧密相关实现共享状态、构造规则和模板流程 | 抽象类 |
| 类型不需要扩展、行为已经完整 | final 具体类 |
| 只是想复用几行辅助逻辑 | 普通协作者、静态纯函数或组合 |

接口和抽象类可以一起用，正如本课 `ValidatingChannel implements NotificationChannel`。接口服务于调用方边界，抽象类服务于一组实现之间的复用与约束。

## 16. 多态调用需要同时看两个类型

```java
NotificationChannel channel = new EmailChannel();
channel.send("user@example.com", "学习提醒");
```

这里有两个类型：

- **编译时类型**：变量声明的 `NotificationChannel`。
- **运行时类型**：实际对象的 `EmailChannel`。

调用分两阶段理解：

```text
编译期
  → NotificationChannel 是否声明可访问的 send？
  → 参数类型是否匹配？
  → 生成实例方法调用

运行期
  → value 实际引用哪个对象？
  → 从实际类寻找最具体的重写实现
  → 本例进入 ValidatingChannel.send
  → send 内调用 deliver，再分派到 EmailChannel.deliver
```

编译器不会因为对象“以后可能是 EmailChannel”就允许调用只存在于 EmailChannel 的任意方法。可调用成员先受变量编译时类型约束。

## 17. 向上转型为什么安全

```java
EmailChannel email = new EmailChannel();
NotificationChannel channel = email;
```

子类型承诺了父类型契约，所以向上转型通常隐式完成。转换后对象没有改变，也没有复制；只是新的引用以更抽象的视角访问同一个对象。

```text
email ───────┐
             ├──► 同一个 EmailChannel 对象
channel ─────┘
```

抽象视角会隐藏具体类型额外方法，这是有意的：调用方只看到它真正需要的契约，依赖面更小。

## 18. 向下转型为什么有风险

```java
NotificationChannel channel = chooseChannel();
EmailChannel email = (EmailChannel) channel;
```

编译器只能确认这种转换在类型层次上“可能成立”，运行时对象若实际是 SmsChannel，就抛 `ClassCastException`。

必须读取实现特有能力时，可先用模式匹配：

```java
if (channel instanceof EmailChannel email) {
    // 使用 email 的特有能力
}
```

但大量 `instanceof` 往往说明抽象边界缺少真正需要的操作，或调用方承担了本应由实现封装的分支。先检查设计，再决定是否转换。

## 19. 可替换性比“语法上能 extends”更重要

语法允许继承，不代表设计正确。若 `S` 是 `T` 的子类型，调用方在只知道 `T` 契约时使用 `S`，不应得到被破坏的基本承诺。

检查三个方向：

- 子类型不要要求比父类型更苛刻的输入前提。
- 子类型不要提供比父类型更弱的输出与状态保证。
- 子类型要维护父类型公开的不变量和失败语义。

例如父类型承诺 `send` 接受所有非空消息，某子类却只接受长度小于 10 且未在接口中表达，就会让原本合法的调用突然失败。解决方式可能是收紧统一契约、创建更准确的接口，或把渠道能力显式建模，而不是把差异藏在实现里。

## 20. 一个经典错误：用继承复用但破坏语义

如果 `FixedSizeHistory extends ArrayList<String>`，却把 `add` 改成容量满时静默丢弃旧值，它还能否在所有需要普通 `List` 的地方安全使用？

调用方可能依赖：

- `add` 成功后 size 增加。
- 已有元素不会因添加新元素而自动消失。
- List 的其他修改入口与 add 保持一致。

为了限制容量而继承 ArrayList，需要重写和协调大量入口，很容易漏掉。更可靠的是组合：内部持有一个 List，只公开受控的 history 操作。

“优先组合”来自这种契约分析，不是一句禁止继承的口号。

## 21. 组合通过委托隔离变化

```java
final class NotificationService {
    private final NotificationChannel channel;

    NotificationService(NotificationChannel channel) {
        this.channel = channel;
    }

    void notify(String recipient, String message) {
        channel.send(recipient, message);
    }
}
```

`NotificationService` 不是一种 Channel，它只是**拥有一个** Channel 并委托投递。

组合的执行链：

```text
组装阶段选择 EmailChannel
  → 构造 NotificationService(channel)
  → 业务代码调用 service.notify
  → service 委托 channel.send
  → 动态分派到所注入对象的实现
```

替换实现发生在对象组装处，而不是散落在业务方法里。这正是后续 Spring 构造器依赖注入的核心直觉。

## 22. 组合也有成本和边界

组合不会自动带来好设计：

- 接口过大时，实现和测试替身仍然沉重。
- 委托层过多会增加导航成本。
- 运行期随意替换有状态协作者可能引入线程安全问题。
- 如果两个对象生命周期和不变量天然是同一个概念，强行拆分也可能失去内聚。

原则不是“组合永远优于继承”，而是：对可替换协作者和变化方向优先组合；对稳定、真实的子类型关系和受控模板流程，继承仍然合适。

## 23. `final` 用来关闭不需要的扩展轴

`final` 可作用于不同位置：

- final 类不能被继承。
- final 实例方法不能被重写。
- final 变量只能赋值一次，但引用对象仍可能可变。

本课 `NotificationService` 是 final，因为它没有设计和记录子类扩展契约；`send` 是 final，因为公共校验不能被绕过；`deliver` 保持抽象，因为渠道投递正是预期扩展点。

不是所有类都必须 final，但允许继承意味着要维护更大的兼容面。没有明确扩展设计时，关闭继承通常更诚实。

## 24. 完整示例结构

页面从仓库导入真实可运行源码：

::: code-group

<<< ../../../examples/java/polymorphism/NotificationDemo.java{java:line-numbers} [NotificationDemo.java]

:::

示例中的职责：

| 类型 | 角色 | 为什么这样设计 |
| --- | --- | --- |
| `NotificationChannel` | 调用方契约 | 服务只需 name 与 send |
| `ValidatingChannel` | 抽象模板 | 集中校验并固定流程 |
| `EmailChannel` / `SmsChannel` | 具体实现 | 只处理渠道差异 |
| `NotificationService` | 组合者 | 持有接口并委托发送 |
| `NotificationDemo` | 组装与进程边界 | 解析参数、选择实现、决定退出码 |

## 25. 从命令行到具体实现的完整执行过程

运行：

```bash
cd examples/java/polymorphism
mkdir -p out
javac -Xlint:all -d out NotificationDemo.java
java -cp out NotificationDemo email user@example.com 学习提醒
```

执行链不是“接口自己发送邮件”，而是：

1. `main` 检查必须有三个参数。
2. switch 根据 `email` 创建 EmailChannel 对象。
3. 该对象以 NotificationChannel 引用保存，这是向上转型。
4. NotificationService 构造器检查引用非 null 并保存它。
5. `notify` 先通过接口动态调用 `name()`，得到“邮件”。
6. `notify` 调用 `channel.send(...)`。
7. 实际执行 ValidatingChannel 的 final `send`，完成公共校验和 trim。
8. `send` 调用抽象扩展点 `deliver`，动态分派到 EmailChannel。
9. EmailChannel 输出最终投递信息。

预期输出：

```text
使用渠道：邮件
[邮件] 发送给 user@example.com：学习提醒
```

注意有两次动态分派：`name` 直接进入具体渠道；`send` 先进入共享抽象类实现，然后其中的 `deliver` 再进入具体渠道。

## 26. 错误路径为什么由入口处理

```bash
java -cp out NotificationDemo push user-1 学习提醒
```

switch 抛出 `IllegalArgumentException`，main 捕获后写标准错误并以状态码 2 退出：

```text
错误：渠道必须是 email 或 sms。
```

同样，空白接收者会在 `ValidatingChannel.send` 失败。渠道实现不决定进程退出码，因为它只负责领域内的发送契约；main 是命令行进程边界，才负责把异常翻译成 stderr 和退出状态。

后续 Web 应用也采用相同分层：Service 抛有业务含义的异常，HTTP 边界把它翻译成状态码和错误响应。

## 27. 如何测试这种设计

NotificationService 依赖接口，因此测试无需真的发邮件：

```java
final class RecordingChannel implements NotificationChannel {
    String recipient;

    @Override
    public String name() {
        return "记录器";
    }

    @Override
    public void send(String recipient, String message) {
        this.recipient = recipient;
    }
}
```

测试替身也是一个正常实现，不需要修改 Service 的 private 状态。这里的价值不是“为了 mock 而创建接口”，而是业务本来就存在可替换渠道，测试恰好复用这条设计边界。

若一个类永远只有单一实现、没有跨层边界，也不要仅为形式统一机械创建接口。

## 28. JavaScript / TypeScript 对照

| Java | JavaScript / TypeScript |
| --- | --- |
| 类继承通过 `extends` 建立名义关系 | JS class 基于原型链 |
| `implements` 关系进入类文件和运行时类型关系 | TS interface 在生成 JS 后通常消失 |
| 重载选择主要是编译期规则 | JS 常在一个函数内检查参数 |
| 重写实例方法发生动态分派 | 原型方法查找也有动态行为 |
| 构造器注入接口常用于替换实现 | JS 常注入对象或函数 |

前端经验中把 API client、storage 或 analytics 对象作为参数传入，与 Java 组合和依赖注入很接近。关键差异是 Java 编译器会按声明类型限制调用，并要求类显式建立接口关系。

## 29. 常见错误与原因

- **为复用代码建立不成立的父子关系**：共享实现不代表满足同一行为契约。
- **把重载当成重写**：参数列表不同，运行时不会按实际对象选择你以为的版本。
- **遗漏 `@Override`**：签名写错后悄悄变成新方法。
- **重写时缩小可见性或扩大受检异常**：会破坏父类型调用方的契约。
- **通过字段期待多态**：字段按编译时类型访问。
- **通过 static 方法期待多态**：static 方法被隐藏，不被重写。
- **在父类构造器调用扩展点**：子类状态尚未完成初始化。
- **到处向下转型和 `instanceof`**：实现差异泄漏到调用方。
- **让抽象基类承担不相关职责**：子类被迫继承不需要的状态和方法。
- **接口过大**：实现类被迫提供无意义操作，调用方也依赖过多。

## 30. 设计判断顺序

遇到多个实现时，可以按以下顺序思考：

1. 调用方真正需要哪些最小操作和语义？
2. 多个实现能否遵守同一输入、输出和失败契约？
3. 若只需统一能力，先定义小接口。
4. 若紧密相关实现确实共享状态与模板流程，再考虑抽象类。
5. 业务服务通过构造器持有接口，用组合完成委托。
6. 检查新增实现是否无需修改核心调用方。
7. 检查是否出现向下转型、空实现或被迫抛 UnsupportedOperationException；它们可能说明抽象不准确。

## 31. 本节总结

- 多态的目标是让变化停留在实现和组装边界，不扩散到所有调用方。
- 子类型、类继承、接口实现、代码复用和组合是相关但不同的概念。
- Java 类单继承、可实现多个接口；接口声明能力，抽象类可共享状态与模板流程。
- 一次多态调用先由编译时类型检查可调用成员，再由运行时类型选择最具体的实例方法实现。
- 字段、static 方法和构造方法不按实例方法规则动态分派。
- `@Override` 让编译器验证重写意图；重载则在编译期选择。
- 向上转型只改变引用视角，不复制或改变对象；向下转型可能在运行时失败。
- 可替换性要求子类型维持父类型的行为契约，而不只是通过编译。
- 组合适合可替换协作者；继承适合真实稳定的子类型关系与受控模板流程。
- 构造期间调用可重写方法会让子类逻辑看到半初始化状态。

下一节：[Java 包、枚举、记录类与代码组织](/backend/java/packages-enums-records-and-code-organization)。

## 32. 参考资料

- [Java 语言规范 25：类声明](https://docs.oracle.com/javase/specs/jls/se25/html/jls-8.html)
- [Java 语言规范 25：父类与子类](https://docs.oracle.com/javase/specs/jls/se25/html/jls-8.html#jls-8.1.4)
- [Java 语言规范 25：方法重写、隐藏与重载](https://docs.oracle.com/javase/specs/jls/se25/html/jls-8.html#jls-8.4.8)
- [Java 语言规范 25：构造方法](https://docs.oracle.com/javase/specs/jls/se25/html/jls-8.html#jls-8.8)
- [Java 语言规范 25：接口](https://docs.oracle.com/javase/specs/jls/se25/html/jls-9.html)
- [Java 语言规范 25：方法调用表达式](https://docs.oracle.com/javase/specs/jls/se25/html/jls-15.html#jls-15.12)
- [OpenJDK JEP 513：Flexible Constructor Bodies](https://openjdk.org/jeps/513)
- [Oracle Java Tutorials：Polymorphism](https://docs.oracle.com/javase/tutorial/java/IandI/polymorphism.html)
