<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useLessonStore } from './lesson-store'
import ClientClock from './ClientClock.vue'

const store = useLessonStore()
const { current, loading, error } = storeToRefs(store)
</script>

<template>
  <article v-if="current">
    <h1>{{ current.title }}</h1>
    <p>{{ current.summary }}</p>
    <small>更新于 {{ current.updatedAt }}</small>
    <ClientClock />
  </article>
  <p v-else-if="loading">正在加载课程…</p>
  <p v-else-if="error" role="alert">{{ error }}</p>
  <p v-else>课程不存在。</p>
</template>
