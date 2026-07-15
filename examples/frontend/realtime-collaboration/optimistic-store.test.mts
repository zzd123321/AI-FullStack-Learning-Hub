import assert from 'node:assert/strict';
import {
  confirmServerDocument,
  enqueueCommand,
  initializeOptimisticState,
  rejectCommand,
} from './optimistic-store.ts';

const document = { id: 'doc-1', title: 'A', status: 'draft', revision: 1 } as const;
const first = {
  type: 'command', protocolVersion: 1, commandId: 'c1', documentId: 'doc-1',
  baseRevision: 1, patch: { type: 'set-title', title: 'B' },
} as const;
const second = {
  type: 'command', protocolVersion: 1, commandId: 'c2', documentId: 'doc-1',
  baseRevision: 1, patch: { type: 'set-status', status: 'published' },
} as const;

let state = enqueueCommand(initializeOptimisticState(document), first);
state = enqueueCommand(state, second);
assert.deepEqual({ title: state.visible.title, status: state.visible.status }, {
  title: 'B', status: 'published',
});
state = confirmServerDocument(state, { ...document, title: 'B!', revision: 2 }, 'c1');
assert.equal(state.visible.title, 'B!');
assert.equal(state.visible.status, 'published');
state = rejectCommand(state, 'c2', { ...document, title: 'B!', revision: 2 }, 'forbidden');
assert.equal(state.visible.status, 'draft');
assert.equal(state.lastError, 'forbidden');

console.log('optimistic store examples passed');
