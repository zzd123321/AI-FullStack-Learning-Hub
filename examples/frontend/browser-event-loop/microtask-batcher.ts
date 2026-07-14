export interface MicrotaskBatcher<T> {
  add(value: T): void;
  dispose(): void;
}

export function createMicrotaskBatcher<T>(flush: (values: readonly T[]) => void): MicrotaskBatcher<T> {
  let values: T[] = [];
  let scheduled = false;
  let disposed = false;

  const run = () => {
    scheduled = false;
    if (disposed || values.length === 0) return;
    const current = values;
    values = [];
    flush(current);
  };

  return {
    add(value) {
      if (disposed) throw new Error("Batcher has been disposed");
      values.push(value);
      if (!scheduled) {
        scheduled = true;
        queueMicrotask(run);
      }
    },
    dispose() {
      disposed = true;
      values = [];
    },
  };
}
