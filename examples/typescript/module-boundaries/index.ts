import {
  createLesson,
  LESSON_STATUS,
  publishLesson,
  type CreateLessonInput,
  type Lesson,
} from './public-api.js';

export {
  createLesson,
  LESSON_STATUS,
  publishLesson,
} from './public-api.js';

export type {
  CreateLessonInput,
  Lesson,
  LessonStatus,
} from './public-api.js';

const input: CreateLessonInput = {
  title: 'TypeScript 工程配置与模块边界',
};

// 应用入口只依赖 public-api，不需要知道领域和服务文件的内部布局。
const draft: Lesson = createLesson(input);
const published = publishLesson(draft);

console.log(
  `${published.title}：${published.status === LESSON_STATUS.published ? '已发布' : '草稿'}`,
);
