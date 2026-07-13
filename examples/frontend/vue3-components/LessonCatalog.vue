<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseField from './BaseField.vue'
import LessonSelectionProvider from './LessonSelectionProvider.vue'
import LessonToolbar from './LessonToolbar.vue'

interface Lesson {
  readonly id: string
  readonly title: string
}

const query = ref('')
const message = ref('')

const lessons: readonly Lesson[] = [
  { id: 'vue3-01', title: 'Composition API 与组件类型设计' },
  { id: 'vue3-02', title: '响应式原理与副作用管理' },
  { id: 'vue3-03', title: '组件通信与可复用组件' }
]

const visibleLessons = computed(() => {
  const normalized = query.value.trim().toLocaleLowerCase()

  return lessons.filter(lesson =>
    lesson.title.toLocaleLowerCase().includes(normalized)
  )
})

function handleOpen(lessonId: string): void {
  const lesson = lessons.find(item => item.id === lessonId)
  message.value = lesson ? `打开：${lesson.title}` : '课程不存在'
}
</script>

<template>
  <main class="catalog">
    <BaseField
      v-model="query"
      label="筛选课程"
      type="search"
      placeholder="输入标题"
      autocomplete="off"
    />

    <LessonSelectionProvider
      v-slot="{ selectedId, select }"
    >
      <ul>
        <li v-for="lesson in visibleLessons" :key="lesson.id">
          <button
            type="button"
            :aria-pressed="selectedId === lesson.id"
            @click="select(lesson.id)"
          >
            {{ lesson.title }}
          </button>
        </li>
      </ul>

      <LessonToolbar @open="handleOpen" />
    </LessonSelectionProvider>

    <p aria-live="polite">{{ message }}</p>
  </main>
</template>

<style scoped>
.catalog {
  display: grid;
  gap: 1rem;
  max-width: 42rem;
}

ul {
  display: grid;
  gap: 0.5rem;
  padding: 0;
  list-style: none;
}
</style>
