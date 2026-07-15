export interface HttpFailure extends Error {
  readonly status?: number;
}

export function isRetryableUploadError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return false;
  if (!(error instanceof Error)) return false;
  const status = (error as HttpFailure).status;
  return status === undefined || status === 408 || status === 429 || status >= 500;
}

export function backoffDelay(attempt: number, baseMs = 500, random = Math.random): number {
  const ceiling = Math.min(30_000, baseMs * 2 ** attempt);
  return Math.floor(random() * ceiling);
}

export async function wait(ms: number, signal: AbortSignal): Promise<void> {
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
