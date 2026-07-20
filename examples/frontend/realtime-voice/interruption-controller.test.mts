import assert from 'node:assert/strict';
import { InterruptionController } from './interruption-controller.ts';

const sent: unknown[] = [];
const controller = new InterruptionController(
  {
    stopAndGetPlayedMs(itemId) {
      assert.equal(itemId, 'item-1');
      return 1_234.6;
    },
  },
  { send: (event) => sent.push(event) },
);

controller.markPlaybackStarted('item-1');
controller.interrupt();
controller.interrupt(); // Already cleared: repeated UI input is idempotent.

assert.deepEqual(sent, [
  { type: 'response.cancel' },
  {
    type: 'conversation.item.truncate',
    item_id: 'item-1',
    content_index: 0,
    audio_end_ms: 1_235,
  },
]);

console.log('interruption controller examples passed');
