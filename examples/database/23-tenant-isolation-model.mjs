import assert from 'node:assert/strict';

function authorizeTenant(principal, requestedTenantId) {
  assert.ok(principal?.authenticated, '请求尚未认证');
  assert.ok(principal.tenantIds.includes(requestedTenantId), '用户不属于目标租户');
  return Object.freeze({
    tenantId: requestedTenantId,
    userId: principal.userId,
    source: 'authenticated-membership',
  });
}

function buildOrderLookup(context, orderId) {
  assert.equal(context.source, 'authenticated-membership');
  return {
    sql: `SELECT id, tenant_id, state_code
          FROM orders
          WHERE tenant_id = $1 AND id = $2`,
    parameters: [context.tenantId, orderId],
  };
}

class PooledConnection {
  constructor() {
    this.inTransaction = false;
    this.localTenantId = null;
  }

  begin(context) {
    assert.equal(this.inTransaction, false);
    assert.equal(this.localTenantId, null, '连接携带了上一个请求的租户上下文');
    this.inTransaction = true;
    this.localTenantId = context.tenantId;
  }

  finish() {
    assert.equal(this.inTransaction, true);
    this.inTransaction = false;
    this.localTenantId = null;
  }
}

function rowsVisibleToRole(rows, connection, role) {
  if (role.superuser || role.bypassRls || (role.owner && !role.forceRls)) return rows;
  assert.ok(connection.inTransaction, 'RLS 查询必须处于已设置 context 的事务中');
  assert.notEqual(connection.localTenantId, null, '缺少 tenant context');
  return rows.filter((row) => row.tenantId === connection.localTenantId);
}

function run() {
  const alice = {
    authenticated: true,
    userId: 'alice',
    tenantIds: [42],
  };
  const context = authorizeTenant(alice, 42);
  assert.throws(() => authorizeTenant(alice, 7), /不属于目标租户/);
  assert.equal(context.tenantId, 42);
  console.log('✓ tenant context 只能从已认证 membership 推导，拒绝客户端越租户请求');

  const query = buildOrderLookup(context, 'order-1001');
  assert.match(query.sql, /tenant_id = \$1 AND id = \$2/);
  assert.deepEqual(query.parameters, [42, 'order-1001']);
  assert.equal(query.sql.includes('order-1001'), false);
  console.log('✓ Repository 同时携带 tenant predicate 与绑定参数，不拼接客户端值');

  const rows = [
    { id: 1, tenantId: 42 },
    { id: 2, tenantId: 7 },
  ];
  const connection = new PooledConnection();
  connection.begin(context);
  const runtimeRows = rowsVisibleToRole(rows, connection, {
    owner: false,
    superuser: false,
    bypassRls: false,
    forceRls: true,
  });
  assert.deepEqual(runtimeRows.map((row) => row.id), [1]);
  connection.finish();
  assert.equal(connection.localTenantId, null);

  const tenant7 = authorizeTenant({
    authenticated: true,
    userId: 'bob',
    tenantIds: [7],
  }, 7);
  connection.begin(tenant7);
  assert.deepEqual(
    rowsVisibleToRole(rows, connection, {
      owner: false,
      superuser: false,
      bypassRls: false,
      forceRls: true,
    }).map((row) => row.id),
    [2],
  );
  console.log('✓ transaction-local context 清理后，同一池连接不会泄漏上一请求的 tenant');

  const ownerWithoutForce = rowsVisibleToRole(rows, connection, {
    owner: true,
    superuser: false,
    bypassRls: false,
    forceRls: false,
  });
  assert.equal(ownerWithoutForce.length, 2);
  const ownerWithForce = rowsVisibleToRole(rows, connection, {
    owner: true,
    superuser: false,
    bypassRls: false,
    forceRls: true,
  });
  assert.deepEqual(ownerWithForce.map((row) => row.id), [2]);
  connection.finish();
  console.log('✓ owner 未 FORCE 时可绕过策略，FORCE 后普通 owner 才受租户过滤');

  console.log('全部认证租户、参数化查询、连接池清理与 RLS 边界断言通过。');
}

run();
