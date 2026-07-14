import type { SelectionSnapshot } from "./types.js";

export interface SelectionStore {
  getSnapshot(): SelectionSnapshot;
  getServerSnapshot(): SelectionSnapshot;
  subscribe(listener: () => void): () => void;
  select(lessonId: string | null): void;
}

export function createSelectionStore(initialId: string | null): SelectionStore {
  const listeners = new Set<() => void>();
  const serverSnapshot = Object.freeze({ selectedId: initialId, revision: 0 });
  let snapshot: SelectionSnapshot = serverSnapshot;

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => serverSnapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    select(selectedId) {
      if (selectedId === snapshot.selectedId) return;
      snapshot = Object.freeze({ selectedId, revision: snapshot.revision + 1 });
      listeners.forEach((listener) => listener());
    },
  };
}
