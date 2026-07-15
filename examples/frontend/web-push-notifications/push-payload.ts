export interface PushPayload {
  readonly version: 1;
  readonly notificationId: string;
  readonly title: string;
  readonly body?: string;
  readonly route: string;
  readonly tag?: string;
  readonly category: 'message' | 'task' | 'system';
}

const isSafeRoute = (value: string) => value.startsWith('/') && !value.startsWith('//');

export function parsePushPayload(value: unknown): PushPayload | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = value as Partial<PushPayload>;
  if (item.version !== 1
    || typeof item.notificationId !== 'string' || item.notificationId.length > 128
    || typeof item.title !== 'string' || item.title.length === 0 || item.title.length > 100
    || typeof item.route !== 'string' || !isSafeRoute(item.route)
    || !['message', 'task', 'system'].includes(item.category ?? '')) return null;
  if (item.body !== undefined && (typeof item.body !== 'string' || item.body.length > 240)) return null;
  if (item.tag !== undefined && (typeof item.tag !== 'string' || item.tag.length > 128)) return null;
  return item as PushPayload;
}
