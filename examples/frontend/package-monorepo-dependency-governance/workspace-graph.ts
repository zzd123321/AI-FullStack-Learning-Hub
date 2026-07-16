export interface WorkspaceTask {
  readonly id: string;
  readonly dependencies: readonly string[];
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
}

export function topologicalOrder(tasks: readonly WorkspaceTask[]): readonly string[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  if (byId.size !== tasks.length) throw new TypeError('Duplicate task ID');
  const state = new Map<string, 'visiting' | 'visited'>();
  const result: string[] = [];

  const visit = (id: string, path: readonly string[]): void => {
    if (state.get(id) === 'visited') return;
    if (state.get(id) === 'visiting') throw new TypeError(`Task cycle: ${[...path, id].join(' -> ')}`);
    const task = byId.get(id);
    if (!task) throw new TypeError(`Unknown task dependency: ${id}`);
    state.set(id, 'visiting');
    for (const dependency of task.dependencies) visit(dependency, [...path, id]);
    state.set(id, 'visited');
    result.push(id);
  };

  for (const task of tasks) visit(task.id, []);
  return result;
}

export function cacheKeyMaterial(task: WorkspaceTask, dependencyKeys: Readonly<Record<string, string>>): string {
  const dependencies = task.dependencies.map((id) => {
    const key = dependencyKeys[id];
    if (!key) throw new TypeError(`Missing cache key for dependency: ${id}`);
    return [id, key] as const;
  });
  return JSON.stringify({ id: task.id, inputs: [...task.inputs].sort(),
    outputs: [...task.outputs].sort(), dependencies });
}
