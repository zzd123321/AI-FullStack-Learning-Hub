export type BulkSelection =
  | { readonly mode: 'explicit'; readonly ids: ReadonlySet<string> }
  | { readonly mode: 'all-matching'; readonly queryToken: string; readonly excludedIds: ReadonlySet<string> };

export interface BulkCommand {
  readonly operationId: string;
  readonly tenantId: string;
  readonly expectedPolicyVersion: string;
  readonly selection:
    | { readonly mode: 'explicit'; readonly ids: readonly string[] }
    | { readonly mode: 'all-matching'; readonly queryToken: string; readonly excludedIds: readonly string[] };
}

const ID = /^[A-Za-z0-9_-]{1,120}$/;
const QUERY_TOKEN = /^[A-Za-z0-9._~-]{20,512}$/;
const MAX_EXPLICIT_IDS = 500;

function validateIds(ids: ReadonlySet<string>): void {
  if (ids.size > MAX_EXPLICIT_IDS || [...ids].some((id) => !ID.test(id))) {
    throw new TypeError('Invalid or oversized bulk selection');
  }
}

export function selectedCount(selection: BulkSelection, matchingCount: number): number {
  if (!Number.isSafeInteger(matchingCount) || matchingCount < 0) {
    throw new RangeError('Invalid matching count');
  }
  if (selection.mode === 'explicit') {
    validateIds(selection.ids);
    return selection.ids.size;
  }
  if (!QUERY_TOKEN.test(selection.queryToken)) throw new TypeError('Invalid query token');
  validateIds(selection.excludedIds);
  if (selection.excludedIds.size > matchingCount) throw new RangeError('Exclusions exceed matching count');
  return matchingCount - selection.excludedIds.size;
}

export function toBulkCommand(
  selection: BulkSelection,
  context: Omit<BulkCommand, 'selection'>,
): BulkCommand {
  if (!ID.test(context.operationId)
    || !ID.test(context.tenantId)
    || !ID.test(context.expectedPolicyVersion)) throw new TypeError('Invalid bulk command context');

  if (selection.mode === 'explicit') {
    validateIds(selection.ids);
    return { ...context, selection: { mode: 'explicit', ids: [...selection.ids].sort() } };
  }
  if (!QUERY_TOKEN.test(selection.queryToken)) throw new TypeError('Invalid query token');
  validateIds(selection.excludedIds);
  return {
    ...context,
    selection: {
      mode: 'all-matching',
      queryToken: selection.queryToken,
      excludedIds: [...selection.excludedIds].sort(),
    },
  };
}
