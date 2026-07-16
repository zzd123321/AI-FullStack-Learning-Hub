export type FieldKind = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox';

export interface FieldDefinition {
  readonly id: string;
  readonly kind: FieldKind;
  readonly labelKey: string;
  readonly helpKey?: string;
  readonly required?: boolean;
  readonly options?: readonly { readonly value: string; readonly labelKey: string }[];
}

export interface FormDefinition {
  readonly schemaVersion: string;
  readonly fields: readonly FieldDefinition[];
}

const FIELD_KINDS: ReadonlySet<string> = new Set([
  'text', 'textarea', 'number', 'date', 'select', 'checkbox',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function assertFormDefinition(value: unknown): asserts value is FormDefinition {
  if (!isRecord(value) || typeof value.schemaVersion !== 'string'
    || !/^[a-zA-Z0-9._-]{1,80}$/.test(value.schemaVersion) || !Array.isArray(value.fields)
    || value.fields.length > 500) throw new TypeError('Invalid form definition');

  const ids = new Set<string>();
  for (const rawField of value.fields) {
    if (!isRecord(rawField) || typeof rawField.id !== 'string'
      || !/^[a-z][a-zA-Z0-9_]{0,79}$/.test(rawField.id)
      || typeof rawField.kind !== 'string' || !FIELD_KINDS.has(rawField.kind)
      || typeof rawField.labelKey !== 'string' || rawField.labelKey.length > 160
      || (rawField.helpKey !== undefined && typeof rawField.helpKey !== 'string')
      || (rawField.required !== undefined && typeof rawField.required !== 'boolean')) {
      throw new TypeError('Invalid field');
    }
    if (ids.has(rawField.id)) throw new TypeError(`Duplicate field: ${rawField.id}`);
    if (rawField.kind === 'select' && (!Array.isArray(rawField.options) || rawField.options.length === 0)) {
      throw new TypeError(`Select field requires options: ${rawField.id}`);
    }
    if (Array.isArray(rawField.options) && (rawField.options.length > 500
      || rawField.options.some((option) => !isRecord(option)
        || typeof option.value !== 'string' || typeof option.labelKey !== 'string'))) {
      throw new TypeError(`Invalid options: ${rawField.id}`);
    }
    ids.add(rawField.id);
  }
}
