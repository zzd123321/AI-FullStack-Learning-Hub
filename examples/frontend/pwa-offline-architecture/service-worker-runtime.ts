import { decideRoute } from './cache-policy.js';
import { cacheFirst, networkFirst, staleWhileRevalidate } from './cache-strategies.js';

interface LifetimeEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

interface WorkerFetchEvent extends LifetimeEvent {
  readonly request: Request;
  respondWith(response: Promise<Response> | Response): void;
}

interface WorkerMessageEvent extends LifetimeEvent {
  readonly data: unknown;
}

interface WorkerSyncEvent extends LifetimeEvent {
  readonly tag: string;
}

interface ServiceWorkerScope {
  readonly location: Location;
  readonly clients: { claim(): Promise<void> };
  skipWaiting(): Promise<void>;
  addEventListener(type: 'install' | 'activate', listener: (event: LifetimeEvent) => void): void;
  addEventListener(type: 'fetch', listener: (event: WorkerFetchEvent) => void): void;
  addEventListener(type: 'message', listener: (event: WorkerMessageEvent) => void): void;
  addEventListener(type: 'sync', listener: (event: WorkerSyncEvent) => void): void;
}

export interface WorkerConfig {
  readonly version: string;
  readonly precacheUrls: readonly string[];
  readonly flushOutbox?: () => Promise<void>;
}

export function installServiceWorker(scope: ServiceWorkerScope, config: WorkerConfig): void {
  const prefix = 'learning-app-';
  const precacheName = `${prefix}precache-${config.version}`;
  const runtimePrefix = `${prefix}runtime-${config.version}-`;

  scope.addEventListener('install', (event) => {
    event.waitUntil(caches.open(precacheName).then((cache) => cache.addAll([...config.precacheUrls])));
  });

  scope.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
      const names = await caches.keys();
      await Promise.all(names
        .filter((name) => name.startsWith(prefix)
          && name !== precacheName
          && !name.startsWith(runtimePrefix))
        .map((name) => caches.delete(name)));
      await scope.clients.claim();
    })());
  });

  scope.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') event.waitUntil(scope.skipWaiting());
  });

  const flushOutbox = config.flushOutbox;
  if (flushOutbox) {
    scope.addEventListener('sync', (event) => {
      if (event.tag === 'flush-outbox') event.waitUntil(flushOutbox());
    });
  }

  scope.addEventListener('fetch', (event) => {
    const decision = decideRoute(event.request, scope.location.origin);
    if (decision.strategy === 'network-only') return;
    if (!decision.cacheName) return;
    const cacheName = `${runtimePrefix}${decision.cacheName}`;
    if (decision.strategy === 'cache-first') {
      event.respondWith(cacheFirst(event.request, cacheName));
    } else if (decision.strategy === 'network-first') {
      event.respondWith(networkFirst(
        event.request, cacheName, decision.fallbackUrl,
        decision.cacheNetworkResponse, precacheName,
      ));
    } else {
      event.respondWith(staleWhileRevalidate(
        event.request, cacheName, (promise) => event.waitUntil(promise),
      ));
    }
  });
}
