import assert from 'node:assert/strict';

const mapping = Object.freeze({ pending: 10, paid: 20, shipped: 30 });

class Store {
  constructor(rows) {
    this.rows = new Map(rows.map((row) => [row.id, structuredClone(row)]));
  }

  maxId() { return Math.max(...this.rows.keys()); }

  scan({ afterId, upperBound, limit }) {
    return [...this.rows.values()]
      .filter((row) => row.id > afterId && row.id <= upperBound && row.stateCode === null)
      .sort((a, b) => a.id - b.id)
      .slice(0, limit)
      .map((row) => structuredClone(row));
  }

  onlineWrite(id, { status, stateCode }) {
    const row = this.rows.get(id);
    this.rows.set(id, { ...row, status, stateCode, version: row.version + 1 });
  }

  applyBatch(plannedRows) {
    // 在事务副本中应用整批，随后一次性提交。
    const transactionRows = structuredClone(this.rows);
    const results = [];
    for (const observed of plannedRows) {
      const current = transactionRows.get(observed.id);
      const derived = mapping[observed.status];
      if (derived === undefined) {
        results.push({ id: observed.id, outcome: 'UNKNOWN_SOURCE' });
      } else if (current.version !== observed.version || current.stateCode !== null) {
        results.push({ id: observed.id, outcome: 'CONFLICT' });
      } else {
        transactionRows.set(observed.id, {
          ...current,
          stateCode: derived,
          version: current.version + 1,
        });
        results.push({ id: observed.id, outcome: 'CHANGED' });
      }
    }
    this.rows = transactionRows;
    return results;
  }

  invalidRows(upperBound) {
    return [...this.rows.values()].filter((row) =>
      row.id <= upperBound && (mapping[row.status] === undefined || row.stateCode !== mapping[row.status]));
  }
}

class BackfillJob {
  constructor(store, { batchSize = 2 } = {}) {
    this.store = store;
    this.upperBound = store.maxId();
    this.checkpoint = 0;
    this.batchSize = batchSize;
    this.status = 'RUNNING';
    this.unresolved = new Set();
  }

  plan() {
    assert.equal(this.status, 'RUNNING');
    return this.store.scan({
      afterId: this.checkpoint,
      upperBound: this.upperBound,
      limit: this.batchSize,
    });
  }

  commitBatch(batch, { crashBeforeCheckpoint = false } = {}) {
    const results = this.store.applyBatch(batch);
    for (const result of results) {
      if (!['CHANGED', 'ALREADY_VALID'].includes(result.outcome)) this.unresolved.add(result.id);
    }
    if (crashBeforeCheckpoint) throw new Error('worker crashed after database commit');
    if (batch.length > 0) this.checkpoint = Math.max(...batch.map((row) => row.id));
    return results;
  }

  observe({ apiP99Ms, apiStopThresholdMs, replicaLagSeconds, lagStopThresholdSeconds }) {
    if (apiP99Ms >= apiStopThresholdMs || replicaLagSeconds >= lagStopThresholdSeconds) {
      this.status = 'PAUSED';
      return 'PAUSED';
    }
    this.batchSize = Math.min(this.batchSize + 1, 1000);
    return 'INCREASED_CAUTIOUSLY';
  }

  resume() { assert.equal(this.status, 'PAUSED'); this.status = 'RUNNING'; }

  verify() {
    const invalid = this.store.invalidRows(this.upperBound);
    assert.equal(invalid.length, 0, '仍有不满足映射不变量的行');
    assert.equal(this.unresolved.size, 0, '仍有未解决的冲突或未知值');
    this.status = 'COMPLETED';
  }
}

const store = new Store([
  { id: 1, status: 'pending', stateCode: null, version: 1 },
  { id: 2, status: 'paid', stateCode: null, version: 1 },
  { id: 3, status: 'shipped', stateCode: null, version: 1 },
  { id: 4, status: 'paid', stateCode: null, version: 1 },
]);
const job = new BackfillJob(store);
assert.equal(job.upperBound, 4);
store.rows.set(5, { id: 5, status: 'pending', stateCode: null, version: 1 });
assert.equal(job.plan().some((row) => row.id === 5), false);
console.log('✓ 启动时固定 upper bound，新插入行不会让本轮进度无限增长');

const firstBatch = job.plan();
assert.throws(() => job.commitBatch(firstBatch, { crashBeforeCheckpoint: true }), /after database commit/);
assert.equal(job.checkpoint, 0);
assert.equal(store.rows.get(1).stateCode, 10);
const retryBatch = job.plan();
assert.deepEqual(retryBatch.map((row) => row.id), [3, 4]);
job.commitBatch(retryBatch);
assert.equal(job.checkpoint, 4);
assert.equal(store.invalidRows(job.upperBound).length, 0);
console.log('✓ 数据提交后 checkpoint 前崩溃可以幂等续跑，不会重复破坏已完成行');

const conflictStore = new Store([
  { id: 1, status: 'paid', stateCode: null, version: 3 },
]);
const conflictJob = new BackfillJob(conflictStore);
const stalePlan = conflictJob.plan();
conflictStore.onlineWrite(1, { status: 'shipped', stateCode: 30 });
const conflictResult = conflictJob.commitBatch(stalePlan);
assert.equal(conflictResult[0].outcome, 'CONFLICT');
assert.equal(conflictStore.rows.get(1).stateCode, 30);
assert.throws(() => conflictJob.verify(), /未解决/);
conflictJob.unresolved.delete(1); // 人工/自动复验确认在线双写结果正确。
conflictJob.verify();
console.log('✓ 陈旧批次不会覆盖在线新写，冲突解决前任务不能宣告完成');

assert.equal(job.observe({
  apiP99Ms: 190,
  apiStopThresholdMs: 180,
  replicaLagSeconds: 2,
  lagStopThresholdSeconds: 10,
}), 'PAUSED');
assert.equal(job.status, 'PAUSED');
job.resume();
assert.equal(job.observe({
  apiP99Ms: 100,
  apiStopThresholdMs: 180,
  replicaLagSeconds: 1,
  lagStopThresholdSeconds: 10,
}), 'INCREASED_CAUTIOUSLY');
console.log('✓ 业务尾延迟或复制延迟越线时暂停，健康窗口只小幅提速');

job.verify();
assert.equal(job.status, 'COMPLETED');
console.log('全部固定水位、幂等续跑、条件写、冲突与限速门禁断言通过。');
