/// <reference lib="webworker" />

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE_VERSION = "learning-shell-v3";
// 不预缓存 "/"：入口 HTML 可能含用户数据。这里只保存明确公开的离线页。
const APP_SHELL = ["/offline.html"];

sw.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)));
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(keys.filter((key) => key.startsWith("learning-shell-") && key !== CACHE_VERSION)
        .map((key) => caches.delete(key)));
    }),
  );
});

async function navigateWithOfflineFallback(request: Request): Promise<Response> {
  try {
    // 任意导航可能是个性化页面，不写入 Cache API。
    return await fetch(request);
  } catch {
    return (await caches.match("/offline.html")) ??
      new Response("Offline", { status: 503 });
  }
}

async function cacheFirst(request: Request): Promise<Response> {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_VERSION);
    await cache.put(request, response.clone());
  }
  return response;
}

sw.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== sw.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(navigateWithOfflineFallback(request));
    return;
  }

  if (/\.[a-f0-9]{8,}\.(?:js|css|woff2|png|svg)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
