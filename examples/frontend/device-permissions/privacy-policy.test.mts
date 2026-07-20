import assert from 'node:assert/strict';
import { validatePurpose } from './privacy-policy.ts';

assert.deepEqual(validatePurpose({
  capability: 'geolocation',
  purpose: '根据当前城市展示附近线下课程',
  dataCategories: ['城市级位置'],
  processing: 'local',
  retentionDays: null,
  required: false,
  fallback: '手动选择城市',
}), []);

assert.deepEqual(validatePurpose({
  capability: 'clipboard',
  purpose: '改善体验',
  dataCategories: ['剪贴板文本'],
  processing: 'server',
  retentionDays: 365,
  required: false,
  fallback: null,
}), [
  '用途说明过于模糊',
  '剪贴板内容不应默认持久保存',
  '可选能力必须说明替代路径',
]);

console.log('device privacy policy examples passed');
