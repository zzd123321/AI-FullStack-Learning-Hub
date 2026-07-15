const CACHE_NAME = "learning-public-responses-v2";

export async function cachePublicResponse(request: Request, response: Response): Promise<void> {
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== location.origin ||
    request.headers.has("authorization") ||
    !response.ok ||
    response.headers.get("x-app-cache-scope") !== "public" ||
    response.headers.get("cache-control")?.includes("no-store")
  ) {
    return;
  }
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
}

export async function matchPublicResponse(request: Request): Promise<Response | null> {
  const cache = await caches.open(CACHE_NAME);
  return (await cache.match(request)) ?? null;
}

export async function deleteOldResponseCaches(): Promise<void> {
  const keys = await caches.keys();
  await Promise.all(keys
    .filter((key) => key.startsWith("learning-public-responses-") && key !== CACHE_NAME)
    .map((key) => caches.delete(key)));
}
