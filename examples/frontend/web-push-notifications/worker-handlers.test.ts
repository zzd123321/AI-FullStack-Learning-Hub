import { installPushHandlers, type PushWorkerScope } from './service-worker-push.js';

type Listener = (event: any) => void;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const listeners = new Map<string, Listener>();
const shown: Array<{ title: string; options?: NotificationOptions }> = [];
const navigated: string[] = [];
let focusCount = 0;
let opened: string | null = null;

const windowClient = {
  url: 'https://app.example/inbox',
  async focus() {
    focusCount += 1;
    return this;
  },
  async navigate(url: string) {
    navigated.push(url);
    return this;
  },
};

const scope = {
  location: { origin: 'https://app.example' },
  registration: {
    async showNotification(title: string, options?: NotificationOptions) {
      shown.push({ title, ...(options === undefined ? {} : { options }) });
    },
  },
  clients: {
    async matchAll() { return [windowClient]; },
    async openWindow(url: string) {
      opened = url;
      return windowClient;
    },
  },
  addEventListener(type: string, listener: Listener) {
    listeners.set(type, listener);
  },
} as unknown as PushWorkerScope;

installPushHandlers(scope);

async function dispatch(type: string, event: Record<string, unknown>): Promise<void> {
  let lifetime: Promise<unknown> | null = null;
  listeners.get(type)?.({
    ...event,
    waitUntil(promise: Promise<unknown>) { lifetime = promise; },
  });
  assert(lifetime, `${type} handler must call waitUntil`);
  await lifetime;
}

await dispatch('push', {
  data: {
    json: () => ({
      version: 1,
      notificationId: 'notification-1',
      title: '任务已更新',
      route: '/tasks/42',
      category: 'task',
    }),
  },
});
assert(shown[0]?.title === '任务已更新', 'valid payload should be shown');
assert(
  (shown[0]?.options?.data as { route?: unknown }).route === '/tasks/42',
  'safe route should be stored in notification data',
);

let closed = false;
await dispatch('notificationclick', {
  action: '',
  notification: {
    data: { route: '/tasks/42' },
    close() { closed = true; },
  },
});
assert(closed, 'click should close the notification');
assert(navigated[0] === 'https://app.example/tasks/42', 'existing window should navigate safely');
assert(focusCount === 1, 'existing window should be focused');

await dispatch('notificationclick', {
  action: '',
  notification: {
    data: { route: '/\\evil.example' },
    close() {},
  },
});
assert(opened === null, 'cross-origin route must not open a window');

console.log('web push worker handler examples passed');
