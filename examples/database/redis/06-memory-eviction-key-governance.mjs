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

class ExpiringStoreModel {
  #clock;
  #entries = new Map();

  constructor(clock) {
    this.#clock = clock;
  }

  set(key, value, ttlMs) {
    this.#entries.set(key, {
      value,
      expiresAtMs: this.#clock.now() + ttlMs,
    });
  }

  get(key) {
    const entry = this.#entries.get(key);
    if (!entry) return null;
    if (entry.expiresAtMs <= this.#clock.now()) {
      this.#entries.delete(key);
      return null;
    }
    return entry.value;
  }

  activeExpire(keysToSample) {
    let removed = 0;
    for (const key of keysToSample) {
      const entry = this.#entries.get(key);
      if (entry && entry.expiresAtMs <= this.#clock.now()) {
        this.#entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  physicallyAllocatedEntries() {
    return this.#entries.size;
  }
}

function verifyPassiveAndActiveExpiration() {
  const clock = new ManualClock();
  const store = new ExpiringStoreModel(clock);
  store.set('accessed', 'A', 1_000);
  store.set('never-accessed', 'B', 1_000);

  clock.advance(1_001);
  assert.equal(
    store.physicallyAllocatedEntries(),
    2,
    '未访问、未抽样前，模型仍保留物理对象',
  );
  assert.equal(store.get('accessed'), null);
  assert.equal(store.physicallyAllocatedEntries(), 1);
  assert.equal(store.activeExpire(['never-accessed']), 1);
  assert.equal(store.physicallyAllocatedEntries(), 0);

  console.log('✓ 到期 key 在被动访问或主动抽样时完成物理清理');
}

class ExactEvictionModel {
  #capacity;
  #policy;
  #entries = new Map();
  #logicalTime = 0;

  constructor(capacity, policy) {
    this.#capacity = capacity;
    this.#policy = policy;
  }

  set(key, value) {
    this.#logicalTime += 1;
    const existing = this.#entries.get(key);
    if (!existing && this.#entries.size >= this.#capacity) this.#evictOne();
    this.#entries.set(key, {
      value,
      frequency: existing?.frequency ?? 1,
      lastAccess: this.#logicalTime,
    });
  }

  get(key) {
    const entry = this.#entries.get(key);
    if (!entry) return null;
    this.#logicalTime += 1;
    entry.frequency += 1;
    entry.lastAccess = this.#logicalTime;
    return entry.value;
  }

  keys() {
    return [...this.#entries.keys()].sort();
  }

  #evictOne() {
    const candidates = [...this.#entries.entries()];
    candidates.sort((left, right) => {
      const leftEntry = left[1];
      const rightEntry = right[1];
      if (this.#policy === 'lru') {
        return leftEntry.lastAccess - rightEntry.lastAccess;
      }
      return (
        leftEntry.frequency - rightEntry.frequency ||
        leftEntry.lastAccess - rightEntry.lastAccess
      );
    });
    this.#entries.delete(candidates[0][0]);
  }
}

function verifyLruAndLfuChooseDifferentVictims() {
  const lru = new ExactEvictionModel(3, 'lru');
  const lfu = new ExactEvictionModel(3, 'lfu');

  for (const cache of [lru, lfu]) {
    cache.set('A', 1);
    cache.set('B', 2);
    cache.set('C', 3);
    // A 长期高频，但 B、C 在随后时刻更新近访问时间。
    for (let count = 0; count < 5; count += 1) cache.get('A');
    cache.get('B');
    cache.get('C');
    cache.set('D', 4);
  }

  assert.deepEqual(lru.keys(), ['B', 'C', 'D']);
  assert.deepEqual(lfu.keys(), ['A', 'C', 'D']);
  console.log('✓ 精确 LRU 淘汰最久未访问 A，精确 LFU 保留高频 A、淘汰 B');
}

function gibibytes(value) {
  return value * 1024 ** 3;
}

function calculateDatasetBudget({
  totalMemoryBytes,
  systemReserveBytes,
  nonEvictableBuffersBytes,
  fragmentationAndForkReserveBytes,
  safetyReserveBytes,
}) {
  const datasetBudget =
    totalMemoryBytes -
    systemReserveBytes -
    nonEvictableBuffersBytes -
    fragmentationAndForkReserveBytes -
    safetyReserveBytes;
  assert.ok(datasetBudget > 0, '内存预留不能超过实例总内存');
  return datasetBudget;
}

function verifyCapacityBudget() {
  const total = gibibytes(8);
  const budget = calculateDatasetBudget({
    totalMemoryBytes: total,
    systemReserveBytes: gibibytes(0.5),
    nonEvictableBuffersBytes: gibibytes(0.5),
    fragmentationAndForkReserveBytes: gibibytes(1.5),
    safetyReserveBytes: gibibytes(0.5),
  });

  assert.equal(budget, gibibytes(5));
  assert.ok(budget < total);
  console.log('✓ 8 GiB 总限制扣除多类余量后，示例数据集预算为 5 GiB');
}

async function collectUniqueScanKeys(scan) {
  let cursor = '0';
  const uniqueKeys = new Set();
  let calls = 0;

  do {
    const result = await scan(cursor);
    cursor = result.cursor;
    calls += 1;
    for (const key of result.keys) uniqueKeys.add(key);
  } while (cursor !== '0');

  return { keys: [...uniqueKeys].sort(), calls };
}

async function verifyScanCursorAndDuplicates() {
  const replies = new Map([
    ['0', { cursor: '17', keys: ['learning:a', 'learning:b'] }],
    ['17', { cursor: '29', keys: [] }],
    ['29', { cursor: '41', keys: ['learning:b', 'learning:c'] }],
    ['41', { cursor: '0', keys: ['learning:d'] }],
  ]);

  const result = await collectUniqueScanKeys(async (cursor) => {
    const reply = replies.get(cursor);
    assert.ok(reply, `unexpected cursor: ${cursor}`);
    return reply;
  });

  assert.equal(result.calls, 4, '空批次不能被当成扫描结束');
  assert.deepEqual(result.keys, [
    'learning:a',
    'learning:b',
    'learning:c',
    'learning:d',
  ]);
  console.log('✓ SCAN 模型正确处理空批次、重复 key 和 cursor 结束条件');
}

function verifyBoundedBatching() {
  const totalMembers = 1_000_000;
  const batchSize = 1_000;
  const batches = Math.ceil(totalMembers / batchSize);

  assert.equal(batches, 1_000);
  assert.ok(batchSize < totalMembers);
  assert.equal(batches * batchSize, totalMembers);
  console.log('✓ 百万成员拆为 1,000 批，每批最多处理 1,000 个成员');
}

verifyPassiveAndActiveExpiration();
verifyLruAndLfuChooseDifferentVictims();
verifyCapacityBudget();
await verifyScanCursorAndDuplicates();
verifyBoundedBatching();

console.log('全部 Redis 内存与 key 治理状态模型断言通过。');
