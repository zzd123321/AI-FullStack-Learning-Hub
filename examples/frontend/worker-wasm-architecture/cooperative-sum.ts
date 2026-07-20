export async function cooperativeSum(
  values: Float64Array,
  isCancelled: () => boolean,
  chunkSize = 50_000,
): Promise<number> {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) throw new RangeError('Invalid chunk size');
  let total = 0;
  for (let start = 0; start < values.length; start += chunkSize) {
    if (isCancelled()) throw new DOMException('Task cancelled', 'AbortError');
    const end = Math.min(start + chunkSize, values.length);
    for (let index = start; index < end; index += 1) total += values[index] ?? 0;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  // Cancellation may arrive during the final yield, after the last chunk was
  // computed but before the result is published.
  if (isCancelled()) throw new DOMException('Task cancelled', 'AbortError');
  return total;
}
