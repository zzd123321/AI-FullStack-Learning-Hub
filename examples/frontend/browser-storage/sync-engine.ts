import type { OutboxRecord } from "./types.js";

export interface OutboxPort {
  claimNext(owner: string, now: number, leaseMs: number): Promise<OutboxRecord | null>;
  complete(id: string): Promise<void>;
  reschedule(record: OutboxRecord, nextAttemptAt: number, message: string): Promise<void>;
  fail(record: OutboxRecord, message: string): Promise<void>;
}

export type SendResult = { readonly ok: true } | {
  readonly ok: false;
  readonly retryable: boolean;
  readonly message: string;
};

export async function drainOutbox(
  outbox: OutboxPort,
  send: (record: OutboxRecord, signal: AbortSignal) => Promise<SendResult>,
  signal: AbortSignal,
): Promise<number> {
  const owner = crypto.randomUUID();
  let completed = 0;

  while (!signal.aborted) {
    const record = await outbox.claimNext(owner, Date.now(), 30_000);
    if (!record) break;

    try {
      const result = await send(record, signal);
      if (result.ok) {
        await outbox.complete(record.id);
        completed += 1;
      } else if (result.retryable && record.attempts < 5) {
        const maximum = Math.min(60_000, 1_000 * 2 ** (record.attempts - 1));
        await outbox.reschedule(record, Date.now() + Math.random() * maximum, result.message);
      } else {
        await outbox.fail(record, result.message);
      }
    } catch (error) {
      if (signal.aborted) {
        throw signal.reason ?? new DOMException("Synchronization aborted", "AbortError");
      }
      const message = error instanceof Error ? error.message : "Unknown synchronization error";
      if (record.attempts < 5) {
        const maximum = Math.min(60_000, 1_000 * 2 ** (record.attempts - 1));
        await outbox.reschedule(record, Date.now() + Math.random() * maximum, message);
      } else {
        await outbox.fail(record, message);
      }
    }
  }
  return completed;
}
