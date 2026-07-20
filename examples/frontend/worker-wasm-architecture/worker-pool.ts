function abortError(reason?: unknown): Error {
  return reason instanceof Error ? reason : new DOMException('Operation aborted', 'AbortError');
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  run: (item: T, index: number, signal: AbortSignal) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError('Invalid concurrency');
  if (signal?.aborted) throw abortError(signal.reason);

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abortFromCaller, { once: true });

  const results = new Array<R>(items.length);
  let cursor = 0;
  let firstFailure: unknown;
  let hasFailure = false;

  try {
    await Promise.all(Array.from({ length: Math.min(items.length, concurrency) }, async () => {
      while (!controller.signal.aborted) {
        const index = cursor;
        if (index >= items.length) return;
        cursor += 1;

        try {
          results[index] = await run(items[index] as T, index, controller.signal);
        } catch (error) {
          // Stop assigning queued work and ask already-running tasks to abort.
          // Their run implementations must cooperate with the signal.
          if (!hasFailure) {
            hasFailure = true;
            firstFailure = error;
          }
          controller.abort(error);
        }
      }
    }));
  } finally {
    signal?.removeEventListener('abort', abortFromCaller);
  }

  if (hasFailure) throw firstFailure;
  if (signal?.aborted) throw abortError(signal.reason);
  return results;
}
