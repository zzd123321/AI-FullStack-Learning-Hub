---
title: Java 泛型深入、通配符、类型擦除与 API 设计
description: 掌握泛型类与方法、上下界、PECS、类型擦除和类型安全 API 的设计原则
outline: deep
---

# Java 泛型深入、通配符、类型擦除与 API 设计

> 适用环境：JDK 25 LTS。完整示例兼容 JDK 17 和 21；本节只使用正式 Java 语言特性。

## 泛型不是另一套集合 API

前两课一直在写 `List<String>`、`Set<CourseId>` 和 `Map<String, User>`。尖括号中的类型不是装饰，它把“放进去的类型”和“取出来的类型”连接成一份编译期合同。

本课只是把这份合同推广到我们自己的类和方法：

```text
Box<T> 声明：存入和取出的是同一种 T
Box<String> 使用：这一次把 T 确定为 String
```

第一次学习优先掌握 `T` 的含义、泛型类、泛型方法，以及为什么 `List<Dog>` 不能直接当作 `List<Animal>`。通配符、PECS、类型擦除和堆污染是 API 设计进阶，不应阻挡你正常使用集合。

## 为什么 List&lt;Dog&gt; 不能当 List&lt;Animal&gt;

不要先背“不变性”，先做一次反证。假如赋值被允许：

```java
List<Dog> dogs = new ArrayList<>();
List<Animal> animals = dogs; // 假设允许
animals.add(new Cat());      // 对 List<Animal> 完全合法
Dog dog = dogs.get(0);       // 现在却取出一只 Cat，类型合同被破坏
```

编译器禁止第二行，正是为了保证从 `List<Dog>` 取出的永远可以当 `Dog`。通配符是在明确限制能力后安全放宽接收范围：`List<? extends Animal>` 可以读取为 `Animal`，却不能随意写入；`List<? super Dog>` 可以安全写入 `Dog`，读取时只能先当 `Object`。

```text
? extends Animal：来源可能是 Dog 列表或 Cat 列表 → 适合读
? super Dog：目标可能是 Dog、Animal 或 Object 列表 → 适合写 Dog
```

PECS 是这个读写方向的助记法，不是看到参数就机械加通配符。若一个方法既要写入又要精确读出同一种类型，通常需要有名字的类型参数 `T`。

泛型主要在编译期守合同；类型擦除后，JVM 通常看不到 `List<String>` 与 `List<Integer>` 的完整参数差异。这解释了为什么不能直接 `new T()`、不能可靠地 `instanceof List<String>`，也解释了原始类型为何会把问题推迟成运行时 `ClassCastException`。

## 1. 学习目标

完成本节后，你应该能够：

- 区分泛型声明、类型参数、类型实参、参数化类型和泛型方法。
- 为类、接口和方法声明一个或多个类型参数。
- 使用上界与交叉类型约束类型参数的能力。
- 解释为什么 `List<Dog>` 不是 `List<Animal>` 的子类型。
- 根据读写方向选择 `? extends T`、`? super T` 或精确的 `T`。
- 理解 PECS 的含义和适用边界。
- 判断何时应使用通配符，何时应声明一个有名字的类型参数。
- 解释类型擦除、可具体化类型、桥接方法和原始类型。
- 理解 `new T()`、`T.class`、`new T[]`、`instanceof List<String>` 为什么不合法。
- 识别未检查转换、堆污染和泛型可变参数风险。
- 使用 `Supplier<? extends T>` 或 `Class<T>` 解决运行期创建对象的问题。
- 设计能保留具体子类型、隐藏实现并减少调用者类型转换的 API。

## 2. 泛型解决的核心问题

没有泛型时，容器只能暴露 `Object`：

```java
List values = new ArrayList();
values.add("Java");
values.add(42);

String topic = (String) values.get(1); // 运行时 ClassCastException
```

泛型把元素类型写进 API：

```java
List<String> topics = new ArrayList<>();
topics.add("Java");
// topics.add(42); // 编译错误

String topic = topics.get(0); // 不需要强制转换
```

主要收益是：

- 编译期发现不匹配类型。
- 消除大量显式强制转换。
- 把“输入与输出类型之间的关系”写入方法签名。
- 让一份算法安全复用于多种引用类型。

泛型不是运行时验证框架，也不会让每个参数化类型生成一份新字节码。

## 3. 先分清五个术语

```java
public final class Box<T> {
    private T value;
}

Box<String> box = new Box<>();
```

| 术语 | 示例 | 含义 |
| --- | --- | --- |
| 泛型声明 | `class Box<T>` | 声明了类型变量的类或接口 |
| 类型参数 | `T` | 声明处引入的类型变量 |
| 类型实参 | `String` | 使用时传入的具体引用类型 |
| 参数化类型 | `Box<String>` | 泛型声明与类型实参组合出的类型 |
| 原始类型 | `Box` | 省略类型实参的旧式兼容形式 |

方法也可以单独声明类型参数，它不要求所在类本身是泛型类。

## 4. 类型参数命名约定

常见单字母约定：

- `T`：Type，普通类型。
- `E`：Element，集合元素。
- `K`：Key，Map 键。
- `V`：Value，Map 值。
- `R`：Result，计算结果。
- `S`、`U`：额外类型或子类型。

```java
Map<K, V>
Function<T, R>
```

简单泛型使用约定字母更容易识别。类型角色复杂时也可以用更具说明性的名字，但团队应保持一致。

## 5. 泛型类与泛型接口

### 一个类型参数

```java
public final class Box<T> {
    private final T value;

    public Box(T value) {
        this.value = value;
    }

    public T value() {
        return value;
    }
}
```

类体内可以像使用普通类型一样使用 `T`，但只能调用其上界保证存在的方法。未声明上界时，隐式上界是 `Object`。

### 多个类型参数

```java
public interface Repository<ID, E> {
    Optional<E> findById(ID id);
    E save(E entity);
}
```

这里签名建立了两种关系：查询参数必须是 `ID`，返回和保存对象必须是 `E`。

## 6. 有界类型参数

如果算法需要调用特定接口方法，就要声明上界：

```java
public final class InMemoryRepository<ID, E extends Identified<ID>> {
    public E save(E entity) {
        ID id = entity.id();
        // ...
        return entity;
    }
}
```

`E extends Identified<ID>` 表示 E 必须是实现/继承了 `Identified<ID>` 的类型。泛型语法对类和接口上界都使用 `extends`，不是 `implements`。

上界同时为编译器提供能力：没有这个约束，编译器不知道 `E` 一定有 `id()`。

## 7. 多重上界与交叉类型

类型参数可以同时要求一个类和多个接口：

```java
<T extends BaseEntity & Comparable<T> & Serializable>
```

规则：

- 最多一个类上界。
- 如果有类上界，必须放在第一位。
- 后面可以跟多个接口，用 `&` 连接。
- 擦除时以最左侧上界为基础，因此顺序具有二进制层面的意义。

不要为了炫技堆叠约束。公共 API 的上界越复杂，调用者能使用的类型越少。

## 8. 泛型方法的声明位置

方法自己的类型参数写在返回类型之前：

```java
public static <T> T first(List<T> values) {
    return values.get(0);
}
```

不是：

```java
// public static T <T> first(...) // 语法错误
```

实例方法、静态方法和构造器都可以声明类型参数。静态方法不能直接使用泛型类的实例类型参数，因为静态成员属于类本身：

```java
class Box<T> {
    // static T empty; // 编译错误

    static <U> U identity(U value) {
        return value;
    }
}
```

`U` 是静态方法自己的类型参数，与类的 `T` 无关。

## 9. 类型推断与显式类型见证

调用泛型方法时，编译器通常从参数和目标类型推断 `T`：

```java
String value = identity("Java");
List<String> empty = List.of();
```

必要时可以显式指定类型实参：

```java
List<LearningResource> empty = List.<LearningResource>of();
```

`<LearningResource>` 称为显式类型见证。静态方法前通常要带类名，不能单独写在表达式最前面。

菱形语法 `<>` 用于构造泛型对象：

```java
InMemoryRepository<String, LearningResource> repository =
        new InMemoryRepository<>();
```

右侧类型参数由左侧目标类型推断。

## 10. 泛型是不变的

假设：

```java
class Animal {}
class Dog extends Animal {}
class Cat extends Animal {}
```

`Dog` 是 `Animal` 的子类型，但 `List<Dog>` 不是 `List<Animal>` 的子类型：

```java
List<Dog> dogs = new ArrayList<>();
// List<Animal> animals = dogs; // 编译错误
```

如果允许赋值，就能执行：

```java
animals.add(new Cat());
```

原本承诺只放 Dog 的列表会混入 Cat。泛型不变性正是为了阻止这个类型漏洞。

`List<Dog>` 和 `List<Animal>` 都是 `List<?>` 的子类型，但 `List<?>` 对可写入内容施加了严格限制。

## 11. 数组协变为何不同

Java 数组是协变的：

```java
Dog[] dogs = new Dog[1];
Animal[] animals = dogs;
animals[0] = new Cat(); // 运行时 ArrayStoreException
```

数组在运行时知道元素类型，所以在写入时检查并失败。泛型选择在编译期拒绝不安全赋值。

这也是泛型集合通常比对象数组更容易提供静态类型安全的原因。不要把数组协变规则套到泛型上。

## 12. 无界通配符 `?`

```java
public static int sizeOf(List<?> values) {
    return values.size();
}
```

`List<?>` 表示“某种确定但当前未知元素类型的 List”，它不是 `List<Object>`。

可以安全做的事：

- 获取 `size`、判断为空、清空（如果实现允许）。
- 读取为 `Object`。
- 删除已有元素或通过迭代器删除（如果实现允许）。

不能安全加入任意非 null 对象，因为编译器不知道隐藏的实际类型：

```java
List<?> values = List.of("A");
Object first = values.get(0);
// values.add("B"); // 编译错误
```

技术上可以添加 `null`，但它通常没有业务价值，并可能被具体实现拒绝。

## 13. 上界通配符 `? extends T`

```java
public static double sum(List<? extends Number> values) {
    double total = 0;
    for (Number value : values) {
        total += value.doubleValue();
    }
    return total;
}
```

它可以接收 `List<Integer>`、`List<Long>`、`List<Double>`。编译器只知道每个元素至少是 Number，因此读取为 Number 安全。

但不能加入 Number：

```java
// values.add(Integer.valueOf(1)); // 编译错误
```

实际对象可能是 `List<Double>`，加入 Integer 会破坏其元素承诺。

把 `? extends T` 理解为“该参数向方法生产 T”。它适合主要读取的输入源。

## 14. 下界通配符 `? super T`

```java
public static void addDogs(List<? super Dog> target) {
    target.add(new Dog());
}
```

它可以接收 `List<Dog>`、`List<Animal>` 或 `List<Object>`。这些容器都能安全接收 Dog。

读取时只能保证得到 Object：

```java
Object value = target.get(0);
```

因为容器可能原本还包含其他 Animal 或 Object。

把 `? super T` 理解为“该参数消费方法提供的 T”。它适合主要写入的目标。

## 15. PECS：Producer Extends, Consumer Super

经典规则：

```text
输入源生产 T  → ? extends T
输出目标消费 T → ? super T
```

复制方法正好同时体现两边：

```java
public static <T> void copy(
        Iterable<? extends T> source,
        Collection<? super T> target
) {
    for (T element : source) {
        target.add(element);
    }
}
```

可以把 `List<Dog>` 复制到 `List<Animal>` 或 `List<Object>`。

PECS 是从“当前方法如何使用参数”的角度命名，不是说对象永久是生产者或消费者。同一个集合如果既要精确读取又要写入，往往应使用 `List<T>` 而非通配符。

## 16. 什么时候使用 `T`，什么时候使用 `?`

类型参数的价值是建立多个位置之间的关系：

```java
public static <T> T choose(T left, T right)
```

输入和输出共享同一个 T，所以需要给类型命名。

如果一个类型只出现一次，通常通配符更直接：

```java
public static void printAll(List<?> values)
```

不必写成：

```java
public static <T> void printAll(List<T> values)
```

判断方法：

- 需要关联两个参数、参数和返回值，使用命名类型参数。
- 只需要表达“任何类型”或单向读写能力，使用通配符。
- 调用者必须知道精确返回类型时，避免返回通配符。

## 17. 返回类型通常不要使用通配符

```java
// 不友好的 API
public List<? extends LearningResource> findAll()
```

调用者会被迫处理一个未知捕获类型，很多合法操作变得困难。如果方法拥有并确定元素抽象，通常返回：

```java
public List<LearningResource> findAll()
```

通配符更常出现在输入参数中，用来放宽调用者能传入的类型。返回值应尽量精确、稳定并容易使用。

## 18. 泛型方法保留具体子类型

仓库保存方法可以写成：

```java
public <S extends E> S save(S entity) {
    storage.put(entity.id(), entity);
    return entity;
}
```

如果仓库元素类型是 `LearningResource`，传入 `Article` 时返回类型仍推断为 Article：

```java
Article article = repository.save(new Article(...));
```

若签名只是 `E save(E entity)`，返回值静态类型会是 LearningResource，调用者将丢失更具体的信息。

这个模式常见于 Spring Data 的 `<S extends T> S save(S entity)`。只有实现确实返回传入的具体类型或等价子类型时才应使用，不能用签名许诺实现无法保证的事情。

## 19. 递归类型边界与 Comparable

求最大值时常见：

```java
public static <T extends Comparable<? super T>> T max(
        List<? extends T> values
)
```

拆开理解：

- `T extends Comparable<...>`：T 必须可比较。
- `Comparable<? super T>`：比较器可以接收 T 或 T 的某个父类型。
- `List<? extends T>`：输入可以是 T 的某个具体子类型列表。

为什么不是简单的 `Comparable<T>`？某个父类可能已经实现 `Comparable<Parent>`，子类继承后依然应该可以参与比较。`? super T` 给这种情况留下空间。

这类自引用/F-bounded 写法读起来复杂，应封装在稳定的工具 API 中，而不是让业务代码到处重复。

## 20. 通配符捕获

下面的方法不能直接交换两个未知类型列表的元素：

```java
void swapFirst(List<?> values) {
    // values.set(0, values.get(1)); // 可能出现 capture of ? 错误
}
```

编译器给每个 `?` 创建一个内部的“捕获类型”。辅助泛型方法可以给它命名：

```java
public static void swapFirstTwo(List<?> values) {
    swapFirstTwoCaptured(values);
}

private static <T> void swapFirstTwoCaptured(List<T> values) {
    T first = values.get(0);
    values.set(0, values.get(1));
    values.set(1, first);
}
```

API 使用者通常不必手工处理捕获；看到 `CAP#1` 或 `capture of ?` 时，先检查是否需要辅助泛型方法或更清晰的签名。

## 21. Java 泛型使用类型擦除

编译器大致执行：

1. 用类型参数的上界替换类型参数；无显式上界时使用 Object。
2. 在需要的位置插入强制转换。
3. 必要时生成桥接方法，保持重写后的多态行为。

例如：

```java
class Box<T> {
    T value;
    T get() { return value; }
}
```

擦除后可粗略理解为：

```java
class Box {
    Object value;
    Object get() { return value; }
}
```

调用 `Box<String>.get()` 时，编译器在适当位置保证/插入 String 转换。真实字节码细节应以编译器输出和 JVM 规范为准，这个模型用于建立直觉。

`Box<String>` 和 `Box<Integer>` 在运行时通常共享同一个 `Box.class`，不会各生成一份类。

## 22. 擦除不等于“运行时完全没有泛型信息”

对象实例通常不知道 `new ArrayList<String>()` 中的 String，但类文件可以在 Signature 等元数据中保留声明信息，反射能够读取字段、方法和父类型签名中的部分泛型结构。

```java
class UserRepository implements Repository<Long, User> {}
```

反射可能读取到这个声明的类型实参。然而局部变量或普通对象实例的实际参数化通常不能靠 `instanceof` 恢复。

框架依赖反射解析泛型时，还会遇到继承层次、代理、类型变量和桥接方法等问题。不要简单声称“擦除后反射什么也看不到”。

## 23. 可具体化类型与 `instanceof`

运行时类型信息完整可用的类型称为 reifiable type。允许：

```java
if (value instanceof List<?>) {
    // 只知道它是某种 List
}
```

不允许：

```java
// if (value instanceof List<String>) { }
```

因为运行时无法普遍区分 `List<String>` 与 `List<Integer>`。

模式匹配也不能绕开这个限制。先检查 `List<?>`，再逐个验证元素，才是处理不可信动态数据的方式。

## 24. 为什么不能 `new T()`

```java
class Factory<T> {
    // T create() { return new T(); } // 编译错误
}
```

编译器不知道 T 的具体构造器，擦除后也没有足够信息选择它。更好的 API 是显式接收工厂：

```java
class Factory<T> {
    private final Supplier<? extends T> supplier;

    Factory(Supplier<? extends T> supplier) {
        this.supplier = supplier;
    }

    T create() {
        return supplier.get();
    }
}
```

调用方把具体构造方式作为方法引用传入：

```java
Factory<ArrayList<String>> factory = new Factory<>(ArrayList::new);
```

如果必须反射创建，可传入 `Class<T>` 或专门工厂对象，但反射构造会带来构造器可见性、受检异常和模块边界问题。

## 25. 为什么不能使用 `T.class`

```java
// Class<T> type = T.class; // 编译错误
```

需要运行期类型令牌时，由调用者传入：

```java
public final class JsonReader<T> {
    private final Class<T> type;

    public JsonReader(Class<T> type) {
        this.type = type;
    }
}

JsonReader<User> reader = new JsonReader<>(User.class);
```

`Class<T>` 可以表示非泛型类或擦除后的类。要表达 `List<User>` 这类嵌套参数化类型，框架通常提供自己的 TypeToken/TypeReference 抽象，利用匿名子类签名保留结构。

## 26. 泛型数组限制

不允许直接创建：

```java
// T[] values = new T[10];
// List<String>[] groups = new List<String>[10];
```

数组在运行时检查元素类型，而大部分参数化类型已擦除，两套机制组合会产生无法可靠执行的类型检查。

可以声明 `T[]` 字段或参数，但创建通常需要：

- 改用 `List<T>`。
- 由调用者传入数组工厂，例如 `IntFunction<T[]>`。
- 在底层库中使用受控转换，并严格隔离未检查警告。

普通业务代码优先使用集合，不要用 `(T[]) new Object[...]` 隐藏风险。

## 27. 原始类型不是 `<?>`

```java
List raw = new ArrayList(); // 原始类型
List<?> unknown = List.of("A");
```

原始类型关闭了部分泛型检查，可以写入不同类型并产生未检查警告。它只为 Java 5 之前的旧代码互操作保留。

`List<?>` 仍是受类型系统保护的参数化类型，表示未知但一致的元素类型。新代码应消除 raw type，而不是用 `@SuppressWarnings` 全局压掉问题。

始终使用：

```bash
javac -Xlint:all ...
```

让 raw type、unchecked 和泛型可变参数风险尽早暴露。

## 28. 堆污染与未检查转换

堆污染（heap pollution）表示参数化类型变量引用了不符合其参数类型的对象，常由原始类型、未检查转换或不安全可变参数造成：

```java
List<String> strings = new ArrayList<>();
List raw = strings;
raw.add(42); // 未检查写入

String value = strings.get(0); // 读取处 ClassCastException
```

错误发生在污染点，异常却可能很晚才在读取处出现。修复原则：

- 删除原始类型。
- 避免未经证明的强制转换。
- 无法避免时，把转换隔离在很小的底层方法中。
- 先运行时验证，再转换。
- 只对已人工证明安全的最小范围使用 `@SuppressWarnings("unchecked")`，并写明理由。

## 29. 泛型可变参数与 `@SafeVarargs`

可变参数在运行时使用数组，而参数化类型可能不可具体化：

```java
static <T> void accept(List<T>... groups) { }
```

编译器会报告潜在堆污染警告。方法如果不向数组写入不兼容值、也不泄漏数组引用，某些 `static`、`final`、`private` 方法或构造器可以使用 `@SafeVarargs` 声明实现安全。

这个注解是开发者承诺，不是编译器自动证明。不要为了消除警告随意添加；API 能改成 `List<List<T>>` 时通常更清晰。

## 30. 擦除后的重载冲突

下面两个方法无法共存：

```java
void process(List<String> values) {}
void process(List<Integer> values) {}
```

两者擦除后的签名都是 `process(List)`，JVM 无法通过参数化类型区分。应改变方法名、引入不同非泛型参数，或重新设计抽象。

同理，也不能分别捕获参数化异常类型；Java 还不允许泛型类直接继承 `Throwable`。

## 31. 桥接方法为什么出现

```java
interface Source<T> {
    T get();
}

final class StringSource implements Source<String> {
    public String get() {
        return "Java";
    }
}
```

擦除后接口方法返回 Object，而实现方法返回 String。编译器可能生成一个合成桥接方法 `Object get()`，内部转调 `String get()`，以保持 JVM 方法分派和多态契约。

在堆栈、反射或覆盖率工具中看到 bridge/synthetic 方法并不一定是重复业务代码。

## 32. API 设计清单

### 对输入尽量宽容

只读集合输入：

```java
void saveAll(Iterable<? extends E> source)
```

写入目标：

```java
void copyTo(Collection<? super E> target)
```

### 对输出尽量明确

```java
List<E> findAll()
```

避免让调用者处理不必要的 `List<? extends E>`。

### 返回值保护所有权

```java
return List.copyOf(internalValues);
```

泛型只保证元素静态类型，不保证集合不可变、线程安全或深层对象不可变。

### 不要把实现类写进公共签名

```java
List<E> findAll(); // 通常优于 ArrayList<E> findAll()
```

### 只公开必要约束

如果算法只需要 `Identified<ID>`，不要要求具体实体基类。上界是 API 契约，过度约束会减少复用能力。

### 不用通配符炫技

类型签名应该帮助调用者。如果复杂通配符无法建立必要关系，考虑拆分方法、引入领域接口或封装转换。

## 33. 完整示例：类型安全的内存仓库

示例包含双类型参数仓库、实体上界、保留子类型的 save、PECS 复制、Supplier 默认工厂和递归比较上界：

::: code-group

<<< ../../../examples/java/generics/src/learning/backend/generics/Identified.java{java:line-numbers} [Identified.java]

<<< ../../../examples/java/generics/src/learning/backend/generics/LearningResource.java{java:line-numbers} [LearningResource.java]

<<< ../../../examples/java/generics/src/learning/backend/generics/Article.java{java:line-numbers} [Article.java]

<<< ../../../examples/java/generics/src/learning/backend/generics/Video.java{java:line-numbers} [Video.java]

<<< ../../../examples/java/generics/src/learning/backend/generics/InMemoryRepository.java{java:line-numbers} [InMemoryRepository.java]

<<< ../../../examples/java/generics/src/learning/backend/generics/GenericCollections.java{java:line-numbers} [GenericCollections.java]

<<< ../../../examples/java/generics/src/learning/backend/generics/GenericApiApp.java{java:line-numbers} [GenericApiApp.java]

:::

编译：

```bash
cd examples/java/generics
mkdir -p out
javac --release 17 -Xlint:all -d out \
  src/learning/backend/generics/Identified.java \
  src/learning/backend/generics/LearningResource.java \
  src/learning/backend/generics/Article.java \
  src/learning/backend/generics/Video.java \
  src/learning/backend/generics/InMemoryRepository.java \
  src/learning/backend/generics/GenericCollections.java \
  src/learning/backend/generics/GenericApiApp.java
```

运行：

```bash
java -cp out learning.backend.generics.GenericApiApp
```

预期输出：

```text
save 保留具体返回类型：Article
仓库实体数：3
查找 V-001：掌握 PECS
复制到 List<Object>：3 项
最长学习时长：60 分钟
空列表回退：默认资源
仓库快照拒绝修改：UnsupportedOperationException
```

执行过程：

1. `Identified<ID>` 把实体类型与 ID 类型关联起来。
2. `LearningResource` 固定实现 `Identified<String>`，因此资源仓库的 ID 必须是 String。
3. `InMemoryRepository<ID, E extends Identified<ID>>` 让编译器保证 E 一定能提供正确类型的 ID。
4. `<S extends E> S save(S entity)` 保存为 E，但保留调用者传入的 Article 静态返回类型。
5. `saveAll(Iterable<? extends E>)` 可以读取 E 的任意子类型来源。
6. `findAll` 返回 `List.copyOf` 快照，既给出精确 `List<E>`，又不暴露内部 Map。
7. `copy` 从 `? extends T` 读取 T，并写入 `? super T`，把资源复制到 `List<Object>`。
8. `max` 使用 `T extends Comparable<? super T>`，安全比较 Integer。
9. `firstOrElse` 接受 `Supplier<? extends T>`，只在列表为空时创建默认资源，替代不可能实现的 `new T()`。
10. 对仓库快照执行 `add` 会抛 `UnsupportedOperationException`。

## 34. JavaScript / TypeScript 对照

| 关注点 | Java | JavaScript / TypeScript |
| --- | --- | --- |
| 类型检查 | Java 编译器执行，JVM 运行字节码 | JS 运行时动态；TS 编译器静态检查 |
| 泛型实现 | 主要通过类型擦除 | TS 泛型也在输出 JS 时擦除 |
| 类型关系 | 类/接口与声明式类型体系，泛型通常不变 | TS 主要结构化类型，部分位置的变型规则不同 |
| 原始类型 | 为旧 Java 代码兼容保留 | 没有直接对应概念，`any` 同样会绕过安全检查 |
| 通配符 | `? extends` / `? super` | 常用联合类型、条件类型和结构约束表达其他关系 |
| 运行时类型令牌 | `Class<T>` 或框架 TypeToken | 构造函数值、schema 或显式运行时元数据 |
| 基本类型实参 | 需包装类，如 `Integer` | number 本身可作为类型实参 |

Java 和 TypeScript 都不能把仅存在于静态类型系统的信息自动当成运行时数据。解析 JSON 时，`List<User>` 的声明不会验证网络输入；仍然需要 schema、反序列化器或显式校验。

## 35. 常见错误与排查

### 常见错误

- 认为 `List<Dog>` 可以赋给 `List<Animal>`。
- 把 `List<?>` 当成 `List<Object>` 并尝试写入任意对象。
- 在只读输入上写 `List<T>`，无意中拒绝子类型集合。
- 在输出返回值上过度使用 `? extends T`，把复杂性推给调用者。
- 把 PECS 当成所有签名的机械规则，忽略参数实际既读又写。
- 使用原始类型消除编译错误，实际制造堆污染。
- 对大段代码添加 `@SuppressWarnings("unchecked")`。
- 试图通过 `instanceof List<String>` 恢复已擦除的元素类型。
- 写 `new T()`、`T.class` 或 `new T[]`，忽略运行期类型信息不足。
- 用两个仅类型实参不同的方法重载，触发擦除冲突。
- 随意给泛型可变参数加 `@SafeVarargs`。
- 以为泛型快照自动等于深不可变和线程安全。
- API 上界包含实现不需要的类或接口，导致调用者无法复用。

### 排查顺序

1. 标出每个类型参数的声明位置和使用位置。
2. 判断需要建立的是“同一类型关系”还是“未知类型的读/写方向”。
3. 对集合参数标注它在方法中是 producer、consumer，还是两者都是。
4. 遇到 capture 错误时，尝试用私有泛型辅助方法给未知类型命名。
5. 开启 `-Xlint:all`，从最早的 raw/unchecked 警告开始修复。
6. ClassCastException 出现在读取处时，向前追踪原始类型和未检查写入污染点。
7. 运行期类型判断失败时，确认目标是否是不可具体化的参数化类型。
8. API 难以调用时，检查返回通配符、过度上界或多余类型参数。

## 36. 本节总结

- 泛型把类型关系写进类、接口和方法签名，让错误尽量在编译期暴露。
- 泛型类可以有多个类型参数，上界为类型变量提供可调用能力。
- 泛型不变性防止把 Cat 写入 `List<Dog>`；数组协变则把类似错误推迟到运行时。
- `? extends T` 适合读取生产者，`? super T` 适合写入消费者，精确 `T` 适合建立关系或同时读写。
- 类型参数应在多个位置建立有意义的关系；只出现一次时往往用通配符更清楚。
- 公共 API 通常对输入放宽、对输出精确，并返回保护内部所有权的快照。
- Java 泛型主要通过擦除实现，编译器还会插入转换并在必要时生成桥接方法。
- `List<String>` 不是可具体化类型，不能用于参数化 instanceof 或直接创建泛型数组。
- `new T()` 与 `T.class` 缺少运行时类型信息，可用 Supplier、Class 或类型令牌显式补充。
- 原始类型、未检查转换和不安全泛型可变参数可能造成堆污染。
- `@SuppressWarnings` 与 `@SafeVarargs` 是开发者承担证明责任，不是自动修复。
- 泛型只解决静态类型关系，不自动解决输入校验、不可变性、并发安全或事务一致性。

下一节：[Java Lambda、函数式接口、Optional 与 Stream 流水线](/backend/java/lambda-functional-interfaces-optional-and-streams)。

## 37. 参考资料

- [Java Language Specification 25：类型变量、参数化类型、擦除与原始类型](https://docs.oracle.com/javase/specs/jls/se25/html/jls-4.html)
- [Java Language Specification 25：泛型类与类型参数](https://docs.oracle.com/javase/specs/jls/se25/html/jls-8.html#jls-8.1.2)
- [Java Language Specification 25：泛型方法](https://docs.oracle.com/javase/specs/jls/se25/html/jls-8.html#jls-8.4.4)
- [Dev.java：泛型入门](https://dev.java/learn/introducing-generics/)
- [Dev.java：泛型类与接口](https://dev.java/learn/generics/creating-generic-entities/)
- [Dev.java：通配符](https://dev.java/learn/generics/wildcards/)
- [Dev.java：类型擦除](https://dev.java/learn/generics/type-erasure/)
- [Java SE 25：`Supplier` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/function/Supplier.html)
- [Java SE 25：`Comparable` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Comparable.html)
- [Java SE 25：`Optional` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/Optional.html)
