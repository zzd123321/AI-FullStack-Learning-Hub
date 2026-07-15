export interface ReconnectPolicy {
  readonly baseDelayMs: number;
  readonly maximumDelayMs: number;
  readonly maximumAttempts: number;
}
export function nextReconnectDelay(
  attempt: number,
  policy: ReconnectPolicy,
  random: () => number = Math.random,
): number | null {
  if (attempt < 0 || !Number.isInteger(attempt)) throw new RangeError('attempt must be non-negative');
  if (attempt >= policy.maximumAttempts) return null;
  const exponentialCap = Math.min(
    policy.maximumDelayMs,
    policy.baseDelayMs * 2 ** attempt,
  );
  return Math.floor(Math.max(0, Math.min(1, random())) * exponentialCap);
}

export function shouldReconnect(closeCode: number): boolean {
  // 1000: normal closure; 1008: policy violation; application auth codes should also stop.
  return closeCode !== 1000 && closeCode !== 1008 && closeCode !== 4001;
}
