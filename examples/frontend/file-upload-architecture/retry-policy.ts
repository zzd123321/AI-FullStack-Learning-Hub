export interface HttpFailure extends Error {
  readonly status?: number;
}

export function isRetryableUploadError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return false;
  if (!(error instanceof Error)) return false;
  const status = (error as HttpFailure).status;
  if (typeof status === 'number') return status === 408 || status === 429 || status >= 500;
  // Fetch/XHR adapters should normalize genuine transport failures to
  // TypeError. A generic Error often means a deterministic protocol problem
  // such as a missing ETag, which retrying cannot repair.
  return error instanceof TypeError;
}

export function backoffDelay(attempt: number, baseMs = 500, random = Math.random): number {
  if (!Number.isSafeInteger(attempt) || attempt < 0) throw new RangeError('Invalid retry attempt');
  if (!Number.isFinite(baseMs) || baseMs < 0) throw new RangeError('Invalid retry base delay');
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample > 1) throw new RangeError('Invalid random sample');
  const ceiling = Math.min(30_000, baseMs * 2 ** attempt);
  return Math.floor(sample * ceiling);
}

export async function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (!Number.isFinite(ms) || ms < 0) throw new RangeError('Invalid wait duration');
  if (signal.aborted) throw signal.reason;
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener('abort', abort);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}
