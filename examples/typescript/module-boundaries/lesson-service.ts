import {
  LESSON_STATUS,
  type CreateLessonInput,
  type Lesson,
} from './lesson-model.js';

// 真实项目通常由数据库生成 ID；这里仅让示例保持可运行和可观察。
let nextLessonId = 1;

export function createLesson(
  input: CreateLessonInput,
): Lesson {
  return {
    id: `ts-${nextLessonId++}`,
    title: input.title,
    status: input.status ?? LESSON_STATUS.draft,
    createdAt: new Date(),
  };
}

export function publishLesson(lesson: Lesson): Lesson {
  return {
    ...lesson,
    status: LESSON_STATUS.published,
  };
}
