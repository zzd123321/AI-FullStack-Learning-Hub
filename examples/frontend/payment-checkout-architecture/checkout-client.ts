import { parsePaymentSnapshot, type PaymentSnapshot } from './payment-state.js';

export interface CheckoutRequest {
  readonly orderId: string;
  readonly orderVersion: number;
  /** Reuse this ID for every retry of the same logical operation. */
  readonly operationId: string;
}

export interface CheckoutRequestOptions {
  readonly csrfToken: string;
  readonly signal?: AbortSignal;
  readonly fetcher?: typeof fetch;
}

const OPAQUE_ID = /^[A-Za-z0-9_-]{8,120}$/;

function validateRequest(request: CheckoutRequest, csrfToken: string): void {
  if (!OPAQUE_ID.test(request.orderId) || !OPAQUE_ID.test(request.operationId)) {
    throw new TypeError('Invalid checkout identifier');
  }
  if (!Number.isSafeInteger(request.orderVersion) || request.orderVersion < 0) {
    throw new RangeError('Invalid order version');
  }
  if (!/^[A-Za-z0-9_-]{20,256}$/.test(csrfToken)) throw new TypeError('Invalid CSRF token');
}

async function readSnapshot(response: Response): Promise<PaymentSnapshot> {
  if (!response.ok) throw new Error(`Checkout request failed: HTTP ${response.status}`);
  const snapshot = parsePaymentSnapshot(await response.json());
  if (!snapshot) throw new TypeError('Invalid payment response');
  return snapshot;
}

export async function createOrReusePayment(
  request: CheckoutRequest,
  options: CheckoutRequestOptions,
): Promise<PaymentSnapshot> {
  validateRequest(request, options.csrfToken);
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher('/api/checkout/payments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': request.operationId,
      'X-CSRF-Token': options.csrfToken,
    },
    credentials: 'same-origin',
    body: JSON.stringify(request),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const snapshot = await readSnapshot(response);
  if (snapshot.orderId !== request.orderId) throw new TypeError('Payment response belongs to another order');
  return snapshot;
}

export async function readPayment(
  paymentId: string,
  options: Pick<CheckoutRequestOptions, 'signal' | 'fetcher'> = {},
): Promise<PaymentSnapshot> {
  if (!OPAQUE_ID.test(paymentId)) throw new TypeError('Invalid payment ID');
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(`/api/checkout/payments/${encodeURIComponent(paymentId)}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const snapshot = await readSnapshot(response);
  if (snapshot.paymentId !== paymentId) throw new TypeError('Payment response ID mismatch');
  return snapshot;
}
