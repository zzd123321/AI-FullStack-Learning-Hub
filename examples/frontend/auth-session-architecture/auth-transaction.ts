import { createPkcePair, randomBase64Url } from './pkce.js';

export interface AuthTransaction {
  readonly state: string;
  readonly nonce: string;
  readonly verifier: string;
  readonly returnPath: string;
  readonly createdAt: number;
}

const KEY_PREFIX = 'auth:transaction:';
const MAX_AGE_MS = 10 * 60_000;
const OPAQUE_VALUE = /^[A-Za-z0-9_-]+$/;

function isOpaqueValue(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === 'string'
    && value.length >= minimum
    && value.length <= maximum
    && OPAQUE_VALUE.test(value);
}

function storageKey(state: string): string {
  return `${KEY_PREFIX}${state}`;
}

function parseTransaction(value: unknown): AuthTransaction | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Partial<AuthTransaction>;
  if (!isOpaqueValue(candidate.state, 32, 256)
    || !isOpaqueValue(candidate.nonce, 16, 256)
    || !isOpaqueValue(candidate.verifier, 43, 128)
    || typeof candidate.returnPath !== 'string'
    || candidate.returnPath.length > 2_048
    || !candidate.returnPath.startsWith('/')
    || candidate.returnPath.startsWith('//')
    || candidate.returnPath.includes('\\')
    || /[\u0000-\u001F\u007F]/.test(candidate.returnPath)
    || !Number.isSafeInteger(candidate.createdAt)
    || (candidate.createdAt as number) < 0) return null;

  return {
    state: candidate.state,
    nonce: candidate.nonce,
    verifier: candidate.verifier,
    returnPath: candidate.returnPath,
    createdAt: candidate.createdAt as number,
  };
}

export function normalizeReturnPath(value: string, origin: string): string {
  // Require an application-relative path. Accepting an arbitrary absolute URL
  // here would turn the post-login redirect into an open redirector.
  if (value.length > 2_048 || !value.startsWith('/') || value.startsWith('//')
    || value.includes('\\') || /[\u0000-\u001F\u007F]/.test(value)) return '/';
  try {
    const trustedOrigin = new URL(origin).origin;
    const target = new URL(value, trustedOrigin);
    if (target.origin !== trustedOrigin) return '/';
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return '/';
  }
}

export function saveAuthTransaction(transaction: AuthTransaction): void {
  const parsed = parseTransaction(transaction);
  if (!parsed) throw new TypeError('Invalid authorization transaction');
  // Keying by state permits two login attempts in this tab to coexist.
  // Different tabs already have separate sessionStorage areas.
  sessionStorage.setItem(storageKey(parsed.state), JSON.stringify(parsed));
}

export function consumeAuthTransaction(receivedState: string, now = Date.now()): AuthTransaction | null {
  if (!isOpaqueValue(receivedState, 32, 256) || !Number.isSafeInteger(now) || now < 0) return null;
  const key = storageKey(receivedState);
  const raw = sessionStorage.getItem(key);
  // Consume before parsing so malformed, expired and mismatched data cannot be replayed.
  sessionStorage.removeItem(key);
  if (!raw) return null;
  try {
    const transaction = parseTransaction(JSON.parse(raw));
    return transaction?.state === receivedState
      && transaction.createdAt <= now
      && now - transaction.createdAt <= MAX_AGE_MS
      ? transaction : null;
  } catch {
    return null;
  }
}

export async function beginAuthTransaction(
  requestedReturnPath: string,
  origin: string,
  now = Date.now(),
): Promise<{ readonly transaction: AuthTransaction; readonly challenge: string }> {
  const { verifier, challenge } = await createPkcePair();
  const transaction: AuthTransaction = {
    state: randomBase64Url(),
    nonce: randomBase64Url(),
    verifier,
    returnPath: normalizeReturnPath(requestedReturnPath, origin),
    createdAt: now,
  };
  saveAuthTransaction(transaction);
  return { transaction, challenge };
}
