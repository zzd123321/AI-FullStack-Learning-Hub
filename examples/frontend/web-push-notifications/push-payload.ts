export interface PushPayload {
  readonly version: 1;
  readonly notificationId: string;
  readonly title: string;
  readonly body?: string;
  readonly route: string;
  readonly tag?: string;
  readonly category: 'message' | 'task' | 'system';
}

export function resolveSameOriginRoute(value: string, origin: string): URL | null {
  if (!value.startsWith('/')) return null;
  try {
    const target = new URL(value, origin);
    // URL parsing treats backslashes as slashes for special schemes. Comparing
    // the parsed origin also rejects values such as `/\\evil.example`.
    return target.origin === origin ? target : null;
  } catch {
    return null;
  }
}

const isSafeRoute = (value: string) =>
  resolveSameOriginRoute(value, 'https://push-route.invalid') !== null;

function isCategory(value: unknown): value is PushPayload['category'] {
  return value === 'message' || value === 'task' || value === 'system';
}

export function parsePushPayload(value: unknown): PushPayload | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = value as Partial<PushPayload>;
  if (item.version !== 1
    || typeof item.notificationId !== 'string' || item.notificationId.length === 0 || item.notificationId.length > 128
    || typeof item.title !== 'string' || item.title.length === 0 || item.title.length > 100
    || typeof item.route !== 'string' || !isSafeRoute(item.route)
    || !isCategory(item.category)) return null;
  if (item.body !== undefined && (typeof item.body !== 'string' || item.body.length > 240)) return null;
  if (item.tag !== undefined && (typeof item.tag !== 'string' || item.tag.length > 128)) return null;
  return {
    version: 1,
    notificationId: item.notificationId,
    title: item.title,
    route: item.route,
    category: item.category,
    ...(item.body === undefined ? {} : { body: item.body }),
    ...(item.tag === undefined ? {} : { tag: item.tag }),
  };
}
