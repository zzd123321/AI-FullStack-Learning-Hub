export type GCounterState = Readonly<Record<string, number>>;

function assertState(state: GCounterState): void {
  for (const [replicaId, count] of Object.entries(state)) {
    if (!replicaId || !Number.isSafeInteger(count) || count < 0) {
      throw new TypeError('G-Counter state requires non-empty replica IDs and non-negative safe integers');
    }
  }
}

export function increment(
  state: GCounterState,
  replicaId: string,
  amount = 1,
): GCounterState {
  assertState(state);
  if (!replicaId) throw new TypeError('replicaId cannot be empty');
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError('A grow-only counter only accepts non-negative integer increments');
  }
  const next = (state[replicaId] ?? 0) + amount;
  if (!Number.isSafeInteger(next)) throw new RangeError('G-Counter component exceeded safe integer range');
  return { ...state, [replicaId]: next };
}
export function merge(left: GCounterState, right: GCounterState): GCounterState {
  assertState(left);
  assertState(right);
  const merged: Record<string, number> = { ...left };
  for (const [replicaId, value] of Object.entries(right)) {
    merged[replicaId] = Math.max(merged[replicaId] ?? 0, value);
  }
  return merged;
}

export function value(state: GCounterState): number {
  assertState(state);
  const total = Object.values(state).reduce((sum, count) => sum + count, 0);
  if (!Number.isSafeInteger(total)) throw new RangeError('G-Counter total exceeded safe integer range');
  return total;
}
