import { onScopeDispose, ref, watch } from 'vue'

export interface LessonSearchResult {
  id: string
  title: string
}

export interface LessonSearchService {
  search(query: string, signal?: AbortSignal): Promise<LessonSearchResult[]>
}

export function useDebouncedLessonSearch(
  service: LessonSearchService,
  delay = 300
) {
  const query = ref('')
  const results = ref<LessonSearchResult[]>([])
  const pending = ref(false)
  const error = ref<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined
  let latestRequestId = 0

  const stop = watch(query, (value) => {
    // 查询一变化就换所有者；即使服务忽略 AbortSignal，旧结果也不得写回。
    const requestId = ++latestRequestId
    if (timer) clearTimeout(timer)
    controller?.abort()
    pending.value = false
    error.value = null

    const normalized = value.trim()
    if (normalized.length < 2) {
      results.value = []
      return
    }

    timer = setTimeout(async () => {
      controller = new AbortController()
      const current = controller
      pending.value = true

      try {
        const nextResults = await service.search(normalized, current.signal)
        if (requestId === latestRequestId) results.value = nextResults
      } catch (cause: unknown) {
        if (
          requestId === latestRequestId &&
          !(cause instanceof DOMException && cause.name === 'AbortError')
        ) {
          error.value = '搜索失败'
        }
      } finally {
        // 旧请求的 finally 不能关闭新请求的 pending。
        if (requestId === latestRequestId) pending.value = false
      }
    }, delay)
  })

  onScopeDispose(() => {
    latestRequestId += 1
    stop()
    if (timer) clearTimeout(timer)
    controller?.abort()
  })

  return { query, results, pending, error }
}
