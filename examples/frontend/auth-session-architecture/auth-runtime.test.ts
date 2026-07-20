import { reduceAuth } from './auth-state.js';
import {
  beginAuthTransaction,
  consumeAuthTransaction,
  normalizeReturnPath,
  saveAuthTransaction,
  type AuthTransaction,
} from './auth-transaction.js';
import { canAccess } from './authorization.js';
import { createPkcePair } from './pkce.js';
import { fetchWithOneRefresh, RefreshCoordinator } from './refresh-coordinator.js';
import { parseSessionResponse } from './session-contract.js';
import { parseSessionEvent } from './session-events.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, message: string): void {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, received ${String(actual)}`);
}

function deepEqual(actual: unknown, expected: unknown, message: string): void {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

const session = {
  userId: 'user-1',
  displayName: 'Ada',
  permissions: ['lesson:read'],
} as const;

let state = reduceAuth({ phase: 'unknown' }, { type: 'session-found', session });
state = reduceAuth(state, { type: 'refresh-started' });
equal(state.phase, 'refreshing', 'refresh should enter the refreshing phase');
state = reduceAuth(state, { type: 'request-failed' });
assert(state.phase === 'unavailable', 'a failed request should enter unavailable');
equal(state.previous?.userId, 'user-1', 'offline should preserve the last session projection');

deepEqual(canAccess({
  permissions: new Set(['lesson:read']),
  attributes: { tenant: 'tenant-a' },
}, {
  permission: 'lesson:read',
  attribute: ['tenant', 'tenant-a'],
}), { allowed: true }, 'matching permission and attribute should allow the UI projection');

deepEqual(parseSessionResponse({
  authenticated: true,
  session: { userId: 'user-1', displayName: 'Ada', permissions: ['read', 'read'] },
}), {
  authenticated: true,
  session: { userId: 'user-1', displayName: 'Ada', permissions: ['read'] },
}, 'session responses should be copied and permissions deduplicated');
equal(parseSessionResponse({ authenticated: true, session: { permissions: [] } }), null,
  'malformed session responses should fail closed');

equal(normalizeReturnPath('https://evil.example/steal', 'https://learn.example'), '/', 'absolute URLs are rejected');
equal(normalizeReturnPath('//evil.example/steal', 'https://learn.example'), '/', 'scheme-relative URLs are rejected');
equal(normalizeReturnPath('/\\evil.example/steal', 'https://learn.example'), '/', 'backslash URL confusion is rejected');
equal(normalizeReturnPath('/lessons?tab=mine', 'https://learn.example'), '/lessons?tab=mine', 'local paths survive');
equal(normalizeReturnPath(`/${'a'.repeat(2_048)}`, 'https://learn.example'), '/', 'oversized paths are rejected');

const originalSessionStorage = globalThis.sessionStorage;
const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
});

try {
  const first = await beginAuthTransaction('/account', 'https://learn.example', 1_000);
  const second = await beginAuthTransaction('/settings', 'https://learn.example', 1_001);
  assert(first.transaction.state !== second.transaction.state, 'transactions need fresh state values');
  equal(first.transaction.verifier.length, 43, '32 random PKCE bytes encode to 43 characters');
  equal(first.challenge.length, 43, 'SHA-256 challenge encodes to 43 characters');
  equal(consumeAuthTransaction(first.transaction.state, 1_002)?.returnPath, '/account', 'first transaction is recovered');
  equal(consumeAuthTransaction(first.transaction.state, 1_003), null, 'transactions are consumed only once');
  equal(consumeAuthTransaction(second.transaction.state, 1_002)?.returnPath, '/settings', 'parallel transaction survives');

  const stale: AuthTransaction = {
    state: 's'.repeat(43),
    nonce: 'n'.repeat(43),
    verifier: 'v'.repeat(43),
    returnPath: '/',
    createdAt: 1_000,
  };
  saveAuthTransaction(stale);
  equal(consumeAuthTransaction(stale.state, 1_000 + 10 * 60_000 + 1), null, 'stale transactions expire');
} finally {
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: originalSessionStorage,
  });
}

const firstPkce = await createPkcePair();
const secondPkce = await createPkcePair();
assert(/^[A-Za-z0-9_-]{43}$/.test(firstPkce.verifier), 'verifier uses unpadded Base64URL');
assert(/^[A-Za-z0-9_-]{43}$/.test(firstPkce.challenge), 'challenge uses unpadded Base64URL');
assert(firstPkce.verifier !== secondPkce.verifier, 'PKCE verifiers are not reused');

const coordinator = new RefreshCoordinator();
let refreshRuns = 0;
let finishRefresh = (_result: boolean): void => { throw new Error('refresh did not start'); };
const refresh = () => {
  refreshRuns += 1;
  return new Promise<boolean>((resolve) => { finishRefresh = resolve; });
};
const retryPolicy = {
  canReplay: true,
  shouldRefresh: (response: Response) => response.status === 401
    && response.headers.get('x-session-error') === 'expired',
};
const makeRequest = () => {
  let attempts = 0;
  return () => Promise.resolve(++attempts === 1
    ? new Response('expired', { status: 401, headers: { 'x-session-error': 'expired' } })
    : new Response('ok'));
};

const requestA = fetchWithOneRefresh(makeRequest(), coordinator, refresh, retryPolicy);
const requestB = fetchWithOneRefresh(makeRequest(), coordinator, refresh, retryPolicy);
await Promise.resolve();
await Promise.resolve();
equal(refreshRuns, 1, 'concurrent 401 responses should share one refresh');
finishRefresh(true);
equal((await requestA).status, 200, 'first request should replay once');
equal((await requestB).status, 200, 'second request should replay once');

let unsafeRefreshRuns = 0;
const unsafeMutation = await fetchWithOneRefresh(
  () => Promise.resolve(new Response('expired', { status: 401, headers: { 'x-session-error': 'expired' } })),
  coordinator,
  () => { unsafeRefreshRuns += 1; return Promise.resolve(true); },
  { ...retryPolicy, canReplay: false },
);
equal(unsafeMutation.status, 401, 'an unsafe mutation should return its original response');
equal(unsafeRefreshRuns, 0, 'an unsafe mutation should not enter the automatic refresh/replay path');

deepEqual(parseSessionEvent({ version: 1, type: 'signed-out', at: 123 }), {
  version: 1,
  type: 'signed-out',
  at: 123,
}, 'valid cross-tab session event should parse');
equal(parseSessionEvent({ version: 1, type: 'signed-out', at: Number.NaN }), null,
  'non-finite cross-tab timestamps should fail closed');

console.log('auth session runtime examples passed');
