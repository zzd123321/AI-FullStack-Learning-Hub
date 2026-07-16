import assert from 'node:assert/strict';
import { appendPage } from './cursor-pages.ts';
import { toggleFacet } from './facet-selection.ts';
import { buildHighlightSegments } from './highlight-segments.ts';
import { LatestSearch } from './latest-search.ts';
import { changeCriteria, encodeSearchQuery, parseSearchQuery } from './query-codec.ts';

const parsed = parseSearchQuery(new URLSearchParams(
  'q=%20typescript%20&category=web&category=web&category=security&status=unknown&cursor=next_1',
));
assert.deepEqual(parsed, {
  term: 'typescript', categories: ['security', 'web'], status: 'all',
  sort: 'relevance', cursor: 'next_1',
});
assert.equal(encodeSearchQuery(parsed).toString(),
  'q=typescript&category=security&category=web&cursor=next_1');
assert.equal(changeCriteria(parsed, { term: 'vue' }).cursor, undefined);

assert.deepEqual(appendPage([{ id: '1', title: 'Old' }], {
  queryFingerprint: 'query-a',
  hits: [{ id: '1', title: 'Updated' }, { id: '2', title: 'New' }],
  nextCursor: null,
}, 'query-a'), [{ id: '1', title: 'Updated' }, { id: '2', title: 'New' }]);
assert.throws(() => appendPage([], {
  queryFingerprint: 'stale', hits: [], nextCursor: null,
}, 'current'));

const facets = toggleFacet(new Map(), 'status', 'published');
assert.equal(facets.get('status')?.has('published'), true);
assert.deepEqual(buildHighlightSegments('TypeScript', [{ start: 0, end: 4 }]), [
  { text: 'Type', highlighted: true }, { text: 'Script', highlighted: false },
]);
assert.throws(() => buildHighlightSegments('abc', [{ start: 2, end: 4 }]));
assert.throws(() => buildHighlightSegments('A😀B', [{ start: 1, end: 2 }]));

let finishOld: ((value: string) => void) | undefined;
const latest = new LatestSearch();
const oldRequest = latest.run(() => new Promise<string>((resolve) => { finishOld = resolve; }));
assert.equal(await latest.run(async () => 'new result'), 'new result');
finishOld?.('old result');
assert.equal(await oldRequest, null);
console.log('search query examples passed');
