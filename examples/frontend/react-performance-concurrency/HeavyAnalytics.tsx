import { catalog } from './catalog'

// 数据是模块级常量，结果也可在延迟模块首次加载时计算一次，
// 没有必要让每个组件实例分别维护 useMemo 缓存。
const totals = catalog.reduce<Record<string, number>>((result, lesson) => {
  result[lesson.category] = (result[lesson.category] ?? 0) + 1
  return result
}, {})

export default function HeavyAnalytics() {
  return (
    <section>
      <h3>课程分析</h3>
      <ul>
        {Object.entries(totals).map(([category, count]) => (
          <li key={category}>{category}：{count} 节</li>
        ))}
      </ul>
    </section>
  )
}
