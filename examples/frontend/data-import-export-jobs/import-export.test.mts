import assert from 'node:assert/strict';
import { suggestMappings, missingRequiredFields } from './column-mapping.ts';
import { encodeCsvCell, encodeCsvRow } from './csv-cell.ts';
import { resolveDownloadUrl } from './download-link.ts';
import { preflightFile } from './file-preflight.ts';
import { applyJobSnapshot } from './job-state.ts';
import { weightedProgress } from './progress.ts';

const policy = {
  maxBytes: 1_000_000,
  extensions: new Set(['.csv']),
  mediaTypes: new Set(['text/csv']),
};
assert.deepEqual(preflightFile({ name: 'members.CSV', size: 100, type: 'text/csv' }, policy), {
  accepted: true, extension: '.csv',
});
assert.equal(preflightFile({ name: 'members.exe', size: 100, type: '' }, policy).accepted, false);

const fields = [
  { id: 'email', label: 'Email', required: true, aliases: ['邮箱'] },
  { id: 'name', label: 'Name', required: true, aliases: ['姓名'] },
];
const analysis = suggestMappings([' 邮箱 ', 'Name', ' name '], fields);
const mappings = analysis.mappings;
assert.deepEqual(mappings.map(({ targetFieldId }) => targetFieldId), ['email', 'name']);
assert.deepEqual(analysis.duplicateSourceColumns, [' name ']);
assert.deepEqual(missingRequiredFields(mappings.slice(0, 1), fields), ['name']);

assert.equal(encodeCsvCell('a"b', 'reject'), '"a""b"');
assert.throws(() => encodeCsvCell(' =HYPERLINK("bad")', 'reject'));
assert.equal(encodeCsvRow(['name', 'hello,world'], 'reject'), '"name","hello,world"\r\n');

const running = { jobId: 'job-1', phase: 'running' as const, version: 2,
  processedRows: 10, totalRows: 100, succeededRows: 9, failedRows: 1 };
assert.deepEqual(applyJobSnapshot(running, { ...running, phase: 'succeeded', version: 3 }), {
  ...running, phase: 'succeeded', version: 3,
});
assert.equal(weightedProgress([
  { completed: 1, total: 1, weight: 20 }, { completed: 50, total: 100, weight: 80 },
]), 60);
assert.equal(resolveDownloadUrl({ url: 'https://files.example/report.csv', expiresAt: 2_000 },
  new Set(['https://files.example']), 1_000)?.pathname, '/report.csv');
assert.equal(resolveDownloadUrl({ url: 'javascript:alert(1)', expiresAt: 2_000 }, new Set(), 1_000), null);
assert.equal(resolveDownloadUrl({ url: 'https://user:pass@files.example/report.csv', expiresAt: 2_000 },
  new Set(['https://files.example']), 1_000), null);
console.log('import export examples passed');
