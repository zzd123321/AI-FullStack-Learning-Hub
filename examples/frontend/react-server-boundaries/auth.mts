import 'server-only'
import { cookies } from 'next/headers'
import type { UserSession } from './types.js'

const sessions = new Map<string, UserSession>([[
  'demo-session',
  { userId: 'student-1', roles: ['student'] },
]])

export class AuthenticationError extends Error {
  constructor() {
    super('UNAUTHENTICATED')
    this.name = 'AuthenticationError'
  }
}

export async function requireSession(): Promise<UserSession> {
  const cookieStore = await cookies()
  // __Host- 前缀要求 Secure、Path=/ 且不能设置 Domain，能减少 Cookie 注入风险。
  const token = cookieStore.get('__Host-session')?.value
  const session = token ? sessions.get(token) : undefined
  if (!session) throw new AuthenticationError()
  return session
}
