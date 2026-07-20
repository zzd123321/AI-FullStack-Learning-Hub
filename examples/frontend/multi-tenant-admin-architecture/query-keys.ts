export interface DataScope {
  readonly subjectId: string;
  readonly tenantId: string;
  readonly policyVersion: string;
  readonly entitlementVersion: string;
  /** Changes on every tenant switch, even when switching back to the same ID. */
  readonly generation: number;
}

export const adminKeys = {
  root: (scope: DataScope) => [
    'admin', scope.subjectId, scope.tenantId,
    scope.policyVersion, scope.entitlementVersion, scope.generation,
  ] as const,
  members: (scope: DataScope, filterKey: string) => [
    ...adminKeys.root(scope), 'members', filterKey,
  ] as const,
  roles: (scope: DataScope) => [...adminKeys.root(scope), 'roles'] as const,
};

const ID = /^[A-Za-z0-9_-]{1,100}$/;

export function tenantStorageKey(
  scope: Pick<DataScope, 'subjectId' | 'tenantId'>,
  feature: string,
): string {
  if (!ID.test(scope.subjectId) || !ID.test(scope.tenantId)) throw new TypeError('Invalid data scope');
  if (!/^[A-Za-z0-9:_-]{1,80}$/.test(feature)) throw new TypeError('Invalid feature key');
  // Include the subject as well as the tenant for shared-device account switches.
  return `subject:${scope.subjectId}:tenant:${scope.tenantId}:${feature}`;
}
