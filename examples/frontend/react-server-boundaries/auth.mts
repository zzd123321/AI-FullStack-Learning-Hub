import 'server-only'
import { cookies } from 'next/headers'
import type { UserSession } from './types.js'

const sessions = new Map<string, UserSession>([[
  'demo-session',
  { userId: 'student-1', roles: ['student'] },
]])

export async function requireSession(): Promise<UserSession> {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  const session = token ? sessions.get(token) : undefined
  if (!session) throw new Error('UNAUTHENTICATED')
  return session
}
