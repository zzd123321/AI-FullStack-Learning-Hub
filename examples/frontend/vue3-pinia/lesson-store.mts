import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  fetchLessons,
  publishLesson,
  type LessonQuery,
  type LessonStatus,
  type LessonSummary
} from './lesson-api'

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : '发生未知错误'
}

export const useLessonStore = defineStore('lessons', () => {
  const items = ref<LessonSummary[]>([])
  const keyword = ref('')
  const status = ref<'all' | LessonStatus>('all')
  const selectedId = ref<string | null>(null)
  const loading = ref(false)
  const publishing = ref(false)
  const error = ref<string | null>(null)

  let requestSequence = 0
  let activeLoadController: AbortController | undefined

  const publishedCount = computed(
    () => items.value.filter((lesson) => lesson.status === 'published').length
  )

  const selectedLesson = computed(
    () => items.value.find((lesson) => lesson.id === selectedId.value) ?? null
  )

  function currentQuery(): LessonQuery {
    return {
      keyword: keyword.value,
      status: status.value
    }
  }

  async function load(): Promise<void> {
    activeLoadController?.abort()

    const controller = new AbortController()
    const sequence = ++requestSequence
    activeLoadController = controller
    loading.value = true
    error.value = null

    try {
      const nextItems = await fetchLessons(currentQuery(), controller.signal)

      if (sequence !== requestSequence) return

      items.value = nextItems

      if (!nextItems.some((lesson) => lesson.id === selectedId.value)) {
        selectedId.value = nextItems[0]?.id ?? null
      }
    } catch (cause: unknown) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      if (sequence === requestSequence) error.value = toMessage(cause)
    } finally {
      if (sequence === requestSequence) {
        loading.value = false
        activeLoadController = undefined
      }
    }
  }

  function select(lessonId: string): void {
    selectedId.value = lessonId
  }

  async function publishSelected(): Promise<void> {
    const lessonId = selectedId.value
    if (!lessonId || publishing.value) return

    publishing.value = true
    error.value = null

    try {
      const updated = await publishLesson(lessonId)
      const index = items.value.findIndex((lesson) => lesson.id === updated.id)

      if (index >= 0) items.value[index] = updated
    } catch (cause: unknown) {
      error.value = toMessage(cause)
    } finally {
      publishing.value = false
    }
  }

  function $reset(): void {
    activeLoadController?.abort()
    requestSequence += 1
    items.value = []
    keyword.value = ''
    status.value = 'all'
    selectedId.value = null
    loading.value = false
    publishing.value = false
    error.value = null
  }

  return {
    items,
    keyword,
    status,
    selectedId,
    loading,
    publishing,
    error,
    publishedCount,
    selectedLesson,
    load,
    select,
    publishSelected,
    $reset
  }
})
