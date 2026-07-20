import { createOrReusePayment } from './checkout-client.js';
import { addMoney, moneyToJson, parseDecimalMoney } from './money.js';
import {
  createPaymentUiState,
  parsePaymentSnapshot,
  reducePayment,
  type PaymentSnapshot,
} from './payment-state.js';
import { reconcilePayment } from './reconciliation.js';
import { parsePaymentReturn } from './return-contract.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, message: string): void {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, received ${String(actual)}`);
}

function deepEqual(actual: unknown, expected: unknown, message: string): void {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

async function rejects(run: () => unknown | Promise<unknown>, message: string): Promise<void> {
  try {
    await run();
  } catch {
    return;
  }
  throw new Error(message);
}

const cny = { currency: 'CNY', fractionDigits: 2, maximumMinor: 1_000_000n } as const;
const price = parseDecimalMoney('19.90', cny);
const shipping = parseDecimalMoney('5', cny);
const total = addMoney(price, shipping, cny.maximumMinor);
equal(total.minor, 2_490n, 'money should use exact minor units');
deepEqual(moneyToJson(total), { currency: 'CNY', minor: '2490' }, 'bigint should cross JSON as digits');
await rejects(() => parseDecimalMoney('1.005', cny), 'extra fraction digits must be rejected');
await rejects(() => parseDecimalMoney('-1', cny), 'checkout money must be non-negative');
await rejects(() => parseDecimalMoney('10000.01', cny), 'product amount limit must be enforced');

const processing: PaymentSnapshot = {
  orderId: 'order_123456',
  paymentId: 'payment_123456',
  phase: 'processing',
  version: 3,
  amount: { currency: 'CNY', minor: '2490' },
};
const paid: PaymentSnapshot = { ...processing, phase: 'paid', version: 4 };
deepEqual(parsePaymentSnapshot(paid), paid, 'valid server snapshots should parse');
equal(parsePaymentSnapshot({ ...paid, version: Number.NaN }), null, 'non-finite versions should fail closed');
equal(parsePaymentSnapshot({ ...paid, amount: { currency: 'CNY', minor: '-1' } }), null,
  'negative checkout amounts should fail closed');

let ui = createPaymentUiState('order_123456');
ui = reducePayment(ui, { type: 'snapshot-received', snapshot: processing });
ui = reducePayment(ui, { type: 'snapshot-received', snapshot: paid });
ui = reducePayment(ui, { type: 'request-failed', error: 'network' });
equal(ui.snapshot?.phase, 'paid', 'a network error must not overwrite a paid server snapshot');
equal(ui.transportError, null, 'a stale request error after a newer snapshot should be ignored');
ui = reducePayment(ui, { type: 'snapshot-received', snapshot: processing });
equal(ui.snapshot?.version, 4, 'an older response must not roll payment state backward');

let observedHeaders = new Headers();
const fetcher: typeof fetch = async (_input, init) => {
  observedHeaders = new Headers(init?.headers);
  return new Response(JSON.stringify(processing), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
const created = await createOrReusePayment({
  orderId: 'order_123456',
  orderVersion: 7,
  operationId: 'operation_123456',
}, {
  csrfToken: 'csrf_abcdefghijklmnopqrstuv',
  fetcher,
});
equal(created.paymentId, processing.paymentId, 'checkout responses should be runtime validated');
equal(observedHeaders.get('idempotency-key'), 'operation_123456', 'logical retries need a stable idempotency key');
equal(observedHeaders.get('x-csrf-token'), 'csrf_abcdefghijklmnopqrstuv', 'cookie checkout needs CSRF protection');

const transactionState = 'state_abcdefghijklmnopqrstuv';
const returned = new URL(`https://shop.example/pay/return?payment_id=payment_123456&state=${transactionState}&success=true`);
deepEqual(parsePaymentReturn(returned, {
  origin: 'https://shop.example',
  pathname: '/pay/return',
  transactionState,
}), { paymentId: 'payment_123456' }, 'return data should be bound to the expected transaction');
equal(parsePaymentReturn(returned, {
  origin: 'https://shop.example',
  pathname: '/pay/return',
  transactionState: 'state_different_abcdefghijkl',
}), null, 'a mismatched state must fail closed even when success=true is present');

const snapshots = [processing, paid];
const waits: number[] = [];
const reconciled = await reconcilePayment({
  read: () => Promise.resolve(snapshots.shift() as PaymentSnapshot),
  onSnapshot: () => undefined,
  signal: new AbortController().signal,
  wait: (milliseconds) => { waits.push(milliseconds); return Promise.resolve(); },
});
equal(reconciled.kind, 'current', 'polling should stop when the merchant server reports a current non-processing state');
equal(reconciled.snapshot.phase, 'paid', 'reconciliation should return the latest server snapshot');
deepEqual(waits, [1_000], 'two reads should have exactly one delay between them');

let reads = 0;
const stillProcessing = await reconcilePayment({
  read: () => { reads += 1; return Promise.resolve(processing); },
  onSnapshot: () => undefined,
  signal: new AbortController().signal,
  maxAttempts: 3,
  wait: () => Promise.resolve(),
});
equal(stillProcessing.kind, 'still-processing', 'poll exhaustion is not a payment failure');
equal(reads, 3, 'the configured read budget should be respected');

console.log('payment checkout runtime examples passed');
