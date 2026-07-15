import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type JsonObject = Readonly<Record<string, unknown>>;
interface Token { readonly $type?: string; readonly $value: unknown }

const directory = dirname(fileURLToPath(import.meta.url));
const source = JSON.parse(await readFile(resolve(directory, 'tokens.json'), 'utf8')) as JsonObject;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function tokenAt(path: string): Token {
  let current: unknown = source;
  let inheritedType: string | undefined;
  for (const segment of path.split('.')) {
    if (!isObject(current) || !(segment in current)) throw new Error(`Unknown token alias: ${path}`);
    if (typeof current.$type === 'string') inheritedType = current.$type;
    current = current[segment];
  }
  if (!isObject(current) || !('$value' in current)) throw new Error(`Alias is not a token: ${path}`);
  const token = current as unknown as Token;
  return { $type: token.$type ?? inheritedType, $value: token.$value };
}

function listTokenPaths(node: unknown, prefix: readonly string[] = []): string[] {
  if (!isObject(node)) return [];
  if ('$value' in node) return [prefix.join('.')];
  return Object.entries(node).flatMap(([name, child]) =>
    name.startsWith('$') ? [] : listTokenPaths(child, [...prefix, name]),
  );
}

function resolveToken(path: string, stack: readonly string[] = []): Token {
  if (stack.includes(path)) throw new Error(`Token alias cycle: ${[...stack, path].join(' -> ')}`);
  const token = tokenAt(path);
  const match = typeof token.$value === 'string' ? /^\{([^}]+)\}$/.exec(token.$value) : null;
  if (!match) return token;
  const target = resolveToken(match[1]!, [...stack, path]);
  if (token.$type && target.$type && token.$type !== target.$type) {
    throw new Error(`Token type mismatch: ${path}`);
  }
  return { $type: token.$type ?? target.$type, $value: target.$value };
}

function validateTokenValue(path: string, token: Token): void {
  if (token.$type === 'color' && isObject(token.$value)) {
    const components = token.$value.components;
    if (
      token.$value.colorSpace === 'srgb' &&
      Array.isArray(components) &&
      components.length === 3 &&
      components.every((value) => typeof value === 'number' && value >= 0 && value <= 1) &&
      (token.$value.hex === undefined ||
        (typeof token.$value.hex === 'string' && /^#[0-9a-f]{6}$/i.test(token.$value.hex)))
    ) return;
  }
  if (
    token.$type === 'dimension' &&
    isObject(token.$value) &&
    typeof token.$value.value === 'number' &&
    Number.isFinite(token.$value.value) &&
    typeof token.$value.unit === 'string'
  ) return;
  throw new Error(`Invalid or unsupported ${token.$type ?? 'untyped'} token: ${path}`);
}

function cssValue(path: string): string {
  const token = resolveToken(path);
  if (token.$type === 'color' && isObject(token.$value) && typeof token.$value.hex === 'string') {
    return token.$value.hex;
  }
  if (
    token.$type === 'dimension' &&
    isObject(token.$value) &&
    typeof token.$value.value === 'number' &&
    typeof token.$value.unit === 'string'
  ) {
    return `${token.$value.value}${token.$value.unit}`;
  }
  throw new Error(`Unsupported token value: ${path}`);
}

const expected = new Map([
  ['--ds-color-text-default', cssValue('semantic.light.text.default')],
  ['--ds-color-surface-canvas', cssValue('semantic.light.surface.canvas')],
  ['--ds-button-padding-inline', cssValue('component.button.paddingInline')],
  ['--ds-button-radius', cssValue('component.button.radius')],
]);
const css = await readFile(resolve(directory, 'tokens.css'), 'utf8');
const paths = listTokenPaths(source);
for (const path of paths) validateTokenValue(path, resolveToken(path));
for (const [name, value] of expected) {
  assert.match(css, new RegExp(`${name}:\\s*${value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}`));
}

console.log(`Token graph verified (${paths.length} tokens, ${expected.size} CSS contract values).`);
