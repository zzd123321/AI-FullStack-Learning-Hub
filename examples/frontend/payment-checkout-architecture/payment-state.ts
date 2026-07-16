export type PaymentPhase =
  | 'idle' | 'creating' | 'requires_method' | 'requires_action'
  | 'processing' | 'paid' | 'failed' | 'canceled' | 'refunded';

export interface PaymentView {
  readonly phase: PaymentPhase;
  readonly version: number;
  readonly paymentId?: string;
  readonly message?: string;
}

export type PaymentAction =
  | { readonly type: 'create-started' }
  | { readonly type: 'create-failed'; readonly message: string }
  | { readonly type: 'server-snapshot'; readonly snapshot: PaymentView };

export function reducePayment(state: PaymentView, action: PaymentAction): PaymentView {
  if (action.type === 'create-started') {
    return state.phase === 'idle' || state.phase === 'failed'
      ? { phase: 'creating', version: state.version }
      : state;
  }
  if (action.type === 'create-failed') {
    return { phase: 'failed', version: state.version, message: action.message };
  }
  return action.snapshot.version > state.version ? action.snapshot : state;
}

export const isTerminal = (phase: PaymentPhase): boolean =>
  phase === 'paid' || phase === 'canceled' || phase === 'refunded';
