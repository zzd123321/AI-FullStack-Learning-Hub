export const PERMISSIONS = [
  'member:read', 'member:invite', 'member:remove',
  'role:read', 'role:write', 'billing:read', 'billing:write',
] as const;
export type Permission = typeof PERMISSIONS[number];

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

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const PERMISSION_SET = new Set<string>(PERMISSIONS);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Convert JSON arrays to bounded, immutable-by-convention Set projections. */
export function parseAuthorizationView(value: unknown, expectedTenantId: string): AuthorizationView | null {
  if (!ID.test(expectedTenantId)) return null;
  if (!isPlainObject(value)
    || typeof value.tenantId !== 'string' || !ID.test(value.tenantId)
    || value.tenantId !== expectedTenantId
    || typeof value.policyVersion !== 'string' || !ID.test(value.policyVersion)
    || !Array.isArray(value.permissions) || value.permissions.length > PERMISSIONS.length
    || !value.permissions.every((item) => typeof item === 'string' && PERMISSION_SET.has(item))
    || !isPlainObject(value.constraints)
    || !Array.isArray(value.constraints.managedTeamIds)
    || value.constraints.managedTeamIds.length > 500
    || !value.constraints.managedTeamIds.every((item) => typeof item === 'string' && ID.test(item))) return null;

  return {
    tenantId: value.tenantId,
    policyVersion: value.policyVersion,
    permissions: new Set(value.permissions as Permission[]),
    constraints: { managedTeamIds: new Set(value.constraints.managedTeamIds as string[]) },
  };
}

export function canRemoveMember(
  auth: AuthorizationView,
  actorUserId: string,
  member: MemberResource,
): Decision {
  // Check the isolation boundary first; later reasons must not reveal whether
  // a resource in another tenant would otherwise match a permission or team.
  if (member.tenantId !== auth.tenantId) return { allowed: false, reason: 'wrong_tenant' };
  if (!auth.permissions.has('member:remove')) return { allowed: false, reason: 'missing_permission' };
  if (!auth.constraints.managedTeamIds.has(member.teamId)) return { allowed: false, reason: 'outside_scope' };
  if (member.userId === actorUserId) return { allowed: false, reason: 'self_action' };
  return { allowed: true };
}
