import assert from 'node:assert/strict';
import { createTranslator } from './message-runtime.js';

const fallbackEvents: string[] = [];
const translator = createTranslator(
  'ar',
  new Map([
    ['ar', { locale: 'ar', revision: 'test', messages: { empty: '' } }],
    ['en-US', { locale: 'en-US', revision: 'test', messages: { greeting: 'Hello, {name}' } }],
  ]),
  () => assert.fail('Existing test messages must not be reported missing'),
  (requested, resolved, key) => fallbackEvents.push(`${requested}:${resolved}:${key}`),
);

// 空字符串是合法翻译，不能被真假判断误报成缺失。
assert.equal(translator('empty'), '');
assert.equal(translator('greeting', { name: 'Ada' }), 'Hello, Ada');
assert.deepEqual(fallbackEvents, ['ar:en-US:greeting']);

console.log('Message fallback contract tests passed.');
