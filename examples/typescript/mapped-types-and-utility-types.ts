interface LessonEntity {
  readonly id: string;
  title: string;
  summary: string | null;
  durationMinutes: number;
  published: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** 创建输入只选择调用方需要提供的字段。 */
type CreateLessonInput = Pick<
  LessonEntity,
  'title' | 'summary' | 'durationMinutes'
>;

/** Patch 中每个允许更新的字段都可以独立缺失。 */
type UpdateLessonInput = Partial<Pick<
  LessonEntity,
  'title' | 'summary' | 'durationMinutes' | 'published'
>>;

type LessonForm = Pick<
  LessonEntity,
  'title' | 'summary' | 'durationMinutes' | 'published'
>;

/** 校验错误只在出错字段上存在。 */
type FieldErrors<Model> = Partial<{
  [Key in keyof Model]: string;
}>;

/** 触碰状态要求表单中的每个字段都有布尔值。 */
type FieldTouched<Model> = {
  [Key in keyof Model]: boolean;
};

/**
 * -? 移除原字段的可选修饰符，保证每个字段都有配置。
 * Model[Key] 保留当前字段与格式化参数之间的对应关系。
 */
type FieldConfig<Model> = {
  [Key in keyof Model]-?: {
    label: string;
    format(value: Model[Key]): string;
  };
};

type LessonEvent =
  | { type: 'lesson.created'; payload: { id: string; title: string } }
  | {
      type: 'lesson.published';
      payload: { id: string; publishedAt: Date };
    };

/** 把事件联合重映射为以事件名为键的处理器对象。 */
type EventHandlers<Event extends { type: PropertyKey }> = {
  [Current in Event as Current['type']]: (event: Current) => void;
};

const createInput: CreateLessonInput = {
  title: 'TypeScript 映射类型与常用工具类型',
  summary: '从已有模型派生安全、可维护的对象类型',
  durationMinutes: 150,
};

const initialLesson: LessonEntity = {
  id: 'ts-07',
  ...createInput,
  published: false,
  createdAt: new Date('2026-07-13T00:00:00Z'),
  updatedAt: new Date('2026-07-13T00:00:00Z'),
};

function applyLessonPatch(
  lesson: LessonEntity,
  patch: UpdateLessonInput,
): LessonEntity {
  // Omit、Pick 和 Partial 只改变静态类型；运行时仍需真正展开对象。
  return { ...lesson, ...patch, updatedAt: new Date() };
}

const touched: FieldTouched<LessonForm> = {
  title: true,
  summary: false,
  durationMinutes: true,
  published: false,
};

const errors: FieldErrors<LessonForm> = {
  durationMinutes: '课程时长必须大于 0',
};

const fieldConfig: FieldConfig<LessonForm> = {
  title: { label: '标题', format: (value) => value },
  summary: { label: '摘要', format: (value) => value ?? '暂无摘要' },
  durationMinutes: {
    label: '时长',
    format: (value) => `${value} 分钟`,
  },
  published: {
    label: '发布状态',
    format: (value) => value ? '已发布' : '草稿',
  },
};

const handlers: EventHandlers<LessonEvent> = {
  'lesson.created': (event) => {
    console.log(`创建课程：${event.payload.title}`);
  },
  'lesson.published': (event) => {
    console.log(`发布课程：${event.payload.id}`);
  },
};

const updatedLesson = applyLessonPatch(initialLesson, {
  title: '映射类型与工具类型（更新）',
  published: true,
});

handlers['lesson.created']({
  type: 'lesson.created',
  payload: { id: updatedLesson.id, title: updatedLesson.title },
});

handlers['lesson.published']({
  type: 'lesson.published',
  payload: { id: updatedLesson.id, publishedAt: updatedLesson.updatedAt },
});

for (const key of Object.keys(fieldConfig) as Array<keyof LessonForm>) {
  console.log(`${fieldConfig[key].label}，已触碰：${touched[key]}`);
}

console.log('字段错误：', errors);
