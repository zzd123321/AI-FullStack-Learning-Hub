export interface Membership {
  readonly tenantId: string;
  readonly tenantName: string;
  readonly status: 'active' | 'suspended';
}

export interface SessionView {
  readonly userId: string;
  readonly memberships: readonly Membership[];
}

export interface TenantContext {
  readonly userId: string;
  readonly tenantId: string;
  readonly tenantName: string;
}

export function resolveTenantContext(
  session: SessionView,
  requestedTenantId: string,
): TenantContext | null {
  const membership = session.memberships.find(({ tenantId, status }) =>
    tenantId === requestedTenantId && status === 'active');
  return membership
    ? { userId: session.userId, tenantId: membership.tenantId, tenantName: membership.tenantName }
    : null;
}
