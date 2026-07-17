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
const currentPage = ref(props.page)
const totalPages = ref(1)
const total = ref(0)
let latestRequestId = 0

watch(
  [() => props.keyword, () => props.page],
  async ([keyword, page]) => {
    draftKeyword.value = keyword
    const requestId = ++latestRequestId
    const controller = new AbortController()
    onWatcherCleanup(() => controller.abort())
    loading.value = true
    error.value = null

    try {
      const result = await listLessons(keyword, page, controller.signal)

      // AbortController 节省资源；序号判断还可以防住无法真正取消的请求。
      if (requestId !== latestRequestId) return

      if (result.page !== page) {
        // 例如旧书签写着 page=99，但当前结果只有 2 页。
        // 用 replace 规范化 URL，避免页面显示第 2 页、地址栏却仍写第 99 页。
        await router.replace({
          name: 'lesson-list',
          query: {
            keyword: props.keyword || undefined,
            page: result.page > 1 ? String(result.page) : undefined
          }
        })
        return
      }

      lessons.value = result.items
      currentPage.value = result.page
      totalPages.value = result.totalPages
      total.value = result.total
    } catch (cause: unknown) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      if (requestId !== latestRequestId) return
      error.value = cause instanceof Error ? cause.message : '加载失败'
    } finally {
      // 旧请求的 finally 不能关闭新请求的 loading。
      if (requestId === latestRequestId) loading.value = false
    }
  },
  { immediate: true }
)

async function search(): Promise<void> {
  await router.push({
    name: 'lesson-list',
    query: {
      keyword: draftKeyword.value.trim() || undefined,
      // 新关键词意味着新的结果集，所以从第一页开始。
      page: undefined
    }
  })
}

async function goToPage(page: number): Promise<void> {
  await router.push({
    name: 'lesson-list',
    query: {
      keyword: props.keyword || undefined,
      page: page > 1 ? String(page) : undefined
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

    <nav v-if="!loading && !error && total > 0" aria-label="课程分页">
      <button
        type="button"
        :disabled="currentPage <= 1"
        @click="goToPage(currentPage - 1)"
      >
        上一页
      </button>
      <span>第 {{ currentPage }} / {{ totalPages }} 页，共 {{ total }} 门课程</span>
      <button
        type="button"
        :disabled="currentPage >= totalPages"
        @click="goToPage(currentPage + 1)"
      >
        下一页
      </button>
    </nav>
  </section>
</template>
