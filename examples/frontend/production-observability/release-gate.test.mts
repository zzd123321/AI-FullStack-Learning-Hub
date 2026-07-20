import assert from 'node:assert/strict';
import { evaluateRelease } from './release-gate.ts';

const policy = {
  minimumSamples: 1_000,
  maximumAbsoluteErrorRate: 0.02,
  maximumErrorRateRatio: 1.5,
  maximumP75LcpMs: 2_500,
  maximumP75InpMs: 200,
  maximumCheckoutRegression: 0.02,
} as const;

assert.deepEqual(
  evaluateRelease(
    {
      sampleCount: 4_000,
      errorRate: 0.009,
      baselineErrorRate: 0.008,
      p75LcpMs: 2_100,
      p75InpMs: 160,
      checkoutSuccessRate: 0.72,
      baselineCheckoutSuccessRate: 0.73,
    },
    policy,
  ),
  { action: 'promote', reasons: [] },
);

assert.equal(
  evaluateRelease(
    {
      sampleCount: 4_000,
      errorRate: 0.03,
      baselineErrorRate: 0.008,
      p75LcpMs: 2_100,
      p75InpMs: 160,
      checkoutSuccessRate: 0.68,
      baselineCheckoutSuccessRate: 0.73,
    },
    policy,
  ).action,
  'rollback',
);

assert.deepEqual(
  evaluateRelease(
    {
      sampleCount: 4_000,
      errorRate: Number.NaN,
      baselineErrorRate: 0.008,
      p75LcpMs: 2_100,
      p75InpMs: 160,
      checkoutSuccessRate: 0.72,
      baselineCheckoutSuccessRate: 0.73,
    },
    policy,
  ),
  { action: 'pause', reasons: ['invalid-health-data'] },
);

assert.throws(
  () => evaluateRelease(
    {
      sampleCount: 4_000,
      errorRate: 0.01,
      baselineErrorRate: 0.008,
      p75LcpMs: 2_100,
      p75InpMs: 160,
      checkoutSuccessRate: 0.72,
      baselineCheckoutSuccessRate: 0.73,
    },
    { ...policy, maximumP75InpMs: Number.NaN },
  ),
  /Invalid release policy/,
);

console.log('Release gate tests passed.');
