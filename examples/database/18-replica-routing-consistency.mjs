import assert from 'node:assert/strict';

class NodeState {
  constructor({ id, role, position, lagMs, healthy = true, writeEpoch = null }) {
    this.id = id;
    this.role = role;
    this.position = position;
    this.lagMs = lagMs;
    this.healthy = healthy;
    this.writeEpoch = writeEpoch;
  }

  canServeReplicaRead({ maxLagMs, minimumPosition }) {
    return this.healthy
      && this.role === 'replica'
      && this.lagMs <= maxLagMs
      && this.position >= minimumPosition;
  }

  acceptWrite({ routerEpoch }) {
    return this.healthy
      && this.role === 'primary'
      && this.writeEpoch === routerEpoch;
  }
}

function routeRead({ primary, replicas, maxLagMs, minimumPosition = 0 }) {
  const eligible = replicas
    .filter((replica) => replica.canServeReplicaRead({ maxLagMs, minimumPosition }))
    .sort((left, right) => left.lagMs - right.lagMs || left.id.localeCompare(right.id));

  if (eligible.length > 0) {
    return { node: eligible[0], fallback: false };
  }

  if (primary.healthy && primary.position >= minimumPosition) {
    return { node: primary, fallback: true };
  }

  return { node: null, fallback: false };
}

function observedVersions(nodesInReadOrder) {
  return nodesInReadOrder.map((node) => node.position);
}

function isMonotonic(values) {
  return values.every((value, index) => index === 0 || value >= values[index - 1]);
}

function run() {
  const primary = new NodeState({
    id: 'primary-a',
    role: 'primary',
    position: 120,
    lagMs: 0,
    writeEpoch: 7,
  });
  const replicaFast = new NodeState({
    id: 'replica-fast',
    role: 'replica',
    position: 118,
    lagMs: 80,
  });
  const replicaSlow = new NodeState({
    id: 'replica-slow',
    role: 'replica',
    position: 100,
    lagMs: 12_000,
  });
  const replicaStopped = new NodeState({
    id: 'replica-stopped',
    role: 'replica',
    position: 119,
    lagMs: 20,
    healthy: false,
  });

  const staleOk = routeRead({
    primary,
    replicas: [replicaSlow, replicaStopped, replicaFast],
    maxLagMs: 1_000,
  });
  assert.equal(staleOk.node.id, 'replica-fast');
  assert.equal(staleOk.fallback, false);
  console.log('✓ 只有健康且 lag 满足接口预算的副本进入读取候选');

  const writePosition = 120;
  const readYourWrites = routeRead({
    primary,
    replicas: [replicaFast, replicaSlow],
    maxLagMs: 20_000,
    minimumPosition: writePosition,
  });
  assert.equal(readYourWrites.node.id, 'primary-a');
  assert.equal(readYourWrites.fallback, true);

  replicaFast.position = 120;
  const replicaCaughtUp = routeRead({
    primary,
    replicas: [replicaFast, replicaSlow],
    maxLagMs: 1_000,
    minimumPosition: writePosition,
  });
  assert.equal(replicaCaughtUp.node.id, 'replica-fast');
  assert.equal(replicaCaughtUp.fallback, false);
  console.log('✓ minimum position token 未满足时回 primary，副本追上后才读取副本');

  const randomReplicaSequence = observedVersions([
    new NodeState({ id: 'a', role: 'replica', position: 15, lagMs: 10 }),
    new NodeState({ id: 'b', role: 'replica', position: 12, lagMs: 20 }),
  ]);
  assert.deepEqual(randomReplicaSequence, [15, 12]);
  assert.equal(isMonotonic(randomReplicaSequence), false);

  const tokenAwareSequence = [15];
  const tokenAwareRead = routeRead({
    primary: new NodeState({
      id: 'p',
      role: 'primary',
      position: 16,
      lagMs: 0,
      writeEpoch: 1,
    }),
    replicas: [
      new NodeState({ id: 'b', role: 'replica', position: 12, lagMs: 20 }),
    ],
    maxLagMs: 100,
    minimumPosition: 15,
  });
  tokenAwareSequence.push(tokenAwareRead.node.position);
  assert.equal(isMonotonic(tokenAwareSequence), true);
  console.log('✓ 随机副本会让版本倒退，minimum token + primary fallback 保持单调读');

  const oldPrimary = new NodeState({
    id: 'old-primary',
    role: 'primary',
    position: 120,
    lagMs: 0,
    writeEpoch: 6,
  });
  const newPrimary = new NodeState({
    id: 'new-primary',
    role: 'primary',
    position: 120,
    lagMs: 0,
    writeEpoch: 7,
  });
  assert.equal(oldPrimary.acceptWrite({ routerEpoch: 7 }), false);
  assert.equal(newPrimary.acceptWrite({ routerEpoch: 7 }), true);
  console.log('✓ failover epoch fencing 拒绝旧 primary，只有新 epoch 节点接受写入');

  console.log('全部读写路由、复制位置与故障 fencing 状态模型断言通过。');
}

run();
