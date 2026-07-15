export class RingBuffer<T> {
  readonly capacity: number;
  readonly #items: Array<T | undefined>;
  #start = 0;
  #size = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError('capacity must be a positive integer');
    }
    this.capacity = capacity;
    this.#items = new Array<T | undefined>(capacity);
  }

  push(item: T): void {
    const writeIndex = (this.#start + this.#size) % this.capacity;
    this.#items[writeIndex] = item;
    if (this.#size < this.capacity) this.#size += 1;
    else this.#start = (this.#start + 1) % this.capacity;
  }

  snapshot(): readonly T[] {
    return Array.from(
      { length: this.#size },
      (_, index) => this.#items[(this.#start + index) % this.capacity] as T,
    );
  }
}

export function createFrameScheduler(render: () => void): () => void {
  let frameId: number | null = null;
  return () => {
    if (frameId !== null) return;
    frameId = requestAnimationFrame(() => {
      frameId = null;
      render();
    });
  };
}
