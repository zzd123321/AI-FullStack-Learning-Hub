<script setup lang="ts">
import { inject } from 'vue'
import { lessonSelectionKey } from './LessonSelectionProvider.vue'

const emit = defineEmits<{
  open: [lessonId: string]
}>()

const selection = inject(lessonSelectionKey)

if (!selection) {
  throw new Error(
    'LessonToolbar 必须位于 LessonSelectionProvider 内'
  )
}

function openSelected(): void {
  const id = selection.selectedId.value

  if (id) {
    emit('open', id)
  }
}
</script>

<template>
  <div class="toolbar" role="toolbar" aria-label="课程操作">
    <button
      type="button"
      :disabled="!selection.selectedId.value"
      @click="openSelected"
    >
      打开已选课程
    </button>
    <button
      type="button"
      :disabled="!selection.selectedId.value"
      @click="selection.clear"
    >
      清除选择
    </button>
  </div>
</template>
