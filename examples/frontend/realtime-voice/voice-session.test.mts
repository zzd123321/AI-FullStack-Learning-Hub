import assert from 'node:assert/strict';
import { float32ToPcm16 } from './pcm16.ts';
import { adaptRealtimeEvent } from './realtime-event-adapter.ts';
import { initialVoiceState, reduceVoiceSession } from './voice-session-reducer.ts';

let state = reduceVoiceSession(initialVoiceState, { type: 'request-permission' });
state = reduceVoiceSession(state, { type: 'permission-granted' });
state = reduceVoiceSession(state, adaptRealtimeEvent(JSON.stringify({
  type: 'session.created', session: { id: 's1' },
}))!);
state = reduceVoiceSession(state, { type: 'speech-started' });
assert.equal(state.phase, 'user-speaking');
state = reduceVoiceSession(state, { type: 'speech-stopped' });
state = reduceVoiceSession(state, { type: 'response-started', responseId: 'r1' });
state = reduceVoiceSession(state, { type: 'response-item-created', itemId: 'i1' });
assert.equal(state.phase, 'assistant-thinking');
state = reduceVoiceSession(state, { type: 'audio-started' });
assert.equal(state.phase, 'assistant-speaking');
state = reduceVoiceSession(state, { type: 'audio-playback-blocked' });
assert.equal(state.audioPlaybackBlocked, true);
state = reduceVoiceSession(state, { type: 'audio-started' });
assert.equal(state.audioPlaybackBlocked, false);
state = reduceVoiceSession(state, { type: 'speech-started' });
assert.equal(state.phase, 'interrupting');

assert.deepEqual(adaptRealtimeEvent(JSON.stringify({
  type: 'response.output_item.added', item: { type: 'message', id: 'i2' },
})), { type: 'response-item-created', itemId: 'i2' });

assert.deepEqual([...float32ToPcm16(new Float32Array([-2, -1, 0, 1, 2]))], [
  -32768, -32768, 0, 32767, 32767,
]);
assert.deepEqual([...float32ToPcm16(new Float32Array([Number.NaN, Infinity]))], [0, 0]);

const active = state;
const afterOtherResponse = reduceVoiceSession(active, { type: 'response-ended', responseId: 'other' });
assert.equal(afterOtherResponse, active);
console.log('voice session examples passed');
