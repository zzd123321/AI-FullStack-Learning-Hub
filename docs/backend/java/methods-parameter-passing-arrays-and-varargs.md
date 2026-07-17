---
title: Java 方法、参数传递、数组与可变参数
description: 使用方法拆分职责，理解 Java 值传递，并安全处理数组与可变参数
outline: deep
---

# Java 方法、参数传递、数组与可变参数

> 适用环境：JDK 25 LTS。本节使用的语法兼容 JDK 17 和 21，不使用预览特性。

## 从“能运行”走向“能维护”

上一课已经能用变量、分支和循环完成一个小程序。但如果所有代码都写在 `main` 中，几十行之后就很难回答“哪一段负责解析输入、哪一段负责计算、哪一段负责输出”。

本课引入两个互相配合的工具：

- **方法**给一段行为命名，并规定输入和输出。
- **数组**把一组相同类型的数据放在一起，让方法可以批量处理。

完整示例会沿着这一条数据流组织：

```text
main 收到 String[] 命令行参数
  → parseDailyMinutes 解析并校验
  → 得到 int[] 学习分钟数
  → sum / average / max 分别计算
  → printReport 负责展示结果
```

第一次学习只需牢牢掌握“调用方法时参数值会被复制”和“数组长度固定”。重载、可变参数和数组复制的边界可以在第二遍阅读时再深入。

## “引用被复制”究竟意味着什么

Java **永远是值传递**。传基本类型时复制数值；传数组或对象时，复制的是引用值。两个引用副本可以找到同一个对象，因此通过其中一个引用修改对象会被另一方看到；但给形参重新赋值，只改变方法内部那份引用副本。

```java
static void change(int[] minutes) {
    minutes[0] = 60;          // 沿复制来的引用找到原数组，修改会保留
    minutes = new int[]{10};  // 只让局部形参指向新数组，不会替换调用方变量
}

int[] plan = {30};
change(plan);
System.out.println(plan[0]);  // 60
```

运行时可以这样追踪：

```text
调用前：plan ─────────→ 数组 [30]
调用时：minutes ──────┘      （引用值被复制）
修改元素：同一个数组变为 [60]
重新赋值：minutes → 新数组 [10]，plan 仍指向 [60]
```

JavaScript 里对象参数的表现很相似，但口语里常被误称为“引用传递”。区分方式很简单：如果真是引用传递，给形参重新赋值就应替换调用方变量；实际并不会。

## 1. 学习目标

完成本节后，你应该能够：

- 声明并调用有参数、有返回值的方法。
- 区分形参、实参、返回类型和方法签名。
- 解释 Java 始终按值传递，包括传递对象和数组时的行为。
- 创建、读取、遍历和复制固定长度数组。
- 识别 `null`、越界、共享数组和空数组等常见错误。
- 使用方法重载与可变参数，并理解它们的适用边界。
- 把输入解析、业务计算和结果输出拆分为独立方法。

## 2. 为什么要拆分方法

如果所有逻辑都堆在 `main` 中，输入解析、校验、计算和输出会互相缠绕。方法让我们给一段行为命名，并通过参数和返回值建立边界：

```java
int totalMinutes = sum(dailyMinutes);
double averageMinutes = average(totalMinutes, dailyMinutes.length);
printReport(dailyMinutes);
```

读代码时可以先理解“做什么”，需要时再进入方法查看“怎么做”。后端项目中的控制器、服务、数据访问和校验逻辑都依赖这种职责拆分。

方法不是越短越好。合适的方法应表达一个完整意图，输入输出清晰，错误行为可预测。

## 3. 方法声明与调用

一个基础静态方法如下：

```java
private static int add(int left, int right) {
    return left + right;
}
```

逐项理解：

- `private`：访问级别，只允许当前类使用。
- `static`：方法属于类，不需要先创建对象。
- `int`：返回类型。
- `add`：方法名。
- `int left, int right`：形参列表。
- `return`：结束方法并把结果交回调用方。

调用时提供实参：

```java
int total = add(30, 45);
```

`left`、`right` 是方法声明中的**形式参数（形参）**；`30`、`45` 是本次调用提供的**实际参数（实参）**。每次调用都会创建新的参数变量。

### `void` 表示不返回结果

```java
private static void printTitle(String title) {
    System.out.println(title);
}
```

`void` 方法可以使用不带值的 `return;` 提前结束：

```java
private static void printIfPresent(String value) {
    if (value == null || value.isBlank()) {
        return;
    }

    System.out.println(value);
}
```

不要用打印代替返回值。计算方法返回结果，展示层决定如何输出，通常更容易复用和测试。

## 4. `static` 方法与实例方法

当前示例把方法声明为 `static`，因为课程还没有创建业务对象：

```java
int total = StudyStatistics.sum(values);
```

如果调用发生在同一个类内部，可以省略类名：

```java
int total = sum(values);
```

实例方法属于某个对象，通过对象引用调用：

```java
String raw = "  Java  ";
String cleaned = raw.trim();
```

这里 `trim` 是 `String` 对象的实例方法。后续面向对象课程会学习实例字段、构造方法和 `this`，届时会进一步判断行为应该属于类还是对象。

## 5. 返回值与控制流

返回类型不是 `void` 时，每条能够正常结束的方法路径都必须返回兼容值：

```java
private static String progressLabel(int minutes) {
    if (minutes <= 0) {
        return "尚未开始";
    }

    if (minutes < 45) {
        return "进行中";
    }

    return "今日达标";
}
```

执行 `return` 后，当前方法立即结束。调用它的方法会从调用点继续：

```text
main 调用 progressLabel(30)
          ↓
进入 progressLabel，匹配第二个 if
          ↓ return "进行中"
main 获得返回值并继续执行
```

如果业务无法产生合法结果，不要随意返回 `0`、空字符串或 `null` 掩盖问题。可以在入口校验，或抛出能表达失败原因的异常。本课示例对无效分钟数抛出 `IllegalArgumentException`。

## 6. Java 始终按值传递

Java 方法调用永远把**实参的值复制给形参**，不存在“按引用传递”这一套额外规则。

### 传递基本类型

```java
private static void addOne(int value) {
    value++;
}

int count = 3;
addOne(count);
System.out.println(count); // 仍然是 3
```

`value` 得到 `count` 当前数值的副本。修改副本不会改变调用方变量。

### 传递数组或对象

引用类型变量保存的是引用值。调用方法时，复制的是这个引用值：

```java
private static void replaceFirst(int[] values) {
    values[0] = 99;
}

int[] minutes = {30, 45};
replaceFirst(minutes);
System.out.println(minutes[0]); // 99
```

调用方的 `minutes` 和方法内的 `values` 是两个变量，但两个引用副本指向同一个数组，因此方法能修改共享数组的元素。

重新给形参赋值则不会改变调用方引用：

```java
private static void replaceArray(int[] values) {
    values = new int[]{99, 100};
}

int[] minutes = {30, 45};
replaceArray(minutes);
System.out.println(minutes[0]); // 仍然是 30
```

准确说法是“Java 按值传递；对象引用这个值也会被复制”，而不是“基本类型按值、对象按引用”。

## 7. 创建数组

数组保存固定数量、相同元素类型的数据：

```java
int[] dailyMinutes = new int[3];
```

这会创建长度为 3 的 `int` 数组，索引范围为 `0` 到 `2`。数组元素有默认值，因此三个元素初始都是 `0`。

已知内容时可以使用数组初始化器：

```java
int[] dailyMinutes = {30, 45, 60};
String[] topics = {"Java", "Maven", "Spring Boot"};
```

`int[]` 是数组类型，`dailyMinutes` 是数组引用。推荐把方括号写在类型后面；虽然 Java 也接受 `int dailyMinutes[]`，但前一种写法更清楚地表达“这是 `int` 数组类型”。

### 长度固定

```java
System.out.println(dailyMinutes.length); // 3
```

数组创建后不能追加元素或改变长度。需要动态增删时，后续集合课程会使用 `ArrayList`。JavaScript 的 `Array` 是可变长度对象，与 Java 数组不是同一种数据结构。

## 8. 读取、修改与遍历

通过从 `0` 开始的索引访问元素：

```java
int[] dailyMinutes = {30, 45, 60};

int firstDay = dailyMinutes[0];
dailyMinutes[1] = 50;
```

需要索引时使用普通 `for`：

```java
for (int index = 0; index < dailyMinutes.length; index++) {
    System.out.printf("第 %d 天：%d 分钟%n", index + 1, dailyMinutes[index]);
}
```

只需要元素值时使用增强 `for`：

```java
int total = 0;

for (int minutes : dailyMinutes) {
    total += minutes;
}
```

增强 `for` 中的 `minutes` 是当前基本值的副本，给它重新赋值不会修改数组元素：

```java
for (int minutes : dailyMinutes) {
    minutes = 0;
}
// dailyMinutes 的内容没有改变
```

## 9. 数组边界、空数组与 `null`

### 索引越界

```java
int[] values = {10, 20, 30};
System.out.println(values[3]);
// ArrayIndexOutOfBoundsException
```

有效索引满足 `0 <= index && index < values.length`。循环条件常写成 `< length`，而不是 `<= length`。

### 空数组不是 `null`

```java
int[] empty = new int[0];
int[] missing = null;

System.out.println(empty.length);   // 0
System.out.println(missing.length); // NullPointerException
```

空数组是一个真实对象，只是没有元素；`null` 表示没有数组引用。能用空数组表达“当前没有数据”时，通常比返回 `null` 更安全。

即使不越界，算法也要处理空数组。例如求最大值时常从 `values[0]` 开始，因此必须先拒绝空数组或定义明确的空结果。

## 10. 数组别名与复制

简单赋值不会复制数组：

```java
int[] original = {30, 45};
int[] alias = original;

alias[0] = 99;
System.out.println(original[0]); // 99
```

两个变量指向同一个数组，这叫共享引用或别名。需要独立副本时：

```java
int[] copy = java.util.Arrays.copyOf(original, original.length);
copy[0] = 10;
```

此后修改 `copy` 的元素不会影响 `original`。对于对象数组，这种复制只复制每个引用，数组里的对象仍可能共享；这叫浅复制，后续对象课程会进一步讨论。

当方法不应该修改调用方数据时，可以只读取输入，或者在边界创建防御性副本。是否复制需要同时考虑可维护性和大型数组的成本。

## 11. 多维数组的真实结构

Java 的二维数组实际是“数组的数组”：

```java
int[][] weeklyMinutes = {
    {30, 45, 60},
    {20, 0},
    {90, 75, 45, 30}
};
```

每一行可以有不同长度：

```java
for (int row = 0; row < weeklyMinutes.length; row++) {
    for (int column = 0; column < weeklyMinutes[row].length; column++) {
        System.out.println(weeklyMinutes[row][column]);
    }
}
```

因此不能假设所有行都和第一行等长，也要考虑某一行引用为 `null` 的可能性。业务表格通常更适合对象集合；这里只建立数组结构概念。

## 12. 方法重载

同一个类中可以声明同名但参数列表不同的方法：

```java
private static int sum(int left, int right) {
    return left + right;
}

private static int sum(int[] values) {
    int total = 0;
    for (int value : values) {
        total += value;
    }
    return total;
}
```

编译器根据实参数量与类型选择重载。方法签名由名称和参数类型等构成，不能只改变返回类型来重载：

```java
int parse(String value) { /* ... */ }
double parse(String value) { /* ... */ }
// 编译错误：调用方仅凭返回类型无法区分
```

重载适合表达同一概念的不同输入形式。不要为了减少方法名而创建容易混淆的重载，尤其要谨慎混用自动类型转换、装箱和可变参数。

## 13. 可变参数

可变参数允许调用方传入零个或多个同类型实参：

```java
private static int max(int... values) {
    if (values.length == 0) {
        throw new IllegalArgumentException("数据不能为空。");
    }

    int result = values[0];

    for (int value : values) {
        if (value > result) {
            result = value;
        }
    }

    return result;
}
```

两种调用都有效：

```java
int first = max(30, 45, 60);

int[] dailyMinutes = {30, 45, 60};
int second = max(dailyMinutes);
```

方法内部的 `values` 就是数组。可变参数的规则是：

- 一个方法最多有一个可变参数。
- 可变参数必须位于参数列表最后。
- 调用方可以不传任何值，因此方法仍要处理长度为 `0` 的数组。
- 每次使用多个独立实参调用时通常会创建数组，不应在高频路径中无意识滥用。

它与 JavaScript 的 rest parameter `...values` 外形相似，但 Java 可变参数仍有固定元素类型，并按 Java 的重载规则在编译期解析。

## 14. 完整示例：学习时长统计

示例 `examples/java/methods-and-arrays/StudyStatistics.java` 把入口、解析、校验、求和、平均值、最大值和输出拆分为独立方法。页面直接导入实际源码：

::: code-group

<<< ../../../examples/java/methods-and-arrays/StudyStatistics.java{java:line-numbers} [StudyStatistics.java]

:::

编译：

```bash
cd examples/java/methods-and-arrays
mkdir -p out
javac -Xlint:all -d out StudyStatistics.java
```

Windows PowerShell 可使用 `mkdir out` 创建目录。

运行：

```bash
java -cp out StudyStatistics 30 45 60 0 90
```

预期输出：

```text
记录天数：5
学习总时长：225 分钟
日均时长：45.0 分钟
最长一天：90 分钟
有效学习天数：4
```

执行过程：

1. `main` 把 `String[] args` 传给 `parseDailyMinutes`。
2. 解析方法创建等长的 `int[]`，逐项转换并校验 `0` 到 `1440` 的范围。
3. 任意输入无效时抛出 `IllegalArgumentException`，`main` 统一输出错误并返回状态码 `2`。
4. `printReport` 负责组织统计流程，不负责解析外部输入。
5. `sum` 和 `countPositiveValues` 使用增强 `for`；`max(int... values)` 展示数组也可以传给可变参数。
6. `average` 显式转换为 `double`，避免整数除法截断结果。

无参数运行：

```bash
java -cp out StudyStatistics
```

预期错误：

```text
错误：至少提供一天的学习分钟数。
用法：java StudyStatistics <第1天分钟数> [第2天分钟数] ...
```

输入 `30 abc 60` 会指出第 2 个值不是整数；输入 `30 -1 60` 会指出第 2 个值超出范围。错误消息保留具体位置，比笼统的“参数错误”更容易排查。

## 15. 设计与排错建议

- 方法名使用动词或动词短语，变量名表达数据含义与单位。
- 让解析、校验、计算和输出分层，不要让每个方法都读写控制台。
- 计算方法优先返回结果；只有真正没有结果时使用 `void`。
- 明确空数组是否合法，不要等到访问 `values[0]` 时才意外失败。
- 使用 `< array.length` 控制索引，看到 `<=` 时重点检查越界。
- 传入数组前确认方法会不会修改它；必要时复制。
- 不要用 `null` 代替空数组，除非“缺失”和“为空”确实有不同业务含义。
- 捕获异常时补充输入位置和业务上下文，同时保留原始异常作为原因。

## 16. 本节总结

- 方法通过名称、参数和返回值建立行为边界，帮助拆分复杂流程。
- Java 始终按值传递；传递引用类型时，被复制的值是对象引用。
- 数组长度固定、元素类型一致，索引从 `0` 开始，`length` 是字段而不是方法。
- 数组赋值只复制引用；需要独立数组时显式复制。
- 方法重载依赖参数列表，不能只靠返回类型区分。
- 可变参数在方法内部表现为数组，并且必须位于参数列表最后。
- 外部输入解析可能失败，应报告具体位置、原因和非零退出状态。

下一节：[Java 类、对象、构造方法与封装](/backend/java/classes-objects-constructors-and-encapsulation)。

## 17. 参考资料

- [Java 语言规范 25：方法声明](https://docs.oracle.com/javase/specs/jls/se25/html/jls-8.html#jls-8.4)
- [Java 语言规范 25：数组](https://docs.oracle.com/javase/specs/jls/se25/html/jls-10.html)
- [Java 语言规范 25：方法调用表达式](https://docs.oracle.com/javase/specs/jls/se25/html/jls-15.html#jls-15.12)
- [Java 语言规范 25：变量与参数变量](https://docs.oracle.com/javase/specs/jls/se25/html/jls-4.html#jls-4.12.3)
- [Java SE 25：`Arrays` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/Arrays.html)
- [VitePress：导入代码片段](https://vitepress.dev/guide/markdown.html#import-code-snippets)
