export interface FrameLoop {
  start(): void;
  stop(): void;
  readonly running: boolean;
}

export function createFrameLoop(update: (elapsedMs: number) => void): FrameLoop {
  let requestId: number | null = null;
  let previousTimestamp: number | null = null;

  const tick = (timestamp: number) => {
    if (requestId === null) return;
    const elapsed = previousTimestamp === null ? 0 : Math.min(timestamp - previousTimestamp, 100);
    previousTimestamp = timestamp;
    update(elapsed);
    requestId = requestAnimationFrame(tick);
  };

  return {
    get running() {
      return requestId !== null;
    },
    start() {
      if (requestId !== null) return;
      previousTimestamp = null;
      requestId = requestAnimationFrame(tick);
    },
    stop() {
      if (requestId === null) return;
      cancelAnimationFrame(requestId);
      requestId = null;
      previousTimestamp = null;
    },
  };
}
