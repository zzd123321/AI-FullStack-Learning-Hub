export interface ManagedSignal {
  readonly signal: AbortSignal;
  dispose(): void;
}

export function createRequestSignal(parent: AbortSignal | undefined, timeoutMs: number): ManagedSignal {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new RangeError("timeoutMs must be a non-negative finite number");
  }
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parent?.reason);
  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, "TimeoutError"));
  }, timeoutMs);

  if (parent?.aborted) abortFromParent();
  else parent?.addEventListener("abort", abortFromParent, { once: true });

  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timeoutId);
      parent?.removeEventListener("abort", abortFromParent);
    },
  };
}
