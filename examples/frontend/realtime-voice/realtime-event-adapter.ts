import type { VoiceAction } from './voice-session-reducer.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function adaptRealtimeEvent(raw: string): VoiceAction | null {
  const event: unknown = JSON.parse(raw);
  if (!isRecord(event) || typeof event.type !== 'string') throw new TypeError('Invalid realtime event');
  switch (event.type) {
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
    case 'response.done':
    case 'response.cancelled': return { type: 'response-ended' };
    case 'error': return {
      type: 'fail',
      message: isRecord(event.error) && typeof event.error.message === 'string'
        ? event.error.message : 'Realtime session failed',
    };
    default: return null;
  }
}
