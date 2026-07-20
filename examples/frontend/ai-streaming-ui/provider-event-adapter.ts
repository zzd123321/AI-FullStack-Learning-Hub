import type { GenerationEvent } from './generation-events.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function adaptOpenAIEvent(
  raw: string,
  requestId: string,
  now: () => number = Date.now,
): GenerationEvent | null {
  const event: unknown = JSON.parse(raw);
  if (!isRecord(event) || typeof event.type !== 'string') {
    throw new TypeError('Invalid provider event');
  }
  switch (event.type) {
    case 'response.created':
      return { type: 'started', requestId };
    case 'response.output_text.delta':
      if (typeof event.delta !== 'string') throw new TypeError('Text delta is missing');
      return { type: 'text-delta', requestId, delta: event.delta };
    case 'response.output_item.done': {
      const item = event.item;
      if (!isRecord(item) || item.type !== 'function_call') return null;
      if (
        typeof item.call_id !== 'string' || item.call_id === ''
        || typeof item.name !== 'string' || item.name === ''
        || typeof item.arguments !== 'string'
      ) {
        throw new TypeError('Function call identity is missing');
      }
      // `output_item.added` arrives before arguments finish streaming. Waiting
      // for `output_item.done` prevents the UI from approving partial input.
      return { type: 'tool-call', requestId, callId: item.call_id, name: item.name };
    }
    case 'response.completed':
      return { type: 'completed', requestId, at: now() };
    case 'error':
      return {
        type: 'failed', requestId,
        code: 'provider_error',
        // The trusted backend should log provider details and expose a stable,
        // user-safe message instead of forwarding internal diagnostics.
        message: 'Generation failed',
        at: now(),
      };
    default:
      return null;
  }
}
