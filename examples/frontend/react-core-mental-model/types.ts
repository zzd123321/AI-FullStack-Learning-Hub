export type LessonLevel = 'beginner' | 'intermediate' | 'advanced'

export interface Lesson {
  readonly id: string
  readonly title: string
  readonly level: LessonLevel
  readonly published: boolean
}

export interface LessonFilters {
  readonly keyword: string
  readonly publishedOnly: boolean
}
