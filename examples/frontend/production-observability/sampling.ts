function hash32(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function deterministicSample(key: string, rate: number): boolean {
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new RangeError('Sampling rate must be a finite number between 0 and 1');
  }
  return hash32(key) / 0x1_0000_0000 < rate;
}

export interface SamplingPolicy {
  readonly sessionRate: number;
  readonly keepAllErrors: boolean;
}

export function createSampler(sessionId: string, policy: SamplingPolicy) {
  const sessionSelected = deterministicSample(sessionId, policy.sessionRate);
  return (signal: 'error' | 'event' | 'log' | 'metric' | 'span'): boolean =>
    (signal === 'error' && policy.keepAllErrors) || sessionSelected;
}
