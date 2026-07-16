export type Bump = 'none' | 'patch' | 'minor' | 'major';

export interface WorkspacePackage {
  readonly name: string;
  readonly internalDependencies: readonly string[];
}

const priority: Readonly<Record<Bump, number>> = { none: 0, patch: 1, minor: 2, major: 3 };

function maxBump(left: Bump, right: Bump): Bump {
  return priority[left] >= priority[right] ? left : right;
}

export function buildReleasePlan(
  packages: readonly WorkspacePackage[],
  requested: Readonly<Record<string, Bump>>,
): Readonly<Record<string, Bump>> {
  const names = new Set(packages.map(({ name }) => name));
  if (names.size !== packages.length) throw new TypeError('Duplicate package name');
  const plan: Record<string, Bump> = {};
  for (const pkg of packages) {
    plan[pkg.name] = requested[pkg.name] ?? 'none';
    for (const dependency of pkg.internalDependencies) {
      if (!names.has(dependency)) throw new TypeError(`${pkg.name} depends on unknown ${dependency}`);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const pkg of packages) {
      const dependencyChanged = pkg.internalDependencies.some((name) => plan[name] !== undefined && plan[name] !== 'none');
      if (dependencyChanged) {
        const current = plan[pkg.name];
        if (current === undefined) throw new TypeError(`Missing release state for ${pkg.name}`);
        const next = maxBump(current, 'patch');
        if (next !== current) {
          plan[pkg.name] = next;
          changed = true;
        }
      }
    }
  }
  return plan;
}

export function bumpVersion(version: string, bump: Exclude<Bump, 'none'>): string {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.exec(version);
  if (!match) throw new TypeError('Only stable x.y.z versions are supported');
  const [, majorText, minorText, patchText] = match;
  const major = Number(majorText); const minor = Number(minorText); const patch = Number(patchText);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}
