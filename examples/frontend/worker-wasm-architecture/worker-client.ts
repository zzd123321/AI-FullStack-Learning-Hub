import {
  parseComputeRequest,
  parseComputeResponse,
  type ComputeRequest,
} from './task-protocol.js';

export interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  addEventListener(type: 'error' | 'messageerror', listener: (event: Event) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: 'error' | 'messageerror', listener: (event: Event) => void): void;
}

interface PendingTask {
  resolve(value: number): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
  stopAbort(): void;
}

export class ComputeWorkerClient {
  readonly #pending = new Map<string, PendingTask>();
  readonly #inFlight = new Set<string>();
  readonly #cancellationDeadlines = new Map<string, ReturnType<typeof setTimeout>>();
  #disposed = false;

  constructor(readonly worker: WorkerLike) {
    worker.addEventListener('message', this.#message);
    worker.addEventListener('error', this.#workerFailed);
    worker.addEventListener('messageerror', this.#workerFailed);
  }

  // The name makes the ownership contract visible: after a successful
  // postMessage(), values.buffer is detached in the calling realm.
  sumTransferred(
    values: Float64Array,
    options: { readonly signal?: AbortSignal; readonly timeoutMs?: number } = {},
  ): Promise<number> {
    if (this.#disposed) return Promise.reject(new Error('Worker client is disposed'));
    // One compute task per worker avoids pretending that interleaved async
    // functions are parallel on the same worker event loop.
    if (this.#inFlight.size >= 1) return Promise.reject(new Error('Worker is busy'));
    if (options.signal?.aborted) return Promise.reject(new DOMException('Task cancelled', 'AbortError'));

    const timeoutMs = options.timeoutMs ?? 30_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) {
      return Promise.reject(new RangeError('timeoutMs must be between 1 and 60000 milliseconds'));
    }

    const id = crypto.randomUUID();
    const buffer = values.buffer;
    if (!(buffer instanceof ArrayBuffer)) {
      return Promise.reject(new TypeError('SharedArrayBuffer requires a shared-memory protocol'));
    }
    const request = parseComputeRequest({ version: 1, id, type: 'sum', values });
    if (!request || request.type !== 'sum') return Promise.reject(new RangeError('Invalid sum input'));

    return new Promise((resolve, reject) => {
      const cancelWorkerTask = () => {
        const cancel: ComputeRequest = {
          version: 1,
          id: crypto.randomUUID(),
          type: 'cancel',
          targetId: id,
        };
        try { this.worker.postMessage(cancel); } catch { /* worker may already be gone */ }
      };
      const abort = () => {
        const pending = this.#take(id);
        if (!pending) return;
        cancelWorkerTask();
        this.#armCancellationDeadline(id);
        pending.reject(new DOMException('Task cancelled', 'AbortError'));
      };
      options.signal?.addEventListener('abort', abort, { once: true });

      const timer = setTimeout(() => {
        const pending = this.#take(id);
        if (!pending) return;
        pending.reject(new Error('Worker task timed out'));
        // A deadline means this worker can no longer be trusted to make timely
        // progress. Termination is deterministic and safe because it owns one
        // compute task; a pool can replace this worker with a fresh instance.
        this.#shutdown(new Error('Worker exceeded its deadline'));
      }, timeoutMs);

      this.#pending.set(id, {
        resolve,
        reject,
        timer,
        stopAbort: () => options.signal?.removeEventListener('abort', abort),
      });
      this.#inFlight.add(id);

      try {
        this.worker.postMessage(request, [buffer]);
      } catch (error) {
        this.#inFlight.delete(id);
        this.#take(id)?.reject(error instanceof Error ? error : new Error('Worker postMessage failed'));
      }
    });
  }

  dispose(): void {
    this.#shutdown(new Error('Worker terminated'));
  }

  readonly #message = (event: MessageEvent<unknown>) => {
    const response = parseComputeResponse(event.data);
    if (!response) return; // malformed or incompatible response fails closed
    this.#inFlight.delete(response.id);
    this.#clearCancellationDeadline(response.id);
    const pending = this.#take(response.id);
    if (!pending) return; // response arrived after cancel/timeout
    response.ok ? pending.resolve(response.result) : pending.reject(new Error(response.error));
  };

  readonly #workerFailed = () => {
    this.#shutdown(new Error('Worker crashed or message deserialization failed'));
  };

  #shutdown(error: Error): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.worker.removeEventListener('message', this.#message);
    this.worker.removeEventListener('error', this.#workerFailed);
    this.worker.removeEventListener('messageerror', this.#workerFailed);
    this.worker.terminate();
    this.#rejectAll(error);
    this.#inFlight.clear();
    for (const timer of this.#cancellationDeadlines.values()) clearTimeout(timer);
    this.#cancellationDeadlines.clear();
  }

  #take(id: string): PendingTask | null {
    const pending = this.#pending.get(id);
    if (!pending) return null;
    this.#pending.delete(id);
    clearTimeout(pending.timer);
    pending.stopAbort();
    return pending;
  }

  #rejectAll(error: Error): void {
    for (const id of [...this.#pending.keys()]) this.#take(id)?.reject(error);
  }

  #armCancellationDeadline(id: string): void {
    this.#clearCancellationDeadline(id);
    this.#cancellationDeadlines.set(id, setTimeout(() => {
      if (this.#inFlight.has(id)) {
        this.#shutdown(new Error('Worker did not acknowledge cancellation'));
      }
    }, 5_000));
  }

  #clearCancellationDeadline(id: string): void {
    const timer = this.#cancellationDeadlines.get(id);
    if (timer !== undefined) clearTimeout(timer);
    this.#cancellationDeadlines.delete(id);
  }
}
