export interface DraftEnvelope<T extends object> {
  readonly documentId: string;
  readonly schemaVersion: string;
  readonly baseVersion: number;
  readonly savedAt: number;
  readonly data: T;
}

export function encodeDraft<T extends object>(draft: DraftEnvelope<T>): string {
  return JSON.stringify(draft);
}

export function decodeDraft<T extends object>(
  raw: string,
  expectedDocumentId: string,
  migrate: (
    schemaVersion: string,
    data: unknown,
  ) => { readonly schemaVersion: string; readonly data: T } | null,
): DraftEnvelope<T> | null {
  try {
    const value = JSON.parse(raw) as Partial<DraftEnvelope<unknown & object>>;
    if (value.documentId !== expectedDocumentId || typeof value.schemaVersion !== 'string'
      || typeof value.baseVersion !== 'number' || !Number.isInteger(value.baseVersion)
      || value.baseVersion < 0 || typeof value.savedAt !== 'number'
      || !Number.isFinite(value.savedAt) || value.savedAt < 0) return null;
    const migrated = migrate(value.schemaVersion, value.data);
    return migrated ? {
      documentId: value.documentId,
      schemaVersion: migrated.schemaVersion,
      baseVersion: value.baseVersion,
      savedAt: value.savedAt,
      data: migrated.data,
    } : null;
  } catch {
    return null;
  }
}
