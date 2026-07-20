export type GenerationEvent =
  | { readonly type: 'started'; readonly requestId: string }
  | { readonly type: 'text-delta'; readonly requestId: string; readonly delta: string }
  | { readonly type: 'tool-call'; readonly requestId: string; readonly callId: string; readonly name: string }
  | { readonly type: 'completed'; readonly requestId: string; readonly at: number }
  | { readonly type: 'failed'; readonly requestId: string; readonly code: string; readonly message: string; readonly at: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value;
}

function requireTimestamp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError('at must be a finite timestamp');
  }
  return value;
}

// The browser parses the application's small, provider-independent protocol.
// Unknown event types are ignored so the server can add non-critical events safely.
export function parseGenerationEvent(raw: string, expectedRequestId: string): GenerationEvent | null {
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new TypeError('Invalid generation event');
  }

  const requestId = requireNonEmptyString(value.requestId, 'requestId');
  if (requestId !== expectedRequestId) return null;

  switch (value.type) {
    case 'started':
      return { type: 'started', requestId };
    case 'text-delta':
      return { type: 'text-delta', requestId, delta: requireNonEmptyString(value.delta, 'delta') };
    case 'tool-call':
      return {
        type: 'tool-call',
        requestId,
        callId: requireNonEmptyString(value.callId, 'callId'),
        name: requireNonEmptyString(value.name, 'name'),
      };
    case 'completed':
      return { type: 'completed', requestId, at: requireTimestamp(value.at) };
    case 'failed':
      return {
        type: 'failed',
        requestId,
        code: requireNonEmptyString(value.code, 'code'),
        message: requireNonEmptyString(value.message, 'message'),
        at: requireTimestamp(value.at),
      };
    default:
      return null;
  }
}
