import { installServiceWorker } from './service-worker-runtime.js';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

type Listener = (event: any) => void;
const listeners = new Map<string, Listener>();
let claimed = 0;
let skipped = 0;
let flushed = 0;
let precached: readonly string[] = [];
const deletedCaches: string[] = [];

Object.defineProperty(globalThis, 'caches', {
  configurable: true,
  value: {
    async open(name: string) {
      return {
        async addAll(urls: readonly string[]) { precached = urls; },
        async match(request: RequestInfo | URL) {
          const url = typeof request === 'string' ? request : request.toString();
          return name === 'learning-app-precache-v2' && url.endsWith('/offline.html')
            ? new Response('offline-v2') : undefined;
        },
        async put() {},
      };
    },
    async keys() {
      return ['learning-app-precache-v1', 'learning-app-runtime-v1-images', 'another-app-cache'];
    },
    async delete(name: string) {
      deletedCaches.push(name);
      return true;
    },
  },
});
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  value: async () => { throw new TypeError('offline'); },
});

const scope = {
  location: new URL('https://learn.example') as unknown as Location,
  clients: { async claim() { claimed += 1; } },
  async skipWaiting() { skipped += 1; },
  addEventListener(type: string, listener: Listener) { listeners.set(type, listener); },
};

installServiceWorker(scope, {
  version: 'v2',
  precacheUrls: ['/offline.html'],
  async flushOutbox() { flushed += 1; },
});

const runLifetimeEvent = async (type: string, extra: Record<string, unknown> = {}) => {
  let lifetime: Promise<unknown> | null = null;
  listeners.get(type)?.({
    ...extra,
    waitUntil(promise: Promise<unknown>) { lifetime = promise; },
  });
  if (lifetime) await lifetime;
};

await runLifetimeEvent('install');
assert(JSON.stringify(precached) === '["/offline.html"]', 'Install must precache the configured shell');

await runLifetimeEvent('activate');
assert(claimed === 1, 'Activate must claim clients for the documented update protocol');
assert(deletedCaches.includes('learning-app-precache-v1'), 'Old application caches must be removed');
assert(!deletedCaches.includes('another-app-cache'), 'Other applications\' caches must be preserved');

await runLifetimeEvent('message', { data: 'SKIP_WAITING' });
assert(skipped === 1, 'Explicit update approval must call skipWaiting');

await runLifetimeEvent('sync', { tag: 'unrelated' });
assert(flushed === 0, 'Unrelated sync tags must be ignored');
await runLifetimeEvent('sync', { tag: 'flush-outbox' });
assert(flushed === 1, 'The outbox sync promise must be attached to waitUntil');

let navigationResponse: Promise<Response> | null = null;
listeners.get('fetch')?.({
  request: {
    method: 'GET', url: 'https://learn.example/course', mode: 'navigate', destination: 'document',
  } as unknown as Request,
  waitUntil() {},
  respondWith(response: Promise<Response>) { navigationResponse = response; },
});
assert(navigationResponse !== null, 'Navigation must be handled by network-first');
assert(await (await navigationResponse!).text() === 'offline-v2', 'Fallback must come from the current precache');

console.log('PWA worker runtime examples passed');
