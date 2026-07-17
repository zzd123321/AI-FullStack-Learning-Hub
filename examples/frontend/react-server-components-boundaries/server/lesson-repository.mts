import 'server-only'
import { cache } from 'react'
import { getServerRuntime } from './runtime'

// Declare cache once at module scope: all Server Components in one request share it.
export const getPublicLesson = cache(async (lessonId: string) => {
  const lesson = await getServerRuntime().findPublicLesson(lessonId)
  if (!lesson) throw new Error('LESSON_NOT_FOUND')
  return lesson
})
