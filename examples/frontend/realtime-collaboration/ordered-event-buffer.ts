export interface SequencedEvent {
  readonly streamSequence: number;
}

export type PushResult<T> =
  | { readonly type: 'duplicate'; readonly event: T }
  | { readonly type: 'buffered'; readonly missingFrom: number; readonly event: T }
  | { readonly type: 'applied'; readonly events: readonly T[] };

export class OrderedEventBuffer<T extends SequencedEvent> {
  readonly maxBufferedEvents: number;
  readonly #pending = new Map<number, T>();
  #nextSequence: number;

  constructor(lastAppliedSequence: number, maxBufferedEvents = 1_000) {
    this.maxBufferedEvents = maxBufferedEvents;
    this.#nextSequence = lastAppliedSequence + 1;
  }

  push(event: T): PushResult<T> {
    if (event.streamSequence < this.#nextSequence || this.#pending.has(event.streamSequence)) {
      return { type: 'duplicate', event };
    }
    if (event.streamSequence > this.#nextSequence) {
      if (this.#pending.size >= this.maxBufferedEvents) {
        throw new RangeError('Realtime event gap exceeded the buffer budget; request a snapshot');
      }
      this.#pending.set(event.streamSequence, event);
      return { type: 'buffered', missingFrom: this.#nextSequence, event };
    }

    const applied: T[] = [event];
    this.#nextSequence += 1;
    while (this.#pending.has(this.#nextSequence)) {
      applied.push(this.#pending.get(this.#nextSequence)!);
      this.#pending.delete(this.#nextSequence);
      this.#nextSequence += 1;
    }
    return { type: 'applied', events: applied };
  }

  reset(lastAppliedSequence: number): void {
    this.#pending.clear();
    this.#nextSequence = lastAppliedSequence + 1;
  }
}
