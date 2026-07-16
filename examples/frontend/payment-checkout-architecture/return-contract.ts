export interface PaymentReturn {
  readonly paymentId: string;
  readonly transactionState: string;
}

export function parsePaymentReturn(url: URL): PaymentReturn | null {
  const paymentId = url.searchParams.get('payment_id');
  const transactionState = url.searchParams.get('state');
  if (!paymentId || !/^pay_[A-Za-z0-9]{8,80}$/.test(paymentId)) return null;
  if (!transactionState || !/^[A-Za-z0-9_-]{20,200}$/.test(transactionState)) return null;
  return { paymentId, transactionState };
}

// URL 中出现 success=true 也不改变订单；调用方必须向自己的服务端重新查询。
export const returnClaimsSuccess = (_url: URL): false => false;
