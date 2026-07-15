export function createStreamingAnnouncer(region: HTMLElement, intervalMs = 1_000): {
  update(text: string): void;
  complete(text: string): void;
  dispose(): void;
} {
  let latest = '';
  const timer = window.setInterval(() => {
    if (latest) {
      region.textContent = latest;
      latest = '';
    }
  }, intervalMs);
  return {
    update: (text) => { latest = text; },
    complete: (text) => { latest = ''; region.textContent = text; },
    dispose: () => window.clearInterval(timer),
  };
}
