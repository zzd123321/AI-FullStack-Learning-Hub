import assert from 'node:assert/strict';

const OPEN_END = Number.POSITIVE_INFINITY;
const instant = (value) => value === null ? OPEN_END : Date.parse(value);

function contains(from, to, point) {
  return instant(from) <= instant(point) && instant(point) < instant(to);
}

function overlaps(left, right) {
  return instant(left.validFrom) < instant(right.validTo)
    && instant(right.validFrom) < instant(left.validTo);
}

class BitemporalPrices {
  constructor() {
    this.versions = [];
  }

  add(version) {
    assert.ok(
      instant(version.validFrom) < instant(version.validTo),
      'valid interval must be non-empty [from, to)',
    );
    assert.ok(
      instant(version.recordedFrom) < instant(version.recordedTo),
      'recorded interval must be non-empty [from, to)',
    );

    // 同一个系统认知切片中，同一商品不能有重叠的业务有效版本。
    const conflict = this.versions.find((current) =>
      current.productId === version.productId
      && overlaps(current, version)
      && instant(current.recordedFrom) < instant(version.recordedTo)
      && instant(version.recordedFrom) < instant(current.recordedTo),
    );
    assert.equal(conflict, undefined, 'bitemporal rectangles must not overlap');
    this.versions.push(structuredClone(version));
  }

  closeRecordedVersion(correctionId, recordedTo) {
    const row = this.versions.find((item) =>
      item.correctionId === correctionId && item.recordedTo === null,
    );
    assert.ok(row, `open recorded version ${correctionId} must exist`);
    assert.ok(instant(row.recordedFrom) < instant(recordedTo));
    row.recordedTo = recordedTo;
  }

  asOf(productId, businessAsOf, systemAsOf) {
    const matches = this.versions.filter((item) =>
      item.productId === productId
      && contains(item.validFrom, item.validTo, businessAsOf)
      && contains(item.recordedFrom, item.recordedTo, systemAsOf),
    );
    assert.ok(matches.length <= 1, 'as-of query must be deterministic');
    return matches[0] ?? null;
  }
}

// 初始认知：7 月 1 日起价格为 1000 分。
const history = new BitemporalPrices();
history.add({
  productId: 'product-7',
  priceCents: 1000,
  validFrom: '2026-07-01T00:00:00Z',
  validTo: null,
  recordedFrom: '2026-07-01T00:05:00Z',
  recordedTo: null,
  correctionId: 'knowledge-v1',
});

assert.equal(
  history.asOf('product-7', '2026-07-16T12:00:00Z', '2026-07-16T12:00:00Z').priceCents,
  1000,
);

// 7 月 18 日才获知：价格其实在 7 月 15 日变为 800 分。
// 先关闭旧“系统认知”，再写入该认知下完整、无重叠的有效时间线。
history.closeRecordedVersion('knowledge-v1', '2026-07-18T09:20:00Z');
history.add({
  productId: 'product-7',
  priceCents: 1000,
  validFrom: '2026-07-01T00:00:00Z',
  validTo: '2026-07-15T00:00:00Z',
  recordedFrom: '2026-07-18T09:20:00Z',
  recordedTo: null,
  correctionId: 'knowledge-v2-before',
});
history.add({
  productId: 'product-7',
  priceCents: 800,
  validFrom: '2026-07-15T00:00:00Z',
  validTo: null,
  recordedFrom: '2026-07-18T09:20:00Z',
  recordedTo: null,
  correctionId: 'knowledge-v2-after',
});

// 站在 7 月 16 日当时，系统只知道旧价。
assert.equal(
  history.asOf('product-7', '2026-07-16T12:00:00Z', '2026-07-16T12:00:00Z').priceCents,
  1000,
);

// 站在 7 月 19 日回看同一业务时刻，系统已知道迟到修订。
assert.equal(
  history.asOf('product-7', '2026-07-16T12:00:00Z', '2026-07-19T12:00:00Z').priceCents,
  800,
);

// 半开边界：7 月 15 日 00:00 恰好属于新价格，不重复命中。
assert.equal(
  history.asOf('product-7', '2026-07-15T00:00:00Z', '2026-07-19T12:00:00Z').priceCents,
  800,
);

// 同一系统认知中的业务区间重叠必须被拒绝。
assert.throws(() => history.add({
  productId: 'product-7',
  priceCents: 900,
  validFrom: '2026-07-14T00:00:00Z',
  validTo: '2026-07-20T00:00:00Z',
  recordedFrom: '2026-07-18T09:20:00Z',
  recordedTo: null,
  correctionId: 'invalid-overlap',
}), /must not overlap/);

console.log(JSON.stringify({
  versions: history.versions,
  knownOnJuly16: 1000,
  correctedViewOnJuly19: 800,
  halfOpenBoundaryWasDeterministic: true,
  overlapWasRejected: true,
}, null, 2));
