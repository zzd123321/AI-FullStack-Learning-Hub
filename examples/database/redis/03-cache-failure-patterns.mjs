import assert from 'node:assert/strict';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function verifyConcurrentMissAmplification() {
  const naiveGate = deferred();
  let naiveLoadCount = 0;

  const naiveLoader = async () => {
    naiveLoadCount += 1;
    return naiveGate.promise;
  };

  // 所有调用都先看到 miss，因此各自启动一次数据库加载。
  const naiveCalls = Array.from({ length: 100 }, () => naiveLoader());
  assert.equal(naiveLoadCount, 100);
  naiveGate.resolve({ id: 42, name: 'hot product' });
  await Promise.all(naiveCalls);

  const cache = new Map();
  const inFlight = new Map();
  const coalescedGate = deferred();
  let coalescedLoadCount = 0;

  async function getOrLoad(key, loader) {
    if (cache.has(key)) return cache.get(key);
    if (inFlight.has(key)) return inFlight.get(key);

    const loading = (async () => {
      const value = await loader();
      cache.set(key, value);
      return value;
    })();

    inFlight.set(key, loading);
    try {
      return await loading;
    } finally {
      // 只清除自己登记的 Promise，避免旧请求误删后来的加载。
      if (inFlight.get(key) === loading) inFlight.delete(key);
    }
  }

  const loader = async () => {
    coalescedLoadCount += 1;
    return coalescedGate.promise;
  };

  const coalescedCalls = Array.from({ length: 100 }, () =>
    getOrLoad('cache:product:42', loader),
  );

  assert.equal(coalescedLoadCount, 1);
  assert.equal(inFlight.size, 1);
  coalescedGate.resolve({ id: 42, name: 'hot product' });

  const values = await Promise.all(coalescedCalls);
  assert.equal(values.length, 100);
  assert.ok(values.every((value) => value.id === 42));
  assert.equal(inFlight.size, 0);

  const hit = await getOrLoad('cache:product:42', async () => {
    throw new Error('cache hit must not call loader');
  });
  assert.equal(hit.name, 'hot product');

  console.log('✓ 100 个并发 miss：朴素加载 100 次，singleflight 加载 1 次');
}

class NegativeCache {
  #entries = new Map();
  #nowMs = 0;

  advance(milliseconds) {
    this.#nowMs += milliseconds;
  }

  get(key) {
    const entry = this.#entries.get(key);
    if (!entry) return { kind: 'miss' };
    if (entry.expiresAtMs <= this.#nowMs) {
      this.#entries.delete(key);
      return { kind: 'miss' };
    }
    return entry.value;
  }

  setNotFound(key, ttlMs) {
    this.#entries.set(key, {
      value: { kind: 'not_found' },
      expiresAtMs: this.#nowMs + ttlMs,
    });
  }
}

async function verifyNegativeCaching() {
  const cache = new NegativeCache();
  let databaseReads = 0;

  async function findMissingUser() {
    const key = 'cache:user:999999';
    const cached = cache.get(key);
    if (cached.kind === 'not_found') return null;

    databaseReads += 1;
    const databaseResult = null;
    if (databaseResult === null) cache.setNotFound(key, 30_000);
    return databaseResult;
  }

  for (let index = 0; index < 100; index += 1) {
    assert.equal(await findMissingUser(), null);
  }
  assert.equal(databaseReads, 1);

  cache.advance(30_001);
  assert.equal(await findMissingUser(), null);
  assert.equal(databaseReads, 2, '负缓存到期后应重新确认数据库事实');

  let failedReads = 0;
  async function loadWithDatabaseFailure() {
    const key = 'cache:user:500000';
    const cached = cache.get(key);
    if (cached.kind === 'not_found') return null;

    failedReads += 1;
    throw new Error('simulated database timeout');
  }

  await assert.rejects(loadWithDatabaseFailure(), /database timeout/);
  await assert.rejects(loadWithDatabaseFailure(), /database timeout/);
  assert.equal(failedReads, 2, '查询错误不能写成 not_found');

  console.log('✓ not found 被短期缓存，数据库错误不会被负缓存');
}

function createDeterministicRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

function expirationHistogram(count, baseSeconds, spreadSeconds, random) {
  const histogram = new Map();
  for (let index = 0; index < count; index += 1) {
    const jitter = Math.floor(random() * (spreadSeconds + 1));
    const expirationSecond = baseSeconds + jitter;
    histogram.set(
      expirationSecond,
      (histogram.get(expirationSecond) ?? 0) + 1,
    );
  }
  return histogram;
}

function maxBucketSize(histogram) {
  return Math.max(...histogram.values());
}

function verifyTtlJitter() {
  const noJitter = expirationHistogram(1_000, 300, 0, () => 0);
  assert.equal(noJitter.size, 1);
  assert.equal(maxBucketSize(noJitter), 1_000);

  const random = createDeterministicRandom(20260715);
  const jittered = expirationHistogram(1_000, 300, 60, random);
  assert.ok(jittered.size >= 55, '到期时间应覆盖大部分 0～60 秒窗口');
  assert.ok(maxBucketSize(jittered) < 35, '单秒到期数量应明显下降');

  console.log(
    `✓ TTL 抖动：1 个到期桶分散为 ${jittered.size} 个，最大桶 ${maxBucketSize(jittered)} 个 key`,
  );
}

await verifyConcurrentMissAmplification();
await verifyNegativeCaching();
verifyTtlJitter();

console.log('全部缓存故障模式状态模型断言通过。');
