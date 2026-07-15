import assert from 'node:assert/strict';
import { parseBridgeRequest } from './bridge-protocol.ts';
import { parseDeepLink } from './deep-link.ts';

assert.equal(parseBridgeRequest({ version: 1, id: '1', method: 'unknown', params: {} }), null);
assert.equal(parseBridgeRequest({
  version: 1, id: '2', method: 'shell.openExternal', params: { url: 'https://example.com' },
})?.method, 'shell.openExternal');
assert.deepEqual(parseDeepLink('learnapp://lesson?id=42', 'learnapp'), { route: '/lesson', params: { id: '42' } });
assert.equal(parseDeepLink('https://evil.example/lesson', 'learnapp'), null);
console.log('cross-platform bridge examples passed');
