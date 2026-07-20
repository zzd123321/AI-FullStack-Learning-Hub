export interface PresenceRecord {
  readonly clientId: string;
  readonly displayName: string;
  readonly cursor: { readonly x: number; readonly y: number } | null;
  readonly presenceVersion: number;
  readonly expiresAt: number;
}
export class PresenceStore {
  readonly #records = new Map<string, PresenceRecord>();

  update(record: PresenceRecord): void {
    if (
      !record.clientId ||
      !Number.isSafeInteger(record.presenceVersion) ||
      record.presenceVersion < 0 ||
      !Number.isFinite(record.expiresAt) ||
      (record.cursor !== null &&
        (!Number.isFinite(record.cursor.x) || !Number.isFinite(record.cursor.y)))
    ) throw new TypeError('Invalid presence record');
    const previous = this.#records.get(record.clientId);
    if (!previous || record.presenceVersion > previous.presenceVersion) {
      this.#records.set(record.clientId, record);
    }
  }

  activeAt(now: number): readonly PresenceRecord[] {
    if (!Number.isFinite(now)) throw new TypeError('now must be finite');
    const active: PresenceRecord[] = [];
    for (const [clientId, record] of this.#records) {
      if (record.expiresAt <= now) this.#records.delete(clientId);
      else active.push(record);
    }
    return active.sort((left, right) => left.clientId.localeCompare(right.clientId));
  }
}
