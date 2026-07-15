import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

function parseInstant(value) {
  const milliseconds = Date.parse(value);
  assert.ok(Number.isFinite(milliseconds), `无效时间：${value}`);
  return milliseconds;
}

class TimePartition {
  constructor({ name, start, end, rows = [] }) {
    this.name = name;
    this.start = parseInstant(start);
    this.end = parseInstant(end);
    this.rows = rows;
    this.state = 'ACTIVE';
    this.manifest = null;
    assert.ok(this.start < this.end, `${name} 的时间边界无效`);
  }

  contains(instant) {
    const value = parseInstant(instant);
    return this.start <= value && value < this.end;
  }

  overlaps(start, end) {
    return this.start < parseInstant(end) && parseInstant(start) < this.end;
  }
}

class PartitionCatalog {
  constructor(partitions) {
    this.partitions = [...partitions].sort((left, right) => left.start - right.start);
    for (let index = 1; index < this.partitions.length; index += 1) {
      assert.ok(
        this.partitions[index - 1].end <= this.partitions[index].start,
        '分区范围不能重叠',
      );
    }
  }

  route(occurredAt) {
    const target = this.partitions.find((partition) => partition.contains(occurredAt));
    if (!target) {
      throw new Error(`没有覆盖 ${occurredAt} 的可写分区`);
    }
    if (target.state !== 'ACTIVE') {
      throw new Error(`${target.name} 已封存，不能继续写入`);
    }
    return target;
  }

  prune({ start, end }) {
    assert.ok(parseInstant(start) < parseInstant(end), '查询必须是非空半开区间');
    return this.partitions.filter((partition) => partition.overlaps(start, end));
  }
}

function canonicalRows(rows) {
  return [...rows]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(({ id, occurredAt, tenantId }) => `${id}|${occurredAt}|${tenantId}`)
    .join('\n');
}

function exportPartition(partition) {
  assert.equal(partition.state, 'SEALED');
  const content = canonicalRows(partition.rows);
  partition.manifest = {
    partition: partition.name,
    start: new Date(partition.start).toISOString(),
    end: new Date(partition.end).toISOString(),
    rowCount: partition.rows.length,
    sha256: createHash('sha256').update(content).digest('hex'),
  };
  partition.state = 'EXPORTED';
  return { content, manifest: partition.manifest };
}

function verifyArchive(partition, exportedContent, restoredRows) {
  assert.equal(partition.state, 'EXPORTED');
  assert.equal(restoredRows.length, partition.manifest.rowCount, '恢复行数不一致');
  const exportedHash = createHash('sha256').update(exportedContent).digest('hex');
  const restoredHash = createHash('sha256')
    .update(canonicalRows(restoredRows))
    .digest('hex');
  assert.equal(exportedHash, partition.manifest.sha256, '导出对象摘要不一致');
  assert.equal(restoredHash, partition.manifest.sha256, '恢复内容摘要不一致');
  partition.state = 'VERIFIED';
}

function detach(partition) {
  assert.equal(partition.state, 'VERIFIED', '未验证归档不得脱离在线查询路径');
  partition.state = 'DETACHED';
}

function markPurgeEligible(partition, { retentionEnded, legalHold }) {
  assert.equal(partition.state, 'DETACHED');
  assert.equal(retentionEnded, true, '保留期尚未结束');
  assert.equal(legalHold, false, '存在法务冻结');
  partition.state = 'PURGE_ELIGIBLE';
}

function run() {
  const januaryRows = [
    { id: 'e-2', tenantId: 42, occurredAt: '2026-01-31T23:59:59.999Z' },
    { id: 'e-1', tenantId: 42, occurredAt: '2026-01-01T00:00:00.000Z' },
  ];
  const january = new TimePartition({
    name: 'events_2026_01',
    start: '2026-01-01T00:00:00Z',
    end: '2026-02-01T00:00:00Z',
    rows: januaryRows,
  });
  const february = new TimePartition({
    name: 'events_2026_02',
    start: '2026-02-01T00:00:00Z',
    end: '2026-03-01T00:00:00Z',
  });
  const catalog = new PartitionCatalog([february, january]);

  assert.equal(catalog.route('2026-01-31T23:59:59.999Z').name, january.name);
  assert.equal(catalog.route('2026-02-01T00:00:00.000Z').name, february.name);
  console.log('✓ 半开区间在月初边界无重叠地路由到新分区');

  assert.deepEqual(
    catalog.prune({
      start: '2026-02-10T00:00:00Z',
      end: '2026-02-11T00:00:00Z',
    }).map((partition) => partition.name),
    ['events_2026_02'],
  );
  console.log('✓ 查询范围只选择与之相交的分区');

  assert.throws(
    () => catalog.route('2026-03-01T00:00:00Z'),
    /没有覆盖/,
  );
  console.log('✓ 未提前创建未来分区时明确失败，不静默写入错误位置');

  january.state = 'SEALED';
  assert.throws(() => detach(january), /未验证归档/);
  const { content, manifest } = exportPartition(january);
  assert.equal(manifest.rowCount, 2);
  verifyArchive(january, content, [...januaryRows].reverse());
  detach(january);

  assert.throws(
    () => markPurgeEligible(january, { retentionEnded: false, legalHold: false }),
    /保留期尚未结束/,
  );
  markPurgeEligible(january, { retentionEnded: true, legalHold: false });
  assert.equal(january.state, 'PURGE_ELIGIBLE');
  console.log('✓ 只有内容恢复校验通过且保留期结束后，分区才进入清理候选状态');

  console.log('全部分区路由、裁剪与归档生命周期断言通过。');
}

run();
