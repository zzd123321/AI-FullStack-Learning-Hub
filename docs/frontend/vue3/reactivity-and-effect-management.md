---
title: Vue 3 响应式原理与副作用管理
description: 从依赖追踪出发，理解 computed、watch、异步清理和深浅响应式边界
outline: deep
---

# Vue 3 响应式原理与副作用管理

[上一课](/frontend/vue3/composition-api-and-component-typing)使用 `ref`、`reactive` 和 `computed` 完成了课程编辑器，也留下了几个关键问题：

- Vue 怎样知道一个计算读取过哪些状态？
- 为什么普通解构可能让 `reactive` 属性失去响应式连接？
- `computed`、`watch` 和 `watchEffect` 都会随状态变化，职责有什么不同？
- 连续输入触发多个请求时，怎样避免旧结果覆盖新结果？

本课用“课程搜索”贯穿这些问题。主线不是记住更多 API，而是判断状态变化后应该发生什么：

```text
状态变化
  ├─ 重新得到一个值       → computed
  ├─ 执行外部操作         → watch / watchEffect
  └─ 旧操作已经失效       → cleanup / 请求身份保护
```

## 响应式系统保存的是关系

普通 JavaScript 表达式只执行一次：

```ts
let price = 100
let quantity = 2
let total = price * quantity

price = 120
console.log(total) // 仍然是 200
```

要让 `total` 自动更新，系统必须知道两件事：

1. 计算 `total` 时读取了 `price` 和 `quantity`；
2. 其中任何一个值变化后，这个计算需要重新执行或失效。

Vue 把这条过程概括为：

```text
执行订阅者
  → 读取响应式状态
  → 收集“谁依赖谁”
  → 状态发生写入
  → 找到相关订阅者
  → 调度重新执行
```

组件渲染、计算属性和 watcher 都建立在这种响应式 effect 上。区别在于它们如何调度，以及执行结果被用来做什么。

## 读取时收集，写入时触发

概念上，Vue 需要记录“某个对象的某个属性有哪些订阅者”：

```ts
WeakMap<object, Map<PropertyKey, Set<ReactiveEffect>>>
```

可以把它读成三层索引：

```text
目标对象 target
    └─ 属性键 key
          └─ 读取过该属性的 effect 集合
```

当一个 effect 正在执行时，响应式属性的读取会调用类似 `track(target, key)` 的逻辑；属性写入则通过类似 `trigger(target, key)` 找出订阅者。

下面只是解释概念的伪代码，不是 Vue 源码：

```ts
let activeEffect: (() => void) | undefined

function track(target: object, key: PropertyKey): void {
  if (!activeEffect) return
  getSubscribers(target, key).add(activeEffect)
}

function trigger(target: object, key: PropertyKey): void {
  for (const effect of getSubscribers(target, key)) {
    schedule(effect)
  }
}
```

这里有两个容易忽略的结论：

- 没有在当前执行路径读取的状态，不会凭空成为依赖；
- “触发”通常是进入调度队列，并不等于每次写入都立即同步渲染。

## `reactive` 用 Proxy 拦截对象属性

JavaScript 的 Proxy 能拦截属性读取、写入、新增、删除、`in` 检查和键遍历。简化模型如下：

```ts
function reactive<T extends object>(target: T): T {
  return new Proxy(target, {
    get(source, key, receiver) {
      track(source, key)
      return Reflect.get(source, key, receiver)
    },
    set(source, key, value, receiver) {
      const changed = Reflect.get(source, key, receiver) !== value
      const result = Reflect.set(source, key, value, receiver)
      if (changed) trigger(source, key)
      return result
    }
  })
}
```

真实实现还要处理嵌套对象、数组、Map、Set、调度和许多边界。伪代码只说明：依赖追踪发生在 Proxy 的属性访问上。

这也是 Vue 3 与 Vue 2 的重要差异。Vue 2 主要使用 `Object.defineProperty` 拦截已有属性；Vue 3 的 Proxy 可以观察新增和删除，因此不再需要 `Vue.set`、`Vue.delete`。

### Proxy 与原对象不是同一个身份

```ts
const rawLesson = { id: 'vue3-02', title: '响应式原理' }
const lesson = reactive(rawLesson)

console.log(lesson === rawLesson) // false
```

应把返回的 Proxy 当作主要读写入口：

```ts
lesson.title = '响应式原理与副作用管理' // 经过 Proxy
rawLesson.title = '绕开响应式入口'       // 不经过同一触发路径
```

不要让业务代码有时修改 raw、有时修改 Proxy。集合键、缓存键和跨系统标识优先使用稳定业务 ID，而不是依赖对象引用相等。

`toRaw(proxy)` 能临时取得原对象，但它是逃生舱，不是建立第二套可变状态的工具。长期保存并修改 raw 会绕开响应式系统。

### 普通解构为什么会断开连接

```ts
const state = reactive({ count: 0 })
let { count } = state

count++
```

解构时读取了一次 `state.count`，之后 `count` 只是普通局部变量，读写不再经过源 Proxy。

断开的是变量绑定。如果解构出的值本身是响应式对象，继续修改其属性仍可能经过嵌套 Proxy。为了让代码更容易解释，通常直接保留 `state.count`；确实需要独立 ref 时再用 `toRef` 或 `toRefs`。

## `ref` 为任意值提供可拦截容器

JavaScript 不能拦截局部变量的普通赋值，所以 Vue 用带 `.value` 的对象包装值：

```ts
const count = ref(0)
count.value++
```

简化模型：

```ts
function ref<T>(initialValue: T) {
  let value = initialValue

  return {
    get value() {
      track(/* 当前 ref */, 'value')
      return value
    },
    set value(next: T) {
      if (Object.is(next, value)) return
      value = next
      trigger(/* 当前 ref */, 'value')
    }
  }
}
```

`.value` 不是多余语法，而是运行时追踪读写的明确边界。模板编译器会对顶层 ref 做常见自动解包，脚本仍按普通 JavaScript 规则访问容器。

### ref 保存对象时默认也是深层响应式

```ts
const lesson = ref({
  title: '响应式原理',
  author: { name: 'Ada' }
})

lesson.value.author.name = 'Lin'
lesson.value = { title: '新课程', author: { name: 'Lin' } }
```

嵌套属性修改与整体替换都可被观察。正因为 `ref` 既能保存原始值又能保存对象，并支持整体替换，Vue 官方指南推荐把它作为声明响应式状态的主要 API。

`reactive` 仍适合身份稳定、长期按属性修改的对象，例如上一课的表单草稿。选择依据是状态怎样变化，而不是“基本类型或对象”这一条机械规则。

## 深层响应式与浅层边界

普通 `ref` 和 `reactive` 会把访问到的嵌套对象转换成响应式结构。对一般表单和业务对象，这是最自然的默认值。

有些数据不应由 Vue 深层管理：

- 大型不可变快照，每次更新都会整体替换；
- 已由外部状态库或另一个 Proxy 系统管理的数据；
- 复杂第三方类实例；
- 只关心根级引用变化的庞大列表。

### `shallowRef` 只追踪 `.value`

```ts
const snapshot = shallowRef({
  lessons: [] as Lesson[]
})

snapshot.value.lessons.push(newLesson)
// 内部修改不会自动触发依赖。

snapshot.value = {
  lessons: [...snapshot.value.lessons, newLesson]
}
// 替换 .value 会触发。
```

这种语义与不可变更新和外部状态桥接很契合：

```ts
const externalState = shallowRef(store.getState())

const unsubscribe = store.subscribe(nextState => {
  externalState.value = nextState
})
```

### `shallowReactive` 只代理根属性

```ts
const state = shallowReactive({
  status: 'idle',
  payload: largeExternalObject
})
```

根属性写入可触发响应，`payload` 内部保持原样。浅层对象应只作为明确的根状态边界，不要嵌入深层响应式树，否则同一棵树中会出现难以预测的响应式层级。

### `markRaw` 明确排除代理

```ts
const chart = markRaw(new ChartEngine())
const state = reactive({ chart })
```

它适合不应被代理的第三方实例或特定大型对象。它不是默认性能优化；嵌套值仍可能产生 raw 与 Proxy 身份差异。

先使用正常深层响应式，出现真实集成边界或测量到的开销后，再选择浅层 API 或 `markRaw`。

## 先分清派生值和副作用

这是本课最重要的工程判断。

课程搜索中，“去除首尾空格并转成小写”只是从查询词得到另一个值：

```ts
const normalizedQuery = computed(() =>
  filters.query.trim().toLocaleLowerCase()
)
```

它没有修改外部世界，是纯派生关系。

而发送请求会影响组件外部：

```ts
watch(normalizedQuery, query => {
  void searchLessons(query)
})
```

请求、写 localStorage、注册事件、操作第三方实例和测量 DOM 都属于副作用。

可以用下面的顺序判断：

```text
能否完全从已有响应式状态计算出来？
  ├─ 能，而且只需要结果          → computed
  └─ 不能，必须改变外部世界       → 明确操作或 watcher
```

如果 watcher 只是把 A 复制到 B：

```ts
watch(price, value => {
  total.value = value * quantity.value
})
```

通常应该改成：

```ts
const total = computed(() => price.value * quantity.value)
```

后者只有一份事实来源，不需要担心同步顺序。

## `computed` 是带缓存的派生 effect

```ts
const visibleLessons = computed(() =>
  lessons.value.filter(lesson =>
    lesson.title.includes(normalizedQuery.value)
  )
)
```

getter 执行时读取的响应式值会成为依赖。依赖不变时，重复读取通常复用缓存；依赖变化后计算属性先失效，下一次读取时再得到新值。

getter 应保持纯粹：

```ts
// 不推荐：读取计算结果可能顺便发送请求。
const results = computed(() => {
  void fetch('/api/lessons')
  return []
})
```

纯 getter 可以被重复执行、延迟执行或因开发调试而执行，而不会改变外部世界。

## `watch` 适合来源明确的副作用

`watch` 把“监听什么”和“变化后做什么”分开：

```ts
watch(query, handleQuery)

watch(
  () => filters.page,
  handlePage
)

watch(
  [query, () => filters.publishedOnly],
  handleSearch
)
```

来源可以是 ref、computed ref、reactive 对象、getter 或来源数组。

下面写法不会工作：

```ts
watch(filters.page, handlePage)
```

调用 `watch` 前，`filters.page` 已经被读取为普通数字。应该传 getter：

```ts
watch(() => filters.page, handlePage)
```

`watch` 不会默认立即执行回调。需要“初始化加载 + 以后随来源变化”时使用 `immediate: true`。

## `watchEffect` 自动追踪同步读取

```ts
watchEffect(() => {
  console.log(
    normalizedQuery.value,
    filters.publishedOnly
  )
})
```

函数同步执行期间读取的响应式值会自动成为依赖，而且 effect 会立即运行一次。它适合依赖与副作用紧密写在一起、显式列出来源反而重复的场景。

代价是依赖隐藏在函数体中。业务请求通常更适合 `watch`，因为请求参数应清楚列在来源中，也更容易比较新旧值。

异步 `watchEffect` 只追踪首次 `await` 之前同步读取的依赖：

```ts
watchEffect(async () => {
  const query = normalizedQuery.value // 会被追踪
  await load(query)
  console.log(filters.page)           // 不会因这次读取成为依赖
})
```

不要通过把更多代码挪到 `await` 前来“修复”隐式依赖；来源重要时直接改用 `watch`。

## 深度监听不是“更保险”

getter 返回对象时，默认只在返回引用改变后触发：

```ts
watch(
  () => state.filters,
  handleFiltersReplacement
)
```

直接监听一个 reactive 对象会隐式深度监听：

```ts
watch(state.filters, handleNestedChange)
```

也可以显式使用 `deep`：

```ts
watch(
  () => state.filters,
  (current, previous) => {
    // 仅嵌套属性变化时，两者可能仍是同一个对象。
  },
  { deep: true }
)
```

深度监听需要遍历嵌套属性，大型数据结构可能昂贵。Vue 3.5+ 允许用数字限制最大遍历深度：

```ts
watch(source, callback, { deep: 2 })
```

优先监听真正影响副作用的字段，或者用不可变替换把变化边界表达清楚。`deep: true` 不是为了省去思考来源。

## watcher 何时运行

Vue 会批处理组件更新和用户 watcher，避免同步修改多次就重复执行多次。

默认 watcher 的相对时序是：

```text
状态改变
  → 父组件更新
  → 当前组件的默认 watcher
  → 当前组件 DOM 更新
```

因此默认回调读取当前组件 DOM 时，看到的可能还是更新前状态。

### 读取更新后的 DOM 使用 `flush: 'post'`

```ts
watch(
  results,
  () => {
    const height = resultList.value?.offsetHeight
    console.log(height)
  },
  { flush: 'post' }
)
```

也可以使用 `watchPostEffect`。post 表示在 Vue 更新所属组件 DOM 后运行，不保证浏览器已经完成绘制；动画帧和最终像素呈现仍是浏览器调度问题。

### `flush: 'sync'` 必须非常克制

同步 watcher 在检测到变化时立即执行，不经过批处理：

```ts
watch(flag, callback, { flush: 'sync' })
```

它只适合简单、低频且确实要求同步的值。不要对可能同步修改数百次的数组使用，也不要用它掩盖尚未理解的更新顺序。

## 异步 watcher 必须设计失效

用户快速输入：

```text
输入 v  ──→ 请求 A（慢）
输入 vu ──→ 请求 B（快）

请求 B 先完成 → 显示 vu 的结果
请求 A 后完成 → 如果不处理，会错误覆盖为 v 的结果
```

这里至少有两个责任：

1. 尽可能取消已失效的任务；
2. 即使任务不能取消，也只允许最新任务提交状态。

### 用 `onWatcherCleanup` 取消旧请求

```ts
watch(query, async newQuery => {
  const controller = new AbortController()

  onWatcherCleanup(() => controller.abort())

  const response = await fetch(
    `/api/search?q=${encodeURIComponent(newQuery)}`,
    { signal: controller.signal }
  )
})
```

来源再次变化或 watcher 停止前，清理函数会执行。Vue 3.5+ 的 `onWatcherCleanup` 必须在回调同步执行阶段调用，不能放到 `await` 之后。

需要兼容其他版本或希望使用回调参数时：

```ts
watch(query, async (newQuery, _oldQuery, onCleanup) => {
  const controller = new AbortController()
  onCleanup(() => controller.abort())

  await search(newQuery, controller.signal)
})
```

无论采用哪种 API，都应在创建资源后立即注册清理。

### 用请求身份保护最终状态

取消并不覆盖所有异步任务，而且旧请求的 `finally` 也可能错误地关闭最新请求的 loading：

```ts
let latestRequestId = 0

watch(query, async value => {
  const requestId = ++latestRequestId
  loading.value = true

  try {
    const result = await search(value)

    if (requestId === latestRequestId) {
      results.value = result
    }
  } finally {
    if (requestId === latestRequestId) {
      loading.value = false
    }
  }
})
```

AbortController 负责停止可取消工作，请求 ID 负责保护状态提交。两者解决不同层次的问题，可以一起使用。

## effect 也有生命周期

在 `setup()` 或 `<script setup>` 中同步创建的 watcher 会绑定当前组件实例，组件卸载时自动停止。

如果稍后在异步回调里创建 watcher，它可能没有自动绑定：

```ts
setTimeout(() => {
  const stop = watch(source, callback)
  // 必须在合适时机调用 stop()。
}, 1000)
```

更好的写法通常是同步创建，再在回调中根据状态提前返回。

组合式函数注册外部资源时，可以使用 `onScopeDispose`：

```ts
export function useExternalSubscription() {
  const unsubscribe = externalStore.subscribe(handleChange)
  onScopeDispose(unsubscribe)
}
```

每个组件 `setup` 都运行在 effect scope 中，因此组合式函数不必只依赖组件卸载钩子。

`effectScope` 可以把组件外创建的多个 computed 和 watcher 收集起来统一停止：

```ts
const scope = effectScope()

scope.run(() => {
  watch(sourceA, callbackA)
  watchEffect(effectB)
})

scope.stop()
```

普通组件内同步创建的 effect 已由组件管理，不需要再包一层。这个 API 主要服务于响应式服务、插件和测试清理。

## 完整示例：可取消的课程搜索

示例将本课主线连接起来：

```text
filters
  ├─ computed → normalizedQuery
  ├─ watch → 异步搜索
  │            ├─ cleanup 取消过期请求
  │            └─ requestId 保护最新状态
  └─ shallowRef → 以不可变替换保存结果

results
  └─ post watcher → Vue 更新 DOM 后读取列表高度
```

<<< ../../../examples/frontend/vue3-reactivity/LessonSearch.vue

示例中的重点：

- 筛选表单身份稳定、按字段修改，所以使用 `reactive`；
- 规范化查询是纯派生值，所以使用 `computed`；
- 请求参数需要明确，所以使用 `watch` 而不是 `watchEffect`；
- 搜索结果每次整体替换，所以使用 `shallowRef`；
- `onWatcherCleanup` 与请求 ID 一起处理竞态；
- 只有 DOM 高度测量使用 `flush: 'post'`。

## 从常见现象反推原因

### 修改状态后界面没有更新

先检查写入是否经过同一 ref 或 Proxy。直接修改 raw、普通解构后的原始值，或浅层 ref 的内部属性，都不会沿预期路径触发。

### watcher 执行次数比预想多

开发环境、多个真实来源或同步/异步写入都可能影响观察结果。先确认来源与调度，不要立即改成 `flush: 'sync'`。

### 新旧值看起来完全相同

深层属性变化但对象没有整体替换时，新旧参数可能指向同一个对象。需要历史快照时，应在合适边界执行不可变替换或自行保存快照。

### computed 导致请求重复或循环更新

请求被放进了本应纯粹的 getter。让 computed 只返回值，请求放入明确操作或 watcher。

### 取消请求后 loading 仍然闪烁

旧请求的 catch 或 finally 仍在修改共享状态。取消任务之外，还要用请求身份保护结果、错误和 loading 的提交。

### 深度监听让页面变慢

`deep` 会遍历嵌套结构。改为监听真正参与副作用的字段，或使用不可变替换与浅层边界。

## 选择响应式工具的顺序

遇到状态关系时，可以依次判断：

1. 这是直接修改的事实，还是能从其他状态计算出来的结果？
2. 派生过程能否保持纯粹？能则使用 `computed`。
3. 必须执行外部操作吗？来源明确时使用 `watch`。
4. 来源是否与 effect 内的同步读取天然一致？是时才考虑 `watchEffect`。
5. 副作用何时失效？创建资源时同时注册清理。
6. 异步结果是否可能乱序？用任务身份保护最终提交。
7. 是否真的要读取更新后的 DOM？只有这时使用 post flush。
8. 数据是否由 Vue 深层管理？外部或不可变状态才考虑 `shallowRef`。
9. 是否出现真实身份或性能边界？有证据后再用 `toRaw`、`markRaw`。

## Vue 2 经验怎样迁移

- 新增、删除对象属性不再需要 `Vue.set`、`Vue.delete`；
- Vue 2 的数组索引限制不应机械带入 Vue 3；
- Proxy 与原对象身份不同，旧代码若依赖引用相等需要复核；
- Options API 的 `watch` 仍可用，Composition API 只是让 getter、多来源和清理更显式；
- 不要把“对整个对象开 deep watcher”的习惯搬到大型状态树；
- `computed` 仍应表达派生值，watcher 仍应服务副作用，这个设计原则没有改变。

## 本课小结

响应式原理最终应帮助解释工程选择：

1. Vue 在响应式读取期间收集订阅关系，在写入时调度相关 effect；
2. `reactive` 依靠 Proxy，`ref` 依靠可拦截的 `.value` 容器；
3. raw 与 Proxy 身份不同，普通解构可能绕开源属性访问；
4. `computed` 表达纯派生值，`watch` 和 `watchEffect` 执行副作用；
5. watcher 默认早于所属组件 DOM 更新，读取更新后 DOM 才使用 post；
6. 异步副作用必须同时设计清理和最新任务保护；
7. 浅层 API、`markRaw` 与 `effectScope` 是边界工具，不是每个组件的默认配置。

## 下一课

下一节是[组件通信、依赖注入与可复用组件](/frontend/vue3/component-communication-and-reusable-components)。本课解决了“状态变化会触发谁”，下一课继续解决“状态和能力应该穿过哪些组件边界”：

- Props 与 Events 怎样形成受控组件；
- `v-model` 的 prop / event 契约是什么；
- Slots、透传 Attributes 和模板引用分别属于哪种边界；
- Provide / Inject 怎样共享能力而不制造隐式全局状态；
- 组合式函数、无渲染组件与普通组件如何选择。

## 参考资料

- [Vue 官方指南：Reactivity in Depth](https://vuejs.org/guide/extras/reactivity-in-depth.html)
- [Vue 官方指南：Reactivity Fundamentals](https://vuejs.org/guide/essentials/reactivity-fundamentals.html)
- [Vue 官方指南：Computed Properties](https://vuejs.org/guide/essentials/computed.html)
- [Vue 官方指南：Watchers](https://vuejs.org/guide/essentials/watchers.html)
- [Vue API：Reactivity Core](https://vuejs.org/api/reactivity-core.html)
- [Vue API：Reactivity Utilities](https://vuejs.org/api/reactivity-utilities.html)
- [Vue API：Reactivity Advanced](https://vuejs.org/api/reactivity-advanced.html)
