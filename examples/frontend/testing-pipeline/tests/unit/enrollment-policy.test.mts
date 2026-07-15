import { describe, expect, it } from 'vitest';

import {
  evaluateEnrollment,
  type EnrollmentContext,
} from '../../src/enrollment-policy.js';

const OPEN = Date.UTC(2026, 6, 1, 0, 0, 0);
const CLOSE = Date.UTC(2026, 6, 31, 0, 0, 0);

function buildContext(overrides: Partial<EnrollmentContext> = {}): EnrollmentContext {
  return {
    capacity: 3,
    enrolled: false,
    opensAt: OPEN,
    closesAt: CLOSE,
    now: OPEN,
    ...overrides,
  };
}

describe('evaluateEnrollment', () => {
  it.each([
    {
      name: 'already enrolled',
      overrides: { enrolled: true },
      reason: 'already-enrolled',
    },
    { name: 'no capacity', overrides: { capacity: 0 }, reason: 'full' },
    { name: 'before opening', overrides: { now: OPEN - 1 }, reason: 'not-open' },
    { name: 'at closing boundary', overrides: { now: CLOSE }, reason: 'closed' },
  ] as const)('rejects $name', ({ overrides, reason }) => {
    expect(evaluateEnrollment(buildContext(overrides))).toEqual({
      allowed: false,
      reason,
    });
  });

  it('allows enrollment at the inclusive opening boundary', () => {
    expect(evaluateEnrollment(buildContext({ now: OPEN }))).toEqual({ allowed: true });
  });
});
