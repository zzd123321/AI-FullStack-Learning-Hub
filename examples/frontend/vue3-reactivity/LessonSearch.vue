<script setup lang="ts">
import {
  computed,
  onWatcherCleanup,
  reactive,
  readonly,
  ref,
  shallowRef,
  useTemplateRef,
  watch
} from 'vue'

interface LessonSummary {
  readonly id: string
  readonly title: string
  readonly published: boolean
}

interface SearchFilters {
  query: string
  publishedOnly: boolean
}

const filters: SearchFilters = reactive({
  query: '',
  publishedOnly: false
})

const normalizedQuery = computed(() =>
  filters.query.trim().toLocaleLowerCase()
)

const resultState = shallowRef<readonly LessonSummary[]>([])
const results = readonly(resultState)
const loading = ref(false)
const errorMessage = ref('')
const resultList = useTemplateRef<HTMLElement>('resultList')

let latestRequestId = 0

function searchLessons(
  query: string,
  publishedOnly: boolean,
  signal: AbortSignal
): Promise<readonly LessonSummary[]> {
  const allLessons: readonly LessonSummary[] = [
    {
      id: 'vue3-01',
      title: 'Composition API 与组件类型设计',
      published: true
    },
    {
      id: 'vue3-02',
      title: '响应式原理与副作用管理',
      published: false
    },
    {
      id: 'vue3-03',
      title: '组件通信与依赖注入',
      published: false
    }
  ]

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const matches = allLessons.filter(lesson =>
        lesson.title.toLocaleLowerCase().includes(query) &&
        (!publishedOnly || lesson.published)
      )
      resolve(matches)
    }, 400)

    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('请求已取消', 'AbortError'))
    }, { once: true })
  })
}

watch(
  [normalizedQuery, () => filters.publishedOnly],
  async ([query, publishedOnly]) => {
    const requestId = ++latestRequestId
    const controller = new AbortController()

    onWatcherCleanup(() => controller.abort())

    loading.value = true
    errorMessage.value = ''

    try {
      const nextResults = await searchLessons(
        query,
        publishedOnly,
        controller.signal
      )

      if (requestId === latestRequestId) {
        resultState.value = nextResults
      }
    } catch (error: unknown) {
      if (
        requestId === latestRequestId &&
        !(error instanceof DOMException && error.name === 'AbortError')
      ) {
        errorMessage.value = error instanceof Error
          ? error.message
          : '搜索失败'
      }
    } finally {
      if (requestId === latestRequestId) {
        loading.value = false
      }
    }
  },
  { immediate: true }
)

watch(
  results,
  () => {
    console.log(
      '更新后的列表高度：',
      resultList.value?.offsetHeight ?? 0
    )
  },
  { flush: 'post' }
)
</script>

<template>
  <section class="lesson-search">
    <h1>课程搜索</h1>

    <label>
      关键词
      <input
        v-model="filters.query"
        type="search"
        placeholder="输入课程标题"
      />
    </label>

    <label>
      <input
        v-model="filters.publishedOnly"
        type="checkbox"
      />
      只看已发布课程
    </label>

    <p v-if="loading" aria-live="polite">搜索中…</p>
    <p v-else-if="errorMessage" role="alert">
      {{ errorMessage }}
    </p>

    <ul v-else ref="resultList">
      <li v-for="lesson in results" :key="lesson.id">
        {{ lesson.title }}
        <small>{{ lesson.published ? '已发布' : '草稿' }}</small>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.lesson-search {
  display: grid;
  gap: 1rem;
  max-width: 36rem;
}

label {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
</style>
