import type { LessonActionData, LessonQuery } from './types.js'

export function parseLessonQuery(url: URL): LessonQuery {
  const rawStatus = url.searchParams.get('status')
  const status = rawStatus === 'draft' || rawStatus === 'published'
    ? rawStatus
    : 'all'

  return {
    keyword: url.searchParams.get('keyword')?.trim() ?? '',
    status
  }
}

export function validateLessonForm(formData: FormData):
  | { ok: true; values: { title: string; content: string } }
  | LessonActionData {
  const title = String(formData.get('title') ?? '').trim()
  const content = String(formData.get('content') ?? '').trim()
  const errors: LessonActionData['errors'] = {}

  if (title.length < 3) errors.title = '标题至少 3 个字符'
  if (content.length < 20) errors.content = '正文至少 20 个字符'

  return Object.keys(errors).length > 0
    ? { ok: false, errors, values: { title, content } }
    : { ok: true, values: { title, content } }
}

export function safeReturnTo(value: FormDataEntryValue | null): string {
  if (typeof value !== 'string') return '/lessons'
  if (!value.startsWith('/')) return '/lessons'

  try {
    // 使用固定同源基准解析，可同时拦截 //evil.example 和反斜杠等变体。
    const base = new URL('https://app.example')
    const target = new URL(value, base)
    if (target.origin !== base.origin) return '/lessons'
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return '/lessons'
  }
}
