import type {
  LessonGateway,
  LessonSearchQuery,
  LessonSearchResult
} from './contracts.js'

function toSearchParams(query: LessonSearchQuery): URLSearchParams {
  return new URLSearchParams({
    keyword: query.keyword.trim(),
    page: String(query.page),
    pageSize: String(query.pageSize)
  })
}

export function createHttpLessonGateway(
  fetcher: typeof fetch = fetch
): LessonGateway {
  return {
    async search(query, signal): Promise<LessonSearchResult> {
      const response = await fetcher(`/api/lessons?${toSearchParams(query)}`, {
        headers: { accept: 'application/json' },
        signal
      })

      if (!response.ok) {
        throw new Error(`课程搜索失败：${response.status}`)
      }

      return (await response.json()) as LessonSearchResult
    }
  }
}
