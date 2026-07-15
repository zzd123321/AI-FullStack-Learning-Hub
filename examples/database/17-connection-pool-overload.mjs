import assert from 'node:assert/strict';

function littleLawInFlight({ operationsPerSecond, averageLatencyMs }) {
  return operationsPerSecond * (averageLatencyMs / 1000);
}

function connectionBudget({
  databaseLimit,
  administrationReserve,
  replicationReserve,
  otherWorkloadReserve,
}) {
  const applicationBudget =
    databaseLimit
    - administrationReserve
    - replicationReserve
    - otherWorkloadReserve;

  assert.ok(applicationBudget >= 0, 'reserves cannot exceed database limit');
  return applicationBudget;
}

function totalPotentialConnections({
  instances,
  poolPerInstance,
  databaseRoles = 1,
  deploymentOverlapFactor = 1,
}) {
  return instances * poolPerInstance * databaseRoles * deploymentOverlapFactor;
}

function validateDeadlineBudget({
  httpDeadlineMs,
  poolAcquireMs,
  databaseStageMs,
  responseReserveMs,
}) {
  const totalAllocatedMs = poolAcquireMs + databaseStageMs + responseReserveMs;
  return {
    valid: totalAllocatedMs <= httpDeadlineMs,
    totalAllocatedMs,
    remainingMs: httpDeadlineMs - totalAllocatedMs,
  };
}

function worstCaseAttempts(retriesByLayer) {
  return retriesByLayer.reduce(
    (attempts, retryCount) => attempts * (retryCount + 1),
    1,
  );
}

class BoundedPool {
  constructor({ maxActive, maxWaiters }) {
    this.maxActive = maxActive;
    this.maxWaiters = maxWaiters;
    this.active = new Set();
    this.waiting = [];
  }

  acquire(requestId) {
    if (this.active.size < this.maxActive) {
      this.active.add(requestId);
      return { state: 'acquired' };
    }

    if (this.waiting.length < this.maxWaiters) {
      this.waiting.push(requestId);
      return { state: 'queued' };
    }

    return { state: 'rejected', reason: 'POOL_OVERLOADED' };
  }

  release(requestId) {
    assert.ok(this.active.delete(requestId), `not active: ${requestId}`);
    const next = this.waiting.shift();

    if (next !== undefined) {
      this.active.add(next);
      return { admitted: next };
    }

    return { admitted: null };
  }
}

function run() {
  const normalInFlight = littleLawInFlight({
    operationsPerSecond: 500,
    averageLatencyMs: 20,
  });
  const degradedInFlight = littleLawInFlight({
    operationsPerSecond: 500,
    averageLatencyMs: 200,
  });
  assert.equal(normalInFlight, 10);
  assert.equal(degradedInFlight, 100);
  assert.equal(degradedInFlight / normalInFlight, 10);
  console.log('✓ 相同 500 ops/s 下，平均延迟放大 10 倍会让 in-flight 约放大 10 倍');

  const appBudget = connectionBudget({
    databaseLimit: 300,
    administrationReserve: 15,
    replicationReserve: 15,
    otherWorkloadReserve: 30,
  });
  assert.equal(appBudget, 240);

  const steadyConnections = totalPotentialConnections({
    instances: 20,
    poolPerInstance: 10,
  });
  const rollingConnections = totalPotentialConnections({
    instances: 20,
    poolPerInstance: 10,
    deploymentOverlapFactor: 1.5,
  });
  assert.equal(steadyConnections, 200);
  assert.equal(rollingConnections, 300);
  assert.ok(steadyConnections <= appBudget);
  assert.ok(rollingConnections > appBudget);
  console.log('✓ 稳态连接未超预算，但滚动发布的新旧实例重叠会突破业务连接预算');

  assert.deepEqual(
    validateDeadlineBudget({
      httpDeadlineMs: 500,
      poolAcquireMs: 20,
      databaseStageMs: 250,
      responseReserveMs: 200,
    }),
    { valid: true, totalAllocatedMs: 470, remainingMs: 30 },
  );
  assert.deepEqual(
    validateDeadlineBudget({
      httpDeadlineMs: 500,
      poolAcquireMs: 200,
      databaseStageMs: 400,
      responseReserveMs: 100,
    }),
    { valid: false, totalAllocatedMs: 700, remainingMs: -200 },
  );
  console.log('✓ pool、数据库阶段和响应余量必须共同受 HTTP deadline 约束');

  assert.equal(worstCaseAttempts([2]), 3);
  assert.equal(worstCaseAttempts([2, 2, 2]), 27);
  console.log('✓ 三层各重试 2 次会把一次请求最坏放大为 27 次数据库尝试');

  const pool = new BoundedPool({ maxActive: 2, maxWaiters: 2 });
  assert.equal(pool.acquire('a').state, 'acquired');
  assert.equal(pool.acquire('b').state, 'acquired');
  assert.equal(pool.acquire('c').state, 'queued');
  assert.equal(pool.acquire('d').state, 'queued');
  assert.deepEqual(pool.acquire('e'), {
    state: 'rejected',
    reason: 'POOL_OVERLOADED',
  });
  assert.deepEqual(pool.release('a'), { admitted: 'c' });
  assert.deepEqual([...pool.active].sort(), ['b', 'c']);
  console.log('✓ 有界池只保留有限 waiter，过载请求显式拒绝而不是无限排队');

  console.log('全部数据库连接池、deadline 与过载状态模型断言通过。');
}

run();
