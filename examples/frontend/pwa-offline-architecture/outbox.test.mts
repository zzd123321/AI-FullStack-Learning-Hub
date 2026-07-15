import assert from 'node:assert/strict';
import { flushOutbox, type MutationIntent, type OutboxStore } from './outbox.ts';

const records = new Map<string, MutationIntent>([
  ['a', { id: 'a', idempotencyKey: 'k-a', operation: 'save', payload: {}, createdAt: 1, attempts: 0, status: 'pending' }],
  ['b', { id: 'b', idempotencyKey: 'k-b', operation: 'save', payload: {}, createdAt: 2, attempts: 0, status: 'pending' }],
]);
const store: OutboxStore = {
  async list() { return [...records.values()]; },
  async put(intent) { records.set(intent.id, intent); },
  async delete(id) { records.delete(id); },
};
await flushOutbox(store, async (intent) => intent.id === 'a'
  ? { kind: 'success' }
  : { kind: 'retry', message: 'offline' });
assert.equal(records.has('a'), false);
assert.equal(records.get('b')?.attempts, 1);
assert.equal(records.get('b')?.status, 'pending');
console.log('PWA outbox examples passed');
