interface Lesson {
  readonly id: string;
  readonly title: string;
  readonly durationMinutes: number;
}

interface ApiError {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

/** 每个状态只携带该状态真正拥有的数据。 */
type LessonRequestState =
  | { status: 'idle' }
  | { status: 'loading'; startedAt: number }
  | { status: 'success'; data: readonly Lesson[]; receivedAt: number }
  | { status: 'error'; error: ApiError };

/** 跟踪信息与请求状态彼此独立，使用交叉类型组合。 */
interface RequestTracking {
  readonly requestId: string;
}

type TrackedLessonRequestState = LessonRequestState & RequestTracking;

/** 先证明 unknown 是可读取属性的非空对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * 类型谓词必须检查后续代码依赖的全部字段。
 * 返回 true 后，TypeScript 才会把 value 收窄为 Lesson。
 */
function isLesson(value: unknown): value is Lesson {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.durationMinutes === 'number'
    && Number.isFinite(value.durationMinutes)
    && value.durationMinutes > 0;
}

/** 校验失败就终止；正常返回后，value 已被收窄为 Lesson[]。 */
function assertLessonArray(value: unknown): asserts value is Lesson[] {
  if (!Array.isArray(value) || !value.every(isLesson)) {
    throw new TypeError('接口返回的课程列表格式不正确');
  }
}

function parseLessons(json: string): readonly Lesson[] {
  const payload: unknown = JSON.parse(json);
  assertLessonArray(payload);
  return payload;
}

function assertNever(value: never): never {
  throw new Error(`出现未处理的请求状态：${JSON.stringify(value)}`);
}

function renderRequestState(state: TrackedLessonRequestState): string {
  const prefix = `[${state.requestId}]`;

  // status 收窄整个对象，因此每个分支只能访问自己的字段。
  switch (state.status) {
    case 'idle':
      return `${prefix} 尚未请求课程`;
    case 'loading':
      return `${prefix} 正在加载，开始时间：${state.startedAt}`;
    case 'success':
      return `${prefix} 已加载 ${state.data.length} 节课程`;
    case 'error':
      return `${prefix} ${state.error.code}：${state.error.message}`;
    default:
      // 新增联合成员却忘记处理时，这里会出现类型错误。
      return assertNever(state);
  }
}

function loadLessons(
  requestId: string,
  json: string,
): TrackedLessonRequestState {
  try {
    const data = parseLessons(json);

    return {
      requestId,
      status: 'success',
      data,
      receivedAt: Date.now(),
    };
  } catch (error: unknown) {
    // catch 中的值可能不是 Error，需要先用 instanceof 收窄。
    const message = error instanceof Error
      ? error.message
      : '发生未知解析错误';

    return {
      requestId,
      status: 'error',
      error: {
        code: 'INVALID_LESSON_PAYLOAD',
        message,
        retryable: false,
      },
    };
  }
}

const validJson = JSON.stringify([
  {
    id: 'ts-03',
    title: '联合类型、交叉类型与类型收窄',
    durationMinutes: 120,
  },
]);

const invalidJson = JSON.stringify([
  {
    id: 'ts-04',
    title: 'TypeScript 泛型',
    durationMinutes: 0,
  },
]);

console.log(renderRequestState(loadLessons('req-001', validJson)));
console.log(renderRequestState(loadLessons('req-002', invalidJson)));
