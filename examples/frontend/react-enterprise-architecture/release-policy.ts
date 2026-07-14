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
  if (health.sampleCount < thresholds.minimumSamples) return "collect-more-data";
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
