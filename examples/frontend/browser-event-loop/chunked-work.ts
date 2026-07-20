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
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) {
    throw new RangeError("budgetMs must be a positive finite number");
  }
  const result: T[] = [];
  let sliceStartedAt = performance.now();

  for (let index = 0; index < values.length; index += 1) {
    options.signal?.throwIfAborted();
    const value = values[index];
    if (value !== undefined && predicate(value, index)) result.push(value);

    if (performance.now() - sliceStartedAt >= budgetMs) {
      // 只在时间片边界通知进度，避免每个元素都引发一次 UI 更新。
      options.onProgress?.(index + 1, values.length);
      // 这里必须 await；仅创建 Promise 不会暂停当前循环。
      await yieldToMain();
      sliceStartedAt = performance.now();
    }
  }

  options.onProgress?.(values.length, values.length);
  return result;
}
