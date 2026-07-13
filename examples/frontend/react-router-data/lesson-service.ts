import { readJson } from './http.js'
import type { LessonDetail, LessonQuery, LessonSummary } from './types.js'

export async function listLessons(
  query: LessonQuery,
  signal: AbortSignal
): Promise<readonly LessonSummary[]> {
  const search = new URLSearchParams({
    keyword: query.keyword,
    status: query.status
  })
  const response = await fetch(`/api/lessons?${search}`, { signal })
  return readJson<readonly LessonSummary[]>(response)
}

export async function getLesson(
  lessonId: string,
  signal: AbortSignal
): Promise<LessonDetail> {
  const response = await fetch(`/api/lessons/${encodeURIComponent(lessonId)}`, { signal })
  return readJson<LessonDetail>(response)
}

export async function updateLesson(
  lessonId: string,
  values: { title: string; content: string },
  signal: AbortSignal
): Promise<LessonDetail> {
  const response = await fetch(`/api/lessons/${encodeURIComponent(lessonId)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(values),
    signal
  })
  return readJson<LessonDetail>(response)
}

export async function publishLesson(
  lessonId: string,
  signal: AbortSignal
): Promise<LessonDetail> {
  const response = await fetch(`/api/lessons/${encodeURIComponent(lessonId)}/publish`, {
    method: 'POST',
    signal
  })
  return readJson<LessonDetail>(response)
}
