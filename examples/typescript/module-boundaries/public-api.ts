export {
  createLesson,
  publishLesson,
} from './lesson-service.js';

export { LESSON_STATUS } from './lesson-model.js';

// 类型再导出会从生成的 JavaScript 中消失，不形成运行时导出。
export type {
  CreateLessonInput,
  Lesson,
  LessonStatus,
} from './lesson-model.js';
