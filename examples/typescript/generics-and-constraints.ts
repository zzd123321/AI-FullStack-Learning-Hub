export {}

interface Entity {
  readonly id: string
}

interface LearningLesson extends Entity {
  title: string
  durationMinutes: number
  status: 'draft' | 'published'
}

interface LessonSummary extends Entity {
  label: string
  available: boolean
}

interface Page<Item> {
  items: readonly Item[]
  page: number
  pageSize: number
  total: number
}

interface ApiError {
  code: string
  message: string
}

type ApiResult<Data, ErrorData = ApiError> =
  | { ok: true; data: Data }
  | { ok: false; error: ErrorData }

type NonEmptyArray<Item> = readonly [Item, ...Item[]]

function first<Item>(items: readonly Item[]): Item | undefined {
  return items[0]
}

function firstRequired<Item>(items: NonEmptyArray<Item>): Item {
  return items[0]
}

function mapPage<Input, Output>(
  source: Page<Input>,
  transform: (item: Input, index: number) => Output
): Page<Output> {
  return {
    ...source,
    items: source.items.map(transform)
  }
}

function getProperty<
  ObjectType,
  Key extends keyof ObjectType
>(object: ObjectType, key: Key): ObjectType[Key] {
  return object[key]
}

class MemoryRepository<Item extends Entity> {
  private readonly records = new Map<string, Item>()

  constructor(initialItems: readonly Item[] = []) {
    for (const item of initialItems) {
      this.save(item)
    }
  }

  save(item: Item): Item {
    this.records.set(item.id, item)
    return item
  }

  findById(id: string): Item | undefined {
    return this.records.get(id)
  }

  findAll(): readonly Item[] {
    return [...this.records.values()]
  }
}

function toSuccess<Data>(data: Data): ApiResult<Data> {
  return { ok: true, data }
}

const initialLessons: NonEmptyArray<LearningLesson> = [
  {
    id: 'ts-03',
    title: '联合类型、交叉类型与类型收窄',
    durationMinutes: 120,
    status: 'published'
  },
  {
    id: 'ts-04',
    title: 'TypeScript 泛型基础与约束',
    durationMinutes: 120,
    status: 'draft'
  }
]

const repository = new MemoryRepository<LearningLesson>(initialLessons)

const lessonPage: Page<LearningLesson> = {
  items: repository.findAll(),
  page: 1,
  pageSize: 20,
  total: repository.findAll().length
}

const summaryPage = mapPage(lessonPage, (lesson) => ({
  id: lesson.id,
  label: `${lesson.title}（${lesson.durationMinutes} 分钟）`,
  available: lesson.status === 'published'
}))

const response: ApiResult<Page<LessonSummary>> = toSuccess(summaryPage)
const firstTitle = first(lessonPage.items)?.title ?? '暂无课程'
const requiredTitle = firstRequired([
  'TypeScript 泛型基础与约束'
])
const firstLesson = firstRequired(initialLessons)
const duration = getProperty(firstLesson, 'durationMinutes')

if (response.ok) {
  console.log('分页摘要：', response.data.items)
}

console.log('第一节课程：', firstTitle)
console.log('确定存在的课程：', requiredTitle)
console.log('第一节时长：', duration)
