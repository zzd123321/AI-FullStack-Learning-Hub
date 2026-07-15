import assert from 'node:assert/strict';
import { confirmedTranscript, upsertTranscript } from './transcript-store.ts';

let segments = upsertTranscript([], { id: 'u1', speaker: 'user', status: 'partial', text: '你' });
segments = upsertTranscript(segments, { id: 'u1', speaker: 'user', status: 'final', text: '你好' });
segments = upsertTranscript(segments, { id: 'u1', speaker: 'user', status: 'partial', text: '旧结果' });
segments = upsertTranscript(segments, { id: 'a1', speaker: 'assistant', status: 'partial', text: '你好！' });
assert.equal(segments[0]?.text, '你好');
assert.equal(confirmedTranscript(segments), 'user: 你好');
console.log('transcript store examples passed');
