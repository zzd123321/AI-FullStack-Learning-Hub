import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import type * as TypeScript from 'typescript';

const require = createRequire(import.meta.url);
const ts = require('typescript') as typeof TypeScript;

interface Policy {
  readonly sourceRoot: string;
  readonly publicEntrypoint: string;
  readonly internalPackagePrefix: string;
  readonly allowedLayerDependencies: Readonly<Record<string, readonly string[]>>;
}

interface Location {
  readonly kind: 'app' | 'shared' | 'feature' | 'other';
  readonly feature?: string;
  readonly layer?: string;
  readonly isPublicEntrypoint: boolean;
}

const policyFile = resolve(process.argv[2] ?? 'architecture-rules.json');
const projectRoot = dirname(policyFile);
const policy = JSON.parse(readFileSync(policyFile, 'utf8')) as Policy;
const sourceRoot = resolve(projectRoot, policy.sourceRoot);

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(file);
    return ['.ts', '.mts', '.tsx'].includes(extname(entry.name)) ? [file] : [];
  });
}

function locate(file: string): Location {
  const parts = relative(sourceRoot, file).split(sep);
  if (parts[0] === 'shared') return { kind: 'shared', isPublicEntrypoint: false };
  if (parts[0] === 'app') return { kind: 'app', isPublicEntrypoint: false };
  if (parts[0] !== 'features' || !parts[1]) return { kind: 'other', isPublicEntrypoint: false };
  return {
    kind: 'feature',
    feature: parts[1],
    layer: parts[2] === policy.publicEntrypoint ? undefined : parts[2],
    isPublicEntrypoint: parts.length === 3 && parts[2] === policy.publicEntrypoint,
  };
}

function localTarget(importer: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const requested = resolve(dirname(importer), specifier);
  const withoutJsExtension = requested.replace(/\.(?:mjs|cjs|js)$/, '');
  const candidates = [
    requested,
    `${withoutJsExtension}.ts`,
    `${withoutJsExtension}.mts`,
    `${withoutJsExtension}.tsx`,
    resolve(requested, 'index.ts'),
    resolve(requested, 'index.mts'),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function moduleSpecifiers(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];
  const visit = (node: TypeScript.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]!)
    ) {
      specifiers.push(node.arguments[0]!.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers;
}

const errors: string[] = [];
const featureEdges = new Map<string, Set<string>>();

function fail(source: string, specifier: string, reason: string): void {
  errors.push(`${relative(projectRoot, source)} -> ${specifier}: ${reason}`);
}

for (const source of listSourceFiles(sourceRoot)) {
  const from = locate(source);
  for (const specifier of moduleSpecifiers(source)) {
    if (specifier.startsWith(policy.internalPackagePrefix)) {
      const packagePath = specifier.slice(policy.internalPackagePrefix.length);
      if (packagePath.includes('/')) fail(source, specifier, 'internal package deep import is forbidden');
      continue;
    }

    const target = localTarget(source, specifier);
    if (!target) continue;
    if (target !== sourceRoot && !target.startsWith(`${sourceRoot}${sep}`)) {
      fail(source, specifier, 'relative import escapes source root');
      continue;
    }
    const to = locate(target);

    if (from.kind === 'shared' && (to.kind === 'feature' || to.kind === 'app')) {
      fail(source, specifier, 'shared code cannot depend on app or feature code');
      continue;
    }
    if (from.kind === 'feature' && to.kind === 'app') {
      fail(source, specifier, 'feature code cannot depend on the application shell');
      continue;
    }

    if (to.kind === 'feature' && from.feature !== to.feature) {
      if (!to.isPublicEntrypoint) {
        fail(source, specifier, 'feature consumers must import its public entrypoint');
        continue;
      }
      if (from.kind === 'feature' && from.feature && to.feature) {
        const targets = featureEdges.get(from.feature) ?? new Set<string>();
        targets.add(to.feature);
        featureEdges.set(from.feature, targets);
      }
    }

    if (
      from.kind === 'feature' &&
      to.kind === 'feature' &&
      from.feature === to.feature &&
      from.layer &&
      to.layer
    ) {
      const allowed = policy.allowedLayerDependencies[from.layer] ?? [];
      if (!allowed.includes(to.layer)) {
        fail(source, specifier, `layer "${from.layer}" cannot depend on layer "${to.layer}"`);
      }
    }
  }
}

// 已完整检查的节点无需从每个入口重复遍历，避免大型图呈指数级放大。
const checkedFeatures = new Set<string>();
function detectCycle(feature: string, path: readonly string[]): void {
  if (checkedFeatures.has(feature)) return;
  const index = path.indexOf(feature);
  if (index >= 0) {
    errors.push(`feature dependency cycle: ${[...path.slice(index), feature].join(' -> ')}`);
    return;
  }
  for (const target of featureEdges.get(feature) ?? []) detectCycle(target, [...path, feature]);
  checkedFeatures.add(feature);
}
for (const feature of featureEdges.keys()) detectCycle(feature, []);

if (errors.length > 0) {
  console.error(['Architecture boundary check failed:', ...errors.map((error) => `- ${error}`)].join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Architecture boundary check passed (${listSourceFiles(sourceRoot).length} source files).`);
}
