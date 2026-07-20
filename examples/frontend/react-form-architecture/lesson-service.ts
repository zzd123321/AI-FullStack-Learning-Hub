import type { Lesson, LessonValues, Tag } from './types.js'

export class ApiError extends Error {
  readonly status: number

  constructor(
    message: string,
    status: number,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw new ApiError('服务器暂时无法处理请求，请稍后重试。', response.status)
  }
  return response.json()
}

function parseLesson(value: unknown): Lesson {
  if (!isRecord(value)) throw new Error('课程接口返回了无法识别的数据。')
  if (
    typeof value.id !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.summary !== 'string' ||
    (value.level !== 'beginner' &&
      value.level !== 'intermediate' &&
      value.level !== 'advanced') ||
    !Array.isArray(value.tags) ||
    !value.tags.every((tag) => typeof tag === 'string') ||
    typeof value.featured !== 'boolean' ||
    typeof value.updatedAt !== 'string'
  ) {
    throw new Error('课程接口返回了无法识别的数据。')
  }

  return {
    id: value.id,
    title: value.title,
    summary: value.summary,
    level: value.level,
    tags: value.tags,
    featured: value.featured,
    updatedAt: value.updatedAt,
  }
}

function parseAvailability(value: unknown): boolean {
  if (!isRecord(value) || typeof value.available !== 'boolean') {
    throw new Error('标题检查接口返回了无法识别的数据。')
  }
  return value.available
}

function parseTag(value: unknown): Tag {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') {
    throw new Error('标签接口返回了无法识别的数据。')
  }
  return { id: value.id, name: value.name }
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
  return parseLesson(await readJson(response))
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
  return parseAvailability(await readJson(response))
}

export async function createTag(name: string): Promise<Tag> {
  const response = await fetch('/api/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ name }),
  })
  return parseTag(await readJson(response))
}

export async function uploadLessonAsset(formData: FormData): Promise<void> {
  const response = await fetch('/api/lesson-assets', {
    method: 'POST',
    credentials: 'same-origin',
    body: formData,
  })
  if (!response.ok) {
    throw new ApiError('服务器暂时无法处理上传，请稍后重试。', response.status)
  }
}
