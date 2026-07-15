import assert from 'node:assert/strict';
import { planParts, weakFileFingerprint } from './chunk-plan.ts';
import { ProgressLedger } from './progress-ledger.ts';
import { initialUploadState, reduceUpload } from './upload-reducer.ts';

const parts = planParts(11, 4);
assert.deepEqual(parts.map(({ partNumber, start, end, size }) => ({ partNumber, start, end, size })), [
  { partNumber: 1, start: 0, end: 4, size: 4 },
  { partNumber: 2, start: 4, end: 8, size: 4 },
  { partNumber: 3, start: 8, end: 11, size: 3 },
]);

const ledger = new ProgressLedger(parts, new Set([1]));
assert.equal(ledger.total, 4);
assert.equal(ledger.update(2, 3), 7);
ledger.beginAttempt(2);
assert.equal(ledger.total, 4);
assert.equal(ledger.complete(2), 8);

let state = reduceUpload(initialUploadState, { type: 'select', totalBytes: 11 });
state = reduceUpload(state, { type: 'validated' });
state = reduceUpload(state, { type: 'session-created', uploadId: 'u1', assetId: 'a1' });
state = reduceUpload(state, { type: 'progress', uploadedBytes: 7 });
assert.equal(state.phase, 'uploading');
assert.equal(state.uploadedBytes, 7);
state = reduceUpload(state, { type: 'parts-uploaded' });
state = reduceUpload(state, { type: 'asset-processing' });
state = reduceUpload(state, { type: 'asset-ready' });
assert.equal(state.phase, 'completed');

assert.equal(weakFileFingerprint({ name: 'a.bin', size: 11, lastModified: 1 }), '["a.bin",11,1]');
console.log('file upload logic examples passed');
