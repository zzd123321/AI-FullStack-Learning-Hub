export {}

interface LearningLesson {
  readonly id: string
  title: string
  durationMinutes: number
}

interface ApiError {
  code: string
  message: string
  retryable: boolean
}

type LessonRequestState =
  | { status: 'idle' }
  | { status: 'loading'; startedAt: number }
  | {
      status: 'success'
      data: readonly LearningLesson[]
      receivedAt: number
    }
  | { status: 'error'; error: ApiError }

interface RequestTracking {
  requestId: string
}

type TrackedLessonRequestState = LessonRequestState & RequestTracking

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isLearningLesson(value: unknown): value is LearningLesson {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.durationMinutes === 'number' &&
    Number.isFinite(value.durationMinutes) &&
    value.durationMinutes > 0
  )
}

function assertLearningLessonArray(
  value: unknown
): asserts value is LearningLesson[] {
  if (!Array.isArray(value) || !value.every(isLearningLesson)) {
    throw new TypeError('接口返回的课程列表格式不正确')
  }
}

function parseLessons(json: string): readonly LearningLesson[] {
  const payload: unknown = JSON.parse(json)
  assertLearningLessonArray(payload)
  return payload
}

function assertNever(value: never): never {
  throw new Error(`出现未处理的请求状态：${JSON.stringify(value)}`)
}

function renderRequestState(state: TrackedLessonRequestState): string {
  const prefix = `[${state.requestId}]`

  switch (state.status) {
    case 'idle':
      return `${prefix} 尚未请求课程`
    case 'loading':
      return `${prefix} 正在加载，开始时间：${state.startedAt}`
    case 'success':
      return `${prefix} 已加载 ${state.data.length} 节课程`
    case 'error':
      return `${prefix} ${state.error.code}：${state.error.message}`
    default:
      return assertNever(state)
  }
}

function createSuccessState(
  requestId: string,
  data: readonly LearningLesson[]
): TrackedLessonRequestState {
  return {
    requestId,
    status: 'success',
    data,
    receivedAt: Date.now()
  }
}

function loadLessons(
  requestId: string,
  json: string
): TrackedLessonRequestState {
  try {
    return createSuccessState(requestId, parseLessons(json))
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : '发生未知解析错误'

    return {
      requestId,
      status: 'error',
      error: {
        code: 'INVALID_LESSON_PAYLOAD',
        message,
        retryable: false
      }
    }
  }
}

const validJson = JSON.stringify([
  {
    id: 'ts-03',
    title: '联合类型、交叉类型与类型收窄',
    durationMinutes: 120
  }
])

const invalidJson = JSON.stringify([
  {
    id: 'ts-04',
    title: 'TypeScript 泛型',
    durationMinutes: 0
  }
])

const successState = loadLessons('req-001', validJson)
const errorState = loadLessons('req-002', invalidJson)

console.log(renderRequestState(successState))
console.log(renderRequestState(errorState))
