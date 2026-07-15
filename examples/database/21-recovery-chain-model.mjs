import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

function checksum(payload) {
  return createHash('sha256').update(payload).digest('hex');
}

function createSegment({ sequence, timeline, committedAt, events }) {
  const payload = JSON.stringify({ sequence, timeline, committedAt, events });
  return {
    sequence,
    timeline,
    committedAt: Date.parse(committedAt),
    events,
    payload,
    sha256: checksum(payload),
  };
}

function validateRecoveryChain({ baseBackup, segments }) {
  assert.equal(baseBackup.status, 'VERIFIED', 'base backup 尚未通过恢复验证');

  let expected = baseBackup.endSequence + 1;
  for (const segment of segments) {
    assert.equal(segment.systemId, baseBackup.systemId, '日志属于错误数据库集群');
    assert.equal(segment.sequence, expected, `日志链缺少序号 ${expected}`);
    assert.equal(segment.timeline, baseBackup.timeline, '日志属于错误 timeline');
    assert.equal(checksum(segment.payload), segment.sha256, `日志 ${segment.sequence} 校验失败`);
    expected += 1;
  }
  return { firstSequence: baseBackup.endSequence + 1, lastSequence: expected - 1 };
}

function planPointInTimeRecovery({ baseBackup, segments, stopBeforeEventId }) {
  validateRecoveryChain({ baseBackup, segments });
  const target = segments.find((segment) =>
    segment.events.some((event) => event.id === stopBeforeEventId));
  assert.ok(target, `没有找到事件 ${stopBeforeEventId}`);

  const eventIndex = target.events.findIndex((event) => event.id === stopBeforeEventId);
  assert.ok(eventIndex >= 0);
  return {
    backupId: baseBackup.id,
    timeline: baseBackup.timeline,
    replayThroughSequence: target.sequence,
    replayEventsInFinalSegment: target.events.slice(0, eventIndex).map((event) => event.id),
    excludedEvent: stopBeforeEventId,
  };
}

function rpoExposureMs({ databaseNow, lastVerifiedArchiveAt }) {
  const exposure = Date.parse(databaseNow) - Date.parse(lastVerifiedArchiveAt);
  assert.ok(exposure >= 0);
  return exposure;
}

function estimatedRtoMs(phases) {
  return Object.values(phases).reduce((total, duration) => {
    assert.ok(Number.isFinite(duration) && duration >= 0);
    return total + duration;
  }, 0);
}

function run() {
  const baseBackup = {
    id: 'base-2026-07-15T00:00Z',
    systemId: 'cluster-prod-01',
    timeline: 4,
    endSequence: 100,
    status: 'VERIFIED',
  };
  const rawSegments = [
    createSegment({
      sequence: 101,
      timeline: 4,
      committedAt: '2026-07-15T00:01:00Z',
      events: [{ id: 'tx-101-a', type: 'order.created' }],
    }),
    createSegment({
      sequence: 102,
      timeline: 4,
      committedAt: '2026-07-15T00:02:00Z',
      events: [
        { id: 'tx-102-a', type: 'payment.recorded' },
        { id: 'tx-102-b', type: 'accidental.bulk-update' },
      ],
    }),
    createSegment({
      sequence: 103,
      timeline: 4,
      committedAt: '2026-07-15T00:03:00Z',
      events: [{ id: 'tx-103-a', type: 'order.created' }],
    }),
  ].map((segment) => ({ ...segment, systemId: 'cluster-prod-01' }));

  const range = validateRecoveryChain({ baseBackup, segments: rawSegments });
  assert.deepEqual(range, { firstSequence: 101, lastSequence: 103 });
  console.log('✓ 已验证 base backup 与连续、同 timeline、校验正确的日志组成恢复链');

  assert.throws(
    () => validateRecoveryChain({
      baseBackup,
      segments: [rawSegments[0], rawSegments[2]],
    }),
    /缺少序号 102/,
  );
  const corrupted = { ...rawSegments[1], payload: `${rawSegments[1].payload}corrupted` };
  assert.throws(
    () => validateRecoveryChain({
      baseBackup,
      segments: [rawSegments[0], corrupted, rawSegments[2]],
    }),
    /校验失败/,
  );
  assert.throws(
    () => validateRecoveryChain({
      baseBackup,
      segments: [rawSegments[0], { ...rawSegments[1], systemId: 'cluster-other' }],
    }),
    /错误数据库集群/,
  );
  console.log('✓ 日志缺口、内容损坏或集群身份错误时 fail closed');

  const plan = planPointInTimeRecovery({
    baseBackup,
    segments: rawSegments,
    stopBeforeEventId: 'tx-102-b',
  });
  assert.deepEqual(plan.replayEventsInFinalSegment, ['tx-102-a']);
  assert.equal(plan.excludedEvent, 'tx-102-b');
  console.log('✓ 恢复计划精确停在错误事务前，同时保留同一日志段内更早的正确事务');

  const exposure = rpoExposureMs({
    databaseNow: '2026-07-15T00:10:00Z',
    lastVerifiedArchiveAt: '2026-07-15T00:07:30Z',
  });
  assert.equal(exposure, 150_000);

  const rto = estimatedRtoMs({
    detection: 5 * 60_000,
    infrastructure: 8 * 60_000,
    baseRestore: 22 * 60_000,
    logReplay: 7 * 60_000,
    validation: 9 * 60_000,
    trafficCutover: 4 * 60_000,
  });
  assert.equal(rto, 55 * 60_000);
  console.log('✓ 实际 RPO 由最后验证归档水位决定，RTO 包含检测到切流的全部阶段');

  console.log('全部恢复链、PITR 目标与 RPO/RTO 模型断言通过。');
}

run();
