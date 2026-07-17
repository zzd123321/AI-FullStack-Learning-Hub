---
title: Java 类加载、字节码、JIT、运行时内存与垃圾回收
description: 理解源码到 class 文件、类生命周期、栈与堆、即时编译和可达性垃圾回收
outline: deep
---

# Java 类加载、字节码、JIT、运行时内存与垃圾回收

> 适用环境：JDK 25 LTS。完整示例兼容 JDK 17 和 21。

## 先从第一课那条执行链继续向里看

第一课只需要知道 `.java` 被编译成 `.class`，再由 JVM 执行。本课把 JVM 这个黑盒打开，但第一次阅读不需要记字节码指令或收集器参数。

```text
.class 被类加载器找到
  → JVM 验证并准备类型
  → 首次主动使用时完成类初始化
  → 方法先解释执行，热点代码可能被 JIT 编译
  → 对象不再从 GC Roots 可达后，才具备回收条件
```

先掌握类加载、栈帧、堆、JIT 和“可达不等于仍有业务价值”这几个边界。字节码细节、逃逸分析和具体 GC 选择主要用于性能分析与故障诊断。

## 跟踪一次方法调用穿过 JVM

当 `main` 第一次执行 `new LearningPlan()` 时，不是源码直接被 CPU 执行：类加载器先按类名找到 class 字节，验证结构安全并为静态状态做准备；主动使用触发类初始化；执行引擎再解释或编译构造方法字节码。调用时当前线程创建栈帧保存局部变量和中间结果，对象通常由 JVM 管理在堆中，局部变量保存的是引用。

```text
javac 生成平台无关字节码
  → 类加载器按“名称 + 定义加载器”建立类身份
  → 解释器让方法立即开始运行
  → JIT 根据运行时热点和类型信息编译机器码
  → 假设失效时 JVM 还可能去优化并退回较通用路径
```

JIT 是持续观察后的优化，不等于“第二次调用一定编译”，也不保证所有代码都变成机器码。基准测试若忽略预热、死代码消除与运行环境，很容易测到编译过程而不是稳定业务性能。

方法返回后栈帧可被移除，但堆对象不会因“离开创建它的方法”就立刻回收。GC 从线程栈、静态字段等 GC Roots 追踪引用；只有不再可达的对象才具备回收资格。反过来，可达对象即使业务再也用不到，也不会被 GC 判断为垃圾，这正是许多内存泄漏的本质。

## 1. 学习目标

完成本节后，你应该能够：

- 描述从 `.java`、`.class` 到 JVM 执行代码的主要阶段。
- 区分 Java 语言规范、JVM 规范抽象和 HotSpot 实现细节。
- 使用 `javap` 查看类版本、常量池、描述符和方法字节码。
- 解释局部变量表、操作数栈以及常见 invoke 指令。
- 区分类的加载、验证、准备、解析与初始化。
- 判断哪些主动使用会触发类初始化，哪些常量读取不会。
- 理解类身份由二进制名称与定义类加载器共同决定。
- 区分 `ClassNotFoundException`、`NoClassDefFoundError`、`NoSuchMethodError` 等错误阶段。
- 说清 JVM 栈、栈帧、堆、方法区、运行时常量池和本地方法栈的规范角色。
- 解释 JIT 编译、分层编译、内联、逃逸分析、OSR 和反优化。
- 通过 GC Roots 与可达性判断对象是否可回收。
- 区分内存泄漏、内存不足、栈溢出和直接内存问题。
- 按吞吐、尾延迟和内存占用选择观测与调优方向。
- 避免用 `System.gc()`、单次计时和猜测对象位置得出错误结论。

## 2. 先分清三层概念

### Java 语言规范（JLS）

规定 Java 源码语义，例如什么时候初始化类、表达式如何求值、异常如何传播。

### Java 虚拟机规范（JVMS）

规定 class 文件格式、字节码指令、运行时数据区、加载链接过程等抽象行为。

### HotSpot

Oracle/OpenJDK 常用 JVM 实现，包含解释器、分层 JIT、具体垃圾收集器、Metaspace、诊断工具等。

“方法区”是 JVMS 逻辑区域，“Metaspace”是 HotSpot 实现类元数据存储的一部分。不能把规范抽象和某个 JVM 版本的物理布局完全画等号。

## 3. 从源码到执行的主路径

```text
.java 源码
   ↓ javac
.class 二进制
   ↓ ClassLoader
加载 → 链接（验证、准备、解析）→ 初始化
   ↓
解释器执行 / JIT 编译热点代码
   ↓
机器码在平台线程上运行，GC 管理可达对象
```

`javac` 是编译器，`java` 命令启动 JVM。JVM 执行的是 class 文件中的虚拟机指令及运行时生成的机器码，不是直接解释 Java 源文本。

其他语言只要能产生合法 class 文件，也可运行在 JVM 上。

## 4. class 文件不是机器码

class 文件是平台无关、结构严格的二进制格式，主要包含：

- 魔数 `0xCAFEBABE`。
- minor/major class 文件版本。
- 常量池。
- 类、父类、接口信息。
- 字段表、方法表。
- Code、LineNumberTable、BootstrapMethods 等属性。

同一个 class 文件可由不同 CPU 架构上的兼容 JVM 加载。真正机器码通常由解释器模板、JIT 编译器或 JVM runtime 在当前平台产生。

## 5. `--release` 决定什么

```bash
javac --release 17 App.java
```

它不仅选择语言/class 文件目标，还限制编译时可见的标准库 API 到对应 Java SE 版本。只设置旧的 `-source` 而继续链接新 JDK API，可能生成旧运行时无法工作的程序。

JDK 17 class 文件 major version 为 61。若用更高版本 class 文件放到旧 JVM，通常得到 `UnsupportedClassVersionError`。

第三方依赖仍需要单独检查其最低 JVM 版本；`--release` 不会改写依赖 jar 的字节码。

## 6. 用 `javap` 阅读而非反编译源码

```bash
javap -classpath out -c -p -s \
  learning.backend.jvm.JvmRuntimeApp
```

- `-c`：反汇编方法 Code 属性。
- `-p`：包含 private 成员。
- `-s`：显示 JVM 类型描述符。
- `-v`：显示 class 版本、常量池、属性和更多细节。
- `-l`：显示行号与局部变量表（前提是编译器写入对应调试信息）。

`javap` 输出是 class 文件结构和指令助记符，不保证还原原始变量名、注释、泛型写法或语法糖源码。

## 7. 常量池保存符号信息

class 文件常量池可能包含：

- 数字和字符串字面量。
- 类与接口的符号名称。
- 字段、方法和接口方法引用。
- NameAndType、MethodHandle、MethodType。
- invokedynamic/condy 的引导方法信息。

字节码中的 `#27` 等索引指向常量池项。加载链接过程中，符号引用可按 JVM 策略提前或延迟解析为运行时可直接使用的目标。

常量池不是只有 Java `static final` 常量，也不能简单理解为“所有常量都在堆里”。

## 8. JVM 是基于栈的指令集

每个方法的栈帧包含局部变量数组和操作数栈。指令经常把值压入操作数栈、执行操作、再把结果写回局部槽或传给下一条指令。

```text
aload_0       // 把局部槽 0 的引用压栈
invokevirtual // 消费接收者和参数，调用实例方法
istore_1      // 把 int 结果存到局部槽 1
iload_1       // 再把局部槽 1 的 int 压栈
areturn       // 返回引用
```

局部槽可存基本值或引用。一个局部引用在栈帧中，不代表它指向的对象也“在栈上”；JIT 可能进一步消除分配，但这是实现优化，不是 Java 源码可依赖的对象位置语义。

## 9. 类型描述符

常见描述符：

| Java 类型 | JVM 描述符 |
| --- | --- |
| `int` | `I` |
| `boolean` | `Z` |
| `void` | `V` |
| `String` | `Ljava/lang/String;` |
| `int[]` | `[I` |
| `String[]` | `[Ljava/lang/String;` |

方法描述符先列参数、再列返回值：

```text
(Ljava/lang/String;I)Ljava/lang/String;
```

表示参数为 String、int，返回 String。描述符使用擦除后的运行时类型，泛型细节通常保存在 Signature 属性。

## 10. 常见方法调用指令

- `invokestatic`：调用 static 方法。
- `invokevirtual`：基于接收者动态分派普通实例方法。
- `invokeinterface`：调用接口方法。
- `invokespecial`：构造器、private 方法及某些 super 调用。
- `invokedynamic`：由引导方法在运行时链接调用点，常用于 Lambda 和现代字符串拼接。

看到 invokedynamic 不代表“每次都反射调用”。调用点链接后可被 JVM 优化和内联。

## 11. `new` 不会直接调用构造器

典型对象创建字节码：

```text
new           #LearningPlan
dup
...
invokespecial #LearningPlan.<init>
```

`new` 分配未初始化对象并把引用压栈，`dup` 保留一份引用，`invokespecial <init>` 执行构造器。验证器跟踪“未初始化引用”，防止构造完成前执行不合法操作。

对象初始化还包括默认值、实例字段初始化表达式、父类构造器和构造器体，执行顺序应按 JLS 推理。

## 12. 类的完整生命周期术语

常见阶段：

1. **加载**：找到二进制表示，创建对应 `Class` 对象。
2. **验证**：检查 class 结构、指令和类型安全。
3. **准备**：创建 static 字段并赋默认值，建立实现所需结构。
4. **解析**：把符号引用检查并转成可直接使用的引用；允许延迟发生。
5. **初始化**：执行 static 字段初始化表达式和 static 初始化块。
6. **使用**：创建实例、调用方法等。
7. **卸载**：满足实现条件时连同定义类加载器一起卸载。

链接包含验证、准备和解析。加载不等于初始化，解析也不保证一次性在初始化前全部完成。

## 13. 准备阶段不是执行 static 初始化器

```java
static int count = 42;
```

准备阶段从规范角度先为 count 创建存储并设默认值 0；初始化阶段才执行赋值 42 的代码。

编译期常量可能通过 class 文件 ConstantValue 属性在准备相关过程中获得值，但不要把这当作任意 static final 对象的执行规则。

```java
static final Integer VALUE = Integer.valueOf(42);
```

这不是编译期常量变量，仍需执行初始化代码。

## 14. 什么会触发类初始化

类或接口 T 通常在首次发生以下主动使用前初始化：

- 创建 T 的实例。
- 调用 T 声明的 static 方法。
- 给 T 声明的 static 字段赋值。
- 读取 T 声明且不是常量变量的 static 字段。
- 某些反射调用。
- T 是 JVM 启动指定的初始类。

初始化类之前会先初始化其父类，以及特定包含 default 方法的父接口。接口初始化规则与类不完全相同。

## 15. 什么通常不会触发初始化

- 仅声明某类型变量但不主动使用。
- 通过子类名读取实际声明在父类的 static 字段，不会因此初始化子类。
- 读取编译期常量变量，值可能已内联到调用类。
- 获取数组类型，例如 `RuntimeFeature[]`，创建的是数组类。
- 仅加载 Class 而显式选择不初始化，例如部分 `Class.forName` 重载用法。

本课先读取 `RuntimeFeature.COMPILE_TIME_NAME`，没有出现初始化输出；首次调用 `featureVersion()` 才打印初始化信息。

## 16. 编译期常量内联的兼容陷阱

```java
public static final String NAME = "JVM";
```

调用方编译后可能把 JVM 字符串直接放进自己的常量池，运行时不再读取声明类字段。

若只替换库 jar，把 NAME 改成 HotSpot，却不重新编译调用方，旧调用方可能继续显示 JVM。

这也是 public 常量值变更的二进制部署陷阱。发布库时不要把可能变化的配置伪装成 public 编译期常量。

## 17. 类初始化的线程安全与失败

JVM 协调同一个 Class 对象的初始化：一个线程执行初始化，其他需要该类的线程等待。正常完成后，初始化结果对其他线程安全可见。

static 初始化若抛出非 Error 异常，首次主动使用通常看到 `ExceptionInInitializerError`；该 Class 随后处于错误状态，再次使用可能得到 `NoClassDefFoundError: Could not initialize class`。

不要在 static 初始化中执行不可靠远程 IO、启动复杂线程或形成循环依赖。初始化失败通常无法通过简单重试恢复当前 Class。

## 18. 类加载器与类身份

运行时类型身份不仅是 `learning.User` 这个二进制名称，还包括定义它的 ClassLoader。

两个不同加载器各自定义同名字节码，会得到两个不同 Class；对象之间通常不能直接强制转换，即使源码完全相同。

这解释了插件、应用服务器、热部署中的典型错误：

```text
ClassCastException: X cannot be cast to X
```

日志中应同时记录类名和 ClassLoader 关系，而不是只看全限定名。

## 19. 内置类加载器

现代 JDK 常见层次：

- **Bootstrap loader**：加载 `java.base` 等核心类，由 JVM 实现表示；Java API 中 `String.class.getClassLoader()` 返回 null。
- **Platform class loader**：加载部分平台模块。
- **System/Application class loader**：加载 classpath/module path 上的应用类。

内置加载器通常按委派关系先让上层尝试，避免应用伪造核心类。自定义加载器可实现插件隔离、网络加载或转换，但必须维护类型安全和资源释放。

## 20. 类加载器泄漏

类通常只有在其定义 ClassLoader 不再可达且 JVM 决定卸载时才能整体卸载。以下引用容易让旧部署加载器长期可达：

- static 集合。
- 未停止线程及其 context ClassLoader。
- ThreadLocal 值。
- JDBC 驱动/日志/序列化缓存注册。
- 定时任务、监听器和全局 MBean。

这类问题会增长类元数据、常量池和相关对象，常见于重复热部署。堆转储里要沿 GC Roots 查加载器保留链。

## 21. `ClassNotFoundException` 与 `NoClassDefFoundError`

### `ClassNotFoundException`

受检异常，常由应用主动调用 `Class.forName` 或 ClassLoader.loadClass 查找失败产生，调用者可决定替代策略。

### `NoClassDefFoundError`

Error，JVM 在执行已编译代码需要某个定义却无法使用时产生。原因可能是运行 classpath 缺 jar，也可能是该类先前初始化失败。

不要只看到 NoClassDefFoundError 就断言“文件不存在”；检查最早 cause 和首次初始化错误。

## 22. 其他典型链接错误

- `UnsupportedClassVersionError`：class 版本高于运行 JVM 支持。
- `ClassFormatError`：二进制结构非法。
- `VerifyError`：字节码未通过验证。
- `NoSuchMethodError` / `NoSuchFieldError`：编译时和运行时依赖版本不一致。
- `IllegalAccessError`：运行时符号访问不再合法。
- `IncompatibleClassChangeError`：类/接口、static/实例等二进制形态不兼容。

这些是 Error，通常说明部署或二进制兼容问题，不应在业务请求里捕获后继续假装正常。

## 23. JVMS 运行时数据区总览

规范定义的主要区域：

| 区域 | 共享范围 | 主要内容 |
| --- | --- | --- |
| pc register | 每线程 | 当前 JVM 指令位置 |
| JVM stack | 每线程 | Java 方法栈帧 |
| native method stack | 每线程/实现相关 | native 调用支持 |
| heap | JVM 共享 | 对象和数组的运行时存储语义 |
| method area | JVM 共享 | 类结构、方法/字段信息、方法代码等 |
| runtime constant pool | 每个类/接口，方法区组成部分 | class 常量池的运行时表示 |

具体 JVM 可以把数据物理布局、压缩、移动或优化，只要满足规范行为。

## 24. JVM 栈与栈帧

每个线程拥有自己的 JVM 栈。每次方法调用创建栈帧，正常返回或异常退出时销毁。

栈帧包含：

- 局部变量数组。
- 操作数栈。
- 指向运行时常量池/动态链接所需信息。
- 正常返回与异常完成支持信息。

不同线程不能直接访问彼此局部变量槽，但多个局部引用可以指向同一个共享堆对象，因此仍会发生数据竞争。

## 25. `StackOverflowError`

无限递归或调用深度超出线程栈容量时，通常抛 StackOverflowError：

```java
void recurse() {
    recurse();
}
```

它与堆 OOM 不同。先检查递归终止条件、数据是否有环、框架代理是否互相调用，而不是立即增大 `-Xss`。

虚拟线程栈由可增长的栈块实现，但深度无限仍会溢出，也会消耗堆资源。

## 26. 堆与对象语义

从 JVMS 抽象看，对象和数组由堆提供存储，堆由所有线程共享并由自动存储管理系统回收。

但优化后的机器码可能：

- 标量替换对象字段。
- 完全消除未逃逸分配。
- 把分配放在线程本地分配缓冲区快速完成。
- 移动存活对象并更新引用。

因此不要用“new 一定是一次昂贵系统调用”或“对象绝对在某个固定地址”分析 Java 性能。

## 27. 方法区与 HotSpot Metaspace

JVMS 方法区是共享逻辑区域。HotSpot 从 JDK 8 起使用 native memory 中的 Metaspace 保存许多类元数据，而类镜像 `java.lang.Class` 和相关对象仍与堆有联系。

Metaspace 可增长，但不是无限。大量动态生成类、代理类或类加载器泄漏可能导致：

```text
OutOfMemoryError: Metaspace
```

可用 Native Memory Tracking、JFR、`jcmd VM.classloader_stats` 等观察，而不是只分析 Java 堆占用。

## 28. 解释器与 JIT 协作

HotSpot 通常先解释执行方法，同时收集：

- 调用次数和循环回边次数。
- 分支概率。
- 接收者实际类型。
- 调用点是否单态/多态。

热点达到阈值后，JIT 编译为当前 CPU 的优化机器码。这样避免应用启动时把所有冷代码都做昂贵优化。

具体阈值和编译策略是实现细节，会随版本、硬件、参数和运行模式变化。

## 29. 分层编译、C1 与 C2

HotSpot 分层编译常组合：

- 解释器：快速启动和采集信息。
- C1：较快编译，提供轻量优化和分析支持。
- C2：对足够热点代码做更激进优化。

代码可能经历解释 → 较低层编译 → 高优化编译，而不是只编译一次。

不要把某次日志中的编译层级当成 Java 规范，也不要在没有测量时关闭分层编译。

## 30. 方法内联为何重要

JIT 可把小方法体复制到调用点，消除调用开销并暴露更多优化机会：

- 常量传播。
- 分支消除。
- 逃逸分析。
- 标量替换。
- 去虚拟化。

getter、record accessor 和小型组合方法不一定产生可观的调用成本。为了“避免方法调用”破坏封装，通常得不偿失。

过大方法、过深调用、多态过强或代码缓存压力可能阻止内联，应由 JIT 日志和基准验证。

## 31. OSR 与长循环

On-Stack Replacement（栈上替换）允许正在解释器中运行的长循环，在方法尚未返回时切换到已编译版本。

这解释了长循环运行中途速度可能变化。也说明用一个循环前后时间相减容易混入：

- 类加载与初始化。
- JIT 编译。
- OSR。
- GC。
- CPU 频率和系统噪声。

微基准应使用 JMH，而不是手写 `System.nanoTime()` 一次就下结论。

## 32. 推测优化与反优化

JIT 会根据运行期 profile 做推测，例如某接口调用长期只出现一种实现，于是内联该实现。

若后来加载新类或出现不同接收者，使假设失效，JVM 可 deoptimize：撤销优化机器码，把执行状态恢复到较通用层级，再重新编译。

反优化是动态 JVM 的正常机制，不必看到一次 deoptimization 就判断故障。持续抖动才需要结合编译日志和业务类型分布调查。

## 33. 逃逸分析不是“对象都上栈”

JIT 分析对象是否逃出方法或线程，可能据此：

- 消除分配。
- 标量替换字段。
- 消除不必要锁。

“栈上分配”是常见通俗说法，但 HotSpot 优化可能根本不创建完整对象。代码不能依赖对象是否被实际分配，也不能用 `==`、finalize 或弱引用去探测优化细节。

逃逸分析是否成功取决于内联、控制流、JVM 版本和代码形态。

## 34. GC 不是引用计数

主流 HotSpot 收集器基于从 GC Roots 出发的可达性追踪。相互引用但不再从根可达的对象环可以被回收：

```text
A ↔ B
```

只要没有根路径到 A/B，它们不因循环引用永久存活。

Java API 不保证对象在变得不可达后何时回收，更不保证 GC 立刻把内存还给操作系统。

## 35. 常见 GC Roots

概念上常见根来源包括：

- 活动线程栈帧中的引用。
- 已加载类的 static 字段。
- JNI 全局/局部引用。
- JVM 内部结构和活动线程对象。
- 某些同步、监控和运行时设施持有的引用。

分析内存泄漏时，重点不是“这个对象为什么没 finalize”，而是堆转储里从 GC Root 到对象的最短/支配保留链。

## 36. 对象状态：可达性比作用域更重要

局部变量离开源码花括号，不代表对象立刻回收；JIT 可能判断引用更早死亡，也可能某个集合仍持有对象。

常见可达性类别还包括 strongly、softly、weakly 和 phantom reachable。WeakReference/PhantomReference 用于特定缓存或清理协议，不是通用资源管理替代品。

文件、socket、数据库连接应 try-with-resources 确定释放；不能等 GC。

## 37. 分代假设

许多应用对象“朝生夕死”，少量对象存活较久。分代收集器利用这一经验，把新对象和长期对象区别处理。

但年轻代/老年代的具体区域、晋升阈值和回收过程属于收集器实现。不同收集器可能采用 region、colored pointer、并发迁移等不同设计。

“对象一定经过 Eden → Survivor → Old”不是对所有现代收集器都成立的规范规则。

## 38. 垃圾收集器关注点

HotSpot 提供多种收集器，常见方向包括：

- Serial：实现简单、单 GC 线程，适合小堆/受限场景。
- Parallel：关注整体吞吐。
- G1：区域化、平衡吞吐和可预测暂停，是常见服务端选择。
- ZGC：面向大堆和低暂停，许多工作并发执行。

可用收集器和默认值取决于 JDK 发行版、平台与版本。部署时用实际 `java -XX:+PrintCommandLineFlags -version`、启动日志和官方版本文档确认。

## 39. Stop-the-world 不等于所有 GC 全程暂停

部分 GC 阶段需要 safepoint，让 Java 线程暂停；许多现代收集器也把标记、重定位准备等工作与应用线程并发执行。

并发 GC 仍消耗 CPU、内存带宽和额外空间。低暂停不是免费，也不保证业务请求没有长尾：锁、下游 IO、操作系统调度和类初始化也会造成延迟。

分析停顿要同时看 GC 日志、safepoint、JFR 和业务 tracing。

## 40. 吞吐、延迟与占用权衡

- **吞吐**：应用工作时间占比或单位时间完成工作量。
- **暂停/尾延迟**：P95/P99/P999 请求受停顿影响的程度。
- **内存占用**：堆、Metaspace、线程栈、code cache、direct/native memory 总量。

更大堆可能降低回收频率，却增加某些阶段工作量和容器内存压力。更并发的收集器可能用更多 CPU 换低暂停。

调优前先写 SLO、流量和资源限制，没有“所有服务最快”的统一参数。

## 41. Java 内存泄漏仍然存在

GC 只能回收不可达对象。业务不再需要但仍可达，就是逻辑内存泄漏：

- 无上限 Map/List 缓存。
- 监听器注册后不注销。
- ThreadLocal 在线程池中不 remove。
- 队列生产快于消费且无容量。
- session、指标标签或请求 ID 基数无上限。
- 类加载器被线程/static 缓存保留。

泄漏不一定立即 OOM，可能先表现为 GC 更频繁、存活集上升、尾延迟恶化。

## 42. `OutOfMemoryError` 不只有 Java heap space

常见信息方向：

- `Java heap space`：堆无法满足分配。
- `GC overhead limit exceeded`：大量 GC 但回收很少。
- `Metaspace`：类元数据区域不足或类加载器泄漏。
- `Direct buffer memory`：NIO 直接缓冲预算不足。
- `unable to create native thread`：原生线程/地址空间/系统限制。

看到 OOM 不应只增大 `-Xmx`。先保留完整错误、GC 日志、heap dump、容器限制、native memory 和线程数证据。

## 43. `System.gc()` 只是请求

```java
System.gc();
```

规范不保证立刻收集、回收某个对象或执行清理。JVM 参数还可能禁用或改变显式 GC 行为。

不要在请求路径调用它“释放内存”，也不要通过调用后内存变化证明对象生命周期。压测和诊断若必须触发，应明确这是观测手段并理解收集器行为。

## 44. Finalization 与资源清理

finalization 已弃用并计划移除，具有延迟不可控、复活、安全和性能问题。

资源所有权优先级：

1. try-with-resources / AutoCloseable。
2. 明确 close/shutdown 生命周期。
3. Cleaner 仅作为最后防线，不能承担关键业务正确性。

GC 管内存可达性，不替你提交事务、刷新关键文件或释放限量连接。

## 45. 基础 JVM 观测命令

```bash
java -Xlog:gc*,safepoint -Xms256m -Xmx256m \
  -cp out learning.backend.jvm.JvmRuntimeApp
```

```bash
jcmd <pid> VM.version
jcmd <pid> VM.flags
jcmd <pid> GC.heap_info
jcmd <pid> VM.classloader_stats
jcmd <pid> Thread.print
```

发生 OOM 时可考虑：

```text
-XX:+HeapDumpOnOutOfMemoryError
-XX:HeapDumpPath=/writable/path
```

生产环境开启前确认磁盘容量、隐私数据、容器挂载和转储耗时。

## 46. 完整示例：初始化与字节码观察

::: code-group

<<< ../../../examples/java/jvm-runtime/src/learning/backend/jvm/RuntimeFeature.java{java:line-numbers} [RuntimeFeature.java]

<<< ../../../examples/java/jvm-runtime/src/learning/backend/jvm/LearningPlan.java{java:line-numbers} [LearningPlan.java]

<<< ../../../examples/java/jvm-runtime/src/learning/backend/jvm/JvmRuntimeApp.java{java:line-numbers} [JvmRuntimeApp.java]

:::

编译：

```bash
cd examples/java/jvm-runtime
mkdir -p out
javac --release 17 -Xlint:all -d out \
  src/learning/backend/jvm/RuntimeFeature.java \
  src/learning/backend/jvm/LearningPlan.java \
  src/learning/backend/jvm/JvmRuntimeApp.java
```

在 JDK 25 运行：

```bash
java -cp out learning.backend.jvm.JvmRuntimeApp
```

预期输出：

```text
程序开始
编译期常量：JVM
准备访问运行期静态值
初始化：RuntimeFeature
运行期 JDK 特性版本：25
学习计划：JVM 基础，主题数：3
应用类加载器存在：true
String 由引导加载器加载：true
```

若在 JDK 17/21 运行，同一兼容 class 文件的“运行期 JDK 特性版本”分别为 17/21，这是程序主动查询当前 JVM 的结果。

执行过程：

1. JVM 加载、链接并初始化初始类 JvmRuntimeApp，再调用 main。
2. RuntimeFeature.COMPILE_TIME_NAME 已被调用方内联，读取时不触发 RuntimeFeature 初始化。
3. 调用 RuntimeFeature.featureVersion 是主动使用；JVM 先执行其 static 初始化。
4. Runtime.version 在初始化阶段读取实际运行 JDK 特性版本。
5. new、dup、invokespecial 创建并初始化 LearningPlan，构造器复制 topics。
6. summarize 的 plan 引用与 topicCount 值存放在当前栈帧局部槽语义中。
7. 应用 Class 的加载器非 null；String 由 bootstrap loader 加载，API 表示为 null。

## 47. 查看示例字节码

```bash
javap -classpath out -c -p -s \
  learning.backend.jvm.JvmRuntimeApp
```

重点观察：

- 输出编译期常量时只有完整字符串 `ldc`，没有读取 RuntimeFeature 字段的 `getstatic`。
- `featureVersion()` 使用 `invokestatic`。
- LearningPlan 使用 `new`、`dup`、`invokespecial <init>`。
- List.size 通过 `invokeinterface`。
- 字符串拼接在 JDK 17 目标中通常使用 `invokedynamic makeConcatWithConstants`。
- summarize 参数位于局部槽 0，topicCount 通过 `istore_1` 保存。

查看 class 版本和常量池：

```bash
javap -classpath out -v learning.backend.jvm.JvmRuntimeApp
```

`--release 17` 生成的输出应包含：

```text
major version: 61
Constant pool:
```

字节码细节可因 javac 版本和目标版本变化，课程关注语义对应，不要求所有指令偏移完全相同。

## 48. JavaScript / Node.js 对照

| Java/JVM | JavaScript/Node.js |
| --- | --- |
| javac 输出 class 字节码 | JS 引擎解析源码，可能生成内部字节码/IR |
| ClassLoader | ES module/CommonJS 加载器，语义不同 |
| JVM 验证、链接、初始化 | 模块实例化与求值阶段，有自己的规范 |
| HotSpot 解释器 + 分层 JIT | V8 等也有解释器和优化编译器 |
| JVM 栈帧 | JS 调用栈帧 |
| Java heap/GC | JS heap/GC |
| class 初始化 | 模块顶层代码首次求值，触发规则不同 |

两者都可能 JIT、内联和反优化，因此普通微基准都需要预热和专业 harness。Java class 初始化、类加载器身份、字节码验证和 Node 模块缓存不能仅凭表面相似互相套用。

Java 与 JS 都由 GC 管理对象内存，但文件、socket、数据库连接仍必须显式关闭或遵循框架生命周期。

## 49. 常见错误

- 把 `.class` 当成当前 CPU 机器码。
- 把 JLS、JVMS 与 HotSpot 具体布局混为一谈。
- 认为加载 class 就一定立即初始化。
- 把准备阶段的默认值与 static 初始化表达式混在一起。
- 修改 public static final 编译期常量后只替换库 jar，不重编调用方。
- 看到 `ClassCastException: X cannot be cast to X` 只检查类名，不检查 ClassLoader。
- 把所有 NoClassDefFoundError 都归因于缺 jar，忽略初始化失败。
- 编译和运行依赖版本不一致，出现 NoSuchMethodError 后在业务层捕获。
- 认为引用在局部变量里，所以对象必然物理分配在栈上。
- 把 Metaspace 当成 JVMS 方法区的唯一永久实现定义。
- 认为 JIT 一次编译后永不变化，忽略 profile 和反优化。
- 手写一次 nanoTime 微基准，不预热、不消费结果。
- 认为循环引用对象不会被 GC。
- 认为变量离开源码作用域就立刻回收。
- 调用 System.gc 后等待 finalize 完成业务清理。
- OOM 时只扩大 Xmx，不区分堆、Metaspace、direct memory 和线程。
- 只看平均 GC 暂停，不看尾延迟、分配速率和存活集。

## 50. 排查顺序

1. 记录 `java -version`、`javac -version`、class major version 和实际启动命令。
2. 对链接错误比较编译 classpath 与运行 classpath/module path，定位重复/冲突 jar。
3. 用 `-Xlog:class+load=info,class+init=info` 观察加载与初始化来源。
4. 记录 Class.getClassLoader 和 code source，排查插件/热部署类型冲突。
5. 用 javap 检查调用方实际引用的字段、方法描述符和常量是否已内联。
6. 栈溢出先看递归调用链；堆 OOM 看 heap dump；Metaspace 看类和加载器统计。
7. 查看 GC 日志中的分配速率、回收前后占用、停顿和并发周期。
8. 用 JFR 关联分配热点、锁、线程、类加载、GC 与业务延迟。
9. JVM 总内存异常时同时检查堆、Metaspace、code cache、direct/native memory 与线程栈。
10. 调参前建立基线和 SLO，每次只改可解释变量并在真实负载下比较。

## 51. 本节总结

- javac 把 Java 源码编译成平台无关 class 文件，JVM 再解释或 JIT 成当前平台代码。
- class 文件包含版本、常量池、字段、方法、Code 和其他属性。
- JVM 字节码以局部变量数组和操作数栈为核心执行模型。
- 类先加载，再链接（验证、准备、解析），最后在主动使用前初始化。
- 编译期常量可内联，读取它不一定触发声明类初始化，也会带来部署兼容陷阱。
- 运行时类型身份由二进制名称和定义 ClassLoader 共同决定。
- 每个线程有 JVM 栈，堆与方法区逻辑上共享；实现可优化对象和元数据布局。
- HotSpot 通过解释、profile、分层 JIT、内联、OSR 和反优化动态执行代码。
- GC 从 Roots 追踪可达对象，能回收不可达循环，但不能回收仍被错误引用的泄漏对象。
- 收集器在吞吐、暂停和内存占用间权衡，低暂停并非零成本。
- System.gc 不保证回收时机，finalization 不能承担资源正确性。
- 诊断应结合版本、类加载日志、javap、JFR、GC 日志、heap dump 与 native memory 证据。

下一节：[Java GC 日志、JFR、线程转储、堆转储与故障排查](/backend/java/gc-logs-jfr-thread-dumps-heap-dumps-and-troubleshooting)。

## 52. 参考资料

- [Java Language Specification 25：Chapter 12 Execution](https://docs.oracle.com/javase/specs/jls/se25/html/jls-12.html)
- [JVMS 25：Chapter 2 The Structure of the JVM](https://docs.oracle.com/javase/specs/jvms/se25/html/jvms-2.html)
- [JVMS 25：Chapter 4 The class File Format](https://docs.oracle.com/javase/specs/jvms/se25/html/jvms-4.html)
- [JVMS 25：Chapter 5 Loading, Linking, and Initializing](https://docs.oracle.com/javase/specs/jvms/se25/html/jvms-5.html)
- [Oracle JDK 25：`javap` 命令](https://docs.oracle.com/en/java/javase/25/docs/specs/man/javap.html)
- [Oracle JDK 25：HotSpot VM Performance Enhancements](https://docs.oracle.com/en/java/javase/25/vm/java-hotspot-virtual-machine-performance-enhancements.html)
- [Oracle JDK 25：Garbage Collection Tuning Guide](https://docs.oracle.com/en/java/javase/25/gctuning/)
- [OpenJDK JMH](https://openjdk.org/projects/code-tools/jmh/)
