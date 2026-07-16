export interface FieldConflict {
  readonly field: string;
  readonly base: unknown;
  readonly local: unknown;
  readonly remote: unknown;
}

export function mergeFields(
  base: Readonly<Record<string, unknown>>,
  local: Readonly<Record<string, unknown>>,
  remote: Readonly<Record<string, unknown>>,
): { readonly merged: Record<string, unknown>; readonly conflicts: readonly FieldConflict[] } {
  const merged: Record<string, unknown> = {};
  const conflicts: FieldConflict[] = [];
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  for (const field of keys) {
    const localChanged = !Object.is(local[field], base[field]);
    const remoteChanged = !Object.is(remote[field], base[field]);
    if (localChanged && remoteChanged && !Object.is(local[field], remote[field])) {
      conflicts.push({ field, base: base[field], local: local[field], remote: remote[field] });
      merged[field] = local[field];
    } else {
      merged[field] = localChanged ? local[field] : remote[field];
    }
  }
  return { merged, conflicts };
}
