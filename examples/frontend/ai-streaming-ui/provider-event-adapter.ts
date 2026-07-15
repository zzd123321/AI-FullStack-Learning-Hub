export type GenerationEvent =
  | { readonly type: 'started'; readonly requestId: string }
  | { readonly type: 'text-delta'; readonly requestId: string; readonly delta: string }
  | { readonly type: 'tool-call'; readonly requestId: string; readonly callId: string; readonly name: string }
  | { readonly type: 'completed'; readonly requestId: string; readonly at: number }
  | { readonly type: 'failed'; readonly requestId: string; readonly message: string; readonly at: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
    case 'response.output_item.added': {
      const item = event.item;
      if (!isRecord(item) || item.type !== 'function_call') return null;
      if (typeof item.call_id !== 'string' || typeof item.name !== 'string') {
        throw new TypeError('Function call identity is missing');
      }
      return { type: 'tool-call', requestId, callId: item.call_id, name: item.name };
    }
    case 'response.completed':
      return { type: 'completed', requestId, at: now() };
    case 'error':
      return {
        type: 'failed', requestId,
        message: isRecord(event.error) && typeof event.error.message === 'string'
          ? event.error.message : 'Generation failed',
        at: now(),
      };
    default:
      return null;
  }
}
