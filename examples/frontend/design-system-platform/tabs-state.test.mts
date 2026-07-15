import assert from 'node:assert/strict';
import { activateFocusedTab, createTabsState, focusTab } from './tabs-state.ts';

const items = [
  { id: 'overview', label: '概览', panel: '概览内容' },
  { id: 'draft', label: '草稿', panel: '草稿内容', disabled: true },
  { id: 'history', label: '历史', panel: '历史内容' },
] as const;

const manual = createTabsState(items, 'overview', 'manual');
const focused = focusTab(manual, 1);
assert.equal(focused.focusedId, 'history');
assert.equal(focused.selectedId, 'overview');
assert.equal(activateFocusedTab(focused).selectedId, 'history');

const automatic = focusTab(createTabsState(items, 'history', 'automatic'), 1);
assert.equal(automatic.focusedId, 'overview');
assert.equal(automatic.selectedId, 'overview');

assert.throws(
  () => createTabsState([{ id: 'same', label: 'A', panel: 'A' }, { id: 'same', label: 'B', panel: 'B' }]),
  /unique/,
);
assert.throws(
  () => createTabsState([{ id: 'disabled', label: '禁用', panel: '', disabled: true }]),
  /enabled item/,
);

console.log('Tabs behavior contract tests passed.');
