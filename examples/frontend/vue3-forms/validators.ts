import type {
  FormErrors,
  LessonDraft,
  ScalarFieldName
} from './form-model.js'

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function validateScalarField(
  field: ScalarFieldName,
  value: string
): string | undefined {
  const normalized = value.trim()

  switch (field) {
    case 'title':
      if (!normalized) return '请输入课程标题'
      if (normalized.length > 80) return '标题不能超过 80 个字符'
      return undefined
    case 'slug':
      if (!normalized) return '请输入 URL Slug'
      if (!slugPattern.test(normalized)) {
        return '只能使用小写字母、数字和单个连字符'
      }
      return undefined
    case 'summary':
      if (!normalized) return '请输入课程摘要'
      if (normalized.length < 20) return '摘要至少需要 20 个字符'
      if (normalized.length > 300) return '摘要不能超过 300 个字符'
      return undefined
    case 'estimatedHours': {
      if (!normalized) return '请输入预计学时'
      const hours = Number(normalized)
      if (!Number.isFinite(hours) || hours <= 0) return '预计学时必须大于 0'
      if (hours > 200) return '预计学时不能超过 200 小时'
      return undefined
    }
    case 'level':
      return undefined
  }
}

export function validateDraft(draft: LessonDraft): FormErrors {
  const errors: FormErrors = { outcomeById: {} }
  const scalarFields: ScalarFieldName[] = [
    'title',
    'slug',
    'summary',
    'level',
    'estimatedHours'
  ]

  for (const field of scalarFields) {
    const message = validateScalarField(field, draft[field])
    if (message) errors[field] = message
  }

  if (draft.outcomes.length === 0) {
    errors.outcomes = '至少添加一个学习成果'
  }

  for (const outcome of draft.outcomes) {
    const text = outcome.text.trim()
    if (!text) errors.outcomeById[outcome.id] = '请输入学习成果'
    else if (text.length > 120) {
      errors.outcomeById[outcome.id] = '学习成果不能超过 120 个字符'
    }
  }

  return errors
}

export function hasErrors(errors: FormErrors): boolean {
  return (
    Boolean(
      errors.title ||
        errors.slug ||
        errors.summary ||
        errors.level ||
        errors.estimatedHours ||
        errors.outcomes
    ) || Object.keys(errors.outcomeById).length > 0
  )
}
