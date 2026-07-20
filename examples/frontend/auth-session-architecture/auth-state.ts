import type { SessionSummary } from './session-contract.js';

export type AuthState =
  | { readonly phase: 'unknown' }
  | { readonly phase: 'anonymous'; readonly reason: 'signed-out' | 'expired' }
  | { readonly phase: 'authenticated'; readonly session: SessionSummary }
  | { readonly phase: 'refreshing'; readonly session: SessionSummary }
  | { readonly phase: 'unavailable'; readonly previous: SessionSummary | null };

export type AuthAction =
  | { readonly type: 'session-found'; readonly session: SessionSummary }
  | { readonly type: 'session-missing'; readonly reason: 'signed-out' | 'expired' }
  | { readonly type: 'refresh-started' }
  | { readonly type: 'refresh-finished'; readonly session: SessionSummary }
  | { readonly type: 'request-failed' }
  | { readonly type: 'retry-started' };

export function reduceAuth(state: AuthState, action: AuthAction): AuthState {
  if (action.type === 'session-found') return { phase: 'authenticated', session: action.session };
  if (action.type === 'session-missing') return { phase: 'anonymous', reason: action.reason };
  if (action.type === 'request-failed') {
    // A network failure is not evidence that the server session disappeared.
    const previous = state.phase === 'authenticated' || state.phase === 'refreshing'
      ? state.session : null;
    return { phase: 'unavailable', previous };
  }
  if (action.type === 'retry-started') return state.phase === 'unavailable'
    ? { phase: 'unknown' } : state;
  if (action.type === 'refresh-started') return state.phase === 'authenticated'
    ? { ...state, phase: 'refreshing' } : state;
  if (action.type === 'refresh-finished') return state.phase === 'refreshing'
    ? { phase: 'authenticated', session: action.session } : state;
  return state;
}
