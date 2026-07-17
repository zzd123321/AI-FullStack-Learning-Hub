---
title: Java 类、对象、构造方法与封装
description: 使用类描述对象状态与行为，通过构造方法和访问控制维护合法状态
outline: deep
---

# Java 类、对象、构造方法与封装

> 适用环境：JDK 25 LTS。本节使用的语法兼容 JDK 17 和 21，不使用预览特性。

## 本课只增加一个核心想法

前三课的数据都保存在局部变量和数组中，方法完成后，这些局部变量也就离开了作用域。现在我们需要表示一个能持续存在、拥有自身状态并保护业务规则的“学习账户”。

可以先这样理解四个新词：

- **类**是对一类业务对象的共同说明。
- **对象**是程序运行时真正创建出来的一份数据和行为。
- **引用**是代码找到那个对象的方式，不是对象本身。
- **封装**是让状态只能通过合法入口发生变化，不是简单地把字段写成 `private`。

本课完整过程是：

```text
外部输入姓名和目标
  → 构造方法先校验
  → 校验成功才得到 LearningAccount 对象
  → recordStudySession 修改对象内部状态
  → 查询方法只暴露调用方需要的信息
```

第一次学习先掌握构造方法、实例字段、实例方法和 `private`。访问控制的全部组合、对象身份和 `equals` 可以第二遍再深入。

## 1. 学习目标

完成本节后，你应该能够：

- 区分类、对象、引用和实例成员。
- 使用 `new` 与构造方法创建合法对象。
- 理解字段、局部变量、`static` 成员和实例成员的生命周期差异。
- 使用 `this` 消除名称歧义并调用另一个构造方法。
- 使用 `public`、包访问、`protected` 和 `private` 控制可见性。
- 通过封装维护对象不变量，而不是机械地为字段生成 setter。
- 理解对象身份、`==`、`equals` 和 `toString` 的基本关系。
- 把输入解析与业务对象分开，并处理构造和状态修改失败。

## 2. 从过程代码到对象模型

上一节使用一组静态方法处理数组。这适合无状态计算，但真实后端业务通常需要把相关状态与行为放在一起。

学习账户包含：

- 学习者姓名。
- 每日目标分钟数。
- 已完成分钟数。
- 记录一次学习、计算剩余时间、判断是否达标等行为。

如果这些数据只是分散的变量，任何代码都可能把目标改成负数，或让姓名变成空白。类可以把数据和维护数据的规则放在同一边界内：

```java
LearningAccount account = new LearningAccount("小朱", 90);
account.recordStudySession(30);
```

调用方只表达业务动作，不需要知道对象内部怎样保存和校验数据。

## 3. 类与对象

**类（class）**定义一类对象拥有的字段和方法；**对象（object）**是运行时创建的类实例。

```java
public final class LearningAccount {
    private final String learnerName;
    private final int dailyTargetMinutes;
    private int completedMinutes;

    // 构造方法和实例方法
}
```

创建对象：

```java
LearningAccount first = new LearningAccount("小朱", 90);
LearningAccount second = new LearningAccount("小李", 60);
```

这里有两个不同对象，各自拥有独立的实例字段。`first` 和 `second` 是局部引用变量，保存指向对象的引用值。

不要把类简单理解为“对象模板文件”。类还定义类型边界、访问权限、构造规则和可执行行为，并参与继承与多态；后续课程会逐步展开。

## 4. `new` 创建对象时发生什么

表达式：

```java
new LearningAccount("小朱", 90)
```

可以先按以下过程理解：

1. JVM 为新的 `LearningAccount` 实例分配空间。
2. 实例字段先获得默认值，例如引用为 `null`、`int` 为 `0`。
3. 执行字段初始化器和构造过程。
4. 构造方法验证参数并为字段建立初始状态。
5. 表达式产生指向新对象的引用，赋给 `account`。

如果构造方法抛出异常，对象创建不会正常完成，调用方也拿不到这个对象引用。因此构造方法是维护对象合法状态的第一道边界。

对象不再被任何可达引用使用时，可能由垃圾收集器回收内存。Java 不要求开发者手动释放普通对象，但文件、网络连接和数据库连接等外部资源仍需显式关闭，后续 IO 课程会学习 `try-with-resources`。

## 5. 字段、局部变量与参数

三者都是变量，但作用域和生命周期不同：

| 变量种类 | 声明位置 | 生命周期 | 初始值规则 |
| --- | --- | --- | --- |
| 实例字段 | 类中、方法外 | 随对象存在 | 创建对象时有默认值 |
| `static` 字段 | 类中并带 `static` | 随类存在一份 | 类初始化时有默认值 |
| 局部变量 | 方法或代码块内 | 执行到所在作用域期间 | 读取前必须明确赋值 |
| 参数 | 方法或构造参数列表 | 本次调用期间 | 由调用实参初始化 |

示例中的：

```java
private final String learnerName;
private final int dailyTargetMinutes;
private int completedMinutes;
```

都是实例字段。每个学习账户对象都有自己的一份数据。

```java
private static final int MAX_DAILY_TARGET_MINUTES = 1_440;
```

这是类级常量，所有对象共享一份。常量名通常采用大写字母和下划线。

不要仅因为“不想创建对象”就把业务字段全部声明为 `static`。那会让所有用户共享同一份可变状态，产生严重的数据串扰。

## 6. 构造方法

构造方法与类同名，并且不声明返回类型：

```java
public LearningAccount(String learnerName, int dailyTargetMinutes) {
    this.learnerName = normalizeLearnerName(learnerName);
    this.dailyTargetMinutes = validateDailyTarget(dailyTargetMinutes);
    this.completedMinutes = 0;
}
```

即使写成 `void LearningAccount(...)`，它也只是名为 `LearningAccount` 的普通方法，不是构造方法。

### 默认构造方法不是永远存在

如果一个类完全没有声明构造方法，编译器会提供一个无参数默认构造方法。只要你声明了任意构造方法，编译器就不会再自动提供无参版本：

```java
LearningAccount account = new LearningAccount();
// 编译错误：示例类没有无参数构造方法
```

这正符合业务意图：学习账户创建时必须提供姓名和目标，不允许先创建一个缺少核心数据的半成品对象。

### 构造方法重载

同一个类可以有多个参数列表不同的构造方法：

```java
public LearningAccount(String learnerName, int dailyTargetMinutes) {
    this(learnerName, dailyTargetMinutes, 0);
}

public LearningAccount(
        String learnerName,
        int dailyTargetMinutes,
        int completedMinutes
) {
    // 完整初始化
}
```

两个参数版本把工作委托给三个参数版本，避免重复校验和赋值逻辑。

## 7. `this` 表示当前对象

实例方法执行时，`this` 指向接收这次调用的当前对象：

```java
this.learnerName = normalizeLearnerName(learnerName);
```

左侧 `this.learnerName` 是当前对象的字段，右侧 `learnerName` 是构造参数。没有 `this` 时，同名参数会遮蔽字段。

调用：

```java
first.recordStudySession(30);
second.recordStudySession(45);
```

第一次调用中的 `this` 是 `first` 指向的对象，第二次是 `second` 指向的对象。

`this(...)` 则表示调用当前类的另一个构造方法。它必须是该构造方法中的显式构造器调用，不能在普通实例方法中使用。示例用它把所有初始化集中到完整构造方法。

`static` 方法没有当前对象，因此不能直接使用 `this` 或访问实例字段。它只能通过某个对象引用调用实例行为。

## 8. 访问控制

Java 成员有四种访问级别：

| 修饰方式 | 当前类 | 同包 | 子类 | 任意位置 |
| --- | :---: | :---: | :---: | :---: |
| `private` | 是 | 否 | 否 | 否 |
| 无修饰符（包访问） | 是 | 是 | 同包子类 | 否 |
| `protected` | 是 | 是 | 是，但跨包有附加规则 | 否 |
| `public` | 是 | 是 | 是 | 是 |

入门阶段可以采用清晰的默认策略：

- 字段优先 `private`。
- 对外承诺的行为才设为 `public`。
- 只供类内部复用的辅助方法设为 `private`。
- 包访问适合包内部协作，使用前要明确包边界。
- `protected` 主要服务继承扩展，等继承课程再深入其跨包规则。

访问控制不仅是安全机制，也是 API 设计：公开成员一旦被其他代码依赖，修改成本会明显上升。

## 9. 封装与对象不变量

封装不是把字段设为 `private` 后自动生成所有 getter 和 setter。更重要的是：对象自己维护始终成立的业务规则，也就是**不变量**。

`LearningAccount` 维护这些规则：

- 姓名去除首尾空白后不能为空。
- 每日目标必须在 `1` 到 `1440` 分钟之间。
- 已完成分钟数不能为负数。
- 单次学习必须在 `1` 到 `720` 分钟之间。

类提供：

```java
account.recordStudySession(30);
```

而不是暴露：

```java
account.setCompletedMinutes(-999);
```

行为方法能表达业务意图并集中校验。没有 setter 并不意味着对象不可变；`completedMinutes` 仍会通过合法业务动作变化。

## 10. `final` 字段与对象可变性

```java
private final String learnerName;
private final int dailyTargetMinutes;
private int completedMinutes;
```

`final` 字段必须在对象构造完成前赋值，并且之后不能再次赋值。因此姓名和目标在当前模型中固定，完成分钟数可以增长。

如果 `final` 字段保存的是可变对象引用，`final` 只禁止引用改指向另一个对象，并不会自动冻结被引用对象：

```java
private final int[] dailyMinutes = new int[7];

// 不能让 dailyMinutes 指向另一个数组，
// 但 dailyMinutes[0] 仍然可以修改。
```

真正的不可变类还需要避免泄漏内部可变对象、禁止所有状态修改并正确处理构造参数副本。后续会单独学习不可变对象与记录类。

## 11. Getter、查询方法与行为方法

Getter 用于只读暴露必要状态：

```java
public int getCompletedMinutes() {
    return completedMinutes;
}
```

查询方法可以从状态计算更有业务含义的结果：

```java
public int getRemainingMinutes() {
    return Math.max(0, dailyTargetMinutes - completedMinutes);
}

public boolean hasReachedTarget() {
    return completedMinutes >= dailyTargetMinutes;
}
```

行为方法负责合法改变状态：

```java
public void recordStudySession(int minutes) {
    // 校验后累计
}
```

不要为了“JavaBean 风格”公开不必要的 setter。API 应让非法操作难以表达，而不是把所有内部数据都暴露给调用方随意修改。

## 12. 对象身份与相等性

两个内容相同的对象仍可能是不同实例：

```java
LearningAccount first = new LearningAccount("小朱", 90);
LearningAccount second = new LearningAccount("小朱", 90);

System.out.println(first == second); // false
```

引用类型使用 `==` 比较两个引用是否指向同一对象。业务内容相等通常通过 `equals` 表达，但普通类从 `Object` 继承的默认 `equals` 仍按身份判断，除非类自己重写。

是否重写 `equals` 和 `hashCode` 取决于对象语义：

- 用户 ID、订单号等实体通常按稳定身份判断。
- 金额、坐标等值对象通常按全部组成值判断。
- 一旦重写 `equals`，通常必须同时重写 `hashCode`，以满足哈希集合契约。

本课不为学习账户武断定义相等规则。后续值对象、记录类与集合课程会系统实现这组方法。

## 13. 重写 `toString`

所有普通类最终继承 `Object.toString()`。默认结果通常只包含类名和身份哈希信息，不利于调试。

示例重写：

```java
@Override
public String toString() {
    return "LearningAccount{"
            + "learnerName='" + learnerName + '\''
            + ", dailyTargetMinutes=" + dailyTargetMinutes
            + ", completedMinutes=" + completedMinutes
            + '}';
}
```

`@Override` 让编译器确认该方法确实覆盖父类方法。字符串拼接对象时会自动调用 `toString`：

```java
System.out.println("对象状态：" + account);
```

生产系统中不要把密码、令牌、身份证号等敏感字段写进 `toString`，否则日志可能泄露数据。

## 14. Java 与 JavaScript 类的对照

| 关注点 | Java | JavaScript |
| --- | --- | --- |
| 类型检查 | 类定义参与编译期静态类型检查 | 类是运行时语法，变量仍可引用不同类型值 |
| 实例字段 | 类型和成员在类中明确声明 | 对象属性更动态，可在运行时增加或删除 |
| 构造调用 | 通常使用 `new ClassName(...)` | 类也用 `new`，普通工厂函数还可返回对象 |
| 私有成员 | `private` 受 Java 访问控制规则约束 | `#field` 是语言级私有字段；普通属性默认公开 |
| 当前对象 | `this` 在实例方法中指向接收者，不能随意重新绑定 | `this` 取决于调用方式，普通函数中可能变化 |
| 相等性 | `==` 比较对象身份，内容语义由 `equals` 定义 | `===` 比较对象时也按引用身份 |

两种语言都使用 `class`、`new` 和 `this`，但不要因此假设对象模型完全相同。尤其是 Java 的字段类型、访问控制、方法重载和构造规则都由编译器严格检查。

## 15. 完整示例：封装学习账户

示例由两个文件组成。页面直接导入实际源码，文件名和行号会显示在代码组中：

::: code-group

<<< ../../../examples/java/classes-and-objects/LearningAccount.java{java:line-numbers} [LearningAccount.java]

<<< ../../../examples/java/classes-and-objects/LearningAccountDemo.java{java:line-numbers} [LearningAccountDemo.java]

:::

`LearningAccount` 只处理对象规则；`LearningAccountDemo` 负责命令行输入、展示和进程退出码。业务类不直接读取 `args`，也不因为用户输错就自行结束整个 JVM。

编译两个文件：

```bash
cd examples/java/classes-and-objects
mkdir -p out
javac -Xlint:all -d out LearningAccount.java LearningAccountDemo.java
```

运行：

```bash
java -cp out LearningAccountDemo 小朱 90 30 45 20
```

预期输出：

```text
学习者：小朱
每日目标：90 分钟
已完成：95 分钟
剩余：0 分钟
完成率：105.6%
是否达标：是
对象状态：LearningAccount{learnerName='小朱', dailyTargetMinutes=90, completedMinutes=95}
```

执行过程：

1. `LearningAccountDemo` 检查至少存在姓名与目标两个参数。
2. 入口把目标转换为 `int`，再调用构造方法创建账户。
3. 两参数构造方法通过 `this(...)` 委托给完整构造方法。
4. 完整构造方法规范化姓名、校验目标并建立合法初始状态。
5. 入口逐项解析学习时长，并调用 `recordStudySession`，而不是直接修改字段。
6. 查询方法计算剩余分钟、完成率和达标状态。
7. 输入或对象规则不合法时，入口捕获异常、写入标准错误并返回状态码 `2`。

错误示例：

```bash
java -cp out LearningAccountDemo 小朱 90 30 -5
```

预期错误：

```text
错误：单次学习分钟数必须在 1 到 720 之间。
用法：java LearningAccountDemo <姓名> <每日目标分钟数> [学习分钟数] ...
示例：java LearningAccountDemo 小朱 90 30 45 20
```

非法数据在 `LearningAccount` 内部被拒绝。即使未来入口从命令行换成 HTTP 控制器，对象规则仍然有效，控制器只需把异常转换成合适的 HTTP 响应。

## 16. 常见设计错误

### 创建后再逐个补字段

允许无参构造再调用多个 setter，会产生“对象已经存在，但必填字段还没准备好”的中间状态。核心必填数据优先通过构造方法一次提供。

### 只封装字段，不封装规则

`private` 字段配上无条件 setter 只是语法上的隐藏。把范围校验、状态转换和业务动作放回对象，才能真正维护不变量。

### 让业务对象结束进程

业务类不应调用 `System.exit`。它可以返回结果或抛出异常，由最外层入口决定命令行退出码、HTTP 状态码或消息消费结果。

### 在 `toString` 输出敏感信息

调试方便不能凌驾于数据安全。日志输出必须排除凭据和隐私字段。

### 把所有成员都声明为 `static`

`static` 可变字段由所有对象和请求共享，容易造成测试互相影响、并发问题和用户数据串扰。只有真正属于类整体的常量或无实例状态行为才适合 `static`。

## 17. 本节总结

- 类定义类型、字段、行为和构造规则；对象是运行时创建的类实例。
- `new` 分配并初始化对象，构造方法负责建立合法初始状态。
- 实例字段每个对象一份，`static` 字段属于类并共享一份。
- `this` 表示当前对象，`this(...)` 用于委托同类构造方法。
- 访问控制用于设计稳定 API；字段通常保持 `private`。
- 封装的核心是维护不变量并公开有业务含义的操作，而不是生成全部 setter。
- 对象的 `==` 比较身份；内容相等需要定义 `equals`，并与 `hashCode` 保持契约。
- 业务对象报告规则失败，最外层入口负责展示错误和选择退出方式。

下一节：[Java 继承、接口、多态与组合](/backend/java/inheritance-interfaces-polymorphism-and-composition)。

## 18. 参考资料

- [Java 语言规范 25：类](https://docs.oracle.com/javase/specs/jls/se25/html/jls-8.html)
- [Java 语言规范 25：访问控制](https://docs.oracle.com/javase/specs/jls/se25/html/jls-6.html#jls-6.6)
- [Java 语言规范 25：构造方法](https://docs.oracle.com/javase/specs/jls/se25/html/jls-8.html#jls-8.8)
- [Java 语言规范 25：创建类实例](https://docs.oracle.com/javase/specs/jls/se25/html/jls-15.html#jls-15.9)
- [Java 语言规范 25：类实例创建与初始化](https://docs.oracle.com/javase/specs/jls/se25/html/jls-12.html#jls-12.5)
- [Java SE 25：`Object` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Object.html)
- [Java SE 25：`Objects` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/Objects.html)
