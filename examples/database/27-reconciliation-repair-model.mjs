import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

function canonicalOrder(order) {
  return JSON.stringify({
    id: String(order.id),
    currency: order.currency,
    paidCents: String(order.paidCents),
    status: order.status,
    // 比较业务时间，统一成 UTC ISO；排除副本自己的 syncedAt。
    paidAt: order.paidAt === null ? null : new Date(order.paidAt).toISOString(),
  });
}

function digest(rows) {
  const hash = createHash('sha256');
  for (const row of [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    hash.update(canonicalOrder(row));
    hash.update('\n');
  }
  return hash.digest('hex');
}

function reconcile(sourceRows, targetRows, { watermark, ruleVersion }) {
  const source = new Map(sourceRows.map((row) => [row.id, structuredClone(row)]));
  const target = new Map(targetRows.map((row) => [row.id, structuredClone(row)]));
  const differences = [];

  for (const [id, sourceRow] of source) {
    const targetRow = target.get(id);
    if (!targetRow) {
      differences.push({ type: 'TARGET_MISSING', id, sourceRow, expectedTargetVersion: null });
    } else if (canonicalOrder(sourceRow) !== canonicalOrder(targetRow)) {
      differences.push({
        type: 'CONTENT_MISMATCH',
        id,
        sourceRow,
        expectedTargetVersion: targetRow.version,
      });
    }
  }

  for (const [id, targetRow] of target) {
    if (!source.has(id)) {
      differences.push({ type: 'TARGET_EXTRA', id, targetRow, expectedTargetVersion: targetRow.version });
    }
  }

  return Object.freeze({
    watermark,
    ruleVersion,
    sourceDigest: digest(sourceRows),
    targetDigest: digest(targetRows),
    differences: Object.freeze(differences),
  });
}

class DerivedStore {
  constructor(rows) {
    this.rows = new Map(rows.map((row) => [row.id, structuredClone(row)]));
    this.appliedRepairs = new Set();
  }

  updateFromUser(id, patch) {
    const current = this.rows.get(id);
    this.rows.set(id, { ...current, ...patch, version: current.version + 1 });
  }

  applyRepair({ repairId, difference }) {
    if (this.appliedRepairs.has(repairId)) return 'ALREADY_APPLIED';
    assert.notEqual(difference.type, 'TARGET_EXTRA', '删除多余记录需要单独审批，模型拒绝自动执行');

    const current = this.rows.get(difference.id);
    if (difference.type === 'TARGET_MISSING') {
      assert.equal(current, undefined, '扫描后目标已出现，拒绝覆盖');
      this.rows.set(difference.id, { ...structuredClone(difference.sourceRow), version: 1 });
    } else {
      assert.equal(
        current?.version,
        difference.expectedTargetVersion,
        '目标版本已变化，拒绝用过期 manifest 覆盖并发写入',
      );
      this.rows.set(difference.id, {
        ...structuredClone(difference.sourceRow),
        version: current.version + 1,
      });
    }

    this.appliedRepairs.add(repairId);
    return 'APPLIED';
  }
}

function run() {
  const sourceAtWatermark = [
    { id: 'o-1', currency: 'CNY', paidCents: 12900, status: 'PAID', paidAt: '2026-07-15T02:00:00Z', version: 4 },
    { id: 'o-2', currency: 'CNY', paidCents: 8800, status: 'PAID', paidAt: '2026-07-15T03:00:00Z', version: 2 },
    { id: 'o-3', currency: 'CNY', paidCents: 0, status: 'CREATED', paidAt: null, version: 1 },
  ];
  const targetAtWatermark = [
    { ...sourceAtWatermark[0], syncedAt: '2026-07-15T02:00:03Z', version: 7 },
    { ...sourceAtWatermark[1], paidCents: 8000, version: 3 },
    { id: 'o-old', currency: 'CNY', paidCents: 100, status: 'PAID', paidAt: '2026-07-01T00:00:00Z', version: 9 },
  ];

  const batch = reconcile(sourceAtWatermark, targetAtWatermark, {
    watermark: 'outbox_id<=42000',
    ruleVersion: 'order-canonical-v1',
  });
  assert.notEqual(batch.sourceDigest, batch.targetDigest);
  assert.deepEqual(
    batch.differences.map(({ type, id }) => `${type}:${id}`).sort(),
    ['CONTENT_MISMATCH:o-2', 'TARGET_EXTRA:o-old', 'TARGET_MISSING:o-3'],
  );
  console.log('✓ 同一水位发现缺失、多余和内容不一致，副本技术字段不制造假差异');

  const store = new DerivedStore(targetAtWatermark);
  const mismatch = batch.differences.find((item) => item.id === 'o-2');
  store.updateFromUser('o-2', { status: 'REFUND_PENDING' });
  assert.throws(
    () => store.applyRepair({ repairId: 'repair-42000-o-2', difference: mismatch }),
    /目标版本已变化/,
  );
  console.log('✓ 目标行在扫描后发生变化，旧 manifest 被版本条件拒绝');

  const missing = batch.differences.find((item) => item.id === 'o-3');
  assert.equal(store.applyRepair({ repairId: 'repair-42000-o-3', difference: missing }), 'APPLIED');
  assert.equal(store.applyRepair({ repairId: 'repair-42000-o-3', difference: missing }), 'ALREADY_APPLIED');
  console.log('✓ 缺失记录被幂等补齐，同一 repair ID 重试不会重复应用');

  const extra = batch.differences.find((item) => item.id === 'o-old');
  assert.throws(
    () => store.applyRepair({ repairId: 'repair-42000-o-old', difference: extra }),
    /单独审批/,
  );
  console.log('✓ “目标多余”不会被扫描任务自动删除');

  console.log('全部快照对账、规范化、条件修复与幂等门禁断言通过。');
}

run();
