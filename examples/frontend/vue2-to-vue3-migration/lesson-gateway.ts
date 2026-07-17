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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseSearchResult(value: unknown): LessonSearchResult {
  if (!isRecord(value) || !Array.isArray(value.items) || typeof value.total !== 'number') {
    throw new Error('课程接口返回了无效数据')
  }

  const items = value.items.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.title !== 'string' ||
      !['beginner', 'intermediate', 'advanced'].includes(String(item.level))
    ) {
      throw new Error('课程接口返回了无效数据')
    }

    return {
      id: item.id,
      title: item.title,
      level: item.level as 'beginner' | 'intermediate' | 'advanced'
    }
  })

  return { items, total: value.total }
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

      return parseSearchResult(await response.json())
    }
  }
}
