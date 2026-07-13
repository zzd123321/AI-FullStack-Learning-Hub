export interface Lesson {
  id: string
  title: string
  summary: string
  status: 'draft' | 'published'
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
    const timer = setTimeout(resolve, ms)

    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('Request aborted', 'AbortError'))
      },
      { once: true }
    )
  })
}

export async function listLessons(
  keyword: string,
  signal?: AbortSignal
): Promise<Lesson[]> {
  await delay(250, signal)
  const normalized = keyword.trim().toLocaleLowerCase()

  return lessons
    .filter(
      (lesson) =>
        normalized.length === 0 ||
        lesson.title.toLocaleLowerCase().includes(normalized)
    )
    .map((lesson) => ({ ...lesson }))
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
