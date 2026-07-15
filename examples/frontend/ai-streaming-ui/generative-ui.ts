export type GeneratedBlock =
  | { readonly type: 'paragraph'; readonly text: string }
  | { readonly type: 'course-card'; readonly courseId: string; readonly title: string }
  | { readonly type: 'comparison'; readonly columns: readonly string[]; readonly rows: readonly (readonly string[])[] };

export interface ComponentRegistryEntry<T extends GeneratedBlock> {
  readonly render: (block: T) => HTMLElement;
}
export function assertGeneratedBlock(value: unknown): asserts value is GeneratedBlock {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    throw new TypeError('Generated block must be an object with a type');
  }
  const type = (value as { type: unknown }).type;
  if (!['paragraph', 'course-card', 'comparison'].includes(String(type))) {
    throw new TypeError('Generated block type is not allowlisted');
  }
}

export function renderGeneratedBlock(
  block: GeneratedBlock,
  registry: { [K in GeneratedBlock['type']]: ComponentRegistryEntry<Extract<GeneratedBlock, { type: K }>> },
): HTMLElement {
  const entry = registry[block.type] as ComponentRegistryEntry<GeneratedBlock>;
  return entry.render(block);
}
