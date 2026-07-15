export type RouteKey = "catalog" | "editor";

export interface PageModule {
  render(container: HTMLElement): void;
}

const routeLoaders = {
  catalog: () => import("./pages/catalog-page.js"),
  editor: () => import("./pages/editor-page.js"),
} satisfies Record<RouteKey, () => Promise<PageModule>>;

export async function loadRoute(route: string): Promise<PageModule> {
  if (!(route in routeLoaders)) throw new Error(`Unknown route: ${route}`);
  return routeLoaders[route as RouteKey]();
}
