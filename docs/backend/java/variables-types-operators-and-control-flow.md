---
title: Java 变量、基本类型、运算符与控制流程
description: 掌握 Java 静态类型、数值计算、条件分支、switch 表达式与循环
outline: deep
---

# Java 变量、基本类型、运算符与控制流程

> 适用环境：JDK 25 LTS。本节只使用稳定语言特性，示例也可在 JDK 17 和 21 中编译运行。

## 先把本课接到上一课

上一课中，JVM 只能机械地从 `main` 的第一条语句向下执行。真实程序还需要回答三件事：

1. **记住什么：**用变量保存输入和计算结果。
2. **怎样计算：**用运算符把旧值变成新值。
3. **下一步执行哪段代码：**用条件和循环改变执行路线。

所以，本课不是一份“Java 关键字清单”。它描述的是数据如何驱动程序向前运行：

```text
命令行字符串
  → 解析成有明确类型的值
  → 校验值是否合理
  → 根据条件选择执行分支
  → 在循环中重复处理
  → 输出结果或用退出码报告失败
```

第一次学习优先掌握 `int`、`double`、`boolean`、`String`、`if` 和 `for`。其他基本类型与运算细节先做到能查阅，不必一次背完。

## 1. 学习目标

完成本节后，你应该能够：

- 声明、初始化和修改局部变量，并正确使用 `final` 与 `var`。
- 区分 8 种基本类型与 `String` 引用类型。
- 理解整型除法、溢出、浮点误差和显式类型转换。
- 使用算术、比较、逻辑和条件运算符组织表达式。
- 使用 `if`、`switch`、`for` 和 `while` 控制执行流程。
- 解析命令行字符串，校验输入并用退出码报告失败。
- 识别 Java 与 JavaScript 在类型转换、真假判断和相等性上的关键差异。

## 2. Java 是静态类型语言

### 先用生活化的方式理解“类型”

可以把变量想成带标签的储物格。`int completedLessons` 的标签写着“这里只放整数”。编译器在程序运行前检查放进去的东西是否符合标签，因此下面的问题会在启动程序之前被发现，而不是等用户请求进来后才突然失败。

Java 中每个变量和表达式在编译时都有确定类型：

```java
int completedLessons = 3;
completedLessons = 4;

completedLessons = "四";
// 编译错误：String 不能赋值给 int
```

变量可以改变值，但不能在运行过程中改变声明类型。`int` 变量始终保存 `int` 值。

JavaScript 的 `let` 变量可以先保存数字、再保存字符串：

```js
let completedLessons = 3
completedLessons = '四'
```

Java 的限制让编译器更早发现数据用途不一致的问题。在后端服务中，数据库字段、接口参数和业务计算通常都有明确类型，静态检查能帮助维护这些边界。

## 3. 声明、初始化与赋值

局部变量的基本形式是：

```java
int totalLessons = 20;
int completedLessons;
completedLessons = 6;
```

- `int` 是类型。
- `totalLessons` 是变量名。
- `20` 是整数字面量。
- `=` 是赋值运算符，不表示数学上的恒等关系。

### 局部变量必须先赋值

方法中的局部变量没有可直接读取的默认值：

```java
int minutes;
System.out.println(minutes);
// 编译错误：变量 minutes 可能尚未初始化
```

编译器会进行“明确赋值”检查。字段和数组元素存在默认值，但业务代码仍应主动表达初始状态，不要把默认的 `0`、`false` 或 `null` 当成设计依据。

### 使用 `final` 表达不再重新赋值

```java
final int dailyTargetMinutes = 45;
dailyTargetMinutes = 60;
// 编译错误：不能再次给 final 变量赋值
```

`final` 限制的是变量再次赋值。以后学习对象时还会看到：`final` 引用不能指向另一个对象，但对象自身未必不可变。

JavaScript 的 `const` 与它有相似之处，但不要直接把两个关键字理解为完全相同的语言机制。

### `var` 是局部类型推断，不是动态类型

```java
var courseName = "Java 基础"; // 编译器推断为 String
var lessonCount = 20;         // 编译器推断为 int

courseName = 100;
// 编译错误：int 不能赋值给 String
```

`var` 只能用于带初始化值的局部变量等特定位置，不能省略初始化，也不能用作字段类型或方法返回类型。类型一眼可见且名称清晰时可以使用；本节示例会保留显式类型，帮助你建立类型意识。

## 4. 8 种基本类型

Java 基本类型直接表示简单值，不是对象：

| 类别 | 类型 | 位宽 | 常见用途 |
| --- | --- | ---: | --- |
| 整数 | `byte` | 8 | 二进制数据、节省大型数组空间 |
| 整数 | `short` | 16 | 较少直接使用 |
| 整数 | `int` | 32 | 普通整数的默认选择 |
| 整数 | `long` | 64 | 大整数、时间戳、较大计数 |
| 字符 | `char` | 16 | 单个 UTF-16 代码单元 |
| 浮点 | `float` | 32 | 明确要求单精度的场景 |
| 浮点 | `double` | 64 | 普通浮点计算的默认选择 |
| 逻辑 | `boolean` | 由 JVM 实现决定存储细节 | `true` 或 `false` |

示例：

```java
byte retryCount = 3;
short port = 8080;
int lessonCount = 20;
long requestId = 9_000_000_001L;
char grade = 'A';
float cpuLoad = 0.75F;
double completionRate = 66.67;
boolean authenticated = true;
```

需要注意：

- `long` 字面量通常加大写 `L`，避免和数字 `1` 混淆。
- `float` 字面量需要 `F`；带小数点的字面量默认是 `double`。
- 数字中的下划线只提高可读性，不改变数值。
- `char` 使用单引号，`String` 使用双引号。
- `char` 表示 UTF-16 代码单元，不保证能独立容纳一个完整 Unicode 字符；某些 emoji 需要两个 `char`。文本处理通常使用 `String`。

## 5. `String` 是引用类型

字符串不是第九种基本类型，而是 `java.lang.String` 类的对象：

```java
String topic = "后端开发";
String empty = "";
String missing = null;
```

基本类型变量保存基本值；引用类型变量保存指向对象的引用，也可能是 `null`。对 `null` 调用方法会抛出 `NullPointerException`：

```java
System.out.println(missing.length());
// 运行时错误：NullPointerException
```

`String` 不可变。`trim()`、`toUpperCase()` 等方法返回新字符串，不会原地修改原对象：

```java
String raw = "  Java  ";
String cleaned = raw.trim();
```

## 6. 数值计算与容易忽略的边界

### 整数除法会截断小数部分

```java
int completed = 2;
int total = 3;

double wrongRate = completed / total * 100;       // 0.0
double correctRate = completed * 100.0 / total;   // 66.666...
```

`completed / total` 的两个操作数都是 `int`，所以先执行整数除法并得到 `0`。让其中一个操作数成为 `double`，计算才会保留小数。

JavaScript 的 `number` 通常使用双精度浮点表示，没有同样的 `int / int` 规则，这是前端开发者很容易带入 Java 的错误直觉。

### 整数溢出不会自动扩大类型

```java
int max = Integer.MAX_VALUE;
int overflowed = max + 1;
System.out.println(overflowed); // -2147483648
```

普通整数运算溢出时会回绕，不会自动变成 `long`，通常也不会抛异常。已知计算可能超出 `int` 范围时，使用 `long` 或 `Math.addExact` 等精确运算方法。

```java
long safe = (long) max + 1;
```

转换必须发生在加法之前；`(long) (max + 1)` 会先以 `int` 溢出，再转换错误结果。

### 浮点数不适合直接表示精确金额

```java
System.out.println(0.1 + 0.2); // 0.30000000000000004
```

`float` 和 `double` 遵循 IEEE 754 二进制浮点规则，很多十进制小数无法被精确表示。统计比例可以使用 `double`；金额等需要十进制精度的业务值通常使用 `BigDecimal`，后续数据与业务建模课程会详细说明。

## 7. 类型转换

范围安全的转换可以自动完成：

```java
int minutes = 45;
long longMinutes = minutes;
double preciseMinutes = longMinutes;
```

可能丢失信息的转换需要显式强制转换：

```java
double rate = 66.9;
int wholeRate = (int) rate; // 66，不是四舍五入
```

强制转换表达的是“我知道可能丢失信息并接受结果”，不是安全校验。需要四舍五入时使用 `Math.round`，需要检查范围时先比较边界。

字符串和数字不能通过强制转换互换：

```java
int minutes = Integer.parseInt("45");
String text = Integer.toString(minutes);
```

`Integer.parseInt` 遇到 `"四十五"`、空字符串或超出 `int` 范围的内容时，会抛出 `NumberFormatException`。外部输入必须校验或捕获这个异常。

## 8. 常用运算符

### 算术与余数

```java
int total = 7 + 3;       // 10
int difference = 7 - 3;  // 4
int product = 7 * 3;     // 21
int quotient = 7 / 3;    // 2
int remainder = 7 % 3;   // 1
```

`%` 常用于判断奇偶、循环位置和分页余数。除数为整数 `0` 会抛出 `ArithmeticException`，计算前应保证除数有效。

### 比较与逻辑

```java
boolean validProgress = completed >= 0 && completed <= total;
boolean needsAttention = completed == 0 || completionRate < 20.0;
boolean finished = !needsAttention;
```

- 比较运算符：`<`、`<=`、`>`、`>=`、`==`、`!=`。
- 逻辑与 `&&`、逻辑或 `||` 会短路。
- 逻辑非 `!` 反转布尔值。

短路可以避免不安全的后续访问：

```java
if (topic != null && !topic.isEmpty()) {
    System.out.println(topic);
}
```

当 `topic == null` 时，右侧不会执行，因此不会对 `null` 调用 `isEmpty()`。

### 字符串内容使用 `equals`

```java
String day = new String("周一");

System.out.println(day == "周一");      // 比较引用，不应依赖结果
System.out.println(day.equals("周一")); // 比较内容，结果为 true
```

Java 的 `==` 在基本类型上比较值，在引用类型上比较是否指向同一个对象。字符串内容比较使用 `equals`。这与 JavaScript 的 `===` 规则不同。

### 条件运算符

简单的二选一可以使用 `? :`：

```java
String label = completionRate >= 100.0 ? "已达标" : "进行中";
```

表达式过长或包含多个动作时，`if` 通常更清晰。

## 9. `if` 条件分支

Java 条件必须是 `boolean`，没有 JavaScript 式的 truthy/falsy：

```java
int completedMinutes = 30;

if (completedMinutes) {
    // 编译错误：int 不能转换为 boolean
}
```

应写成明确条件：

```java
if (completedMinutes <= 0) {
    System.out.println("尚未开始");
} else if (completedMinutes < 45) {
    System.out.println("进行中");
} else {
    System.out.println("今日达标");
}
```

即使分支只有一行，也建议保留花括号，降低以后添加代码时引入控制流错误的风险。

## 10. `switch` 表达式

固定候选值较多时，`switch` 比连续的字符串比较更直观：

```java
int targetMinutes = switch (day) {
    case "周一", "周二", "周三", "周四", "周五" -> 45;
    case "周六", "周日" -> 90;
    default -> -1;
};
```

这是 `switch` **表达式**：整个结构产生一个值并赋给变量。箭头形式不会像旧式冒号 `case` 那样意外贯穿到下一个分支。

当一个分支需要多条语句时，用 `yield` 给出结果：

```java
int targetMinutes = switch (day) {
    case "周一", "周二", "周三", "周四", "周五" -> 45;
    case "周六", "周日" -> 90;
    default -> {
        System.err.println("错误：无法识别星期。");
        yield -1;
    }
};
```

本课只对字符串常量做匹配，不使用 JDK 25 中仍属于预览范围的基本类型模式匹配。真实项目若使用预览特性，必须显式启用并承担未来版本变化的成本。

## 11. 循环

### `for`：次数或索引明确

```java
for (int index = 1; index <= 3; index++) {
    System.out.println("第 " + index + " 次复习");
}
```

执行顺序是初始化一次，然后检查条件、执行循环体、执行更新，再回到条件检查。

### `while`：先判断，再执行

```java
int remaining = 3;

while (remaining > 0) {
    System.out.println("剩余 " + remaining);
    remaining--;
}
```

条件首次就是 `false` 时，循环体一次也不会执行。`do-while` 则至少执行一次，适合必须先读取一次输入再决定是否继续的场景。

### `break` 与 `continue`

- `break` 立即结束当前循环。
- `continue` 跳过当前轮剩余语句，开始下一轮。

它们能简化少量边界处理，但在嵌套循环中大量使用会降低可读性。优先让循环条件和数据过滤表达意图。

## 12. 完整示例：后端学习计划

仓库示例位于 `examples/java/control-flow/BackendStudyPlan.java`。它接收星期和已学习分钟数，根据工作日或周末目标输出进度条和状态。下面直接导入完整源码：

::: code-group

<<< ../../../examples/java/control-flow/BackendStudyPlan.java{java:line-numbers} [BackendStudyPlan.java]

:::

编译：

```bash
cd examples/java/control-flow
mkdir -p out
javac -Xlint:all -d out BackendStudyPlan.java
```

Windows PowerShell 可使用 `mkdir out` 创建输出目录。

正常运行：

```bash
java -cp out BackendStudyPlan 周六 75
```

预期输出：

```text
学习日：周六
目标：90 分钟，已完成：75 分钟
进度：[########--] 83.3%
状态：接近目标
```

程序执行过程：

1. 检查参数数量，避免直接读取不存在的 `args[0]` 或 `args[1]`。
2. 使用 `Integer.parseInt` 把第二个字符串转换为 `int`，并捕获格式错误。
3. 使用 `switch` 表达式把星期映射为目标分钟数。
4. 用 `if` 校验范围并生成学习状态。
5. 使用浮点运算计算百分比，用 `for` 循环输出十格进度条。
6. 正常结束时进程状态为 `0`；输入错误时写入标准错误并返回非零状态。

验证格式错误：

```bash
java -cp out BackendStudyPlan 周六 七十五
```

预期错误和退出码：

```text
错误：已学习分钟数必须是整数。
```

程序对不同错误使用不同退出码：参数数量或格式错误返回 `2`，取值范围或星期错误返回 `1`。这种约定便于脚本区分“命令调用方式错误”和“业务输入无效”；真实项目应在团队内统一退出码或 HTTP 错误响应规范。

## 13. JavaScript 开发者常见错误

### 依赖隐式类型转换

```java
int result = "5" + 1;
// 编译错误，不能把 String 赋给 int
```

Java 中 `"5" + 1` 会得到字符串 `"51"`，不会自动得到数字 `6`。先使用 `Integer.parseInt`，并处理转换失败。

### 把整数当条件

```java
if (lessonCount) {
}
```

Java 不把 `0`、空字符串或 `null` 隐式转换为 `false`。条件必须明确产生 `boolean`。

### 使用 `==` 比较字符串内容

字符串是引用类型，内容比较使用 `equals`。如果左侧可能为 `null`，可以把已知非空常量放在前面：

```java
if ("周一".equals(day)) {
    System.out.println("工作日");
}
```

### 忘记整数除法

只把结果变量声明为 `double` 不会改变前面已经发生的整数运算。确保运算中的某个操作数在除法前就是浮点数。

### 过度使用 `var`

`var` 不会让 Java 变成动态类型，也不应隐藏重要业务类型。对不熟悉的 API 返回值和数字单位，显式类型往往更易读。

## 14. 本节总结

- Java 变量在编译时具有确定类型；局部变量必须在读取前明确赋值。
- 8 种基本类型表示数值、UTF-16 代码单元和布尔值，`String` 是引用类型。
- `int` 是普通整数默认选择，`double` 是普通浮点默认选择；金额通常不直接使用二进制浮点数。
- 整数除法会截断小数，整数可能溢出，窄化转换可能丢失信息。
- Java 条件必须是 `boolean`，逻辑运算符支持短路，字符串内容使用 `equals` 比较。
- `if` 处理范围和复杂条件，`switch` 处理固定候选值，循环处理重复流程。
- 外部字符串转数字可能失败，后端程序应提供清晰错误信息和可判断的失败状态。

下一节：[Java 方法、参数传递、数组与可变参数](/backend/java/methods-parameter-passing-arrays-and-varargs)。

## 15. 参考资料

- [Java 语言规范 25：类型、值与变量](https://docs.oracle.com/javase/specs/jls/se25/html/jls-4.html)
- [Java 语言规范 25：转换与上下文](https://docs.oracle.com/javase/specs/jls/se25/html/jls-5.html)
- [Java 语言规范 25：语句](https://docs.oracle.com/javase/specs/jls/se25/html/jls-14.html)
- [Java 语言规范 25：表达式](https://docs.oracle.com/javase/specs/jls/se25/html/jls-15.html)
- [Java 语言规范 25：明确赋值](https://docs.oracle.com/javase/specs/jls/se25/html/jls-16.html)
- [Oracle：Java 语言版本变化](https://docs.oracle.com/en/java/javase/25/language/java-language-changes-summary.html)
- [Oracle：`Integer.parseInt` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Integer.html#parseInt(java.lang.String))
