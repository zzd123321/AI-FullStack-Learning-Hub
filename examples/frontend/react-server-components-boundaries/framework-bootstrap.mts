import 'server-only'
import { installServerRuntime } from './server/runtime'

// Replace every adapter below with the selected framework's request context, ORM,
// transaction, session, and cache-tag/path invalidation APIs.
installServerRuntime({
  async currentUser() {
    throw new Error('Read the authenticated user from the request/session adapter.')
  },
  async findPublicLesson() {
    throw new Error('Read a public projection from the database adapter.')
  },
  async enroll() {
    throw new Error('Run authorization, capacity check, and idempotent write in one transaction.')
  },
  revalidateLesson() {
    throw new Error('Invalidate the framework cache tag/path after a successful mutation.')
  },
})
