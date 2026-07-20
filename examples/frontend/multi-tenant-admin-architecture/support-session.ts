export const SUPPORT_ACTIONS = [
  'member:read', 'settings:read', 'support_note:create',
] as const;
export type SupportAction = typeof SUPPORT_ACTIONS[number];

export interface SupportSession {
  readonly sessionId: string;
  readonly supportActorId: string;
  readonly representedUserId: string;
  readonly tenantId: string;
  readonly expiresAt: number;
  readonly reason: string;
  readonly allowedActions: ReadonlySet<SupportAction>;
}

export type SupportDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: 'expired' | 'not_delegated' | 'always_blocked' };

const ID = /^[A-Za-z0-9_-]{1,120}$/;
const ACTION_SET = new Set<string>(SUPPORT_ACTIONS);
const ALWAYS_BLOCKED = new Set([
  'billing:write', 'payment:refund', 'secret:read', 'mfa:reset', 'tenant:delete',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseSupportSession(value: unknown, expectedTenantId: string): SupportSession | null {
  if (!ID.test(expectedTenantId)) return null;
  if (!isPlainObject(value)
    || typeof value.sessionId !== 'string' || !ID.test(value.sessionId)
    || typeof value.supportActorId !== 'string' || !ID.test(value.supportActorId)
    || typeof value.representedUserId !== 'string' || !ID.test(value.representedUserId)
    || typeof value.tenantId !== 'string' || !ID.test(value.tenantId)
    || value.tenantId !== expectedTenantId
    || !Number.isSafeInteger(value.expiresAt) || (value.expiresAt as number) < 0
    || typeof value.reason !== 'string' || value.reason.length < 1 || value.reason.length > 500
    || !Array.isArray(value.allowedActions) || value.allowedActions.length > SUPPORT_ACTIONS.length
    || !value.allowedActions.every((item) => typeof item === 'string' && ACTION_SET.has(item))) return null;

  return {
    sessionId: value.sessionId,
    supportActorId: value.supportActorId,
    representedUserId: value.representedUserId,
    tenantId: value.tenantId,
    expiresAt: value.expiresAt as number,
    reason: value.reason,
    allowedActions: new Set(value.allowedActions as SupportAction[]),
  };
}

export function supportBanner(session: SupportSession, now = Date.now()): string {
  if (session.expiresAt <= now) return '支持会话已过期，请立即退出。';
  return `支持人员 ${session.supportActorId} 正在代表用户 ${session.representedUserId}；所有操作都会审计。`;
}

/** UI projection only; the server repeats the same action check on every request. */
export function decideSupportAction(
  session: SupportSession,
  action: string,
  now = Date.now(),
): SupportDecision {
  if (session.expiresAt <= now) return { allowed: false, reason: 'expired' };
  if (ALWAYS_BLOCKED.has(action)) return { allowed: false, reason: 'always_blocked' };
  return session.allowedActions.has(action as SupportAction)
    ? { allowed: true }
    : { allowed: false, reason: 'not_delegated' };
}
