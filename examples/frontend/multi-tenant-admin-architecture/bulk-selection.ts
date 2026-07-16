export type BulkSelection =
  | { readonly mode: 'explicit'; readonly ids: ReadonlySet<string> }
  | { readonly mode: 'all-matching'; readonly queryToken: string; readonly excludedIds: ReadonlySet<string> };

export function selectedCount(selection: BulkSelection, matchingCount: number): number {
  return selection.mode === 'explicit'
    ? selection.ids.size
    : Math.max(0, matchingCount - selection.excludedIds.size);
}

export interface BulkCommand {
  readonly operationId: string;
  readonly tenantId: string;
  readonly expectedPolicyVersion: string;
  readonly selection:
    | { readonly mode: 'explicit'; readonly ids: readonly string[] }
    | { readonly mode: 'all-matching'; readonly queryToken: string; readonly excludedIds: readonly string[] };
}

export function toBulkCommand(
  selection: BulkSelection,
  context: Omit<BulkCommand, 'selection'>,
): BulkCommand {
  return {
    ...context,
    selection: selection.mode === 'explicit'
      ? { mode: 'explicit', ids: [...selection.ids] }
      : { mode: 'all-matching', queryToken: selection.queryToken, excludedIds: [...selection.excludedIds] },
  };
}
