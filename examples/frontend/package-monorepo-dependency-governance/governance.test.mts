import assert from 'node:assert/strict';
import { validateManifest } from './dependency-policy.ts';
import { buildReleasePlan, bumpVersion } from './release-plan.ts';
import { cacheKeyMaterial, topologicalOrder } from './workspace-graph.ts';

assert.deepEqual(validateManifest({ name: '@learning/ui', license: 'MIT', exports: { '.': './dist.js' },
  files: ['dist'], peerDependencies: { vue: '^3.5.0' }, devDependencies: { vue: '^3.5.0' } },
{ publicPackage: true, forbiddenRuntimePackages: new Set(['typescript']) }), []);
assert.deepEqual(validateManifest({ name: 'app', dependencies: { typescript: 'latest' } },
{ publicPackage: false, forbiddenRuntimePackages: new Set(['typescript']) }), [
  'typescript uses a non-reproducible or unbounded range: latest', 'typescript is forbidden at runtime',
]);

const tasks = [
  { id: 'types', dependencies: [], inputs: ['src/**'], outputs: ['dist/types/**'] },
  { id: 'build', dependencies: ['types'], inputs: ['src/**'], outputs: ['dist/**'] },
  { id: 'test', dependencies: ['build'], inputs: ['test/**'], outputs: ['coverage/**'] },
] as const;
assert.deepEqual(topologicalOrder(tasks), ['types', 'build', 'test']);
assert.throws(() => topologicalOrder([
  { id: 'a', dependencies: ['b'], inputs: [], outputs: [] },
  { id: 'b', dependencies: ['a'], inputs: [], outputs: [] },
]), /Task cycle/u);
assert.match(cacheKeyMaterial(tasks[1], { types: 'sha256:abc' }), /sha256:abc/u);
assert.throws(() => cacheKeyMaterial(tasks[1], {}), /Missing cache key/u);

assert.deepEqual(buildReleasePlan([
  { name: '@learning/tokens', internalDependencies: [] },
  { name: '@learning/ui', internalDependencies: ['@learning/tokens'] },
  { name: '@learning/app', internalDependencies: ['@learning/ui'] },
], { '@learning/tokens': 'minor' }), {
  '@learning/tokens': 'minor', '@learning/ui': 'patch', '@learning/app': 'patch',
});
assert.equal(bumpVersion('1.4.9', 'minor'), '1.5.0');

console.log('package and monorepo governance examples passed');
