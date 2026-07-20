export type PaymentPhase =
  | 'requires_method'
  | 'requires_action'
  | 'processing'
  | 'authorized'
  | 'paid'
  | 'failed'
  | 'canceled';

/** A versioned projection produced by the merchant's payment service. */
export interface PaymentSnapshot {
  readonly orderId: string;
  readonly paymentId: string;
  readonly phase: PaymentPhase;
  readonly version: number;
  readonly amount: {
    readonly currency: string;
    /** JSON cannot encode bigint, so minor units cross the wire as digits. */
    readonly minor: string;
  };
}

export interface PaymentUiState {
  readonly orderId: string;
  readonly request: 'idle' | 'creating' | 'confirming';
  readonly snapshot: PaymentSnapshot | null;
  /** A transport problem is not a statement about the payment's fund state. */
  readonly transportError: 'network' | 'server' | null;
}

export type PaymentAction =
  | { readonly type: 'request-started'; readonly request: 'creating' | 'confirming' }
  | { readonly type: 'request-failed'; readonly error: 'network' | 'server' }
  | { readonly type: 'snapshot-received'; readonly snapshot: PaymentSnapshot };

const PHASES = new Set<PaymentPhase>([
  'requires_method', 'requires_action', 'processing', 'authorized',
  'paid', 'failed', 'canceled',
]);
const OPAQUE_ID = /^[A-Za-z0-9_-]{8,120}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validate JSON before it enters the payment store. */
export function parsePaymentSnapshot(value: unknown): PaymentSnapshot | null {
  if (!isPlainObject(value)
    || typeof value.orderId !== 'string' || !OPAQUE_ID.test(value.orderId)
    || typeof value.paymentId !== 'string' || !OPAQUE_ID.test(value.paymentId)
    || typeof value.phase !== 'string' || !PHASES.has(value.phase as PaymentPhase)
    || !Number.isSafeInteger(value.version) || (value.version as number) < 0
    || !isPlainObject(value.amount)
    || typeof value.amount.currency !== 'string' || !/^[A-Z]{3}$/.test(value.amount.currency)
    || typeof value.amount.minor !== 'string' || !/^(0|[1-9]\d{0,29})$/.test(value.amount.minor)) {
    return null;
  }

  return {
    orderId: value.orderId,
    paymentId: value.paymentId,
    phase: value.phase as PaymentPhase,
    version: value.version as number,
    amount: { currency: value.amount.currency, minor: value.amount.minor },
  };
}

export function createPaymentUiState(orderId: string): PaymentUiState {
  if (!OPAQUE_ID.test(orderId)) throw new TypeError('Invalid order ID');
  return { orderId, request: 'idle', snapshot: null, transportError: null };
}

export function reducePayment(state: PaymentUiState, action: PaymentAction): PaymentUiState {
  if (action.type === 'request-started') {
    const phase = state.snapshot?.phase;
    if (state.request !== 'idle'
      || phase === 'processing' || phase === 'authorized'
      || phase === 'paid' || phase === 'canceled') return state;
    return { ...state, request: action.request, transportError: null };
  }
  if (action.type === 'request-failed') {
    if (state.request === 'idle') return state; // stale failure after a newer snapshot
    // Preserve the last server snapshot: a timeout can happen after the PSP
    // already accepted the payment, so it must not become a domain failure.
    return { ...state, request: 'idle', transportError: action.error };
  }

  const current = state.snapshot;
  if (action.snapshot.orderId !== state.orderId) return state;
  if (current && action.snapshot.paymentId !== current.paymentId) return state;
  if (current && action.snapshot.version <= current.version) return state;
  return { ...state, request: 'idle', snapshot: action.snapshot, transportError: null };
}

export const needsReconciliation = (phase: PaymentPhase): boolean => phase === 'processing';
