export interface LessonRecord {
  id: string
  slug: string
  title: string
  summary: string
  seatsRemaining: number
  published: boolean
  ownerId: string
  internalCostNotes: string
}

export interface LessonDTO {
  id: string
  slug: string
  title: string
  summary: string
  seatsRemaining: number
}

export interface CommentDTO {
  id: string
  authorName: string
  body: string
}

export interface UserSession {
  userId: string
  roles: readonly ('student' | 'instructor' | 'admin')[]
}

export type EnrollmentActionState =
  | { status: 'idle'; message: null }
  | { status: 'invalid'; message: string }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string }
