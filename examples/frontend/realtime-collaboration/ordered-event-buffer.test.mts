import assert from 'node:assert/strict';
import { OrderedEventBuffer } from './ordered-event-buffer.ts';

const buffer = new OrderedEventBuffer<{ streamSequence: number; value: string }>(10);
assert.deepEqual(buffer.push({ streamSequence: 12, value: 'twelve' }), {
  type: 'buffered',
  missingFrom: 11,
  event: { streamSequence: 12, value: 'twelve' },
});
assert.deepEqual(buffer.push({ streamSequence: 11, value: 'eleven' }), {
  type: 'applied',
  events: [
    { streamSequence: 11, value: 'eleven' },
    { streamSequence: 12, value: 'twelve' },
  ],
});
assert.equal(buffer.push({ streamSequence: 12, value: 'duplicate' }).type, 'duplicate');

console.log('ordered event buffer examples passed');
