export interface UpdateController {
  readonly supported: boolean;
  applyUpdate(): void;
  checkForUpdate(): Promise<void>;
  dispose(): void;
}

export function registerServiceWorker(
  scriptUrl: string,
  onWaiting: (registration: ServiceWorkerRegistration) => void,
  onError: (error: unknown) => void,
): UpdateController {
  if (!('serviceWorker' in navigator)) {
    return { supported: false, applyUpdate() {}, async checkForUpdate() {}, dispose() {} };
  }

  let registration: ServiceWorkerRegistration | null = null;
  let refreshing = false;
  const controllerChanged = () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', controllerChanged);

  const ready = navigator.serviceWorker.register(scriptUrl, {
    scope: '/', updateViaCache: 'none',
  }).then((value) => {
    registration = value;
    if (value.waiting) onWaiting(value);
    value.addEventListener('updatefound', () => {
      const installing = value.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) onWaiting(value);
      });
    });
    return value;
  });
  void ready.catch(onError);

  return {
    supported: true,
    applyUpdate() { registration?.waiting?.postMessage('SKIP_WAITING'); },
    async checkForUpdate() { await (registration ?? await ready).update(); },
    dispose() { navigator.serviceWorker.removeEventListener('controllerchange', controllerChanged); },
  };
}
