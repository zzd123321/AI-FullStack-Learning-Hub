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
  if (!value.endpoint?.startsWith('https://')) throw new Error('Invalid push endpoint');
  if (!value.keys?.p256dh || !value.keys.auth) throw new Error('Missing subscription encryption keys');
  if (value.endpoint.length > 2048) throw new Error('Push endpoint is too long');
}
