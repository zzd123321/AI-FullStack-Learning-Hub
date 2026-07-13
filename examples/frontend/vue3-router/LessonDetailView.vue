<script setup lang="ts">
import { onWatcherCleanup, ref, watch } from 'vue'
import { getLesson, type Lesson } from './lesson-api'

const props = defineProps<{
  lessonId: string
}>()

const lesson = ref<Lesson | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

watch(
  () => props.lessonId,
  async (lessonId) => {
    const controller = new AbortController()
    onWatcherCleanup(() => controller.abort())
    loading.value = true
    error.value = null

    try {
      lesson.value = await getLesson(lessonId, controller.signal)
    } catch (cause: unknown) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      lesson.value = null
      error.value = cause instanceof Error ? cause.message : '加载失败'
    } finally {
      if (!controller.signal.aborted) loading.value = false
    }
  },
  { immediate: true }
)
</script>

<template>
  <article>
    <p><RouterLink :to="{ name: 'lesson-list' }">返回列表</RouterLink></p>
    <p v-if="loading">加载中…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <template v-else-if="lesson">
      <h1>{{ lesson.title }}</h1>
      <p>{{ lesson.summary }}</p>
      <RouterLink
        :to="{ name: 'lesson-edit', params: { lessonId: lesson.id } }"
      >
        编辑课程
      </RouterLink>
    </template>
  </article>
</template>
