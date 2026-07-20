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

function isRate(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function assertPolicy(policy: ReleasePolicy): void {
  if (
    !Number.isSafeInteger(policy.minimumSamples) ||
    policy.minimumSamples <= 0 ||
    !isRate(policy.maximumAbsoluteErrorRate) ||
    !Number.isFinite(policy.maximumErrorRateRatio) ||
    policy.maximumErrorRateRatio < 1 ||
    !Number.isFinite(policy.maximumP75LcpMs) ||
    policy.maximumP75LcpMs < 0 ||
    !Number.isFinite(policy.maximumP75InpMs) ||
    policy.maximumP75InpMs < 0 ||
    !isRate(policy.maximumCheckoutRegression)
  ) {
    throw new RangeError('Invalid release policy');
  }
}

function isValidHealth(health: ReleaseHealth): boolean {
  return (
    Number.isSafeInteger(health.sampleCount) &&
    health.sampleCount >= 0 &&
    isRate(health.errorRate) &&
    isRate(health.baselineErrorRate) &&
    Number.isFinite(health.p75LcpMs) &&
    health.p75LcpMs >= 0 &&
    Number.isFinite(health.p75InpMs) &&
    health.p75InpMs >= 0 &&
    isRate(health.checkoutSuccessRate) &&
    isRate(health.baselineCheckoutSuccessRate)
  );
}

export function evaluateRelease(health: ReleaseHealth, policy: ReleasePolicy): ReleaseDecision {
  assertPolicy(policy);
  // 观测数据损坏时绝不能默认 Promote；暂停并修复证据链。
  if (!isValidHealth(health)) return { action: 'pause', reasons: ['invalid-health-data'] };

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
