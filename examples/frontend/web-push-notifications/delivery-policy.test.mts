import assert from 'node:assert/strict';
import { decideDelivery } from './delivery-policy.ts';
import { classifyPushServiceResponse } from './delivery-result.ts';

const preferences = {
  enabledCategories: new Set(['message', 'task'] as const),
  quietHours: { startHour: 22, endHour: 7 },
};
assert.deepEqual(decideDelivery('message', 23, preferences), { send: false, reason: 'quiet-hours' });
assert.deepEqual(decideDelivery('system', 12, preferences), { send: false, reason: 'category-disabled' });
assert.deepEqual(decideDelivery('task', 12, preferences), { send: true });
assert.deepEqual(classifyPushServiceResponse(410), { kind: 'delete-subscription' });
assert.deepEqual(classifyPushServiceResponse(429, 3), { kind: 'retry', retryAfterMs: 3000 });
console.log('web push delivery policy examples passed');
