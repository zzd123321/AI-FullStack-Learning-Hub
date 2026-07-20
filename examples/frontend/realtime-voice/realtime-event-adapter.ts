import type { VoiceAction } from './voice-session-reducer.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function adaptRealtimeEvent(raw: string): VoiceAction | null {
  const event: unknown = JSON.parse(raw);
  if (!isRecord(event) || typeof event.type !== 'string') throw new TypeError('Invalid realtime event');
  switch (event.type) {
    case 'session.created': {
      const session = event.session;
      if (!isRecord(session) || typeof session.id !== 'string' || session.id === '') {
        throw new TypeError('Missing session ID');
      }
      return { type: 'connected', sessionId: session.id };
    }
    case 'input_audio_buffer.speech_started': return { type: 'speech-started' };
    case 'input_audio_buffer.speech_stopped': return { type: 'speech-stopped' };
    case 'response.created': {
      const response = event.response;
      if (!isRecord(response) || typeof response.id !== 'string') throw new TypeError('Missing response ID');
      return { type: 'response-started', responseId: response.id };
    }
    case 'response.output_item.added': {
      const item = event.item;
      if (!isRecord(item) || item.type !== 'message' || typeof item.id !== 'string') return null;
      return { type: 'response-item-created', itemId: item.id };
    }
    case 'response.done': {
      const response = event.response;
      if (!isRecord(response) || typeof response.id !== 'string' || response.id === '') {
        throw new TypeError('Missing completed response ID');
      }
      return { type: 'response-ended', responseId: response.id };
    }
    case 'response.cancelled': {
      const response = event.response;
      return {
        type: 'response-ended',
        responseId: isRecord(response) && typeof response.id === 'string' ? response.id : null,
      };
    }
    case 'error': return {
      type: 'fail',
      // Keep detailed provider diagnostics in protected logs. The UI receives
      // a stable message that cannot leak request or policy internals.
      message: 'Realtime session failed',
    };
    default: return null;
  }
}
