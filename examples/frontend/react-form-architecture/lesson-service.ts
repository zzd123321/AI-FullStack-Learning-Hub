import type { Lesson, LessonValues, Tag } from './types.js'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function expectJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new ApiError('服务器暂时无法处理请求，请稍后重试。', response.status)
  }
  return response.json() as Promise<T>
}

export async function saveLesson(
  values: LessonValues,
  idempotencyKey: string,
): Promise<Lesson> {
  const response = await fetch('/api/lessons', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    credentials: 'same-origin',
    body: JSON.stringify(values),
  })
  return expectJson<Lesson>(response)
}

export async function checkTitleAvailability(
  title: string,
  signal: AbortSignal,
): Promise<boolean> {
  const query = new URLSearchParams({ title })
  const response = await fetch(`/api/lessons/title-availability?${query}`, {
    signal,
    credentials: 'same-origin',
  })
  const body = await expectJson<{ available: boolean }>(response)
  return body.available
}

export async function createTag(name: string): Promise<Tag> {
  const response = await fetch('/api/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ name }),
  })
  return expectJson<Tag>(response)
}

export async function uploadLessonAsset(formData: FormData): Promise<void> {
  const response = await fetch('/api/lesson-assets', {
    method: 'POST',
    credentials: 'same-origin',
    body: formData,
  })
  await expectJson<unknown>(response)
}
