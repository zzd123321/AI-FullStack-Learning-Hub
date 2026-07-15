import type { OutboxRecord } from "./types.js";
import type { SendResult } from "./sync-engine.js";

export async function sendOutboxRecord(
  record: OutboxRecord,
  signal: AbortSignal,
): Promise<SendResult> {
  const response = await fetch(`/api/lessons/${encodeURIComponent(record.command.lessonId)}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "idempotency-key": record.idempotencyKey,
      "if-match": `\"${record.command.baseVersion}\"`,
    },
    body: JSON.stringify({
      title: record.command.title,
      content: record.command.content,
    }),
    signal,
  });

  if (response.ok) return { ok: true };
  if (response.status === 409 || response.status === 412) {
    return { ok: false, retryable: false, message: "Remote version conflict" };
  }
  if (response.status === 408 || response.status === 429 || response.status >= 500) {
    return { ok: false, retryable: true, message: `Temporary HTTP ${response.status}` };
  }
  return { ok: false, retryable: false, message: `Permanent HTTP ${response.status}` };
}
