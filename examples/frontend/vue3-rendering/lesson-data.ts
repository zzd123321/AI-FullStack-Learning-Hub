export type LessonStatus = 'draft' | 'published'

export interface LessonRecord {
  readonly id: string
  readonly title: string
  readonly category: 'typescript' | 'vue' | 'react'
  readonly status: LessonStatus
  readonly durationMinutes: number
}

const categories: LessonRecord['category'][] = ['typescript', 'vue', 'react']

export function createLessons(count: number): LessonRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `lesson-${index + 1}`,
    title: `前端课程 ${index + 1}`,
    category: categories[index % categories.length] ?? 'vue',
    status: index % 3 === 0 ? 'draft' : 'published',
    durationMinutes: 30 + (index % 8) * 15
  }))
}

export function filterLessons(
  lessons: readonly LessonRecord[],
  keyword: string
): readonly LessonRecord[] {
  const normalized = keyword.trim().toLocaleLowerCase()
  // 没有筛选时保留数组身份；无意义的复制只会制造新的下游输入。
  if (!normalized) return lessons

  return lessons.filter((lesson) =>
    lesson.title.toLocaleLowerCase().includes(normalized)
  )
}

export function renameLesson(
  lessons: readonly LessonRecord[],
  lessonId: string,
  title: string
): LessonRecord[] {
  // 只替换真正变化的记录，其余对象保持引用稳定，子组件才能跳过更新。
  return lessons.map((lesson) =>
    lesson.id === lessonId ? { ...lesson, title } : lesson
  )
}
