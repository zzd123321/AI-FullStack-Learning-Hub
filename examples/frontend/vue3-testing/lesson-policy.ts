export type UserRole = 'guest' | 'student' | 'editor'
export type LessonStatus = 'draft' | 'published' | 'archived'

export interface LessonAccessInput {
  role: UserRole
  status: LessonStatus
  enrolled: boolean
}

export type LessonAction = 'preview' | 'study' | 'edit'

export function allowedLessonActions(input: LessonAccessInput): LessonAction[] {
  const actions: LessonAction[] = []

  if (input.status === 'published') actions.push('preview')
  if (input.role === 'student' && input.enrolled && input.status === 'published') {
    actions.push('study')
  }
  if (input.role === 'editor' && input.status !== 'archived') actions.push('edit')

  return actions
}

export function canEnroll(input: LessonAccessInput): boolean {
  return (
    input.role === 'student' &&
    input.status === 'published' &&
    !input.enrolled
  )
}
