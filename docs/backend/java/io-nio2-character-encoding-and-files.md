---
title: Java IO、NIO.2、字符编码与文件操作
description: 理解字节与字符边界，使用 Path 和 Files 安全读写、复制、移动并发布文件
outline: deep
---

# Java IO、NIO.2、字符编码与文件操作

> 适用环境：JDK 25 LTS。本节示例兼容 JDK 17 和 21，文本文件统一显式使用 UTF-8。

## 从内存走向外部世界

到上一课为止，大部分数据只存在于 JVM 内存里，程序结束就消失。文件让数据跨越一次程序运行继续存在，但也带来新的边界：路径可能错误、权限可能不足、磁盘可能失败，文本字节还必须按正确编码还原成字符。

本课按实际读文件的顺序展开：

```text
Path 指向文件位置
  → Files 打开操作系统资源
  → 读取原始字节
  → UTF-8 decoder 把字节解释成字符
  → 程序处理文本
  → 无论成功失败都关闭资源
```

第一次只需会用 `Path`、`Files.readString/writeString` 和 UTF-8，并能处理 `IOException`。流式读取、符号链接、原子移动和 TOCTOU 属于数据量或可靠性要求提高后的进阶内容。

## 文本不是直接躺在磁盘上的“字符”

Java 内存里的 `String` 保存 Unicode 文本；磁盘只保存字节。写文件时编码器按 UTF-8 把字符变成字节，读文件时解码器再按同一规则还原。若写入用 UTF-8、读取却猜成其他编码，文件没有“自动坏掉”，而是同一串字节被错误解释。

```text
"学习"（Java 字符串）
  → UTF-8 编码 → E5 AD A6 E4 B9 A0（磁盘字节）
  → UTF-8 解码 → "学习"
```

路径也不是文件本身。`Path.of("data/log.csv")` 表示一个位置，若它是相对路径，就要从 JVM 的当前工作目录解析；IDE 与终端的工作目录不同，是“文件明明存在却找不到”的常见原因。排查时先打印 `toAbsolutePath()`，不要立即硬编码个人电脑的绝对路径。

写重要结果时还要区分“写完内容”和“对读者发布完整版本”。直接覆盖目标文件可能让崩溃留下半个文件；常见做法是先写同文件系统的临时文件，刷新并校验成功后再移动为目标名。原子移动是否受支持取决于文件系统，所以代码仍须处理不支持与移动失败，而不是把 `ATOMIC_MOVE` 当成绝对保证。

## 1. 学习目标

完成本节后，你应该能够：

- 区分字节流、字符流、缓冲层和文件系统操作。
- 解释 Unicode 字符与 UTF-8 字节之间的编码、解码过程。
- 使用 `Path` 表示路径，并正确处理相对路径、绝对路径和规范化。
- 使用 `Files` 读取、写入、创建、复制、移动和删除文件及目录。
- 根据文件大小选择 `readString`、缓冲 Reader 或流式 API。
- 显式选择打开选项，避免意外覆盖或追加。
- 理解元数据、符号链接、文件遍历和 TOCTOU 竞态风险。
- 通过“临时文件 + 移动”降低写出半成品文件的风险。
- 区分输入数据错误与底层 IO 错误，并映射不同退出码。

## 2. IO 不只等于“读文件”

IO（Input/Output）是程序与外部世界交换数据的过程，包括：

- 文件和目录。
- 标准输入、标准输出与标准错误。
- 网络连接。
- 数据库连接。
- 内存缓冲区和压缩流。

Java 常见 IO API 可以按职责理解：

```text
数据内容
├─ 原始字节：InputStream / OutputStream
├─ 文本字符：Reader / Writer
└─ 缓冲包装：BufferedInputStream / BufferedReader / ...

文件系统
├─ 路径表示：Path
├─ 文件操作：Files
├─ 属性：BasicFileAttributes 等
└─ 通道与随机访问：FileChannel / SeekableByteChannel
```

`java.io` 中的流仍然是核心抽象；JDK 7 引入的 NIO.2 通过 `java.nio.file.Path` 与 `Files` 提供现代文件系统操作。NIO.2 并不是要求把所有 Reader/Writer 都丢掉，两套 API 经常组合使用。

## 3. 字节流与字符流

### 字节流处理原始数据

`InputStream` 与 `OutputStream` 处理 8 位字节，适合：

- 图片、音频、ZIP 等二进制文件。
- 网络协议载荷。
- 不希望解释内容编码的复制操作。

```java
try (InputStream input = Files.newInputStream(source);
     OutputStream output = Files.newOutputStream(target)) {
    input.transferTo(output);
}
```

二进制数据不能先随意转成字符串再转回字节，否则错误字符集或替换字符可能破坏内容。

### 字符流处理文本

`Reader` 与 `Writer` 处理 Java 字符数据，并在外部字节与字符之间进行编解码：

```java
try (BufferedReader reader = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
    String firstLine = reader.readLine();
}
```

文本文件在磁盘上仍然是字节。Reader 只有知道字符集，才能把字节解释为字符。

## 4. Unicode、字符集与 UTF-8

必须区分三个概念：

- **Unicode 代码点**：抽象字符编号，例如 `U+4E2D`。
- **Java 字符数据**：`String` 内部以 UTF-16 代码单元表达文本，某些代码点需要两个 `char`。
- **字符编码**：把字符映射为字节序列的规则，例如 UTF-8。

写文件是编码，读文件是解码：

```text
Java String ── UTF-8 编码 ──► 文件字节
Java String ◄─ UTF-8 解码 ─── 文件字节
```

如果写入使用 UTF-8，读取却按其他字符集解码，中文可能乱码或触发解码错误。

```java
Files.writeString(path, text, StandardCharsets.UTF_8);
String text = Files.readString(path, StandardCharsets.UTF_8);
```

JDK 18 起默认字符集通常是 UTF-8，JDK 25 文档也规定默认值为 UTF-8，除非用实现相关方式覆盖。但协议、持久化文件和跨系统数据仍应显式声明字符集，避免启动参数、旧环境或第三方工具造成隐式差异。

`StandardCharsets.UTF_8` 始终可用，不需要处理“不支持 UTF-8”的异常。

## 5. 换行、BOM 与格式约定

文本跨平台时还要约定：

- Unix/macOS 常用 LF（`\n`）。
- Windows 文本常见 CRLF（`\r\n`）。
- `System.lineSeparator()` 返回当前平台行分隔符。
- UTF-8 文件可能带 BOM，也可能不带；许多协议更倾向无 BOM。

`BufferedReader.readLine()` 会去掉行结束符，因此适合逐行解析不同平台生成的文本。生成供当前用户阅读的本地文本可使用 `%n` 或 `System.lineSeparator()`；生成有固定规范的协议文件时应遵守协议指定的换行。

本课报告使用 `String.format` 的 `%n`，跟随运行平台。输入文件不依赖特定换行风格。

## 6. `Path` 表示路径，不代表文件一定存在

```java
Path path = Path.of("data", "study-log.csv");
```

创建 `Path` 只解析路径字符串，不会创建文件，也不保证目标存在。`Path` 对象不可变，调用 `resolve`、`normalize` 等方法会返回新对象。

常用组件：

```java
path.getFileName(); // study-log.csv
path.getParent();   // data
path.getRoot();     // 相对路径通常为 null
```

### 相对路径基于进程工作目录

```java
Path relative = Path.of("data/study-log.csv");
Path absolute = relative.toAbsolutePath();
```

它不是基于 `.java` 文件或类文件所在目录。IDE、测试、Maven 和生产服务可能使用不同工作目录，因此配置文件路径应明确记录解析基准。

### 路径拼接

```java
Path base = Path.of("data");
Path child = base.resolve("study-log.csv");
```

使用 `resolve` 比手工拼接 `/` 或 `\` 更跨平台。若参数是绝对路径，`base.resolve(absolute)` 通常返回该绝对路径，这在处理不可信输入时需要特别检查。

## 7. `normalize` 与真实路径

```java
Path normalized = path.toAbsolutePath().normalize();
```

`normalize()` 只进行语法化简，例如移除 `.` 和可消解的 `..`，不会访问文件系统。它不处理符号链接造成的真实跳转。

```java
Path real = path.toRealPath();
```

`toRealPath()` 会访问文件系统，要求目标存在，并解析为真实路径（具体符号链接行为受选项影响）。

安全提示：仅用 `normalize().startsWith(base)` 不能在所有攻击场景下阻止符号链接逃逸和并发替换。处理用户可控上传路径时，需要可信根目录、符号链接策略、权限隔离和尽量基于已打开句柄的操作；不要把路径规范化误当成完整沙箱。

## 8. `Files` 执行文件系统操作

`Path` 描述位置，`Files` 提供大量静态操作：

```java
boolean regular = Files.isRegularFile(path);
long size = Files.size(path);
FileTime modified = Files.getLastModifiedTime(path);
```

很多方法抛出 `IOException`，部分实现会提供更具体的 `NoSuchFileException`、`AccessDeniedException` 等。不要依赖所有文件系统都能区分同样精细的原因。

### 先检查再操作仍可能失败

```java
if (Files.exists(path)) {
    Files.readString(path);
}
```

检查之后，文件可能被其他进程删除、替换或改权限，这叫 TOCTOU（检查时与使用时）竞态。`Files.exists` 适合界面提示或分支选择，但真正操作仍必须处理异常。

## 9. 小文件便捷读写

内容确定较小时：

```java
String content = Files.readString(path, StandardCharsets.UTF_8);

Files.writeString(
        path,
        content,
        StandardCharsets.UTF_8,
        StandardOpenOption.CREATE,
        StandardOpenOption.TRUNCATE_EXISTING,
        StandardOpenOption.WRITE
);
```

`readAllBytes` 和 `readString` 会把全部内容放入内存，不适合未知大小的日志、上传文件或数据导出。攻击者可控文件尤其要先建立大小限制和流式处理策略。

常用打开选项：

- `CREATE`：不存在时创建，存在时继续。
- `CREATE_NEW`：必须新建；已存在则失败，适合避免覆盖。
- `TRUNCATE_EXISTING`：打开写入时把现有内容截断。
- `APPEND`：写到末尾。
- `WRITE` / `READ`：声明访问方式。
- `SYNC` / `DSYNC`：请求更强的同步写语义，成本和保证依文件系统而异。

选项组合必须反映业务意图。配置生成器可能需要 `CREATE_NEW`；日志可能需要 `APPEND`；报告发布可能需要替换已有文件。

## 10. 大文件与缓冲读写

逐行处理避免把全部文件加载到内存：

```java
try (BufferedReader reader = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
    String line;
    while ((line = reader.readLine()) != null) {
        process(line);
    }
}
```

缓冲层减少对底层系统调用的次数。`BufferedWriter` 同理会积累字符后批量编码和写出，关闭前自动 flush；若需要中途让下游立即看到数据，可显式 `flush()`，但频繁 flush 会降低吞吐。

`Files.lines(path, charset)` 返回惰性 `Stream<String>`，底层持有打开文件，必须放进 `try-with-resources`：

```java
try (Stream<String> lines = Files.lines(path, StandardCharsets.UTF_8)) {
    long count = lines.filter(line -> !line.isBlank()).count();
}
```

不要从方法返回仍依赖已关闭资源的惰性 Stream。

## 11. 目录创建与列举

```java
Files.createDirectories(Path.of("output", "reports"));
```

`createDirectories` 会创建缺失的父目录；如果目录已经存在通常可以继续。`createDirectory` 只创建一个目录，父目录必须存在。

```java
try (Stream<Path> entries = Files.list(directory)) {
    entries.forEach(System.out::println);
}
```

`Files.list` 与 `Files.walk` 返回的 Stream 都持有目录资源，需要关闭。`Files.walk` 递归遍历时还要考虑：

- 深度限制。
- 符号链接环路。
- 访问被拒绝的子目录。
- 大型目录树的耗时与内存。

需要细粒度错误处理时使用 `Files.walkFileTree` 与 `FileVisitor`。

## 12. 复制、移动与删除

### 复制

```java
Files.copy(source, target, StandardCopyOption.REPLACE_EXISTING);
```

复制目录本身通常不会递归复制全部内容。复制属性需显式 `COPY_ATTRIBUTES`，但不同文件系统支持的属性不同。

### 移动

```java
Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
```

移动可能只是同文件系统重命名，也可能需要更复杂操作。请求：

```java
Files.move(source, target, StandardCopyOption.ATOMIC_MOVE);
```

表示希望其他观察者只看到移动前或移动后状态。若文件系统或跨存储位置不支持，会抛 `AtomicMoveNotSupportedException`。调用方应决定失败、重试还是明确降级，而不是假设所有平台都支持。

### 删除

```java
Files.delete(path);         // 不存在时抛异常
Files.deleteIfExists(path); // 返回是否删除
```

删除非空目录会失败。符号链接删除通常删除链接本身而非目标，但其他操作的跟随策略必须查看具体 API 选项。

## 13. 文件属性与符号链接

一次读取一组基础属性可减少重复系统调用：

```java
BasicFileAttributes attributes = Files.readAttributes(
        path,
        BasicFileAttributes.class
);

attributes.isRegularFile();
attributes.size();
attributes.lastModifiedTime();
```

POSIX 权限、DOS 属性和所有者等属于不同属性视图，并非每个平台都支持。跨平台程序应检测能力或接受可选行为。

`Files.isSymbolicLink(path)` 可以判断路径最后一段是否是符号链接。是否跟随链接由具体方法和 `LinkOption.NOFOLLOW_LINKS` 等选项决定。处理备份、删除和上传目录时必须明确策略，否则可能访问预期目录之外的数据。

## 14. 为什么直接覆盖文件有风险

```java
Files.writeString(output, report, UTF_8);
```

如果进程在写到一半时崩溃、磁盘空间不足或权限发生变化，目标文件可能已经被截断，只剩半份内容。

更安全的发布流程：

```text
在目标目录创建临时文件
          ↓
完整写入并关闭
          ↓
尝试原子移动到目标路径
          ↓
不支持时按明确策略降级或失败
          ↓
异常时清理临时文件
```

临时文件应位于目标目录，以提高处于同一文件系统、支持原子移动的概率。即便原子重命名成功，它也不自动等于断电后数据绝不丢失；需要更强持久性时还要考虑 `fsync`、目录同步、文件系统和存储设备保证。

## 15. 完整示例：安全生成学习报告

示例读取 UTF-8 CSV，统计记录后安全发布报告。页面直接导入真实源码与输入数据：

::: code-group

<<< ../../../examples/java/file-io/src/learning/backend/files/StudyLogFormatException.java{java:line-numbers} [StudyLogFormatException.java]

<<< ../../../examples/java/file-io/src/learning/backend/files/StudyLogSummary.java{java:line-numbers} [StudyLogSummary.java]

<<< ../../../examples/java/file-io/src/learning/backend/files/StudyLogReportService.java{java:line-numbers} [StudyLogReportService.java]

<<< ../../../examples/java/file-io/src/learning/backend/files/StudyLogReportApp.java{java:line-numbers} [StudyLogReportApp.java]

<<< ../../../examples/java/file-io/data/study-log.csv{text:line-numbers} [study-log.csv]

:::

编译：

```bash
cd examples/java/file-io
mkdir -p out
javac --release 17 -Xlint:all -d out \
  src/learning/backend/files/StudyLogFormatException.java \
  src/learning/backend/files/StudyLogSummary.java \
  src/learning/backend/files/StudyLogReportService.java \
  src/learning/backend/files/StudyLogReportApp.java
```

运行，并让程序自动创建 `work/reports` 目录：

```bash
java -cp out learning.backend.files.StudyLogReportApp \
  data/study-log.csv work/reports/summary.txt
```

预期控制台输出中的绝对路径因机器而异，其余内容为：

```text
报告已生成：<当前目录>/work/reports/summary.txt
共 4 条记录，210 分钟。
--- 报告内容 ---
学习日志报告
来源文件：study-log.csv
有效记录：4 条
累计学习：210 分钟
平均时长：52.5 分钟
```

执行过程：

1. 入口把两个参数转成 `Path`；非法路径作为输入错误返回状态码 `2`。
2. 服务转换为规范化绝对路径，明确后续解析基准。
3. `BufferedReader` 按 UTF-8 逐行解码，跳过空行和注释。
4. 格式问题抛 `StudyLogFormatException`，返回状态码 `2`；文件系统问题保留为 `IOException`，返回 `1`。
5. 报告使用 `Locale.ROOT` 格式化小数，避免服务器地区改变小数点。
6. 服务创建输出父目录，并在同目录创建唯一临时文件。
7. 完整写入并关闭临时文件后，尝试原子移动；不支持或目标冲突时明确降级为替换移动。
8. 发布失败时 `finally` 删除临时文件；成功时目标文件保持完整报告。
9. 入口再次显式以 UTF-8 读取报告用于展示。

缺少输入文件：

```bash
java -cp out learning.backend.files.StudyLogReportApp \
  data/missing.csv work/reports/summary.txt
```

会输出 `文件错误` 并返回状态码 `1`。把 Java 源文件当作 CSV 输入会触发行号明确的 `数据错误` 并返回 `2`。

## 16. JavaScript / Node.js 对照

| 关注点 | Java | Node.js |
| --- | --- | --- |
| 路径 | `Path` | `node:path` 处理路径字符串 |
| 文件操作 | `Files` | `node:fs` / `fs.promises` |
| 字节容器 | `byte[]`、`ByteBuffer` | `Buffer`、`Uint8Array` |
| 文本解码 | `Charset`、Reader | `TextDecoder` 或读取时指定 encoding |
| 大文件 | Stream、Reader、Channel | Readable/Writable Stream |
| 异步模型 | 基础 Files 多为阻塞调用；另有异步通道 | Promise、回调和事件循环常用 |
| 资源关闭 | `try-with-resources` | `finally`、stream 生命周期及资源管理 API |

Java 基础文件 API 通常是阻塞式的。在 Spring Boot 中，不要因为方法名看起来简单就把大文件 IO 放到事件循环或响应式线程上；线程模型和背压需要单独设计。

## 17. 常见错误与排查顺序

### 常见错误

- 读取文本不指定字符集，跨环境后出现乱码。
- 用 Reader 复制图片等二进制文件，破坏原始字节。
- 对未知大小文件使用 `readAllBytes` 或 `readString`，导致内存压力。
- 把相对路径误认为相对源码文件，而不是进程工作目录。
- 把 `normalize()` 当成符号链接安全校验。
- `Files.exists` 返回 true 后假设下一步一定成功。
- 忘记关闭 `Files.lines`、`Files.list` 或 `Files.walk` 返回的 Stream。
- 直接截断目标文件后写入，失败时留下半份内容。
- 假设 `ATOMIC_MOVE` 在跨磁盘和所有文件系统上都可用。
- 捕获 `IOException` 后只打印“读取失败”，丢失路径和操作上下文。

### 排查顺序

1. 输出 `path.toAbsolutePath().normalize()`，确认程序实际访问位置。
2. 检查路径指向文件还是目录，以及父目录是否存在。
3. 保留具体异常类型，例如 `NoSuchFileException` 或 `AccessDeniedException`。
4. 确认写入与读取双方使用相同字符集和格式规范。
5. 对大文件确认代码是否流式处理、资源是否关闭。
6. 检查符号链接、容器挂载、网络文件系统和并发进程是否改变文件。
7. 区分“数据内容非法”和“底层 IO 失败”，不要用同一错误吞并两者。

## 18. 本节总结

- 字节流处理原始二进制，字符流通过 Charset 在字节与文本间转换。
- 持久化与协议文本应显式使用 UTF-8，而不是依赖进程默认字符集。
- `Path` 表示位置且不可变，`Files` 执行文件系统操作。
- 相对路径基于进程工作目录；`normalize` 只是语法处理，不是完整安全边界。
- 小文件可用便捷方法，大文件和未知输入应使用缓冲或流式处理。
- 文件存在性检查不能消除并发变化，真正操作仍必须处理异常。
- 目录 Stream、Reader、Writer 和 Channel 等资源应及时关闭。
- 重要输出先写同目录临时文件，再原子移动或按明确策略降级，可减少半成品文件风险。
- 数据格式错误与 IO 错误应保留不同语义，让边界选择合适响应。

下一节：[Java 集合框架概览与 `List`](/backend/java/collections-framework-and-list)。

## 19. 参考资料

- [Java SE 25：`Path` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/nio/file/Path.html)
- [Java SE 25：`Files` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/nio/file/Files.html)
- [Java SE 25：`java.nio.file` 包](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/nio/file/package-summary.html)
- [Java SE 25：`Charset` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/nio/charset/Charset.html)
- [Java SE 25：`StandardCharsets` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/nio/charset/StandardCharsets.html)
- [Java SE 25：`InputStream` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/io/InputStream.html)
- [Java SE 25：`Reader` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/io/Reader.html)
- [Oracle：NIO.2 文件 IO 教程](https://docs.oracle.com/javase/tutorial/essential/io/fileio.html)
