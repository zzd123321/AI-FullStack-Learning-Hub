---
title: Java 集合框架概览与 List
description: 理解集合接口与实现，使用泛型 List 安全管理、遍历、排序和封装有序业务数据
outline: deep
---

# Java 集合框架概览与 `List`

> 适用环境：JDK 25 LTS。完整示例只使用 JDK 17 可用 API；`SequencedCollection`、`getFirst()` 和 `reversed()` 等 JDK 21+ API 会单独标注。

## 从固定数组自然过渡到 List

数组适合“长度本来就是规则的一部分”的数据，例如一周七天。但后端收到多少条订单、搜索结果或消息，通常在运行前并不知道。`List` 解决的是“元素类型固定，但数量会变化”的问题。

先只记住这层关系：

```text
List<E> 规定有顺序、可按位置访问的数据语义
   ↑
ArrayList<E> 是最常用的一种具体实现
```

业务方法通常声明接收 `List<E>`，创建数据时再选择 `ArrayList<E>`。第一次学习优先掌握创建、`add`、遍历和防御性副本；视图、迭代器并发修改与复杂度细节留到第二遍。

## 1. 学习目标

完成本节后，你应该能够：

- 解释数组与集合、集合接口与实现类之间的区别。
- 根据“是否有顺序、是否允许重复、按什么方式查找”选择集合接口。
- 使用 `List<E>` 表达元素类型，用 `ArrayList` 创建常见的可变列表。
- 正确执行添加、读取、替换、删除、遍历和排序。
- 理解索引边界、对象相等性、自动装箱和重载带来的常见错误。
- 区分可变列表、不可修改列表、不可修改视图和防御性副本。
- 理解 `subList`、迭代器和反向列表等“视图”与原列表共享状态的含义。
- 根据时间复杂度和访问模式选择 `ArrayList`，而不是凭类名选择实现。
- 在类的边界使用副本保护内部集合，避免调用者越权修改状态。

## 2. 为什么有了数组还需要集合

Java 数组长度在创建后固定：

```java
String[] topics = new String[3];
topics[0] = "List";
```

如果数据量会变化，就要自己创建更大的数组并复制元素。集合框架把扩容、删除、查找、迭代、排序等通用能力封装起来：

```java
List<String> topics = new ArrayList<>();
topics.add("List");
topics.add("Set");
```

数组仍有价值：

- 长度固定且边界本身就是业务约束。
- 需要存放基本类型，避免包装对象开销，例如 `int[]`。
- 与底层 API、序列化格式或高性能数值计算交互。

普通后端业务中的动态对象序列，通常优先从 `List` 开始。

## 3. 集合框架是一组接口、实现和算法

Java Collections Framework 不只是几个容器类，它包括：

```text
接口：规定数据语义和可用操作
  Collection<E>
  ├─ List<E>       有顺序、可重复、可按索引访问
  ├─ Set<E>        不重复
  └─ Queue<E>      按队列规则处理

  Map<K, V>        键到值的映射，不继承 Collection

实现：决定存储结构与性能特征
  ArrayList、HashSet、ArrayDeque、HashMap ...

算法与包装：处理已有集合
  Collections.sort、binarySearch、unmodifiableList ...
```

变量通常声明为最能表达需求的接口，构造时再选择实现：

```java
List<String> topics = new ArrayList<>();
```

这意味着调用方依赖“有序列表”这个契约，而不是依赖 `ArrayList` 的具体内部结构。

注意两个相似名称：

- `Collection` 是集合层次的根接口。
- `Collections` 是提供静态算法和包装方法的工具类。

## 4. `List<E>` 的核心语义

`java.util.List` 表示有确定遇见顺序（encounter order）的元素序列：

- 索引从 `0` 开始。
- 通常允许重复元素。
- 某些实现允许 `null`，但接口并不保证所有实现都允许。
- 可以控制元素插入位置。
- 两个列表按相同顺序包含彼此相等的元素时，列表相等。

```java
List<String> topics = new ArrayList<>();
topics.add("IO");
topics.add("List");
topics.add("IO"); // 重复值合法

System.out.println(topics.get(0)); // IO
System.out.println(topics.size()); // 3
```

不要把“有顺序”理解为“自动排序”。`List` 保留指定的顺序，但不会自动按字母或数值排序。

## 5. 泛型 `<E>` 在这里解决什么问题

`List<String>` 中的 `String` 是类型参数，表示该列表的元素类型：

```java
List<String> topics = new ArrayList<>();
topics.add("集合");
String first = topics.get(0);
```

编译器会拒绝：

```java
// topics.add(42); // 编译错误：int 不能作为 String 加入
```

与没有静态类型约束的容器相比，泛型让错误尽量发生在编译期，也让 `get` 的结果不需要强制类型转换。

菱形语法 `<>` 让编译器从左侧推断构造器的类型参数：

```java
List<LearningTask> tasks = new ArrayList<>();
```

泛型不能直接使用基本类型，因此要使用包装类型：

```java
List<Integer> minutes = new ArrayList<>();
minutes.add(30); // 自动装箱：int -> Integer
int first = minutes.get(0); // 自动拆箱：Integer -> int
```

`List<int>` 不合法。还应避免把 `null` 放入包装类型列表后自动拆箱，否则会触发 `NullPointerException`。

## 6. 为什么通常选择 `ArrayList`

`ArrayList` 使用可扩容数组保存元素，是通用 `List` 的默认选择。它的典型复杂度如下：

| 操作 | 典型复杂度 | 原因 |
| --- | --- | --- |
| `get(index)` / `set(index, value)` | `O(1)` | 可直接定位数组位置 |
| 尾部 `add(value)` | 摊销 `O(1)` | 偶尔扩容并复制整个数组 |
| 中间插入或删除 | `O(n)` | 后续元素需要移动 |
| `contains` / `indexOf` | `O(n)` | 最坏要逐个比较 |

“摊销 `O(1)`”表示多次尾部追加的平均成本是常数级，但某一次扩容可能是 `O(n)`。

如果已知大概元素数，可以设置初始容量以减少扩容：

```java
List<String> rows = new ArrayList<>(10_000);
```

容量不是列表大小。刚创建后 `rows.size()` 仍然是 `0`，不能直接 `set(0, value)`。

## 7. 不要因为频繁插入就本能选择 `LinkedList`

`LinkedList` 是双向链表，同时实现 `List` 和 `Deque`。但通过索引找到中间位置本身是 `O(n)`，每个节点还有额外对象和指针开销，缓存局部性通常也弱于连续数组。

只有已经持有合适迭代器位置时，链表的局部插入删除才可能避免移动元素。多数业务列表仍应先选 `ArrayList`，再以真实性能测量决定是否更换。

作为队列或栈使用时，通常优先 `ArrayDeque`，而不是 `LinkedList` 或旧的 `Stack`。

## 8. 创建列表的几种方式

### 可变空列表

```java
List<String> topics = new ArrayList<>();
topics.add("List");
```

### 从已有集合复制为可变列表

```java
List<String> source = List.of("List", "Set");
List<String> copy = new ArrayList<>(source);
copy.add("Map");
```

### `List.of` 创建不可修改列表

```java
List<String> fixed = List.of("List", "Set", "Map");
// fixed.add("Queue"); // 运行时抛 UnsupportedOperationException
```

`List.of`：

- 返回不可修改列表。
- 不接受 `null` 元素。
- 不保证具体实现类，不应依赖实现类名称。
- 元素对象本身不一定不可变。

“列表不可修改”只表示不能增删替换槽位。如果列表里放着可变对象，对象内部仍可能变化。

### `Arrays.asList` 是固定大小的数组视图

```java
String[] array = {"List", "Set"};
List<String> view = Arrays.asList(array);
view.set(0, "Queue"); // 合法，同时改变 array[0]
// view.add("Map");   // UnsupportedOperationException
```

它不是普通 `ArrayList`：大小与原数组固定，并与原数组共享元素。需要独立可变列表时使用 `new ArrayList<>(Arrays.asList(array))`。

## 9. 添加、读取、替换与删除

```java
List<String> topics = new ArrayList<>();
topics.add("List");             // 尾部追加
topics.add(0, "Collection");   // 在索引 0 插入

String first = topics.get(0);   // 读取
String old = topics.set(1, "ArrayList"); // 替换并返回旧值
String removed = topics.remove(0);       // 按索引删除并返回旧值
```

有效元素索引范围是 `0` 到 `size() - 1`；插入位置允许 `0` 到 `size()`。越界会抛 `IndexOutOfBoundsException`。

空列表没有索引 `0`：

```java
List<String> empty = new ArrayList<>();
// empty.get(0); // IndexOutOfBoundsException
```

## 10. `remove` 的重载陷阱

`List` 同时有：

```java
E remove(int index)
boolean remove(Object value)
```

因此 `List<Integer>` 很容易产生歧义：

```java
List<Integer> numbers = new ArrayList<>(List.of(10, 20, 30));
numbers.remove(1);                  // 删除索引 1，即数值 20
numbers.remove(Integer.valueOf(30)); // 按值删除 30
```

这不是自动装箱失效，而是编译器优先匹配了参数为 `int` 的重载。

## 11. 查找依赖 `equals`

`contains`、`indexOf` 和按值 `remove` 都使用元素的相等性契约：

```java
boolean exists = topics.contains("List");
int firstIndex = topics.indexOf("List");
int lastIndex = topics.lastIndexOf("List");
```

自定义类如果没有正确实现 `equals`，两个字段相同但引用不同的对象通常不会被视为相等。本课示例使用 `record LearningTask`，编译器会根据组件生成 `equals` 和 `hashCode`。

列表自身的 `equals` 同时关心元素和顺序：

```java
List.of("A", "B").equals(List.of("A", "B")); // true
List.of("A", "B").equals(List.of("B", "A")); // false
```

## 12. 遍历列表

### 增强 `for`：只需要元素

```java
for (LearningTask task : tasks) {
    System.out.println(task.title());
}
```

它通过 `Iterable`/`Iterator` 工作，适合绝大多数只读遍历。

### 索引循环：确实需要位置

```java
for (int index = 0; index < tasks.size(); index++) {
    System.out.printf("%d. %s%n", index + 1, tasks.get(index).title());
}
```

不要写 `index <= tasks.size()`，最后一次会访问越界位置。

### `forEach`：操作足够简短

```java
tasks.forEach(task -> System.out.println(task.title()));
```

Lambda 会在后续函数式编程与 Stream 课程系统说明。当前先把它理解为“把每个元素交给这段操作”。

## 13. 遍历时修改与迭代器

在增强 `for` 中直接通过列表做结构性修改，通常会触发 `ConcurrentModificationException`：

```java
// for (LearningTask task : tasks) {
//     if (task.completed()) {
//         tasks.remove(task);
//     }
// }
```

删除符合条件的元素可以使用：

```java
tasks.removeIf(LearningTask::completed);
```

需要精细控制时使用当前迭代器的 `remove()`：

```java
Iterator<LearningTask> iterator = tasks.iterator();
while (iterator.hasNext()) {
    if (iterator.next().completed()) {
        iterator.remove();
    }
}
```

“fail-fast” 检测只用于尽早暴露程序错误，不是并发正确性机制，也不保证在所有竞态中都抛异常。

## 14. 排序：修改原列表还是产生副本

`List.sort` 原地改变列表顺序：

```java
tasks.sort(Comparator.comparingInt(LearningTask::estimatedMinutes));
```

多个排序条件可以组合：

```java
Comparator<LearningTask> order =
        Comparator.comparing(LearningTask::completed)
                .thenComparingInt(LearningTask::estimatedMinutes)
                .thenComparing(LearningTask::title);
```

如果调用者不应观察到顺序变化，先复制再排序：

```java
List<LearningTask> result = new ArrayList<>(tasks);
result.sort(order);
```

比较器必须满足一致的比较契约。不要用 `a - b` 比较任意整数，减法可能溢出；使用 `Integer.compare(a, b)` 或 `comparingInt`。

## 15. 可变性、防御性副本与视图

考虑下面的类：

```java
public List<LearningTask> tasks() {
    return tasks;
}
```

它把内部可变列表的引用直接交给调用者。调用者可以 `clear()`，绕过类的验证规则。

### `List.copyOf`：创建不可修改快照

```java
public List<LearningTask> snapshot() {
    return List.copyOf(tasks);
}
```

此后内部列表增删不会改变旧快照。`List.copyOf` 不接受 `null` 元素，并可能在输入已经是合适的不可修改列表时复用实例，所以不要依赖对象身份。

它执行的是浅复制：复制元素引用，不会深度复制每个元素。使用不可变 record 作为元素，边界更容易推理。

### `Collections.unmodifiableList`：不可修改视图

```java
List<String> source = new ArrayList<>(List.of("A"));
List<String> view = Collections.unmodifiableList(source);
source.add("B");
System.out.println(view); // [A, B]
```

调用者不能通过 `view` 修改，但原列表变化仍会反映到视图。快照和视图不是一回事。

## 16. `subList` 也是视图

```java
List<String> all = new ArrayList<>(List.of("A", "B", "C", "D"));
List<String> middle = all.subList(1, 3); // [B, C)，结束索引不包含
middle.clear();
System.out.println(all); // [A, D]
```

`subList(from, to)` 使用左闭右开区间 `[from, to)`，与 `String.substring` 类似。它与原列表共享存储。

创建视图后，如果绕过视图对原列表做不兼容的结构性修改，后续使用视图的行为可能变得未定义并常见地抛 `ConcurrentModificationException`。需要独立结果时：

```java
List<String> independent = new ArrayList<>(all.subList(1, 3));
```

## 17. JDK 21+：`SequencedCollection` 与反向视图

从 JDK 21 开始，`List` 继承 `SequencedCollection`，统一提供：

```java
E first = tasks.getFirst();
E last = tasks.getLast();
List<E> reverseView = tasks.reversed();
```

还有 `addFirst`、`addLast`、`removeFirst`、`removeLast` 等首尾操作。空列表调用 `getFirst()` 或 `getLast()` 会抛 `NoSuchElementException`。

`reversed()` 返回反向顺序的视图，不是独立副本。修改允许修改的反向视图会影响原列表，原列表变化也会反映到视图。

本课完整示例要兼容 JDK 17，所以使用 `get(0)` 和复制后排序，不直接调用这些 API。

## 18. `null` 元素与 API 边界

`ArrayList` 允许 `null`，但 `List.of`、`List.copyOf` 不允许。业务集合通常应在入口拒绝 `null`：

```java
public void add(LearningTask task) {
    tasks.add(Objects.requireNonNull(task, "任务不能为空。"));
}
```

这样错误会在加入集合时发生，并带有明确上下文，而不是几层调用后在排序或访问字段时偶然出现。

空列表通常比返回 `null` 更好：

```java
return List.of();
```

调用者可以直接遍历，不需要先进行空引用判断。

## 19. 泛型不变性与通配符初识

即使 `Dog` 是 `Animal` 的子类，`List<Dog>` 也不是 `List<Animal>` 的子类型：

```java
// List<Animal> animals = new ArrayList<Dog>(); // 编译错误
```

否则调用者就能向它加入 `Cat`，破坏原本只允许 `Dog` 的列表。

只读取一组动物的方法，可以接受上界通配符：

```java
void printAnimals(List<? extends Animal> animals) {
    for (Animal animal : animals) {
        System.out.println(animal);
    }
}
```

需要向容器写入 `Dog` 时，常使用下界 `List<? super Dog>`。完整的 PECS 原则与类型擦除会在泛型专题继续展开。

## 20. 列表不是线程安全边界

`ArrayList` 本身不是线程安全的。多个线程同时读写同一个列表，可能发生数据竞争、丢失更新或不可预测异常。

不要仅凭 `ConcurrentModificationException` 判断是否存在线程安全问题。后端程序应先明确状态所有权：

- 尽量不共享可变列表。
- 在线程间传递不可修改快照。
- 必须共享时，在更高层使用锁或选择符合访问模式的并发集合。
- 读多写少的特殊场景可考虑 `CopyOnWriteArrayList`，但每次写入都会复制数组，并非通用替代品。

并发集合会在 Java 并发专题详细说明。

## 21. 完整示例：封装学习计划

示例使用可变 `ArrayList` 管理类内部状态，对外只返回不可修改快照。任务本身是不可变 record，完成任务时用新值替换旧值：

::: code-group

<<< ../../../examples/java/collections-list/src/learning/backend/collections/LearningTask.java{java:line-numbers} [LearningTask.java]

<<< ../../../examples/java/collections-list/src/learning/backend/collections/StudyPlan.java{java:line-numbers} [StudyPlan.java]

<<< ../../../examples/java/collections-list/src/learning/backend/collections/StudyPlanApp.java{java:line-numbers} [StudyPlanApp.java]

:::

编译：

```bash
cd examples/java/collections-list
mkdir -p out
javac --release 17 -Xlint:all -d out \
  src/learning/backend/collections/LearningTask.java \
  src/learning/backend/collections/StudyPlan.java \
  src/learning/backend/collections/StudyPlanApp.java
```

运行：

```bash
java -cp out learning.backend.collections.StudyPlanApp
```

预期输出：

```text
原快照仍保持：未完成
当前首项状态：已完成
任务数：3
预计总时长：135 分钟
--- 优先顺序（未完成、短任务在前）---
1. 比较数组与集合 / 30 分钟 / 未完成
2. 掌握 ArrayList / 60 分钟 / 未完成
3. 理解 List 接口 / 45 分钟 / 已完成
只读快照拒绝修改：UnsupportedOperationException
```

执行过程：

1. `StudyPlan` 把字段声明为 `List<LearningTask>`，内部选择 `ArrayList`。
2. `add` 用 `Objects.requireNonNull` 在边界拒绝空任务。
3. 带索引的 `add` 把新任务插到指定位置，后续元素右移。
4. `snapshot` 用 `List.copyOf` 创建不可修改浅快照。
5. `complete` 读取不可变 record，生成已完成的新 record，再用 `set` 替换原位置。
6. 因为旧快照引用的是旧 record，它仍显示“未完成”。
7. `totalEstimatedMinutes` 使用增强 `for`，并用 `Math.addExact` 检测整数溢出。
8. `prioritizedSnapshot` 先复制，再按完成状态、时长和标题排序，不改变原列表顺序。
9. 最终结果再次转为不可修改快照；越权 `add` 被明确拒绝。

## 22. JavaScript `Array` 对照

| 关注点 | Java `List<E>` | JavaScript `Array` |
| --- | --- | --- |
| 元素类型 | 泛型在编译期约束 | 同一数组可混合多种类型 |
| 长度 | 动态变化 | 动态变化 |
| 越界读取 | `get` 抛 `IndexOutOfBoundsException` | 通常得到 `undefined` |
| 尾部添加 | `add(value)` | `push(value)` |
| 指定位置增删 | `add(index, value)` / `remove(index)` | `splice(...)` |
| 查找相等性 | `equals` | `includes` 使用 SameValueZero 等 JS 规则 |
| 排序 | `Comparator`，原地 `sort` | 回调比较函数，`sort` 原地修改 |
| 不可修改副本 | `List.copyOf` | `Object.freeze([...array])` 仅浅冻结且语义不同 |
| 子区间 | `subList` 默认是共享视图 | `slice` 创建浅副本 |

Java 的越界访问会立即失败，通常比传播一个 `undefined` 更早暴露错误。另一方面，Java 的不可修改列表是集合 API 契约，不等于对象图深度不可变；这点与 JavaScript 的浅冻结同样需要谨慎理解。

## 23. 常见错误与排查

### 常见错误

- 声明 `ArrayList` 类型到处传播，而不是依赖 `List` 接口。
- 把初始容量当成已有元素数量，随后直接 `set(0, value)`。
- 使用 `index <= list.size()` 导致最后一次循环越界。
- 在 `List<Integer>` 上写 `remove(1)`，误以为会删除数值 `1`。
- 在增强 `for` 中直接通过原列表删除元素。
- 以为 `Arrays.asList` 是可增删的普通 `ArrayList`。
- 以为 `Collections.unmodifiableList` 会冻结原列表。
- 返回内部可变列表，让调用者绕过业务规则。
- 使用 `subList` 后忘记它与原列表共享状态。
- 认为 `LinkedList` 的任意位置插入一定比 `ArrayList` 快。
- 用 `contains` 在超大列表中反复查找，却忽略它是线性扫描。
- 把 `ArrayList` 共享给多个线程而没有明确同步策略。

### 排查顺序

1. 确认变量的静态类型和实际实现类分别是什么。
2. 输出 `size()`，再检查访问索引是否处于 `0..size()-1`。
3. 遇到修改失败时，确认来源是 `List.of`、`copyOf`、视图还是固定大小列表。
4. 查找失败时检查元素的 `equals` 实现，而不是只比较字段显示值。
5. 遍历异常时检查是否有结构性修改，以及修改是否通过当前迭代器完成。
6. 性能问题先确认访问模式、数据规模和复杂度，再用基准测量验证。
7. 并发问题先明确谁拥有列表、哪些线程会写，不要只给单个方法随意加锁。

## 24. 本节总结

- 数组长度固定；集合框架为动态对象组提供统一接口、实现和算法。
- `List` 有确定顺序、允许重复并支持零下标访问，但不会自动排序。
- 变量优先声明为 `List<E>`，通用实现通常从 `ArrayList` 开始。
- 泛型在编译期约束元素类型；基本类型需使用包装类。
- `ArrayList` 随机访问快，尾部追加为摊销常数时间，中间移动和线性查找通常是 `O(n)`。
- `contains`、按值删除和列表相等性依赖元素的 `equals`。
- 遍历期间的结构性修改应使用 `removeIf` 或正确的迭代器操作。
- `List.copyOf` 创建不可修改浅快照；不可修改视图和固定大小列表具有不同语义。
- `subList` 与 JDK 21+ 的 `reversed` 都是视图，不是独立副本。
- 类不应直接暴露内部可变列表；不可变元素配合防御性副本更容易维护边界。
- `ArrayList` 不提供线程安全保证，共享状态必须另行设计。

下一节：[Java `Set`、`Map`、相等性与哈希](/backend/java/set-map-equality-and-hashing)。

## 25. 参考资料

- [Java SE 25：Collections Framework 概览](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/doc-files/coll-overview.html)
- [Java SE 25：`Collection` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/Collection.html)
- [Java SE 25：`List` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/List.html)
- [Java SE 25：`ArrayList` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/ArrayList.html)
- [Java SE 25：`LinkedList` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/LinkedList.html)
- [Java SE 25：`Collections` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/Collections.html)
- [Java SE 25：`SequencedCollection` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/SequencedCollection.html)
- [Java SE 25：`Comparator` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/Comparator.html)
