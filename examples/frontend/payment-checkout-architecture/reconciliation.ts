import { isTerminal, type PaymentView } from './payment-state.js';

export interface ReconciliationOptions {
  readonly read: (signal: AbortSignal) => Promise<PaymentView>;
  readonly onSnapshot: (snapshot: PaymentView) => void;
  readonly signal: AbortSignal;
  readonly maxAttempts?: number;
}

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

export async function reconcilePayment(options: ReconciliationOptions): Promise<PaymentView> {
  const maxAttempts = options.maxAttempts ?? 6;
  let snapshot: PaymentView = { phase: 'processing', version: -1 };
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    snapshot = await options.read(options.signal);
    options.onSnapshot(snapshot);
    if (isTerminal(snapshot.phase) || snapshot.phase === 'failed' || snapshot.phase === 'requires_method') {
      return snapshot;
    }
    await delay(Math.min(1_000 * 2 ** attempt, 8_000), options.signal);
  }
  return snapshot;
}
