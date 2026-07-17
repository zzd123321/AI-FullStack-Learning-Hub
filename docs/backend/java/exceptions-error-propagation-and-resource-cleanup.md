---
title: Java 异常体系、错误传播与资源清理
description: 区分受检与非受检异常，保留异常原因，并使用 try-with-resources 可靠关闭资源
outline: deep
---

# Java 异常体系、错误传播与资源清理

> 适用环境：JDK 25 LTS。本节语法兼容 JDK 17 和 21，示例使用 UTF-8 文本与 `java.nio.file` API。

## 把异常放回程序执行过程

前面的示例已经遇到过非法数字、空姓名等失败，但主要在 `main` 中就地处理。真实后端会有多层调用：入口调用业务对象，业务对象又调用文件、网络或数据库。底层失败后，最上层必须知道请求没有正常完成。

异常就是一条与正常返回不同的“失败通道”：

```text
正常：底层方法 return 结果 → 上层继续计算 → 输出成功结果
失败：底层方法 throw 异常 → 跳过剩余语句 → 沿调用栈寻找处理者
```

为什么不让每个方法都返回一个错误码？假设“读取文件”依次调用“读取一行”“解析数字”“累计分钟数”，那么每一层都要同时返回“正常值或错误”，上层还必须记得逐层检查。只要漏查一次，程序就会拿错误值继续计算。异常把正常返回值留给成功结果，并强制失败沿调用栈离开当前路径，直到遇到明确处理它的边界。

可以把调用栈想成一叠正在办理的窗口：最里面的窗口发现材料无法读取，就停止当前办理并把失败向外传；某个了解业务语义的窗口可以补充“哪份进度文件失败”，最外面的命令行或 HTTP 窗口再决定向用户怎样表达。不是每个窗口都应该打印一次错误，也不是最里面的窗口有权直接关闭整个程序。

第一次学习先掌握 `throw`、`try/catch` 和“不要丢失原始 cause”。受检异常的设计取舍、suppressed exception 等细节可以第二遍再读。

## 1. 学习目标

完成本节后，你应该能够：

- 解释 `Throwable`、`Error`、`Exception` 和 `RuntimeException` 的关系。
- 区分受检异常与非受检异常，并理解编译器的处理要求。
- 正确使用 `throw`、`throws`、`try`、`catch` 和 `finally`。
- 在合适层级捕获异常，补充上下文后保留原始 cause。
- 定义有业务语义的自定义异常。
- 使用 `try-with-resources` 自动关闭文件、流和连接。
- 理解主异常与 suppressed exception 的关系。
- 把异常转换为命令行退出码，并为后续 HTTP 错误映射建立基础。

## 2. 异常是非局部控制流

发生异常时，当前表达式和方法不会按普通顺序继续。JVM 沿调用栈向上寻找能处理该类型的 `catch`：

```text
main
 └─ ProgressFileReader.read
     └─ Files.newBufferedReader  抛出 IOException
            │
            └─ read 捕获并包装为 ProgressFileException
                    │
                    └─ main 捕获，输出错误并设置退出码
```

如果一直找不到处理器，当前线程由未捕获异常处理器终止，并通常打印堆栈。异常比返回 `-1` 更难被调用方无意忽略，也能携带消息、类型、原因和堆栈位置。

异常应用于无法按方法正常契约继续的情况，不应代替普通分支。例如“搜索不到结果”若是正常业务状态，可以返回空结果；文件系统拒绝读取则通常是异常情况。

## 3. Java 异常层次

```text
Throwable
├─ Error                         通常不由普通业务代码恢复
└─ Exception
   ├─ RuntimeException           非受检异常
   │  ├─ IllegalArgumentException
   │  ├─ NullPointerException
   │  └─ IllegalStateException
   └─ IOException 等             受检异常
```

### `Error`

`Error` 表示 JVM 或运行环境中的严重问题，例如某些内存耗尽和类链接失败。普通业务代码通常不应使用 `catch (Error)` 后假装可以继续。

### 非受检异常

`RuntimeException` 及其子类是非受检异常。编译器不强制声明或捕获，常表示：

- 调用参数违反方法前置条件。
- 对象处于不允许当前操作的状态。
- 程序存在空引用、越界或错误类型转换。

“非受检”不等于“不处理”。边界层仍可能统一记录并转换它们，但底层不需要在每个方法签名中重复声明。

### 受检异常

除 `RuntimeException` 与 `Error` 分支之外的异常通常是受检异常。方法可能抛出受检异常时，调用方必须捕获，或在自己的 `throws` 中继续声明。

`IOException` 是典型例子：磁盘、权限和文件状态不完全由程序控制，API 强制调用方考虑失败路径。

## 4. `throw` 与 `throws`

`throw` 是执行语句，抛出一个具体异常对象：

```java
if (minutes <= 0) {
    throw new IllegalArgumentException("分钟数必须大于 0。");
}
```

`throws` 出现在方法声明中，说明受检异常是方法契约的一部分：

```java
public ProgressSummary read(Path path) throws ProgressFileException {
    // ...
}
```

不要混淆：`throw` 真正改变当前控制流；`throws` 只声明方法可能如何异常结束。

方法可以声明多个异常，但更重要的是让调用方知道它能采取什么行动。把所有方法都写成 `throws Exception` 会丢失精确信息，迫使调用方捕获过宽类型。

## 5. 捕获异常

```java
try {
    int minutes = Integer.parseInt(text);
} catch (NumberFormatException error) {
    System.err.println("分钟数格式错误：" + text);
}
```

`catch` 类型决定它能处理的异常范围。多个处理器应从具体类型写到宽泛类型，否则前面的父类型会让后面的子类型处理器不可达。

多重捕获适合处理方式完全相同的无继承冲突类型：

```java
catch (IllegalArgumentException | IllegalStateException error) {
    // 同一种边界响应
}
```

只捕获你能处理、转换或补充上下文的异常。下面的写法会制造最难排查的静默失败：

```java
try {
    loadData();
} catch (Exception ignored) {
}
```

## 6. 在正确层级处理

不同层有不同职责：

- 文件读取层知道路径和行号，适合补充“哪个文件、哪一行”。
- 业务层知道操作语义，适合转换为“进度文件无效”。
- 命令行入口知道退出码和标准错误。
- Web 控制器知道 HTTP 状态码和响应体。

底层类不应调用 `System.exit`，否则它无法在 Web 服务、测试或批处理任务中复用。让异常传播到最了解外部协议的边界，再决定怎样响应。

也不要为了“就地处理”在每层都记录同一异常，否则日志会出现多份重复堆栈。通常由最终负责请求或任务的边界统一记录。

## 7. 保留异常原因

包装异常时保留 cause：

```java
try {
    return Integer.parseInt(text);
} catch (NumberFormatException error) {
    throw new ProgressFileException("分钟数格式错误：" + text, error);
}
```

新的异常提供业务上下文，原始异常保存底层原因和堆栈。只传消息会切断异常链：

```java
throw new ProgressFileException(error.getMessage()); // 不推荐
```

可以通过 `getCause()` 读取直接原因。生产日志通常记录完整异常对象，而不是只输出消息；课程命令行示例只打印原因类型，避免输出冗长堆栈。

## 8. 自定义异常

示例定义受检异常：

```java
public final class ProgressFileException extends Exception {
    public ProgressFileException(String message, Throwable cause) {
        super(message, cause);
    }
}
```

选择受检还是非受检，不能只靠“业务异常都用某一种”的口号：

- 希望调用者显式处理或继续传播的可预期外部失败，可考虑受检异常。
- 调用者违反前置条件、对象状态不合法，通常使用非受检异常。
- 框架和团队已有一致约定时，应遵循既有异常映射体系。

不要为每条错误消息创建一个异常类。自定义类型应给调用方带来可区分、可处理的语义。

## 9. `finally` 的职责

在 JVM 仍按正常控制流运行的前提下，`finally` 会在 `try` 正常结束、`return` 或抛异常后执行，常用于恢复必须完成的状态：

```java
lock.lock();
try {
    updateState();
} finally {
    lock.unlock();
}
```

不要在 `finally` 中 `return` 或抛出无关异常，它可能覆盖原有返回值或异常。关闭实现 `AutoCloseable` 的资源时，优先使用 `try-with-resources`，它比手写嵌套 `finally` 更可靠。

边界要说清楚：`finally` 不是断电保护。如果进程被 `Runtime.halt` 强制终止、操作系统杀死或 JVM 崩溃，就不能依赖它执行。因此它适合释放进程内资源，不替代数据库事务、持久化状态或外部系统的恢复机制。

## 10. `try-with-resources`

```java
try (BufferedReader reader = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
    return reader.readLine();
}
```

资源必须实现 `AutoCloseable`。退出 `try` 时，无论正常结束、`return` 还是抛异常，都会自动调用 `close()`。

常见资源包括：

- 文件输入输出流、Reader 和 Writer。
- Socket 与网络通道。
- JDBC `Connection`、`Statement` 和 `ResultSet`。
- 某些需要及时释放的 Stream 或框架资源。

多个资源写在同一资源列表时，按声明的相反顺序关闭：

```java
try (Connection connection = dataSource.getConnection();
     PreparedStatement statement = connection.prepareStatement(sql);
     ResultSet result = statement.executeQuery()) {
    // 使用结果
}
```

## 11. 被抑制的异常

如果 `try` 主体抛出异常，随后 `close()` 也失败，Java 保留主体异常作为主异常，把关闭异常添加为 suppressed exception。可以通过：

```java
error.getSuppressed()
```

读取这些异常。这避免资源关闭失败覆盖真正触发流程中断的原因。

cause 与 suppressed exception 不同：

- cause 表示“这个高层异常由哪个底层异常导致”。
- suppressed 表示“传播主异常期间，资源关闭又发生了其他异常”。

日志和诊断工具应保留完整异常对象，才能同时看到两类关系。

## 12. JavaScript 对照

| 关注点 | Java | JavaScript / Node.js |
| --- | --- | --- |
| 抛出 | `throw` 要求值是 `Throwable` 子类实例 | 可以抛出任意值，但应抛 `Error` 对象 |
| 受检异常 | 编译器要求捕获或声明 | 没有受检异常机制 |
| 声明传播 | 方法可用 `throws` 声明受检异常 | 函数签名通常不声明同步异常 |
| 异步错误 | Future/框架有独立传播规则 | Promise rejection 与 `async/await` 常见 |
| 资源清理 | `try-with-resources` + `AutoCloseable` | `try/finally`，以及运行时支持的资源管理语法 |
| 异常链 | 标准 cause 和 suppressed exceptions | `Error.cause` 可表达原因链，资源语义依环境而异 |

Java 的受检异常是编译期契约，不代表所有运行时失败都会被编译器发现。Node.js 开发者尤其不要只写 `catch (Exception)`：精确类型和异常链是 Java API 的重要组成部分。

## 13. 完整示例：读取学习进度文件

输入文件格式为 `主题,分钟数`，允许空行和以 `#` 开头的注释。页面直接导入真实源码：

::: code-group

<<< ../../../examples/java/exceptions/src/learning/backend/progress/ProgressFileException.java{java:line-numbers} [ProgressFileException.java]

<<< ../../../examples/java/exceptions/src/learning/backend/progress/ProgressSummary.java{java:line-numbers} [ProgressSummary.java]

<<< ../../../examples/java/exceptions/src/learning/backend/progress/ProgressFileReader.java{java:line-numbers} [ProgressFileReader.java]

<<< ../../../examples/java/exceptions/src/learning/backend/progress/ProgressFileApp.java{java:line-numbers} [ProgressFileApp.java]

<<< ../../../examples/java/exceptions/data/progress.txt{text:line-numbers} [progress.txt]

:::

编译：

```bash
cd examples/java/exceptions
mkdir -p out
javac --release 17 -Xlint:all -d out \
  src/learning/backend/progress/ProgressFileException.java \
  src/learning/backend/progress/ProgressSummary.java \
  src/learning/backend/progress/ProgressFileReader.java \
  src/learning/backend/progress/ProgressFileApp.java
```

运行：

```bash
java -cp out learning.backend.progress.ProgressFileApp data/progress.txt
```

预期输出：

```text
有效记录：3 条
累计学习：135 分钟
```

文件不存在时：

```bash
java -cp out learning.backend.progress.ProgressFileApp data/missing.txt
```

预期错误：

```text
错误：无法读取进度文件：data/missing.txt
原因类型：NoSuchFileException
```

程序返回状态码 `1`；参数数量错误返回 `2`。若某行分钟数不是整数，错误会包含行号，并保留 `NumberFormatException` 作为 cause。

执行过程：

1. 入口把字符串路径转换成 `Path`。
2. Reader 使用 UTF-8 打开 `BufferedReader`，该操作可能抛出 `IOException`。
3. `try-with-resources` 确保读取成功或失败时都关闭 Reader。
4. 每行格式问题转换为带行号的 `ProgressFileException`。
5. 文件 IO 问题被包装成同一业务异常并保留原因。
6. 入口捕获业务异常，选择标准错误和退出码，不让读取类依赖命令行协议。

## 14. 常见错误

- 捕获 `Exception` 后忽略，导致失败表现为错误数据或空结果。
- 包装异常时不传 cause，丢失底层诊断线索。
- 在底层工具类调用 `System.exit`，使代码无法复用和测试。
- 用异常处理预期中的普通分支，增加控制流成本和阅读难度。
- 在每一层重复记录同一异常，制造多份日志。
- 手工关闭资源但遗漏异常分支，或让 `close` 异常覆盖主异常。
- 把用户输入、数据库错误和 JVM `Error` 全部当成同一种失败。

## 15. 本节总结

- 异常会沿调用栈传播，直到匹配的处理器接管或线程因未捕获异常结束。
- `RuntimeException` 与 `Error` 是非受检分支；其他异常类通常受编译期检查。
- `throw` 抛出对象，`throws` 声明方法可能传播的受检异常。
- 只在能恢复、转换或补充上下文的层级捕获异常。
- 包装异常时保留 cause；资源关闭的次要失败可能成为 suppressed exception。
- `try-with-resources` 自动关闭 `AutoCloseable`，是文件、网络和数据库资源的首选管理方式。
- 最外层边界负责把异常转换为命令行退出码、HTTP 响应或任务失败状态。

下一节：[Java IO、NIO.2、字符编码与文件操作](/backend/java/io-nio2-character-encoding-and-files)。

## 16. 参考资料

- [Java 语言规范 25：异常](https://docs.oracle.com/javase/specs/jls/se25/html/jls-11.html)
- [Java 语言规范 25：try 语句](https://docs.oracle.com/javase/specs/jls/se25/html/jls-14.html#jls-14.20)
- [Java 语言规范 25：throw 语句](https://docs.oracle.com/javase/specs/jls/se25/html/jls-14.html#jls-14.18)
- [Java SE 25：`Throwable` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Throwable.html)
- [Java SE 25：`AutoCloseable` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/AutoCloseable.html)
- [Java SE 25：`Closeable` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/io/Closeable.html)
