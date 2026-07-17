/**
 * 本示例模拟一个课程列表接口。
 * 重点不是 fetch 本身，而是演示外部数据怎样从 unknown 变成可信类型。
 */

export type LessonStatus = 'draft' | 'published';

export interface Lesson {
  readonly id: number;
  readonly title: string;
  readonly status: LessonStatus;
  // 草稿可能还没有学习进度，所以这个字段允许不存在。
  readonly progress?: number;
}

export interface ProgressSummary {
  readonly total: number;
  readonly completed: number;
  readonly percentage: number;
}

/** unknown 可能是任意值，先排除 null、数组和基本类型。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 类型守卫同时承担运行时校验和类型收窄：
 * 返回 true 后，TypeScript 才会把 value 当作 Lesson 使用。
 */
export function isLesson(value: unknown): value is Lesson {
  if (!isRecord(value)) return false;

  const validStatus = value.status === 'draft' || value.status === 'published';
  const validProgress = !('progress' in value)
    || (typeof value.progress === 'number'
      && Number.isFinite(value.progress)
      && value.progress >= 0
      && value.progress <= 100);

  return Number.isSafeInteger(value.id)
    && typeof value.title === 'string'
    && value.title.trim().length > 0
    && validStatus
    && validProgress;
}

/**
 * 接口响应先保持 unknown，验证整个数组后才返回 Lesson[]。
 * 这样不可信数据不会悄悄进入组件和业务函数。
 */
export function parseLessons(value: unknown): Lesson[] {
  if (!Array.isArray(value) || !value.every(isLesson)) {
    throw new TypeError('课程数据格式不正确');
  }
  return value;
}

/**
 * 函数签名就是契约：调用方传入 Lesson[]，函数保证返回 ProgressSummary。
 * 局部变量 completed 和 percentage 可以由 TypeScript 自动推断为 number。
 */
export function summarizeProgress(lessons: readonly Lesson[]): ProgressSummary {
  const completed = lessons.filter((lesson) => lesson.progress === 100).length;
  const percentage = lessons.length === 0
    ? 0
    : Math.round((completed / lessons.length) * 100);

  return { total: lessons.length, completed, percentage };
}

// 模拟 JSON.parse() 或 response.json() 的结果：此时还不能相信它的结构。
const apiResponse: unknown = [
  { id: 1, title: '从 JavaScript 到 TypeScript', status: 'published', progress: 100 },
  { id: 2, title: '对象类型与函数类型', status: 'published', progress: 40 },
  { id: 3, title: '联合类型与类型收窄', status: 'draft' },
];

const lessons = parseLessons(apiResponse);
console.log(summarizeProgress(lessons));
