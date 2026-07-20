import type { FieldErrors, LessonValues } from './types.js'

export type ParseResult =
  | { ok: true; values: LessonValues }
  | { ok: false; errors: FieldErrors }

function stringValue(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function isLessonLevel(value: string): value is LessonValues['level'] {
  return value === 'beginner' || value === 'intermediate' || value === 'advanced'
}

export function parseLessonForm(formData: FormData): ParseResult {
  const title = stringValue(formData, 'title')
  const summary = stringValue(formData, 'summary')
  const rawLevel = stringValue(formData, 'level')
  const level = isLessonLevel(rawLevel) ? rawLevel : null
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
  if (level === null) {
    errors.level = '请选择有效难度。'
  }
  if (tags.length === 0) {
    errors.tags = '至少选择一个标签。'
  }

  if (level === null || Object.keys(errors).length > 0) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    values: {
      title,
      summary,
      // 上面的运行时类型守卫已经把字符串收窄为合法领域值。
      level,
      tags,
      featured: formData.get('featured') === 'on',
    },
  }
}
