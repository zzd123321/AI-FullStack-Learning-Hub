export interface Lesson {
  id: string
  title: string
  seatsRemaining: number
  requiredPlan: 'free' | 'pro'
  enrolled: boolean
}

export interface Session {
  authenticated: boolean
  plan: 'free' | 'pro'
}

export interface EnrollmentReceipt {
  enrollmentId: string
  lessonId: string
  createdAt: string
}

export type Eligibility =
  | { allowed: true }
  | { allowed: false; reason: 'sign-in' | 'upgrade' | 'sold-out' }
