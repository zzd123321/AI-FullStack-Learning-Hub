import { needsReconciliation, type PaymentSnapshot } from './payment-state.js';

export interface ReconciliationOptions {
  readonly read: (signal: AbortSignal) => Promise<PaymentSnapshot>;
  readonly onSnapshot: (snapshot: PaymentSnapshot) => void;
  readonly signal: AbortSignal;
  readonly maxAttempts?: number;
  readonly wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

export type ReconciliationResult =
  | { readonly kind: 'current'; readonly snapshot: PaymentSnapshot }
  | { readonly kind: 'still-processing'; readonly snapshot: PaymentSnapshot };

const delay = (milliseconds: number, signal: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  signal.throwIfAborted();
  const onAbort = (): void => {
    clearTimeout(timer);
    reject(signal.reason);
  };
  const timer = setTimeout(() => {
    signal.removeEventListener('abort', onAbort);
    resolve();
  }, milliseconds);
  signal.addEventListener('abort', onAbort, { once: true });
});

export async function reconcilePayment(options: ReconciliationOptions): Promise<ReconciliationResult> {
  const maxAttempts = options.maxAttempts ?? 6;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    throw new RangeError('maxAttempts must be between 1 and 10');
  }
  const wait = options.wait ?? delay;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    options.signal.throwIfAborted();
    const snapshot = await options.read(options.signal);
    options.onSnapshot(snapshot);
    if (!needsReconciliation(snapshot.phase)) return { kind: 'current', snapshot };

    // Exhaustion means "still processing", not a synthetic payment failure.
    if (attempt + 1 === maxAttempts) return { kind: 'still-processing', snapshot };
    await wait(Math.min(1_000 * 2 ** attempt, 8_000), options.signal);
  }

  throw new Error('Unreachable reconciliation state');
}
