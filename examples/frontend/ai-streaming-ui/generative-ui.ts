export type GeneratedBlock =
  | { readonly type: 'paragraph'; readonly text: string }
  | { readonly type: 'course-card'; readonly courseId: string; readonly title: string }
  | { readonly type: 'comparison'; readonly columns: readonly string[]; readonly rows: readonly (readonly string[])[] };

export interface ComponentRegistryEntry<T extends GeneratedBlock> {
  readonly render: (block: T) => HTMLElement;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, maximum = 200): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

export function assertGeneratedBlock(value: unknown): asserts value is GeneratedBlock {
  if (!isRecord(value)) throw new TypeError('Generated block must be an object');

  switch (value.type) {
    case 'paragraph':
      if (!isBoundedString(value.text, 4_000)) throw new TypeError('Invalid paragraph');
      return;
    case 'course-card':
      if (!isBoundedString(value.courseId) || !isBoundedString(value.title)) {
        throw new TypeError('Invalid course card');
      }
      return;
    case 'comparison': {
      if (!Array.isArray(value.columns) || value.columns.length === 0 || value.columns.length > 8) {
        throw new TypeError('Invalid comparison columns');
      }
      if (!value.columns.every((cell) => isBoundedString(cell))) throw new TypeError('Invalid column label');
      if (!Array.isArray(value.rows) || value.rows.length > 100) throw new TypeError('Invalid comparison rows');
      const width = value.columns.length;
      if (!value.rows.every((row) => (
        Array.isArray(row)
        && row.length === width
        && row.every((cell) => isBoundedString(cell, 1_000))
      ))) throw new TypeError('Invalid comparison cell');
      return;
    }
    default:
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
