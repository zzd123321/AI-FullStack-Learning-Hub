import assert from 'node:assert/strict';

class Database {
  constructor() {
    this.orders = new Map([['order-1', { id: 'order-1', status: 'PAYING', version: 6 }]]);
    this.outbox = new Map();
  }

  payOrder({ orderId, expectedVersion, eventId }) {
    // 用副本模拟事务工作区：任何断言失败都不会修改真实状态。
    const orders = structuredClone(this.orders);
    const outbox = structuredClone(this.outbox);
    const order = orders.get(orderId);

    assert.equal(order?.status, 'PAYING');
    assert.equal(order.version, expectedVersion, '订单版本冲突');
    assert.equal(outbox.has(eventId), false, '事件 ID 已存在');

    const updated = { ...order, status: 'PAID', version: order.version + 1 };
    orders.set(orderId, updated);
    outbox.set(eventId, {
      eventId,
      eventType: 'OrderPaid',
      schemaVersion: 1,
      aggregateId: orderId,
      aggregateVersion: updated.version,
      payload: { orderId, status: 'PAID' },
      published: false,
    });

    // 单一提交点：订单和 outbox 不会只成功一边。
    this.orders = orders;
    this.outbox = outbox;
  }
}

class Broker {
  constructor() { this.messages = []; }
  publish(event) { this.messages.push(structuredClone(event)); }
}

class Relay {
  constructor(database, broker) {
    this.database = database;
    this.broker = broker;
  }

  deliver(eventId, { crashAfterPublish = false } = {}) {
    const event = this.database.outbox.get(eventId);
    assert.ok(event && !event.published);
    this.broker.publish(event);
    if (crashAfterPublish) throw new Error('relay crashed after broker ack');
    event.published = true;
  }
}

class ConsumerDatabase {
  constructor() {
    this.inbox = new Set();
    this.orderProjection = new Map();
  }

  process(event) {
    // 用副本模拟“inbox 去重 + 投影更新”的同一个本地事务。
    const inbox = structuredClone(this.inbox);
    const projection = structuredClone(this.orderProjection);
    if (inbox.has(event.eventId)) return 'DUPLICATE';

    const current = projection.get(event.aggregateId);
    if (current && event.aggregateVersion < current.version) {
      inbox.add(event.eventId);
      this.inbox = inbox;
      return 'STALE_IGNORED';
    }
    if (current && event.aggregateVersion > current.version + 1) {
      return 'VERSION_GAP'; // 不写 inbox，补齐后可以重试本事件。
    }
    if (current && event.aggregateVersion === current.version
        && current.status !== event.payload.status) {
      return 'CONFLICT';
    }

    projection.set(event.aggregateId, {
      status: event.payload.status,
      version: event.aggregateVersion,
    });
    inbox.add(event.eventId);
    this.orderProjection = projection;
    this.inbox = inbox;
    return 'APPLIED';
  }
}

const database = new Database();
database.payOrder({ orderId: 'order-1', expectedVersion: 6, eventId: 'event-7' });
assert.equal(database.orders.get('order-1').status, 'PAID');
assert.equal(database.outbox.get('event-7').published, false);
assert.throws(
  () => database.payOrder({ orderId: 'order-1', expectedVersion: 6, eventId: 'event-duplicate' }),
  /PAYING|版本冲突/,
);
assert.equal(database.outbox.has('event-duplicate'), false);
console.log('✓ 订单变化与 outbox 事件在同一事务工作区提交或一起回滚');

const broker = new Broker();
const relay = new Relay(database, broker);
assert.throws(() => relay.deliver('event-7', { crashAfterPublish: true }), /crashed/);
assert.equal(database.outbox.get('event-7').published, false);
relay.deliver('event-7');
assert.equal(broker.messages.length, 2);
console.log('✓ publish 后、标记前崩溃会产生合法重复，而不会丢失发送依据');

const consumer = new ConsumerDatabase();
assert.equal(consumer.process(broker.messages[0]), 'APPLIED');
assert.equal(consumer.process(broker.messages[1]), 'DUPLICATE');
assert.equal(consumer.orderProjection.get('order-1').version, 7);
console.log('✓ 持久 inbox 与投影同事务，使重复事件只产生一次业务副作用');

const futureEvent = {
  ...broker.messages[0],
  eventId: 'event-9',
  aggregateVersion: 9,
  payload: { orderId: 'order-1', status: 'SHIPPED' },
};
assert.equal(consumer.process(futureEvent), 'VERSION_GAP');
assert.equal(consumer.inbox.has('event-9'), false);

const staleEvent = {
  ...broker.messages[0],
  eventId: 'event-6',
  aggregateVersion: 6,
  payload: { orderId: 'order-1', status: 'PAYING' },
};
assert.equal(consumer.process(staleEvent), 'STALE_IGNORED');
assert.equal(consumer.orderProjection.get('order-1').status, 'PAID');
console.log('✓ 聚合版本发现缺口并拒绝旧事件覆盖新投影');

console.log('全部 Outbox 原子提交、至少一次交付、幂等与版本门禁断言通过。');
