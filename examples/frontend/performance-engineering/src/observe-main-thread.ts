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

interface ObserverCallbackOptions {
  readonly droppedEntriesCount?: number;
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
  report: (samples: readonly MainThreadSample[], droppedEntriesCount: number) => void,
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
  let droppedEntriesCount = 0;
  // 浏览器已经会传第三个 options 参数，但较旧的 TypeScript DOM 声明只写了两个参数。
  const callback = (
    list: PerformanceObserverEntryList,
    _observer: PerformanceObserver,
    options?: ObserverCallbackOptions,
  ) => {
    // 浏览器时间线缓冲区有上限；丢失数量决定这批诊断数据是否可信。
    droppedEntriesCount += options?.droppedEntriesCount ?? 0;
    worst = [...worst, ...list.getEntries().map((entry) => toSample(entry))]
      .sort((left, right) => right.duration - left.duration)
      .slice(0, 5);
  };
  const observer = new PerformanceObserver(callback);
  observer.observe({ type: entryType, buffered: true });

  const flush = () => {
    if (worst.length === 0 && droppedEntriesCount === 0) return;
    report(worst, droppedEntriesCount);
    worst = [];
    droppedEntriesCount = 0;
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
