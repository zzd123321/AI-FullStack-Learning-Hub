import assert from 'node:assert/strict';
import { createLinearScale } from './scales.ts';

const scale = createLinearScale({ min: 10, max: 20 }, { min: 0, max: 100 });
assert.equal(scale(15), 50);
assert.equal(scale.invert(75), 17.5);
assert.deepEqual(scale.ticks(3), [10, 15, 20]);

const reversed = createLinearScale({ min: 0, max: 10 }, { min: 100, max: 0 });
assert.equal(reversed(2.5), 75);
assert.throws(() => createLinearScale({ min: 1, max: 1 }, { min: 0, max: 1 }), RangeError);
assert.throws(() => createLinearScale({ min: 0, max: Number.NaN }, { min: 0, max: 1 }), TypeError);
assert.throws(() => scale(Number.NaN), TypeError);
assert.throws(() => scale.invert(Number.POSITIVE_INFINITY), TypeError);
assert.throws(() => scale.ticks(Number.NaN), TypeError);

console.log('scale examples passed');
