import assert from 'node:assert/strict';

function isPlainObject(value) {
  return value !== null && typeof value === 'object'
    && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize); // 数组顺序保留。
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

function validateV2(document) {
  assert.ok(isPlainObject(document), 'attributes must be an object');
  const allowed = new Set(['schemaVersion', 'color', 'dimensionsMm', 'tags', 'nickname']);
  for (const key of Object.keys(document)) {
    assert.ok(allowed.has(key), `unknown attribute: ${key}`);
  }
  assert.equal(document.schemaVersion, 2);
  assert.match(document.color, /^(red|blue|green)$/);
  assert.ok(isPlainObject(document.dimensionsMm));
  assert.deepEqual(
    Object.keys(document.dimensionsMm).sort(),
    ['height', 'width'],
    'dimensionsMm must not contain unknown fields',
  );
  for (const key of ['width', 'height']) {
    assert.ok(Number.isInteger(document.dimensionsMm[key]));
    assert.ok(document.dimensionsMm[key] > 0 && document.dimensionsMm[key] <= 10000);
  }
  assert.ok(Array.isArray(document.tags) && document.tags.length <= 10);
  assert.equal(new Set(document.tags).size, document.tags.length, 'tags must be unique');
  for (const tag of document.tags) assert.match(tag, /^[a-z0-9-]{1,24}$/);
  if (Object.hasOwn(document, 'nickname')) {
    assert.ok(document.nickname === null
      || (typeof document.nickname === 'string' && document.nickname.length <= 40));
  }
  assert.ok(Buffer.byteLength(JSON.stringify(document), 'utf8') <= 2048);
  return document;
}

function upgradeToV2(input) {
  assert.ok(isPlainObject(input));
  if (input.schemaVersion === 2) return validateV2(structuredClone(input));
  assert.equal(input.schemaVersion, 1, 'unsupported schema version');
  const allowedV1 = new Set([
    'schemaVersion', 'colour', 'widthMm', 'heightMm', 'tags', 'nickname',
  ]);
  for (const key of Object.keys(input)) {
    assert.ok(allowedV1.has(key), `unknown v1 attribute: ${key}`);
  }
  const upgraded = {
    schemaVersion: 2,
    color: input.colour,
    dimensionsMm: { width: input.widthMm, height: input.heightMm },
    tags: input.tags ?? [],
  };
  if (Object.hasOwn(input, 'nickname')) upgraded.nickname = input.nickname;
  return validateV2(upgraded);
}

function applyPatch(row, patch, expectedRowVersion) {
  assert.equal(row.rowVersion, expectedRowVersion, 'optimistic version conflict');
  assert.ok(isPlainObject(patch));
  const allowedPatchKeys = new Set(['color', 'dimensionsMm', 'tags', 'nickname']);
  const next = structuredClone(row.attributes);
  for (const [key, value] of Object.entries(patch)) {
    assert.ok(allowedPatchKeys.has(key), `immutable or unknown patch key: ${key}`);
    // 缺失 key 不进入 Object.entries，因此保留；nickname:null 表示明确清空。
    next[key] = structuredClone(value);
  }
  validateV2(next);
  return { attributes: next, rowVersion: row.rowVersion + 1 };
}

const legacy = {
  schemaVersion: 1,
  colour: 'red',
  widthMm: 120,
  heightMm: 40,
  tags: ['new', 'portable'],
};
const current = upgradeToV2(legacy);
assert.equal(Object.hasOwn(current, 'nickname'), false, 'missing remains missing');

const row = { attributes: current, rowVersion: 7 };
const withExplicitNull = applyPatch(row, { nickname: null }, 7);
assert.equal(Object.hasOwn(withExplicitNull.attributes, 'nickname'), true);
assert.equal(withExplicitNull.attributes.nickname, null);
assert.equal(withExplicitNull.attributes.color, 'red', 'missing patch field preserves value');

assert.throws(
  () => applyPatch(withExplicitNull, { color: 'blue' }, 7),
  /optimistic version conflict/,
);
assert.throws(
  () => validateV2({ ...current, supplierId: 'supplier-9' }),
  /unknown attribute/,
);
assert.throws(
  () => upgradeToV2({ schemaVersion: 99 }),
  /unsupported schema version/,
);

const differentlyOrdered = {
  tags: ['new', 'portable'],
  dimensionsMm: { height: 40, width: 120 },
  color: 'red',
  schemaVersion: 2,
};
assert.equal(
  JSON.stringify(canonicalize(current)),
  JSON.stringify(canonicalize(differentlyOrdered)),
  'object key order must not change canonical equality',
);

console.log(JSON.stringify({
  upgraded: current,
  explicitNull: withExplicitNull.attributes.nickname,
  rowVersion: withExplicitNull.rowVersion,
  unknownFieldsWereRejected: true,
  stalePatchWasRejected: true,
  canonicalObjectsMatched: true,
}, null, 2));
