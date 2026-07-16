import assert from 'node:assert/strict';

class ReleaseGate {
  constructor() {
    this.required = new Set([
      'fresh-migration',
      'supported-upgrade',
      'repository-contract',
      'constraint-negative-cases',
      'concurrency-invariants',
      'runtime-role-isolation',
      'restore-evidence',
    ]);
    this.evidence = new Map();
  }

  record(name, { passed, artifact }) {
    assert.ok(artifact, `${name} 缺少可复核证据`);
    this.evidence.set(name, { passed, artifact });
  }

  approve() {
    const missing = [...this.required].filter((name) => !this.evidence.has(name));
    const failed = [...this.evidence]
      .filter(([name, result]) => this.required.has(name) && !result.passed)
      .map(([name]) => name);
    assert.deepEqual(missing, [], `缺少门禁：${missing.join(', ')}`);
    assert.deepEqual(failed, [], `门禁失败：${failed.join(', ')}`);
    return 'APPROVED';
  }
}

class InventoryStore {
  constructor(quantity) {
    this.quantity = quantity;
    this.version = 1;
    this.idempotencyResults = new Map();
  }

  read() { return { quantity: this.quantity, version: this.version }; }

  reserve({ requestId, observedVersion }) {
    if (this.idempotencyResults.has(requestId)) return this.idempotencyResults.get(requestId);
    if (this.version !== observedVersion || this.quantity < 1) return 'CONFLICT';
    this.quantity -= 1;
    this.version += 1;
    this.idempotencyResults.set(requestId, 'RESERVED');
    return 'RESERVED';
  }
}

async function runTransactionWithRetry(operation, { maxAttempts, idempotencyKey }) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      // 稳定幂等键贯穿所有尝试；每次 operation 代表一个新事务入口。
      return await operation({ attempt, idempotencyKey });
    } catch (error) {
      // 40001：serialization failure（也可能是 MySQL deadlock 的 SQLSTATE）；
      // 40P01：PostgreSQL deadlock；MYSQL_1213：适配层规范化后的 MySQL error number。
      const retryable = ['40001', '40P01', 'MYSQL_1213'].includes(error.code);
      if (!retryable || attempt === maxAttempts) throw error;
    }
  }
  throw new Error('unreachable');
}

const inventory = new InventoryStore(1);
// barrier 之前两个“连接”读取同一个版本，随后按确定顺序竞争条件更新。
const connectionA = inventory.read();
const connectionB = inventory.read();
assert.equal(inventory.reserve({ requestId: 'req-a', observedVersion: connectionA.version }), 'RESERVED');
assert.equal(inventory.reserve({ requestId: 'req-b', observedVersion: connectionB.version }), 'CONFLICT');
assert.equal(inventory.quantity, 0);
assert.equal(inventory.reserve({ requestId: 'req-a', observedVersion: connectionA.version }), 'RESERVED');
assert.equal(inventory.quantity, 0);
console.log('✓ 两连接读取同一版本后只有一个条件更新成功，幂等重试不重复扣减');

const attempts = [];
const retryResult = await runTransactionWithRetry(async ({ attempt, idempotencyKey }) => {
  attempts.push({ attempt, idempotencyKey });
  if (attempt === 1) throw Object.assign(new Error('serialization failure'), { code: '40001' });
  return 'COMMITTED';
}, { maxAttempts: 3, idempotencyKey: 'payment-42' });
assert.equal(retryResult, 'COMMITTED');
assert.deepEqual(attempts, [
  { attempt: 1, idempotencyKey: 'payment-42' },
  { attempt: 2, idempotencyKey: 'payment-42' },
]);
console.log('✓ 可重试错误从事务入口重新执行，并在所有尝试中保持同一幂等键');

let nonRetryAttempts = 0;
await assert.rejects(
  runTransactionWithRetry(async () => {
    nonRetryAttempts += 1;
    throw Object.assign(new Error('constraint violation'), { code: '23505' });
  }, { maxAttempts: 3, idempotencyKey: 'payment-43' }),
  /constraint violation/,
);
assert.equal(nonRetryAttempts, 1);
console.log('✓ 非可重试约束错误不会被盲目重试');

const gate = new ReleaseGate();
for (const name of [
  'fresh-migration',
  'supported-upgrade',
  'repository-contract',
  'constraint-negative-cases',
  'concurrency-invariants',
  'runtime-role-isolation',
]) {
  gate.record(name, { passed: true, artifact: `ci://${name}/run-20260716` });
}
assert.throws(() => gate.approve(), /restore-evidence/);
gate.record('restore-evidence', {
  passed: true,
  artifact: 'restore://20260715/rpo-21s-rto-8m',
});
assert.equal(gate.approve(), 'APPROVED');
console.log('✓ 快速测试不能抵消缺失的恢复证据，所有硬门禁通过后才批准发布');

console.log('全部并发、幂等重试、错误分类与 CI 发布门禁断言通过。');
