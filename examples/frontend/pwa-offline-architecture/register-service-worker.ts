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
  let disposed = false;
  let observedInstalling: ServiceWorker | null = null;
  // First installation can call clients.claim(). That should not reload the
  // page that just registered the worker. Existing controlled pages do reload
  // when a new controller takes over so page and worker versions realign.
  let reloadOnControllerChange = navigator.serviceWorker.controller !== null;
  const controllerChanged = () => {
    if (disposed || !reloadOnControllerChange || refreshing) return;
    refreshing = true;
    location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', controllerChanged);

  const installingStateChanged = () => {
    if (!observedInstalling) return;

    if (
      !disposed
      && observedInstalling.state === 'installed'
      && navigator.serviceWorker.controller
      && registration
    ) {
      onWaiting(registration);
    }

    // An installation attempt is finished once it becomes installed or
    // redundant. Stop observing it so dispose() owns every listener it creates.
    if (observedInstalling.state === 'installed' || observedInstalling.state === 'redundant') {
      observedInstalling.removeEventListener('statechange', installingStateChanged);
      observedInstalling = null;
    }
  };

  const updateFound = () => {
    observedInstalling?.removeEventListener('statechange', installingStateChanged);
    observedInstalling = registration?.installing ?? null;
    observedInstalling?.addEventListener('statechange', installingStateChanged);
  };

  const ready = navigator.serviceWorker.register(scriptUrl, {
    scope: '/', updateViaCache: 'none',
  }).then((value) => {
    registration = value;
    // Registration is asynchronous. The owner may have unmounted before it
    // resolves, so never attach new listeners after dispose().
    if (disposed) return value;
    if (value.waiting) onWaiting(value);
    value.addEventListener('updatefound', updateFound);
    // The registration may already be installing when register() resolves.
    // Observe it immediately instead of waiting for an event that already ran.
    if (value.installing) updateFound();
    return value;
  });
  void ready.catch((error: unknown) => {
    if (!disposed) onError(error);
  });

  return {
    supported: true,
    applyUpdate() {
      const waiting = registration?.waiting;
      if (!waiting) return;
      reloadOnControllerChange = true;
      waiting.postMessage('SKIP_WAITING');
    },
    async checkForUpdate() { await (registration ?? await ready).update(); },
    dispose() {
      disposed = true;
      navigator.serviceWorker.removeEventListener('controllerchange', controllerChanged);
      registration?.removeEventListener('updatefound', updateFound);
      observedInstalling?.removeEventListener('statechange', installingStateChanged);
      observedInstalling = null;
    },
  };
}
