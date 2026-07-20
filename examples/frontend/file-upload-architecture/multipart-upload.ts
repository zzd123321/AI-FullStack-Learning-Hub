import { planParts } from './chunk-plan.js';
import { ProgressLedger } from './progress-ledger.js';
import { backoffDelay, isRetryableUploadError, wait } from './retry-policy.js';
import type { CompletedPart, UploadSession } from './types.js';

export interface MultipartApi {
  createUpload(file: Pick<File, 'name' | 'size' | 'type' | 'lastModified'>): Promise<UploadSession>;
  signPart(uploadId: string, partNumber: number): Promise<{
    readonly url: string;
    readonly headers?: Readonly<Record<string, string>>;
  }>;
  completeUpload(uploadId: string, parts: readonly CompletedPart[]): Promise<void>;
}

export type PartTransport = (request: {
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body: Blob;
  readonly signal: AbortSignal;
  readonly onProgress: (loadedBytes: number) => void;
}) => Promise<string>;

export interface MultipartOptions {
  readonly concurrency?: number;
  readonly maxRetries?: number;
  readonly signal: AbortSignal;
  readonly onProgress: (uploadedBytes: number, totalBytes: number) => void;
}

export class IncompleteUploadError extends Error {
  readonly session: UploadSession;

  constructor(session: UploadSession, options: ErrorOptions) {
    super('Multipart upload did not complete', options);
    this.session = session;
  }
}

async function runPool<T>(items: readonly T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  let failure: unknown;
  let hasFailed = false;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length && !hasFailed) {
      const item = items[cursor];
      cursor += 1;
      try {
        if (item !== undefined) await worker(item);
      } catch (error) {
        failure = error;
        hasFailed = true;
      }
    }
  }));
  if (hasFailed) throw failure;
}

export async function uploadMultipart(
  file: File,
  api: MultipartApi,
  transport: PartTransport,
  options: MultipartOptions,
): Promise<UploadSession> {
  const concurrency = options.concurrency ?? 3;
  const maxRetries = options.maxRetries ?? 3;
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError('Invalid concurrency');
  if (!Number.isSafeInteger(maxRetries) || maxRetries < 0) throw new RangeError('Invalid retry budget');
  options.signal.throwIfAborted();
  const session = await api.createUpload(file);
  const parts = planParts(file.size, session.partSize);
  const expectedPartNumbers = new Set(parts.map((part) => part.partNumber));
  const returnedPartNumbers = session.completedParts.map((part) => part.partNumber);
  if (
    session.uploadId === '' || session.assetId === ''
    || new Set(returnedPartNumbers).size !== returnedPartNumbers.length
    || session.completedParts.some((part) => (
      !expectedPartNumbers.has(part.partNumber) || typeof part.etag !== 'string' || part.etag === ''
    ))
  ) {
    throw new Error('Server returned an invalid upload session');
  }
  const completed = new Map(session.completedParts.map((part) => [part.partNumber, part]));
  const ledger = new ProgressLedger(parts, new Set(completed.keys()));
  options.onProgress(ledger.total, file.size);

  try {
    await runPool(parts.filter((part) => !completed.has(part.partNumber)), concurrency, async (part) => {
      for (let attempt = 0; ; attempt += 1) {
        options.signal.throwIfAborted();
        ledger.beginAttempt(part.partNumber);
        options.onProgress(ledger.total, file.size);
        try {
          const signed = await api.signPart(session.uploadId, part.partNumber);
          const etag = await transport({
            ...signed,
            body: file.slice(part.start, part.end),
            signal: options.signal,
            onProgress: (loaded) => options.onProgress(
              ledger.update(part.partNumber, loaded), file.size,
            ),
          });
          completed.set(part.partNumber, { partNumber: part.partNumber, etag });
          options.onProgress(ledger.complete(part.partNumber), file.size);
          return;
        } catch (error) {
          if (options.signal.aborted) throw options.signal.reason;
          if (attempt >= maxRetries || !isRetryableUploadError(error)) throw error;
          await wait(backoffDelay(attempt), options.signal);
        }
      }
    });
    const ordered = [...completed.values()].sort((a, b) => a.partNumber - b.partNumber);
    await api.completeUpload(session.uploadId, ordered);
    return { ...session, completedParts: ordered };
  } catch (error) {
    throw new IncompleteUploadError({
      ...session,
      completedParts: [...completed.values()].sort((a, b) => a.partNumber - b.partNumber),
    }, { cause: error });
  }
}
