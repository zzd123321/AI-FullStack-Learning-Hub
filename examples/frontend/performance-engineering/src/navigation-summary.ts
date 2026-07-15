export interface NavigationSummary {
  readonly dns: number;
  readonly connection: number;
  readonly tls: number;
  readonly requestToFirstByte: number;
  readonly responseDownload: number;
  readonly domInteractive: number;
  readonly transferredBytes: number;
  readonly serverTiming: Readonly<Record<string, number>>;
}

function duration(end: number, start: number): number {
  return Math.round(Math.max(0, end - start));
}

export function readNavigationSummary(): NavigationSummary | undefined {
  const navigation = performance.getEntriesByType('navigation')[0] as
    | PerformanceNavigationTiming
    | undefined;
  if (!navigation) return undefined;

  return {
    dns: duration(navigation.domainLookupEnd, navigation.domainLookupStart),
    connection: duration(navigation.connectEnd, navigation.connectStart),
    tls:
      navigation.secureConnectionStart > 0
        ? duration(navigation.connectEnd, navigation.secureConnectionStart)
        : 0,
    requestToFirstByte: duration(navigation.responseStart, navigation.requestStart),
    responseDownload: duration(navigation.responseEnd, navigation.responseStart),
    domInteractive: Math.round(navigation.domInteractive),
    transferredBytes: navigation.transferSize,
    serverTiming: Object.fromEntries(
      navigation.serverTiming.map((metric) => [metric.name, Math.round(metric.duration)]),
    ),
  };
}
