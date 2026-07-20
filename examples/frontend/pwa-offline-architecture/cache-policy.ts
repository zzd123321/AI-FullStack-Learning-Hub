export type CacheStrategy =
  | 'network-only'
  | 'network-first'
  | 'cache-first'
  | 'stale-while-revalidate';

export interface RouteDecision {
  readonly strategy: CacheStrategy;
  readonly cacheName?: string;
  readonly fallbackUrl?: string;
  readonly cacheNetworkResponse?: boolean;
}

export type RequestDescriptor = Pick<Request, 'method' | 'url' | 'mode' | 'destination'>;

export function decideRoute(request: RequestDescriptor, appOrigin: string): RouteDecision {
  if (request.method !== 'GET') return { strategy: 'network-only' };
  const url = new URL(request.url);
  if (url.origin !== appOrigin) return { strategy: 'network-only' };
  if (request.mode === 'navigate') {
    // A generic navigation may contain identity data. Use the precached offline
    // page as fallback, but do not persist arbitrary HTML by default.
    return {
      strategy: 'network-first', cacheName: 'pages', fallbackUrl: '/offline.html',
      cacheNetworkResponse: false,
    };
  }
  if (url.pathname.startsWith('/assets/') && /\.[a-f0-9]{8,}\./.test(url.pathname)) {
    return { strategy: 'cache-first', cacheName: 'immutable-assets' };
  }
  if (request.destination === 'image' && url.pathname.startsWith('/public-media/')) {
    return { strategy: 'stale-while-revalidate', cacheName: 'images' };
  }
  return { strategy: 'network-only' };
}

export function mayStore(response: Response): boolean {
  const cacheControl = response.headers.get('Cache-Control') ?? '';
  const directives = cacheControl.split(',').map((value) => value.trim().toLowerCase());
  const vary = response.headers.get('Vary') ?? '';
  return response.ok && response.status !== 206 && response.type !== 'opaque'
    && !response.headers.has('Set-Cookie')
    && !directives.includes('no-store')
    && !directives.includes('private')
    && !vary.split(',').some((value) => value.trim() === '*');
}
