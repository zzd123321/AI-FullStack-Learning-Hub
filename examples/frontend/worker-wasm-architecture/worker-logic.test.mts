import assert from 'node:assert/strict';
import { cooperativeSum } from './cooperative-sum.ts';
import { parseComputeRequest, parseComputeResponse } from './task-protocol.ts';
import { mapWithConcurrency } from './worker-pool.ts';

assert.equal(await cooperativeSum(new Float64Array([1, 2, 3]), () => false, 2), 6);
assert.equal(parseComputeRequest({ version: 1, id: 'a', type: 'sum', values: new Float64Array(1) })?.type, 'sum');
assert.equal(parseComputeRequest({ version: 1, id: 'a', type: 'sum', values: [1] }), null);
assert.equal(parseComputeRequest({ version: 1, id: '', type: 'cancel', targetId: 'a' }), null);
assert.equal(parseComputeResponse({ version: 1, id: 'a', ok: true, result: Number.NaN }), null);
assert.deepEqual(await mapWithConcurrency([3, 1, 2], 2, async (value) => value * 2), [6, 2, 4]);
console.log('worker computation examples passed');
