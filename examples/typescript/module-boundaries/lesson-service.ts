import {
  LESSON_STATUS,
  type CreateLessonInput,
  type Lesson
} from './lesson-model.js'

let nextLessonId = 1

export function createLesson(
  input: CreateLessonInput
): Lesson {
  return {
    id: `ts-${nextLessonId++}`,
    title: input.title,
    status: input.status ?? LESSON_STATUS.draft,
    createdAt: new Date()
  }
}

export function publishLesson(lesson: Lesson): Lesson {
  return {
    ...lesson,
    status: LESSON_STATUS.published
  }
}
