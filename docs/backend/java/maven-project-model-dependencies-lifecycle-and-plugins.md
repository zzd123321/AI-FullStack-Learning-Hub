---
title: Maven 项目模型、依赖管理、生命周期与插件
description: 从 POM、坐标和标准目录理解多模块 reactor、依赖解析、插件执行与可复现构建
outline: deep
---

# Maven 项目模型、依赖管理、生命周期与插件

> 基准环境：Apache Maven 3.9.16、JDK 25 运行 Maven、Java 17 编译目标。

## 1. 学习目标

完成本节后，你应该能够：

- 区分 Maven 自身运行所用 JDK 与项目编译目标 JDK。
- 阅读 `groupId:artifactId:version:packaging` 坐标。
- 按标准目录组织 main/test Java 与 resources。
- 理解原始 POM、父 POM、Super POM 与 effective POM 的关系。
- 区分 POM 继承、模块聚合和 reactor 构建顺序。
- 使用 dependencyManagement 统一版本，而不误以为它会自动添加依赖。
- 解释传递依赖、最近定义、直接声明、scope、optional 和 exclusion。
- 区分 lifecycle、phase、plugin 与 goal。
- 理解执行某个 phase 会先执行该生命周期此前的 phase。
- 区分 `plugins` 与 `pluginManagement`。
- 为插件和依赖显式固定版本，并使用 `--release`。
- 使用 `dependency:tree`、`help:effective-pom` 和 `help:active-profiles` 排查模型。
- 理解本地仓库、远程仓库、mirror、proxy 和 settings.xml 的职责。
- 通过固定时间戳、编码、版本和环境减少不可复现构建。
- 将前端 npm workspace 的经验映射到 Maven，但不混淆 lockfile 与解析机制。

## 2. 版本状态先说明白

截至 2026-07-14，Apache Maven 官方发布历史显示：

- Maven 3.9.16 是最新 GA。
- Maven 3.10.0-rc-1 仍为候选版本，不是 GA。
- Maven 4 最新为 4.0.0-rc-5，仍未 GA。
- Maven 3.8.9 及更早版本已经 EOL。
- 当前官方插件兼容计划以 Maven 3.9.0 为最低线。

因此本课以 Maven 3.9.16/POM 4.0.0 为稳定基准。不要为了版本号更大把 Maven 4 RC 直接放进生产流水线；采用前要验证 POM、插件、扩展、IDE 和 CI 兼容性。

## 3. Maven 解决什么问题

Maven 不只是 javac 的快捷命令。它统一描述：

- 项目坐标和版本。
- 源码、测试、资源和输出目录。
- 编译、测试、打包、校验、安装、发布过程。
- 直接与传递依赖。
- 插件及其 goal 配置。
- 多模块关系。
- 项目元数据、SCM、许可证和发布仓库。

同一个 `pom.xml` 既是构建输入，也是依赖消费者看到的项目模型。

## 4. Maven 自身 JDK 与项目目标 JDK

```bash
mvn -version
```

输出同时包含 Maven 版本和 Maven 进程使用的 Java runtime。它们是两个问题：

- Maven 用哪个 JDK 启动。
- Compiler Plugin 生成哪个 Java 版本 class 文件。

本课设置：

```xml
<maven.compiler.release>17</maven.compiler.release>
```

即使 Maven 在 JDK 25 上运行，编译器仍限制到 Java 17 语言、class 版本和标准 API 表面。

## 5. 安装与 Wrapper

全局安装后验证：

```bash
mvn -version
```

团队项目更适合提交 Maven Wrapper：

```bash
./mvnw -version
./mvnw verify
```

Wrapper 固定 Maven 发行版并在缺失时下载，降低开发机/CI 版本漂移。要提交 wrapper 脚本、properties 和所选 wrapper 方式需要的文件，并审查 distribution URL 与校验策略。

本课示例未生成 wrapper，避免把下载器和二进制 jar 混入基础源码；真实项目应由团队统一生成并验证。

## 6. Maven 坐标

```text
learning.backend:learning-core:1.0.0-SNAPSHOT:jar
```

| 字段 | 含义 | 示例 |
| --- | --- | --- |
| `groupId` | 组织/命名空间 | `learning.backend` |
| `artifactId` | 模块/制品名 | `learning-core` |
| `version` | 版本 | `1.0.0-SNAPSHOT` |
| `packaging` | 生命周期与制品类型 | `jar` / `pom` / `war` |

依赖还可能有 classifier 和 type。仓库路径通常由坐标映射，不应把 jar 文件名当完整身份。

## 7. `SNAPSHOT` 与发布版本

`1.0.0-SNAPSHOT` 表示开发中的可变版本，远程仓库可保存带时间戳的快照构建。

`1.0.0` 表示不可变发布语义。发布仓库通常拒绝覆盖已有 release；这对可追溯性很重要。

生产发布不应长期依赖 SNAPSHOT，否则同一 POM 在不同时间可能解析到不同内容。版本号相同但二进制改变，会破坏回滚、审计和缓存。

## 8. POM 最小结构

```xml
<project ...>
    <modelVersion>4.0.0</modelVersion>
    <groupId>learning.backend</groupId>
    <artifactId>demo</artifactId>
    <version>1.0.0-SNAPSHOT</version>
</project>
```

`modelVersion` 是 POM 模型版本，目前稳定 POM 使用 4.0.0；它不是 Maven 程序版本，也不是项目版本。

packaging 未写时默认是 jar。父/聚合项目通常显式写 `pom`。

## 9. 标准目录布局

```text
module/
├── pom.xml
└── src/
    ├── main/
    │   ├── java/
    │   └── resources/
    └── test/
        ├── java/
        └── resources/
```

构建输出位于 `target/`，不提交 Git。

遵循标准布局可减少自定义配置，IDE、插件和 CI 能共享默认约定。前端项目常显式配置 src/dist；Maven 更强调 convention over configuration。

## 10. 原始 POM 与 Effective POM

Maven 实际执行的模型来自合并：

- 当前模块 POM。
- 父 POM 继承内容。
- Maven Super POM 默认值。
- 激活 profiles。
- 属性插值。
- settings 与命令行用户属性对解析的影响。

查看最终模型：

```bash
mvn help:effective-pom
```

输出到文件便于比较：

```bash
mvn help:effective-pom -Doutput=effective-pom.xml
```

不要只看当前 pom 的十几行就猜插件版本或仓库来源。

## 11. Parent 继承

子模块：

```xml
<parent>
    <groupId>learning.backend</groupId>
    <artifactId>maven-basics</artifactId>
    <version>1.0.0-SNAPSHOT</version>
    <relativePath>../pom.xml</relativePath>
</parent>
```

可继承的常见内容：

- groupId/version。
- properties。
- dependencyManagement。
- pluginManagement 和许多 build 配置。
- dependencies/plugins（需谨慎，会直接施加给子模块）。

artifactId 不继承，因为每个模块必须有自己的制品身份。

## 12. Aggregation 聚合

聚合 POM：

```xml
<packaging>pom</packaging>
<modules>
    <module>learning-core</module>
    <module>learning-cli</module>
</modules>
```

从根目录运行 Maven 时，它创建 reactor，把多个项目作为一个构建会话处理。

aggregation 只表示“这次一起构建哪些模块”，不自动让模块互相继承，也不自动添加依赖。

## 13. 继承与聚合可以分开

常见项目让根 POM 同时是 parent 和 aggregator，但概念上不同：

- 某模块可以继承公司 parent，却不在当前 reactor。
- 某 aggregator 可以聚合多个继承不同 parent 的模块。
- parent 通过坐标/relativePath 解析。
- modules 通过相对目录形成 reactor。

排查“属性为何没继承”和“模块为何没参与构建”时必须分别检查。

## 14. Reactor 构建顺序

本课列出 core 再列 cli，同时 cli 显式依赖 core。Maven 根据项目关系排序，而不是简单按 `<modules>` 文本顺序。

影响顺序的关系包括模块依赖、插件依赖和部分 build extension/plugin 声明。

若模块 B 使用 A 的类，却没声明 A 依赖，只碰巧因目录顺序编译成功，模型就是错误的。

查看 reactor 日志应出现：

```text
Maven Basics Reactor [pom]
Learning Core        [jar]
Learning CLI         [jar]
```

## 15. 选择部分模块

构建 cli 及其依赖模块：

```bash
mvn -pl learning-cli -am verify
```

- `-pl` / `--projects`：选择项目。
- `-am` / `--also-make`：同时构建选择项依赖的 reactor 模块。
- `-amd` / `--also-make-dependents`：同时构建依赖选择项的模块。

只进入子目录执行 Maven，可能无法使用尚未 install 的兄弟 SNAPSHOT；从 reactor 根执行通常更符合多模块关系。

## 16. 三套生命周期

Maven 内置三套独立 lifecycle：

- **default**：验证、编译、测试、打包、校验、安装、部署。
- **clean**：删除之前构建输出。
- **site**：生成项目站点/报告。

`clean` 不是 default 的第一阶段。`mvn clean verify` 是先运行 clean lifecycle 的 clean phase，再运行 default lifecycle 到 verify。

## 17. Default Lifecycle 关键 phase

| Phase | 目的 |
| --- | --- |
| `validate` | 验证项目模型和前置条件 |
| `compile` | 编译 main 源码 |
| `test` | 运行单元测试 |
| `package` | 生成 jar/war 等制品 |
| `verify` | 执行制品级校验/集成验证 |
| `install` | 写入本地仓库供其他本地构建使用 |
| `deploy` | 上传远程仓库 |

执行后面的 phase 会依次执行此前 phase：`mvn verify` 已包含 compile/test/package，不需要写 `mvn compile test package verify`。

## 18. Phase 不是具体工作实现

Phase 是生命周期位置。真正执行工作的是绑定到 phase 的 plugin goal。

例如 jar packaging 的 compile phase 通常绑定：

```text
maven-compiler-plugin:compile
```

package phase绑定：

```text
maven-jar-plugin:jar
```

不同 packaging 的默认绑定不同。pom packaging 在 package 阶段不会生成普通 jar。

## 19. Plugin 与 Goal

调用单个 goal：

```bash
mvn dependency:tree
```

完整形式：

```text
groupId:artifactId:version:goal
```

生命周期 phase 适合表达“完成到什么验证层级”，直接 goal 适合执行特定工具任务。CI 主路径通常调用 `verify`，而不是拼接一串内部 goal。

## 20. 为什么固定插件版本

插件也是可执行依赖。未固定版本时，Super POM 或 Maven 版本变化可能改变实际插件，导致：

- 编译参数变化。
- 测试发现规则变化。
- jar 内容/时间戳变化。
- 新插件不再兼容旧 Maven/JDK。

本课固定：

```xml
<maven.compiler.plugin.version>3.15.0</maven.compiler.plugin.version>
<maven.jar.plugin.version>3.5.0</maven.jar.plugin.version>
```

版本升级应像源码升级一样经过 release notes、CI 和产物比较。

## 21. `plugins` 与 `pluginManagement`

### `build/plugins`

声明插件参与当前项目（并按继承规则影响子项目），配置可绑定到默认/自定义 phase。

### `build/pluginManagement`

提供版本和默认配置，但通常不会凭自身让插件执行；子模块或生命周期仍需实际引用该插件。

本课在 pluginManagement 管版本，再在 plugins 激活 compiler 和 jar。这样版本集中，执行意图也清楚。

## 22. Execution 绑定 Goal 到 Phase

```xml
<execution>
    <id>generate-model</id>
    <phase>generate-sources</phase>
    <goals>
        <goal>generate</goal>
    </goals>
</execution>
```

同一插件可有多个 execution，每个 id、phase、goal 和 configuration 不同。

选择 phase 时遵循生命周期语义：生成 Java 源码放 generate-sources，集成测试准备/运行/清理放对应 pre-integration-test、integration-test、post-integration-test，而不是全塞 validate。

## 23. Compiler Plugin 与 `--release`

推荐：

```xml
<maven.compiler.release>17</maven.compiler.release>
```

它比只写 source/target 更安全，因为还限制可用 Java SE API。

但它不限制第三方依赖最低运行 JDK，也不保证 native/agent/插件兼容。CI 最好真的在最低支持 JDK 上运行测试。

## 24. 依赖声明

```xml
<dependency>
    <groupId>learning.backend</groupId>
    <artifactId>learning-core</artifactId>
</dependency>
```

cli 省略 version，因为根 POM 的 dependencyManagement 提供 `${project.version}`。

dependencyManagement 不把 core 自动放入所有模块 classpath；cli 仍必须在 dependencies 中声明使用关系。

## 25. 直接依赖优先明确声明

如果业务源码直接 import 某库的类型，就应声明为直接依赖，而不是依赖“另一个库刚好传递带来它”。

否则上游库升级、把依赖改成 optional 或内部替换时，你的代码突然无法编译。

直接声明也是版本仲裁和依赖审计的明确输入。

## 26. 传递依赖

A 依赖 B，B 依赖 C，Maven 通常把 C 作为 A 的传递依赖加入相应 classpath。

这减少重复声明，也会引入：

- 版本冲突。
- 依赖树膨胀。
- 未直接选择的许可证/漏洞。
- 运行期 classpath 意外变化。

查看：

```bash
mvn dependency:tree
mvn dependency:tree -Dverbose
```

对大型项目可用 includes 缩小目标 group/artifact。

## 27. 版本仲裁不是“最高版本获胜”

Maven 3 依赖 mediation 的核心是 nearest definition：依赖树中离当前项目更近的版本获选；同深度时声明顺序可能影响结果。

因此不能假设自动拿最高版本。要稳定控制关键库：

- 在当前项目直接声明。
- 在 dependencyManagement 统一版本。
- 使用经过验证的 BOM。
- 检查 dependency:tree 的 omitted/conflict 信息。

## 28. Dependency Scope

| Scope | main 编译 | test | 运行/打包 classpath | 传递性概念 |
| --- | --- | --- | --- | --- |
| `compile` | 是 | 是 | 是 | 默认，可传递 |
| `provided` | 是 | 是 | 由运行环境提供 | 传递受限 |
| `runtime` | 否 | 是 | 是 | 运行需要 |
| `test` | 否 | 是 | 否 | 不传递给消费者 |
| `system` | 类似 provided | 是 | 本地绝对路径 | 应避免 |
| `import` | 仅 dependencyManagement 中的 `pom` | 不直接上 classpath | 不直接上 classpath | 导入受管版本 |

scope 不是“生产/开发环境”开关。它描述 classpath 与传递语义。

## 29. `provided` 常见误区

provided 表示编译需要，但运行容器承诺提供，例如某些 Servlet API 场景。

若独立运行 jar 却把实际运行库标为 provided，会在启动时出现 ClassNotFoundException/NoClassDefFoundError。

Spring Boot 可执行 jar 的依赖打包规则由 Boot 插件处理，不能简单套用传统应用服务器 WAR 经验。

## 30. `optional` 的含义

库 B 把 C 标记 optional 后，B 自己仍可编译使用 C，但依赖 B 的 A 不会自动获得 C。

这适合 B 的可选集成功能。A 若真的使用该功能，必须显式声明 C。

optional 不是为了隐藏内部依赖漏洞，也不是运行时动态下载机制。

## 31. Exclusion 要精确

```xml
<exclusions>
    <exclusion>
        <groupId>example</groupId>
        <artifactId>legacy-api</artifactId>
    </exclusion>
</exclusions>
```

exclusion 作用于一条依赖路径。使用前回答：

- 为什么排除？
- 是否有其他路径仍引入？
- 上游代码运行时是否仍需要？
- 替代版本是否二进制兼容？

盲目排除“重复 jar”常把构建错误变成运行时错误。

## 32. BOM 导入

```xml
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>example</groupId>
            <artifactId>example-bom</artifactId>
            <version>1.2.3</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>
```

BOM 统一一组兼容版本，不把所有库自动加入依赖。Spring Boot 后续会大量使用 parent/BOM 管理生态版本。

多个 BOM 和本地 management 的覆盖顺序需要通过 effective-pom 与 dependency:tree 验证，不能凭直觉。

## 33. 本地仓库

默认本地仓库通常是：

```text
~/.m2/repository
```

它缓存远程依赖，也保存 `mvn install` 安装的本地制品。

不要把本地仓库当团队发布渠道：你的机器 install 成功，不代表 CI/同事能解析。跨环境共享应 deploy 到受控远程仓库。

删除整个本地仓库是昂贵的排查手段，应先定位具体坐标、metadata、checksum 或 `.lastUpdated` 状态。

## 34. Remote Repository 与 Mirror

依赖通常从 Maven Central 或企业仓库管理器解析。企业常在 `settings.xml` 配 mirror，把所有请求路由到审核/缓存代理。

仓库职责：

- hosted release/snapshot。
- proxy Central/第三方仓库。
- group/virtual 聚合入口。
- 权限、审计、保留和恶意包治理。

不应为了某个依赖在每个项目 POM 随意添加未知 HTTP 仓库。

## 35. `settings.xml` 放环境与凭据

用户级：

```text
~/.m2/settings.xml
```

安装级：

```text
$MAVEN_HOME/conf/settings.xml
```

适合配置：

- mirrors。
- servers 凭据引用。
- proxies。
- 环境 profile。
- 本地仓库路径。

密码/token 不应提交 pom.xml。CI 用 secret store 注入 settings，并最小化 deploy 权限。

## 36. 离线与更新选项

```bash
mvn -o verify
```

只使用本地已有内容，缺失依赖/插件会失败。

```bash
mvn -U verify
```

强制检查缺失 release 与更新 snapshot 元数据，适合明确解决缓存状态，不应每次无理由增加远程压力。

离线成功说明本地缓存完整，不证明一个全新 CI 环境能解析全部依赖。

## 37. 测试阶段与跳过选项

```bash
mvn test
mvn verify
```

Surefire 通常在 test phase 运行单元测试；集成测试常由 Failsafe 在 integration-test/verify 周期处理。

常见差异：

- `-DskipTests`：通常仍编译测试，只跳过执行。
- `-Dmaven.test.skip=true`：通常连测试编译也跳过。

具体插件配置可改变行为。发布流水线不应把跳过测试作为默认修复手段。

## 38. 为什么 CI 常用 `verify`

`package` 只保证制品已生成。某些检查、集成测试结果确认、签名或质量 gate 绑定在 verify。

```bash
mvn --batch-mode --no-transfer-progress clean verify
```

CI 使用 batch mode 避免交互，no-transfer-progress 减少下载进度噪声。

只有需要让其他独立本地构建按坐标解析时才 install；只有发布任务才 deploy。不要所有 PR 都 deploy SNAPSHOT。

## 39. Profile 的边界

Profile 可按显式 id、JDK、OS、属性等条件调整模型：

```bash
mvn -Pproduction verify
```

查看激活项：

```bash
mvn help:active-profiles
```

Profile 容易让“同一 POM”产生多套隐藏构建。环境业务配置优先在应用运行时注入；只有真正影响构建模型的差异才放 Maven profile。

不要依赖开发机 settings 中隐式 profile 才能成功构建。

## 40. 可复现构建的目标

相同源码、声明版本和工具输入应产生字节级相同或可解释一致的制品。

主要不稳定来源：

- SNAPSHOT/版本范围。
- 未固定插件版本。
- jar entry 时间戳。
- 默认字符集/时区/locale。
- 文件遍历顺序。
- 环境变量和绝对路径写入产物。
- 注解处理器或代码生成器的当前时间/随机值。
- 不同 JDK/Maven/OS 工具链。

可复现首先是供应链与审计能力，其次才是缓存优化。

## 41. 固定输出时间戳

本课父 POM：

```xml
<project.build.outputTimestamp>
    2026-07-14T00:00:00Z
</project.build.outputTimestamp>
```

支持该属性的现代归档插件用固定时间写 jar/zip entry，减少每次构建因当前时间产生差异。

发布流程也可把它更新为源码提交时间，但值必须稳定并使用明确时区。

## 42. 编码必须显式

```xml
<project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
<project.reporting.outputEncoding>UTF-8</project.reporting.outputEncoding>
```

源码、资源、过滤插件和测试报告可能各有编码参数。不能只设置一个属性就假设所有第三方插件自动遵循；应检查插件文档。

本课 `Properties.load(InputStream)` 默认不是 UTF-8，因此源码显式使用 `InputStreamReader(..., UTF_8)` 读取中文资源。

## 43. Toolchains

当 Maven 自身必须运行在一个 JDK，而编译/测试需另一个已安装 JDK，可使用 Maven Toolchains 配置工具链。

它比在插件里写 `/Library/Java/.../javac` 更可移植，也避免 CI/开发机路径写入 POM。

Toolchains 需要开发机/CI 提供匹配 JDK；`--release 17` 与“真的用 JDK 17 运行测试”仍是互补验证。

## 44. Maven 没有 npm lockfile 等价物

Maven 通过显式版本、dependencyManagement/BOM、nearest mediation、仓库 metadata 和插件版本解析，不原生生成与 `package-lock.json` 完全等价的标准锁文件。

要提高确定性：

- 禁用版本范围和动态版本。
- 生产禁止 SNAPSHOT。
- 固定插件和扩展版本。
- 管理 BOM 与直接依赖。
- 锁定 Maven/JDK/仓库镜像。
- 保存 dependency tree/SBOM 和制品 checksum。

不要把本地仓库缓存误当锁文件。

## 45. Maven 与 npm 对照

| Maven | npm / 前端工作区 |
| --- | --- |
| `pom.xml` | `package.json` |
| GAV 坐标 | package name + version |
| `src/main/java` 约定 | `src` 通常由工具配置 |
| dependency scope | dependencies/devDependencies/peerDependencies 只部分近似 |
| parent POM | shared config package/extends，语义不同 |
| modules + reactor | npm/pnpm/yarn workspaces |
| lifecycle phase | npm scripts 名称由项目定义；Maven phase 标准化 |
| plugin goal | CLI/tool plugin command |
| local repository | 全局缓存/内容寻址 store，语义不同 |
| dependencyManagement/BOM | overrides/resolutions 或共享版本目录，非完全等价 |

Maven phase 有固定顺序和 packaging 默认绑定；npm scripts 更自由。不要把 `mvn install` 理解成 `npm install`：前者把当前项目制品安装进本地 Maven 仓库。

## 46. 本课多模块结构

```text
maven-basics/
├── pom.xml
├── learning-core/
│   ├── pom.xml
│   └── src/main/
│       ├── java/.../Course.java
│       ├── java/.../CourseCatalog.java
│       └── resources/learning.properties
└── learning-cli/
    ├── pom.xml
    └── src/main/java/.../MavenLearningApp.java
```

- 根模块只管理 reactor、版本、插件和公共属性。
- core 暴露领域对象和课程目录。
- cli 显式依赖 core，并提供 main 入口。
- 依赖方向单向，core 不知道 cli。

## 47. 完整 POM

::: code-group

<<< ../../../examples/java/maven-basics/pom.xml{xml:line-numbers} [根 pom.xml]

<<< ../../../examples/java/maven-basics/learning-core/pom.xml{xml:line-numbers} [learning-core/pom.xml]

<<< ../../../examples/java/maven-basics/learning-cli/pom.xml{xml:line-numbers} [learning-cli/pom.xml]

:::

根 POM 同时承担 parent 与 aggregator，但课程前面已经说明这两个职责可以拆开。

## 48. 完整 Java 与资源文件

::: code-group

<<< ../../../examples/java/maven-basics/learning-core/src/main/java/learning/backend/maven/Course.java{java:line-numbers} [Course.java]

<<< ../../../examples/java/maven-basics/learning-core/src/main/java/learning/backend/maven/CourseCatalog.java{java:line-numbers} [CourseCatalog.java]

<<< ../../../examples/java/maven-basics/learning-core/src/main/resources/learning.properties{properties:line-numbers} [learning.properties]

<<< ../../../examples/java/maven-basics/learning-cli/src/main/java/learning/backend/maven/cli/MavenLearningApp.java{java:line-numbers} [MavenLearningApp.java]

:::

代码没有外部依赖，便于把注意力放在 reactor、模块依赖和资源 classpath。

## 49. 验证模型

```bash
cd examples/java/maven-basics
mvn -ntp validate
```

validate 不编译源码，但会构建项目模型和 reactor。预期三个项目均 SUCCESS。

离线验证：

```bash
mvn -o -ntp validate
```

若插件/依赖不在本地缓存，离线执行到更晚 phase 可能失败，这是预期边界。

## 50. 构建与运行

```bash
mvn -ntp clean verify
```

运行 class 目录（macOS/Linux）：

```bash
java -cp "learning-cli/target/classes:learning-core/target/classes" \
  learning.backend.maven.cli.MavenLearningApp
```

Windows classpath 分隔符使用分号：

```powershell
java -cp "learning-cli/target/classes;learning-core/target/classes" `
  learning.backend.maven.cli.MavenLearningApp
```

预期输出：

```text
课程：Maven 基础
主题：[POM, 依赖管理, 生命周期, 插件]
模块：learning-core -> learning-cli
```

这里使用两个模块的 classes 目录。普通 Maven JAR Plugin 生成的是 thin jar，不会自动把依赖模块内容合并成一个 fat jar；Spring Boot 后续会使用专门插件生成可执行归档。

## 51. 检查制品

```bash
jar --list --file learning-core/target/learning-core-1.0.0-SNAPSHOT.jar
```

应同时看到 class 与 `learning.properties`。

查看 manifest：

```bash
unzip -p learning-core/target/learning-core-1.0.0-SNAPSHOT.jar \
  META-INF/MANIFEST.MF
```

父 POM 的 JAR Plugin 配置加入：

```text
Build-Project: learning.backend:learning-core
```

pluginManagement 提供版本，plugins 激活配置，子 jar 模块继承后由 jar 生命周期绑定执行。

## 52. 常用排查命令

```bash
mvn help:effective-pom
mvn help:active-profiles
mvn dependency:tree
mvn dependency:build-classpath
mvn help:describe \
  -Dplugin=org.apache.maven.plugins:maven-compiler-plugin \
  -Ddetail
```

查看详细错误：

```bash
mvn -e verify
```

完整 debug：

```bash
mvn -X verify
```

`-X` 可能暴露路径、环境、仓库和请求信息，分享日志前脱敏。

## 53. 常见错误

- Maven 运行 JDK 与项目目标 JDK 混为一谈。
- 只写 source/target，误用更高 JDK API。
- 根 POM packaging 忘记写 pom。
- 把 modules 当依赖，或把 parent 当 reactor 聚合。
- dependencyManagement 里有依赖，就以为子模块自动可 import。
- 业务源码依赖传递库，却不直接声明。
- 认为 Maven 自动选择最高传递版本。
- scope 使用 provided 后独立运行缺类。
- 盲目 exclusion，构建通过但运行 NoClassDefFoundError。
- pluginManagement 配了插件，却期待它自动执行。
- 不固定插件版本，开发机与 CI effective POM 不同。
- 调用 package 后再重复写 test/compile phase。
- 把 `mvn install` 当成下载依赖。
- 依赖本机 `~/.m2` 中手工 jar，CI 无法解析。
- 把仓库 token 写进 pom.xml。
- 生产依赖 SNAPSHOT 或版本范围。
- 资源文件假设平台默认编码。
- 以为 jar 默认包含全部依赖。
- 为环境业务配置滥用 Maven profile。
- 删除整个本地仓库作为每次依赖问题的第一步。

## 54. 排查顺序

1. `mvn -version` 记录 Maven home、Java、locale 和 OS。
2. 确认执行目录和实际读取的 pom。
3. 查看 reactor order，判断目标模块是否进入构建。
4. 用 effective-pom 检查继承、profile、属性和插件版本。
5. 用 dependency:tree 检查版本仲裁、scope、optional 和 exclusion。
6. 比较开发机与 CI 的 settings、mirror、Maven/JDK 版本。
7. 用 `-e` 看异常链，必要时用 `-X` 并保护敏感信息。
8. 依赖解析失败时检查坐标、仓库、凭据、proxy、checksum 和缓存状态。
9. 编译成功运行缺类时检查 runtime classpath、scope 和打包方式。
10. 构建不一致时比较输入版本、outputTimestamp、locale/timezone、生成器和产物 checksum。

## 55. 本节总结

- Maven 以 POM 描述项目、依赖、插件和生命周期，而不只是调用 javac。
- Maven 3.9.16 是当前 GA；Maven 4/3.10 候选版本不能当稳定版默认采用。
- Maven 进程 JDK 与 maven.compiler.release 是两个独立版本边界。
- GAV 加 packaging/classifier 构成制品身份，SNAPSHOT 表示可变开发版本。
- Effective POM 来自当前 POM、parent、Super POM、profile 和属性合并。
- 继承共享模型，aggregation 创建 reactor；两者可以同时使用但概念不同。
- Phase 表示生命周期位置，Plugin Goal 才执行具体工作。
- 执行 verify 会包含此前的 compile、test、package 等 phase。
- pluginManagement 管默认版本/配置，plugins 表达实际使用。
- dependencyManagement 管版本但不添加依赖，直接使用的库应直接声明。
- Maven 依赖仲裁不是简单选最高版本，应通过 BOM/management/tree 控制。
- scope、optional 和 exclusion 都改变消费者 classpath，必须按运行语义选择。
- 本地仓库是缓存与本地安装位置，不是团队发布仓库或 lockfile。
- 固定插件、依赖、Maven/JDK、编码和 outputTimestamp 能提高可复现性。
- 多模块边界应形成明确单向依赖，为 Spring Boot 工程分层打基础。

下一节：[Spring Boot 项目结构、启动流程、自动配置、配置系统与第一个 HTTP API](/backend/java/spring-boot-project-structure-auto-configuration-config-and-first-api)。

## 56. 参考资料

- [Apache Maven：Releases History](https://maven.apache.org/docs/history.html)
- [Apache Maven：POM Reference](https://maven.apache.org/pom.html)
- [Apache Maven：Introduction to the Build Lifecycle](https://maven.apache.org/guides/introduction/introduction-to-the-lifecycle.html)
- [Apache Maven：Introduction to the Dependency Mechanism](https://maven.apache.org/guides/introduction/introduction-to-dependency-mechanism.html)
- [Apache Maven：Guide to Configuring Plugins](https://maven.apache.org/guides/mini/guide-configuring-plugins.html)
- [Apache Maven：Configuring for Reproducible Builds](https://maven.apache.org/guides/mini/guide-reproducible-builds.html)
- [Apache Maven Wrapper](https://maven.apache.org/tools/wrapper/)
- [Apache Maven Compiler Plugin 3.15.0](https://maven.apache.org/plugins/maven-compiler-plugin/)
- [Apache Maven JAR Plugin 3.5.0](https://maven.apache.org/plugins/maven-jar-plugin/)
