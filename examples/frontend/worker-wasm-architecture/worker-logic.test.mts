import assert from 'node:assert/strict';
import { cooperativeSum } from './cooperative-sum.ts';
import { isComputeRequest } from './task-protocol.ts';
import { mapWithConcurrency } from './worker-pool.ts';

assert.equal(await cooperativeSum(new Float64Array([1, 2, 3]), () => false, 2), 6);
assert.equal(isComputeRequest({ version: 1, id: 'a', type: 'sum', values: new Float64Array(1) }), true);
assert.equal(isComputeRequest({ version: 1, id: 'a', type: 'sum', values: [1] }), false);
assert.deepEqual(await mapWithConcurrency([3, 1, 2], 2, async (value) => value * 2), [6, 2, 4]);
console.log('worker computation examples passed');
