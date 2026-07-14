import 'server-only'
import type { CommentDTO, LessonRecord } from './types.js'

const lessons = new Map<string, LessonRecord>([[
  'react-rsc',
  {
    id: 'react-rsc',
    slug: 'react-rsc',
    title: 'React Server Components',
    summary: '理解服务端组件与客户端交互边界。',
    seatsRemaining: 12,
    published: true,
    ownerId: 'instructor-1',
    internalCostNotes: '仅服务端可见：录制与审核成本。',
  },
]])
const enrollmentKeys = new Set<string>()

export const lessonRepository = {
  async findPublishedById(id: string, signal?: AbortSignal) {
    signal?.throwIfAborted()
    const lesson = lessons.get(id)
    return lesson?.published ? { ...lesson } : null
  },
  async listPublished() {
    return [...lessons.values()].filter((lesson) => lesson.published).map((lesson) => ({ ...lesson }))
  },
  async listComments(lessonId: string): Promise<CommentDTO[]> {
    return [{ id: `${lessonId}-comment-1`, authorName: '学习者', body: '边界讲得很清楚。' }]
  },
  async enroll(input: { lessonId: string; userId: string }) {
    const key = `${input.userId}:${input.lessonId}`
    if (enrollmentKeys.has(key)) return { duplicate: true }
    const lesson = lessons.get(input.lessonId)
    if (!lesson || !lesson.published) throw new Error('LESSON_NOT_FOUND')
    if (lesson.seatsRemaining <= 0) throw new Error('SOLD_OUT')
    lesson.seatsRemaining -= 1
    enrollmentKeys.add(key)
    return { duplicate: false }
  },
}
