export type ComputeRequest =
  | { readonly version: 1; readonly id: string; readonly type: 'sum'; readonly values: Float64Array }
  | { readonly version: 1; readonly id: string; readonly type: 'cancel'; readonly targetId: string };

export type ComputeError = 'cancelled' | 'invalid-request' | 'busy' | 'failed';

export type ComputeResponse =
  | { readonly version: 1; readonly id: string; readonly ok: true; readonly result: number }
  | { readonly version: 1; readonly id: string; readonly ok: false; readonly error: ComputeError };

const ERRORS = new Set<ComputeError>(['cancelled', 'invalid-request', 'busy', 'failed']);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

export function parseComputeRequest(value: unknown): ComputeRequest | null {
  if (!isRecord(value) || value.version !== 1 || !isId(value.id)) return null;

  if (value.type === 'sum') {
    if (!(value.values instanceof Float64Array) || value.values.length > 10_000_000) return null;
    return { version: 1, id: value.id, type: 'sum', values: value.values };
  }
  if (value.type === 'cancel' && isId(value.targetId)) {
    return { version: 1, id: value.id, type: 'cancel', targetId: value.targetId };
  }
  return null;
}

export function parseComputeResponse(value: unknown): ComputeResponse | null {
  if (!isRecord(value) || value.version !== 1 || !isId(value.id) || typeof value.ok !== 'boolean') {
    return null;
  }
  if (value.ok) {
    return typeof value.result === 'number' && Number.isFinite(value.result)
      ? { version: 1, id: value.id, ok: true, result: value.result }
      : null;
  }
  return typeof value.error === 'string' && ERRORS.has(value.error as ComputeError)
    ? { version: 1, id: value.id, ok: false, error: value.error as ComputeError }
    : null;
}
