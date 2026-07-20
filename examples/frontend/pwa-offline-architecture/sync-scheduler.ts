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
  onError: (error: unknown) => void,
): Promise<() => void> {
  const flush = () => { void flushInForeground().catch(onError); };
  // Foreground recovery remains installed even when Background Sync exists:
  // registration is not a guarantee that the browser will run it promptly.
  window.addEventListener('online', flush);
  if (navigator.onLine) await flushInForeground().catch(onError);

  if ('serviceWorker' in navigator) {
    try {
      // `ready` can remain pending forever when no active registration exists.
      // getRegistration() lets the foreground fallback finish setup promptly.
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration && supportsBackgroundSync(registration)) {
        await registration.sync.register('flush-outbox');
      }
    } catch {
      // Registration can be denied or fail even when the interface exists.
    }
  }
  return () => window.removeEventListener('online', flush);
}
