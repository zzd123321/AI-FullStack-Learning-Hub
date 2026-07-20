import type { Lesson } from './types.js'

export interface LessonService {
  publish(lessonId: string, title: string): Promise<Lesson>
}

function parseLesson(value: unknown): Lesson {
  if (typeof value !== 'object' || value === null) {
    throw new Error('发布接口返回了无法识别的数据')
  }

  const lesson = value as Record<string, unknown>
  if (
    typeof lesson.id !== 'string' ||
    typeof lesson.title !== 'string' ||
    (lesson.status !== 'draft' && lesson.status !== 'published')
  ) {
    throw new Error('发布接口返回了无法识别的数据')
  }

  return {
    id: lesson.id,
    title: lesson.title,
    status: lesson.status
  }
}

export function createLessonService(fetcher: typeof fetch = fetch): LessonService {
  return {
    async publish(lessonId, title) {
      const response = await fetcher(`/api/lessons/${encodeURIComponent(lessonId)}/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title })
      })

      if (!response.ok) throw new Error(`发布失败：${response.status}`)

      // HTTP JSON 属于运行时输入，不能靠类型断言把它变成可信 Lesson。
      const payload: unknown = await response.json()
      return parseLesson(payload)
    }
  }
}
