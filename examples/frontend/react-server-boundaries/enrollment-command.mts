import 'server-only'
import { AuthenticationError, requireSession } from './auth.mjs'
import { lessonRepository } from './repository.mjs'

export class EnrollmentCommandError extends Error {
  readonly code: 'unauthenticated' | 'forbidden' | 'not-found' | 'sold-out'

  constructor(code: EnrollmentCommandError['code']) {
    super(code)
    this.name = 'EnrollmentCommandError'
    this.code = code
  }
}

export async function enrollLesson(input: {
  lessonId: string
}) {
  let session
  try {
    session = await requireSession()
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw new EnrollmentCommandError('unauthenticated')
    }
    throw error
  }
  if (!session.roles.includes('student')) {
    throw new EnrollmentCommandError('forbidden')
  }

  try {
    const result = await lessonRepository.enroll({ ...input, userId: session.userId })
    return { duplicate: result.duplicate }
  } catch (error) {
    if (error instanceof Error && error.message === 'LESSON_NOT_FOUND') {
      throw new EnrollmentCommandError('not-found')
    }
    if (error instanceof Error && error.message === 'SOLD_OUT') {
      throw new EnrollmentCommandError('sold-out')
    }
    throw error
  }
}
