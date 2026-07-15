import type { UploadPart } from './types.js';

export class ProgressLedger {
  readonly #sizes = new Map<number, number>();
  readonly #loaded = new Map<number, number>();
  readonly #completed = new Set<number>();

  constructor(parts: readonly UploadPart[], completedPartNumbers: ReadonlySet<number>) {
    parts.forEach((part) => {
      this.#sizes.set(part.partNumber, part.size);
      if (completedPartNumbers.has(part.partNumber)) {
        this.#loaded.set(part.partNumber, part.size);
        this.#completed.add(part.partNumber);
      }
    });
  }

  beginAttempt(partNumber: number): void {
    if (!this.#completed.has(partNumber)) this.#loaded.set(partNumber, 0);
  }

  update(partNumber: number, loadedBytes: number): number {
    if (!this.#completed.has(partNumber)) {
      const size = this.#sizes.get(partNumber);
      if (size === undefined) throw new RangeError('Unknown part');
      this.#loaded.set(partNumber, Math.max(0, Math.min(size, loadedBytes)));
    }
    return this.total;
  }

  complete(partNumber: number): number {
    const size = this.#sizes.get(partNumber);
    if (size === undefined) throw new RangeError('Unknown part');
    this.#loaded.set(partNumber, size);
    this.#completed.add(partNumber);
    return this.total;
  }

  get total(): number {
    return [...this.#loaded.values()].reduce((sum, bytes) => sum + bytes, 0);
  }
}
