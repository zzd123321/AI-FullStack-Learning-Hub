---
title: Java Set、Map、相等性与哈希
description: 使用 Set 去重、Map 建立索引，并掌握 equals、hashCode、哈希键稳定性与集合封装
outline: deep
---

# Java `Set`、`Map`、相等性与哈希

> 适用环境：JDK 25 LTS。完整示例兼容 JDK 17 和 21；JDK 21+ 的 `SequencedSet`、`SequencedMap` API 会单独标注。

## List 不够用时，先问数据之间是什么关系

上一课的 `List` 保留顺序，也允许重复。如果系统要判断“这个权限是否已经存在”，或者通过用户 ID 直接找到用户，继续用列表会隐藏真正的数据关系。

- `Set<E>`表达“每个值最多出现一次”。
- `Map<K, V>`表达“一个键对应一个值”。
- `equals`回答“两个对象在业务值上是否相同”。
- `hashCode`帮助哈希集合先缩小查找范围，最后仍由 `equals`确认。

第一次学习只需根据业务语义选对 `List`、`Set` 或 `Map`，并遵守 `equals` 相等则 `hashCode` 必须相等。哈希桶、树化和复杂视图属于进阶实现细节。

## 1. 学习目标

完成本节后，你应该能够：

- 根据业务语义在 `List`、`Set` 和 `Map` 之间做选择。
- 使用 `HashSet` 去重，正确理解 `add` 返回值和无序语义。
- 使用 `HashMap`、`LinkedHashMap` 建立键值索引和聚合统计。
- 区分 `get` 返回 `null` 的两种含义，并正确使用 `containsKey`。
- 使用 `getOrDefault`、`putIfAbsent`、`computeIfAbsent` 和 `merge` 表达常见更新。
- 通过 `keySet`、`values`、`entrySet` 正确遍历 Map。
- 解释 `equals` 与 `hashCode` 的契约，以及哈希表为什么同时需要它们。
- 避免把会改变相等性或哈希值的可变对象作为 Set 元素或 Map 键。
- 区分哈希顺序、插入顺序、访问顺序与排序顺序。
- 为嵌套集合建立真正隔离的防御性快照。

## 2. 从业务问题选择集合

先描述数据关系，再选择实现类：

| 问题 | 首选抽象 | 例子 |
| --- | --- | --- |
| 保留顺序和重复值 | `List<E>` | 请求处理步骤、订单明细 |
| 只关心某值是否出现且不重复 | `Set<E>` | 权限、标签、已处理请求 ID |
| 通过唯一键找到一个值 | `Map<K, V>` | 用户 ID → 用户、商品编码 → 库存 |
| 同一个键对应多个值 | `Map<K, List<V>>` 或 `Map<K, Set<V>>` | 用户 → 订单、角色 → 权限 |
| 统计每个值出现次数 | `Map<K, Integer>` | 状态 → 请求数、主题 → 分钟数 |

不要用 `List` 模拟所有结构。例如每次都在线性列表中查找用户 ID，规模增大后会浪费时间，也无法直接表达“键唯一”的约束。

## 3. `Set<E>`：不包含重复元素

`Set` 建模数学意义上的集合。按照接口契约，不存在两个满足 `e1.equals(e2)` 的元素。

```java
Set<String> permissions = new HashSet<>();

boolean first = permissions.add("article:read");  // true
boolean second = permissions.add("article:read"); // false
```

第二次加入相等元素时，集合不变化，`add` 返回 `false`。这个返回值很适合做幂等去重：

```java
if (!processedRequestIds.add(requestId)) {
    System.out.println("重复请求，跳过处理");
}
```

`Set` 没有索引。业务一旦需要“第 3 个元素”，通常意味着你还需要顺序语义，应重新考虑类型。

## 4. 常用 Set 实现怎么选

### `HashSet`：通用去重与成员检查

```java
Set<String> tags = new HashSet<>();
```

- 基于哈希表。
- `add`、`contains`、`remove` 在哈希分布合理时通常接近常数时间。
- 不保证迭代顺序；当前机器上的输出顺序不是 API 契约。
- 允许一个 `null`，但业务代码通常主动拒绝 `null`。

### `LinkedHashSet`：保留遇见顺序

```java
Set<String> tags = new LinkedHashSet<>();
```

- 在哈希结构之外维护明确的遇见顺序。
- 适合“去重但保留首次出现顺序”。
- 通常比 `HashSet` 多一些链接与内存开销。

### `TreeSet`：保持排序

```java
Set<String> tags = new TreeSet<>();
```

- 基于树结构，按自然顺序或 `Comparator` 排序。
- 常见基本操作为 `O(log n)`。
- 提供范围与相邻元素查询，例如 `floor`、`ceiling`、`subSet`。
- 比较器如果认为两个元素比较结果为 `0`，TreeSet 会把它们当成重复，即使 `equals` 返回 `false`。

因此排序最好与 `equals` 一致，否则 Set 的直觉语义可能令人困惑。

### `EnumSet`：枚举值专用

```java
EnumSet<Role> roles = EnumSet.of(Role.READER, Role.EDITOR);
```

它是枚举集合的高效专用实现，不允许 `null`。权限、状态集合由 enum 表达时优先考虑它。

## 5. Set 的集合运算

假设：

```java
Set<String> backend = Set.of("Java", "SQL", "HTTP");
Set<String> frontend = Set.of("JavaScript", "HTTP", "CSS");
```

### 并集

```java
Set<String> union = new HashSet<>(backend);
union.addAll(frontend);
```

### 交集

```java
Set<String> intersection = new HashSet<>(backend);
intersection.retainAll(frontend); // [HTTP]，输出顺序不保证
```

### 差集

```java
Set<String> difference = new HashSet<>(backend);
difference.removeAll(frontend); // 后端有、前端没有
```

这些方法会修改接收者，所以先复制原集合。`containsAll` 可判断超集/子集关系。

## 6. Set 的相等性不关心顺序

只要元素相同，两个 Set 即使实现类和迭代顺序不同也相等：

```java
Set<String> left = new HashSet<>(List.of("A", "B"));
Set<String> right = new LinkedHashSet<>(List.of("B", "A"));

System.out.println(left.equals(right)); // true
```

这与 `List.equals` 不同：List 还要求相同位置的元素分别相等。

## 7. 创建不可修改 Set

```java
Set<String> methods = Set.of("GET", "POST");
Set<String> snapshot = Set.copyOf(mutableSet);
```

`Set.of` 和 `Set.copyOf` 返回不可修改 Set，并拒绝 `null`。`Set.of` 的参数如果含重复元素会抛 `IllegalArgumentException`。

不要依赖这些集合的迭代顺序。JDK 会刻意让部分不可修改 Set/Map 的迭代顺序在不同运行间变化，帮助暴露错误的顺序依赖。

`Set.copyOf` 是浅复制：元素对象没有被深度复制。

## 8. `Map<K, V>`：键到值的映射

`Map` 保存键值对：

```java
Map<String, Integer> minutesByTopic = new HashMap<>();
minutesByTopic.put("Java", 45);
minutesByTopic.put("SQL", 30);
```

- 键不能重复；一个键最多映射到一个值。
- 值可以重复。
- `Map` 不继承 `Collection`，因为键值映射不是单纯的元素集合。
- `K` 是键类型，`V` 是值类型。

再次放入相同键会替换旧值：

```java
Integer oldValue = minutesByTopic.put("Java", 60);
// oldValue 是 45，当前 Java 对应 60
```

`put` 返回旧值；如果此前没有映射，通常返回 `null`。

## 9. `get`、`containsKey` 与 `null` 歧义

```java
Integer value = map.get(key);
```

返回 `null` 可能表示：

1. 键不存在。
2. 键存在，但它映射到 `null`。

需要区分时：

```java
if (map.containsKey(key)) {
    Integer existing = map.get(key);
}
```

业务 Map 主动禁止空键和值，通常能让语义更简单。`Map.of` 与 `Map.copyOf` 都拒绝 `null`。

`getOrDefault` 适合“缺少时使用默认值”：

```java
int current = minutesByTopic.getOrDefault("Java", 0);
```

它不会把默认值写回 Map。

## 10. 常用 Map 实现

### `HashMap`：通用键值索引

- 哈希分布合理时，`get` 和 `put` 通常接近常数时间。
- 不保证迭代顺序。
- 允许一个 `null` 键和多个 `null` 值。
- 不是线程安全的。

### `LinkedHashMap`：确定的遇见顺序

默认构造的 `LinkedHashMap` 保留插入顺序。覆盖已有键的值通常不会改变该键的位置。

它还能配置为访问顺序，用于构建 LRU 风格结构，但生产级缓存还要处理并发、容量、过期、统计和加载问题，不应只靠一个 Map 草率实现。

### `TreeMap`：按键排序

- 按键的自然顺序或 `Comparator` 排序。
- 常见基本操作为 `O(log n)`。
- 支持范围查询和最邻近键查询。
- 与 TreeSet 一样，键唯一性由比较结果是否为 `0` 决定。

### `EnumMap`：枚举键专用

```java
Map<OrderStatus, Integer> counts = new EnumMap<>(OrderStatus.class);
```

键必须来自同一个 enum 类型，按枚举常量声明顺序迭代，不允许 `null` 键。

## 11. 哈希表如何查找：先缩小范围，再判断相等

可以把哈希表粗略理解为一组桶：

```text
key.hashCode()
      ↓
计算桶位置
      ↓
只在候选桶中比较 equals
      ↓
找到相等键或确定不存在
```

不同对象完全可能产生相同 hash code，这叫哈希碰撞。哈希表必须继续调用 `equals` 区分碰撞对象，所以 hash code 不是唯一 ID，也不是加密哈希。

合理的哈希分布可以减少候选数量。极端碰撞会降低性能；JDK 的具体桶结构和转换策略属于实现细节，业务代码不应依赖。

## 12. `equals` 的契约

对非空引用，正确的 `equals` 应满足：

- **自反**：`x.equals(x)` 为 true。
- **对称**：`x.equals(y)` 与 `y.equals(x)` 结果一致。
- **传递**：`x` 等于 `y` 且 `y` 等于 `z`，则 `x` 等于 `z`。
- **一致**：对象相关状态没变时，多次调用结果一致。
- **非空**：`x.equals(null)` 为 false。

业务上还要先回答“身份是什么”。用户可能按数据库 ID 相等，值对象可能按全部组件相等。不能在没有领域定义时机械生成方法。

## 13. `hashCode` 的契约

必须保证：

```text
x.equals(y) == true  ⇒  x.hashCode() == y.hashCode()
```

反方向不成立：hash code 相同不代表对象相等。

如果重写 `equals`，通常必须同时重写 `hashCode`，且两者使用一致的身份字段。否则对象在 List 中按值查找可能正常，放入 HashSet 或作为 HashMap 键后却表现异常。

## 14. 引用相同与业务相等

```java
String left = new String("Java");
String right = new String("Java");

System.out.println(left == right);      // false：不是同一引用
System.out.println(left.equals(right)); // true：文本内容相等
```

- 对引用类型，`==` 判断是否指向同一对象。
- `equals` 判断类型定义的逻辑相等性。
- `Objects.equals(a, b)` 可以安全处理 `null`。

基本类型的 `==` 比较数值；不要把这套规则与引用比较混在一起。

## 15. record 作为值对象和键

record 会根据所有组件生成 `equals` 与 `hashCode`：

```java
public record UserId(long value) {
    public UserId {
        if (value <= 0) {
            throw new IllegalArgumentException("用户 ID 必须为正数");
        }
    }
}
```

两个 `new UserId(42)` 相等并具有相同 hash code。组件本身也应具有合理相等性，且最好不可变。

record 是浅不可变：组件引用不能重新赋值，但如果组件指向可变 List，对象图仍能变化。作为哈希键时优先使用字符串、数字、enum、不可变 record 等稳定值。

## 16. 普通类手写 `equals` 与 `hashCode`

```java
public final class UserId {
    private final long value;

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof UserId userId)) {
            return false;
        }
        return value == userId.value;
    }

    @Override
    public int hashCode() {
        return Long.hashCode(value);
    }
}
```

类型可继承时，相等性容易破坏对称性和传递性。值对象通常设计为 `final` 或 record，可以减少这类问题。IDE 可以生成方法，但开发者仍必须确认身份字段和契约正确。

## 17. 绝不能随意修改哈希键

假设一个可变对象的 `email` 同时参与 `equals` 和 `hashCode`：

```java
Set<User> users = new HashSet<>();
users.add(user);
user.setEmail("new@example.com");
```

对象仍存放在按照旧 hash code 选择的桶中，但查找会根据新 hash code 去另一个位置。此时 `contains(user)` 甚至可能返回 false，删除也可能失败。

正确策略：

- 键使用不可变值对象。
- 不让可变展示字段参与持久身份。
- 如果确实要改变键，先用旧值删除，修改后再重新加入；这仍不如不可变设计可靠。

官方 Set 规范明确指出：元素位于集合中时，如果修改会影响 `equals` 比较的状态，行为不受保证。

## 18. Map 的更新方法

### 仅在键不存在时写入

```java
usersById.putIfAbsent(user.id(), user);
```

注意：对允许 `null` 值的 Map，键映射到 `null` 时也可能被视为可写入。

### 延迟创建分组容器

```java
topicsByUser
        .computeIfAbsent(userId, ignored -> new LinkedHashSet<>())
        .add(topic);
```

只有键缺少或映射为 `null` 时才调用函数。函数返回 `null` 时不会建立映射。计算函数不应递归修改同一个 Map，具体实现可能检测并抛异常。

### 合并计数

```java
counts.merge(status, 1, Integer::sum);
```

键不存在时写入 `1`；存在时用旧值和 `1` 计算新值。若合并函数返回 `null`，映射会被删除。

对可能溢出的累计值，不要使用悄悄回绕的 `Integer::sum`：

```java
minutes.merge(topic, delta, Math::addExact);
```

如果一次操作要同步更新多张 Map，仅靠这些便捷方法不等于事务。应先验证和计算所有可能失败的内容，再按明确边界更新；数据库状态则需要真正的事务机制。

## 19. 遍历 Map

### 同时需要键和值：`entrySet`

```java
for (Map.Entry<String, Integer> entry : minutesByTopic.entrySet()) {
    System.out.println(entry.getKey() + ": " + entry.getValue());
}
```

不要遍历 `keySet` 后对每个键再 `get`，`entrySet` 更直接，也避免重复查找。

### 只需要键或值

```java
for (String key : map.keySet()) {
    System.out.println(key);
}

for (Integer value : map.values()) {
    System.out.println(value);
}
```

`values` 是 Collection 而不是 Set，因为不同键可以映射到相等的值。

### 简短处理使用 `forEach`

```java
map.forEach((key, value) ->
        System.out.println(key + " -> " + value));
```

## 20. Map 的集合视图共享状态

`keySet()`、`values()`、`entrySet()` 返回由原 Map 支撑的视图：

```java
Map<String, Integer> scores = new HashMap<>();
scores.put("A", 10);

Set<String> keys = scores.keySet();
keys.remove("A");
System.out.println(scores.isEmpty()); // true
```

通过某些视图删除元素会同步修改 Map；通常不能通过 `keySet.add` 加入键，因为缺少对应值。

迭代时绕过迭代器结构性修改 Map，同样可能触发 fail-fast 的 `ConcurrentModificationException`。

## 21. 不可修改 Map 与防御性副本

```java
Map<String, Integer> constants = Map.of("OK", 200, "NOT_FOUND", 404);
Map<String, Integer> snapshot = Map.copyOf(mutableMap);
```

这些工厂返回不可修改 Map，拒绝空键和值。`Map.of` 重复键会抛 `IllegalArgumentException`。

`Map.copyOf` 不承诺保留输入 Map 的迭代顺序。对外协议或测试确实需要插入顺序时，可以明确复制为 `LinkedHashMap` 后包装：

```java
Map<K, V> snapshot = Collections.unmodifiableMap(
        new LinkedHashMap<>(source)
);
```

包装仍是浅层的。如果值是可变 Set，调用者仍可通过 `snapshot.get(key).add(...)` 修改内部数据。

## 22. 嵌套集合需要逐层复制

对于 `Map<String, Set<String>>`：

```java
Map<String, Set<String>> copy = new LinkedHashMap<>();

for (Map.Entry<String, Set<String>> entry : source.entrySet()) {
    Set<String> valueCopy = Collections.unmodifiableSet(
            new LinkedHashSet<>(entry.getValue())
    );
    copy.put(entry.getKey(), valueCopy);
}

return Collections.unmodifiableMap(copy);
```

这里完成了两层保护：

1. 每个内部 Set 都被复制并包装。
2. 外层 Map 也被复制并包装。

这仍然是针对当前两层结构的复制，不是通用“递归深拷贝”。如果元素本身可变，还要定义元素的复制策略。

## 23. 顺序到底来自哪里

| 类型 | 顺序契约 |
| --- | --- |
| `HashSet` / `HashMap` | 不保证迭代顺序 |
| `LinkedHashSet` | 遇见顺序，通常为首次插入顺序 |
| 默认 `LinkedHashMap` | 键的插入顺序 |
| 访问顺序 `LinkedHashMap` | 最近访问会影响顺序 |
| `TreeSet` / `TreeMap` | 自然顺序或 Comparator 顺序 |
| `EnumSet` / `EnumMap` | enum 常量声明顺序 |
| `Set.of` / `Map.of` | 顺序未指定且可能跨运行变化 |

如果顺序影响 JSON 输出、签名、缓存键或测试结果，就必须明确选用有相应契约的数据结构，或在输出边界显式排序。

## 24. JDK 21+ 的顺序集合接口

JDK 21 引入：

- `SequencedSet<E>`：有明确遇见顺序、支持首尾访问和反向视图。
- `SequencedMap<K, V>`：有明确键值遇见顺序，支持首尾 Entry 和反向视图。

`LinkedHashSet`、`SortedSet` 等实现/接口进入 `SequencedSet` 体系；`LinkedHashMap`、`SortedMap` 等进入 `SequencedMap` 体系。

```java
Map.Entry<K, V> first = sequencedMap.firstEntry();
SequencedMap<K, V> reverseView = sequencedMap.reversed();
```

`reversed()` 返回视图，不是副本。为了兼容 JDK 17，本课完整示例不直接使用这些 API。

## 25. 容量、负载因子与性能判断

HashMap/HashSet 在元素增多到一定程度时会扩容。构造器允许指定初始容量和负载因子，但默认配置适合多数场景。

只有在以下情况才值得调整：

- 已知会一次装入非常多元素。
- 性能分析表明确认扩容是显著热点。
- 理解实现的容量语义和空间换时间代价。

不要把平均 `O(1)` 理解为每次固定耗时。它依赖合理的 hash code、负载、碰撞情况和实现策略。也不要用微小示例凭肉眼比较集合性能；可靠结论需要 JMH 等正确基准工具。

## 26. 并发边界

`HashSet`、`HashMap`、`LinkedHashMap` 都不是线程安全的。多个线程同时修改会形成数据竞争。

即使单个 `putIfAbsent` 或 `computeIfAbsent` 看起来像复合操作，普通 HashMap 也没有为并发访问提供整体安全保证。共享并发索引通常考虑 `ConcurrentHashMap`，但跨多个键、多个集合或外部系统的一致性仍需要更高层协调。

不可修改快照适合在线程之间传递稳定读视图，但浅快照中的可变值仍可能共享状态。

## 27. 完整示例：幂等学习统计

示例按 `sessionId` 去重，统计各主题分钟数，并建立“学习者 → 去重主题”的嵌套索引：

::: code-group

<<< ../../../examples/java/set-map/src/learning/backend/collections/LearningSession.java{java:line-numbers} [LearningSession.java]

<<< ../../../examples/java/set-map/src/learning/backend/collections/StudyAnalytics.java{java:line-numbers} [StudyAnalytics.java]

<<< ../../../examples/java/set-map/src/learning/backend/collections/StudyAnalyticsApp.java{java:line-numbers} [StudyAnalyticsApp.java]

:::

编译：

```bash
cd examples/java/set-map
mkdir -p out
javac --release 17 -Xlint:all -d out \
  src/learning/backend/collections/LearningSession.java \
  src/learning/backend/collections/StudyAnalytics.java \
  src/learning/backend/collections/StudyAnalyticsApp.java
```

运行：

```bash
java -cp out learning.backend.collections.StudyAnalyticsApp
```

预期输出：

```text
首次场次已接收：true
重复场次已接收：false
唯一场次数：3
--- 各主题分钟数 ---
Java 集合：75 分钟
异常处理：60 分钟
--- 每位学习者的主题 ---
小林：[Java 集合, 异常处理]
小周：[Java 集合]
嵌套快照拒绝修改：UnsupportedOperationException
```

执行过程：

1. `LearningSession` 是不可变 record，构造时规范化文本并验证分钟数。
2. `HashSet<String>` 保存已处理场次 ID，只关心快速成员检查，不依赖输出顺序。
3. 重复 ID 直接返回 `false`，不会重复累计分钟数。
4. 更新前用 `getOrDefault` 取得旧值，并用 `Math.addExact` 检查累计溢出。
5. `LinkedHashMap` 让示例报告保持主题和学习者首次出现顺序。
6. `computeIfAbsent` 只在第一次看到学习者时创建内部 `LinkedHashSet`。
7. 内部 Set 自动去除同一学习者的重复主题，同时保留首次出现顺序。
8. 分钟 Map 快照复制并包装，调用者不能修改聚合状态。
9. 嵌套快照逐个复制内部 Set，再包装外层 Map，阻止从任意一层越权修改。

示例先计算可能溢出的新分钟数，再更新三个集合，因此 `Math.addExact` 失败时不会留下“ID 已处理但分钟未累计”的局部状态。这不等同于通用事务：如果更新还涉及数据库、消息队列或其他可能失败的步骤，需要更完整的一致性设计。

## 28. JavaScript `Set` / `Map` 对照

| 关注点 | Java | JavaScript |
| --- | --- | --- |
| 元素与键类型 | `Set<E>`、`Map<K,V>` 静态约束 | 可混合不同类型 |
| 对象键相等性 | `equals` + `hashCode` | 对象按引用身份；原始值按 SameValueZero |
| 插入顺序 | 取决于具体实现 | Set/Map 规范保留插入顺序 |
| 普通哈希实现 | `HashSet` / `HashMap` | 内建 Set/Map，不暴露实现类型 |
| 排序集合 | `TreeSet` / `TreeMap` | 无对应内建排序 Set/Map |
| 不可修改工厂 | `Set.of` / `Map.of` | 没有完全对应的原生只读工厂 |
| 获取缺失键 | 通常返回 `null` | 返回 `undefined` |
| 判断键存在 | `containsKey` | `has` |

JavaScript 中两个字段相同的普通对象仍是不同 Map 键：

```javascript
new Map([[{ id: 1 }, "A"]]).get({ id: 1 }) // undefined
```

Java 可以通过值对象的 `equals`/`hashCode` 让两个 `new UserId(1)` 命中同一个逻辑键。这更灵活，也要求开发者严格维护相等性契约。

## 29. 常见错误与排查

### 常见错误

- 使用 `HashMap` 或 `HashSet`，却依赖当前观察到的迭代顺序。
- 只重写 `equals`，没有同步重写 `hashCode`。
- 用 `==` 比较两个值对象或字符串内容。
- 把可变对象放入 HashSet 后修改参与相等性的字段。
- 使用可变 List 作为 Map 键，随后改变列表内容。
- 认为 hash code 是唯一值、数据库 ID 或安全摘要。
- `get(key) == null` 时直接认定键不存在。
- 遍历 `keySet` 并反复 `get`，其实同时需要键和值。
- 误以为 `Map.copyOf` 会保留 `LinkedHashMap` 顺序。
- 只包装外层 Map，却把可变 Set 值暴露给调用者。
- 在 `computeIfAbsent` 的函数里递归修改同一个 Map。
- 使用 `Integer::sum` 聚合不可信大数据，忽略整数溢出。
- 把普通 HashMap 的便捷更新方法误当成并发安全事务。

### 排查顺序

1. 明确业务需要的是重复序列、唯一成员还是键值索引。
2. 确认实际实现类是否提供所依赖的顺序与空值契约。
3. 查找失败时打印键的类型、`equals` 结果和 `hashCode`，检查键是否被修改。
4. 确认 `equals` 与 `hashCode` 使用同一组身份字段。
5. Map 返回 `null` 时，用 `containsKey` 区分缺少映射和空值映射。
6. 嵌套状态泄漏时逐层检查副本与不可修改包装。
7. 聚合结果异常时检查重复事件、溢出和更新步骤的失败边界。
8. 并发异常时确认是否共享普通集合，以及复合操作是否需要整体原子性。

## 30. 本节总结

- `Set` 表达唯一成员，`Map` 表达唯一键到值的映射；Map 不继承 Collection。
- HashSet/HashMap 适合通用快速查找，但不保证迭代顺序。
- LinkedHashSet/LinkedHashMap 提供确定遇见顺序，TreeSet/TreeMap 提供排序与范围操作。
- Set 去重和 Map 键查找依赖 `equals` 与 `hashCode` 的共同契约。
- 相等对象必须具有相同 hash code；相同 hash code 不代表对象相等。
- record 适合构建不可变值对象和稳定键，但组件本身仍需正确且最好不可变。
- 进入哈希集合后，不得修改影响对象相等性和 hash code 的状态。
- `getOrDefault`、`computeIfAbsent` 和 `merge` 能表达常见聚合，但不自动提供跨状态事务。
- Map 的 `keySet`、`values`、`entrySet` 是共享视图；复制与视图必须区分。
- 嵌套集合的安全边界需要逐层复制和包装，浅层不可修改不足以保护内部值。
- 普通哈希集合不是线程安全容器，并发一致性必须单独设计。

下一节：[Java 泛型深入、通配符、类型擦除与 API 设计](/backend/java/generics-wildcards-type-erasure-and-api-design)。

## 31. 参考资料

- [Java SE 25：`Object.equals` 与 `hashCode`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Object.html)
- [Java SE 25：`Set` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/Set.html)
- [Java SE 25：`HashSet` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/HashSet.html)
- [Java SE 25：`LinkedHashSet` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/LinkedHashSet.html)
- [Java SE 25：`TreeSet` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/TreeSet.html)
- [Java SE 25：`Map` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/Map.html)
- [Java SE 25：`HashMap` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/HashMap.html)
- [Java SE 25：`LinkedHashMap` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/LinkedHashMap.html)
- [Java SE 25：`TreeMap` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/TreeMap.html)
- [Java SE 25：`SequencedSet` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/SequencedSet.html)
- [Java SE 25：`SequencedMap` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/SequencedMap.html)
