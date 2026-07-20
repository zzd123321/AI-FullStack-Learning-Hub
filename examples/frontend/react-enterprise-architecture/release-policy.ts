export interface ReleaseHealth {
  readonly sampleCount: number;
  readonly errorRate: number;
  readonly p75LcpMs: number;
  readonly p75InpMs: number;
}

export interface ReleaseThresholds {
  readonly minimumSamples: number;
  readonly maximumErrorRate: number;
  readonly maximumP75LcpMs: number;
  readonly maximumP75InpMs: number;
}

export type ReleaseDecision = "collect-more-data" | "continue" | "pause" | "rollback";

export function evaluateRelease(
  health: ReleaseHealth,
  thresholds: ReleaseThresholds,
): ReleaseDecision {
  // 小样本波动很大：先收集数据，不把偶然的 0 个错误当作发布成功。
  if (health.sampleCount < thresholds.minimumSamples) return "collect-more-data";
  // 严重错误率越界直接回滚；其余性能/体验越界先暂停扩大流量并调查。
  if (health.errorRate > thresholds.maximumErrorRate * 2) return "rollback";
  if (
    health.errorRate > thresholds.maximumErrorRate ||
    health.p75LcpMs > thresholds.maximumP75LcpMs ||
    health.p75InpMs > thresholds.maximumP75InpMs
  ) {
    return "pause";
  }
  return "continue";
}
