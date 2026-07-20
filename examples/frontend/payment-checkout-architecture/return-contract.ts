export interface ExpectedPaymentReturn {
  readonly origin: string;
  readonly pathname: string;
  readonly transactionState: string;
}

export interface PaymentReturn {
  readonly paymentId: string;
}

export function parsePaymentReturn(url: URL, expected: ExpectedPaymentReturn): PaymentReturn | null {
  if (url.origin !== expected.origin || url.pathname !== expected.pathname) return null;
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(expected.transactionState)) return null;

  // Reject duplicate parameters instead of letting URLSearchParams silently
  // choose one value while another layer chooses a different value.
  const paymentIds = url.searchParams.getAll('payment_id');
  const states = url.searchParams.getAll('state');
  if (paymentIds.length !== 1 || states.length !== 1) return null;
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(paymentIds[0] as string)) return null;
  if (states[0] !== expected.transactionState) return null;

  // success=true, provider status text, and every other query parameter are
  // intentionally ignored. The merchant server is queried after this parse.
  return { paymentId: paymentIds[0] as string };
}
