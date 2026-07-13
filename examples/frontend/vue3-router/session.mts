export type Role = 'reader' | 'editor'

export interface Session {
  authenticated: boolean
  roles: readonly Role[]
}

const session: Session = {
  authenticated: true,
  roles: ['reader', 'editor']
}

export function getSession(): Session {
  return session
}
