export interface DeepLinkTarget {
  readonly route: '/lesson' | '/settings' | '/notifications';
  readonly params: Readonly<Record<string, string>>;
}

const PARAMS_BY_ROUTE: Readonly<Record<DeepLinkTarget['route'], ReadonlySet<string>>> = {
  '/lesson': new Set(['id']),
  '/settings': new Set(['section']),
  '/notifications': new Set(['id']),
};

function hasDuplicateSearchKeys(search: URLSearchParams): boolean {
  const keys = [...search.keys()];
  return new Set(keys).size !== keys.length;
}

export function parseDeepLink(raw: string, expectedScheme: string): DeepLinkTarget | null {
  if (raw.length > 2048 || !/^[a-z][a-z0-9+.-]*$/i.test(expectedScheme)) return null;

  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== `${expectedScheme.toLowerCase()}:`
    || url.username || url.password || url.port || url.hash
    || hasDuplicateSearchKeys(url.searchParams)) return null;

  const candidate = `/${url.hostname}${url.pathname}`.replace(/\/{2,}/g, '/');
  if (!(candidate in PARAMS_BY_ROUTE)) return null;
  const route = candidate as DeepLinkTarget['route'];
  const allowedParams = PARAMS_BY_ROUTE[route];
  const params: Record<string, string> = {};

  for (const [key, value] of url.searchParams) {
    // Reject the whole link instead of silently dropping suspicious input.
    if (!allowedParams.has(key) || key.length > 64 || value.length > 256) return null;
    params[key] = value;
  }

  if (route === '/lesson' && !/^\d{1,20}$/.test(params.id ?? '')) return null;
  if (route === '/settings' && params.section !== undefined
    && !['account', 'appearance', 'notifications'].includes(params.section)) return null;
  if (route === '/notifications' && params.id !== undefined
    && !/^[A-Za-z0-9_-]{1,128}$/.test(params.id)) return null;

  return { route, params };
}
