import type { OutboxRecord } from "./types.js";

export interface OutboxPort {
  claimNext(owner: string, now: number, leaseMs: number): Promise<OutboxRecord | null>;
  complete(record: OutboxRecord): Promise<boolean>;
  reschedule(record: OutboxRecord, nextAttemptAt: number, message: string): Promise<boolean>;
  fail(record: OutboxRecord, message: string): Promise<boolean>;
}

export type SendResult = { readonly ok: true } | {
  readonly ok: false;
  readonly retryable: boolean;
  readonly message: string;
  readonly retryAfterMs?: number;
};

function nextDelayMs(record: OutboxRecord, retryAfterMs?: number): number {
  if (retryAfterMs !== undefined) return Math.min(300_000, Math.max(0, retryAfterMs));
  const maximum = Math.min(60_000, 1_000 * 2 ** (record.attempts - 1));
  return Math.random() * maximum;
}

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

    let result: SendResult;
    try {
      result = await send(record, signal);
    } catch (error) {
      if (signal.aborted) {
        throw signal.reason ?? new DOMException("Synchronization aborted", "AbortError");
      }
      const message = error instanceof Error ? error.message : "Unknown synchronization error";
      result = { ok: false, retryable: true, message };
    }

    // 网络错误已转换成结果；下面的 IndexedDB 错误必须向外抛，不能再伪装成发送失败。
    if (result.ok) {
      if (await outbox.complete(record)) completed += 1;
    } else if (result.retryable && record.attempts < 5) {
      await outbox.reschedule(
        record,
        Date.now() + nextDelayMs(record, result.retryAfterMs),
        result.message,
      );
    } else {
      await outbox.fail(record, result.message);
    }
  }
  return completed;
}
