const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const IMF_FIXDATE = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;

export interface RetryPolicy {
  readonly maximumAttempts: number;
  readonly baseDelayMs: number;
  readonly maximumDelayMs: number;
}

export function validateRetryPolicy(policy: RetryPolicy): void {
  if (!Number.isInteger(policy.maximumAttempts) || policy.maximumAttempts < 1) {
    throw new RangeError("maximumAttempts must be a positive integer");
  }
  if (!Number.isFinite(policy.baseDelayMs) || policy.baseDelayMs < 0) {
    throw new RangeError("baseDelayMs must be a non-negative finite number");
  }
  if (!Number.isFinite(policy.maximumDelayMs) || policy.maximumDelayMs < 0) {
    throw new RangeError("maximumDelayMs must be a non-negative finite number");
  }
}

export function mayAutomaticallyRetry(request: Request): boolean {
  return request.method === "GET" || request.method === "HEAD";
}

export function shouldRetryResponse(response: Response): boolean {
  return RETRYABLE_STATUS.has(response.status);
}

export function parseRetryAfter(value: string | null, nowMs = Date.now()): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  // RFC delay-seconds 是一个或多个十进制整数，不接受 1.5、负数或指数写法。
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isSafeInteger(seconds) && seconds <= Number.MAX_SAFE_INTEGER / 1000
      ? seconds * 1000
      : null;
  }

  // 教学实现保守接受当前发送方应生成的 IMF-fixdate；不让宽松 Date.parse
  // 把 "1.5"、本地日期等非 HTTP 日期猜成有效值。
  if (!IMF_FIXDATE.test(trimmed)) return null;
  const dateMs = Date.parse(trimmed);
  if (Number.isNaN(dateMs) || new Date(dateMs).toUTCString() !== trimmed) return null;
  return Math.max(0, dateMs - nowMs);
}

export function fullJitterDelay(attempt: number, policy: RetryPolicy, random = Math.random): number {
  if (!Number.isInteger(attempt) || attempt < 1) throw new RangeError("attempt must be positive");
  validateRetryPolicy(policy);
  const ceiling = Math.min(policy.maximumDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
    throw new RangeError("random must return a value in [0, 1)");
  }
  return Math.floor(sample * ceiling);
}
