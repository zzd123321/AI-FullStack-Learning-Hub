export interface UserSession {
  readonly userId: string
  readonly displayName: string
}

export interface LessonSummary {
  readonly id: string
  readonly title: string
  readonly status: 'draft' | 'published'
}

export interface LessonDetail extends LessonSummary {
  readonly content: string
  readonly updatedAt: string
}

export interface LessonQuery {
  readonly keyword: string
  readonly status: 'all' | LessonSummary['status']
}

export interface LessonFormErrors {
  title?: string
  content?: string
  form?: string
}

export interface LessonActionData {
  ok: false
  errors: LessonFormErrors
  values: { title: string; content: string }
}
