export type CacheStrategy =
  | 'network-only'
  | 'network-first'
  | 'cache-first'
  | 'stale-while-revalidate';

export interface RouteDecision {
  readonly strategy: CacheStrategy;
  readonly cacheName?: string;
  readonly fallbackUrl?: string;
}

export type RequestDescriptor = Pick<Request, 'method' | 'url' | 'mode' | 'destination'>;

export function decideRoute(request: RequestDescriptor, appOrigin: string): RouteDecision {
  if (request.method !== 'GET') return { strategy: 'network-only' };
  const url = new URL(request.url);
  if (url.origin !== appOrigin) return { strategy: 'network-only' };
  if (request.mode === 'navigate') {
    return { strategy: 'network-first', cacheName: 'pages', fallbackUrl: '/offline.html' };
  }
  if (url.pathname.startsWith('/assets/') && /\.[a-f0-9]{8,}\./.test(url.pathname)) {
    return { strategy: 'cache-first', cacheName: 'immutable-assets' };
  }
  if (request.destination === 'image') {
    return { strategy: 'stale-while-revalidate', cacheName: 'images' };
  }
  return { strategy: 'network-only' };
}

export function mayStore(response: Response): boolean {
  const cacheControl = response.headers.get('Cache-Control') ?? '';
  const directives = cacheControl.split(',').map((value) => value.trim().toLowerCase());
  return response.ok && response.type !== 'opaque'
    && !response.headers.has('Set-Cookie')
    && !directives.includes('no-store');
}
