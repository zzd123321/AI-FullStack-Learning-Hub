import { yieldToMain } from "./yield-to-main.js";

export interface ChunkedWorkOptions {
  readonly budgetMs?: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (completed: number, total: number) => void;
}

export async function filterInChunks<T>(
  values: readonly T[],
  predicate: (value: T, index: number) => boolean,
  options: ChunkedWorkOptions = {},
): Promise<T[]> {
  const budgetMs = options.budgetMs ?? 8;
  const result: T[] = [];
  let sliceStartedAt = performance.now();

  for (let index = 0; index < values.length; index += 1) {
    options.signal?.throwIfAborted();
    const value = values[index];
    if (value !== undefined && predicate(value, index)) result.push(value);

    if (performance.now() - sliceStartedAt >= budgetMs) {
      options.onProgress?.(index + 1, values.length);
      await yieldToMain();
      sliceStartedAt = performance.now();
    }
  }

  options.onProgress?.(values.length, values.length);
  return result;
}
