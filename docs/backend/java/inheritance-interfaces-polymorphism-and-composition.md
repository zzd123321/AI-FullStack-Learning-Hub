---
title: Java 继承、接口、多态与组合
description: 使用接口建立稳定边界，通过多态替换实现，并理解组合优先原则
outline: deep
---

# Java 继承、接口、多态与组合

> 适用环境：JDK 25 LTS；示例兼容 JDK 17 和 21。

## 1. 学习目标

- 理解 `extends`、`implements`、`super` 和 `@Override`。
- 区分接口、抽象类与具体类。
- 解释向上转型和运行时动态分派。
- 使用组合替换依赖实现，并识别不恰当的继承。
- 处理多态调用中的输入错误。

## 2. 继承表达“是一种”

Java 类只能直接继承一个类：

```java
class EmailChannel extends ValidatingChannel {
}
```

子类继承父类可访问成员，并可重写实例方法。构造方法不会被继承；子类构造过程会调用父类构造方法，可用 `super(...)` 明确传参。

继承应满足可替换性：需要父类型的地方，子类型不应破坏父类型承诺。仅为了复用几行代码而建立错误的“是一个”关系，会造成脆弱层级。

## 3. 重写不是重载

```java
@Override
protected void deliver(String recipient, String message) {
    // 子类实现
}
```

重写是在子类提供相同签名的实例方法实现；重载是同一类型中方法名相同、参数列表不同。`@Override` 能让编译器发现拼写或签名错误，应始终使用。

父类方法可以声明为 `final`，禁止子类改变关键流程。示例把公开 `send` 固定为“先校验，再调用 `deliver`”，子类只负责投递细节。

## 4. 抽象类

抽象类不能直接实例化，可同时包含状态、已实现方法和抽象方法：

```java
abstract class ValidatingChannel {
    protected abstract void deliver(String recipient, String message);
}
```

它适合多个紧密相关实现共享状态或受控流程。不要把抽象类当作接口的默认替代品，因为类的单继承限制会占用唯一父类位置。

## 5. 接口描述能力

```java
interface NotificationChannel {
    String name();
    void send(String recipient, String message);
}
```

类使用 `implements` 实现接口。一个类可以实现多个接口，因此无继承关系的类也能提供同一种能力。接口方法可以有 `default` 实现，但接口仍应保持职责集中。

## 6. 多态与动态分派

```java
NotificationChannel channel = new EmailChannel();
channel.send("user@example.com", "学习提醒");
```

变量的编译时类型是接口，实际对象是 `EmailChannel`。编译器只允许调用接口公开的成员；运行时根据实际对象选择重写实现，这就是动态分派。

向上转型通常自动完成。向下转型则可能抛出 `ClassCastException`，不应通过反复类型判断破坏多态设计。

## 7. 组合表达“拥有一个”

```java
final class NotificationService {
    private final NotificationChannel channel;
}
```

服务“拥有一个通知渠道”，并把发送工作委托给它。构造时注入不同实现即可替换行为，不需要让服务继承邮件或短信类。这种组合方式也是 Spring 依赖注入的基础直觉。

优先组合并不表示禁止继承：稳定的“是一种”关系和受控模板流程适合继承；可替换协作者与业务能力通常适合接口加组合。

## 8. JavaScript 对照

JavaScript 类建立在原型机制上，运行时更动态；Java 的继承、接口实现和成员签名由编译器检查。TypeScript 接口会在生成 JavaScript 时消失，而 Java 接口保留在类文件类型系统中，并参与运行时类型关系。

## 9. 完整示例

页面直接导入可运行源码：

::: code-group

<<< ../../../examples/java/polymorphism/NotificationDemo.java{java:line-numbers} [NotificationDemo.java]

:::

```bash
cd examples/java/polymorphism
mkdir -p out
javac -Xlint:all -d out NotificationDemo.java
java -cp out NotificationDemo email user@example.com 学习提醒
```

预期输出：

```text
使用渠道：邮件
[邮件] 发送给 user@example.com：学习提醒
```

非法渠道或空接收者会写入标准错误并返回状态码 `2`。入口只选择实现，`NotificationService` 依赖接口，校验流程由抽象基类复用。

## 10. 常见错误

- 为复用代码建立不成立的父子关系。
- 重写方法时缩小可见性或忘记 `@Override`。
- 让调用方依赖具体类，失去替换实现的能力。
- 用大量 `instanceof` 和强制转换代替多态。
- 在父类构造方法中调用可被子类重写的方法，导致未初始化状态被访问。

## 11. 总结

- 类是单继承，接口支持一个类实现多种能力。
- 重写配合动态分派，使接口变量调用实际对象行为。
- 抽象类适合共享受控流程，接口适合稳定能力边界。
- 组合通过持有接口引用替换协作者，降低业务代码与实现的耦合。

下一节：[Java 包、枚举、记录类与代码组织](/backend/java/packages-enums-records-and-code-organization)。

## 12. 参考资料

- [Java 语言规范 25：类](https://docs.oracle.com/javase/specs/jls/se25/html/jls-8.html)
- [Java 语言规范 25：接口](https://docs.oracle.com/javase/specs/jls/se25/html/jls-9.html)
- [Java 语言规范 25：方法重写](https://docs.oracle.com/javase/specs/jls/se25/html/jls-8.html#jls-8.4.8)
