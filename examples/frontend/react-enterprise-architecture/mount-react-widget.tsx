import { createRoot, type Root } from "react-dom/client";
import { App } from "./App.js";
import { AppErrorBoundary } from "./AppErrorBoundary.js";
import { AppProviders, type AppDependencies } from "./AppProviders.js";

export interface ReactWidgetHandle {
  update(dependencies: AppDependencies): void;
  unmount(): void;
}

const mountedRoots = new WeakSet<Element>();

export function mountReactWidget(
  container: Element,
  initialDependencies: AppDependencies,
): ReactWidgetHandle {
  if (mountedRoots.has(container)) throw new Error("Container already has a React root");
  mountedRoots.add(container);
  const root: Root = createRoot(container);
  let current = initialDependencies;

  const render = () => {
    root.render(
      <AppErrorBoundary telemetry={current.telemetry}>
        <AppProviders dependencies={current}>
          <App />
        </AppProviders>
      </AppErrorBoundary>,
    );
  };
  render();

  return {
    update(dependencies) {
      current = dependencies;
      render();
    },
    unmount() {
      root.unmount();
      mountedRoots.delete(container);
    },
  };
}
