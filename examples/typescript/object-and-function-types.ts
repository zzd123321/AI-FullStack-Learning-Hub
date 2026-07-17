export interface Lesson {
  /** id 由仓库生成，调用方只能读取。 */
  readonly id: string;
  title: string;
  /** 简介可以不存在；存在时必须是字符串。 */
  summary?: string;
  durationMinutes: number;
  /** 数组本身也只通过只读视图暴露。 */
  tags: readonly string[];
}

/** 创建课程时还没有 id，因此输入类型不应直接复用 Lesson。 */
export interface CreateLessonInput {
  title: string;
  summary?: string;
  durationMinutes: number;
  tags?: readonly string[];
}

export interface LessonSummary {
  readonly id: string;
  readonly label: string;
}

/** 回调契约说明调用者会收到课程和数组下标，并返回布尔值。 */
export type LessonPredicate = (
  lesson: Readonly<Lesson>,
  index: number,
) => boolean;

export interface LessonRepository {
  getAll: () => readonly Lesson[];
  findById: (id: string) => Lesson | undefined;
  save: (input: CreateLessonInput) => Lesson;
}

/**
 * 返回副本，避免调用方通过返回值直接修改仓库内部对象。
 * 展开运算符是浅复制，所以嵌套数组也要单独复制。
 */
function cloneLesson(lesson: Lesson): Lesson {
  return {
    ...lesson,
    tags: [...lesson.tags],
  };
}

export function createLessonRepository(
  initialLessons: readonly Lesson[] = [],
): LessonRepository {
  let sequence = initialLessons.length;
  let lessons = initialLessons.map(cloneLesson);

  return {
    getAll: () => lessons.map(cloneLesson),

    findById: (id) => {
      const lesson = lessons.find((item) => item.id === id);
      return lesson ? cloneLesson(lesson) : undefined;
    },

    save: (input) => {
      sequence += 1;

      const lesson: Lesson = {
        id: `lesson-${sequence}`,
        title: input.title.trim(),
        durationMinutes: input.durationMinutes,
        tags: input.tags ? [...input.tags] : [],
        // exactOptionalPropertyTypes 开启后，不存在时不要写 summary: undefined。
        ...(input.summary === undefined
          ? {}
          : { summary: input.summary.trim() }),
      };

      // 创建新数组，旧的 getAll() 结果不会成为内部可变容器。
      lessons = [...lessons, lesson];
      return cloneLesson(lesson);
    },
  };
}

/** 调用方可以只声明 lesson 参数；不必使用 index。 */
export function selectLessons(
  lessons: readonly Lesson[],
  predicate: LessonPredicate,
): Lesson[] {
  return lessons.filter(predicate);
}

export function toSummary(lesson: Readonly<Lesson>): LessonSummary {
  return {
    id: lesson.id,
    label: `${lesson.title}（${lesson.durationMinutes} 分钟）`,
  };
}

const repository = createLessonRepository([
  {
    id: 'lesson-1',
    title: '从 JavaScript 到 TypeScript',
    durationMinutes: 60,
    tags: ['typescript', '基础'],
  },
]);

const created = repository.save({
  title: ' TypeScript 对象类型与函数类型 ',
  summary: '使用类型描述数据结构和函数契约',
  durationMinutes: 90,
  tags: ['typescript', '类型设计'],
});

const longLessons = selectLessons(
  repository.getAll(),
  (lesson) => lesson.durationMinutes >= 60,
);

console.log('新建课程：', created.title);
console.log('长课程数量：', longLessons.length);
console.log('课程摘要：', repository.getAll().map(toSummary));
