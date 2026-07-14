import { createContext, useContext, type ReactNode } from "react";
import type { LessonService, RuntimeConfig, Telemetry, UserSession } from "./types.js";
import type { SelectionStore } from "./selection-store.js";

export interface AppDependencies {
  readonly config: RuntimeConfig;
  readonly session: UserSession;
  readonly lessonService: LessonService;
  readonly telemetry: Telemetry;
  readonly selectionStore: SelectionStore;
}

const DependenciesContext = createContext<AppDependencies | null>(null);

export function AppProviders({
  dependencies,
  children,
}: {
  dependencies: AppDependencies;
  children: ReactNode;
}) {
  return (
    <DependenciesContext.Provider value={dependencies}>
      {children}
    </DependenciesContext.Provider>
  );
}

export function useAppDependencies(): AppDependencies {
  const dependencies = useContext(DependenciesContext);
  if (!dependencies) throw new Error("AppProviders is missing");
  return dependencies;
}
