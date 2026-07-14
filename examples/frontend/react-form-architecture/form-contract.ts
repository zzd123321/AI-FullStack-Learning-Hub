import type { FieldErrors, LessonValues } from './types.js'

export type ParseResult =
  | { ok: true; values: LessonValues }
  | { ok: false; errors: FieldErrors }

function stringValue(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

export function parseLessonForm(formData: FormData): ParseResult {
  const title = stringValue(formData, 'title')
  const summary = stringValue(formData, 'summary')
  const rawLevel = stringValue(formData, 'level')
  const tags = formData
    .getAll('tags')
    .filter((value): value is string => typeof value === 'string')
  const errors: FieldErrors = {}

  if (title.length < 3 || title.length > 80) {
    errors.title = '标题需要 3～80 个字符。'
  }
  if (summary.length < 20 || summary.length > 500) {
    errors.summary = '简介需要 20～500 个字符。'
  }
  if (!['beginner', 'intermediate', 'advanced'].includes(rawLevel)) {
    errors.level = '请选择有效难度。'
  }
  if (tags.length === 0) {
    errors.tags = '至少选择一个标签。'
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    values: {
      title,
      summary,
      level: rawLevel as LessonValues['level'],
      tags,
      featured: formData.get('featured') === 'on',
    },
  }
}
