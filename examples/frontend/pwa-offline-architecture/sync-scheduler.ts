export interface SyncCapableRegistration extends ServiceWorkerRegistration {
  readonly sync: { register(tag: string): Promise<void> };
}

function supportsBackgroundSync(
  registration: ServiceWorkerRegistration,
): registration is SyncCapableRegistration {
  return 'sync' in registration;
}

export async function scheduleOutboxFlush(
  flushInForeground: () => Promise<void>,
): Promise<() => void> {
  const flush = () => { void flushInForeground(); };
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      if (supportsBackgroundSync(registration)) {
        await registration.sync.register('flush-outbox');
        return () => {};
      }
    } catch {
      // Registration can be denied or fail even when the interface exists.
    }
  }
  window.addEventListener('online', flush);
  if (navigator.onLine) await flushInForeground();
  return () => window.removeEventListener('online', flush);
}
