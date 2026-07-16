import type { ComputeRequest, ComputeResponse } from './task-protocol.js';

export class ComputeWorkerClient {
  readonly #pending = new Map<string, { resolve(value: number): void; reject(error: Error): void }>();

  constructor(readonly worker: Worker) {
    worker.addEventListener('message', (event: MessageEvent<ComputeResponse>) => {
      const pending = this.#pending.get(event.data.id);
      if (!pending) return;
      this.#pending.delete(event.data.id);
      event.data.ok ? pending.resolve(event.data.result) : pending.reject(new Error(event.data.error));
    });
  }

  sum(values: Float64Array, signal: AbortSignal, timeoutMs = 30_000): Promise<number> {
    if (signal.aborted) return Promise.reject(signal.reason);
    const id = crypto.randomUUID();
    const request: ComputeRequest = { version: 1, id, type: 'sum', values };
    return new Promise((resolve, reject) => {
      const abort = () => this.worker.postMessage({ version: 1, id: crypto.randomUUID(), type: 'cancel', targetId: id } satisfies ComputeRequest);
      const timer = window.setTimeout(() => {
        this.#pending.delete(id);
        signal.removeEventListener('abort', abort);
        abort();
        reject(new Error('Worker task timed out'));
      }, timeoutMs);
      signal.addEventListener('abort', abort, { once: true });
      this.#pending.set(id, {
        resolve: (value) => { clearTimeout(timer); signal.removeEventListener('abort', abort); resolve(value); },
        reject: (error) => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(error); },
      });
      this.worker.postMessage(request, [values.buffer]);
    });
  }

  dispose(): void {
    this.worker.terminate();
    for (const pending of this.#pending.values()) pending.reject(new Error('Worker terminated'));
    this.#pending.clear();
  }
}
