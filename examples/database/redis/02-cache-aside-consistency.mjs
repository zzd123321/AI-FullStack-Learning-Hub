import assert from 'node:assert/strict';

class FakeDatabase {
  #record = { id: 1001, name: 'Alice', version: 1 };
  #outbox = [];

  read() {
    return structuredClone(this.#record);
  }

  updateName(name) {
    this.#record = {
      ...this.#record,
      name,
      version: this.#record.version + 1,
    };
    return this.read();
  }

  updateNameWithOutbox(name) {
    const updated = this.updateName(name);
    this.#outbox.push({
      eventId: `user-${updated.id}-v${updated.version}`,
      type: 'UserChanged',
      userId: updated.id,
      version: updated.version,
      processed: false,
    });
    return updated;
  }

  nextOutboxEvent() {
    return this.#outbox.find((event) => !event.processed) ?? null;
  }

  markProcessed(eventId) {
    const event = this.#outbox.find((candidate) => candidate.eventId === eventId);
    assert.ok(event, `unknown outbox event: ${eventId}`);
    event.processed = true;
  }
}

class FakeCache {
  #values = new Map();
  #generations = new Map();
  failNextDelete = false;

  get(key) {
    const value = this.#values.get(key);
    return value === undefined ? null : structuredClone(value);
  }

  set(key, value) {
    this.#values.set(key, structuredClone(value));
  }

  delete(key) {
    if (this.failNextDelete) {
      this.failNextDelete = false;
      throw new Error('simulated Redis timeout before delete');
    }
    this.#values.delete(key);
  }

  generation(key) {
    return this.#generations.get(key) ?? 0;
  }

  invalidate(key) {
    this.#generations.set(key, this.generation(key) + 1);
    this.delete(key);
  }

  setIfGenerationMatches(key, expectedGeneration, value) {
    if (this.generation(key) !== expectedGeneration) return false;
    this.set(key, value);
    return true;
  }
}

const cacheKey = (userId) => `cache:user-api:v1:user:${userId}`;

function cacheAsideRead(database, cache, userId) {
  const key = cacheKey(userId);
  const cached = cache.get(key);
  if (cached !== null) return { source: 'cache', user: cached };

  const user = database.read();
  cache.set(key, user);
  return { source: 'database', user };
}

function updateThenInvalidate(database, cache, name) {
  const updated = database.updateName(name);
  cache.delete(cacheKey(updated.id));
  return updated;
}

function processOneOutboxEvent(database, cache) {
  const event = database.nextOutboxEvent();
  if (event === null) return false;

  cache.invalidate(cacheKey(event.userId));
  database.markProcessed(event.eventId);
  return true;
}

function verifyBasicCacheAside() {
  const database = new FakeDatabase();
  const cache = new FakeCache();

  const first = cacheAsideRead(database, cache, 1001);
  const second = cacheAsideRead(database, cache, 1001);
  assert.equal(first.source, 'database');
  assert.equal(second.source, 'cache');

  const updated = updateThenInvalidate(database, cache, 'Bob');
  assert.equal(updated.version, 2);
  assert.equal(cache.get(cacheKey(1001)), null);

  const afterUpdate = cacheAsideRead(database, cache, 1001);
  assert.equal(afterUpdate.user.name, 'Bob');
  assert.equal(afterUpdate.user.version, 2);
  console.log('✓ miss 回填、hit、提交后失效和重新加载');
}

function demonstrateStaleRefillRace() {
  const database = new FakeDatabase();
  const cache = new FakeCache();
  const key = cacheKey(1001);

  // 读请求先取得旧数据库快照，但暂停在写缓存之前。
  const slowReaderSnapshot = database.read();
  assert.equal(slowReaderSnapshot.version, 1);

  // 写请求提交 v2，并成功删除缓存。
  updateThenInvalidate(database, cache, 'Bob');

  // 慢读恢复，把先前的 v1 写回，确定性复现旧读回填竞态。
  cache.set(key, slowReaderSnapshot);
  assert.equal(database.read().version, 2);
  assert.equal(cache.get(key).version, 1);
  console.log('✓ 已复现：删除完成后，慢读仍可能回填旧版本');
}

function verifyGenerationGuard() {
  const database = new FakeDatabase();
  const cache = new FakeCache();
  const key = cacheKey(1001);

  const observedGeneration = cache.generation(key);
  const slowReaderSnapshot = database.read();

  database.updateName('Bob');
  cache.invalidate(key);

  const accepted = cache.setIfGenerationMatches(
    key,
    observedGeneration,
    slowReaderSnapshot,
  );

  assert.equal(accepted, false);
  assert.equal(cache.get(key), null);
  assert.equal(database.read().version, 2);
  console.log('✓ generation 条件写拒绝已失效的旧读回填');
}

function verifyOutboxRecovery() {
  const database = new FakeDatabase();
  const cache = new FakeCache();
  const key = cacheKey(1001);

  cacheAsideRead(database, cache, 1001);
  assert.equal(cache.get(key).version, 1);

  const updated = database.updateNameWithOutbox('Carol');
  assert.equal(updated.version, 2);

  cache.failNextDelete = true;
  assert.throws(
    () => processOneOutboxEvent(database, cache),
    /simulated Redis timeout/,
  );
  assert.equal(cache.get(key).version, 1);
  assert.ok(database.nextOutboxEvent(), '失败事件必须保持未处理');

  const processed = processOneOutboxEvent(database, cache);
  assert.equal(processed, true);
  assert.equal(cache.get(key), null);
  assert.equal(database.nextOutboxEvent(), null);
  console.log('✓ Outbox 在失效失败后重试并最终删除旧缓存');
}

verifyBasicCacheAside();
demonstrateStaleRefillRace();
verifyGenerationGuard();
verifyOutboxRecovery();

console.log('全部 Cache-Aside 状态模型断言通过。');
