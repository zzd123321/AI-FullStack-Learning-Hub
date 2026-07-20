export interface SessionSummary {
  readonly userId: string;
  readonly displayName: string;
  readonly permissions: readonly string[];
}

export type SessionResponse =
  | { readonly authenticated: true; readonly session: SessionSummary }
  | { readonly authenticated: false; readonly reason: 'signed-out' | 'expired' };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isBoundedText(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

/** Parse the untrusted JSON returned by /session or /me. */
export function parseSessionResponse(value: unknown): SessionResponse | null {
  if (!isPlainObject(value) || typeof value.authenticated !== 'boolean') return null;

  if (!value.authenticated) {
    return value.reason === 'signed-out' || value.reason === 'expired'
      ? { authenticated: false, reason: value.reason }
      : null;
  }

  if (!isPlainObject(value.session)) return null;
  const { userId, displayName, permissions } = value.session;
  if (!isBoundedText(userId, 256)
    || !isBoundedText(displayName, 256)
    || !Array.isArray(permissions)
    || permissions.length > 500
    || !permissions.every((item) => isBoundedText(item, 128))) return null;

  // Copy and deduplicate data so later mutation of the decoded JSON cannot
  // silently change the application authorization projection.
  return {
    authenticated: true,
    session: { userId, displayName, permissions: [...new Set(permissions)] },
  };
}
