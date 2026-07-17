import { onScopeDispose, readonly, ref, watch, type Ref } from 'vue'
import type { LessonGateway, LessonSummary } from './contracts'

export function useLessonSearch(keyword: Ref<string>, gateway: LessonGateway) {
  const items = ref<LessonSummary[]>([])
  const total = ref(0)
  const loading = ref(false)
  const error = ref<string | null>(null)
  let requestId = 0
  let controller: AbortController | undefined

  async function search(): Promise<void> {
    controller?.abort()
    controller = new AbortController()
    const currentRequestId = ++requestId
    loading.value = true
    error.value = null

    try {
      const result = await gateway.search(
        { keyword: keyword.value, page: 1, pageSize: 20 },
        controller.signal
      )

      if (currentRequestId !== requestId) return
      items.value = result.items
      total.value = result.total
    } catch (cause: unknown) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      if (currentRequestId === requestId) {
        error.value = cause instanceof Error ? cause.message : '搜索失败'
      }
    } finally {
      if (currentRequestId === requestId) loading.value = false
    }
  }

  const stop = watch(keyword, search, { immediate: true })
  onScopeDispose(() => {
    // 即使 Gateway 无法真正取消，作用域销毁后旧请求也失去写回资格。
    requestId += 1
    stop()
    controller?.abort()
  })

  return {
    items: readonly(items),
    total: readonly(total),
    loading: readonly(loading),
    error: readonly(error),
    search
  }
}
