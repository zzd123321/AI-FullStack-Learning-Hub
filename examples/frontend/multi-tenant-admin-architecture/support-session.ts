export interface SupportSession {
  readonly supportActorId: string;
  readonly representedUserId: string;
  readonly tenantId: string;
  readonly expiresAt: number;
  readonly reason: string;
  readonly readOnly: boolean;
}

export function supportBanner(session: SupportSession, now = Date.now()): string {
  if (session.expiresAt <= now) return '支持会话已过期，请退出并重新验证。';
  const mode = session.readOnly ? '只读查看' : '受控操作';
  return `支持人员正在代表用户 ${session.representedUserId} 进行${mode}；所有操作都会审计。`;
}

export const canPerformDestructiveAction = (
  session: SupportSession,
  now = Date.now(),
): boolean => !session.readOnly && session.expiresAt > now;
