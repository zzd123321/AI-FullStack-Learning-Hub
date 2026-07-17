import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { LessonService } from './lesson-service'
import type { Lesson } from './ssr-types'

export const useLessonStore = defineStore('lesson', () => {
  const current = ref<Lesson | null>(null)
  const loadedId = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  let latestRequestId = 0
  let activeController: AbortController | null = null

  const found = computed(() => current.value !== null)

  async function load(id: string, service: LessonService): Promise<void> {
    if (loadedId.value === id) return

    const requestId = ++latestRequestId
    activeController?.abort()
    const controller = new AbortController()
    activeController = controller
    current.value = null
    loading.value = true
    error.value = null

    try {
      const lesson = await service.findById(id, controller.signal)
      if (requestId !== latestRequestId) return
      current.value = lesson
      loadedId.value = id
    } catch (cause: unknown) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      if (requestId !== latestRequestId) return
      error.value = cause instanceof Error ? cause.message : '加载课程失败'
      throw cause
    } finally {
      if (requestId === latestRequestId) {
        activeController = null
        loading.value = false
      }
    }
  }

  return { current, loadedId, loading, error, found, load }
})
