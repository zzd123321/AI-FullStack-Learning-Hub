export interface SubscriptionRecord {
  readonly id: string;
  readonly userId: string;
  readonly endpoint: string;
  readonly keys: { readonly p256dh: string; readonly auth: string };
  readonly userAgentFamily: string;
  readonly createdAt: number;
  readonly lastSeenAt: number;
  readonly disabledAt: number | null;
}

export function validateSubscriptionJson(value: PushSubscriptionJSON): void {
  const rawEndpoint = value.endpoint ?? '';
  let endpoint: URL;
  try {
    endpoint = new URL(rawEndpoint);
  } catch {
    throw new Error('Invalid push endpoint');
  }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) {
    throw new Error('Invalid push endpoint');
  }
  if (!value.keys?.p256dh || !value.keys.auth) throw new Error('Missing subscription encryption keys');
  if (rawEndpoint.length > 2048) throw new Error('Push endpoint is too long');
  const base64Url = /^[A-Za-z0-9_-]+$/;
  if (!base64Url.test(value.keys.p256dh) || value.keys.p256dh.length > 256) {
    throw new Error('Invalid p256dh key');
  }
  if (!base64Url.test(value.keys.auth) || value.keys.auth.length > 128) {
    throw new Error('Invalid auth secret');
  }
}
