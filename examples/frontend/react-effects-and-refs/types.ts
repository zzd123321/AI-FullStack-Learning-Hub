export interface LessonSummary {
  readonly id: string
  readonly title: string
  readonly summary: string
}

export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string }

export interface LessonGateway {
  search(keyword: string, signal: AbortSignal): Promise<readonly LessonSummary[]>
}
