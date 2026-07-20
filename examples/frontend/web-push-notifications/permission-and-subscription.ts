export type PushCapability =
  | { readonly supported: false; readonly reason: string }
  | { readonly supported: true; readonly permission: NotificationPermission };

export interface SubscriptionApi {
  save(subscription: PushSubscriptionJSON): Promise<void>;
  remove(endpoint: string): Promise<void>;
}

export function inspectPushCapability(): PushCapability {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { supported: false, reason: '当前浏览器不支持 Web Push' };
  }
  return { supported: true, permission: Notification.permission };
}

export async function requestNotificationPermissionFromUserGesture(): Promise<NotificationPermission> {
  const capability = inspectPushCapability();
  if (!capability.supported) throw new Error(capability.reason);
  if (capability.permission !== 'default') return capability.permission;
  return Notification.requestPermission();
}

export function decodeVapidPublicKey(base64Url: string): ArrayBuffer {
  const padding = '='.repeat((4 - base64Url.length % 4) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.length !== 65 || bytes[0] !== 0x04) throw new Error('Invalid uncompressed P-256 public key');
  return bytes.buffer;
}

function sameKey(left: ArrayBuffer | null, right: ArrayBuffer): boolean {
  if (left === null) return false;
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export async function ensurePushSubscription(
  registration: ServiceWorkerRegistration,
  vapidPublicKey: string,
  api: SubscriptionApi,
): Promise<PushSubscription> {
  if (Notification.permission !== 'granted') throw new Error('Notification permission is not granted');
  const applicationServerKey = decodeVapidPublicKey(vapidPublicKey);
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !sameKey(subscription.options.applicationServerKey, applicationServerKey)) {
    const oldEndpoint = subscription.endpoint;
    await subscription.unsubscribe();
    // Remove the old server record during planned key rotation instead of
    // waiting for a future delivery attempt to discover a 404/410 response.
    await api.remove(oldEndpoint);
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });
  await api.save(subscription.toJSON());
  return subscription;
}

export async function disablePush(
  registration: ServiceWorkerRegistration,
  api: SubscriptionApi,
): Promise<void> {
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  // Stop server-side delivery first. If the browser-side unsubscribe then
  // fails, user intent is still respected and a later reconciliation can retry.
  await api.remove(endpoint);
  await subscription.unsubscribe();
}
