import { canRemoveMember, parseAuthorizationView } from './authorization.js';
import { selectedCount, toBulkCommand } from './bulk-selection.js';
import { adminKeys, tenantStorageKey } from './query-keys.js';
import { decideSupportAction, parseSupportSession, supportBanner } from './support-session.js';
import { parseSessionView, resolveTenantContext, type TenantContext } from './tenant-context.js';
import { switchTenant, TenantScopeCoordinator } from './tenant-switch.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, message: string): void {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, received ${String(actual)}`);
}

function deepEqual(actual: unknown, expected: unknown, message: string): void {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

function throws(run: () => unknown, message: string): void {
  try { run(); } catch { return; }
  throw new Error(message);
}

async function rejects(run: () => Promise<unknown>, message: string): Promise<void> {
  try { await run(); } catch { return; }
  throw new Error(message);
}

const rawSession = {
  subjectId: 'user_1',
  memberships: [
    {
      tenantId: 'acme', tenantName: 'Acme', status: 'active',
      policyVersion: 'policy_7', entitlementVersion: 'plan_3',
    },
    {
      tenantId: 'closed', tenantName: 'Closed', status: 'suspended',
      policyVersion: 'policy_2', entitlementVersion: 'plan_1',
    },
  ],
};
const session = parseSessionView(rawSession);
assert(session, 'a valid session view should parse');
equal(resolveTenantContext(session, 'unknown'), null, 'an unknown route tenant must be rejected');
equal(resolveTenantContext(session, 'closed'), null, 'a suspended membership must be rejected');
const acme = resolveTenantContext(session, 'acme');
assert(acme, 'an active membership should resolve a tenant context');
equal(acme.policyVersion, 'policy_7', 'the trusted context should carry its policy version');
equal(parseSessionView({
  ...rawSession,
  memberships: [rawSession.memberships[0], rawSession.memberships[0]],
}), null, 'duplicate tenant memberships should fail closed');

const auth = parseAuthorizationView({
  tenantId: 'acme',
  policyVersion: 'policy_7',
  permissions: ['member:remove'],
  constraints: { managedTeamIds: ['team_a'] },
}, 'acme');
assert(auth, 'a valid authorization projection should parse');
deepEqual(canRemoveMember(auth, 'user_1', {
  tenantId: 'acme', teamId: 'team_a', userId: 'user_2',
}), { allowed: true }, 'matching tenant, permission and scope should predict an allowed action');
deepEqual(canRemoveMember(auth, 'user_1', {
  tenantId: 'other', teamId: 'team_a', userId: 'user_2',
}), { allowed: false, reason: 'wrong_tenant' }, 'tenant isolation should be checked first');
equal(parseAuthorizationView({
  tenantId: 'acme', policyVersion: 'policy_7',
  permissions: ['made-up:permission'], constraints: { managedTeamIds: [] },
}, 'acme'), null, 'unknown permissions should fail closed');

const scopeA = {
  subjectId: 'user_1', tenantId: 'acme',
  policyVersion: 'policy_7', entitlementVersion: 'plan_3', generation: 1,
};
const scopeB = { ...scopeA, tenantId: 'other' };
assert(JSON.stringify(adminKeys.members(scopeA, 'active'))
  !== JSON.stringify(adminKeys.members(scopeB, 'active')), 'query keys must separate tenants');
assert(JSON.stringify(adminKeys.members(scopeA, 'active'))
  !== JSON.stringify(adminKeys.members({ ...scopeA, generation: 2 }, 'active')),
  'a new tenant generation should not reuse old in-flight/cache identity');
equal(tenantStorageKey(scopeA, 'member:columns'),
  'subject:user_1:tenant:acme:member:columns', 'storage should include subject and tenant');
throws(() => tenantStorageKey({ subjectId: 'user_1', tenantId: '../other' }, 'member:columns'),
  'storage scope injection must be rejected');

const coordinator = new TenantScopeCoordinator();
const oldScope = coordinator.activate(acme);
const nextContext: TenantContext = {
  subjectId: 'user_1', tenantId: 'other', tenantName: 'Other',
  policyVersion: 'policy_1', entitlementVersion: 'plan_1',
};
const cleanupSteps: string[] = [];
const nextScope = await switchTenant({
  abortRequests: () => { cleanupSteps.push('abort'); },
  closeRealtime: () => { cleanupSteps.push('realtime'); },
  clearSensitiveCaches: () => { cleanupSteps.push('cache'); return Promise.resolve(); },
  resetStores: () => { cleanupSteps.push('stores'); },
  navigate: (path) => { cleanupSteps.push(path); return Promise.resolve(); },
}, coordinator, nextContext);
equal(cleanupSteps.includes('abort'), true, 'tenant switch should abort old requests');
equal(cleanupSteps.includes('cache'), true, 'tenant switch should clear sensitive caches');
equal(coordinator.accepts({
  subjectId: oldScope.context.subjectId,
  tenantId: oldScope.context.tenantId,
  generation: oldScope.generation,
}), false, 'a response from the old generation must be rejected');
equal(coordinator.accepts({
  subjectId: nextScope.context.subjectId,
  tenantId: nextScope.context.tenantId,
  generation: nextScope.generation,
}), true, 'the new scope should accept matching responses');

const failedCoordinator = new TenantScopeCoordinator();
failedCoordinator.activate(acme);
await rejects(() => switchTenant({
  abortRequests: () => undefined,
  closeRealtime: () => undefined,
  clearSensitiveCaches: () => Promise.reject(new Error('cache unavailable')),
  resetStores: () => undefined,
  navigate: () => Promise.resolve(),
}, failedCoordinator, nextContext), 'failed sensitive cleanup should block tenant activation');
equal(failedCoordinator.current(), null, 'cleanup failure should leave no active tenant scope');

const selection = {
  mode: 'all-matching' as const,
  queryToken: 'query.token_abcdefghijklmnop',
  excludedIds: new Set(['user_9']),
};
equal(selectedCount(selection, 20), 19, 'all-matching count should subtract exclusions');
equal(toBulkCommand(selection, {
  operationId: 'operation_1', tenantId: 'acme', expectedPolicyVersion: 'policy_7',
}).selection.mode, 'all-matching', 'bulk selection should serialize as a server command');
throws(() => selectedCount(selection, -1), 'negative matching counts must be rejected');

const support = parseSupportSession({
  sessionId: 'support_session_1',
  supportActorId: 'support_1',
  representedUserId: 'user_1',
  tenantId: 'acme',
  expiresAt: 2_000,
  reason: 'ticket-123',
  allowedActions: ['member:read', 'support_note:create'],
}, 'acme');
assert(support, 'a valid support session should parse');
assert(supportBanner(support, 1_000).includes('support_1'), 'banner should preserve the real support actor');
deepEqual(decideSupportAction(support, 'support_note:create', 1_000), { allowed: true },
  'a delegated low-risk support action may be predicted as allowed');
deepEqual(decideSupportAction(support, 'payment:refund', 1_000), {
  allowed: false, reason: 'always_blocked',
}, 'sensitive actions must remain blocked even in an assist session');
deepEqual(decideSupportAction(support, 'member:read', 2_001), {
  allowed: false, reason: 'expired',
}, 'expired support sessions must fail closed');

console.log('multi-tenant admin runtime examples passed');
