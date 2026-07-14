import { parseLessonForm } from './form-contract.js'
import { ApiError, saveLesson } from './lesson-service.js'
import type { FormState } from './types.js'

function newIdempotencyKey(): string {
  return crypto.randomUUID()
}

export function createInitialFormState(idempotencyKey: string): FormState {
  return {
    status: 'idle',
    message: null,
    errors: {},
    idempotencyKey,
    values: null,
    revision: 0,
  }
}

export async function saveLessonAction(
  previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseLessonForm(formData)
  if (!parsed.ok) {
    return {
      ...previousState,
      status: 'invalid',
      message: '请修正标记的字段。',
      errors: parsed.errors,
      values: {
        title: typeof formData.get('title') === 'string' ? String(formData.get('title')) : '',
        summary: typeof formData.get('summary') === 'string' ? String(formData.get('summary')) : '',
        level: typeof formData.get('level') === 'string' ? String(formData.get('level')) : '',
        tags: formData.getAll('tags').filter((value): value is string => typeof value === 'string'),
        featured: formData.get('featured') === 'on',
      },
      revision: previousState.revision + 1,
    }
  }

  try {
    await saveLesson(parsed.values, previousState.idempotencyKey)
    return {
      status: 'success',
      message: '课程已保存。',
      errors: {},
      idempotencyKey: newIdempotencyKey(),
      values: null,
      revision: previousState.revision + 1,
    }
  } catch (error) {
    return {
      ...previousState,
      status: 'error',
      message:
        error instanceof ApiError
          ? error.message
          : '网络异常，表单内容仍然保留，请稍后重试。',
      errors: {},
      values: parsed.values,
      revision: previousState.revision + 1,
    }
  }
}
