import 'server-only'
import { requireSession } from './auth.mjs'
import { lessonRepository } from './repository.mjs'

export class EnrollmentCommandError extends Error {
  constructor(readonly code: 'unauthenticated' | 'not-found' | 'sold-out') {
    super(code)
    this.name = 'EnrollmentCommandError'
  }
}

export async function enrollLesson(input: {
  lessonId: string
}) {
  let session
  try {
    session = await requireSession()
  } catch {
    throw new EnrollmentCommandError('unauthenticated')
  }
  if (!session.roles.includes('student')) {
    throw new EnrollmentCommandError('unauthenticated')
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
