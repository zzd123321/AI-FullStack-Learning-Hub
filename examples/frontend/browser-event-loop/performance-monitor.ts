export interface PerformanceRecord {
  readonly type: string;
  readonly name: string;
  readonly startTime: number;
  readonly duration: number;
}

const WANTED_ENTRY_TYPES = ["longtask", "long-animation-frame", "event", "measure"] as const;

export function startPerformanceMonitor(
  report: (record: PerformanceRecord) => void,
): () => void {
  const supported = new Set(PerformanceObserver.supportedEntryTypes);
  const observers: PerformanceObserver[] = [];

  for (const type of WANTED_ENTRY_TYPES) {
    if (!supported.has(type)) continue;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        report({
          type: entry.entryType,
          name: entry.name,
          startTime: entry.startTime,
          duration: entry.duration,
        });
      }
    });
    observer.observe({ type, buffered: true });
    observers.push(observer);
  }

  return () => observers.forEach((observer) => observer.disconnect());
}
