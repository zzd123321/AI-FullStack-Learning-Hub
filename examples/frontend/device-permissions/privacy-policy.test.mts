import assert from 'node:assert/strict';
import { validatePurpose } from './privacy-policy.ts';

assert.deepEqual(validatePurpose({
  capability: 'geolocation', purpose: '用于显示附近线下课程', retention: 'none', required: false,
}), []);
assert.deepEqual(validatePurpose({
  capability: 'clipboard', purpose: '复制', retention: 'account', required: false,
}), ['用途说明过于模糊', '剪贴板内容不应默认长期保存']);
console.log('device privacy policy examples passed');
