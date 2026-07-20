export function createStreamingAnnouncer(region: HTMLElement, intervalMs = 1_000): {
  update(text: string): void;
  complete(text: string): void;
  dispose(): void;
} {
  if (!Number.isFinite(intervalMs) || intervalMs < 250) {
    throw new RangeError('intervalMs must be at least 250 milliseconds');
  }
  let latest = '';
  let disposed = false;
  const timer = window.setInterval(() => {
    if (!disposed && latest) {
      region.textContent = latest;
      latest = '';
    }
  }, intervalMs);
  return {
    // Pass short status messages here, never the growing answer body.
    update: (text) => { if (!disposed) latest = text; },
    complete: (text) => {
      if (!disposed) {
        latest = '';
        region.textContent = text;
      }
    },
    dispose: () => {
      disposed = true;
      latest = '';
      window.clearInterval(timer);
    },
  };
}
