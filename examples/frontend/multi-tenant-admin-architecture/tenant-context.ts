export interface Membership {
  readonly tenantId: string;
  readonly tenantName: string;
  readonly status: 'active' | 'suspended';
  readonly policyVersion: string;
  readonly entitlementVersion: string;
}

export interface SessionView {
  readonly subjectId: string;
  readonly memberships: readonly Membership[];
}

export interface TenantContext {
  readonly subjectId: string;
  readonly tenantId: string;
  readonly tenantName: string;
  readonly policyVersion: string;
  readonly entitlementVersion: string;
}

const ID = /^[A-Za-z0-9_-]{1,100}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseMembership(value: unknown): Membership | null {
  if (!isPlainObject(value)
    || typeof value.tenantId !== 'string' || !ID.test(value.tenantId)
    || typeof value.tenantName !== 'string' || value.tenantName.length < 1 || value.tenantName.length > 200
    || (value.status !== 'active' && value.status !== 'suspended')
    || typeof value.policyVersion !== 'string' || !ID.test(value.policyVersion)
    || typeof value.entitlementVersion !== 'string' || !ID.test(value.entitlementVersion)) return null;
  return {
    tenantId: value.tenantId,
    tenantName: value.tenantName,
    status: value.status,
    policyVersion: value.policyVersion,
    entitlementVersion: value.entitlementVersion,
  };
}

/** Validate the untrusted /session response before resolving a route tenant. */
export function parseSessionView(value: unknown): SessionView | null {
  if (!isPlainObject(value)
    || typeof value.subjectId !== 'string' || !ID.test(value.subjectId)
    || !Array.isArray(value.memberships) || value.memberships.length > 1_000) return null;

  const memberships: Membership[] = [];
  const seen = new Set<string>();
  for (const item of value.memberships) {
    const membership = parseMembership(item);
    if (!membership || seen.has(membership.tenantId)) return null;
    seen.add(membership.tenantId);
    memberships.push(membership);
  }
  return { subjectId: value.subjectId, memberships };
}

export function resolveTenantContext(
  session: SessionView,
  requestedTenantId: string,
): TenantContext | null {
  if (!ID.test(requestedTenantId)) return null;
  const membership = session.memberships.find(({ tenantId, status }) =>
    tenantId === requestedTenantId && status === 'active');
  return membership ? {
    subjectId: session.subjectId,
    tenantId: membership.tenantId,
    tenantName: membership.tenantName,
    policyVersion: membership.policyVersion,
    entitlementVersion: membership.entitlementVersion,
  } : null;
}
