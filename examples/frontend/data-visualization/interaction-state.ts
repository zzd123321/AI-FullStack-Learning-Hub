import type { Domain } from './types.js';

export interface InteractionState {
  readonly focusedIndex: number | null;
  readonly selectedIndex: number | null;
  readonly visibleXDomain: Domain;
}

export type InteractionAction =
  | { readonly type: 'move-focus'; readonly delta: -1 | 1; readonly pointCount: number }
  | { readonly type: 'select-focused' }
  | { readonly type: 'pan'; readonly delta: number }
  | { readonly type: 'zoom'; readonly anchor: number; readonly factor: number }
  | { readonly type: 'reset'; readonly domain: Domain };

export function reduceInteraction(
  state: InteractionState,
  action: InteractionAction,
): InteractionState {
  switch (action.type) {
    case 'move-focus': {
      if (action.pointCount === 0) return { ...state, focusedIndex: null };
      const current = state.focusedIndex ?? (action.delta > 0 ? -1 : action.pointCount);
      return {
        ...state,
        focusedIndex: Math.max(0, Math.min(action.pointCount - 1, current + action.delta)),
      };
    }
    case 'select-focused':
      return { ...state, selectedIndex: state.focusedIndex };
    case 'pan':
      if (!Number.isFinite(action.delta)) return state;
      return {
        ...state,
        visibleXDomain: {
          min: state.visibleXDomain.min + action.delta,
          max: state.visibleXDomain.max + action.delta,
        },
      };
    case 'zoom': {
      if (!Number.isFinite(action.anchor) || !Number.isFinite(action.factor) || action.factor <= 0) {
        return state;
      }
      const { min, max } = state.visibleXDomain;
      return {
        ...state,
        visibleXDomain: {
          min: action.anchor + (min - action.anchor) / action.factor,
          max: action.anchor + (max - action.anchor) / action.factor,
        },
      };
    }
    case 'reset':
      return { focusedIndex: null, selectedIndex: null, visibleXDomain: action.domain };
  }
}
