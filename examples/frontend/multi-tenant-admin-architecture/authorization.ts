export type Permission =
  | 'member:read' | 'member:invite' | 'member:remove'
  | 'role:read' | 'role:write' | 'billing:read' | 'billing:write';

export interface AuthorizationView {
  readonly tenantId: string;
  readonly policyVersion: string;
  readonly permissions: ReadonlySet<Permission>;
  readonly constraints: Readonly<{ managedTeamIds: ReadonlySet<string> }>;
}

export interface MemberResource {
  readonly tenantId: string;
  readonly teamId: string;
  readonly userId: string;
}

export type Decision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: 'wrong_tenant' | 'missing_permission' | 'outside_scope' | 'self_action' };

export function canRemoveMember(
  auth: AuthorizationView,
  actorUserId: string,
  member: MemberResource,
): Decision {
  if (member.tenantId !== auth.tenantId) return { allowed: false, reason: 'wrong_tenant' };
  if (!auth.permissions.has('member:remove')) return { allowed: false, reason: 'missing_permission' };
  if (!auth.constraints.managedTeamIds.has(member.teamId)) return { allowed: false, reason: 'outside_scope' };
  if (member.userId === actorUserId) return { allowed: false, reason: 'self_action' };
  return { allowed: true };
}
