export interface LessonValues {
  title: string
  summary: string
  level: 'beginner' | 'intermediate' | 'advanced'
  tags: string[]
  featured: boolean
}

export interface LessonDraft extends Omit<LessonValues, 'level'> {
  level: string
}

export type LessonField = 'title' | 'summary' | 'level' | 'tags'
export type FieldErrors = Partial<Record<LessonField, string>>

export interface FormState {
  status: 'idle' | 'invalid' | 'success' | 'error'
  message: string | null
  errors: FieldErrors
  idempotencyKey: string
  values: LessonDraft | null
  revision: number
}

export interface Lesson extends LessonValues {
  id: string
  updatedAt: string
}

export interface Tag {
  id: string
  name: string
}

export interface OptimisticTag extends Tag {
  pending?: boolean
}
