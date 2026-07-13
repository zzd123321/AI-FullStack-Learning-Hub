export const LESSON_STATUS = {
  draft: 'draft',
  published: 'published'
} as const

export type LessonStatus =
  typeof LESSON_STATUS[keyof typeof LESSON_STATUS]

export interface Lesson {
  readonly id: string
  title: string
  status: LessonStatus
  readonly createdAt: Date
}

export type CreateLessonInput = Pick<Lesson, 'title'> & {
  status?: LessonStatus
}
