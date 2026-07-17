export interface PublicLesson {
  id: string
  title: string
  summary: string
  seatsRemaining: number
  enrolled: boolean
}

export interface AuthenticatedUser {
  id: string
  plan: 'free' | 'pro'
}

export interface EnrollmentCommand {
  lessonId: string
  idempotencyKey: string
}

export interface EnrollmentReceipt {
  enrollmentId: string
  lessonId: string
}
