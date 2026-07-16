import assert from 'node:assert/strict';

// 本模型只有一个 shop 分区；sequence 只在该分区内连续，不代表全局顺序。
class DailySalesModel {
  constructor(version) {
    this.version = version;
    this.watermark = 0;
    this.processedEventIds = new Set();
    this.rows = new Map();
  }

  apply(event) {
    if (this.processedEventIds.has(event.id)) {
      return { status: 'duplicate', watermark: this.watermark };
    }
    if (event.sequence !== this.watermark + 1) {
      return {
        status: 'gap',
        expectedSequence: this.watermark + 1,
        receivedSequence: event.sequence,
      };
    }

    const key = `${event.shopId}:${event.saleDate}`;
    const current = this.rows.get(key) ?? {
      shopId: event.shopId,
      saleDate: event.saleDate,
      orderCount: 0,
      revenueCents: 0,
    };

    // deltaOrderCount 让退款只冲减金额；取消订单等规则应由事件契约明确。
    const next = {
      ...current,
      orderCount: current.orderCount + event.deltaOrderCount,
      revenueCents: current.revenueCents + event.deltaRevenueCents,
      sourceWatermark: event.sequence,
      modelVersion: this.version,
    };

    assert.ok(next.orderCount >= 0, 'order count must not become negative');
    this.rows.set(key, next);
    this.processedEventIds.add(event.id);
    this.watermark = event.sequence;
    return { status: 'applied', watermark: this.watermark };
  }

  snapshot() {
    return [...this.rows.values()].sort((a, b) =>
      `${a.shopId}:${a.saleDate}`.localeCompare(`${b.shopId}:${b.saleDate}`),
    );
  }
}

const events = [
  {
    id: 'evt-order-101-paid', sequence: 1, shopId: 'shop-42',
    saleDate: '2026-07-16', deltaOrderCount: 1, deltaRevenueCents: 1000,
  },
  {
    id: 'evt-order-102-paid', sequence: 2, shopId: 'shop-42',
    saleDate: '2026-07-16', deltaOrderCount: 1, deltaRevenueCents: 500,
  },
  {
    // 补偿事件保留原支付事实，只冲减退款金额。
    id: 'evt-order-101-refund-1', sequence: 3, shopId: 'shop-42',
    saleDate: '2026-07-16', deltaOrderCount: 0, deltaRevenueCents: -200,
  },
  {
    id: 'evt-order-103-paid', sequence: 4, shopId: 'shop-42',
    saleDate: '2026-07-16', deltaOrderCount: 1, deltaRevenueCents: 700,
  },
];

const live = new DailySalesModel('v1');
assert.equal(live.apply(events[0]).status, 'applied');
assert.equal(live.apply(events[1]).status, 'applied');

// 至少一次投递：相同事件 ID 重放，不得再次累计。
assert.equal(live.apply(events[1]).status, 'duplicate');
assert.equal(live.snapshot()[0].revenueCents, 1500);

// 先收到 sequence=4，必须暴露缺口，不能悄悄越过 sequence=3。
assert.deepEqual(live.apply(events[3]), {
  status: 'gap', expectedSequence: 3, receivedSequence: 4,
});
assert.equal(live.watermark, 2);

assert.equal(live.apply(events[2]).status, 'applied');
assert.equal(live.apply(events[3]).status, 'applied');
assert.deepEqual(live.snapshot()[0], {
  shopId: 'shop-42',
  saleDate: '2026-07-16',
  orderCount: 3,
  revenueCents: 2000,
  sourceWatermark: 4,
  modelVersion: 'v1',
});

// 以水位 3 的一致快照构建 v2 影子模型，再衔接水位之后的增量。
const rebuildWatermark = 3;
const shadow = new DailySalesModel('v2');
for (const event of events.filter((item) => item.sequence <= rebuildWatermark)) {
  assert.equal(shadow.apply(event).status, 'applied');
}
for (const event of events.filter((item) => item.sequence > rebuildWatermark)) {
  assert.equal(shadow.apply(event).status, 'applied');
}

const comparable = (model) => model.snapshot().map(({ modelVersion, ...row }) => row);
assert.deepEqual(comparable(shadow), comparable(live));
assert.equal(shadow.watermark, live.watermark);

console.log(JSON.stringify({
  duplicateWasIgnored: true,
  gapWasDetected: true,
  live: live.snapshot(),
  shadow: shadow.snapshot(),
  cutoverAllowed: true,
}, null, 2));
