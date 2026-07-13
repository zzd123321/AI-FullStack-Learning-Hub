import type { Lesson } from './types.js'

export interface LessonService {
  publish(lessonId: string, title: string): Promise<Lesson>
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
      return (await response.json()) as Lesson
    }
  }
}
