import { DRAFT_STORE, OUTBOX_STORE } from "./database.js";
import { transactionDone } from "./idb-helpers.js";
import type { LessonDraft, OutboxRecord, SaveLessonCommand } from "./types.js";

export async function saveDraftAndScheduleSync(
  database: IDBDatabase,
  draft: LessonDraft,
  baseVersion: number,
  now = Date.now(),
): Promise<OutboxRecord> {
  const command: SaveLessonCommand = {
    lessonId: draft.id,
    title: draft.title,
    content: draft.content,
    baseVersion,
  };
  const outboxRecord: OutboxRecord = {
    id: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    command,
    status: "pending",
    attempts: 0,
    nextAttemptAt: now,
    leaseOwner: null,
    leaseExpiresAt: null,
    lastError: null,
    createdAt: now,
  };

  const transaction = database.transaction([DRAFT_STORE, OUTBOX_STORE], "readwrite", {
    durability: "strict",
  });
  transaction.objectStore(DRAFT_STORE).put(draft);
  transaction.objectStore(OUTBOX_STORE).add(outboxRecord);
  await transactionDone(transaction);
  return outboxRecord;
}
