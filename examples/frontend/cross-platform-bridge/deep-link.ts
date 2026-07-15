export interface DeepLinkTarget { readonly route: string; readonly params: Readonly<Record<string, string>> }

export function parseDeepLink(raw: string, expectedScheme: string): DeepLinkTarget | null {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== `${expectedScheme}:`) return null;
  const route = `/${url.host}${url.pathname}`.replace(/\/{2,}/g, '/');
  if (!['/lesson', '/settings', '/notifications'].includes(route)) return null;
  const params = Object.fromEntries([...url.searchParams].filter(([key, value]) => key.length <= 64 && value.length <= 256));
  return { route, params };
}
