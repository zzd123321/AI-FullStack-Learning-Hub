import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

function stableSlot(key, slotCount) {
  assert.ok(Number.isInteger(slotCount) && slotCount > 0);
  const digest = createHash('sha256').update(String(key), 'utf8').digest();
  return digest.readUInt32BE(0) % slotCount;
}

class Topology {
  constructor({ epoch, slotCount, assignments }) {
    assert.ok(Number.isInteger(epoch) && epoch > 0);
    assert.equal(assignments.length, slotCount);
    this.epoch = epoch;
    this.slotCount = slotCount;
    this.assignments = [...assignments];
  }

  resolve(tenantId) {
    assert.notEqual(tenantId, undefined, 'point query 必须携带 tenantId');
    assert.notEqual(tenantId, null, 'point query 必须携带 tenantId');
    const slot = stableSlot(tenantId, this.slotCount);
    return { tenantId, slot, shard: this.assignments[slot], epoch: this.epoch };
  }

  acceptsWrite({ slot, shard, epoch }) {
    return epoch === this.epoch && this.assignments[slot] === shard;
  }
}

function routePointQuery(topology, request) {
  if (request.tenantId === undefined || request.tenantId === null) {
    throw new Error('拒绝把缺少 tenantId 的在线 point query 静默升级为 scatter');
  }
  return topology.resolve(request.tenantId);
}

function compareRows(left, right) {
  const timeOrder = right.createdAt.localeCompare(left.createdAt);
  return timeOrder || right.id.localeCompare(left.id);
}

function mergeGlobalPage(shardRows, limit) {
  assert.ok(Number.isInteger(limit) && limit > 0);
  const cursors = new Map([...shardRows.keys()].map((shard) => [shard, 0]));
  const merged = [];

  while (merged.length < limit) {
    const candidates = [];
    for (const [shard, rows] of shardRows) {
      const index = cursors.get(shard);
      if (index < rows.length) candidates.push({ shard, row: rows[index] });
    }
    if (candidates.length === 0) break;

    candidates.sort((left, right) => compareRows(left.row, right.row));
    const winner = candidates[0];
    merged.push({ ...winner.row, shard: winner.shard });
    cursors.set(winner.shard, cursors.get(winner.shard) + 1);
  }

  return { rows: merged, shardCursors: Object.fromEntries(cursors) };
}

function run() {
  const assignmentsV7 = [
    'shard-a', 'shard-a', 'shard-a', 'shard-a',
    'shard-b', 'shard-b', 'shard-b', 'shard-b',
  ];
  const topologyV7 = new Topology({
    epoch: 7,
    slotCount: 8,
    assignments: assignmentsV7,
  });

  const route1 = routePointQuery(topologyV7, { tenantId: 'tenant-42' });
  const route2 = routePointQuery(topologyV7, { tenantId: 'tenant-42' });
  assert.deepEqual(route1, route2);
  assert.equal(route1.slot, stableSlot('tenant-42', 8));
  console.log('✓ 同一业务键通过稳定哈希重复映射到同一逻辑槽和物理 shard');

  assert.throws(
    () => routePointQuery(topologyV7, { orderId: 'order-1001' }),
    /缺少 tenantId/,
  );
  console.log('✓ 缺少路由键的 point query 被显式拒绝，不会无界广播');

  const shardRows = new Map([
    ['shard-a', [
      { id: 'o-9', createdAt: '2026-07-15T10:00:00.000Z' },
      { id: 'o-3', createdAt: '2026-07-15T09:00:00.000Z' },
    ]],
    ['shard-b', [
      { id: 'o-8', createdAt: '2026-07-15T10:00:00.000Z' },
      { id: 'o-7', createdAt: '2026-07-15T08:00:00.000Z' },
    ]],
  ]);
  const page = mergeGlobalPage(shardRows, 3);
  assert.deepEqual(
    page.rows.map(({ id }) => id),
    ['o-9', 'o-8', 'o-3'],
  );
  assert.deepEqual(page.shardCursors, { 'shard-a': 2, 'shard-b': 1 });
  console.log('✓ 全局页按 createdAt + id 稳定执行 k-way merge，并保留每 shard 游标');

  const movingTenant = 'tenant-moving';
  const movingSlot = stableSlot(movingTenant, 8);
  const assignmentsV8 = [...assignmentsV7];
  const source = assignmentsV8[movingSlot];
  const target = source === 'shard-a' ? 'shard-b' : 'shard-a';
  assignmentsV8[movingSlot] = target;
  const topologyV8 = new Topology({
    epoch: 8,
    slotCount: 8,
    assignments: assignmentsV8,
  });

  const staleRoute = topologyV7.resolve(movingTenant);
  const currentRoute = topologyV8.resolve(movingTenant);
  assert.equal(staleRoute.shard, source);
  assert.equal(currentRoute.shard, target);
  assert.equal(topologyV8.acceptsWrite(staleRoute), false);
  assert.equal(topologyV8.acceptsWrite(currentRoute), true);
  console.log('✓ cutover 提升 epoch 后旧路由被 fencing，只有新 shard 接受当前写入');

  console.log('全部分片路由、全局合并和拓扑 fencing 断言通过。');
}

run();
