import assert from 'node:assert/strict';
import { canAccess } from './authorization.ts';
import { reduceAuth } from './auth-state.ts';
import {
  consumeAuthTransaction,
  normalizeReturnPath,
  saveAuthTransaction,
} from './auth-transaction.ts';

let state = reduceAuth({ phase: 'unknown' }, { type: 'session-found', userId: 'u1', permissions: ['lesson:read'] });
state = reduceAuth(state, { type: 'refresh-started' });
assert.equal(state.phase, 'refreshing');
assert.deepEqual(canAccess({ permissions: new Set(['lesson:read']), attributes: { tenant: 'a' } }, {
  permission: 'lesson:read', attribute: ['tenant', 'a'],
}), { allowed: true });
assert.equal(normalizeReturnPath('https://evil.example/steal', 'https://learn.example'), '/');
assert.equal(normalizeReturnPath('/lessons?tab=mine', 'https://learn.example'), '/lessons?tab=mine');
assert.equal(normalizeReturnPath('https://[invalid', 'https://learn.example'), '/');
assert.equal(normalizeReturnPath(`/${'a'.repeat(2_048)}`, 'https://learn.example'), '/');

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

const transaction = {
  state: 'expected-state', nonce: 'nonce', verifier: 'verifier',
  returnPath: '/account', createdAt: 1_000,
};
saveAuthTransaction(transaction);
assert.deepEqual(consumeAuthTransaction('expected-state', 1_001), transaction);
saveAuthTransaction({ ...transaction, createdAt: 2_000 });
assert.equal(consumeAuthTransaction('expected-state', 1_000), null);
saveAuthTransaction(transaction);
assert.equal(consumeAuthTransaction('wrong-state', 1_001), null);

Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: originalSessionStorage,
});
console.log('auth session examples passed');
