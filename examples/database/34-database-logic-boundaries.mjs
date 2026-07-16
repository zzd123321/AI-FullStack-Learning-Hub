import assert from 'node:assert/strict';

class MemoryDatabase {
  constructor() {
    this.orders = new Map();
    this.audit = [];
    this.jobs = new Map();
  }

  transaction(command) {
    // 用影子状态模拟数据库事务：trigger 抛错时订单与审计一起回滚。
    const draft = {
      orders: new Map(this.orders),
      audit: structuredClone(this.audit),
      jobs: new Map([...this.jobs].map(([key, value]) => [key, structuredClone(value)])),
    };
    const result = command(draft);
    this.orders = draft.orders;
    this.audit = draft.audit;
    this.jobs = draft.jobs;
    return result;
  }

  createOrder({ orderId, idempotencyKey, totalCents, auditEnabled = true }) {
    return this.transaction((draft) => {
      const replay = [...draft.orders.values()].find(
        (order) => order.idempotencyKey === idempotencyKey,
      );
      if (replay) return { status: 'replayed', order: replay };
      assert.ok(!draft.orders.has(orderId), 'order ID must be unique');

      const order = {
        orderId,
        idempotencyKey,
        totalCents,
        status: 'PENDING',
      };
      draft.orders.set(orderId, order);

      // 模拟 AFTER INSERT audit trigger。失败不能被吞掉，否则主写缺少审计。
      assert.ok(auditEnabled, 'audit trigger unavailable');
      draft.audit.push({ type: 'ORDER_CREATED', orderId });
      return { status: 'created', order };
    });
  }

  scheduleExpiry(orderId, dueAt) {
    const jobKey = `expire-order:${orderId}`;
    this.jobs.set(jobKey, {
      jobKey,
      orderId,
      dueAt,
      state: 'READY',
      leaseOwner: null,
      leaseUntil: 0,
      fencingToken: 0,
    });
  }

  claimDueJob(jobKey, workerId, now, leaseMs) {
    return this.transaction((draft) => {
      const job = draft.jobs.get(jobKey);
      if (!job || job.dueAt > now || job.state === 'DONE') return null;
      if (job.leaseUntil > now && job.leaseOwner !== workerId) return null;
      job.leaseOwner = workerId;
      job.leaseUntil = now + leaseMs;
      job.fencingToken += 1;
      return structuredClone(job);
    });
  }

  finishExpiry(claim) {
    return this.transaction((draft) => {
      const job = draft.jobs.get(claim.jobKey);
      if (job.state === 'DONE') return 'already-done';
      assert.equal(job.fencingToken, claim.fencingToken, 'stale worker is fenced');

      const order = draft.orders.get(job.orderId);
      // 条件状态转换让任务重放安全：已支付订单不会被过期任务取消。
      if (order.status === 'PENDING') order.status = 'CANCELLED';
      job.state = 'DONE';
      job.leaseOwner = null;
      job.leaseUntil = 0;
      return order.status;
    });
  }
}

const db = new MemoryDatabase();
const created = db.createOrder({
  orderId: 'order-42',
  idempotencyKey: 'request-42',
  totalCents: 1200,
});
assert.equal(created.status, 'created');
assert.equal(db.audit.length, 1);

const replayed = db.createOrder({
  orderId: 'different-client-id',
  idempotencyKey: 'request-42',
  totalCents: 1200,
});
assert.equal(replayed.status, 'replayed');
assert.equal(db.orders.size, 1);

assert.throws(() => db.createOrder({
  orderId: 'order-rollback',
  idempotencyKey: 'request-rollback',
  totalCents: 500,
  auditEnabled: false,
}), /audit trigger unavailable/);
assert.equal(db.orders.has('order-rollback'), false);
assert.equal(db.audit.length, 1);

db.scheduleExpiry('order-42', 1000);
const firstClaim = db.claimDueJob('expire-order:order-42', 'worker-a', 1000, 100);
const overlappingClaim = db.claimDueJob('expire-order:order-42', 'worker-b', 1001, 100);
assert.ok(firstClaim);
assert.equal(overlappingClaim, null);
assert.equal(db.finishExpiry(firstClaim), 'CANCELLED');
assert.equal(db.finishExpiry(firstClaim), 'already-done');

console.log(JSON.stringify({
  order: db.orders.get('order-42'),
  auditRows: db.audit.length,
  triggerFailureRolledBack: true,
  overlappingWorkerWasRejected: true,
  repeatedCompletionWasSafe: true,
}, null, 2));
