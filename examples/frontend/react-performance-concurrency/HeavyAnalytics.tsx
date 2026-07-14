import { useMemo } from 'react'
import { catalog } from './catalog'

export default function HeavyAnalytics() {
  const totals = useMemo(() => {
    return catalog.reduce<Record<string, number>>((result, lesson) => {
      result[lesson.category] = (result[lesson.category] ?? 0) + 1
      return result
    }, {})
  }, [])

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
