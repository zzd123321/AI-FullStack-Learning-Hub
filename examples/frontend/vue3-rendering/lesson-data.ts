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
): LessonRecord[] {
  const normalized = keyword.trim().toLocaleLowerCase()
  if (!normalized) return [...lessons]

  return lessons.filter((lesson) =>
    lesson.title.toLocaleLowerCase().includes(normalized)
  )
}

export function renameLesson(
  lessons: readonly LessonRecord[],
  lessonId: string,
  title: string
): LessonRecord[] {
  return lessons.map((lesson) =>
    lesson.id === lessonId ? { ...lesson, title } : lesson
  )
}
