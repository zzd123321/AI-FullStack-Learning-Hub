import { readJson } from './http.js'
import type { UserSession } from './types.js'

function parseSession(value: unknown): UserSession {
  if (typeof value !== 'object' || value === null) {
    throw new Error('会话接口返回了无法识别的数据')
  }

  const session = value as Record<string, unknown>
  if (typeof session.userId !== 'string' || typeof session.displayName !== 'string') {
    throw new Error('会话接口返回了无法识别的数据')
  }
  return { userId: session.userId, displayName: session.displayName }
}

export async function getSession(signal: AbortSignal): Promise<UserSession | null> {
  const response = await fetch('/api/session', { signal })
  if (response.status === 401) return null
  return parseSession(await readJson(response))
}

export async function login(
  email: string,
  password: string,
  signal: AbortSignal
): Promise<void> {
  const response = await fetch('/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
    signal
  })

  if (!response.ok) throw new Error('邮箱或密码错误')
}
