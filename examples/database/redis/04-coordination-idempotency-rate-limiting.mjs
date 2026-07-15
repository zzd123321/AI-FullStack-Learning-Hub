import assert from 'node:assert/strict';

class ManualClock {
  #nowMs = 0;

  now() {
    return this.#nowMs;
  }

  advance(milliseconds) {
    assert.ok(milliseconds >= 0);
    this.#nowMs += milliseconds;
  }
}

class LeaseCoordinator {
  #clock;
  #leases = new Map();
  #nextFencingToken = 0;

  constructor(clock) {
    this.#clock = clock;
  }

  #activeLease(resource) {
    const lease = this.#leases.get(resource);
    if (!lease) return null;
    if (lease.expiresAtMs <= this.#clock.now()) {
      this.#leases.delete(resource);
      return null;
    }
    return lease;
  }

  acquire(resource, ownerToken, ttlMs) {
    assert.ok(ttlMs > 0);
    if (this.#activeLease(resource)) return null;

    this.#nextFencingToken += 1;
    const lease = {
      ownerToken,
      fencingToken: this.#nextFencingToken,
      expiresAtMs: this.#clock.now() + ttlMs,
    };
    this.#leases.set(resource, lease);
    return structuredClone(lease);
  }

  release(resource, ownerToken) {
    const lease = this.#activeLease(resource);
    if (!lease || lease.ownerToken !== ownerToken) return false;
    this.#leases.delete(resource);
    return true;
  }
}

class FencedResource {
  #lastFencingToken = 0;
  #value = null;

  write(fencingToken, value) {
    if (fencingToken <= this.#lastFencingToken) return false;
    this.#lastFencingToken = fencingToken;
    this.#value = value;
    return true;
  }

  read() {
    return {
      lastFencingToken: this.#lastFencingToken,
      value: this.#value,
    };
  }
}

function verifyLeaseOwnershipAndFencing() {
  const clock = new ManualClock();
  const coordinator = new LeaseCoordinator(clock);
  const resource = new FencedResource();

  const leaseA = coordinator.acquire('daily-report', 'owner-A', 1_000);
  assert.equal(leaseA.fencingToken, 1);

  clock.advance(1_001);
  const leaseB = coordinator.acquire('daily-report', 'owner-B', 1_000);
  assert.equal(leaseB.fencingToken, 2);

  assert.equal(resource.write(leaseB.fencingToken, 'result-from-B'), true);
  assert.equal(
    coordinator.release('daily-report', 'owner-A'),
    false,
    '过期 owner 不能释放新 owner 的租约',
  );
  assert.equal(
    resource.write(leaseA.fencingToken, 'stale-result-from-A'),
    false,
    '资源必须拒绝较旧的 fencing token',
  );
  assert.deepEqual(resource.read(), {
    lastFencingToken: 2,
    value: 'result-from-B',
  });
  assert.equal(coordinator.release('daily-report', 'owner-B'), true);

  console.log('✓ owner token 防误释放，fencing token 防过期持有者覆盖新值');
}

class IdempotencyStore {
  #records = new Map();

  claim(key, fingerprint, owner) {
    const existing = this.#records.get(key);
    if (!existing) {
      this.#records.set(key, {
        state: 'processing',
        fingerprint,
        owner,
      });
      return { kind: 'acquired' };
    }
    if (existing.fingerprint !== fingerprint) return { kind: 'conflict' };
    if (existing.state === 'processing') return { kind: 'in_progress' };
    return { kind: 'replay', response: structuredClone(existing.response) };
  }

  succeed(key, owner, response) {
    const record = this.#records.get(key);
    if (!record || record.state !== 'processing' || record.owner !== owner) {
      return false;
    }
    this.#records.set(key, {
      ...record,
      state: 'succeeded',
      response: structuredClone(response),
    });
    return true;
  }
}

function verifyIdempotencyStateMachine() {
  const store = new IdempotencyStore();
  const key = 'tenant-42:create-order:request-abc';
  const fingerprint = 'sha256:order-body-v1';

  assert.deepEqual(store.claim(key, fingerprint, 'worker-A'), {
    kind: 'acquired',
  });
  assert.deepEqual(store.claim(key, fingerprint, 'worker-B'), {
    kind: 'in_progress',
  });
  assert.deepEqual(store.claim(key, 'sha256:different-body', 'worker-C'), {
    kind: 'conflict',
  });

  const response = { statusCode: 201, orderId: 'order-1001' };
  assert.equal(store.succeed(key, 'worker-B', response), false);
  assert.equal(store.succeed(key, 'worker-A', response), true);
  assert.deepEqual(store.claim(key, fingerprint, 'worker-D'), {
    kind: 'replay',
    response,
  });

  console.log('✓ 幂等状态机处理认领、处理中、指纹冲突和成功回放');
}

class FixedWindowLimiter {
  #counts = new Map();
  #clock;
  #windowMs;
  #limit;

  constructor({ clock, windowMs, limit }) {
    this.#clock = clock;
    this.#windowMs = windowMs;
    this.#limit = limit;
  }

  take(subject) {
    const windowId = Math.floor(this.#clock.now() / this.#windowMs);
    const key = `${subject}:${windowId}`;
    const used = (this.#counts.get(key) ?? 0) + 1;
    this.#counts.set(key, used);
    return {
      allowed: used <= this.#limit,
      used,
      remaining: Math.max(0, this.#limit - used),
    };
  }
}

function verifyFixedWindowLimitAndBoundaryBurst() {
  const clock = new ManualClock();
  const limiter = new FixedWindowLimiter({
    clock,
    windowMs: 60_000,
    limit: 5,
  });

  const decisions = Array.from({ length: 10 }, () => limiter.take('tenant-42'));
  assert.equal(decisions.filter((decision) => decision.allowed).length, 5);
  assert.equal(decisions.filter((decision) => !decision.allowed).length, 5);

  const boundaryClock = new ManualClock();
  boundaryClock.advance(59_999);
  const boundaryLimiter = new FixedWindowLimiter({
    clock: boundaryClock,
    windowMs: 60_000,
    limit: 5,
  });

  const beforeBoundary = Array.from({ length: 5 }, () =>
    boundaryLimiter.take('tenant-42'),
  );
  boundaryClock.advance(1);
  const afterBoundary = Array.from({ length: 5 }, () =>
    boundaryLimiter.take('tenant-42'),
  );
  assert.ok([...beforeBoundary, ...afterBoundary].every((item) => item.allowed));

  console.log('✓ 固定窗口严格限制单窗口额度，也复现了边界处双倍突发');
}

class TokenBucket {
  #capacity;
  #refillPerMs;
  #clock;
  #tokens;
  #lastRefillMs;

  constructor({ capacity, refillPerSecond, clock }) {
    this.#capacity = capacity;
    this.#refillPerMs = refillPerSecond / 1_000;
    this.#clock = clock;
    this.#tokens = capacity;
    this.#lastRefillMs = clock.now();
  }

  take(cost = 1) {
    assert.ok(cost > 0);
    const nowMs = this.#clock.now();
    const elapsedMs = Math.max(0, nowMs - this.#lastRefillMs);
    this.#tokens = Math.min(
      this.#capacity,
      this.#tokens + elapsedMs * this.#refillPerMs,
    );
    this.#lastRefillMs = nowMs;

    if (this.#tokens >= cost) {
      this.#tokens -= cost;
      return { allowed: true, retryAfterMs: 0, tokens: this.#tokens };
    }

    const missing = cost - this.#tokens;
    return {
      allowed: false,
      retryAfterMs: Math.ceil(missing / this.#refillPerMs),
      tokens: this.#tokens,
    };
  }
}

function verifyTokenBucket() {
  const clock = new ManualClock();
  const bucket = new TokenBucket({
    capacity: 5,
    refillPerSecond: 2,
    clock,
  });

  assert.equal(bucket.take(5).allowed, true);
  assert.deepEqual(bucket.take(1), {
    allowed: false,
    retryAfterMs: 500,
    tokens: 0,
  });

  clock.advance(1_500);
  const afterRefill = bucket.take(3);
  assert.equal(afterRefill.allowed, true);
  assert.equal(afterRefill.tokens, 0);

  clock.advance(10_000);
  const capped = bucket.take(5);
  assert.equal(capped.allowed, true, '长时间空闲后最多补充到桶容量');
  assert.equal(capped.tokens, 0);

  console.log('✓ 令牌桶限制突发、按时间补充并把令牌数限制在容量内');
}

verifyLeaseOwnershipAndFencing();
verifyIdempotencyStateMachine();
verifyFixedWindowLimitAndBoundaryBurst();
verifyTokenBucket();

console.log('全部协调、幂等、计数与限流状态模型断言通过。');
