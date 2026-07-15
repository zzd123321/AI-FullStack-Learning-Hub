import assert from 'node:assert/strict';
import { initialGenerationState, reduceGeneration } from './task-reducer.ts';

let state = reduceGeneration(initialGenerationState, { type: 'submit', requestId: 'r1', at: 10 });
state = reduceGeneration(state, { type: 'started', requestId: 'r1' });
state = reduceGeneration(state, { type: 'text-delta', requestId: 'r1', delta: '你' });
state = reduceGeneration(state, { type: 'text-delta', requestId: 'r1', delta: '好' });
assert.deepEqual(state.parts, [{ type: 'text', text: '你好' }]);

const stale = reduceGeneration(state, { type: 'text-delta', requestId: 'old', delta: '错误' });
assert.equal(stale, state);
state = reduceGeneration(state, {
  type: 'tool-call', requestId: 'r1', callId: 'call-1', name: 'search_courses',
});
assert.equal(state.status, 'waiting-tool');
state = reduceGeneration(state, { type: 'cancel', requestId: 'r1', at: 20 });
assert.equal(state.status, 'cancelled');
const afterCancel = reduceGeneration(state, { type: 'text-delta', requestId: 'r1', delta: '迟到' });
assert.equal(afterCancel, state);

console.log('task reducer examples passed');
