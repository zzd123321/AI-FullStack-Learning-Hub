import { readJson } from './http.js'
import type { LessonDetail, LessonQuery, LessonSummary } from './types.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseLessonSummary(value: unknown): LessonSummary {
  if (!isRecord(value)) throw new Error('课程接口返回了无法识别的数据')
  if (
    typeof value.id !== 'string' ||
    typeof value.title !== 'string' ||
    (value.status !== 'draft' && value.status !== 'published')
  ) {
    throw new Error('课程接口返回了无法识别的数据')
  }
  return { id: value.id, title: value.title, status: value.status }
}

function parseLessonDetail(value: unknown): LessonDetail {
  const summary = parseLessonSummary(value)
  if (!isRecord(value) || typeof value.content !== 'string' || typeof value.updatedAt !== 'string') {
    throw new Error('课程详情接口返回了无法识别的数据')
  }
  return { ...summary, content: value.content, updatedAt: value.updatedAt }
}

function parseLessonList(value: unknown): readonly LessonSummary[] {
  if (!Array.isArray(value)) throw new Error('课程列表接口返回了无法识别的数据')
  return value.map(parseLessonSummary)
}

export async function listLessons(
  query: LessonQuery,
  signal: AbortSignal
): Promise<readonly LessonSummary[]> {
  const search = new URLSearchParams({
    keyword: query.keyword,
    status: query.status
  })
  const response = await fetch(`/api/lessons?${search}`, { signal })
  return parseLessonList(await readJson(response))
}

export async function getLesson(
  lessonId: string,
  signal: AbortSignal
): Promise<LessonDetail> {
  const response = await fetch(`/api/lessons/${encodeURIComponent(lessonId)}`, { signal })
  return parseLessonDetail(await readJson(response))
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
  return parseLessonDetail(await readJson(response))
}

export async function publishLesson(
  lessonId: string,
  signal: AbortSignal
): Promise<LessonDetail> {
  const response = await fetch(`/api/lessons/${encodeURIComponent(lessonId)}/publish`, {
    method: 'POST',
    signal
  })
  return parseLessonDetail(await readJson(response))
}
