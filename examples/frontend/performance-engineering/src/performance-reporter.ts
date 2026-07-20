export type VitalName = 'LCP' | 'INP' | 'CLS';
export type VitalRating = 'good' | 'needs-improvement' | 'poor';

export interface VitalPayload {
  readonly id: string;
  readonly name: VitalName;
  readonly value: number;
  readonly delta: number;
  readonly rating: VitalRating;
  readonly navigationType: string;
  readonly route: string;
  readonly generatedAt: string;
  readonly attribution?: Readonly<Record<string, number>>;
}

export interface MetricLike {
  readonly id: string;
  readonly name: VitalName;
  readonly value: number;
  readonly delta: number;
  readonly rating: VitalRating;
  readonly navigationType: string;
  readonly attribution?: object;
}

interface ReporterOptions {
  readonly endpoint: string;
  /** 使用路由模板，例如 `/courses/:courseId`，不要传入含用户数据的完整 URL。 */
  readonly route: string;
  readonly sampleRate: number;
}

// 只收集已经过隐私审查、可直接聚合的阶段耗时。
// 不上传 DOM selector、URL、Event Entry 或脚本调用栈。
const NUMERIC_ATTRIBUTION_FIELDS = new Set([
  'timeToFirstByte',
  'resourceLoadDelay',
  'resourceLoadDuration',
  'elementRenderDelay',
  'interactionTime',
  'inputDelay',
  'processingDuration',
  'presentationDelay',
  'totalScriptDuration',
  'totalStyleAndLayoutDuration',
  'totalPaintDuration',
  'totalUnattributedDuration',
  'largestShiftTime',
  'largestShiftValue',
]);

function selectNumericAttribution(attribution: object | undefined): Record<string, number> | undefined {
  if (!attribution) return undefined;

  const selected = Object.fromEntries(
    Object.entries(attribution).filter(
      (entry): entry is [string, number] =>
        NUMERIC_ATTRIBUTION_FIELDS.has(entry[0]) &&
        typeof entry[1] === 'number' &&
        Number.isFinite(entry[1]),
    ),
  );
  return Object.keys(selected).length > 0 ? selected : undefined;
}

function transmit(endpoint: string, payload: VitalPayload): void {
  const body = JSON.stringify(payload);
  if (navigator.sendBeacon?.(endpoint, new Blob([body], { type: 'application/json' }))) return;

  void fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
    credentials: 'same-origin',
  }).catch(() => {
    // 性能遥测不能阻塞用户流程；发送失败率应由独立的可观测性机制监控。
  });
}

export function createVitalReporter(options: ReporterOptions): (metric: MetricLike) => void {
  if (!Number.isFinite(options.sampleRate) || options.sampleRate < 0 || options.sampleRate > 1) {
    throw new RangeError('sampleRate must be a finite number between 0 and 1');
  }

  // 一次页面访问只抽样一次，三个指标才能作为同一次体验关联分析。
  const sampled = Math.random() < options.sampleRate;

  return (metric) => {
    if (!sampled) return;

    const attribution = selectNumericAttribution(metric.attribution);

    transmit(options.endpoint, {
      id: metric.id,
      name: metric.name,
      value: metric.value,
      delta: metric.delta,
      rating: metric.rating,
      navigationType: metric.navigationType,
      route: options.route,
      generatedAt: new Date().toISOString(),
      ...(attribution ? { attribution } : {}),
    });
  };
}
