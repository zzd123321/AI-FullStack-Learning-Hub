import assert from 'node:assert/strict';
import { decodeDraft } from './draft-envelope.ts';
import { buildErrorSummary } from './error-summary.ts';
import { assertFormDefinition } from './form-schema.ts';
import { collectDependencies, evaluateRule } from './rule-engine.ts';
import { mergeFields } from './three-way-merge.ts';
import { applyWorkflowSnapshot, canIssue } from './workflow-state.ts';

assertFormDefinition({ schemaVersion: 'expense-v3', fields: [
  { id: 'amount', kind: 'number', labelKey: 'expense.amount', required: true },
] });
assert.throws(() => assertFormDefinition({ schemaVersion: 'bad', fields: [
  { id: 'same', kind: 'text', labelKey: 'a' },
  { id: 'same', kind: 'text', labelKey: 'b' },
] }));
assert.throws(() => assertFormDefinition({ schemaVersion: 'bad', fields: [
  { id: 'unsafe', kind: 'arbitrary-component', labelKey: 'unsafe' },
] }));

const draft = decodeDraft<{ amount: number }>(JSON.stringify({
  documentId: 'expense-1', schemaVersion: 'expense-v1', baseVersion: 2,
  savedAt: 1_000, data: { amountInYuan: 12 },
}), 'expense-1', (version, data) => {
  if (version !== 'expense-v1' || typeof data !== 'object' || data === null
    || !('amountInYuan' in data) || typeof data.amountInYuan !== 'number') return null;
  return { schemaVersion: 'expense-v2', data: { amount: data.amountInYuan * 100 } };
});
assert.deepEqual(draft?.data, { amount: 1_200 });
assert.equal(draft?.schemaVersion, 'expense-v2');

const rule = { op: 'and' as const, rules: [
  { op: 'eq' as const, field: 'country', value: 'CN' },
  { op: 'in' as const, field: 'amountBand', values: ['high', 'very-high'] },
] };
assert.equal(evaluateRule(rule, { country: 'CN', amountBand: 'high' }), true);
assert.deepEqual([...collectDependencies(rule)].sort(), ['amountBand', 'country']);
assert.equal(evaluateRule({ op: 'in', field: 'missing', values: [null] }, {}), false);
assert.throws(() => evaluateRule(rule, { country: 'CN', amountBand: 'high' }, 1));

const result = mergeFields(
  { title: 'Old', amount: 100 },
  { title: 'Mine', amount: 100 },
  { title: 'Theirs', amount: 200 },
);
assert.deepEqual(result.merged, { title: 'Mine', amount: 200 });
assert.equal(result.conflicts.length, 1);

const current = { instanceId: 'wf-1', phase: 'in_review' as const, version: 2, allowedCommands: ['approve'] as const };
assert.equal(canIssue(current, 'approve'), true);
assert.deepEqual(applyWorkflowSnapshot(current, { ...current, phase: 'approved', version: 3, allowedCommands: [] }), {
  ...current, phase: 'approved', version: 3, allowedCommands: [],
});
assert.equal(buildErrorSummary([{ fieldId: 'amount', code: 'min', message: '金额必须大于 0' }])[0]?.controlId, 'field-amount');
console.log('form workflow examples passed');
