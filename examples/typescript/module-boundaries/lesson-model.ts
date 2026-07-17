export const LESSON_STATUS = {
  draft: 'draft',
  published: 'published',
} as const;

export type LessonStatus =
  typeof LESSON_STATUS[keyof typeof LESSON_STATUS];

export interface Lesson {
  readonly id: string
  title: string
  status: LessonStatus
  readonly createdAt: Date
}

/** 创建命令只暴露调用方可以决定的字段。 */
export type CreateLessonInput = Pick<Lesson, 'title'> & {
  status?: LessonStatus
};
