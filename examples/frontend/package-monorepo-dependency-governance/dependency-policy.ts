export interface PackageManifest {
  readonly name?: string;
  readonly private?: boolean;
  readonly license?: string;
  readonly exports?: unknown;
  readonly files?: readonly string[];
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
}

export interface DependencyPolicy {
  readonly publicPackage: boolean;
  readonly forbiddenRuntimePackages: ReadonlySet<string>;
}

const unsafeRange = (range: string): boolean =>
  range === '*' || range === 'latest' || /^(git\+|https?:|file:)/u.test(range);

export function validateManifest(manifest: PackageManifest, policy: DependencyPolicy): readonly string[] {
  const errors: string[] = [];
  if (!manifest.name || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(manifest.name)) {
    errors.push('package name is missing or invalid');
  }
  if (policy.publicPackage) {
    if (manifest.private) errors.push('a public package cannot be private');
    if (!manifest.license) errors.push('a public package needs a license');
    if (!manifest.exports) errors.push('a public package needs explicit exports');
    if (!manifest.files?.length) errors.push('a public package needs an explicit files allowlist');
  }

  const runtime = manifest.dependencies ?? {};
  const development = manifest.devDependencies ?? {};
  const peers = manifest.peerDependencies ?? {};
  for (const group of [runtime, development, peers]) {
    for (const [name, range] of Object.entries(group)) {
      if (unsafeRange(range)) errors.push(`${name} uses a non-reproducible or unbounded range: ${range}`);
    }
  }
  for (const name of Object.keys(runtime)) {
    if (name in development) errors.push(`${name} is duplicated in dependencies and devDependencies`);
    if (name in peers) errors.push(`${name} is duplicated in dependencies and peerDependencies`);
    if (policy.forbiddenRuntimePackages.has(name)) errors.push(`${name} is forbidden at runtime`);
  }
  return errors;
}
