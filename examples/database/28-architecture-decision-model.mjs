import assert from 'node:assert/strict';

const workload = Object.freeze({
  name: 'order-system-of-record',
  hardRequirements: {
    relationalConstraints: true,
    crossTableRelationalTransaction: true,
    pointInTimeRecovery: true,
    approvedRegion: true,
    officialNodeDriver: true,
  },
  // 权重属于这个场景，不是数据库产品的永久排名。
  weights: {
    measuredP99: 4,
    operationalReadiness: 5,
    migrationEffort: 3,
    threeYearCost: 2,
  },
});

const candidates = [
  {
    name: 'managed-mysql-8.4-plan-a',
    capabilities: {
      relationalConstraints: true,
      crossTableRelationalTransaction: true,
      pointInTimeRecovery: true,
      approvedRegion: true,
      officialNodeDriver: true,
    },
    evidenceScores: { measuredP99: 4, operationalReadiness: 5, migrationEffort: 5, threeYearCost: 4 },
  },
  {
    name: 'managed-postgresql-18-plan-b',
    capabilities: {
      relationalConstraints: true,
      crossTableRelationalTransaction: true,
      pointInTimeRecovery: true,
      approvedRegion: true,
      officialNodeDriver: true,
    },
    evidenceScores: { measuredP99: 5, operationalReadiness: 2, migrationEffort: 2, threeYearCost: 4 },
  },
  {
    name: 'redis-plan-c',
    capabilities: {
      relationalConstraints: false,
      crossTableRelationalTransaction: false,
      pointInTimeRecovery: false,
      approvedRegion: true,
      officialNodeDriver: true,
    },
    evidenceScores: { measuredP99: 5, operationalReadiness: 3, migrationEffort: 1, threeYearCost: 3 },
  },
];

function evaluateCandidate(candidate, profile) {
  const failedHardRequirements = Object.entries(profile.hardRequirements)
    .filter(([requirement, expected]) => candidate.capabilities[requirement] !== expected)
    .map(([requirement]) => requirement);

  if (failedHardRequirements.length > 0) {
    return { name: candidate.name, eligible: false, failedHardRequirements, weightedScore: null };
  }

  const weightedScore = Object.entries(profile.weights).reduce(
    (total, [criterion, weight]) => total + candidate.evidenceScores[criterion] * weight,
    0,
  );
  return { name: candidate.name, eligible: true, failedHardRequirements, weightedScore };
}

function choose(candidatesToEvaluate, profile) {
  const evaluations = candidatesToEvaluate.map((candidate) => evaluateCandidate(candidate, profile));
  const eligible = evaluations.filter((result) => result.eligible);
  assert.ok(eligible.length > 0, '没有候选满足全部硬约束，应修改方案而不是降低正确性要求');
  eligible.sort((a, b) => b.weightedScore - a.weightedScore);
  return { selected: eligible[0], evaluations };
}

function approveCache({ measuredDatabaseP95Ms, endpointSloMs, cacheableReadRatio, hasFallback, hasStampedeProtection }) {
  assert.ok(measuredDatabaseP95Ms > endpointSloMs, '尚无已测量的延迟缺口');
  assert.ok(cacheableReadRatio >= 0.6, '工作负载缺少足够的可缓存热点');
  assert.equal(hasFallback, true, '缓存故障时没有受控回源/降级路径');
  assert.equal(hasStampedeProtection, true, '缓存失效可能造成回源风暴');
  return 'APPROVED_FOR_CANARY';
}

function approveSharding({ optimized, archived, verticalLimitQps, forecastPeakQps, safetyFactor, stableRoutingKey }) {
  assert.equal(optimized, true, '尚未完成 SQL、索引和连接治理');
  assert.equal(archived, true, '尚未处理可归档历史数据');
  assert.ok(forecastPeakQps * safetyFactor > verticalLimitQps, '预测峰值尚未超过带安全余量的单节点实测边界');
  assert.equal(stableRoutingKey, true, '缺少稳定路由键，分片会制造大量跨分片操作');
  return 'APPROVED_FOR_DETAILED_DESIGN';
}

const decision = choose(candidates, workload);
const redisEvaluation = decision.evaluations.find((result) => result.name === 'redis-plan-c');
assert.equal(redisEvaluation.eligible, false);
assert.deepEqual(redisEvaluation.failedHardRequirements.sort(), [
  'crossTableRelationalTransaction',
  'pointInTimeRecovery',
  'relationalConstraints',
]);
assert.equal(decision.selected.name, 'managed-mysql-8.4-plan-a');
console.log('✓ 硬约束先淘汰不合格候选，软指标只比较通过者');
console.log('✓ 当前场景因团队与迁移证据选择 MySQL；结果不构成产品永久排名');

assert.throws(
  () => approveCache({
    measuredDatabaseP95Ms: 70,
    endpointSloMs: 120,
    cacheableReadRatio: 0.9,
    hasFallback: true,
    hasStampedeProtection: true,
  }),
  /尚无已测量的延迟缺口/,
);
assert.equal(approveCache({
  measuredDatabaseP95Ms: 180,
  endpointSloMs: 120,
  cacheableReadRatio: 0.82,
  hasFallback: true,
  hasStampedeProtection: true,
}), 'APPROVED_FOR_CANARY');
console.log('✓ Redis 缓存只有在存在实测缺口、可缓存热点和降级保护时才进入 canary');

assert.throws(
  () => approveSharding({
    optimized: true,
    archived: true,
    verticalLimitQps: 12000,
    forecastPeakQps: 5000,
    safetyFactor: 1.5,
    stableRoutingKey: true,
  }),
  /尚未超过/,
);
assert.equal(approveSharding({
  optimized: true,
  archived: true,
  verticalLimitQps: 12000,
  forecastPeakQps: 10000,
  safetyFactor: 1.5,
  stableRoutingKey: true,
}), 'APPROVED_FOR_DETAILED_DESIGN');
console.log('✓ 分片需要优化完成、容量证据和稳定路由键，不能只凭“未来会增长”');

console.log('全部选型硬门槛、新组件引入和架构演进断言通过。');
