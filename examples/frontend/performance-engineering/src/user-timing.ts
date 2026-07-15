let sequence = 0;

export async function measureOperation<T>(
  name: string,
  operation: () => T | Promise<T>,
): Promise<T> {
  const id = ++sequence;
  const start = `${name}:${id}:start`;
  const end = `${name}:${id}:end`;

  performance.mark(start);
  try {
    return await operation();
  } finally {
    performance.mark(end);
    performance.measure(name, start, end);
    performance.clearMarks(start);
    performance.clearMarks(end);
  }
}

export function observeApplicationMeasures(
  report: (name: string, duration: number) => void,
): () => void {
  if (typeof PerformanceObserver === 'undefined') return () => undefined;
  if (!PerformanceObserver.supportedEntryTypes.includes('measure')) return () => undefined;

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) report(entry.name, entry.duration);
  });
  observer.observe({ type: 'measure', buffered: true });

  return () => observer.disconnect();
}
