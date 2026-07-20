export type DeliveryAction =
  | { readonly kind: 'delivered' }
  | { readonly kind: 'delete-subscription' }
  | { readonly kind: 'retry'; readonly retryAfterMs?: number }
  | { readonly kind: 'failed'; readonly reason: string };

export function classifyPushServiceResponse(
  status: number,
  retryAfterSeconds?: number,
): DeliveryAction {
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    throw new RangeError('Invalid HTTP status');
  }
  if (status >= 200 && status < 300) return { kind: 'delivered' };
  if (status === 404 || status === 410) return { kind: 'delete-subscription' };
  if (status === 408 || status === 429 || status >= 500) {
    return retryAfterSeconds === undefined || !Number.isFinite(retryAfterSeconds)
      ? { kind: 'retry' }
      : { kind: 'retry', retryAfterMs: Math.max(0, retryAfterSeconds * 1000) };
  }
  return { kind: 'failed', reason: `Push service rejected request with ${status}` };
}
