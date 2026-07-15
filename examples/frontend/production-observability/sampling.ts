function hash32(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function deterministicSample(key: string, rate: number): boolean {
  const normalizedRate = Math.min(1, Math.max(0, rate));
  return hash32(key) / 0x1_0000_0000 < normalizedRate;
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
