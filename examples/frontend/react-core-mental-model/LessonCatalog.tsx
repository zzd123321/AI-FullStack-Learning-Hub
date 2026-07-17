import { useState } from 'react'
import { filterLessons } from './lesson-data'
import type { Lesson, LessonFilters } from './types'
import { LessonEditor } from './LessonEditor'
import { LessonList } from './LessonList'
import { SearchControls } from './SearchControls'

interface LessonCatalogProps {
  initialLessons: readonly Lesson[]
}

const initialFilters: LessonFilters = {
  keyword: '',
  publishedOnly: true
}

export function LessonCatalog({ initialLessons }: LessonCatalogProps) {
  // catalog 会被编辑，所以它是 State；复制数组避免把 Props 当作可变容器。
  const [catalog, setCatalog] = useState<readonly Lesson[]>(() => [...initialLessons])

  // 筛选条件需要同时交给 SearchControls 和课程列表，由共同父组件拥有。
  const [filters, setFilters] = useState<LessonFilters>(initialFilters)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // 它完全可由 Props 和 State 推导，不需要另存一份 State，也不需要 Effect。
  const visibleLessons = filterLessons(catalog, filters)
  const selectedLesson = catalog.find((lesson) => lesson.id === selectedId) ?? null

  function saveTitle(lessonId: string, title: string): void {
    // 使用函数式更新，确保基于更新队列里的最新课程数组计算。
    // map 和对象展开会创建新值，不修改旧 State 快照。
    setCatalog((current) =>
      current.map((lesson) =>
        lesson.id === lessonId ? { ...lesson, title } : lesson
      )
    )
  }

  return (
    <section>
      <h1>课程目录</h1>
      <SearchControls filters={filters} onChange={setFilters} />
      <LessonList
        lessons={visibleLessons}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      {selectedLesson ? (
        // Key 改变时，React 把它视为新的组件身份，编辑草稿会重置。
        <LessonEditor key={selectedLesson.id} lesson={selectedLesson} onSave={saveTitle} />
      ) : (
        <p>请选择一门课程。</p>
      )}
    </section>
  )
}
