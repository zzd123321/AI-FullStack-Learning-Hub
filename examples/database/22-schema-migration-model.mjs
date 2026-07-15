import assert from 'node:assert/strict';

const compatibility = {
  S0_OLD_ONLY: new Set(['v1', 'v2']),
  S1_EXPANDED: new Set(['v1', 'v2', 'v3']),
  S2_BACKFILLED: new Set(['v1', 'v2', 'v3']),
  S3_NEW_WRITES: new Set(['v2', 'v3']),
  S4_CONTRACTED: new Set(['v3']),
};

function canRun(schemaStage, applicationVersion) {
  return compatibility[schemaStage]?.has(applicationVersion) ?? false;
}

class OrderStore {
  constructor(rows) {
    this.rows = new Map(rows.map((row) => [row.id, { ...row }]));
  }

  onlineWrite({ id, status, stateCode }) {
    const row = this.rows.get(id);
    assert.ok(row);
    row.status = status;
    row.stateCode = stateCode;
    row.version += 1;
  }

  conditionalBackfill({ id, observedVersion, derivedStateCode }) {
    const row = this.rows.get(id);
    assert.ok(row);
    if (row.version !== observedVersion || row.stateCode !== null) return false;
    row.stateCode = derivedStateCode;
    row.version += 1;
    return true;
  }

  parityReport() {
    const mapping = { pending: 10, paid: 20, shipped: 30 };
    const mismatches = [...this.rows.values()].filter((row) =>
      row.stateCode === null || mapping[row.status] !== row.stateCode);
    return { checked: this.rows.size, mismatches };
  }
}

class Migration {
  constructor(shards) {
    this.phase = 'S1_EXPANDED';
    this.activeApplicationVersions = new Set(['v1', 'v2']);
    this.shardCapabilities = new Map(shards.map((shard) => [shard, 'S1_EXPANDED']));
    this.parityVerified = false;
  }

  enableNewReads() {
    assert.equal(this.parityVerified, true, '数据尚未完成等价校验');
    assert.ok(
      [...this.shardCapabilities.values()].every((stage) =>
        ['S2_BACKFILLED', 'S3_NEW_WRITES', 'S4_CONTRACTED'].includes(stage)),
      '仍有 shard 未达到新读取能力',
    );
    this.phase = 'S2_BACKFILLED';
  }

  stopOldWrites() {
    assert.equal(this.phase, 'S2_BACKFILLED');
    assert.equal(this.activeApplicationVersions.has('v1'), false, '旧应用仍在写旧字段');
    this.phase = 'S3_NEW_WRITES';
  }

  contract() {
    assert.equal(this.phase, 'S3_NEW_WRITES');
    assert.deepEqual([...this.activeApplicationVersions], ['v3']);
    assert.equal(this.parityVerified, true);
    this.phase = 'S4_CONTRACTED';
  }
}

function run() {
  assert.equal(canRun('S0_OLD_ONLY', 'v3'), false);
  assert.equal(canRun('S1_EXPANDED', 'v1'), true);
  assert.equal(canRun('S1_EXPANDED', 'v3'), true);
  assert.equal(canRun('S4_CONTRACTED', 'v1'), false);
  console.log('✓ 兼容矩阵允许 expand 阶段旧新版本共存，并在 contract 后拒绝旧版本');

  const store = new OrderStore([
    { id: 1, status: 'pending', stateCode: null, version: 1 },
    { id: 2, status: 'paid', stateCode: null, version: 4 },
  ]);
  const observed = { ...store.rows.get(2) };
  store.onlineWrite({ id: 2, status: 'shipped', stateCode: 30 });
  const overwritten = store.conditionalBackfill({
    id: 2,
    observedVersion: observed.version,
    derivedStateCode: 20,
  });
  assert.equal(overwritten, false);
  assert.equal(store.rows.get(2).stateCode, 30);
  assert.equal(store.conditionalBackfill({
    id: 1,
    observedVersion: 1,
    derivedStateCode: 10,
  }), true);
  assert.equal(store.parityReport().mismatches.length, 0);
  console.log('✓ 条件回填跳过已被在线更新的行，不会用陈旧派生值覆盖新写入');

  const migration = new Migration(['shard-a', 'shard-b']);
  assert.throws(() => migration.enableNewReads(), /尚未完成等价校验/);
  migration.parityVerified = store.parityReport().mismatches.length === 0;
  migration.shardCapabilities.set('shard-a', 'S2_BACKFILLED');
  assert.throws(() => migration.enableNewReads(), /仍有 shard/);
  migration.shardCapabilities.set('shard-b', 'S2_BACKFILLED');
  migration.enableNewReads();
  console.log('✓ 只有数据校验通过且所有 shard 达到能力后才启用全局新读路径');

  assert.throws(() => migration.stopOldWrites(), /旧应用仍在写旧字段/);
  migration.activeApplicationVersions = new Set(['v2', 'v3']);
  migration.stopOldWrites();
  assert.throws(() => migration.contract());
  migration.activeApplicationVersions = new Set(['v3']);
  migration.contract();
  assert.equal(migration.phase, 'S4_CONTRACTED');
  console.log('✓ 旧应用完全退出且校验保持通过后，破坏性 contract 才被允许');

  console.log('全部 schema 兼容、条件回填与分片能力门禁断言通过。');
}

run();
