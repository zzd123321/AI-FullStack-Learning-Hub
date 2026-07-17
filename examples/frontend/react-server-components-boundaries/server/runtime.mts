import 'server-only'
import type { AuthenticatedUser, EnrollmentCommand, EnrollmentReceipt, PublicLesson } from '../types.js'

export interface ServerRuntime {
  currentUser(): Promise<AuthenticatedUser | null>
  findPublicLesson(lessonId: string): Promise<PublicLesson | null>
  enroll(userId: string, command: EnrollmentCommand): Promise<EnrollmentReceipt>
  revalidateLesson(lessonId: string): void
}

let runtime: ServerRuntime | null = null

// Framework bootstrap installs adapters for session, database/ORM, and cache invalidation.
export function installServerRuntime(nextRuntime: ServerRuntime): void {
  runtime = nextRuntime
}

export function getServerRuntime(): ServerRuntime {
  if (!runtime) throw new Error('Server runtime has not been installed by the framework.')
  return runtime
}
