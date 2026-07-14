import type { LessonSummary } from './types.js'

export function searchLessons(
  lessons: readonly LessonSummary[],
  rawQuery: string,
): LessonSummary[] {
  const query = rawQuery.trim().toLocaleLowerCase('zh-CN')
  if (!query) return lessons.slice()

  return lessons
    .filter((lesson) => {
      const searchable = `${lesson.title} ${lesson.category}`.toLocaleLowerCase('zh-CN')
      return searchable.includes(query)
    })
    .sort((left, right) => right.popularity - left.popularity)
}
