import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type RawMessage = string | Readonly<Record<string, string>>;
type RawCatalog = Readonly<Record<string, RawMessage>>;
const directory = dirname(fileURLToPath(import.meta.url));
const locales = ['zh-CN', 'en-US', 'ar'] as const;

async function readCatalog(locale: string): Promise<RawCatalog> {
  return JSON.parse(await readFile(resolve(directory, 'messages', `${locale}.json`), 'utf8'));
}

function placeholders(message: string): Set<string> {
  return new Set([...message.matchAll(/\{([A-Za-z][\w]*)\}/g)].map((match) => match[1]!));
}

const catalogs = new Map(await Promise.all(locales.map(async (locale) => [locale, await readCatalog(locale)] as const)));
const source = catalogs.get('en-US')!;
const sourceKeys = Object.keys(source).sort();

for (const locale of locales) {
  const catalog = catalogs.get(locale)!;
  assert.deepEqual(Object.keys(catalog).sort(), sourceKeys, `${locale}: message keys differ`);
  for (const key of sourceKeys) {
    const sourceMessage = source[key]!;
    const translated = catalog[key]!;
    assert.equal(typeof translated, typeof sourceMessage, `${locale}:${key}: message shape differs`);
    if (typeof sourceMessage === 'string' && typeof translated === 'string') {
      assert.deepEqual(placeholders(translated), placeholders(sourceMessage), `${locale}:${key}: placeholders differ`);
      continue;
    }
    if (typeof sourceMessage === 'object' && typeof translated === 'object') {
      assert.ok(translated.other, `${locale}:${key}: plural "other" is required`);
      const required = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
      for (const category of required) assert.ok(translated[category], `${locale}:${key}: missing ${category}`);
      const allowed = new Set(Object.values(sourceMessage).flatMap((value) => [...placeholders(value)]));
      for (const branch of Object.values(translated)) {
        for (const parameter of placeholders(branch)) assert.ok(allowed.has(parameter), `${locale}:${key}: unknown {${parameter}}`);
      }
    }
  }
}

console.log(`Catalog contract passed (${locales.length} locales, ${sourceKeys.length} keys).`);
