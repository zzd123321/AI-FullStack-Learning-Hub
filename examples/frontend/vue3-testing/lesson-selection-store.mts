import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export const useLessonSelectionStore = defineStore('lesson-selection', () => {
  const selectedIds = ref<string[]>([])
  const selectedCount = computed(() => selectedIds.value.length)

  function toggle(lessonId: string): void {
    const index = selectedIds.value.indexOf(lessonId)
    if (index >= 0) selectedIds.value.splice(index, 1)
    else selectedIds.value.push(lessonId)
  }

  function clear(): void {
    selectedIds.value = []
  }

  return { selectedIds, selectedCount, toggle, clear }
})
