import assert from 'node:assert/strict';
import { increment, merge, value } from './g-counter-crdt.ts';
import { PresenceStore } from './presence-store.ts';
import { nextReconnectDelay, shouldReconnect } from './reconnect-policy.ts';

const replicaA = increment({}, 'a', 2);
const replicaB = increment({}, 'b', 3);
const ab = merge(replicaA, replicaB);
assert.deepEqual(merge(replicaB, replicaA), ab);
assert.deepEqual(merge(ab, ab), ab);
assert.equal(value(ab), 5);
assert.throws(() => merge({ a: -1 }, replicaB), TypeError);
assert.throws(() => increment({}, '', 1), TypeError);

const policy = { baseDelayMs: 1_000, maximumDelayMs: 30_000, maximumAttempts: 5 };
assert.equal(nextReconnectDelay(0, policy, () => 0.5), 500);
assert.equal(nextReconnectDelay(4, policy, () => 1), 16_000);
assert.equal(nextReconnectDelay(5, policy, () => 0.5), null);
assert.equal(shouldReconnect(1006), true);
assert.equal(shouldReconnect(1000), false);
assert.throws(
  () => nextReconnectDelay(0, { ...policy, baseDelayMs: -1 }, Math.random),
  RangeError,
);

const presence = new PresenceStore();
presence.update({
  clientId: 'client-1', displayName: 'Ada', cursor: null, presenceVersion: 2, expiresAt: 2_000,
});
// 晚到的旧版本即使过期时间更晚，也不能把旧光标重新写回来。
presence.update({
  clientId: 'client-1', displayName: 'Ada', cursor: { x: 1, y: 2 },
  presenceVersion: 1, expiresAt: 3_000,
});
assert.equal(presence.activeAt(1_500)[0]?.cursor, null);
assert.deepEqual(presence.activeAt(2_000), []);

console.log('CRDT and reconnect examples passed');
