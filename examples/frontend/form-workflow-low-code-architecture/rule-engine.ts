export type Scalar = string | number | boolean | null;
export type Rule =
  | { readonly op: 'eq'; readonly field: string; readonly value: Scalar }
  | { readonly op: 'in'; readonly field: string; readonly values: readonly Scalar[] }
  | { readonly op: 'and' | 'or'; readonly rules: readonly Rule[] }
  | { readonly op: 'not'; readonly rule: Rule };

export function evaluateRule(
  rule: Rule,
  data: Readonly<Record<string, Scalar>>,
  maxNodes = 1_000,
): boolean {
  let remaining = maxNodes;
  const visit = (node: Rule): boolean => {
    if (--remaining < 0) throw new RangeError('Rule evaluation budget exceeded');
    switch (node.op) {
      case 'eq': return data[node.field] === node.value;
      case 'in': {
        const current = data[node.field];
        return current !== undefined && node.values.includes(current);
      }
      case 'and': return node.rules.every(visit);
      case 'or': return node.rules.some(visit);
      case 'not': return !visit(node.rule);
    }
  };
  return visit(rule);
}

export function collectDependencies(rule: Rule, maxNodes = 1_000): ReadonlySet<string> {
  const output = new Set<string>();
  let remaining = maxNodes;
  const visit = (node: Rule): void => {
    if (--remaining < 0) throw new RangeError('Rule traversal budget exceeded');
    if (node.op === 'eq' || node.op === 'in') output.add(node.field);
    else if (node.op === 'not') visit(node.rule);
    else node.rules.forEach(visit);
  };
  visit(rule);
  return output;
}
