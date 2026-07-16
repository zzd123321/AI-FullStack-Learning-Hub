export interface DataScope {
  readonly subjectId: string;
  readonly tenantId: string;
  readonly policyVersion: string;
}

export const adminKeys = {
  root: (scope: DataScope) => ['admin', scope.subjectId, scope.tenantId, scope.policyVersion] as const,
  members: (scope: DataScope, filter: string) => [...adminKeys.root(scope), 'members', filter] as const,
  roles: (scope: DataScope) => [...adminKeys.root(scope), 'roles'] as const,
};

export function tenantStorageKey(tenantId: string, feature: string): string {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(tenantId)) throw new TypeError('Invalid tenant ID');
  if (!/^[a-zA-Z0-9:_-]{1,80}$/.test(feature)) throw new TypeError('Invalid feature key');
  return `tenant:${tenantId}:${feature}`;
}
