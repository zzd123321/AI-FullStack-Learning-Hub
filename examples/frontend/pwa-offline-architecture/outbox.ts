export type OutboxStatus = 'pending' | 'dead-letter';

export interface MutationIntent {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly operation: string;
  readonly payload: unknown;
  readonly createdAt: number;
  readonly attempts: number;
  readonly status: OutboxStatus;
  readonly lastError?: string;
}

export interface OutboxStore {
  list(): Promise<readonly MutationIntent[]>;
  put(intent: MutationIntent): Promise<void>;
  delete(id: string): Promise<void>;
}

export type SendResult =
  | { readonly kind: 'success' }
  | { readonly kind: 'retry'; readonly message: string }
  | { readonly kind: 'permanent-failure'; readonly message: string };

export async function flushOutbox(
  store: OutboxStore,
  send: (intent: MutationIntent) => Promise<SendResult>,
): Promise<void> {
  const intents = [...await store.list()]
    .filter((intent) => intent.status === 'pending')
    .sort((a, b) => a.createdAt - b.createdAt);
  for (const intent of intents) {
    let result: SendResult;
    try {
      result = await send(intent);
    } catch (error) {
      await store.put({
        ...intent,
        attempts: intent.attempts + 1,
        lastError: error instanceof Error ? error.message : 'Unexpected sync failure',
      });
      break;
    }
    if (result.kind === 'success') {
      await store.delete(intent.id);
      continue;
    }
    if (result.kind === 'permanent-failure') {
      await store.put({
        ...intent, status: 'dead-letter', attempts: intent.attempts + 1,
        lastError: result.message,
      });
      continue;
    }
    await store.put({ ...intent, attempts: intent.attempts + 1, lastError: result.message });
    break;
  }
}

export class OutboxFlusher {
  #running: Promise<void> | null = null;

  flush(store: OutboxStore, send: (intent: MutationIntent) => Promise<SendResult>): Promise<void> {
    if (this.#running) return this.#running;
    this.#running = flushOutbox(store, send).finally(() => { this.#running = null; });
    return this.#running;
  }
}
