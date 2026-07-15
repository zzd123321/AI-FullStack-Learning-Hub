import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

interface ManifestChunk {
  readonly file: string;
  readonly src?: string;
  readonly isEntry?: boolean;
  readonly imports?: readonly string[];
  readonly css?: readonly string[];
}

interface PerformanceBudget {
  readonly entrySource: string;
  readonly maxInitialJsGzipBytes: number;
  readonly maxInitialCssGzipBytes: number;
  readonly maxAnyJsFileGzipBytes: number;
  readonly maxTotalJsGzipBytes: number;
  readonly maxStaticAssetRawBytes: number;
}

async function parseJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

function resolveInside(root: string, asset: string): string {
  const file = resolve(root, asset.replace(/^[/\\]+/, ''));
  if (file !== root && !file.startsWith(`${root}${sep}`)) {
    throw new Error(`Manifest asset escapes dist directory: ${asset}`);
  }
  return file;
}

async function gzipBytes(file: string): Promise<number> {
  return gzipSync(await readFile(file), { level: 9 }).byteLength;
}

function collectInitialChunkKeys(
  manifest: Readonly<Record<string, ManifestChunk>>,
  entryKey: string,
): Set<string> {
  const collected = new Set<string>();
  const visit = (key: string) => {
    if (collected.has(key)) return;
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Unknown static import in manifest: ${key}`);
    collected.add(key);
    for (const imported of chunk.imports ?? []) visit(imported);
  };
  visit(entryKey);
  return collected;
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map((entry) => {
      const file = resolve(directory, entry.name);
      return entry.isDirectory() ? listFiles(file) : Promise.resolve([file]);
    }),
  );
  return nested.flat();
}

function formatKiB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

const manifestFile = resolve(process.argv[2] ?? 'dist/.vite/manifest.json');
const budgetFile = resolve(process.argv[3] ?? 'performance-budget.json');
const distRoot = dirname(dirname(manifestFile));
const manifest = await parseJson<Record<string, ManifestChunk>>(manifestFile);
const budget = await parseJson<PerformanceBudget>(budgetFile);

const entry = Object.entries(manifest).find(
  ([key, chunk]) => chunk.isEntry && (chunk.src === budget.entrySource || key === budget.entrySource),
);
if (!entry) throw new Error(`Cannot find entry source in Vite manifest: ${budget.entrySource}`);

const initialKeys = collectInitialChunkKeys(manifest, entry[0]);
const initialChunks = [...initialKeys].map((key) => manifest[key]!);
const initialJsFiles = new Set(initialChunks.map((chunk) => chunk.file));
const initialCssFiles = new Set(initialChunks.flatMap((chunk) => chunk.css ?? []));
const outputFiles = (await listFiles(distRoot)).filter(
  (file) => !file.startsWith(`${resolve(distRoot, '.vite')}${sep}`),
);
const allJsFiles = new Set(
  outputFiles
    .filter((file) => ['.js', '.mjs', '.cjs'].includes(extname(file)))
    .map((file) => file.slice(distRoot.length + 1)),
);

const gzipTotal = async (files: ReadonlySet<string>) =>
  (await Promise.all([...files].map((file) => gzipBytes(resolveInside(distRoot, file))))).reduce(
    (total, size) => total + size,
    0,
  );

const initialJs = await gzipTotal(initialJsFiles);
const initialCss = await gzipTotal(initialCssFiles);
const allJsSizes = await Promise.all(
  [...allJsFiles].map(async (file) => ({ file, bytes: await gzipBytes(resolveInside(distRoot, file)) })),
);
const totalJs = allJsSizes.reduce((total, item) => total + item.bytes, 0);
const largestJs = allJsSizes.sort((left, right) => right.bytes - left.bytes)[0];

const staticFiles = outputFiles.filter(
  (file) => !['.html', '.js', '.mjs', '.cjs', '.css', '.map'].includes(extname(file)),
);
const staticSizes = await Promise.all(
  staticFiles.map(async (file) => ({ file, bytes: (await stat(file)).size })),
);
const largestStatic = staticSizes.sort((left, right) => right.bytes - left.bytes)[0];

const checks = [
  ['initial JS (gzip)', initialJs, budget.maxInitialJsGzipBytes],
  ['initial CSS (gzip)', initialCss, budget.maxInitialCssGzipBytes],
  ['largest JS file (gzip)', largestJs?.bytes ?? 0, budget.maxAnyJsFileGzipBytes],
  ['total JS (gzip)', totalJs, budget.maxTotalJsGzipBytes],
  ['largest static asset (raw)', largestStatic?.bytes ?? 0, budget.maxStaticAssetRawBytes],
] as const;

let failed = false;
for (const [name, actual, limit] of checks) {
  const passed = actual <= limit;
  failed ||= !passed;
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}: ${formatKiB(actual)} / ${formatKiB(limit)}`);
}

if (largestJs) console.log(`Largest JS: ${largestJs.file}`);
if (largestStatic) console.log(`Largest static asset: ${largestStatic.file.slice(distRoot.length + 1)}`);
if (failed) process.exitCode = 1;
