import assert from 'node:assert/strict';
import { flushOutbox, type MutationIntent, type OutboxStore } from './outbox.ts';

const records = new Map<string, MutationIntent>([
  ['a', { id: 'a', principalId: 'user-1', idempotencyKey: 'k-a', operation: 'save', payload: {}, createdAt: 1, attempts: 0, status: 'pending' }],
  ['b', { id: 'b', principalId: 'user-1', idempotencyKey: 'k-b', operation: 'save', payload: {}, createdAt: 2, attempts: 0, status: 'pending' }],
  ['other-user', { id: 'other-user', principalId: 'user-2', idempotencyKey: 'k-c', operation: 'save', payload: {}, createdAt: 0, attempts: 0, status: 'pending' }],
]);
const store: OutboxStore = {
  async list() { return [...records.values()]; },
  async put(intent) { records.set(intent.id, intent); },
  async delete(id) { records.delete(id); },
};
await flushOutbox(store, 'user-1', async (intent) => intent.id === 'a'
  ? { kind: 'success' }
  : { kind: 'retry', message: 'offline' });
assert.equal(records.has('a'), false);
assert.equal(records.get('b')?.attempts, 1);
assert.equal(records.get('b')?.status, 'pending');
assert.equal(records.get('other-user')?.attempts, 0);

records.delete('b');
records.set('exhausted', {
  id: 'exhausted', principalId: 'user-1', idempotencyKey: 'k-d', operation: 'save',
  payload: {}, createdAt: 3, attempts: 4, status: 'pending',
});
await flushOutbox(store, 'user-1', async () => ({ kind: 'retry', message: 'offline' }), 5);
assert.equal(records.get('exhausted')?.status, 'dead-letter');
console.log('PWA outbox examples passed');
