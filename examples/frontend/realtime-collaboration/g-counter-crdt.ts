export type GCounterState = Readonly<Record<string, number>>;

export function increment(
  state: GCounterState,
  replicaId: string,
  amount = 1,
): GCounterState {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError('A grow-only counter only accepts non-negative integer increments');
  }
  return { ...state, [replicaId]: (state[replicaId] ?? 0) + amount };
}
export function merge(left: GCounterState, right: GCounterState): GCounterState {
  const merged: Record<string, number> = { ...left };
  for (const [replicaId, value] of Object.entries(right)) {
    merged[replicaId] = Math.max(merged[replicaId] ?? 0, value);
  }
  return merged;
}

export function value(state: GCounterState): number {
  return Object.values(state).reduce((total, count) => total + count, 0);
}
