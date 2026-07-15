import assert from 'node:assert/strict';
import { detectKind } from './file-policy.ts';
import { backoffDelay, isRetryableUploadError } from './retry-policy.ts';

assert.equal(await detectKind(new Blob([new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])])), 'png');
assert.equal(await detectKind(new Blob(['plain text'])), 'unknown');

assert.equal(isRetryableUploadError(Object.assign(new Error('busy'), { status: 503 })), true);
assert.equal(isRetryableUploadError(Object.assign(new Error('forbidden'), { status: 403 })), false);
assert.equal(backoffDelay(2, 500, () => 0.5), 1000);
console.log('file detection and retry examples passed');
