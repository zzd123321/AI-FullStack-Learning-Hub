export type FacetSelection = ReadonlyMap<string, ReadonlySet<string>>;

export function toggleFacet(
  selection: FacetSelection,
  facet: string,
  value: string,
): FacetSelection {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(facet) || value.length > 200) {
    throw new TypeError('Invalid facet selection');
  }
  const nextValues = new Set(selection.get(facet) ?? []);
  if (nextValues.has(value)) nextValues.delete(value);
  else nextValues.add(value);
  const next = new Map(selection);
  if (nextValues.size === 0) next.delete(facet);
  else next.set(facet, nextValues);
  return next;
}

export const selectedFacetCount = (selection: FacetSelection): number => {
  let count = 0;
  selection.forEach((values) => { count += values.size; });
  return count;
};
