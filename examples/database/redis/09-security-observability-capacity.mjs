import assert from 'node:assert/strict';

class AclUserModel {
  #commands;
  #readPrefixes;
  #writePrefixes;
  #channelPrefixes;

  constructor({ commands, readPrefixes, writePrefixes, channelPrefixes }) {
    this.#commands = new Set(commands.map((command) => command.toUpperCase()));
    this.#readPrefixes = readPrefixes;
    this.#writePrefixes = writePrefixes;
    this.#channelPrefixes = channelPrefixes;
  }

  authorize({ command, keys = [], channels = [] }) {
    if (!this.#commands.has(command.toUpperCase())) {
      return { allowed: false, reason: 'command' };
    }

    for (const { key, mode } of keys) {
      const prefixes = mode === 'read' ? this.#readPrefixes : this.#writePrefixes;
      if (!prefixes.some((prefix) => key.startsWith(prefix))) {
        return { allowed: false, reason: 'key' };
      }
    }

    for (const channel of channels) {
      if (!this.#channelPrefixes.some((prefix) => channel.startsWith(prefix))) {
        return { allowed: false, reason: 'channel' };
      }
    }
    return { allowed: true };
  }
}

function verifyAclRequiresAllDimensions() {
  const user = new AclUserModel({
    commands: ['GET', 'SET', 'PUBLISH'],
    readPrefixes: ['learning:order:'],
    writePrefixes: ['learning:order:'],
    channelPrefixes: ['learning:events:order:'],
  });

  assert.deepEqual(
    user.authorize({
      command: 'GET',
      keys: [{ key: 'learning:order:1001', mode: 'read' }],
    }),
    { allowed: true },
  );
  assert.deepEqual(user.authorize({ command: 'CONFIG' }), {
    allowed: false,
    reason: 'command',
  });
  assert.deepEqual(
    user.authorize({
      command: 'SET',
      keys: [{ key: 'learning:session:secret', mode: 'write' }],
    }),
    { allowed: false, reason: 'key' },
  );
  assert.deepEqual(
    user.authorize({
      command: 'PUBLISH',
      channels: ['learning:events:payment:succeeded'],
    }),
    { allowed: false, reason: 'channel' },
  );
  console.log('✓ ACL 模型同时校验命令、key 读写范围和 Pub/Sub channel');
}

function counterRate(previous, current, elapsedSeconds) {
  assert.ok(elapsedSeconds > 0);
  if (current < previous) return { kind: 'reset', rate: null };
  return { kind: 'rate', rate: (current - previous) / elapsedSeconds };
}

function verifyCounterRatesAndRestartReset() {
  assert.deepEqual(counterRate(10_000, 11_000, 10), {
    kind: 'rate',
    rate: 100,
  });
  assert.deepEqual(counterRate(11_000, 200, 10), {
    kind: 'reset',
    rate: null,
  });
  console.log('✓ 累计 counter 按真实间隔转 rate，并识别进程重启归零');
}

function windowHitRate(previous, current) {
  const hits = current.hits - previous.hits;
  const misses = current.misses - previous.misses;
  assert.ok(hits >= 0 && misses >= 0, 'counter reset 需先建立新基线');
  const total = hits + misses;
  return total === 0 ? null : hits / total;
}

function verifyWindowHitRate() {
  const previous = { hits: 9_000, misses: 1_000 };
  const current = { hits: 9_100, misses: 1_100 };
  assert.equal(windowHitRate(previous, current), 0.5);

  const lifetimeRate = current.hits / (current.hits + current.misses);
  assert.ok(lifetimeRate > 0.89, '生命周期累计比率会掩盖当前窗口骤降');
  console.log('✓ 窗口命中率检测到 50%，而生命周期累计值仍接近 90%');
}

function ceilDivide(numerator, denominator) {
  return Math.ceil(numerator / denominator);
}

function planPrimaryShards({
  peakOpsPerSecond,
  testedOpsPerSecondPerShard,
  targetUtilization,
  futureDatasetBytes,
  safeDatasetBytesPerShard,
  peakNetworkBytesPerSecond,
  safeNetworkBytesPerSecondPerShard,
}) {
  const safeOpsPerShard = testedOpsPerSecondPerShard * targetUtilization;
  const byThroughput = ceilDivide(peakOpsPerSecond, safeOpsPerShard);
  const byMemory = ceilDivide(futureDatasetBytes, safeDatasetBytesPerShard);
  const byNetwork = ceilDivide(
    peakNetworkBytesPerSecond,
    safeNetworkBytesPerSecondPerShard,
  );
  return {
    byThroughput,
    byMemory,
    byNetwork,
    minimumPrimaryShards: Math.max(byThroughput, byMemory, byNetwork),
  };
}

function verifyCapacityUsesTightestResource() {
  const gibibyte = 1024 ** 3;
  const mebibyte = 1024 ** 2;
  const plan = planPrimaryShards({
    peakOpsPerSecond: 200_000,
    testedOpsPerSecondPerShard: 120_000,
    targetUtilization: 0.6,
    futureDatasetBytes: 24 * gibibyte,
    safeDatasetBytesPerShard: 10 * gibibyte,
    peakNetworkBytesPerSecond: 900 * mebibyte,
    safeNetworkBytesPerSecondPerShard: 300 * mebibyte,
  });

  assert.deepEqual(plan, {
    byThroughput: 3,
    byMemory: 3,
    byNetwork: 3,
    minimumPrimaryShards: 3,
  });

  const networkHeavy = planPrimaryShards({
    peakOpsPerSecond: 100_000,
    testedOpsPerSecondPerShard: 120_000,
    targetUtilization: 0.6,
    futureDatasetBytes: 8 * gibibyte,
    safeDatasetBytesPerShard: 10 * gibibyte,
    peakNetworkBytesPerSecond: 1_200 * mebibyte,
    safeNetworkBytesPerSecondPerShard: 300 * mebibyte,
  });
  assert.equal(networkHeavy.byThroughput, 2);
  assert.equal(networkHeavy.byMemory, 1);
  assert.equal(networkHeavy.byNetwork, 4);
  assert.equal(networkHeavy.minimumPrimaryShards, 4);
  console.log('✓ 分片数分别按吞吐、内存、网络计算，并取最紧约束');
}

function evaluateCacheIncident({
  evictionRate,
  windowHitRate,
  databasePoolUtilization,
  fallbackRate,
}) {
  const cachePressure = evictionRate > 0 && windowHitRate < 0.8;
  const downstreamAtRisk =
    databasePoolUtilization >= 0.8 && fallbackRate > 0;
  if (cachePressure && downstreamAtRisk) {
    return { severity: 'critical', reason: 'cache-avalanche-risk' };
  }
  if (cachePressure) return { severity: 'warning', reason: 'cache-pressure' };
  return { severity: 'ok', reason: 'healthy' };
}

function verifyCompositeAlert() {
  assert.deepEqual(
    evaluateCacheIncident({
      evictionRate: 500,
      windowHitRate: 0.6,
      databasePoolUtilization: 0.92,
      fallbackRate: 8_000,
    }),
    { severity: 'critical', reason: 'cache-avalanche-risk' },
  );
  assert.deepEqual(
    evaluateCacheIncident({
      evictionRate: 0,
      windowHitRate: 0.99,
      databasePoolUtilization: 0.92,
      fallbackRate: 0,
    }),
    { severity: 'ok', reason: 'healthy' },
  );
  console.log('✓ 组合告警关联 eviction、命中率、fallback 与数据库饱和');
}

verifyAclRequiresAllDimensions();
verifyCounterRatesAndRestartReset();
verifyWindowHitRate();
verifyCapacityUsesTightestResource();
verifyCompositeAlert();

console.log('全部 Redis 安全、可观测性与容量状态模型断言通过。');
