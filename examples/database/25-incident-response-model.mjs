import assert from 'node:assert/strict';

class Incident {
  constructor(id) {
    this.id = id;
    this.phase = 'DETECTED';
    this.evidenceSaved = false;
    this.oldPrimaryFenced = false;
    this.temporaryMeasures = new Set();
    this.businessValidated = false;
  }

  declare() {
    assert.equal(this.phase, 'DETECTED');
    this.phase = 'DECLARED';
  }

  saveEvidence() {
    assert.equal(this.phase, 'DECLARED');
    this.evidenceSaved = true;
  }

  contain(measure) {
    assert.equal(this.evidenceSaved, true, '高风险处置前必须保存易失证据');
    this.temporaryMeasures.add(measure);
    this.phase = 'CONTAINED';
  }

  failover({ candidateHealthy, rpoSatisfied, fenceOldPrimary }) {
    assert.equal(this.phase, 'CONTAINED');
    assert.equal(candidateHealthy, true, '候选节点不健康');
    assert.equal(rpoSatisfied, true, '候选恢复点不满足 RPO');
    assert.equal(fenceOldPrimary, true, '旧 primary 尚未 fencing');
    this.oldPrimaryFenced = true;
    this.phase = 'RECOVERING';
  }

  restoreService() {
    assert.equal(this.phase, 'RECOVERING');
    assert.equal(this.oldPrimaryFenced, true);
    this.phase = 'STABILIZED';
  }

  validateBusiness() {
    assert.equal(this.phase, 'STABILIZED');
    this.businessValidated = true;
  }

  removeTemporaryMeasure(measure) {
    assert.equal(this.phase, 'STABILIZED');
    this.temporaryMeasures.delete(measure);
  }

  close() {
    assert.equal(this.businessValidated, true, '尚未完成业务正确性验证');
    assert.equal(this.temporaryMeasures.size, 0, '仍有临时措施未清理');
    this.phase = 'CLOSED';
  }
}

function run() {
  const incident = new Incident('INC-2026-0715');
  incident.declare();
  assert.throws(() => incident.contain('pause-exports'), /保存易失证据/);
  incident.saveEvidence();
  incident.contain('pause-exports');
  incident.contain('limit-noncritical-reads');
  console.log('✓ 保存证据后才进入可追踪 containment，避免先操作后丢失现场');

  assert.throws(() => incident.failover({
    candidateHealthy: true,
    rpoSatisfied: true,
    fenceOldPrimary: false,
  }), /尚未 fencing/);
  incident.failover({
    candidateHealthy: true,
    rpoSatisfied: true,
    fenceOldPrimary: true,
  });
  assert.equal(incident.oldPrimaryFenced, true);
  console.log('✓ failover 同时要求候选健康、满足 RPO 和旧主 fencing');

  incident.restoreService();
  assert.throws(() => incident.close(), /业务正确性验证/);
  incident.validateBusiness();
  assert.throws(() => incident.close(), /临时措施未清理/);
  incident.removeTemporaryMeasure('pause-exports');
  incident.removeTemporaryMeasure('limit-noncritical-reads');
  incident.close();
  assert.equal(incident.phase, 'CLOSED');
  console.log('✓ 服务恢复后仍需业务验证并清理全部临时措施，事故才能关闭');

  console.log('全部事故证据、切换 fencing、验证与关闭门禁断言通过。');
}

run();
