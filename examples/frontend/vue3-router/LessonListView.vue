<script setup lang="ts">
import { onWatcherCleanup, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { listLessons, type Lesson } from './lesson-api'

const props = defineProps<{
  keyword: string
  page: number
}>()

const router = useRouter()
const draftKeyword = ref(props.keyword)
const lessons = ref<Lesson[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

watch(
  () => props.keyword,
  async (keyword) => {
    draftKeyword.value = keyword
    const controller = new AbortController()
    onWatcherCleanup(() => controller.abort())
    loading.value = true
    error.value = null

    try {
      lessons.value = await listLessons(keyword, controller.signal)
    } catch (cause: unknown) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      error.value = cause instanceof Error ? cause.message : '加载失败'
    } finally {
      if (!controller.signal.aborted) loading.value = false
    }
  },
  { immediate: true }
)

async function search(): Promise<void> {
  await router.push({
    name: 'lesson-list',
    query: {
      keyword: draftKeyword.value.trim() || undefined,
      page: props.page > 1 ? String(props.page) : undefined
    }
  })
}
</script>

<template>
  <section>
    <h1>课程列表</h1>

    <form @submit.prevent="search()">
      <label>
        搜索课程
        <input v-model="draftKeyword" />
      </label>
      <button type="submit">查询</button>
    </form>

    <p v-if="loading">加载中…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <p v-else-if="lessons.length === 0">没有匹配课程</p>

    <ul v-else>
      <li v-for="lesson in lessons" :key="lesson.id">
        <RouterLink
          :to="{ name: 'lesson-detail', params: { lessonId: lesson.id } }"
        >
          {{ lesson.title }}
        </RouterLink>
      </li>
    </ul>
  </section>
</template>
