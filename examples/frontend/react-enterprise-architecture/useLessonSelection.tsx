import { useSyncExternalStore } from "react";
import { useAppDependencies } from "./AppProviders.js";

export function useLessonSelection() {
  const { selectionStore } = useAppDependencies();
  const snapshot = useSyncExternalStore(
    selectionStore.subscribe,
    selectionStore.getSnapshot,
    selectionStore.getServerSnapshot,
  );
  return { snapshot, select: selectionStore.select };
}
