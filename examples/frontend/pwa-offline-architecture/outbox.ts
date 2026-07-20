export type OutboxStatus = 'pending' | 'dead-letter';

export interface MutationIntent {
  readonly id: string;
  readonly principalId: string;
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
  principalId: string,
  send: (intent: MutationIntent) => Promise<SendResult>,
  maximumAttempts = 5,
): Promise<void> {
  if (!principalId) throw new Error('A principal ID is required');
  if (!Number.isSafeInteger(maximumAttempts) || maximumAttempts < 1) {
    throw new RangeError('maximumAttempts must be a positive integer');
  }
  const intents = [...await store.list()]
    .filter((intent) => intent.status === 'pending' && intent.principalId === principalId)
    .sort((a, b) => a.createdAt - b.createdAt);
  for (const intent of intents) {
    if (intent.attempts >= maximumAttempts) {
      await store.put({
        ...intent, status: 'dead-letter', lastError: 'Retry budget exhausted',
      });
      continue;
    }
    let result: SendResult;
    try {
      result = await send(intent);
    } catch (error) {
      const attempts = intent.attempts + 1;
      await store.put({
        ...intent,
        attempts,
        status: attempts >= maximumAttempts ? 'dead-letter' : 'pending',
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
    const attempts = intent.attempts + 1;
    await store.put({
      ...intent,
      attempts,
      status: attempts >= maximumAttempts ? 'dead-letter' : 'pending',
      lastError: result.message,
    });
    break;
  }
}

export class OutboxFlusher {
  readonly #runningByPrincipal = new Map<string, Promise<void>>();

  flush(
    store: OutboxStore,
    principalId: string,
    send: (intent: MutationIntent) => Promise<SendResult>,
  ): Promise<void> {
    const running = this.#runningByPrincipal.get(principalId);
    if (running) return running;
    const next = flushOutbox(store, principalId, send).finally(() => {
      if (this.#runningByPrincipal.get(principalId) === next) {
        this.#runningByPrincipal.delete(principalId);
      }
    });
    this.#runningByPrincipal.set(principalId, next);
    return next;
  }
}
