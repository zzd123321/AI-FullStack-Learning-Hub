export interface PresenceRecord {
  readonly clientId: string;
  readonly displayName: string;
  readonly cursor: { readonly x: number; readonly y: number } | null;
  readonly expiresAt: number;
}
export class PresenceStore {
  readonly #records = new Map<string, PresenceRecord>();

  update(record: PresenceRecord): void {
    const previous = this.#records.get(record.clientId);
    if (!previous || record.expiresAt >= previous.expiresAt) {
      this.#records.set(record.clientId, record);
    }
  }

  activeAt(now: number): readonly PresenceRecord[] {
    const active: PresenceRecord[] = [];
    for (const [clientId, record] of this.#records) {
      if (record.expiresAt <= now) this.#records.delete(clientId);
      else active.push(record);
    }
    return active.sort((left, right) => left.clientId.localeCompare(right.clientId));
  }
}
