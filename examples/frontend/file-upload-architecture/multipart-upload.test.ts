import { uploadMultipart } from './multipart-upload.js';

const assert = {
  equal(actual: unknown, expected: unknown) {
    if (!Object.is(actual, expected)) throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  },
  ok(condition: unknown) {
    if (!condition) throw new Error('Expected condition to be truthy');
  },
  deepEqual(actual: unknown, expected: unknown) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Values are not deeply equal');
  },
  fail(message: string): never {
    throw new Error(message);
  },
  async rejects(run: () => Promise<unknown>, pattern: RegExp) {
    try {
      await run();
    } catch (error) {
      if (error instanceof Error && pattern.test(error.message)) return;
      throw error;
    }
    throw new Error('Expected promise to reject');
  },
};

const file = new File(['abcdefghij'], 'sample.bin', { type: 'application/octet-stream' });
const signed: number[] = [];
const attempts = new Map<number, number>();
const completedRequests: unknown[] = [];
const progress: number[] = [];
let activeTransports = 0;
let maximumActiveTransports = 0;

const session = await uploadMultipart(file, {
  async createUpload() {
    return {
      uploadId: 'upload-1',
      assetId: 'asset-1',
      partSize: 4,
      // Part 2 is authoritative server state and must not be sent again.
      completedParts: [{ partNumber: 2, etag: 'etag-2' }],
    };
  },
  async signPart(_uploadId, partNumber) {
    signed.push(partNumber);
    return { url: `https://upload.invalid/${partNumber}` };
  },
  async completeUpload(uploadId, parts) {
    completedRequests.push({ uploadId, parts });
  },
}, async ({ url, body, onProgress }) => {
  const partNumber = Number(url.split('/').at(-1));
  const attempt = (attempts.get(partNumber) ?? 0) + 1;
  attempts.set(partNumber, attempt);
  activeTransports += 1;
  maximumActiveTransports = Math.max(maximumActiveTransports, activeTransports);
  try {
    await Promise.resolve();
    if (partNumber === 1 && attempt === 1) throw new TypeError('temporary network failure');
    onProgress(body.size);
    return `etag-${partNumber}`;
  } finally {
    activeTransports -= 1;
  }
}, {
  concurrency: 2,
  maxRetries: 1,
  signal: new AbortController().signal,
  onProgress: (uploaded, total) => {
    assert.equal(total, file.size);
    assert.ok(uploaded >= 0 && uploaded <= total);
    progress.push(uploaded);
  },
});

assert.deepEqual(session.completedParts.map((part) => part.partNumber), [1, 2, 3]);
assert.deepEqual(signed.sort(), [1, 1, 3]);
assert.deepEqual(completedRequests, [{
  uploadId: 'upload-1',
  parts: [
    { partNumber: 1, etag: 'etag-1' },
    { partNumber: 2, etag: 'etag-2' },
    { partNumber: 3, etag: 'etag-3' },
  ],
}]);
assert.equal(progress.at(-1), file.size);
assert.equal(maximumActiveTransports, 2);

const signedBeforeFailure: number[] = [];
await assert.rejects(() => uploadMultipart(file, {
  async createUpload() {
    return { uploadId: 'upload-2', assetId: 'asset-2', partSize: 4, completedParts: [] };
  },
  async signPart(_uploadId, partNumber) {
    signedBeforeFailure.push(partNumber);
    return { url: `https://upload.invalid/${partNumber}` };
  },
  async completeUpload() {
    assert.fail('A failed upload must not be completed');
  },
}, async () => {
  throw new Error('deterministic protocol failure');
}, {
  concurrency: 1,
  maxRetries: 3,
  signal: new AbortController().signal,
  onProgress: () => undefined,
}), /did not complete/);
assert.deepEqual(signedBeforeFailure, [1]);

console.log('multipart upload examples passed');
