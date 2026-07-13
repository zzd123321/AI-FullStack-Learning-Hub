<script setup lang="ts">
import { ref } from 'vue'
import type { LessonGateway, LessonSummary } from './contracts'
import { useLessonSearch } from './useLessonSearch'

const props = defineProps<{ gateway: LessonGateway }>()
const emit = defineEmits<{
  select: [lesson: LessonSummary]
}>()

const keyword = ref('')
const { items, loading, error } = useLessonSearch(keyword, props.gateway)
</script>

<template>
  <section>
    <label>搜索课程 <input v-model.trim="keyword" type="search"></label>
    <p v-if="loading">搜索中…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <ul v-else>
      <li v-for="lesson in items" :key="lesson.id">
        <button type="button" @click="emit('select', lesson)">
          {{ lesson.title }}
        </button>
      </li>
    </ul>
  </section>
</template>
