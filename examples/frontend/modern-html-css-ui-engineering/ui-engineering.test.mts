import assert from 'node:assert/strict';
import { parseThemePreference, resolveTheme, saveThemePreference } from './theme-preference.ts';

assert.equal(parseThemePreference('dark'), 'dark');
assert.equal(parseThemePreference('unknown'), 'system');
assert.equal(resolveTheme('system', true), 'dark');
assert.equal(resolveTheme('system', false), 'light');
assert.equal(resolveTheme('light', true), 'light');

const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
};
saveThemePreference(storage, 'dark');
assert.equal(storage.getItem('theme-preference'), 'dark');

console.log('modern HTML/CSS UI examples passed');
