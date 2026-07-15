export type ActivationMode = 'automatic' | 'manual';

export interface TabDefinition {
  readonly id: string;
  readonly label: string;
  readonly panel: string;
  readonly disabled?: boolean;
}

export interface TabsState {
  readonly items: readonly TabDefinition[];
  readonly selectedId: string;
  readonly focusedId: string;
  readonly activation: ActivationMode;
}

function enabledItems(items: readonly TabDefinition[]): readonly TabDefinition[] {
  return items.filter((item) => !item.disabled);
}

export function createTabsState(
  items: readonly TabDefinition[],
  selectedId?: string,
  activation: ActivationMode = 'automatic',
): TabsState {
  const ids = new Set(items.map((item) => item.id));
  if (ids.size !== items.length) throw new Error('Tab IDs must be unique');
  const enabled = enabledItems(items);
  if (enabled.length === 0) throw new Error('Tabs require at least one enabled item');
  const selected = enabled.find((item) => item.id === selectedId) ?? enabled[0]!;
  return { items: [...items], selectedId: selected.id, focusedId: selected.id, activation };
}

export function focusTab(state: TabsState, direction: -1 | 1 | 'first' | 'last'): TabsState {
  const enabled = enabledItems(state.items);
  let index: number;
  if (direction === 'first') index = 0;
  else if (direction === 'last') index = enabled.length - 1;
  else {
    const current = Math.max(0, enabled.findIndex((item) => item.id === state.focusedId));
    index = (current + direction + enabled.length) % enabled.length;
  }
  const focusedId = enabled[index]!.id;
  return {
    ...state,
    focusedId,
    selectedId: state.activation === 'automatic' ? focusedId : state.selectedId,
  };
}

export function activateFocusedTab(state: TabsState): TabsState {
  return { ...state, selectedId: state.focusedId };
}

export function selectTab(state: TabsState, id: string): TabsState {
  const item = state.items.find((candidate) => candidate.id === id && !candidate.disabled);
  return item ? { ...state, selectedId: id, focusedId: id } : state;
}
