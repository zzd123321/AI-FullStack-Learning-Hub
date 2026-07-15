import assert from 'node:assert/strict';

class Upgrade {
  constructor() {
    this.phase = 'PLANNED';
    this.checks = new Map();
    this.rollbackEligible = true;
    this.oldWriterFenced = false;
  }
  record(name, passed) { this.checks.set(name, passed); }
  canCanary() {
    return ['path', 'objects', 'drivers', 'extensions', 'restore', 'rollback']
      .every((name) => this.checks.get(name) === true);
  }
  startCanary() {
    assert.equal(this.canCanary(), true, '预检尚未全部通过');
    this.phase = 'CANARY';
  }
  approveCutover() {
    assert.equal(this.phase, 'CANARY');
    assert.equal(this.checks.get('canary-workload'), true);
    assert.equal(this.checks.get('replication-caught-up'), true);
    this.phase = 'CUTOVER_READY';
  }
  cutover({ fenceOldWriter }) {
    assert.equal(this.phase, 'CUTOVER_READY');
    assert.equal(fenceOldWriter, true, '旧写入口尚未 fencing');
    this.oldWriterFenced = true;
    this.phase = 'OBSERVING';
  }
  useIncompatibleFeature() { this.rollbackEligible = false; }
  complete() {
    assert.equal(this.phase, 'OBSERVING');
    assert.equal(this.checks.get('business-validated'), true);
    assert.equal(this.checks.get('backup-restore-validated'), true);
    this.phase = 'COMPLETE';
  }
}

const upgrade = new Upgrade();
upgrade.record('path', true);
upgrade.record('objects', true);
assert.throws(() => upgrade.startCanary(), /预检/);
for (const check of ['drivers', 'extensions', 'restore', 'rollback']) upgrade.record(check, true);
upgrade.startCanary();
upgrade.record('canary-workload', true);
upgrade.record('replication-caught-up', true);
upgrade.approveCutover();
assert.throws(() => upgrade.cutover({ fenceOldWriter: false }), /fencing/);
upgrade.cutover({ fenceOldWriter: true });
upgrade.useIncompatibleFeature();
assert.equal(upgrade.rollbackEligible, false);
upgrade.record('business-validated', true);
upgrade.record('backup-restore-validated', true);
upgrade.complete();
assert.equal(upgrade.phase, 'COMPLETE');
console.log('✓ 预检、canary、追平、旧写 fencing、回退资格和完成验证门禁全部通过');
