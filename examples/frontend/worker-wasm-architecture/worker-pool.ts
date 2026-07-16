export async function mapWithConcurrency<T, R>(
  items: readonly T[], concurrency: number, run: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError('Invalid concurrency');
  const results = new Array<R>(items.length);
  let cursor = 0;
  let failure: unknown;
  let failed = false;
  await Promise.all(Array.from({ length: Math.min(items.length, concurrency) }, async () => {
    while (!failed && cursor < items.length) {
      const index = cursor++;
      try { results[index] = await run(items[index] as T, index); }
      catch (error) { failed = true; failure = error; }
    }
  }));
  if (failed) throw failure;
  return results;
}
