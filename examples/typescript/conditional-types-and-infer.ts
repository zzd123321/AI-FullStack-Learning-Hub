export {}

interface Lesson {
  readonly id: string
  title: string
  durationMinutes: number
}

interface Page<Item> {
  items: readonly Item[]
  page: number
  total: number
}

interface ApiError {
  code: string
  message: string
}

type ApiResult<Data, ErrorData> =
  | { ok: true; data: Data }
  | { ok: false; error: ErrorData }

type SuccessData<Result> =
  Result extends { ok: true; data: infer Data }
    ? Data
    : never

type FailureData<Result> =
  Result extends { ok: false; error: infer ErrorData }
    ? ErrorData
    : never

type LearningEvent =
  | {
      type: 'lesson.started'
      payload: { lessonId: string }
    }
  | {
      type: 'lesson.completed'
      payload: { lessonId: string; score: number }
    }
  | {
      type: 'lesson.failed'
      payload: { lessonId: string; reason: string }
    }

type EventOfType<
  Event extends { type: PropertyKey },
  Type extends Event['type']
> = Extract<Event, { type: Type }>

type EventPayload<Event> =
  Event extends { payload: infer Payload }
    ? Payload
    : never

type LessonPageResult = ApiResult<Page<Lesson>, ApiError>
type LoadedLessonPage = SuccessData<LessonPageResult>
type LessonPageError = FailureData<LessonPageResult>
type CompletedEvent = EventOfType<
  LearningEvent,
  'lesson.completed'
>
type CompletedPayload = EventPayload<CompletedEvent>

async function loadLessonPage(): Promise<LessonPageResult> {
  return {
    ok: true,
    data: {
      items: [
        {
          id: 'ts-06',
          title: 'TypeScript 条件类型与 infer',
          durationMinutes: 120
        }
      ],
      page: 1,
      total: 1
    }
  }
}

type LoadLessonPageResult = Awaited<
  ReturnType<typeof loadLessonPage>
>

function requireValue<Type>(
  value: Type
): NonNullable<Type> {
  if (value === null || value === undefined) {
    throw new TypeError('值不能为空')
  }

  return value
}

function describeEvent(event: LearningEvent): string {
  switch (event.type) {
    case 'lesson.started':
      return `开始课程：${event.payload.lessonId}`
    case 'lesson.completed':
      return `完成课程：${event.payload.lessonId}，得分 ${event.payload.score}`
    case 'lesson.failed':
      return `课程失败：${event.payload.reason}`
  }
}

const completed: CompletedEvent = {
  type: 'lesson.completed',
  payload: {
    lessonId: 'ts-06',
    score: 95
  }
}

const completedPayload: CompletedPayload = completed.payload
const result: LoadLessonPageResult = await loadLessonPage()

if (result.ok) {
  const page: LoadedLessonPage = result.data
  const firstLesson = requireValue(page.items[0])

  console.log('加载课程：', firstLesson.title)
} else {
  const error: LessonPageError = result.error
  console.error(`${error.code}：${error.message}`)
}

console.log(describeEvent(completed))
console.log('完成得分：', completedPayload.score)
