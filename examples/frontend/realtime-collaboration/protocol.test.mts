import assert from 'node:assert/strict';
import { parseServerEvent } from './protocol.ts';

const document = { id: 'doc-1', title: '课程', status: 'draft', revision: 2 };

assert.equal(parseServerEvent(JSON.stringify({
  type: 'document-changed',
  protocolVersion: 1,
  streamSequence: 8,
  commandId: 'command-1',
  document,
})).type, 'document-changed');

// Presence 使用自己的版本，不占用持久文档流的 sequence。
assert.equal(parseServerEvent(JSON.stringify({
  type: 'presence',
  protocolVersion: 1,
  clientId: 'client-1',
  displayName: 'Ada',
  presenceVersion: 3,
  expiresAt: 2_000,
})).type, 'presence');

assert.throws(
  () => parseServerEvent(JSON.stringify({
    type: 'document-changed', protocolVersion: 1, streamSequence: 9, commandId: null,
    document: { ...document, revision: 'wrong' },
  })),
  /document-changed/,
);
assert.throws(
  () => parseServerEvent('{"type":"unknown","protocolVersion":1}'),
  /Unknown realtime event type/,
);

console.log('realtime protocol contract tests passed');
