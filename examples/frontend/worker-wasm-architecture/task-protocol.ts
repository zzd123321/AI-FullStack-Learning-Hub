export type ComputeRequest =
  | { readonly version: 1; readonly id: string; readonly type: 'sum'; readonly values: Float64Array }
  | { readonly version: 1; readonly id: string; readonly type: 'cancel'; readonly targetId: string };

export type ComputeResponse =
  | { readonly version: 1; readonly id: string; readonly ok: true; readonly result: number }
  | { readonly version: 1; readonly id: string; readonly ok: false; readonly error: 'cancelled' | 'invalid-request' | 'failed' };

export function isComputeRequest(value: unknown): value is ComputeRequest {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<ComputeRequest>;
  if (item.version !== 1 || typeof item.id !== 'string' || item.id.length > 128) return false;
  return item.type === 'sum'
    ? item.values instanceof Float64Array && item.values.length <= 10_000_000
    : item.type === 'cancel' && typeof item.targetId === 'string';
}
