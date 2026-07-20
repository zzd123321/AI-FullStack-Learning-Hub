import assert from 'node:assert/strict';
import { parseBridgeRequest, parseBridgeResponse } from './bridge-protocol.ts';
import { parseDeepLink } from './deep-link.ts';

assert.equal(parseBridgeRequest({ version: 1, id: '1', method: 'unknown', params: {} }), null);
assert.equal(parseBridgeRequest({
  version: 1, id: '1b', method: 'app.getCapabilities', params: { unexpected: true },
}), null);
assert.equal(parseBridgeRequest({
  version: 1, id: '2', method: 'shell.openExternal', params: { url: 'https://example.com' },
})?.method, 'shell.openExternal');
assert.equal(parseBridgeRequest({
  version: 1, id: '3', method: 'dialog.selectFile', params: { accept: ['../../secret'] },
}), null);
assert.equal(parseBridgeResponse({
  version: 1, id: '4', ok: false, error: { code: 'ARBITRARY_NATIVE_ERROR', message: 'unsafe' },
}), null);
assert.deepEqual(parseDeepLink('learnapp://lesson?id=42', 'learnapp'), { route: '/lesson', params: { id: '42' } });
assert.equal(parseDeepLink('https://evil.example/lesson', 'learnapp'), null);
assert.equal(parseDeepLink('learnapp://lesson?id=42&id=43', 'learnapp'), null);
assert.equal(parseDeepLink('learnapp://user:secret@lesson?id=42', 'learnapp'), null);
assert.equal(parseDeepLink('learnapp://lesson?id=42&action=delete', 'learnapp'), null);
console.log('cross-platform bridge examples passed');
