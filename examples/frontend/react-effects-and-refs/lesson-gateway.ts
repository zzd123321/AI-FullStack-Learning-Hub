import type { LessonGateway, LessonSummary } from './types.js'

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

      return (await response.json()) as readonly LessonSummary[]
    }
  }
}
