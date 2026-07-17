const statusLabels = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
} as const;

/** 运行时配置的键成为状态类型的唯一来源。 */
type LessonStatus = keyof typeof statusLabels;
type StatusLabel = (typeof statusLabels)[LessonStatus];

interface Lesson {
  readonly id: string;
  readonly title: string;
  readonly durationMinutes: number;
  readonly status: LessonStatus;
}

/**
 * satisfies 检查每个 key 都属于 Lesson，as const 则保留具体字面量。
 * 因此派生的 ColumnKey 只包含当前真正展示的三个字段。
 */
const columns = [
  { key: 'title', label: '课程名称', align: 'left' },
  { key: 'durationMinutes', label: '时长', align: 'right' },
  { key: 'status', label: '状态', align: 'center' },
] as const satisfies readonly {
  key: keyof Lesson;
  label: string;
  align: 'left' | 'center' | 'right';
}[];

type Column = (typeof columns)[number];
type ColumnKey = Column['key'];

/** 这个数组既用于运行时校验，也用于派生静态联合类型。 */
const sortableFields = [
  'title',
  'durationMinutes',
] as const satisfies readonly (keyof Lesson)[];

type SortableField = (typeof sortableFields)[number];

/** 返回类型会随着本次传入的具体 key 改变。 */
function getProperty<ObjectType, Key extends keyof ObjectType>(
  object: ObjectType,
  key: Key,
): ObjectType[Key] {
  return object[key];
}

function isSortableField(value: string): value is SortableField {
  // 先把只读字面量元组视为只读字符串数组，再执行运行时查询。
  return (sortableFields as readonly string[]).includes(value);
}

function getStatusLabel(status: LessonStatus): StatusLabel {
  return statusLabels[status];
}

const lesson: Lesson = {
  id: 'ts-05',
  title: 'keyof、typeof 与索引访问类型',
  durationMinutes: 120,
  status: 'draft',
};

const title = getProperty(lesson, 'title');
const duration = getProperty(lesson, 'durationMinutes');

console.log('课程名称：', title.toUpperCase());
console.log('课程时长：', `${duration} 分钟`);
console.log('课程状态：', getStatusLabel(lesson.status));

for (const column of columns) {
  console.log(`${column.label}：`, getProperty(lesson, column.key));
}

// 模拟来自 URL 的外部字符串；验证后才能作为有限对象键使用。
const fieldFromUrl: string = 'durationMinutes';

if (isSortableField(fieldFromUrl)) {
  console.log('合法排序字段：', fieldFromUrl);
}
