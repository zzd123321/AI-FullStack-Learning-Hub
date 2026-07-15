import assert from 'node:assert/strict';

class ListQueueModel {
  ready = [];
  processing = [];

  push(message) {
    this.ready.push(structuredClone(message));
  }

  popUnsafe() {
    return this.ready.shift() ?? null;
  }

  moveToProcessing() {
    const message = this.ready.shift();
    if (!message) return null;
    this.processing.push(message);
    return structuredClone(message);
  }

  acknowledge(eventId) {
    const index = this.processing.findIndex(
      (message) => message.eventId === eventId,
    );
    if (index === -1) return false;
    this.processing.splice(index, 1);
    return true;
  }

  requeue(eventId) {
    const index = this.processing.findIndex(
      (message) => message.eventId === eventId,
    );
    if (index === -1) return false;
    const [message] = this.processing.splice(index, 1);
    this.ready.unshift(message);
    return true;
  }
}

function verifyListFailureWindows() {
  const unsafe = new ListQueueModel();
  unsafe.push({ eventId: 'list-1', type: 'SendEmail' });
  const removed = unsafe.popUnsafe();
  assert.equal(removed.eventId, 'list-1');
  // 模拟消费者在业务处理前崩溃：ready 和 processing 都找不到消息。
  assert.equal(unsafe.ready.length, 0);
  assert.equal(unsafe.processing.length, 0);

  const recoverable = new ListQueueModel();
  recoverable.push({ eventId: 'list-2', type: 'SendEmail' });
  const moved = recoverable.moveToProcessing();
  assert.equal(moved.eventId, 'list-2');
  assert.equal(recoverable.ready.length, 0);
  assert.equal(recoverable.processing.length, 1);

  // 模拟恢复器识别超时任务并重新入队。
  assert.equal(recoverable.requeue('list-2'), true);
  assert.equal(recoverable.ready[0].eventId, 'list-2');
  assert.equal(recoverable.processing.length, 0);

  console.log('✓ List pop 后崩溃会丢任务，processing 模式允许重新入队');
}

class PubSubModel {
  #subscribers = new Map();

  subscribe(channel, subscriber) {
    const subscribers = this.#subscribers.get(channel) ?? new Set();
    subscribers.add(subscriber);
    this.#subscribers.set(channel, subscribers);
    return () => subscribers.delete(subscriber);
  }

  publish(channel, message) {
    const subscribers = this.#subscribers.get(channel) ?? new Set();
    for (const subscriber of subscribers) {
      subscriber(structuredClone(message));
    }
    return subscribers.size;
  }
}

function verifyPubSubOnlineOnlyDelivery() {
  const pubsub = new PubSubModel();
  const receivedByA = [];
  const receivedByB = [];

  const unsubscribeA = pubsub.subscribe('price-changed', (message) => {
    receivedByA.push(message);
  });

  assert.equal(
    pubsub.publish('price-changed', { eventId: 'pubsub-1' }),
    1,
  );
  assert.deepEqual(receivedByA.map((message) => message.eventId), ['pubsub-1']);

  unsubscribeA();
  assert.equal(
    pubsub.publish('price-changed', { eventId: 'pubsub-offline' }),
    0,
  );

  pubsub.subscribe('price-changed', (message) => {
    receivedByB.push(message);
  });
  assert.equal(
    pubsub.publish('price-changed', { eventId: 'pubsub-2' }),
    1,
  );
  assert.deepEqual(receivedByB.map((message) => message.eventId), ['pubsub-2']);
  assert.ok(
    !receivedByB.some((message) => message.eventId === 'pubsub-offline'),
    '新订阅者不能补收离线期间发布的消息',
  );

  console.log('✓ Pub/Sub 只广播给当前在线订阅者，离线消息不会补发');
}

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

class StreamModel {
  #clock;
  #entries = [];
  #groups = new Map();
  #sequence = 0;

  constructor(clock) {
    this.#clock = clock;
  }

  add(fields) {
    this.#sequence += 1;
    const entry = {
      id: `${this.#clock.now()}-${this.#sequence}`,
      fields: structuredClone(fields),
    };
    this.#entries.push(entry);
    return entry.id;
  }

  createGroup(groupName, startIndex = 0) {
    assert.ok(!this.#groups.has(groupName));
    this.#groups.set(groupName, {
      nextIndex: startIndex,
      pending: new Map(),
    });
  }

  readGroup(groupName, consumerName, count = 1) {
    const group = this.#requireGroup(groupName);
    const messages = [];

    while (messages.length < count && group.nextIndex < this.#entries.length) {
      const entry = this.#entries[group.nextIndex];
      group.nextIndex += 1;
      group.pending.set(entry.id, {
        consumerName,
        deliveries: 1,
        lastDeliveredAtMs: this.#clock.now(),
      });
      messages.push(structuredClone(entry));
    }
    return messages;
  }

  acknowledge(groupName, entryId) {
    return this.#requireGroup(groupName).pending.delete(entryId);
  }

  autoClaim(groupName, newConsumerName, minIdleMs, count = 100) {
    const group = this.#requireGroup(groupName);
    const claimed = [];

    for (const [entryId, pending] of group.pending) {
      if (claimed.length >= count) break;
      const idleMs = this.#clock.now() - pending.lastDeliveredAtMs;
      if (idleMs < minIdleMs) continue;

      pending.consumerName = newConsumerName;
      pending.deliveries += 1;
      pending.lastDeliveredAtMs = this.#clock.now();
      const entry = this.#entries.find((candidate) => candidate.id === entryId);
      if (entry) claimed.push(structuredClone(entry));
    }
    return claimed;
  }

  pending(groupName) {
    return [...this.#requireGroup(groupName).pending.entries()].map(
      ([entryId, pending]) => ({ entryId, ...structuredClone(pending) }),
    );
  }

  #requireGroup(groupName) {
    const group = this.#groups.get(groupName);
    assert.ok(group, `unknown group: ${groupName}`);
    return group;
  }
}

class InboxDatabase {
  #processedEventIds = new Set();
  #effects = [];

  processOnce(eventId, effect) {
    if (this.#processedEventIds.has(eventId)) return false;
    // 模型中二者表示同一个数据库事务里的 Inbox INSERT 与业务写入。
    this.#processedEventIds.add(eventId);
    this.#effects.push(effect);
    return true;
  }

  effects() {
    return structuredClone(this.#effects);
  }
}

function verifyStreamPendingClaimAndIdempotency() {
  const clock = new ManualClock();
  const stream = new StreamModel(clock);
  const database = new InboxDatabase();

  stream.createGroup('email-workers');
  const streamId = stream.add({
    eventId: 'stream-1',
    type: 'OrderCreated',
    orderId: 'order-1001',
  });

  const [firstDelivery] = stream.readGroup('email-workers', 'worker-A');
  assert.equal(firstDelivery.id, streamId);
  assert.equal(stream.pending('email-workers').length, 1);

  // 业务数据库已经提交，但 worker-A 在 ACK 前崩溃。
  assert.equal(
    database.processOnce(firstDelivery.fields.eventId, 'send-order-email'),
    true,
  );

  clock.advance(60_001);
  const [redelivery] = stream.autoClaim(
    'email-workers',
    'worker-B',
    60_000,
  );
  assert.equal(redelivery.id, streamId);
  assert.equal(stream.pending('email-workers')[0].deliveries, 2);

  assert.equal(
    database.processOnce(redelivery.fields.eventId, 'send-order-email'),
    false,
    'Inbox 应识别已提交的业务事件',
  );
  assert.deepEqual(database.effects(), ['send-order-email']);
  assert.equal(stream.acknowledge('email-workers', streamId), true);
  assert.equal(stream.pending('email-workers').length, 0);

  console.log('✓ Streams pending 可被认领，Inbox 去重阻止重投副作用');
}

function verifyGroupsBroadcastAndConsumersCompete() {
  const clock = new ManualClock();
  const stream = new StreamModel(clock);
  stream.createGroup('email-workers');
  stream.createGroup('analytics');

  const id = stream.add({ eventId: 'stream-2', type: 'OrderCreated' });
  const emailForA = stream.readGroup('email-workers', 'worker-A', 1);
  const emailForB = stream.readGroup('email-workers', 'worker-B', 1);
  const analytics = stream.readGroup('analytics', 'worker-C', 1);

  assert.deepEqual(emailForA.map((entry) => entry.id), [id]);
  assert.equal(emailForB.length, 0, '同 group 的新消息只交给一个 consumer');
  assert.deepEqual(analytics.map((entry) => entry.id), [id]);
  assert.equal(stream.pending('email-workers').length, 1);
  assert.equal(stream.pending('analytics').length, 1);

  console.log('✓ consumer 在组内竞争，两个独立 group 各收到一份');
}

verifyListFailureWindows();
verifyPubSubOnlineOnlyDelivery();
verifyStreamPendingClaimAndIdempotency();
verifyGroupsBroadcastAndConsumersCompete();

console.log('全部 Redis 消息模型断言通过。');
