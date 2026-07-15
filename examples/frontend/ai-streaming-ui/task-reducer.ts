import type { GenerationEvent } from './provider-event-adapter.js';
import type { AssistantPart, GenerationState } from './types.js';

export type TaskAction =
  | GenerationEvent
  | { readonly type: 'submit'; readonly requestId: string; readonly at: number }
  | { readonly type: 'cancel'; readonly requestId: string; readonly at: number };

export const initialGenerationState: GenerationState = {
  requestId: null, status: 'idle', parts: [], error: null, startedAt: null, completedAt: null,
};

function appendText(parts: readonly AssistantPart[], delta: string): readonly AssistantPart[] {
  const last = parts.at(-1);
  if (last?.type === 'text') return [...parts.slice(0, -1), { type: 'text', text: last.text + delta }];
  return [...parts, { type: 'text', text: delta }];
}

export function reduceGeneration(state: GenerationState, action: TaskAction): GenerationState {
  if (action.type === 'submit') {
    return {
      requestId: action.requestId, status: 'submitting', parts: [], error: null,
      startedAt: action.at, completedAt: null,
    };
  }
  if (action.requestId !== state.requestId) return state;
  if (['completed', 'failed', 'cancelled'].includes(state.status)) return state;
  switch (action.type) {
    case 'started': return { ...state, status: 'streaming' };
    case 'text-delta': return { ...state, status: 'streaming', parts: appendText(state.parts, action.delta) };
    case 'tool-call': return {
      ...state,
      status: 'waiting-tool',
      parts: [...state.parts, { type: 'tool', callId: action.callId, name: action.name, status: 'awaiting-approval' }],
    };
    case 'completed': return { ...state, status: 'completed', completedAt: action.at };
    case 'failed': return { ...state, status: 'failed', error: action.message, completedAt: action.at };
    case 'cancel': return { ...state, status: 'cancelled', completedAt: action.at };
  }
}
