---
title: Java Lambda、函数式接口、Optional 与 Stream
description: 使用 Lambda、方法引用、Optional 与 Stream 构建惰性、类型安全且无副作用的数据流水线
outline: deep
---

# Java Lambda、函数式接口、`Optional` 与 Stream

> 适用环境：JDK 25 LTS。完整示例兼容 JDK 17 和 21；`Stream.toList()` 自 JDK 16 可用。

## 这一课的主角是“把一段行为当作参数”

过去如果想让一个方法采用不同筛选规则，往往要写多个方法或创建实现接口的类。Lambda 让调用方可以把“怎样判断”“怎样转换”这一小段行为直接传进去。Stream 再把多步行为连接成数据处理流水线，Optional 表达流水线最终可能没有结果。

```text
List 保存数据
  → stream() 建立处理管道
  → filter 接收判断行为
  → map 接收转换行为
  → 终止操作真正触发遍历并产生结果
```

第一次学习先会读写简单的 `filter → map → toList`，并知道 Stream 不是新集合。函数式接口组合、复杂 `collect`、并行 Stream 和 Optional 的全部组合属于第二层内容。

## 1. 学习目标

完成本节后，你应该能够：

- 解释函数式接口与单一抽象方法（SAM）的关系。
- 根据目标类型编写 Lambda，并在 Lambda 与方法引用之间选择。
- 理解局部变量捕获为什么要求 final 或有效 final。
- 使用 `Predicate`、`Function`、`Consumer`、`Supplier` 及基本类型特化接口。
- 组合 Predicate 和 Function，避免重复条件代码。
- 用 `Optional` 表达“可能没有一个结果”，并正确选择 `map`、`flatMap`、`orElseGet` 和 `orElseThrow`。
- 区分 Collection 与 Stream、源、中间操作和终止操作。
- 理解惰性、短路、遇见顺序、一次性消费和资源关闭。
- 使用 `filter`、`map`、`flatMap`、`sorted`、`distinct`、`reduce` 和 `collect`。
- 避免在流水线中修改来源、依赖共享可变状态或滥用 `peek`。
- 判断何时普通循环比 Stream 更清晰。
- 理解并行 Stream 的适用前提，而不是把 `parallel()` 当作性能开关。

## 2. 从 JavaScript 回调到 Java Lambda

前端常见：

```javascript
const titles = activities
  .filter(activity => activity.completed)
  .map(activity => activity.topic)
```

Java 可以写出相似流水线：

```java
List<String> titles = activities.stream()
        .filter(activity -> activity.completed())
        .map(activity -> activity.topic())
        .toList();
```

外观相似，但 Java 多了重要约束：

- Lambda 必须转换为一个明确的函数式接口类型。
- 参数与返回值由泛型和目标类型静态检查。
- 捕获的局部变量必须是 final 或有效 final。
- Stream 是一次性、惰性计算管道，不是保存元素的集合。
- 并行执行要求操作无干扰、通常无状态并满足归约契约。

## 3. 函数式接口不是“函数类型”本身

函数式接口只有一个抽象方法：

```java
@FunctionalInterface
public interface ActivityRule {
    boolean test(LearningActivity activity);
}
```

Lambda 是该接口实例的行为实现：

```java
ActivityRule completed = activity -> activity.completed();
```

接口可以继承 Object 的 public 方法，也可以拥有 default 和 static 方法；关键是可用于 Lambda 的抽象方法只有一个。

`@FunctionalInterface` 不是必需的，但建议添加。编译器会在接口不再满足条件时报告错误，防止后续维护者无意增加第二个抽象方法。

## 4. Lambda 依赖目标类型

单独的 Lambda 没有完整独立类型：

```java
Predicate<String> notBlank = value -> !value.isBlank();
Function<String, Integer> length = value -> value.length();
```

相同形状的表达式可以匹配不同接口，编译器根据赋值、参数或返回位置的目标类型确定：

- 参数类型。
- 返回类型。
- 允许抛出的受检异常。
- 最终创建的函数式接口实例类型。

因此不能像普通对象一样在没有目标类型时随意写：

```java
// var rule = value -> value.isBlank(); // 编译器没有目标函数式接口
```

## 5. Lambda 语法

### 一个参数

```java
value -> value.strip()
```

一个推断类型参数时可省略圆括号。

### 多个或零个参数

```java
(left, right) -> left + right
() -> new ArrayList<>()
```

### 代码块

```java
activity -> {
    int normalized = Math.max(activity.minutes(), 0);
    return normalized >= 30;
}
```

表达式体自动返回表达式结果；代码块需要按普通方法规则显式 `return`。返回 void 的 Consumer 可以使用表达式语句或代码块。

### 显式参数类型

```java
(LearningActivity activity) -> activity.completed()
```

参数类型要么全部推断，要么全部显式声明，不应混写。

## 6. 常用 `java.util.function` 接口

| 接口 | 抽象方法 | 语义 |
| --- | --- | --- |
| `Predicate<T>` | `boolean test(T)` | 判断条件 |
| `Function<T,R>` | `R apply(T)` | T 转换为 R |
| `Consumer<T>` | `void accept(T)` | 消费 T，产生副作用 |
| `Supplier<T>` | `T get()` | 延迟提供 T |
| `UnaryOperator<T>` | `T apply(T)` | 同类型一元变换 |
| `BinaryOperator<T>` | `T apply(T,T)` | 同类型二元合并 |
| `BiFunction<T,U,R>` | `R apply(T,U)` | 两个输入得到结果 |
| `BiConsumer<T,U>` | `void accept(T,U)` | 消费两个输入 |

优先复用标准接口，除非领域需要更清楚的名字、额外语义或不同异常契约。

## 7. 基本类型特化避免装箱

通用泛型不能使用基本类型，因此 Java 提供：

- `IntPredicate`、`LongPredicate`、`DoublePredicate`。
- `IntFunction<R>`、`ToIntFunction<T>`。
- `IntConsumer`、`IntSupplier`。
- `IntUnaryOperator`、`IntBinaryOperator`。

```java
ToIntFunction<LearningActivity> minutes = LearningActivity::minutes;
```

在大量数值处理时，`IntStream` 与这些接口避免 `int`/`Integer` 反复装箱。普通业务代码仍应先以清晰度为主，再通过测量判断性能。

## 8. Predicate 组合

```java
Predicate<LearningActivity> completed = LearningActivity::completed;
Predicate<LearningActivity> longEnough = activity -> activity.minutes() >= 30;

Predicate<LearningActivity> selected = completed.and(longEnough);
Predicate<LearningActivity> unfinished = completed.negate();
Predicate<LearningActivity> either = completed.or(longEnough);
```

组合能把规则拆成具名、可复用单元。`and` 和 `or` 按短路语义执行，第二个条件可能不会被调用，因此条件不应依赖必须发生的副作用。

## 9. Function 组合

```java
Function<String, String> normalize = String::strip;
Function<String, Integer> length = String::length;

Function<String, Integer> normalizedLength = normalize.andThen(length);
```

- `f.andThen(g)`：先 f，后 g。
- `f.compose(g)`：先 g，后 f。
- `Function.identity()`：原样返回输入。

复杂业务流程不要全部塞进超长 Function 链。涉及多步验证、错误上下文、事务或 IO 时，具名服务方法通常更清楚。

## 10. 方法引用的四种形态

### 静态方法

```java
Function<String, Integer> parse = Integer::parseInt;
```

### 特定对象的实例方法

```java
Predicate<String> startsWithJava = "Java"::startsWith;
```

调用时参数成为实例方法的参数。

### 任意对象的实例方法

```java
Function<String, String> strip = String::strip;
```

传入的 String 成为接收者。

### 构造器

```java
Supplier<List<String>> factory = ArrayList::new;
```

方法引用同样依赖目标函数式接口来确定重载。若方法引用使重载或接收者关系难以理解，Lambda 往往更清晰。

## 11. Lambda 捕获局部变量

```java
int minimumMinutes = 30;

Predicate<LearningActivity> rule =
        activity -> activity.minutes() >= minimumMinutes;
```

`minimumMinutes` 没有声明 final，但赋值后不再改变，因此是有效 final（effectively final）。下面不允许：

```java
int threshold = 30;
// threshold = 60;
// activity -> activity.minutes() >= threshold; // 捕获失败
```

原因不是简单的语法偏好。局部变量位于当前方法栈帧，Lambda 可能比方法活得更久；Java 捕获的是值语义，禁止后续重赋值避免共享可变局部变量的歧义。

对象引用有效 final 不代表对象不可变：

```java
List<String> output = new ArrayList<>();
activities.forEach(activity -> output.add(activity.topic()));
```

引用没重新赋值，所以可以捕获，但修改共享列表会制造副作用，并在并行执行时产生数据竞争。优先使用 `map(...).toList()`。

## 12. Lambda 中的 `this`

Lambda 不建立新的 `this`；其中的 `this` 指向外围类实例。匿名内部类则有自己的 `this`。

这一区别在监听器、回调和异步任务中很重要。不要把 Lambda 完全等同于匿名类的缩写，它们在作用域、序列化、类生成和身份语义上都有差异。

## 13. 受检异常与函数式接口

`Function<T,R>.apply` 没有声明受检异常，因此 Lambda 不能直接抛出任意 `IOException`：

```java
// paths.stream().map(path -> Files.readString(path))
```

常见策略：

- 在适当边界用普通循环或具名方法传播受检异常。
- 在 Lambda 内捕获并转换为具有业务语义的运行时异常，同时保留 cause。
- 定义确实需要 `throws` 的领域函数式接口。
- 先完成 IO，再对内存数据使用 Stream。

不要写通用“偷偷抛出”工具绕过编译器；它会让 API 异常契约变得不可信。

## 14. `Optional<T>` 表达什么

`Optional<T>` 表示“可能存在一个非 null 的 T，也可能为空”：

```java
Optional<User> findById(UserId id)
```

它适合无法保证命中的查询返回值，让调用者显式处理缺失分支，而不是返回一个没有标注语义的 null。

创建：

```java
Optional<String> present = Optional.of("Java");
Optional<String> empty = Optional.empty();
Optional<String> maybe = Optional.ofNullable(possiblyNull);
```

`Optional.of(null)` 会立即抛 `NullPointerException`。Optional 变量本身也不应为 null。

## 15. 不要先 `isPresent` 再 `get`

过程式写法：

```java
if (user.isPresent()) {
    send(user.get());
}
```

虽能工作，但经常失去 Optional 的组合优势。更常用：

```java
user.ifPresent(this::send);

String name = user
        .map(User::displayName)
        .orElse("匿名用户");
```

无条件 `get()` 在空值时抛 `NoSuchElementException`，API 文档也建议优先 `orElseThrow()` 表达失败意图。

## 16. `map` 与 `flatMap`

`map` 用于 T → R：

```java
Optional<String> name = user.map(User::displayName);
```

如果映射函数返回 Optional，使用 `flatMap` 避免嵌套：

```java
Optional<Address> address = user.flatMap(User::primaryAddress);
```

否则会得到 `Optional<Optional<Address>>`。

`filter` 可以保留满足条件的值：

```java
Optional<User> active = user.filter(User::active);
```

## 17. `orElse` 与 `orElseGet`

```java
User value1 = optional.orElse(loadDefaultUser());
User value2 = optional.orElseGet(this::loadDefaultUser);
```

- `orElse` 的参数在调用方法前就会求值，即使 Optional 有值也会执行。
- `orElseGet` 接收 Supplier，只在为空时调用。

默认值创建昂贵、会访问数据库或有副作用时使用 `orElseGet`。常量默认值使用 `orElse` 更简洁。

失败分支：

```java
User user = repository.findById(id)
        .orElseThrow(() -> new UserNotFoundException(id));
```

Supplier 让异常只在缺失时构造。

## 18. Optional 的使用边界

通常推荐：

- 用作“可能没有单个结果”的方法返回值。
- 在调用链中立即 map/flatMap/orElseThrow 处理。

通常避免：

- 把 Optional 作为方法参数；重载、明确命令对象或普通可空边界可能更合适。
- 在实体、DTO、record 字段中到处存 Optional；序列化框架和 ORM 支持可能不一致。
- 返回 `Optional<List<T>>` 表示查询集合；空 List 已经能表达没有元素。
- 返回 null 的 Optional。
- 用 Optional 包装必须存在的值，掩盖模型错误。

Optional 是 value-based 类，不应依赖实例身份或把它用作同步锁。

## 19. Collection 与 Stream 不同

```text
Collection：保存和管理元素
Stream：描述如何遍历、转换与聚合元素
```

Stream：

- 不拥有元素，读取一个来源。
- 不提供索引访问。
- 通常惰性执行。
- 一次性消费。
- 可选择顺序或并行执行。

```java
Stream<LearningActivity> stream = activities.stream();
```

创建 Stream 不会复制整个 Collection，也不会立即处理所有元素。

## 20. 流水线三部分

```java
List<String> topics = activities.stream()       // 源
        .filter(LearningActivity::completed)    // 中间操作
        .map(LearningActivity::topic)            // 中间操作
        .distinct()                              // 中间操作
        .toList();                               // 终止操作
```

- **源**：Collection、数组、文件、生成器等。
- **中间操作**：返回 Stream，构建流水线。
- **终止操作**：触发遍历并产生值或副作用。

没有终止操作时，中间操作通常不执行。

## 21. 惰性与操作融合

```java
Optional<LearningActivity> first = activities.stream()
        .filter(LearningActivity::completed)
        .findFirst();
```

`findFirst` 找到首个匹配元素后即可停止，不需要先生成一个完整过滤列表。Stream 实现还可以融合阶段，并在不影响结果时省略某些调用。

因此不要依赖 `map`、`filter` 或 `peek` 中的副作用一定执行指定次数。行为函数应聚焦从输入计算输出。

## 22. Stream 只能消费一次

```java
Stream<String> stream = Stream.of("A", "B");
long count = stream.count();
// List<String> values = stream.toList(); // IllegalStateException
```

需要再次计算时：

- 从原 Collection 再创建一个 Stream。
- 缓存终止结果。
- 接收 `Supplier<Stream<T>>`，每次提供新 Stream。

不要在字段中长期保存 Stream；保存数据源或结果更可靠。

## 23. `filter`、`map` 与 `flatMap`

### `filter`：保留元素

```java
stream.filter(activity -> activity.minutes() >= 30)
```

输入和输出元素类型相同。

### `map`：一对一转换

```java
Stream<String> topics = stream.map(LearningActivity::topic);
```

每个活动变成一个主题。

### `flatMap`：一对多并展平

```java
Stream<String> tags = activities.stream()
        .flatMap(activity -> activity.tags().stream());
```

若使用 map，会得到 `Stream<Stream<String>>`。flatMap 把每个内部 Stream 的元素合并到一条流水线，并在使用完后关闭映射出的 Stream。

## 24. `distinct`、`sorted`、`limit` 与 `skip`

```java
List<String> tags = activities.stream()
        .flatMap(activity -> activity.tags().stream())
        .distinct()
        .sorted()
        .limit(10)
        .toList();
```

- `distinct` 按 `equals`/`hashCode` 去重。
- `sorted` 按自然顺序或 Comparator 排序。
- `limit(n)` 最多保留 n 个。
- `skip(n)` 丢弃前 n 个。

`distinct` 和 `sorted` 可能需要维护大量状态或缓冲元素。处理无界 Stream 时，先排序可能永远无法产生结果；流水线顺序影响正确性和性能。

## 25. `takeWhile` 与 `dropWhile`

对于有遇见顺序的 Stream：

```java
stream.takeWhile(value -> value < 100)
stream.dropWhile(value -> value < 100)
```

它们处理的是满足条件的最长前缀，不等同于 filter：一旦遇到第一个不满足元素，takeWhile 就停止；dropWhile 从那里开始保留后续全部元素。

无序流上的语义更弱，使用前要确认来源顺序契约。

## 26. 短路终止操作

- `findFirst`：按遇见顺序找第一个。
- `findAny`：允许返回任意一个，并行时可能更自由。
- `anyMatch`：任意匹配即 true。
- `allMatch`：发现不匹配即 false。
- `noneMatch`：发现匹配即 false。

空 Stream 上：

- `anyMatch` 为 false。
- `allMatch` 为 true。
- `noneMatch` 为 true。

后两者是数学上的空真（vacuous truth），不能用“没有数据”直觉随意解释为业务通过；业务如要求至少一项，应额外检查。

## 27. `mapToInt` 与数值归约

```java
int total = activities.stream()
        .mapToInt(LearningActivity::minutes)
        .sum();
```

`IntStream` 还提供 average、min、max、summaryStatistics。注意 int 的 sum 发生溢出时会按 Java 整数规则回绕，不自动报错。

不可信累计值可以：

```java
int total = activities.stream()
        .map(LearningActivity::minutes)
        .reduce(0, Math::addExact);
```

或改用 long 并继续评估上限。

## 28. `reduce` 的身份值与结合律

```java
int sum = values.stream().reduce(0, Integer::sum);
```

`0` 是加法身份值，必须满足 `combine(identity, x) == x`。归约函数还应满足结合律，以便分块计算：

```text
(a ⋄ b) ⋄ c == a ⋄ (b ⋄ c)
```

减法不是适合并行归约的结合操作：

```java
// values.parallelStream().reduce(0, (a, b) -> a - b)
```

顺序分组变化会产生不同结果。浮点加法也不严格满足数学结合律，并行与顺序结果可能有舍入差异。

不要用 reduce 修改并返回同一个 ArrayList；可变归约应使用 collect。

## 29. `collect` 与 Collector

```java
Map<String, List<LearningActivity>> byLearner = activities.stream()
        .collect(Collectors.groupingBy(LearningActivity::learner));
```

常用 Collector：

- `toList`、`toSet`。
- `toMap`。
- `groupingBy`、`partitioningBy`。
- `joining`。
- `counting`、`summingInt`、`averagingInt`。
- `mapping`、`filtering` 等下游 Collector。

`Collectors.toMap` 遇到重复键且未提供合并函数会抛 `IllegalStateException`：

```java
Map<String, Integer> minutesByTopic = activities.stream()
        .collect(Collectors.toMap(
                LearningActivity::topic,
                LearningActivity::minutes,
                Math::addExact,
                LinkedHashMap::new
        ));
```

这里明确了重复主题合并规则和结果 Map 实现。

## 30. `Stream.toList()` 与 `Collectors.toList()`

```java
List<String> result = stream.toList();
```

`Stream.toList()` 返回不可修改 List，不能假设具体实现类，也不能调用 add。

```java
List<String> result = stream.collect(Collectors.toList());
```

`Collectors.toList()` 不保证结果的具体类型、可变性、可序列化性或线程安全性。当前实现行为不是契约。

明确需要可变 ArrayList：

```java
List<String> result = stream.collect(Collectors.toCollection(ArrayList::new));
```

## 31. 遇见顺序与输出顺序

List.stream 通常有列表顺序；HashSet.stream 不保证业务可预测顺序；sorted 会建立排序顺序。

`forEach` 在并行流中不保证遇见顺序，`forEachOrdered` 保持有序流的遇见顺序，但可能限制并行效率。

如果 JSON、签名、测试或用户界面依赖顺序：

- 从有顺序来源开始。
- 使用 sorted 或明确的 LinkedHashMap Collector。
- 不要把 HashMap 当前输出当成保证。

## 32. 无干扰与无状态

错误示例：

```java
List<String> output = new ArrayList<>();
activities.stream()
        .filter(activity -> {
            activities.remove(activity); // 修改来源
            return true;
        })
        .forEach(activity -> output.add(activity.topic()));
```

问题包括：

- 修改正在遍历的来源，违反 non-interference。
- 依赖外部可变 output，流水线不是 stateless。
- 并行时 ArrayList 写入存在数据竞争。

正确方向：

```java
List<String> output = activities.stream()
        .filter(rule)
        .map(LearningActivity::topic)
        .toList();
```

## 33. `peek` 不是业务处理步骤

```java
stream.peek(value -> logger.debug("value={}", value))
```

peek 主要用于调试观察元素。它是中间操作：

- 没有终止操作就不执行。
- 短路时只处理部分元素。
- 优化可能省略某些行为调用。
- 并行时线程和顺序可能变化。

不要用 peek 保存数据库、扣库存或累加关键状态。明确副作用放在边界，并认真处理失败语义。

## 34. 文件 Stream 必须关闭

集合 Stream 通常不需要关闭，但 `Files.lines` 等 IO 来源持有资源：

```java
try (Stream<String> lines = Files.lines(path, StandardCharsets.UTF_8)) {
    long nonBlank = lines
            .filter(line -> !line.isBlank())
            .count();
}
```

终止操作不会替你自动关闭外层 Stream。用 try-with-resources 明确生命周期，不要把持有文件的 Stream 返回到已经关闭资源的作用域外。

## 35. 无限 Stream 必须有终止策略

```java
List<Integer> values = Stream.iterate(1, value -> value + 1)
        .limit(5)
        .toList();
```

`Stream.generate` 和两参数 `iterate` 可生成无限流。`toList`、sorted 或某些全量归约在无限流上不会结束或耗尽内存。

使用 limit、短路操作，或三参数 `iterate(seed, hasNext, next)` 建立有界条件。

## 36. Optional 与 Stream 互操作

JDK 9 起 `Optional.stream()` 把：

- 有值 Optional 变成单元素 Stream。
- 空 Optional 变成空 Stream。

```java
List<Address> addresses = users.stream()
        .map(User::primaryAddress)
        .flatMap(Optional::stream)
        .toList();
```

它适合在多项流水线中忽略缺失单值。若缺失是错误，不应悄悄过滤，应在业务边界 `orElseThrow`。

## 37. 何时使用普通循环

Stream 适合：

- 过滤、映射、分组、聚合等数据变换。
- 操作无状态且无干扰。
- 流水线长度适中，名字能表达意图。

普通循环可能更好：

- 复杂控制流、多个 break/continue 条件。
- 每步需要不同受检异常处理。
- 同时维护多个相互依赖状态。
- 需要精确记录失败元素和恢复步骤。
- Stream 写法产生嵌套 Lambda 或晦涩 Collector。

函数式风格不是目标，清晰、正确、可验证才是目标。

## 38. 并行 Stream 不是免费加速

```java
long count = activities.parallelStream()
        .filter(rule)
        .count();
```

可能收益的前提：

- 数据规模足够大。
- 每个元素计算成本较高且彼此独立。
- 数据源容易拆分，例如 ArrayList/数组。
- 操作无共享可变状态。
- 归约满足身份值、结合性和兼容性契约。
- 已使用 JMH 或生产指标测量。

常见问题：

- 拆分、调度和合并成本超过计算本身。
- 默认使用公共 ForkJoinPool，与应用其他任务互相影响。
- 阻塞数据库、网络或文件 IO 占住工作线程。
- 保持顺序的操作限制并行效率。
- ThreadLocal、安全上下文、日志上下文不一定按预期传播。

Web 后端不要在请求方法里随意加 parallel。并发模型、线程池容量、超时和下游限流必须整体设计。

## 39. 完整示例：学习报告流水线

示例从活动列表筛选学习者的已完成记录，按时长排序，聚合主题分钟数、扁平化标签，并使用 Optional 处理最长活动：

::: code-group

<<< ../../../examples/java/streams/src/learning/backend/streams/LearningActivity.java{java:line-numbers} [LearningActivity.java]

<<< ../../../examples/java/streams/src/learning/backend/streams/LearningReport.java{java:line-numbers} [LearningReport.java]

<<< ../../../examples/java/streams/src/learning/backend/streams/LearningReportService.java{java:line-numbers} [LearningReportService.java]

<<< ../../../examples/java/streams/src/learning/backend/streams/LearningStreamApp.java{java:line-numbers} [LearningStreamApp.java]

:::

编译：

```bash
cd examples/java/streams
mkdir -p out
javac --release 17 -Xlint:all -d out \
  src/learning/backend/streams/LearningActivity.java \
  src/learning/backend/streams/LearningReport.java \
  src/learning/backend/streams/LearningReportService.java \
  src/learning/backend/streams/LearningStreamApp.java
```

运行：

```bash
java -cp out learning.backend.streams.LearningStreamApp
```

预期输出：

```text
小林的完成报告
- Java 泛型 / 60 分钟
- Java 集合 / 45 分钟
总时长：105 分钟
按主题：{Java 集合=45, Java 泛型=60}
标签：[API, Java, 泛型, 集合]
最长活动：Java 泛型
小陈：暂无完成记录
```

执行过程：

1. `LearningActivity` 构造器规范化字段，并用 Stream 清理、去重标签；`toList` 产生不可修改列表。
2. 服务将外部 learner 规范化后捕获进 Lambda；该局部变量是有效 final。
3. 三个 Predicate 通过 `and` 组合完成状态、学习者和最低时长规则。
4. 第一个流水线过滤 null 和规则不匹配项，并收集不可修改的 matched 列表，供多个后续聚合重复使用。
5. 摘要流水线按分钟倒序排序，再 map 成只暴露必要字段的 `ActivitySummary`。
6. 总时长使用 `reduce(0, Math::addExact)`，发生 int 溢出时明确失败。
7. `Collectors.toMap` 用主题作键、`Math.addExact` 合并重复主题，并指定 `LinkedHashMap` 保留遇见顺序。
8. 标签流水线通过 flatMap 展开每个活动的标签，再去重、排序。
9. `LearningReport` 对 List 做不可修改复制，对 Map 用 LinkedHashMap 副本和不可修改包装保留顺序与所有权边界。
10. 最长活动返回 Optional；调用者 map 为主题，再用 `orElseGet` 或 `orElse` 处理缺失。

为什么先收集 matched，而不是强行复用 Stream？Stream 一次终止后不能再次消费。这里的数据集已经位于内存，保存中间不可修改 List 让四个聚合清晰且可重复。如果数据量巨大或来源只能遍历一次，应重新设计为单次 Collector、数据库聚合或流式处理，而不是无条件缓存全部结果。

## 40. JavaScript 对照

| 关注点 | Java | JavaScript |
| --- | --- | --- |
| 回调类型 | 目标函数式接口静态检查 | 函数对象，运行时动态 |
| 局部捕获 | 局部变量需 final/有效 final | 闭包可直接读写外围 let 变量 |
| 数组流水线 | Stream 惰性、一次性 | Array filter/map 通常立即创建数组 |
| 缺失单值 | `Optional<T>` | `undefined` / `null` |
| 扁平化 | `flatMap` | `Array.prototype.flatMap` |
| 数值专用流 | IntStream/LongStream/DoubleStream | number 数组，无对应专用流类型 |
| 并行执行 | parallel Stream，可多线程 | 普通数组方法仍在单线程事件循环执行 |
| 受检异常 | 函数式接口签名限制 | 没有受检异常类型系统 |

Java Stream 更接近惰性查询描述，而不是 JavaScript Array 方法的逐步数组复制。不要因为语法相似就假设求值时机、资源管理和并行语义相同。

## 41. 常见错误与排查

### 常见错误

- 没有目标函数式接口就试图用 var 接收 Lambda。
- 修改 Lambda 捕获的局部变量，或通过有效 final 引用修改共享集合。
- 自定义大量与 Predicate/Function 完全重复的接口。
- Optional 变量本身返回 null。
- 无条件调用 Optional.get。
- 用 `orElse(expensiveCall())`，误以为只在空值时执行。
- 返回 `Optional<List<T>>` 表示空查询结果。
- 忘记终止操作，误以为 filter/map 已执行。
- 终止后再次使用同一个 Stream。
- 在 filter/map/peek 中保存数据或修改来源。
- 认为 `Stream.toList()` 返回可变 ArrayList。
- `Collectors.toMap` 没有处理重复键。
- 对无限流先 sorted 或收集全部元素。
- 用不满足结合律的函数执行并行 reduce。
- 忘记关闭 Files.lines 等 IO Stream。
- 未测量就把 stream 改成 parallelStream。

### 排查顺序

1. 找到 Lambda 的目标函数式接口，核对参数、返回和 throws。
2. 检查捕获变量是否有效 final，以及引用指向的对象是否仍被修改。
3. 将流水线标成“源 → 中间操作 → 终止操作”，确认是否真正触发。
4. 检查 Stream 是否已被终止或关闭后再次使用。
5. 对每个行为函数检查是否修改来源、共享状态或依赖调用次数。
6. 结果顺序异常时检查来源遇见顺序、sorted、Collector Map 类型和并行模式。
7. 聚合错误时检查重复键策略、身份值、结合律与整数溢出。
8. 资源泄漏时确认 Stream 来源是否持有 IO，并使用 try-with-resources。
9. 性能问题先用指标/JMH 测量数据规模和热点，再决定循环、Stream 或并行方案。

## 42. 本节总结

- Lambda 是函数式接口实例的行为实现，依赖目标类型进行参数和返回值检查。
- Predicate、Function、Consumer、Supplier 及其基本类型特化覆盖大多数通用函数角色。
- Lambda 捕获的局部变量必须 final 或有效 final；引用不变不代表对象状态不变。
- 方法引用能简化已有方法调用，但不应牺牲重载和接收者语义的清晰度。
- Optional 适合可能缺失的单值返回；map/flatMap/orElseGet/orElseThrow 比无条件 get 更安全。
- Collection 保存数据，Stream 描述一次性、通常惰性的遍历与聚合。
- 流水线由源、中间操作和终止操作组成；短路操作只消费必要元素。
- flatMap 处理一对多，reduce 处理不可变归约，collect 处理可变归约和分组。
- Stream.toList 返回不可修改 List；toMap 的重复键与结果 Map 类型必须明确。
- 行为参数应无干扰且通常无状态，不能依赖 peek 或中间操作副作用。
- IO Stream 要及时关闭，无限 Stream 要有 limit 或短路终止策略。
- parallel Stream 只有在数据可拆分、计算独立且经过测量时才可能获益，不能替代并发设计。
- 普通循环在复杂控制流、受检异常和多状态更新中可能更清晰。

下一节：[Java 并发基础、线程生命周期、共享状态与内存可见性](/backend/java/concurrency-threads-shared-state-and-memory-visibility)。

## 43. 参考资料

- [Java Language Specification 25：Lambda 表达式](https://docs.oracle.com/javase/specs/jls/se25/html/jls-15.html#jls-15.27)
- [Java SE 25：`java.util.function` 包](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/function/package-summary.html)
- [Java SE 25：`Predicate` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/function/Predicate.html)
- [Java SE 25：`Function` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/function/Function.html)
- [Java SE 25：`Optional` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/Optional.html)
- [Java SE 25：`Stream` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/stream/Stream.html)
- [Java SE 25：`java.util.stream` 包](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/stream/package-summary.html)
- [Java SE 25：`Collectors` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/stream/Collectors.html)
- [Dev.java：Lambda 表达式](https://dev.java/learn/lambdas/)
- [Dev.java：Stream API](https://dev.java/learn/api/streams/)
