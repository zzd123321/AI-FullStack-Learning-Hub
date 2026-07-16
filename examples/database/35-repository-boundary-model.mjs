import assert from 'node:assert/strict';

function decimalToCents(value) {
  const match = /^(?<sign>-?)(?<whole>0|[1-9]\d*)\.(?<fraction>\d{2})$/.exec(value);
  assert.ok(match, `invalid money value: ${value}`);
  const magnitude = BigInt(match.groups.whole) * 100n + BigInt(match.groups.fraction);
  return match.groups.sign === '-' ? -magnitude : magnitude;
}

function decodeOrder(row) {
  assert.match(row.id, /^\d+$/, 'BIGINT ID must arrive as a decimal string');
  const occurredAt = new Date(row.occurred_at);
  assert.ok(!Number.isNaN(occurredAt.valueOf()), 'instant must be parseable');
  return {
    id: row.id,
    tenantId: row.tenant_id,
    status: row.status,
    totalCents: decimalToCents(row.total_amount),
    occurredAt: occurredAt.toISOString(),
    version: Number(row.version),
    items: [],
  };
}

class RecordingDriver {
  constructor() {
    this.calls = [];
  }

  async query(operation, sql, parameters) {
    this.calls.push({ operation, sql, parameters });
    if (operation === 'orders.listPage') {
      return { rows: [{
        id: '9223372036854775806',
        tenant_id: parameters[0],
        status: parameters[1],
        total_amount: '90071992547409.91',
        occurred_at: '2026-07-16T01:02:03.123Z',
        version: '7',
      }] };
    }
    if (operation === 'orderItems.findByOrderIds') {
      return { rows: [{
        id: 'item-1',
        order_id: '9223372036854775806',
        quantity: 2,
      }] };
    }
    if (operation === 'orders.markPaid') {
      return { affectedRows: parameters.at(-1) === 7 ? 1 : 0 };
    }
    throw new Error(`unknown operation: ${operation}`);
  }
}

class OrderRepository {
  constructor(driver) {
    this.driver = driver;
  }

  async findPageWithItems({ tenantId, status, sort, direction, limit }) {
    const sortColumns = new Map([
      ['createdAt', 'occurred_at'],
      ['total', 'total_amount'],
    ]);
    const directions = new Map([['asc', 'ASC'], ['desc', 'DESC']]);
    assert.ok(sortColumns.has(sort), 'unsupported sort field');
    assert.ok(directions.has(direction), 'unsupported sort direction');
    assert.ok(Number.isInteger(limit) && limit > 0 && limit <= 100);

    // 只有白名单值进入 SQL 结构；所有外部数据仍通过参数传递。
    const orderResult = await this.driver.query(
      'orders.listPage',
      `SELECT id, tenant_id, status, total_amount, occurred_at, version
       FROM orders
       WHERE tenant_id = ? AND status = ?
       ORDER BY ${sortColumns.get(sort)} ${directions.get(direction)}, id ASC
       LIMIT ?`,
      [tenantId, status, limit],
    );
    const orders = orderResult.rows.map(decodeOrder);
    if (orders.length === 0) return orders;

    // 一次有界批量查询代替逐订单懒加载。
    const ids = orders.map((order) => order.id);
    const placeholders = ids.map(() => '?').join(', ');
    const itemResult = await this.driver.query(
      'orderItems.findByOrderIds',
      `SELECT id, order_id, quantity
       FROM order_items
       WHERE order_id IN (${placeholders})`,
      ids,
    );
    const byOrder = Map.groupBy(itemResult.rows, (item) => item.order_id);
    for (const order of orders) order.items = byOrder.get(order.id) ?? [];
    return orders;
  }

  async markPaid({ tenantId, orderId, expectedVersion }) {
    const result = await this.driver.query(
      'orders.markPaid',
      `UPDATE orders
       SET status = ?, version = version + 1
       WHERE tenant_id = ? AND id = ? AND version = ?`,
      ['PAID', tenantId, orderId, expectedVersion],
    );
    if (result.affectedRows === 0) return { status: 'conflict-or-not-found' };
    assert.equal(result.affectedRows, 1, 'unique order update must affect one row');
    return { status: 'updated' };
  }
}

const driver = new RecordingDriver();
const repository = new OrderRepository(driver);
const orders = await repository.findPageWithItems({
  tenantId: 'tenant-a',
  status: 'PENDING',
  sort: 'createdAt',
  direction: 'desc',
  limit: 20,
});

assert.equal(driver.calls.length, 2, 'page plus items must use two queries');
assert.equal(orders[0].id, '9223372036854775806');
assert.equal(orders[0].totalCents, 9007199254740991n);
assert.equal(orders[0].items.length, 1);
assert.ok(!driver.calls[0].sql.includes('tenant-a'), 'values must not be interpolated');

await assert.rejects(
  repository.findPageWithItems({
    tenantId: 'tenant-a',
    status: 'PENDING',
    sort: 'created_at; DROP TABLE orders',
    direction: 'desc',
    limit: 20,
  }),
  /unsupported sort field/,
);

assert.deepEqual(await repository.markPaid({
  tenantId: 'tenant-a', orderId: orders[0].id, expectedVersion: 7,
}), { status: 'updated' });
assert.deepEqual(await repository.markPaid({
  tenantId: 'tenant-a', orderId: orders[0].id, expectedVersion: 6,
}), { status: 'conflict-or-not-found' });

console.log(JSON.stringify({
  orderIdPreservedAsString: orders[0].id,
  totalCentsPreservedAsString: orders[0].totalCents.toString(),
  pageQueryCount: 2,
  dynamicStructureWasAllowlisted: true,
  optimisticConflictWasDetected: true,
}, null, 2));
