export type AuthState =
  | { readonly phase: 'unknown' }
  | { readonly phase: 'anonymous'; readonly reason: 'signed-out' | 'expired' }
  | { readonly phase: 'authenticated'; readonly userId: string; readonly permissions: readonly string[] }
  | { readonly phase: 'refreshing'; readonly userId: string; readonly permissions: readonly string[] }
  | { readonly phase: 'failed'; readonly recoverable: boolean };

export type AuthAction =
  | { readonly type: 'session-found'; readonly userId: string; readonly permissions: readonly string[] }
  | { readonly type: 'session-missing'; readonly reason: 'signed-out' | 'expired' }
  | { readonly type: 'refresh-started' }
  | { readonly type: 'refresh-finished'; readonly permissions: readonly string[] }
  | { readonly type: 'failed'; readonly recoverable: boolean };

export function reduceAuth(state: AuthState, action: AuthAction): AuthState {
  if (action.type === 'session-found') return { phase: 'authenticated', userId: action.userId, permissions: action.permissions };
  if (action.type === 'session-missing') return { phase: 'anonymous', reason: action.reason };
  if (action.type === 'failed') return { phase: 'failed', recoverable: action.recoverable };
  if (action.type === 'refresh-started') return state.phase === 'authenticated'
    ? { ...state, phase: 'refreshing' } : state;
  if (action.type === 'refresh-finished') return state.phase === 'refreshing'
    ? { phase: 'authenticated', userId: state.userId, permissions: action.permissions } : state;
  return state;
}
