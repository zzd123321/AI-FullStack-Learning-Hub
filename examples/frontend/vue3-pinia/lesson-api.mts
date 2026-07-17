export type LessonStatus = 'draft' | 'published'

export interface LessonSummary {
  id: string
  title: string
  category: 'typescript' | 'vue' | 'react'
  status: LessonStatus
  updatedAt: string
}

export interface LessonQuery {
  keyword: string
  status: 'all' | LessonStatus
}

const lessons: LessonSummary[] = [
  {
    id: 'ts-mapped-types',
    title: '映射类型与常用工具类型',
    category: 'typescript',
    status: 'published',
    updatedAt: '2026-07-10T08:00:00.000Z'
  },
  {
    id: 'vue-reactivity',
    title: 'Vue 3 响应式原理与副作用管理',
    category: 'vue',
    status: 'published',
    updatedAt: '2026-07-11T08:00:00.000Z'
  },
  {
    id: 'vue-pinia',
    title: 'Pinia 状态管理与服务层设计',
    category: 'vue',
    status: 'draft',
    updatedAt: '2026-07-13T08:00:00.000Z'
  }
]

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Request aborted', 'AbortError'))
      return
    }

    const handleAbort = (): void => {
      clearTimeout(timer)
      reject(new DOMException('Request aborted', 'AbortError'))
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort)
      resolve()
    }, ms)

    signal?.addEventListener('abort', handleAbort, { once: true })
  })
}

function cloneLesson(lesson: LessonSummary): LessonSummary {
  return { ...lesson }
}

export async function fetchLessons(
  query: LessonQuery,
  signal?: AbortSignal
): Promise<LessonSummary[]> {
  await wait(350, signal)

  const keyword = query.keyword.trim().toLocaleLowerCase()

  return lessons
    .filter((lesson) => {
      const matchesKeyword =
        keyword.length === 0 ||
        lesson.title.toLocaleLowerCase().includes(keyword)
      const matchesStatus =
        query.status === 'all' || lesson.status === query.status

      return matchesKeyword && matchesStatus
    })
    .map(cloneLesson)
}

export async function publishLesson(
  lessonId: string,
  signal?: AbortSignal
): Promise<LessonSummary> {
  await wait(250, signal)

  const lesson = lessons.find((item) => item.id === lessonId)

  if (!lesson) {
    throw new Error(`找不到课程：${lessonId}`)
  }

  lesson.status = 'published'
  lesson.updatedAt = new Date().toISOString()

  return cloneLesson(lesson)
}
