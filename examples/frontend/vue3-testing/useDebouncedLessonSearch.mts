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

  const stop = watch(query, (value) => {
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
        results.value = await service.search(normalized, current.signal)
      } catch (cause: unknown) {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          error.value = '搜索失败'
        }
      } finally {
        if (!current.signal.aborted) pending.value = false
      }
    }, delay)
  })

  onScopeDispose(() => {
    stop()
    if (timer) clearTimeout(timer)
    controller?.abort()
  })

  return { query, results, pending, error }
}
