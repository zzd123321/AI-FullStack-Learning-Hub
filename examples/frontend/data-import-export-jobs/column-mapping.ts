export interface TargetField {
  readonly id: string;
  readonly label: string;
  readonly required: boolean;
  readonly aliases: readonly string[];
}

export interface ColumnMapping {
  readonly sourceColumn: string;
  readonly targetFieldId: string;
}

export interface MappingSuggestions {
  readonly mappings: readonly ColumnMapping[];
  readonly duplicateSourceColumns: readonly string[];
}

const normalizeHeader = (value: string): string =>
  value.normalize('NFKC').trim().toLocaleLowerCase('en-US');

export function suggestMappings(
  sourceColumns: readonly string[],
  fields: readonly TargetField[],
): MappingSuggestions {
  const claimedTargets = new Set<string>();
  const seenHeaders = new Set<string>();
  const mappings: ColumnMapping[] = [];
  const duplicateSourceColumns: string[] = [];
  for (const sourceColumn of sourceColumns) {
    const normalized = normalizeHeader(sourceColumn);
    if (seenHeaders.has(normalized)) {
      duplicateSourceColumns.push(sourceColumn);
      continue;
    }
    seenHeaders.add(normalized);
    const target = fields.find((field) => !claimedTargets.has(field.id)
      && [field.label, ...field.aliases].some((name) => normalizeHeader(name) === normalized));
    if (target) {
      mappings.push({ sourceColumn, targetFieldId: target.id });
      claimedTargets.add(target.id);
    }
  }
  return { mappings, duplicateSourceColumns };
}

export function missingRequiredFields(
  mappings: readonly ColumnMapping[],
  fields: readonly TargetField[],
): readonly string[] {
  const mapped = new Set(mappings.map(({ targetFieldId }) => targetFieldId));
  return fields.filter(({ id, required }) => required && !mapped.has(id)).map(({ id }) => id);
}
