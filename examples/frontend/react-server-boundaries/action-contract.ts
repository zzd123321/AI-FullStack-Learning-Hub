export type EnrollmentInput =
  | { ok: true; lessonId: string }
  | { ok: false; message: string }

const SAFE_ID = /^[a-z0-9][a-z0-9-]{2,79}$/

function readString(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

export function parseEnrollmentForm(formData: FormData): EnrollmentInput {
  const lessonId = readString(formData, 'lessonId')
  if (!SAFE_ID.test(lessonId)) return { ok: false, message: '课程标识无效。' }
  return { ok: true, lessonId }
}

export function parseEnrollmentJSON(input: unknown): EnrollmentInput {
  if (!input || typeof input !== 'object') {
    return { ok: false, message: '请求格式无效。' }
  }
  const body = input as Record<string, unknown>
  const formData = new FormData()
  if (typeof body.lessonId === 'string') formData.set('lessonId', body.lessonId)
  return parseEnrollmentForm(formData)
}
