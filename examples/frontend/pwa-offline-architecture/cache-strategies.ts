import { mayStore } from './cache-policy.js';

async function putIfAllowed(cache: Cache, request: Request, response: Response): Promise<void> {
  if (mayStore(response)) await cache.put(request, response.clone());
}

export async function cacheFirst(request: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  await putIfAllowed(cache, request, response);
  return response;
}

export async function networkFirst(
  request: Request,
  cacheName: string,
  fallbackUrl?: string,
): Promise<Response> {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.status >= 500) throw new TypeError(`Network response failed: ${response.status}`);
    await putIfAllowed(cache, request, response);
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw error;
  }
}

export async function staleWhileRevalidate(
  request: Request,
  cacheName: string,
  keepAlive: (promise: Promise<unknown>) => void,
): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const update = fetch(request).then(async (response) => {
    await putIfAllowed(cache, request, response);
    return response;
  });
  if (cached) {
    keepAlive(update.catch(() => undefined));
    return cached;
  }
  return update;
}
