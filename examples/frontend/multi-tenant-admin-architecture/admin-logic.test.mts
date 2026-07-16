import assert from 'node:assert/strict';
import { canRemoveMember } from './authorization.ts';
import { selectedCount, toBulkCommand } from './bulk-selection.ts';
import { adminKeys, tenantStorageKey } from './query-keys.ts';
import { canPerformDestructiveAction, supportBanner } from './support-session.ts';
import { resolveTenantContext } from './tenant-context.ts';

const session = {
  userId: 'user-1',
  memberships: [
    { tenantId: 'acme', tenantName: 'Acme', status: 'active' as const },
    { tenantId: 'closed', tenantName: 'Closed', status: 'suspended' as const },
  ],
};
assert.equal(resolveTenantContext(session, 'unknown'), null);
assert.equal(resolveTenantContext(session, 'closed'), null);
assert.equal(resolveTenantContext(session, 'acme')?.tenantName, 'Acme');

const auth = {
  tenantId: 'acme', policyVersion: 'v7',
  permissions: new Set(['member:remove'] as const),
  constraints: { managedTeamIds: new Set(['team-a']) },
};
assert.deepEqual(canRemoveMember(auth, 'user-1', {
  tenantId: 'acme', teamId: 'team-a', userId: 'user-2',
}), { allowed: true });
assert.deepEqual(canRemoveMember(auth, 'user-1', {
  tenantId: 'other', teamId: 'team-a', userId: 'user-2',
}), { allowed: false, reason: 'wrong_tenant' });

const selection = { mode: 'all-matching' as const, queryToken: 'query-v3', excludedIds: new Set(['u9']) };
assert.equal(selectedCount(selection, 20), 19);
assert.equal(toBulkCommand(selection, {
  operationId: 'op-1', tenantId: 'acme', expectedPolicyVersion: 'v7',
}).selection.mode, 'all-matching');

assert.notDeepEqual(
  adminKeys.members({ subjectId: 'user-1', tenantId: 'acme', policyVersion: 'v7' }, ''),
  adminKeys.members({ subjectId: 'user-1', tenantId: 'other', policyVersion: 'v7' }, ''),
);
assert.equal(tenantStorageKey('acme', 'member:columns'), 'tenant:acme:member:columns');
assert.throws(() => tenantStorageKey('../other', 'member:columns'));

const support = {
  supportActorId: 'support-1', representedUserId: 'user-1', tenantId: 'acme',
  expiresAt: 2_000, reason: 'ticket-123', readOnly: true,
};
assert.match(supportBanner(support, 1_000), /只读查看/);
assert.equal(canPerformDestructiveAction(support, 1_000), false);
assert.match(supportBanner(support, 2_001), /已过期/);
console.log('multi-tenant admin examples passed');
