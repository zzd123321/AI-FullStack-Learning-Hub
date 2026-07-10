export {}

interface Lesson {
  readonly id: string
  title: string
  durationMinutes: number
  status: LessonStatus
}

const statusLabels = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档'
} as const satisfies Record<string, string>

type LessonStatus = keyof typeof statusLabels
type StatusLabel = (typeof statusLabels)[LessonStatus]

const columns = [
  { key: 'title', label: '课程名称', align: 'left' },
  { key: 'durationMinutes', label: '时长', align: 'right' },
  { key: 'status', label: '状态', align: 'center' }
] as const satisfies readonly {
  key: keyof Lesson
  label: string
  align: 'left' | 'center' | 'right'
}[]

type Column = (typeof columns)[number]
type ColumnKey = Column['key']

const sortableFields = [
  'title',
  'durationMinutes'
] as const satisfies readonly (keyof Lesson)[]

type SortableField = (typeof sortableFields)[number]

function getProperty<ObjectType, Key extends keyof ObjectType>(
  object: ObjectType,
  key: Key
): ObjectType[Key] {
  return object[key]
}

function formatProperty<Key extends keyof Lesson>(
  lesson: Lesson,
  key: Key,
  formatter: (value: Lesson[Key]) => string
): string {
  return formatter(lesson[key])
}

function isSortableField(value: string): value is SortableField {
  return sortableFields.some((field) => field === value)
}

function getStatusLabel(status: LessonStatus): StatusLabel {
  return statusLabels[status]
}

function getColumnValue(
  lesson: Lesson,
  key: ColumnKey
): Lesson[ColumnKey] {
  return lesson[key]
}

const lesson: Lesson = {
  id: 'ts-05',
  title: 'keyof、typeof 与索引访问类型',
  durationMinutes: 120,
  status: 'draft'
}

const title = getProperty(lesson, 'title')
const durationText = formatProperty(
  lesson,
  'durationMinutes',
  (minutes) => `${minutes} 分钟`
)
const statusText = getStatusLabel(lesson.status)

console.log('课程名称：', title)
console.log('课程时长：', durationText)
console.log('课程状态：', statusText)

for (const column of columns) {
  console.log(`${column.label}：`, getColumnValue(lesson, column.key))
}

const fieldFromUrl: string = 'durationMinutes'

if (isSortableField(fieldFromUrl)) {
  console.log('合法排序字段：', fieldFromUrl)
}
