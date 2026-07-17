export interface Lesson {
  id: string
  title: string
  summary: string
  status: 'draft' | 'published'
}

export interface LessonPage {
  items: Lesson[]
  page: number
  totalPages: number
  total: number
}

const lessons: Lesson[] = [
  {
    id: 'vue-reactivity',
    title: 'Vue 3 响应式原理',
    summary: '理解依赖收集、触发更新与副作用清理。',
    status: 'published'
  },
  {
    id: 'vue-pinia',
    title: 'Pinia 状态管理',
    summary: '建立 Store、服务层与异步状态边界。',
    status: 'published'
  },
  {
    id: 'vue-router',
    title: 'Vue Router 路由架构',
    summary: '让 URL、页面、权限和数据生命周期保持一致。',
    status: 'draft'
  }
]

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    // 如果调用方在请求开始前就已经取消，不能再启动一个“幽灵请求”。
    if (signal?.aborted) {
      reject(new DOMException('Request aborted', 'AbortError'))
      return
    }

    const handleAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Request aborted', 'AbortError'))
    }

    const timer = setTimeout(() => {
      // 正常结束后移除监听，避免长生命周期 signal 留住无用闭包。
      signal?.removeEventListener('abort', handleAbort)
      resolve()
    }, ms)

    signal?.addEventListener('abort', handleAbort, { once: true })
  })
}

export async function listLessons(
  keyword: string,
  requestedPage: number,
  signal?: AbortSignal
): Promise<LessonPage> {
  await delay(250, signal)
  const normalized = keyword.trim().toLocaleLowerCase()
  const pageSize = 2
  const matched = lessons.filter(
    (lesson) =>
      normalized.length === 0 ||
      lesson.title.toLocaleLowerCase().includes(normalized)
  )
  const totalPages = Math.max(1, Math.ceil(matched.length / pageSize))
  // URL 可能来自旧书签。服务边界再次收敛页码，避免切片越界。
  const page = Math.min(Math.max(1, requestedPage), totalPages)
  const start = (page - 1) * pageSize

  return {
    items: matched.slice(start, start + pageSize).map((lesson) => ({ ...lesson })),
    page,
    totalPages,
    total: matched.length
  }
}

export async function getLesson(
  lessonId: string,
  signal?: AbortSignal
): Promise<Lesson> {
  await delay(300, signal)
  const lesson = lessons.find((item) => item.id === lessonId)

  if (!lesson) throw new Error(`找不到课程：${lessonId}`)
  return { ...lesson }
}
