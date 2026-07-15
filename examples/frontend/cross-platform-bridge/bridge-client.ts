import type { BridgeRequest, BridgeResponse } from './bridge-protocol.js';

export interface BridgeTransport {
  send(request: BridgeRequest): void;
  subscribe(listener: (response: BridgeResponse) => void): () => void;
}

export class BridgeClient {
  readonly #pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void; timer: number }>();
  readonly #unsubscribe: () => void;

  constructor(readonly transport: BridgeTransport) {
    this.#unsubscribe = transport.subscribe((response) => {
      const pending = this.#pending.get(response.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.#pending.delete(response.id);
      if (response.ok) pending.resolve(response.result);
      else pending.reject(Object.assign(new Error(response.error.message), { code: response.error.code }));
    });
  }

  request(request: BridgeRequest, timeoutMs = 10_000): Promise<unknown> {
    if (this.#pending.has(request.id)) return Promise.reject(new Error('Duplicate bridge request ID'));
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.#pending.delete(request.id);
        reject(new Error('Native bridge timed out'));
      }, timeoutMs);
      this.#pending.set(request.id, { resolve, reject, timer });
      this.transport.send(request);
    });
  }

  dispose(): void {
    this.#unsubscribe();
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Native bridge disposed'));
    }
    this.#pending.clear();
  }
}
