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
  // 一个 DOM 容器只能由一个 React Root 管理。重复 createRoot 会造成所有权冲突。
  if (mountedRoots.has(container)) throw new Error("Container already has a React root");
  mountedRoots.add(container);
  const root: Root = createRoot(container);
  let current = initialDependencies;
  let mounted = true;

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
      if (!mounted) throw new Error("Cannot update an unmounted React widget");
      // 复用同一个 Root，只更新跨框架 DTO/依赖；不要因 Props 变化重新挂载。
      current = dependencies;
      render();
    },
    unmount() {
      if (!mounted) return; // 让宿主重复执行销毁流程时仍然安全。
      mounted = false;
      // 宿主删除容器前显式卸载，让 Effect、订阅和事件监听器获得清理机会。
      root.unmount();
      mountedRoots.delete(container);
    },
  };
}
