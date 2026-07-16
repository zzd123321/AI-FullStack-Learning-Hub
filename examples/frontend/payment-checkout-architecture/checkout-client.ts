import type { PaymentView } from './payment-state.js';

export interface CheckoutRequest {
  readonly orderId: string;
  readonly orderVersion: number;
  readonly operationId: string;
}

export async function createOrReusePayment(
  request: CheckoutRequest,
  signal?: AbortSignal,
): Promise<PaymentView> {
  const response = await fetch('/api/checkout/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': request.operationId },
    credentials: 'same-origin',
    body: JSON.stringify(request),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error(`Checkout request failed: ${response.status}`);
  return response.json() as Promise<PaymentView>;
}

export async function readPayment(paymentId: string, signal?: AbortSignal): Promise<PaymentView> {
  const response = await fetch(`/api/checkout/payments/${encodeURIComponent(paymentId)}`, {
    credentials: 'same-origin',
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error(`Payment lookup failed: ${response.status}`);
  return response.json() as Promise<PaymentView>;
}
