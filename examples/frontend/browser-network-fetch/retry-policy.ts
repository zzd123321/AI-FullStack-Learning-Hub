const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface RetryPolicy {
  readonly maximumAttempts: number;
  readonly baseDelayMs: number;
  readonly maximumDelayMs: number;
}

export function mayAutomaticallyRetry(request: Request): boolean {
  return request.method === "GET" || request.method === "HEAD";
}

export function shouldRetryResponse(response: Response): boolean {
  return RETRYABLE_STATUS.has(response.status);
}

export function parseRetryAfter(value: string | null, nowMs = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

  const dateMs = Date.parse(value);
  return Number.isNaN(dateMs) ? null : Math.max(0, dateMs - nowMs);
}

export function fullJitterDelay(attempt: number, policy: RetryPolicy, random = Math.random): number {
  const ceiling = Math.min(policy.maximumDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
  return Math.floor(random() * ceiling);
}
