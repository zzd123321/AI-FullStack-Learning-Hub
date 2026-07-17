---
title: Java 开发环境、JDK/JRE/JVM 与第一个程序
description: 安装并验证 JDK 25，理解 Java 程序从源码到 JVM 的执行过程
outline: deep
---

# Java 开发环境、JDK/JRE/JVM 与第一个程序

> 适用环境：JDK 25 LTS，Windows 11、macOS 或主流 64 位 Linux。本文只使用 JDK 自带的命令行工具，不依赖 IDE、Maven 或 Spring Boot。

## 先看本课在整条路线中的位置

你现在还不需要理解类、对象、垃圾回收或 Spring。第一课只解决一个更基础的问题：**写在文件里的 Java 代码，怎样真正变成正在运行的程序？**

先记住这一条主线即可：

```text
人编写 .java 源文件
  → javac 检查语法和类型，生成 .class 字节码
  → java 启动 JVM
  → JVM 找到 main 方法并从第一条语句开始执行
```

JDK、JRE 和 JVM 不是三个互不相关的名词，它们分别站在这条执行链的“开发工具”“运行环境”和“实际执行者”位置。后文所有细节都在解释这条主线。

## 1. 学习目标

完成本节后，你应该能够：

- 解释 JDK、JRE 与 JVM 分别解决什么问题。
- 安装 JDK 25，并确认终端实际调用的 Java 版本。
- 使用 `javac` 编译 `.java` 源文件，再用 `java` 启动类。
- 使用源码模式直接运行单文件程序，并理解它与显式编译的区别。
- 看懂第一个 Java 程序的入口、命令行参数、标准输出与标准错误。
- 区分编译错误、启动错误和运行时错误。

第一次学习不要求记住 JDK 中的全部工具，也不要求理解 JVM 内部如何管理内存。能够独立编译、运行并判断错误发生在哪个阶段，就已经完成本课主线。

## 2. 为什么选择 JDK 25

本专题以 **JDK 25 LTS** 为学习基准。JDK 25 于 2025 年 9 月发布，是 Oracle 长期支持（LTS）版本；Oracle 的支持路线图将 8、11、17、21 和 25 列为 LTS 版本。

你可能在公司项目中遇到 JDK 17 或 21。第一课使用的类、`main` 方法、字符串、条件判断和异常处理在这些版本中同样适用。学习阶段先统一到 25，后续遇到版本差异时再单独说明。

Java 有不同厂商提供的 JDK 构建，例如 Oracle JDK 和基于 OpenJDK 的构建。它们都以 Java SE 规范和 OpenJDK 项目为基础，但许可证、更新周期和商业支持可能不同。学习时选择可信厂商的 JDK 25 即可；团队项目则必须遵循团队指定的发行版与补丁版本。

## 3. JDK、JRE 与 JVM

先把三个容易混淆的概念放到同一条执行链上：

```text
开发阶段                                      运行阶段

HelloBackend.java
       │
       │ javac（JDK 中的编译器）
       ▼
HelloBackend.class ── java 启动器 ──► JVM 加载并执行字节码
                                            │
                                            └─ 使用 Java 类库和本地运行组件
```

### JVM：执行字节码的虚拟机

JVM（Java Virtual Machine）负责加载、验证和执行 Java 字节码，并管理内存、垃圾回收和即时编译等运行时工作。

`.class` 字节码不是浏览器中的 JavaScript，也不是面向某个 CPU 的普通原生可执行文件。不同操作系统上的 JVM 实现负责把同一种字节码落实到当前平台，这构成了 Java 跨平台能力的基础。

### JRE：运行 Java 程序所需的环境

JRE（Java Runtime Environment）可以理解为 **JVM 加上运行程序需要的类库和支持文件**。它描述的是运行环境这一层职责。

在现代 JDK 中，开发者通常直接安装 JDK：JDK 已包含运行 Java 程序所需的组件。不要为了“运行代码”再寻找一个与 JDK 25 配套的独立 JRE 安装包。实际发布应用时，可以在后续课程中学习如何创建应用专用的运行时镜像。

### JDK：开发工具包

JDK（Java Development Kit）包含运行环境和开发工具。第一课会使用其中两个命令：

- `javac`：读取 `.java` 源文件，检查语法和类型，并生成 `.class` 文件。
- `java`：启动 JVM，加载类或源码程序并调用入口方法。

后续还会接触 `jar`、`javadoc`、`jshell` 和诊断工具。只安装运行环境无法完成正常的 Java 开发，因为编译器属于 JDK。

如果用前端工具链类比：`javac` 有点像构建阶段的编译器，但 Java 类型检查与字节码生成由同一套语言工具链完成；`java` 更接近启动 Node.js 运行时。这个类比只帮助建立直觉，两种平台的模块、内存和执行模型并不相同。

## 4. 安装 JDK 25

从 [Oracle JDK 25 安装指南](https://docs.oracle.com/en/java/javase/25/install/) 或团队指定的 OpenJDK 发行版入口下载安装包。下载前确认两个信息：

1. 操作系统：Windows、macOS 或 Linux。
2. CPU 架构：常见值是 x64（Intel/AMD 64 位）或 AArch64/ARM64（例如 Apple Silicon）。

### macOS

Oracle 同时提供 x64 和 AArch64 安装包。Apple Silicon 设备选择 AArch64，Intel Mac 选择 x64。安装完成后，Oracle JDK 通常位于 `/Library/Java/JavaVirtualMachines/` 下。

macOS 可以列出已安装的 JDK：

```bash
/usr/libexec/java_home -V
```

临时为当前终端选择 JDK 25：

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 25)
export PATH="$JAVA_HOME/bin:$PATH"
```

### Windows

选择与系统匹配的 x64 安装包并完成安装。如果终端找不到 `java` 或 `javac`，检查系统环境变量：

- `JAVA_HOME` 指向 JDK 安装目录，而不是它的 `bin` 子目录。
- `Path` 包含 `%JAVA_HOME%\bin`。

修改环境变量后关闭并重新打开 PowerShell，避免旧终端继续使用修改前的环境。

### Linux

可以使用发行版的软件包管理器安装可信的 OpenJDK 25 构建，也可以按照 JDK 提供方的说明安装压缩包、Debian 包或 RPM。安装后如果系统中存在多个版本，需要通过发行版的 alternatives 机制或 `JAVA_HOME` 与 `PATH` 明确选择 25。

不要盲目复制与自己发行版不匹配的安装命令。包名和默认安装路径由 Linux 发行版及 JDK 提供方决定。

## 5. 验证终端环境

打开一个新终端，执行：

```bash
java -version
javac -version
```

输出中的特性版本都应为 `25`，补丁号可以不同。例如：

```text
java version "25.0.3" 2026-04-21 LTS
javac 25.0.3
```

这里需要同时检查两个命令：

- 只有 `java` 没有 `javac`，通常说明当前环境不是完整 JDK，或 `PATH` 指向了错误位置。
- 两个版本不同，说明 `PATH` 中混入了多套 Java 安装，编译和运行可能产生版本不兼容。

定位当前实际执行的命令：

::: code-group

```bash [macOS / Linux]
which java
which javac
echo "$JAVA_HOME"
```

```powershell [Windows PowerShell]
Get-Command java
Get-Command javac
$env:JAVA_HOME
```

:::

`JAVA_HOME` 常被 Maven、Gradle 和 IDE 用来定位 JDK；命令行能否直接找到 `java` 则主要由 `PATH` 决定。两者相关，但不是同一个变量。

## 6. 第一个 Java 程序

仓库示例位于 `examples/java/hello-world/HelloBackend.java`。下面的代码由 VitePress 直接从该文件导入，页面内容与实际运行的源码始终一致：

::: code-group

<<< ../../../examples/java/hello-world/HelloBackend.java{java:line-numbers} [HelloBackend.java]

:::

从仓库根目录进入示例目录：

```bash
cd examples/java/hello-world
```

### 类与文件名

`public final class HelloBackend` 声明了一个公开类。公开类名为 `HelloBackend`，文件名必须是 `HelloBackend.java`，包括大小写。

这里暂时把类理解为代码的组织单位。`final` 表示这个类不能被继承；私有构造方法避免创建没有意义的 `HelloBackend` 对象。这两项不是程序入口的必要条件，但能准确表达“这是一个只负责启动程序的类”。

### `main` 是程序入口

```java
public static void main(String[] args)
```

传统 Java 类程序从这个入口开始：

- `public`：JVM 启动器可以访问该方法。
- `static`：不创建 `HelloBackend` 对象也能调用。
- `void`：方法不返回结果。
- `String[] args`：接收命令行参数组成的字符串数组。

JavaScript/Node.js 文件通常从顶层语句开始执行；传统 Java 类则需要明确的 `main` 入口。JDK 25 也支持更紧凑的源文件写法，但本专题先学习在企业项目和旧版本中都普遍可见的经典形式。

### 输入、输出与错误

程序读取第一个命令行参数。没有参数时使用“前端开发者”；参数会先通过 `trim()` 去除首尾空白。

- `System.out` 是标准输出，用于正常结果。
- `System.err` 是标准错误，用于错误说明。
- `System.exit(1)` 以非零状态结束进程，告诉脚本、终端或部署平台本次执行失败。

这与 Node.js 的 `console.log`、`console.error` 和 `process.exit(1)` 作用相近。错误信息面向人，退出码面向调用程序，两者不应互相替代。

## 7. 显式编译并运行

先创建独立输出目录，再编译：

```bash
mkdir -p out
javac -d out HelloBackend.java
```

Windows PowerShell 中，`mkdir out` 也可以创建目录；目录已经存在时可以继续使用。

`-d out` 指定 `.class` 文件的输出位置。编译成功后目录中会出现：

```text
out/HelloBackend.class
```

运行类：

```bash
java -cp out HelloBackend 小朱
```

预期输出：

```text
你好，小朱！
Java 后端学习环境已经就绪。
```

这条命令中：

- `-cp out` 把 `out` 加入类路径，告诉启动器去哪里查找类。
- `HelloBackend` 是类名，不是 `HelloBackend.class`，也不是文件路径。
- `小朱` 位于类名之后，因此会成为 `args[0]`。

完整执行过程是：

1. Shell 把命令和参数交给 `java` 启动器。
2. `java` 创建 JVM，并在类路径中寻找 `HelloBackend`。
3. JVM 加载并验证 `HelloBackend.class`。
4. 启动器调用 `main`，`args` 中包含 `"小朱"`。
5. 程序校验输入，写入标准输出，然后以状态码 `0` 正常结束。

## 8. 直接运行源文件

JDK 25 的源码模式可以把编译和运行合并为一条命令：

```bash
java HelloBackend.java 小朱
```

输出与前面相同。源码模式会在内存中编译源文件并立即执行，不会在当前目录留下 `HelloBackend.class`。

源码模式适合单文件演示和小脚本；显式使用 `javac` 更适合理解构建产物，也更接近 Maven、Gradle 和 CI 中“先编译，再运行或测试”的工程流程。本节应掌握显式编译，不要只记住快捷命令。

## 9. 验证错误路径

传入一个只包含空格的参数：

```bash
java -cp out HelloBackend "   "
```

预期标准错误：

```text
错误：学习者名称不能为空。
```

macOS、Linux 和 PowerShell 可以在紧接着执行后查看退出码：

::: code-group

```bash [macOS / Linux]
echo $?
```

```powershell [Windows PowerShell]
$LASTEXITCODE
```

:::

结果应为 `1`。正常运行后则应为 `0`。

前端页面中的错误常被展示给用户；后端进程还必须让操作系统和自动化工具知道执行是否成功。因此，标准错误、退出码、日志和后续会学习的异常处理都是后端可观测性的一部分。

## 10. 三类常见错误

### 编译错误：源码不符合语言规则

把一行末尾的分号删除后运行 `javac`，会看到类似：

```text
error: ';' expected
```

`javac` 会给出文件、行号和原因，并且不会生成可用的新类文件。先处理第一条编译错误，因为后面的错误有时只是它引发的连锁反应。

### 启动错误：JVM 找不到要运行的类

如果忘记类路径：

```bash
java HelloBackend
```

而 `HelloBackend.class` 实际在 `out` 目录中，启动器会报告找不到或无法加载主类。修复方式是从示例目录执行 `java -cp out HelloBackend`，并确认大小写和输出目录一致。

### 运行时错误：程序已经启动，但执行中失败

如果不先判断 `args.length` 就直接读取 `args[0]`，无参数运行时会抛出 `ArrayIndexOutOfBoundsException`。这类问题通过输入校验或合理的异常处理解决，不能靠重新设置类路径解决。

当前示例主动检查空输入、打印清晰错误并返回失败状态。后续异常课程会区分可恢复异常、编程错误和业务错误，并说明何时捕获、何时继续抛出。

## 11. Java 与 JavaScript 的第一组对照

| 关注点 | Java 25 | JavaScript / Node.js |
| --- | --- | --- |
| 源文件 | `.java` | `.js`、`.mjs` 或 `.cjs` |
| 常规执行前检查 | `javac` 编译并检查静态类型 | 通常由运行时解析；TypeScript 或额外工具可提前检查 |
| 常规产物 | JVM 字节码 `.class` | JavaScript 源码或工具转换后的 JavaScript |
| 启动入口 | 传统类使用 `main` 方法 | 模块顶层代码开始执行 |
| 命令行参数 | `String[] args` | `process.argv` |
| 正常/错误输出 | `System.out` / `System.err` | `console.log` / `console.error` |
| 失败退出 | `System.exit(非零值)` | `process.exit(非零值)` 或设置 `exitCode` |

不要把“Java 需要编译”误解成“JavaScript 完全没有编译过程”。现代 JavaScript 引擎会在运行时解析并优化代码，前端构建工具也可能做转换和打包。这里的关键差异是：Java 项目的显式编译阶段会生成标准 JVM 字节码，并提前检查语言规则和静态类型。

## 12. 环境排错清单

当示例无法运行时，按顺序检查：

1. `java -version` 和 `javac -version` 是否都存在且特性版本均为 25。
2. 当前目录是否是 `examples/java/hello-world`。
3. 文件是否准确命名为 `HelloBackend.java`。
4. `javac -d out HelloBackend.java` 是否没有编译错误。
5. `out/HelloBackend.class` 是否存在。
6. 运行命令是否为 `java -cp out HelloBackend`，类名后没有 `.class`。
7. 如果版本不对，用 `which`、`Get-Command` 和 `JAVA_HOME` 检查实际路径。

复制错误信息时，保留第一条错误、执行命令、当前目录和版本输出。只有一句“Java 跑不了”通常不足以定位问题。

## 13. 本节总结

- JDK 提供开发工具和运行组件；JRE 表示运行环境职责；JVM 负责加载和执行字节码。
- 本专题统一使用 JDK 25 LTS，基础示例同时兼容常见的 JDK 17 与 21。
- `javac -d out HelloBackend.java` 把源码编译为类文件，`java -cp out HelloBackend` 启动 JVM 并运行类。
- `java HelloBackend.java` 是方便的源码模式，但不能替代对编译产物和类路径的理解。
- 后端程序需要同时考虑正常输出、错误说明和进程退出状态。
- 编译错误、启动错误和运行时错误发生在不同阶段，应使用不同线索排查。

下一节：[Java 变量、基本类型、运算符与控制流程](/backend/java/variables-types-operators-and-control-flow)。

## 14. 参考资料

- [OpenJDK：JDK 25 项目](https://openjdk.org/projects/jdk/25/)
- [Oracle：JDK 25 安装指南](https://docs.oracle.com/en/java/javase/25/install/)
- [Oracle：macOS 安装 JDK 25](https://docs.oracle.com/en/java/javase/25/install/installation-jdk-macos.html)
- [Oracle：Windows 安装 JDK 25](https://docs.oracle.com/en/java/javase/25/install/installation-jdk-microsoft-windows-platforms.html)
- [Oracle：JDK 25 的 `javac` 命令](https://docs.oracle.com/en/java/javase/25/docs/specs/man/javac.html)
- [Oracle：JDK 25 的 `java` 命令与源码模式](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html)
- [Oracle：Java SE 支持路线图](https://www.oracle.com/java/technologies/java-se-support-roadmap.html)
