export type RouteKey = "catalog" | "editor";

export interface PageModule {
  render(container: HTMLElement): void;
}

const routeLoaders = {
  // 写成有限映射后，构建器能发现两个候选模块并分别生成 chunk。
  catalog: () => import("./pages/catalog-page.js"),
  editor: () => import("./pages/editor-page.js"),
} satisfies Record<RouteKey, () => Promise<PageModule>>;

export async function loadRoute(route: string): Promise<PageModule> {
  // URL 参数属于外部输入，不能未经检查就参与模块路径拼接。
  if (!(route in routeLoaders)) throw new Error(`Unknown route: ${route}`);
  return routeLoaders[route as RouteKey]();
}
