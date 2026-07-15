import assert from 'node:assert/strict';
import { RingBuffer } from './stream-buffer.ts';

const buffer = new RingBuffer<number>(3);
buffer.push(1);
buffer.push(2);
assert.deepEqual(buffer.snapshot(), [1, 2]);
buffer.push(3);
buffer.push(4);
assert.deepEqual(buffer.snapshot(), [2, 3, 4]);
assert.throws(() => new RingBuffer(0), RangeError);

console.log('stream buffer examples passed');
