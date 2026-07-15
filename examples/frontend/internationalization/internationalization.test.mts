import assert from 'node:assert/strict';
import { negotiateLocale } from './locales.ts';
import { pseudoLocalize } from './pseudo-localize.ts';

assert.equal(negotiateLocale(['invalid_locale', 'en-GB']), 'en-US');
assert.equal(negotiateLocale(['ar-EG']), 'ar');
assert.equal(negotiateLocale([]), 'zh-CN');
assert.equal(new Intl.PluralRules('ar').select(0), 'zero');
assert.equal(new Intl.PluralRules('ar').select(2), 'two');
assert.equal(pseudoLocalize('Hello, {name}'), '⟦Hëllô, {name} ···⟧');

console.log('Internationalization runtime tests passed.');
