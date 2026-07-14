import {
  fullJitterDelay,
  mayAutomaticallyRetry,
  parseRetryAfter,
  shouldRetryResponse,
  type RetryPolicy,
} from "./retry-policy.js";

const DEFAULT_POLICY: RetryPolicy = {
  maximumAttempts: 3,
  baseDelayMs: 250,
  maximumDelayMs: 5_000,
};

function wait(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const finish = () => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const id = setTimeout(finish, delayMs);
    const abort = () => {
      clearTimeout(id);
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
  policy: RetryPolicy = DEFAULT_POLICY,
): Promise<Response> {
  const request = new Request(input, init);
  if (!mayAutomaticallyRetry(request) || policy.maximumAttempts <= 1) return fetch(request);

  const signal = request.signal;
  let lastError: unknown;

  for (let attempt = 1; attempt <= policy.maximumAttempts; attempt += 1) {
    signal.throwIfAborted();
    try {
      const response = await fetch(request.clone());
      if (!shouldRetryResponse(response) || attempt === policy.maximumAttempts) return response;

      const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
      const delay = retryAfter ?? fullJitterDelay(attempt, policy);
      await response.body?.cancel();
      await wait(Math.min(delay, policy.maximumDelayMs), signal);
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      lastError = error;
      if (attempt === policy.maximumAttempts) throw error;
      await wait(fullJitterDelay(attempt, policy), signal);
    }
  }

  throw lastError ?? new Error("Request failed without a result");
}
