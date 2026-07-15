import assert from 'node:assert/strict';

function inFlightConcurrency({ arrivalPerSecond, meanLatencyMs }) {
  assert.ok(arrivalPerSecond >= 0 && meanLatencyMs >= 0);
  return arrivalPerSecond * (meanLatencyMs / 1000);
}

function mixedDemand(transactions) {
  return transactions.reduce((total, transaction) => ({
    cpuMsPerSecond: total.cpuMsPerSecond
      + transaction.tps * transaction.cpuMsPerTransaction,
    walBytesPerSecond: total.walBytesPerSecond
      + transaction.tps * transaction.walBytesPerTransaction,
  }), { cpuMsPerSecond: 0, walBytesPerSecond: 0 });
}

function safeCpuThroughput({ cores, targetUtilization, cpuMsPerTransaction }) {
  assert.ok(cores > 0);
  assert.ok(targetUtilization > 0 && targetUtilization < 1);
  assert.ok(cpuMsPerTransaction > 0);
  return (cores * 1000 * targetUtilization) / cpuMsPerTransaction;
}

function nPlusOneUtilization({ normalUtilization, nodeCount }) {
  assert.ok(nodeCount > 1);
  return normalUtilization * nodeCount / (nodeCount - 1);
}

function storageRunwayDays({ freeBytes, reservedBytes, dailyGrowthBytes }) {
  assert.ok(freeBytes >= reservedBytes);
  assert.ok(dailyGrowthBytes > 0);
  return (freeBytes - reservedBytes) / dailyGrowthBytes;
}

function run() {
  const concurrency = inFlightConcurrency({
    arrivalPerSecond: 2000,
    meanLatencyMs: 20,
  });
  assert.equal(concurrency, 40);
  console.log('✓ 2000 req/s × 20 ms 平均停留时间对应 40 个平均在途请求');

  const demand = mixedDemand([
    {
      name: 'create-order',
      tps: 400,
      cpuMsPerTransaction: 4,
      walBytesPerTransaction: 5000,
    },
    {
      name: 'read-order',
      tps: 2400,
      cpuMsPerTransaction: 0.8,
      walBytesPerTransaction: 0,
    },
  ]);
  assert.equal(demand.cpuMsPerSecond, 3520);
  assert.equal(demand.walBytesPerSecond, 2_000_000);
  console.log('✓ 混合 workload 转换为 3520 CPU-ms/s 与 2 MB/s WAL 需求');

  const safeTps = safeCpuThroughput({
    cores: 8,
    targetUtilization: 0.6,
    cpuMsPerTransaction: 4,
  });
  assert.equal(safeTps, 1200);
  assert.equal(nPlusOneUtilization({ normalUtilization: 0.55, nodeCount: 2 }), 1.1);
  console.log('✓ 目标利用率限制安全吞吐；双节点各 55% 在失去一台后会理论过载');

  const gib = 1024 ** 3;
  const runway = storageRunwayDays({
    freeBytes: 500 * gib,
    reservedBytes: 100 * gib,
    dailyGrowthBytes: 10 * gib,
  });
  assert.equal(runway, 40);
  const expansionLeadTimeDays = 30;
  const safetyBufferDays = 14;
  assert.equal(runway < expansionLeadTimeDays + safetyBufferDays, true);
  console.log('✓ 40 天存储 runway 小于 30 天 lead time + 14 天缓冲，应立即进入扩容流程');

  console.log('全部并发、混合资源需求、N+1 与存储 runway 断言通过。');
}

run();
