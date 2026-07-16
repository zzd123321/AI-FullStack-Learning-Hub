import assert from 'node:assert/strict';

const STOPWORDS = new Set(['a', 'an', 'and', 'the', 'of']);

function analyze(text) {
  return text
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function parseUserQuery(input) {
  assert.equal(typeof input, 'string');
  assert.ok(Buffer.byteLength(input, 'utf8') <= 128, 'query is too long');
  const tokens = [...new Set(analyze(input))];
  assert.ok(tokens.length > 0, 'query has no searchable tokens');
  assert.ok(tokens.length <= 8, 'query has too many tokens');
  return tokens;
}

function countToken(tokens, wanted) {
  return tokens.reduce((count, token) => count + Number(token === wanted), 0);
}

function search(documents, input, limit = 10) {
  assert.ok(Number.isInteger(limit) && limit > 0 && limit <= 50);
  const queryTokens = parseUserQuery(input);
  const ranked = [];

  for (const document of documents) {
    if (document.tenantId !== 'tenant-a' || document.status !== 'ACTIVE') continue;
    const titleTokens = analyze(document.title);
    const descriptionTokens = analyze(document.description);
    let score = 0;
    for (const token of queryTokens) {
      score += countToken(titleTokens, token) * 4;
      score += countToken(descriptionTokens, token);
    }
    if (score > 0) ranked.push({ id: document.id, score, title: document.title });
  }

  // 同分时 ID 升序，保证同一数据快照上的结果确定。
  return ranked
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, limit);
}

const documents = [
  {
    id: 'p-1', tenantId: 'tenant-a', status: 'ACTIVE',
    title: 'Wireless Noise Cancelling Headphones',
    description: 'Comfortable wireless headphones for commuting.',
  },
  {
    id: 'p-2', tenantId: 'tenant-a', status: 'ACTIVE',
    title: 'Wireless Earbuds',
    description: 'Compact earbuds with noise cancelling.',
  },
  {
    id: 'p-3', tenantId: 'tenant-a', status: 'DRAFT',
    title: 'Noise Cancelling Headphones',
    description: 'Must not be visible before publication.',
  },
  {
    id: 'p-4', tenantId: 'tenant-b', status: 'ACTIVE',
    title: 'Wireless Noise Cancelling Headphones',
    description: 'Must not cross the tenant boundary.',
  },
];

const results = search(documents, 'wireless noise', 10);
assert.deepEqual(results.map((item) => item.id), ['p-1', 'p-2']);
assert.ok(results[0].score > results[1].score, 'title weighting should affect rank');
assert.equal(results.some((item) => item.id === 'p-3'), false);
assert.equal(results.some((item) => item.id === 'p-4'), false);

assert.throws(() => search(documents, 'the and of'), /no searchable tokens/);
assert.throws(
  () => search(documents, 'one two three four five six seven eight nine'),
  /too many tokens/,
);

console.log(JSON.stringify({
  query: 'wireless noise',
  results,
  emptyAnalyzedQueryWasRejected: true,
  queryComplexityWasBounded: true,
  tenantAndStatusFiltersWereEnforced: true,
}, null, 2));
