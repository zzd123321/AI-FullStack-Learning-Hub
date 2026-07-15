import type { VoiceSessionState } from './types.js';

export type VoiceAction =
  | { readonly type: 'request-permission' }
  | { readonly type: 'permission-granted' }
  | { readonly type: 'connected'; readonly sessionId: string }
  | { readonly type: 'speech-started' }
  | { readonly type: 'speech-stopped' }
  | { readonly type: 'response-started'; readonly responseId: string }
  | { readonly type: 'response-item-created'; readonly itemId: string }
  | { readonly type: 'audio-started' }
  | { readonly type: 'interrupt' }
  | { readonly type: 'response-ended' }
  | { readonly type: 'set-muted'; readonly muted: boolean }
  | { readonly type: 'fail'; readonly message: string }
  | { readonly type: 'end' };

export const initialVoiceState: VoiceSessionState = {
  sessionId: null, phase: 'idle', muted: false,
  activeResponseId: null, activeAudioItemId: null, error: null,
};

export function reduceVoiceSession(state: VoiceSessionState, action: VoiceAction): VoiceSessionState {
  if (action.type === 'request-permission') return { ...initialVoiceState, phase: 'requesting-permission' };
  if (action.type === 'fail') return { ...state, phase: 'failed', error: action.message };
  if (action.type === 'end') return { ...initialVoiceState, phase: 'ended' };
  if (action.type === 'set-muted') return { ...state, muted: action.muted };
  if (state.phase === 'failed' || state.phase === 'ended') return state;

  switch (action.type) {
    case 'permission-granted': return { ...state, phase: 'connecting' };
    case 'connected': return { ...state, sessionId: action.sessionId, phase: 'listening' };
    case 'speech-started': return {
      ...state,
      phase: state.phase === 'assistant-speaking' ? 'interrupting' : 'user-speaking',
    };
    case 'speech-stopped': return { ...state, phase: 'assistant-thinking' };
    case 'response-started': return {
      ...state, phase: 'assistant-thinking', activeResponseId: action.responseId,
    };
    case 'response-item-created': return {
      ...state, activeAudioItemId: action.itemId,
    };
    case 'audio-started': return {
      ...state, phase: 'assistant-speaking',
    };
    case 'interrupt': return { ...state, phase: 'interrupting' };
    case 'response-ended': return {
      ...state, phase: 'listening', activeResponseId: null, activeAudioItemId: null,
    };
  }
}
