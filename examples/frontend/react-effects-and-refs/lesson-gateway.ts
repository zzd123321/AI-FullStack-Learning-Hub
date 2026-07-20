import type { LessonGateway, LessonSummary } from './types.js'

function isLessonSummary(value: unknown): value is LessonSummary {
  if (typeof value !== 'object' || value === null) return false

  const lesson = value as Record<string, unknown>
  return (
    typeof lesson.id === 'string' &&
    typeof lesson.title === 'string' &&
    typeof lesson.summary === 'string'
  )
}

function parseLessonSummaries(value: unknown): readonly LessonSummary[] {
  if (!Array.isArray(value) || !value.every(isLessonSummary)) {
    throw new Error('课程接口返回了无法识别的数据')
  }

  return value
}

export function createLessonGateway(fetcher: typeof fetch = fetch): LessonGateway {
  return {
    async search(keyword, signal) {
      const query = new URLSearchParams({ keyword: keyword.trim() })
      const response = await fetcher(`/api/lessons?${query}`, {
        headers: { accept: 'application/json' },
        signal
      })

      if (!response.ok) {
        throw new Error(`课程接口失败：${response.status}`)
      }

      // response.json() 来自程序外部，TypeScript 无法证明它符合接口类型。
      // 先以 unknown 接收并做运行时校验，避免错误数据流入组件。
      const payload: unknown = await response.json()
      return parseLessonSummaries(payload)
    }
  }
}
