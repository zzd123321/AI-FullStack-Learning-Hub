import type { Lesson, RequestContext } from './ssr-types.js'

export interface LessonService {
  findById(id: string, signal?: AbortSignal): Promise<Lesson | null>
}

function assertSafeId(id: string): void {
  if (!/^[a-z0-9-]+$/i.test(id)) {
    throw new Error('非法课程标识')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseLesson(value: unknown): Lesson {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.summary !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    throw new Error('课程接口返回了无效数据')
  }

  return {
    id: value.id,
    title: value.title,
    summary: value.summary,
    updatedAt: value.updatedAt
  }
}

export function createServerLessonService(
  context: RequestContext,
  fetcher: typeof fetch = fetch
): LessonService {
  return {
    async findById(id, signal) {
      assertSafeId(id)

      const headers = new Headers({
        accept: 'application/json',
        'x-request-id': context.requestId
      })

      // 只向可信的同源 API 转发明确允许的凭据，切勿复制全部请求头。
      if (context.sessionCookie) headers.set('cookie', context.sessionCookie)

      const url = new URL(
        `/api/lessons/${encodeURIComponent(id)}`,
        context.apiOrigin
      )
      const response = await fetcher(url, { headers, signal: signal ?? null })

      if (response.status === 404) return null
      if (!response.ok) throw new Error(`课程接口失败：${response.status}`)

      return parseLesson(await response.json())
    }
  }
}

export function createBrowserLessonService(fetcher: typeof fetch = fetch): LessonService {
  return {
    async findById(id, signal) {
      assertSafeId(id)
      const response = await fetcher(`/api/lessons/${encodeURIComponent(id)}`, {
        headers: { accept: 'application/json' },
        signal: signal ?? null
      })

      if (response.status === 404) return null
      if (!response.ok) throw new Error(`课程接口失败：${response.status}`)

      return parseLesson(await response.json())
    }
  }
}
