import type { CreateLessonInput } from './form-model.js'

export type ServerFieldName = 'title' | 'slug' | 'summary' | 'estimatedHours'
export type ServerFieldErrors = Partial<Record<ServerFieldName, string>>

export class FormSubmissionError extends Error {
  readonly fieldErrors: ServerFieldErrors

  constructor(
    message: string,
    fieldErrors: ServerFieldErrors = {}
  ) {
    super(message)
    this.name = 'FormSubmissionError'
    this.fieldErrors = fieldErrors
  }
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Request aborted', 'AbortError'))
      return
    }

    const handleAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Request aborted', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort)
      resolve()
    }, ms)

    signal?.addEventListener('abort', handleAbort, { once: true })
  })
}

const reservedSlugs = new Set(['admin', 'api', 'vue-router'])

export async function isSlugAvailable(
  slug: string,
  signal?: AbortSignal
): Promise<boolean> {
  await wait(350, signal)
  return !reservedSlugs.has(slug.trim().toLocaleLowerCase())
}

export interface CreatedLesson {
  id: string
  slug: string
}

export async function createLesson(
  input: CreateLessonInput,
  signal?: AbortSignal
): Promise<CreatedLesson> {
  await wait(500, signal)

  if (reservedSlugs.has(input.slug)) {
    throw new FormSubmissionError('部分字段需要修改', {
      slug: '该 Slug 已被占用'
    })
  }

  if (input.title.includes('测试失败')) {
    throw new FormSubmissionError('服务器暂时无法保存课程')
  }

  return {
    id: `lesson-${Date.now()}`,
    slug: input.slug
  }
}
