import {
  parseBridgeRequest,
  parseBridgeResponse,
  type BridgeErrorCode,
  type BridgeRequest,
} from './bridge-protocol.js';

export interface BridgeTransport {
  send(request: BridgeRequest): void;
  // Native input crosses a trust boundary, so the transport emits unknown.
  subscribe(listener: (response: unknown) => void): () => void;
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
  stopAbort(): void;
}

export class BridgeClientError extends Error {
  constructor(readonly code: BridgeErrorCode | 'TIMEOUT' | 'ABORTED' | 'DISPOSED', message: string) {
    super(message);
    this.name = 'BridgeClientError';
  }
}

export class BridgeClient {
  readonly #pending = new Map<string, PendingRequest>();
  readonly #unsubscribe: () => void;
  #disposed = false;

  constructor(readonly transport: BridgeTransport) {
    this.#unsubscribe = transport.subscribe((rawResponse) => {
      const response = parseBridgeResponse(rawResponse);
      if (!response) return; // Invalid native messages never reach application code.

      const pending = this.#takePending(response.id);
      if (!pending) return; // Ignore duplicate or late responses after timeout.

      if (response.ok) pending.resolve(response.result);
      else pending.reject(new BridgeClientError(response.error.code, response.error.message));
    });
  }

  request(
    rawRequest: BridgeRequest,
    options: { readonly timeoutMs?: number; readonly signal?: AbortSignal } = {},
  ): Promise<unknown> {
    if (this.#disposed) {
      return Promise.reject(new BridgeClientError('DISPOSED', 'Native bridge has been disposed'));
    }

    // TypeScript types disappear at runtime. Re-parse requests because callers
    // can still supply data from JSON, `any`, or a compromised renderer.
    const request = parseBridgeRequest(rawRequest);
    if (!request) return Promise.reject(new Error('Invalid bridge request'));
    if (this.#pending.has(request.id)) return Promise.reject(new Error('Duplicate bridge request ID'));

    const timeoutMs = options.timeoutMs ?? 10_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) {
      return Promise.reject(new RangeError('timeoutMs must be between 1 and 60000 milliseconds'));
    }
    if (options.signal?.aborted) {
      return Promise.reject(new BridgeClientError('ABORTED', 'Native bridge request was aborted'));
    }

    return new Promise((resolve, reject) => {
      const abort = () => {
        const pending = this.#takePending(request.id);
        pending?.reject(new BridgeClientError('ABORTED', 'Native bridge request was aborted'));
      };
      options.signal?.addEventListener('abort', abort, { once: true });

      const timer = setTimeout(() => {
        const pending = this.#takePending(request.id);
        pending?.reject(new BridgeClientError('TIMEOUT', 'Native bridge timed out'));
      }, timeoutMs);

      this.#pending.set(request.id, {
        resolve,
        reject,
        timer,
        stopAbort: () => options.signal?.removeEventListener('abort', abort),
      });

      try {
        // Register pending state before send(): some test/native transports may
        // reply synchronously even though production bridges should be async.
        this.transport.send(request);
      } catch (error) {
        const pending = this.#takePending(request.id);
        pending?.reject(error instanceof Error ? error : new Error('Native bridge send failed'));
      }
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    try {
      this.#unsubscribe();
    } finally {
      // Listener cleanup must not prevent pending promises from settling.
      for (const id of [...this.#pending.keys()]) {
        this.#takePending(id)?.reject(new BridgeClientError('DISPOSED', 'Native bridge disposed'));
      }
    }
  }

  #takePending(id: string): PendingRequest | null {
    const pending = this.#pending.get(id);
    if (!pending) return null;
    this.#pending.delete(id);
    clearTimeout(pending.timer);
    pending.stopAbort();
    return pending;
  }
}
