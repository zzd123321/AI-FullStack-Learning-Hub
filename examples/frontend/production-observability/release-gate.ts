export interface ReleaseHealth {
  readonly sampleCount: number;
  readonly errorRate: number;
  readonly baselineErrorRate: number;
  readonly p75LcpMs: number;
  readonly p75InpMs: number;
  readonly checkoutSuccessRate: number;
  readonly baselineCheckoutSuccessRate: number;
}

export interface ReleasePolicy {
  readonly minimumSamples: number;
  readonly maximumAbsoluteErrorRate: number;
  readonly maximumErrorRateRatio: number;
  readonly maximumP75LcpMs: number;
  readonly maximumP75InpMs: number;
  readonly maximumCheckoutRegression: number;
}

export type ReleaseAction = 'collect' | 'promote' | 'pause' | 'rollback';

export interface ReleaseDecision {
  readonly action: ReleaseAction;
  readonly reasons: readonly string[];
}

export function evaluateRelease(health: ReleaseHealth, policy: ReleasePolicy): ReleaseDecision {
  if (health.sampleCount < policy.minimumSamples) {
    return { action: 'collect', reasons: ['insufficient-samples'] };
  }

  const reasons: string[] = [];
  const errorRatio = health.errorRate / Math.max(health.baselineErrorRate, 0.000_001);
  if (health.errorRate > policy.maximumAbsoluteErrorRate) reasons.push('absolute-error-rate');
  if (errorRatio > policy.maximumErrorRateRatio) reasons.push('relative-error-rate');
  if (health.p75LcpMs > policy.maximumP75LcpMs) reasons.push('lcp-regression');
  if (health.p75InpMs > policy.maximumP75InpMs) reasons.push('inp-regression');
  if (
    health.baselineCheckoutSuccessRate - health.checkoutSuccessRate >
    policy.maximumCheckoutRegression
  ) {
    reasons.push('business-conversion-regression');
  }

  if (reasons.includes('absolute-error-rate') || reasons.includes('business-conversion-regression')) {
    return { action: 'rollback', reasons };
  }
  if (reasons.length > 0) return { action: 'pause', reasons };
  return { action: 'promote', reasons: [] };
}
