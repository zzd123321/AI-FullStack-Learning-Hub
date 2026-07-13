import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { LessonService } from './lesson-service'
import type { Lesson } from './ssr-types'

export const useLessonStore = defineStore('lesson', () => {
  const current = ref<Lesson | null>(null)
  const loadedId = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const found = computed(() => current.value !== null)

  async function load(id: string, service: LessonService): Promise<void> {
    if (loadedId.value === id) return

    loading.value = true
    error.value = null

    try {
      current.value = await service.findById(id)
      loadedId.value = id
    } catch (cause: unknown) {
      error.value = cause instanceof Error ? cause.message : '加载课程失败'
      throw cause
    } finally {
      loading.value = false
    }
  }

  return { current, loadedId, loading, error, found, load }
})
