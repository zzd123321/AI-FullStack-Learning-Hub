export interface AuthTransaction {
  readonly state: string;
  readonly nonce: string;
  readonly verifier: string;
  readonly returnPath: string;
  readonly createdAt: number;
}

const KEY = 'auth:transaction';

export function normalizeReturnPath(value: string, origin: string): string {
  if (value.length > 2_048) return '/';
  try {
    const target = new URL(value, origin);
    if (target.origin !== origin || !target.pathname.startsWith('/')) return '/';
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return '/';
  }
}

export function saveAuthTransaction(transaction: AuthTransaction): void {
  sessionStorage.setItem(KEY, JSON.stringify(transaction));
}

export function consumeAuthTransaction(receivedState: string, now = Date.now()): AuthTransaction | null {
  const raw = sessionStorage.getItem(KEY);
  sessionStorage.removeItem(KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<AuthTransaction>;
    return value.state === receivedState && typeof value.nonce === 'string'
      && typeof value.verifier === 'string' && typeof value.returnPath === 'string'
      && typeof value.createdAt === 'number' && value.createdAt <= now
      && now - value.createdAt <= 10 * 60_000
      ? value as AuthTransaction : null;
  } catch { return null; }
}
