import assert from 'node:assert/strict';
import { isContentDocument } from './content-model.ts';
import { normalizeLink } from './safe-link.ts';
import { restorePoint } from './selection-bookmark.ts';
import { plainTextToParagraphs } from './plain-text-paste.ts';
import { applyPublicationSnapshot } from './publish-state.ts';
import { applyReplaceText } from './transaction.ts';

assert.equal(isContentDocument({ schemaVersion: 'content-v1', blocks: [
  { id: 'p1', type: 'paragraph', children: [{ type: 'text', text: 'Hello' }] },
]}), true);
assert.equal(isContentDocument({ schemaVersion: 'content-v1', blocks: [
  { id: 'same', type: 'paragraph', children: [] }, { id: 'same', type: 'paragraph', children: [] },
]}), false);
assert.equal(isContentDocument({ schemaVersion: 'content-v1', blocks: [
  { id: 'p1', type: 'paragraph', children: [{ type: 'script', text: 'alert(1)' }] },
]}), false);

assert.deepEqual(applyReplaceText({ version: 1, blocks: { p1: 'Hello' } }, {
  blockId: 'p1', from: 5, to: 5, text: ' world',
}), { version: 2, blocks: { p1: 'Hello world' } });
assert.throws(() => applyReplaceText({ version: 1, blocks: { p1: '😀' } }, {
  blockId: 'p1', from: 1, to: 1, text: 'x',
}), RangeError);
assert.deepEqual(restorePoint({ blockId: 'deleted', offset: 3 }, { p1: 'Hello' }, 'p1'), {
  blockId: 'p1', offset: 5,
});
assert.equal(normalizeLink('javascript:alert(1)', 'https://learn.example'), null);
assert.deepEqual(normalizeLink('/lesson', 'https://learn.example'), {
  href: 'https://learn.example/lesson', external: false, rel: null,
});
assert.equal(normalizeLink('/lesson', 'https://learn.example/dir').external, false);
assert.deepEqual(plainTextToParagraphs('First\r\nline\r\n\r\nSecond'), [
  { type: 'paragraph', text: 'First line' }, { type: 'paragraph', text: 'Second' },
]);

const current = { contentId: 'c1', version: 3, contentRevision: 2, phase: 'review' as const,
  publishedRevision: null, allowedCommands: ['publish'] as const };
assert.equal(applyPublicationSnapshot(current, { ...current, version: 2 }).version, 3);
assert.equal(applyPublicationSnapshot(current, {
  ...current, version: 4, phase: 'published', publishedRevision: 2,
}).phase, 'published');
console.log('rich-text editor examples passed');
