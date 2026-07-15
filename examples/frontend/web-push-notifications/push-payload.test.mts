import assert from 'node:assert/strict';
import { parsePushPayload } from './push-payload.ts';

const valid = parsePushPayload({
  version: 1, notificationId: 'n1', title: '新任务', route: '/tasks/1', category: 'task',
});
assert.equal(valid?.route, '/tasks/1');
assert.equal(parsePushPayload({
  version: 1, notificationId: 'n2', title: '危险跳转', route: '//evil.example', category: 'system',
}), null);
assert.equal(parsePushPayload({
  version: 2, notificationId: 'n3', title: '未知版本', route: '/', category: 'system',
}), null);
console.log('web push payload examples passed');
