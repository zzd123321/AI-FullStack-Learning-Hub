import { parsePushPayload } from './push-payload.js';

interface LifetimeEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

interface PushEventLike extends LifetimeEvent {
  readonly data: { json(): unknown } | null;
}

interface NotificationClickEventLike extends LifetimeEvent {
  readonly action: string;
  readonly notification: Notification;
}

interface WindowClientLike {
  readonly url: string;
  focus(): Promise<WindowClientLike>;
  navigate(url: string): Promise<WindowClientLike | null>;
}

interface PushWorkerScope {
  readonly location: Location;
  readonly registration: ServiceWorkerRegistration;
  readonly clients: {
    matchAll(options: { type: 'window'; includeUncontrolled: boolean }): Promise<readonly WindowClientLike[]>;
    openWindow(url: string): Promise<WindowClientLike | null>;
  };
  addEventListener(type: 'push', listener: (event: PushEventLike) => void): void;
  addEventListener(type: 'notificationclick', listener: (event: NotificationClickEventLike) => void): void;
}

export function installPushHandlers(scope: PushWorkerScope): void {
  scope.addEventListener('push', (event) => {
    event.waitUntil((async () => {
      let payload = null;
      try { payload = parsePushPayload(event.data?.json()); } catch { /* use generic fallback */ }
      await scope.registration.showNotification(payload?.title ?? '有新的更新', {
        ...(payload?.body === undefined ? {} : { body: payload.body }),
        ...(payload?.tag === undefined ? {} : { tag: payload.tag }),
        data: { route: payload?.route ?? '/', notificationId: payload?.notificationId ?? null },
        icon: '/icons/notification-192.png',
        badge: '/icons/badge-96.png',
      });
    })());
  });

  scope.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil((async () => {
      const data: unknown = event.notification.data;
      const route = typeof data === 'object' && data !== null
        && typeof (data as { route?: unknown }).route === 'string'
        ? (data as { route: string }).route : '/';
      const target = new URL(route, scope.location.origin);
      if (target.origin !== scope.location.origin) return;
      const windows = await scope.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((client) => new URL(client.url).origin === target.origin);
      if (existing) {
        await existing.navigate(target.href);
        await existing.focus();
      } else {
        await scope.clients.openWindow(target.href);
      }
    })());
  });
}
