import { readJson } from './http.js'
import type { UserSession } from './types.js'

export async function getSession(signal: AbortSignal): Promise<UserSession | null> {
  const response = await fetch('/api/session', { signal })
  if (response.status === 401) return null
  return readJson<UserSession>(response)
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
