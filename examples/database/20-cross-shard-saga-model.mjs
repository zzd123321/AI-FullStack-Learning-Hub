import assert from 'node:assert/strict';

class AccountShard {
  constructor(initialBalances) {
    this.balances = new Map(Object.entries(initialBalances));
    this.reservations = new Map();
    this.credits = new Set();
  }

  reserve({ workflowId, accountId, amount }) {
    const existing = this.reservations.get(workflowId);
    if (existing) return existing;
    const balance = this.balances.get(accountId);
    assert.ok(balance >= amount, '余额不足');
    const reservation = { accountId, amount, status: 'RESERVED' };
    this.reservations.set(workflowId, reservation);
    return reservation;
  }

  applyCredit({ workflowId, accountId, amount, fail = false }) {
    if (this.credits.has(workflowId)) return 'ALREADY_APPLIED';
    if (fail) throw new Error('目标 shard 暂时不可用');
    this.balances.set(accountId, this.balances.get(accountId) + amount);
    this.credits.add(workflowId);
    return 'APPLIED';
  }

  confirmDebit(workflowId) {
    const reservation = this.reservations.get(workflowId);
    assert.equal(reservation?.status, 'RESERVED');
    this.balances.set(
      reservation.accountId,
      this.balances.get(reservation.accountId) - reservation.amount,
    );
    reservation.status = 'CONFIRMED';
  }

  releaseReservation(workflowId) {
    const reservation = this.reservations.get(workflowId);
    assert.equal(reservation?.status, 'RESERVED');
    reservation.status = 'RELEASED';
  }
}

class TransferSaga {
  constructor({ id, sourceAccount, targetAccount, amount }) {
    this.id = id;
    this.sourceAccount = sourceAccount;
    this.targetAccount = targetAccount;
    this.amount = amount;
    this.state = 'CREATED';
    this.attempts = 0;
    this.lastError = null;
  }

  reserve(sourceShard) {
    assert.equal(this.state, 'CREATED');
    sourceShard.reserve({
      workflowId: this.id,
      accountId: this.sourceAccount,
      amount: this.amount,
    });
    this.state = 'DEBIT_RESERVED';
  }

  credit(targetShard, { fail = false } = {}) {
    assert.equal(this.state, 'DEBIT_RESERVED');
    this.attempts += 1;
    try {
      targetShard.applyCredit({
        workflowId: this.id,
        accountId: this.targetAccount,
        amount: this.amount,
        fail,
      });
      this.state = 'CREDIT_APPLIED';
      this.lastError = null;
    } catch (error) {
      this.lastError = error.message;
      this.state = 'CREDIT_FAILED';
    }
  }

  complete(sourceShard) {
    assert.equal(this.state, 'CREDIT_APPLIED');
    sourceShard.confirmDebit(this.id);
    this.state = 'COMPLETED';
  }

  compensate(sourceShard) {
    assert.equal(this.state, 'CREDIT_FAILED');
    sourceShard.releaseReservation(this.id);
    this.state = 'COMPENSATED';
  }
}

function run() {
  const sourceShard = new AccountShard({ alice: 100 });
  const targetShard = new AccountShard({ bob: 20 });
  const transfer = new TransferSaga({
    id: 'transfer-001',
    sourceAccount: 'alice',
    targetAccount: 'bob',
    amount: 30,
  });

  transfer.reserve(sourceShard);
  sourceShard.reserve({
    workflowId: transfer.id,
    accountId: 'alice',
    amount: 30,
  });
  assert.equal(sourceShard.reservations.size, 1);
  assert.equal(sourceShard.balances.get('alice'), 100);
  console.log('✓ 重复预留使用 workflowId 幂等，预留阶段尚未真正扣减余额');

  transfer.credit(targetShard);
  targetShard.applyCredit({
    workflowId: transfer.id,
    accountId: 'bob',
    amount: 30,
  });
  assert.equal(targetShard.balances.get('bob'), 50);
  transfer.complete(sourceShard);
  assert.equal(sourceShard.balances.get('alice'), 70);
  assert.equal(transfer.state, 'COMPLETED');
  console.log('✓ 重复入账不重复增加余额，成功流程最终确认源账户扣款');

  const failed = new TransferSaga({
    id: 'transfer-002',
    sourceAccount: 'alice',
    targetAccount: 'bob',
    amount: 10,
  });
  failed.reserve(sourceShard);
  failed.credit(targetShard, { fail: true });
  assert.equal(failed.state, 'CREDIT_FAILED');
  assert.equal(failed.lastError, '目标 shard 暂时不可用');
  failed.compensate(sourceShard);
  assert.equal(sourceShard.reservations.get(failed.id).status, 'RELEASED');
  assert.equal(sourceShard.balances.get('alice'), 70);
  console.log('✓ 目标写入失败后执行语义补偿，释放预留且不误扣余额');

  assert.throws(() => failed.complete(sourceShard));
  console.log('✓ 状态机拒绝从 COMPENSATED 非法跳转为 COMPLETED');

  console.log('全部跨分片 Saga、幂等与补偿状态断言通过。');
}

run();
