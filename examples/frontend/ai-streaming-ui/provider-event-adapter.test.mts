import assert from 'node:assert/strict';
import { parseGenerationEvent } from './generation-events.ts';
import { adaptOpenAIEvent } from './provider-event-adapter.ts';

const requestId = 'request-1';

assert.deepEqual(adaptOpenAIEvent(JSON.stringify({
  type: 'response.output_text.delta',
  delta: '你好',
}), requestId), { type: 'text-delta', requestId, delta: '你好' });

// The item is only an announcement here: arguments are still streaming.
assert.equal(adaptOpenAIEvent(JSON.stringify({
  type: 'response.output_item.added',
  item: { type: 'function_call', call_id: 'call-1', name: 'search', arguments: '' },
}), requestId), null);

assert.deepEqual(adaptOpenAIEvent(JSON.stringify({
  type: 'response.output_item.done',
  item: {
    type: 'function_call',
    call_id: 'call-1',
    name: 'search',
    arguments: '{"query":"TypeScript"}',
  },
}), requestId), { type: 'tool-call', requestId, callId: 'call-1', name: 'search' });

assert.deepEqual(adaptOpenAIEvent(JSON.stringify({ type: 'error', error: { message: 'secret detail' } }), requestId, () => 42), {
  type: 'failed', requestId, code: 'provider_error', message: 'Generation failed', at: 42,
});

assert.deepEqual(parseGenerationEvent(JSON.stringify({
  type: 'completed', requestId, at: 100,
}), requestId), { type: 'completed', requestId, at: 100 });
assert.equal(parseGenerationEvent(JSON.stringify({
  type: 'text-delta', requestId: 'stale-request', delta: 'late',
}), requestId), null);
assert.throws(() => parseGenerationEvent(JSON.stringify({
  type: 'completed', requestId, at: 'not-a-timestamp',
}), requestId), /finite timestamp/);

console.log('provider adapter examples passed');
