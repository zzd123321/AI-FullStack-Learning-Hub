export interface ResourceTimingRecord {
  readonly url: string;
  readonly protocol: string;
  readonly dnsMs: number;
  readonly connectMs: number;
  readonly tlsMs: number | null;
  readonly ttfbMs: number;
  readonly downloadMs: number;
  readonly transferBytes: number;
  readonly encodedBytes: number;
  readonly decodedBytes: number;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export function toResourceTimingRecord(entry: PerformanceResourceTiming): ResourceTimingRecord {
  return {
    url: entry.name,
    protocol: entry.nextHopProtocol || "unknown",
    dnsMs: round(entry.domainLookupEnd - entry.domainLookupStart),
    connectMs: round(entry.connectEnd - entry.connectStart),
    tlsMs: entry.secureConnectionStart > 0
      ? round(entry.connectEnd - entry.secureConnectionStart)
      : null,
    ttfbMs: round(entry.responseStart - entry.requestStart),
    downloadMs: round(entry.responseEnd - entry.responseStart),
    transferBytes: entry.transferSize,
    encodedBytes: entry.encodedBodySize,
    decodedBytes: entry.decodedBodySize,
  };
}

export function observeResources(report: (record: ResourceTimingRecord) => void): () => void {
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.entryType === "resource") {
        report(toResourceTimingRecord(entry as PerformanceResourceTiming));
      }
    }
  });
  observer.observe({ type: "resource", buffered: true });
  return () => observer.disconnect();
}
