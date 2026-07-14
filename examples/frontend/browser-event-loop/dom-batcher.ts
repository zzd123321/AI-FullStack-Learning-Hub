type Operation = () => void;

export interface DomBatcher {
  measure(operation: Operation): void;
  mutate(operation: Operation): void;
  cancel(): void;
}

export function createDomBatcher(): DomBatcher {
  let reads: Operation[] = [];
  let writes: Operation[] = [];
  let frameId: number | null = null;

  const flush = () => {
    frameId = null;
    const currentReads = reads;
    const currentWrites = writes;
    reads = [];
    writes = [];

    currentReads.forEach((read) => read());
    currentWrites.forEach((write) => write());

    if (reads.length > 0 || writes.length > 0) schedule();
  };

  const schedule = () => {
    frameId ??= requestAnimationFrame(flush);
  };

  return {
    measure(operation) {
      reads.push(operation);
      schedule();
    },
    mutate(operation) {
      writes.push(operation);
      schedule();
    },
    cancel() {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
      reads = [];
      writes = [];
    },
  };
}
