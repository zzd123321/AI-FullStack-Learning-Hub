interface LongFrameEntry extends PerformanceEntry {
  readonly blockingDuration?: number;
  readonly firstUIEventTimestamp?: number;
  readonly renderStart?: number;
  readonly styleAndLayoutStart?: number;
}

export interface MainThreadSample {
  readonly entryType: 'long-animation-frame' | 'longtask';
  readonly startTime: number;
  readonly duration: number;
  readonly blockingDuration: number;
  readonly containsInteraction: boolean;
  readonly renderDuration: number;
}

function toSample(entry: LongFrameEntry): MainThreadSample {
  const endTime = entry.startTime + entry.duration;
  const renderStart = entry.renderStart ?? endTime;
  return {
    entryType: entry.entryType as MainThreadSample['entryType'],
    startTime: Math.round(entry.startTime),
    duration: Math.round(entry.duration),
    blockingDuration: Math.round(entry.blockingDuration ?? Math.max(0, entry.duration - 50)),
    containsInteraction: (entry.firstUIEventTimestamp ?? 0) > 0,
    renderDuration: Math.round(Math.max(0, endTime - renderStart)),
  };
}

export function observeWorstMainThreadFrames(
  report: (samples: readonly MainThreadSample[]) => void,
): () => void {
  if (typeof PerformanceObserver === 'undefined') return () => undefined;

  const supported = PerformanceObserver.supportedEntryTypes;
  const entryType = supported.includes('long-animation-frame')
    ? 'long-animation-frame'
    : supported.includes('longtask')
      ? 'longtask'
      : undefined;

  if (!entryType) return () => undefined;

  let worst: MainThreadSample[] = [];
  const observer = new PerformanceObserver((list) => {
    worst = [...worst, ...list.getEntries().map((entry) => toSample(entry))]
      .sort((left, right) => right.duration - left.duration)
      .slice(0, 5);
  });
  observer.observe({ type: entryType, buffered: true });

  const flush = () => {
    if (worst.length === 0) return;
    report(worst);
    worst = [];
  };
  const flushWhenHidden = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  document.addEventListener('visibilitychange', flushWhenHidden);

  return () => {
    flush();
    observer.disconnect();
    document.removeEventListener('visibilitychange', flushWhenHidden);
  };
}
