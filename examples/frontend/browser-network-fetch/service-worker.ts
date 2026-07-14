/// <reference lib="webworker" />

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE_VERSION = "learning-shell-v3";
const APP_SHELL = ["/", "/offline.html"];

sw.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)));
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(keys.filter((key) => key.startsWith("learning-shell-") && key !== CACHE_VERSION)
        .map((key) => caches.delete(key)));
      await sw.clients.claim();
    }),
  );
});

async function networkFirst(request: Request): Promise<Response> {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) ??
      (await caches.match("/offline.html")) ??
      new Response("Offline", { status: 503 });
  }
}

sw.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== sw.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (/\.[a-f0-9]{8,}\.(?:js|css|woff2|png|svg)$/.test(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
  }
});
