import type { LessonSummary } from './types.js'

const categories: LessonSummary['category'][] = [
  'TypeScript',
  'Vue',
  'React',
  'Browser',
]

export function createCatalog(size: number): LessonSummary[] {
  return Array.from({ length: size }, (_, index) => {
    const category = categories[index % categories.length] ?? 'React'
    return {
      id: `lesson-${index + 1}`,
      title: `${category} 深入课程 ${index + 1}`,
      category,
      durationMinutes: 20 + (index % 10) * 5,
      popularity: (index * 37) % 1000,
    }
  })
}

export const catalog = createCatalog(10_000)
