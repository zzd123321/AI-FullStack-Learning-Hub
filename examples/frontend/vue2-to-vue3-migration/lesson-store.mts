import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { LessonSummary } from './contracts'

export const useLessonSelectionStore = defineStore('lesson-selection', () => {
  const selected = ref<LessonSummary | null>(null)
  const selectedId = computed(() => selected.value?.id ?? null)

  function select(lesson: LessonSummary): void {
    selected.value = lesson
  }

  function clear(): void {
    selected.value = null
  }

  return { selected, selectedId, select, clear }
})
