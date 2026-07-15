import assert from 'node:assert/strict';

const HASH_SLOT_COUNT = 16_384;

function extractHashTag(key) {
  const openingBrace = key.indexOf('{');
  if (openingBrace === -1) return key;
  const closingBrace = key.indexOf('}', openingBrace + 1);
  if (closingBrace === -1 || closingBrace === openingBrace + 1) return key;
  return key.slice(openingBrace + 1, closingBrace);
}

function crc16(buffer) {
  let crc = 0;
  for (const byte of buffer) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc;
}

function hashSlot(key) {
  return crc16(Buffer.from(extractHashTag(key))) % HASH_SLOT_COUNT;
}

function verifyHashTagsAndSlots() {
  assert.equal(extractHashTag('foo{bar}one'), 'bar');
  assert.equal(extractHashTag('x{bar}two'), 'bar');
  assert.equal(extractHashTag('foo{}{bar}'), 'foo{}{bar}');
  assert.equal(extractHashTag('foo{bar}{zap}'), 'bar');
  assert.equal(extractHashTag('foo{bar'), 'foo{bar');

  const summary = 'learning:order:{order-1001}:summary';
  const items = 'learning:order:{order-1001}:items';
  assert.equal(hashSlot(summary), hashSlot(items));

  // Redis Cluster 规范给出的 CRC16 校验向量。
  assert.equal(crc16(Buffer.from('123456789')), 0x31c3);
  console.log('✓ hash tag 提取和 Redis CRC16 slot 计算通过');
}

function assertSameSlot(keys) {
  const slots = new Set(keys.map(hashSlot));
  if (slots.size !== 1) {
    throw new Error(`CROSSSLOT: ${[...slots].join(',')}`);
  }
  return [...slots][0];
}

function verifyMultiKeyBoundary() {
  assert.doesNotThrow(() =>
    assertSameSlot([
      'learning:order:{order-1001}:summary',
      'learning:order:{order-1001}:items',
    ]),
  );

  const first = 'learning:product:1001';
  let secondNumber = 1002;
  while (hashSlot(first) === hashSlot(`learning:product:${secondNumber}`)) {
    secondNumber += 1;
  }
  assert.throws(
    () => assertSameSlot([first, `learning:product:${secondNumber}`]),
    /CROSSSLOT/,
  );
  console.log('✓ 同 tag 多 key 可路由到一个 slot，跨 slot 操作被拒绝');
}

class ClusterClientModel {
  #slotOwners = new Map();
  commandLog = [];

  setStableOwner(slot, node) {
    this.#slotOwners.set(slot, node);
  }

  ownerFor(key) {
    return this.#slotOwners.get(hashSlot(key));
  }

  handleMoved(key, targetNode) {
    const slot = hashSlot(key);
    this.#slotOwners.set(slot, targetNode);
    this.commandLog.push({ kind: 'MOVED_RETRY', node: targetNode, key });
  }

  handleAsk(key, targetNode) {
    this.commandLog.push({ kind: 'ASKING', node: targetNode });
    this.commandLog.push({ kind: 'ASK_RETRY', node: targetNode, key });
    // ASK 是临时重定向，不能更新稳定 slot owner。
  }
}

function verifyMovedAndAskSemantics() {
  const key = 'learning:order:{order-1001}:summary';
  const client = new ClusterClientModel();
  client.setStableOwner(hashSlot(key), 'node-A');

  client.handleAsk(key, 'node-B');
  assert.equal(client.ownerFor(key), 'node-A');
  assert.deepEqual(client.commandLog.slice(0, 2), [
    { kind: 'ASKING', node: 'node-B' },
    { kind: 'ASK_RETRY', node: 'node-B', key },
  ]);

  client.handleMoved(key, 'node-B');
  assert.equal(client.ownerFor(key), 'node-B');
  assert.deepEqual(client.commandLog.at(-1), {
    kind: 'MOVED_RETRY',
    node: 'node-B',
    key,
  });
  console.log('✓ ASK 仅临时重试，MOVED 更新稳定 slot owner');
}

function summarizeNodeLoad(slotLoads, ownership) {
  const summary = new Map();
  for (const [slot, load] of slotLoads) {
    const node = ownership.get(slot);
    assert.ok(node, `slot ${slot} has no owner`);
    const current = summary.get(node) ?? { slots: 0, bytes: 0, qps: 0 };
    current.slots += 1;
    current.bytes += load.bytes;
    current.qps += load.qps;
    summary.set(node, current);
  }
  return summary;
}

function verifyEqualSlotCountCanHideLoadSkew() {
  const ownership = new Map([
    [1, 'node-A'],
    [2, 'node-A'],
    [3, 'node-B'],
    [4, 'node-B'],
  ]);
  const slotLoads = new Map([
    [1, { bytes: 30_000, qps: 9_000 }],
    [2, { bytes: 10_000, qps: 500 }],
    [3, { bytes: 10_000, qps: 250 }],
    [4, { bytes: 10_000, qps: 250 }],
  ]);

  const before = summarizeNodeLoad(slotLoads, ownership);
  assert.equal(before.get('node-A').slots, before.get('node-B').slots);
  assert.equal(before.get('node-A').qps, 9_500);
  assert.equal(before.get('node-B').qps, 500);

  ownership.set(1, 'node-B');
  const after = summarizeNodeLoad(slotLoads, ownership);
  assert.equal(after.get('node-A').qps, 500);
  assert.equal(after.get('node-B').qps, 9_500);
  assert.notEqual(
    after.get('node-A').slots,
    after.get('node-B').slots,
    '按负载移动后，slot 数不一定相等',
  );
  console.log('✓ 相同 slot 数可隐藏 19 倍 QPS 倾斜，rebalance 必须看负载');
}

function clusterAvailability({ requiredSlots, owners, requireFullCoverage }) {
  const missingSlots = requiredSlots.filter((slot) => !owners.has(slot));
  return {
    clusterAvailable: !requireFullCoverage || missingSlots.length === 0,
    missingSlots,
    canServe(slot) {
      if (requireFullCoverage && missingSlots.length > 0) return false;
      return owners.has(slot);
    },
  };
}

function verifyFullCoverageChoice() {
  const requiredSlots = [1, 2, 3];
  const owners = new Map([
    [1, 'node-A'],
    [2, 'node-B'],
  ]);

  const strict = clusterAvailability({
    requiredSlots,
    owners,
    requireFullCoverage: true,
  });
  assert.equal(strict.clusterAvailable, false);
  assert.equal(strict.canServe(1), false);

  const partial = clusterAvailability({
    requiredSlots,
    owners,
    requireFullCoverage: false,
  });
  assert.equal(partial.clusterAvailable, true);
  assert.equal(partial.canServe(1), true);
  assert.equal(partial.canServe(3), false);
  console.log('✓ full coverage 决定整体停止还是只服务仍有 owner 的 slot');
}

verifyHashTagsAndSlots();
verifyMultiKeyBoundary();
verifyMovedAndAskSemantics();
verifyEqualSlotCountCanHideLoadSkew();
verifyFullCoverageChoice();

console.log('全部 Redis Cluster 路由与迁移状态模型断言通过。');
