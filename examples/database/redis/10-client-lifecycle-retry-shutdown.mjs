import assert from 'node:assert/strict';

const RESULT = Object.freeze({
  SUCCESS: 'success',
  REJECTED: 'rejected',
  UNKNOWN: 'unknown',
});

function classifyAttempt({ enteredSendQueue, bytesWritten, response }) {
  if (response?.type === 'reply') {
    return { state: RESULT.SUCCESS, value: response.value };
  }

  if (response?.type === 'redis-error') {
    return { state: RESULT.REJECTED, error: response.code };
  }

  if (!enteredSendQueue && bytesWritten === 0) {
    return { state: RESULT.REJECTED, error: 'NOT_SENT' };
  }

  return { state: RESULT.UNKNOWN, error: 'RESPONSE_NOT_OBSERVED' };
}

function allocateAttemptBudget({ nowMs, deadlineMs, limits }) {
  const remainingMs = Math.max(0, deadlineMs - nowMs);
  const poolWaitMs = Math.min(limits.poolWaitMs, remainingMs);
  const afterPool = Math.max(0, remainingMs - poolWaitMs);
  const connectMs = Math.min(limits.connectMs, afterPool);
  const afterConnect = Math.max(0, afterPool - connectMs);
  const commandMs = Math.min(limits.commandMs, afterConnect);

  return {
    remainingMs,
    poolWaitMs,
    connectMs,
    commandMs,
    allocatedMs: poolWaitMs + connectMs + commandMs,
  };
}

function deterministicFullJitter({ baseMs, maxBackoffMs, attempt, random }) {
  const capMs = Math.min(maxBackoffMs, baseMs * 2 ** attempt);
  return Math.floor(random() * (capMs + 1));
}

function planRetry({
  operation,
  result,
  attempt,
  maxAttempts,
  nowMs,
  deadlineMs,
  nextAttemptBudgetMs,
  random,
}) {
  const retryableErrors = new Set([
    'CONNECTION_RESET',
    'CONNECT_TIMEOUT',
    'LOADING',
    'MOVED',
    'ASK',
  ]);
  const safelyRepeatable = new Set(['CACHE_GET', 'CACHE_DEL', 'IDEMPOTENT_PUT']);

  if (result.state === RESULT.SUCCESS) {
    return { retry: false, reason: 'ALREADY_SUCCEEDED' };
  }

  if (!retryableErrors.has(result.error)) {
    return { retry: false, reason: 'ERROR_NOT_RETRYABLE' };
  }

  if (!safelyRepeatable.has(operation)) {
    return { retry: false, reason: 'OPERATION_NOT_SAFE_TO_REPEAT' };
  }

  if (attempt + 1 >= maxAttempts) {
    return { retry: false, reason: 'MAX_ATTEMPTS_EXHAUSTED' };
  }

  const sleepMs = deterministicFullJitter({
    baseMs: 10,
    maxBackoffMs: 100,
    attempt,
    random,
  });
  const fitsDeadline = nowMs + sleepMs + nextAttemptBudgetMs <= deadlineMs;

  if (!fitsDeadline) {
    return { retry: false, reason: 'DEADLINE_BUDGET_EXHAUSTED', sleepMs };
  }

  return { retry: true, reason: 'SAFE_TRANSIENT_RETRY', sleepMs };
}

function summarizePipeline(items) {
  const summary = {
    success: 0,
    rejected: 0,
    unknown: 0,
    outcomes: [],
  };

  for (const item of items) {
    const outcome = classifyAttempt(item);
    summary[outcome.state] += 1;
    summary.outcomes.push(outcome);
  }

  return summary;
}

class GracefulClientLifecycle {
  constructor() {
    this.state = 'ready';
    this.inFlight = new Map();
    this.events = [];
  }

  begin(operationId) {
    if (this.state !== 'ready') {
      return { accepted: false, reason: 'DRAINING' };
    }

    this.inFlight.set(operationId, { sent: false });
    this.events.push(`begin:${operationId}`);
    return { accepted: true };
  }

  markSent(operationId) {
    const operation = this.inFlight.get(operationId);
    assert.ok(operation, `unknown operation: ${operationId}`);
    operation.sent = true;
    this.events.push(`sent:${operationId}`);
  }

  complete(operationId) {
    assert.ok(this.inFlight.delete(operationId));
    this.events.push(`complete:${operationId}`);
  }

  startDrain() {
    assert.equal(this.state, 'ready');
    this.state = 'draining';
    this.events.push('readiness:false');
    return { waitingFor: [...this.inFlight.keys()] };
  }

  finishDrain() {
    assert.equal(this.state, 'draining');
    const unsent = [];
    const unknown = [];

    for (const [operationId, operation] of this.inFlight) {
      (operation.sent ? unknown : unsent).push(operationId);
    }

    this.inFlight.clear();
    this.state = 'closed';
    this.events.push('connections:closed');
    return { unsent, unknown };
  }
}

function run() {
  const ampleBudget = allocateAttemptBudget({
    nowMs: 1_000,
    deadlineMs: 1_080,
    limits: { poolWaitMs: 10, connectMs: 25, commandMs: 35 },
  });
  assert.deepEqual(ampleBudget, {
    remainingMs: 80,
    poolWaitMs: 10,
    connectMs: 25,
    commandMs: 35,
    allocatedMs: 70,
  });

  const shortBudget = allocateAttemptBudget({
    nowMs: 1_070,
    deadlineMs: 1_080,
    limits: { poolWaitMs: 10, connectMs: 25, commandMs: 35 },
  });
  assert.equal(shortBudget.allocatedMs, 10);
  assert.ok(shortBudget.allocatedMs <= shortBudget.remainingMs);
  console.log('✓ pool、connect、command 阶段预算不会超过请求剩余 deadline');

  assert.deepEqual(
    classifyAttempt({ enteredSendQueue: false, bytesWritten: 0 }),
    { state: RESULT.REJECTED, error: 'NOT_SENT' },
  );
  assert.deepEqual(
    classifyAttempt({ enteredSendQueue: true, bytesWritten: 32 }),
    { state: RESULT.UNKNOWN, error: 'RESPONSE_NOT_OBSERVED' },
  );
  assert.deepEqual(
    classifyAttempt({
      enteredSendQueue: true,
      bytesWritten: 32,
      response: { type: 'reply', value: 'OK' },
    }),
    { state: RESULT.SUCCESS, value: 'OK' },
  );
  console.log('✓ 未发送、明确响应与已发送但无响应被区分为三种结果');

  const cacheReadRetry = planRetry({
    operation: 'CACHE_GET',
    result: { state: RESULT.REJECTED, error: 'CONNECT_TIMEOUT' },
    attempt: 0,
    maxAttempts: 3,
    nowMs: 1_000,
    deadlineMs: 1_100,
    nextAttemptBudgetMs: 40,
    random: () => 0.5,
  });
  assert.equal(cacheReadRetry.retry, true);

  const counterRetry = planRetry({
    operation: 'COUNTER_INCREMENT',
    result: { state: RESULT.UNKNOWN, error: 'CONNECTION_RESET' },
    attempt: 0,
    maxAttempts: 3,
    nowMs: 1_000,
    deadlineMs: 1_100,
    nextAttemptBudgetMs: 40,
    random: () => 0.5,
  });
  assert.deepEqual(counterRetry, {
    retry: false,
    reason: 'OPERATION_NOT_SAFE_TO_REPEAT',
  });

  const deadlineRetry = planRetry({
    operation: 'CACHE_DEL',
    result: { state: RESULT.REJECTED, error: 'CONNECT_TIMEOUT' },
    attempt: 1,
    maxAttempts: 3,
    nowMs: 1_070,
    deadlineMs: 1_100,
    nextAttemptBudgetMs: 25,
    random: () => 0.999,
  });
  assert.equal(deadlineRetry.retry, false);
  assert.equal(deadlineRetry.reason, 'DEADLINE_BUDGET_EXHAUSTED');
  console.log('✓ 只有可安全重复的瞬时错误才在剩余预算内执行有界退避');

  const pipeline = summarizePipeline([
    {
      enteredSendQueue: true,
      bytesWritten: 20,
      response: { type: 'reply', value: 'A' },
    },
    {
      enteredSendQueue: true,
      bytesWritten: 20,
      response: { type: 'redis-error', code: 'WRONGTYPE' },
    },
    { enteredSendQueue: true, bytesWritten: 20 },
  ]);
  assert.deepEqual(
    { success: pipeline.success, rejected: pipeline.rejected, unknown: pipeline.unknown },
    { success: 1, rejected: 1, unknown: 1 },
  );
  console.log('✓ pipeline 保留每条命令的成功、明确拒绝和未知结果');

  const lifecycle = new GracefulClientLifecycle();
  assert.equal(lifecycle.begin('read-1').accepted, true);
  assert.equal(lifecycle.begin('write-1').accepted, true);
  lifecycle.markSent('write-1');
  lifecycle.startDrain();
  assert.deepEqual(lifecycle.begin('late-request'), {
    accepted: false,
    reason: 'DRAINING',
  });
  lifecycle.complete('read-1');
  const drained = lifecycle.finishDrain();
  assert.deepEqual(drained, { unsent: [], unknown: ['write-1'] });
  assert.deepEqual(lifecycle.events, [
    'begin:read-1',
    'begin:write-1',
    'sent:write-1',
    'readiness:false',
    'complete:read-1',
    'connections:closed',
  ]);
  console.log('✓ 停机先拒绝新请求并 drain，已发送未响应写被标记为未知');

  console.log('全部 Redis 客户端生命周期、重试与停机状态模型断言通过。');
}

run();
