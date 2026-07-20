import type { OutboxRecord } from "./types.js";
import type { SendResult } from "./sync-engine.js";

const IMF_FIXDATE = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;

function retryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isSafeInteger(seconds) && seconds <= Number.MAX_SAFE_INTEGER / 1000
      ? seconds * 1000
      : undefined;
  }
  if (!IMF_FIXDATE.test(trimmed)) return undefined;
  const date = Date.parse(trimmed);
  return Number.isNaN(date) || new Date(date).toUTCString() !== trimmed
    ? undefined
    : Math.max(0, date - Date.now());
}

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
    const delay = retryAfterMs(response.headers.get("retry-after"));
    return {
      ok: false,
      retryable: true,
      message: `Temporary HTTP ${response.status}`,
      ...(delay === undefined ? {} : { retryAfterMs: delay }),
    };
  }
  return { ok: false, retryable: false, message: `Permanent HTTP ${response.status}` };
}
