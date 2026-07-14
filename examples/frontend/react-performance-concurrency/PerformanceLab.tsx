import { Profiler, useDeferredValue, useMemo, useState } from 'react'
import type { ProfilerOnRenderCallback } from 'react'
import { catalog } from './catalog'
import { recordProfilerMetric } from './profiler-metrics'
import { searchLessons } from './search-lessons'
import { VirtualLessonList } from './VirtualLessonList'

const handleRender: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime,
) => {
  recordProfilerMetric({
    id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
  })
}

export function PerformanceLab() {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const isStale = query !== deferredQuery
  const matches = useMemo(
    () => searchLessons(catalog, deferredQuery),
    [deferredQuery],
  )

  return (
    <section>
      <h2>可响应的大列表搜索</h2>
      <label>
        搜索课程
        <input value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <p aria-live="polite">
        {isStale ? '正在更新结果……' : `找到 ${matches.length} 项`}
      </p>
      <div style={{ opacity: isStale ? 0.6 : 1, transition: 'opacity 120ms' }}>
        <Profiler id="lesson-results" onRender={handleRender}>
          <VirtualLessonList lessons={matches} />
        </Profiler>
      </div>
    </section>
  )
}
