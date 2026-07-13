export interface EnrollmentReceipt {
  enrollmentId: string
  lessonId: string
  email: string
}

export interface EnrollmentService {
  enroll(
    lessonId: string,
    email: string,
    signal?: AbortSignal
  ): Promise<EnrollmentReceipt>
}

export class EnrollmentError extends Error {
  constructor(
    message: string,
    readonly code: 'already-enrolled' | 'lesson-closed' | 'network'
  ) {
    super(message)
    this.name = 'EnrollmentError'
  }
}
