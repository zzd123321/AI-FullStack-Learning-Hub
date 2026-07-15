import assert from 'node:assert/strict';
import { increment, merge, value } from './g-counter-crdt.ts';
import { nextReconnectDelay, shouldReconnect } from './reconnect-policy.ts';

const replicaA = increment({}, 'a', 2);
const replicaB = increment({}, 'b', 3);
const ab = merge(replicaA, replicaB);
assert.deepEqual(merge(replicaB, replicaA), ab);
assert.deepEqual(merge(ab, ab), ab);
assert.equal(value(ab), 5);

const policy = { baseDelayMs: 1_000, maximumDelayMs: 30_000, maximumAttempts: 5 };
assert.equal(nextReconnectDelay(0, policy, () => 0.5), 500);
assert.equal(nextReconnectDelay(4, policy, () => 1), 16_000);
assert.equal(nextReconnectDelay(5, policy, () => 0.5), null);
assert.equal(shouldReconnect(1006), true);
assert.equal(shouldReconnect(1000), false);

console.log('CRDT and reconnect examples passed');
