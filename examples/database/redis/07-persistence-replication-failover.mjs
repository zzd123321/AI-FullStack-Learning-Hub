import assert from 'node:assert/strict';

class PersistenceTimeline {
  #writes = [];
  #rdbOffset = 0;
  #aofFsyncedOffset = 0;

  write(command) {
    const offset = this.#writes.length + 1;
    this.#writes.push({ offset, command });
    return offset;
  }

  snapshot() {
    this.#rdbOffset = this.#writes.length;
  }

  fsyncAofThrough(offset = this.#writes.length) {
    assert.ok(offset <= this.#writes.length);
    this.#aofFsyncedOffset = offset;
  }

  recoverFromRdb() {
    return this.#writes.slice(0, this.#rdbOffset);
  }

  recoverFromAof() {
    return this.#writes.slice(0, this.#aofFsyncedOffset);
  }
}

function verifyRdbAndAofRecoveryPoints() {
  const timeline = new PersistenceTimeline();
  timeline.write('SET session:1 active');
  timeline.write('SET session:2 active');
  timeline.snapshot();

  timeline.write('SET session:3 active');
  timeline.fsyncAofThrough(3);
  timeline.write('SET session:4 active');

  assert.deepEqual(
    timeline.recoverFromRdb().map((write) => write.offset),
    [1, 2],
  );
  assert.deepEqual(
    timeline.recoverFromAof().map((write) => write.offset),
    [1, 2, 3],
  );
  console.log('✓ RDB 恢复到快照 offset，AOF 恢复到已 fsync offset');
}

class ReplicationTimeline {
  #replicationId;
  #writes = [];
  #replicaOffsets = new Map();

  constructor(replicationId, replicaNames) {
    this.#replicationId = replicationId;
    for (const name of replicaNames) this.#replicaOffsets.set(name, 0);
  }

  write(command) {
    const offset = this.#writes.length + 1;
    this.#writes.push({ offset, command });
    return offset;
  }

  replicateThrough(replicaName, offset) {
    assert.ok(this.#replicaOffsets.has(replicaName));
    assert.ok(offset <= this.#writes.length);
    this.#replicaOffsets.set(replicaName, offset);
  }

  acknowledgementsAtLeast(offset) {
    return [...this.#replicaOffsets.values()].filter(
      (replicaOffset) => replicaOffset >= offset,
    ).length;
  }

  promote(replicaName) {
    const replicaOffset = this.#replicaOffsets.get(replicaName);
    assert.notEqual(replicaOffset, undefined);
    return this.#writes.slice(0, replicaOffset);
  }

  canPartiallyResynchronize({
    replicaReplicationId,
    replicaOffset,
    backlogStartOffset,
  }) {
    return (
      replicaReplicationId === this.#replicationId &&
      replicaOffset >= backlogStartOffset - 1 &&
      replicaOffset <= this.#writes.length
    );
  }
}

function verifyAsynchronousReplicationAndWaitResult() {
  const replication = new ReplicationTimeline('history-A', [
    'replica-A',
    'replica-B',
  ]);

  replication.write('SET order:1 created');
  replication.replicateThrough('replica-A', 1);
  replication.replicateThrough('replica-B', 1);

  const importantOffset = replication.write('SET order:2 paid');
  replication.replicateThrough('replica-A', importantOffset);

  assert.equal(replication.acknowledgementsAtLeast(importantOffset), 1);
  assert.equal(
    replication.acknowledgementsAtLeast(importantOffset) >= 2,
    false,
    '等待两个副本时必须检查实际返回数量',
  );

  const promotedData = replication.promote('replica-B');
  assert.deepEqual(
    promotedData.map((write) => write.command),
    ['SET order:1 created'],
    '提升未收到第二条写的副本会丢失 primary 已接受的写',
  );

  console.log('✓ 异步复制下未到达候选副本的写会丢失，WAIT 需检查数量');
}

function verifyPartialResynchronizationBoundary() {
  const replication = new ReplicationTimeline('history-A', ['replica-A']);
  for (let number = 1; number <= 10; number += 1) {
    replication.write(`SET key:${number} value`);
  }

  assert.equal(
    replication.canPartiallyResynchronize({
      replicaReplicationId: 'history-A',
      replicaOffset: 7,
      backlogStartOffset: 6,
    }),
    true,
  );
  assert.equal(
    replication.canPartiallyResynchronize({
      replicaReplicationId: 'history-A',
      replicaOffset: 3,
      backlogStartOffset: 6,
    }),
    false,
    '缺失区间已不在 backlog，需要全量同步',
  );
  assert.equal(
    replication.canPartiallyResynchronize({
      replicaReplicationId: 'history-B',
      replicaOffset: 7,
      backlogStartOffset: 6,
    }),
    false,
    '复制历史不匹配，不能只按 offset 部分同步',
  );

  console.log('✓ replication ID 匹配且 backlog 覆盖时才能部分重同步');
}

class SentinelDecisionModel {
  #sentinelNames;
  #quorum;

  constructor(sentinelNames, quorum) {
    this.#sentinelNames = new Set(sentinelNames);
    this.#quorum = quorum;
  }

  evaluate({ subjectivelyDown, reachable }) {
    const validDownReports = new Set(
      subjectivelyDown.filter((name) => this.#sentinelNames.has(name)),
    ).size;
    const reachableSentinels = new Set(
      reachable.filter((name) => this.#sentinelNames.has(name)),
    ).size;
    const majority = Math.floor(this.#sentinelNames.size / 2) + 1;

    const objectivelyDown = validDownReports >= this.#quorum;
    return {
      objectivelyDown,
      majority,
      failoverAuthorized:
        objectivelyDown && reachableSentinels >= majority,
    };
  }
}

function verifySentinelQuorumAndMajorityAreDifferent() {
  const sentinel = new SentinelDecisionModel(['S1', 'S2', 'S3'], 2);

  const minorityPartition = sentinel.evaluate({
    subjectivelyDown: ['S1', 'S2'],
    reachable: ['S1'],
  });
  assert.equal(minorityPartition.objectivelyDown, true);
  assert.equal(minorityPartition.majority, 2);
  assert.equal(minorityPartition.failoverAuthorized, false);

  const majorityPartition = sentinel.evaluate({
    subjectivelyDown: ['S1', 'S2'],
    reachable: ['S1', 'S2'],
  });
  assert.equal(majorityPartition.objectivelyDown, true);
  assert.equal(majorityPartition.failoverAuthorized, true);

  console.log('✓ quorum 达到 ODOWN 后，仍需 Sentinel 多数授权 failover');
}

verifyRdbAndAofRecoveryPoints();
verifyAsynchronousReplicationAndWaitResult();
verifyPartialResynchronizationBoundary();
verifySentinelQuorumAndMajorityAreDifferent();

console.log('全部 Redis 持久化、复制与故障转移状态模型断言通过。');
