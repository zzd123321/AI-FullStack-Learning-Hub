export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return null;

  try {
    const registration = await navigator.serviceWorker.register("/service-worker.js", {
      scope: "/",
      updateViaCache: "none",
      type: "module",
    });
    await registration.update();
    return registration;
  } catch (error) {
    console.error("Service worker registration failed", error);
    return null;
  }
}
