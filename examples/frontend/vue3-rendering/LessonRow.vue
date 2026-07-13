<script setup lang="ts">
import type { LessonRecord } from './lesson-data.js'

defineProps<{
  lesson: LessonRecord
  active: boolean
}>()

const emit = defineEmits<{
  select: [lessonId: string]
}>()
</script>

<template>
  <li :class="{ active }">
    <button type="button" @click="emit('select', lesson.id)">
      <strong>{{ lesson.title }}</strong>
      <span>{{ lesson.category }} · {{ lesson.durationMinutes }} 分钟</span>
    </button>
  </li>
</template>

<style scoped>
button {
  display: flex;
  gap: 1rem;
  justify-content: space-between;
  width: 100%;
}

.active {
  outline: 2px solid #42b883;
}
</style>
