type LessonStatus = 'draft' | 'published' | 'archived'

interface Lesson {
  readonly id: string
  title: string
  summary?: string
  durationMinutes: number
  status: LessonStatus
  tags: readonly string[]
}

interface CreateLessonInput {
  title: string
  summary?: string
  durationMinutes: number
  tags?: readonly string[]
}

interface LessonSummary {
  id: string
  label: string
  isAvailable: boolean
}

type LessonPredicate = (
  lesson: Readonly<Lesson>,
  index: number
) => boolean

type LessonMapper = (lesson: Readonly<Lesson>) => LessonSummary

interface LessonRepository {
  getAll: () => readonly Lesson[]
  findById: (id: string) => Lesson | undefined
  save: (input: CreateLessonInput) => Lesson
}

function cloneLesson(lesson: Lesson): Lesson {
  return {
    ...lesson,
    tags: [...lesson.tags]
  }
}

function createLessonRepository(
  initialLessons: readonly Lesson[] = []
): LessonRepository {
  let sequence = initialLessons.length
  let lessons: Lesson[] = initialLessons.map(cloneLesson)

  return {
    getAll: () => lessons.map(cloneLesson),

    findById: (id) => {
      const lesson = lessons.find((item) => item.id === id)
      return lesson ? cloneLesson(lesson) : undefined
    },

    save: (input) => {
      sequence += 1

      const lesson: Lesson = {
        id: `lesson-${sequence}`,
        title: input.title.trim(),
        durationMinutes: input.durationMinutes,
        status: 'draft',
        tags: input.tags ? [...input.tags] : [],
        ...(input.summary === undefined
          ? {}
          : { summary: input.summary.trim() })
      }

      lessons = [...lessons, lesson]
      return cloneLesson(lesson)
    }
  }
}

function selectLessons(
  lessons: readonly Lesson[],
  predicate: LessonPredicate
): Lesson[] {
  return lessons.filter(predicate)
}

function mapLessons(
  lessons: readonly Lesson[],
  mapper: LessonMapper
): LessonSummary[] {
  return lessons.map(mapper)
}

function assertNever(value: never): never {
  throw new Error(`未处理的课程状态：${String(value)}`)
}

function getStatusLabel(status: LessonStatus): string {
  switch (status) {
    case 'draft':
      return '草稿'
    case 'published':
      return '已发布'
    case 'archived':
      return '已归档'
    default:
      return assertNever(status)
  }
}

const repository = createLessonRepository([
  {
    id: 'lesson-1',
    title: '从 JavaScript 到 TypeScript',
    durationMinutes: 60,
    status: 'published',
    tags: ['typescript', '基础']
  }
])

const created = repository.save({
  title: ' TypeScript 对象类型与函数类型 ',
  summary: '使用类型描述数据结构和行为契约',
  durationMinutes: 90,
  tags: ['typescript', '对象类型', '函数类型']
})

const availableLessons = selectLessons(
  repository.getAll(),
  (lesson) => lesson.status === 'published'
)

const summaries = mapLessons(repository.getAll(), (lesson) => ({
  id: lesson.id,
  label: `${lesson.title}（${getStatusLabel(lesson.status)}）`,
  isAvailable: lesson.status === 'published'
}))

console.log('新建课程：', created.title)
console.log('可学习课程数：', availableLessons.length)
console.log('课程摘要：', summaries)
