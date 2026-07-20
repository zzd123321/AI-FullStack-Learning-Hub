import { OUTBOX_STORE } from "./database.js";
import { requestToPromise, transactionDone } from "./idb-helpers.js";
import { stillOwnsLease } from "./lease-policy.js";
import type { OutboxRecord, SaveLessonCommand } from "./types.js";

export function createOutboxRepository(database: IDBDatabase) {
  return {
    async enqueue(command: SaveLessonCommand, now = Date.now()): Promise<OutboxRecord> {
      const record: OutboxRecord = {
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
      const transaction = database.transaction(OUTBOX_STORE, "readwrite");
      transaction.objectStore(OUTBOX_STORE).add(record);
      await transactionDone(transaction);
      return record;
    },

    async claimNext(owner: string, now: number, leaseMs: number): Promise<OutboxRecord | null> {
      if (!owner || !Number.isFinite(now) || !Number.isFinite(leaseMs) || leaseMs <= 0) {
        throw new RangeError("Invalid outbox lease parameters");
      }
      const transaction = database.transaction(OUTBOX_STORE, "readwrite");
      const store = transaction.objectStore(OUTBOX_STORE);
      const claimed = await new Promise<OutboxRecord | null>((resolve, reject) => {
        const request = store.index("by-next-attempt").openCursor(IDBKeyRange.upperBound(now));
        request.addEventListener("error", () => reject(request.error), { once: true });
        request.addEventListener("success", () => {
          const cursor = request.result;
          if (!cursor) {
            resolve(null);
            return;
          }
          const candidate = cursor.value as OutboxRecord;
          const leaseExpired = candidate.leaseExpiresAt === null || candidate.leaseExpiresAt <= now;
          if (candidate.status !== "failed" && leaseExpired) {
            const next: OutboxRecord = {
              ...candidate,
              status: "sending",
              attempts: candidate.attempts + 1,
              leaseOwner: owner,
              leaseExpiresAt: now + leaseMs,
            };
            const update = cursor.update(next);
            update.addEventListener("success", () => resolve(next), { once: true });
            update.addEventListener("error", () => reject(update.error), { once: true });
            return;
          }
          cursor.continue();
        });
      });
      await transactionDone(transaction);
      return claimed;
    },

    async complete(record: OutboxRecord): Promise<boolean> {
      const transaction = database.transaction(OUTBOX_STORE, "readwrite");
      const store = transaction.objectStore(OUTBOX_STORE);
      const current = await requestToPromise(store.get(record.id)) as OutboxRecord | undefined;
      const ownsLease = stillOwnsLease(current, record);
      // 租约可能在网络等待期间过期并被其他标签页重新认领；旧执行者不能删除新状态。
      if (ownsLease) store.delete(record.id);
      await transactionDone(transaction);
      return ownsLease;
    },

    async reschedule(record: OutboxRecord, nextAttemptAt: number, message: string): Promise<boolean> {
      const transaction = database.transaction(OUTBOX_STORE, "readwrite");
      const store = transaction.objectStore(OUTBOX_STORE);
      const current = await requestToPromise(store.get(record.id)) as OutboxRecord | undefined;
      const ownsLease = stillOwnsLease(current, record);
      if (ownsLease) {
        store.put({
          ...current,
          status: "pending",
          nextAttemptAt,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError: message,
        } satisfies OutboxRecord);
      }
      await transactionDone(transaction);
      return ownsLease;
    },

    async fail(record: OutboxRecord, message: string): Promise<boolean> {
      const transaction = database.transaction(OUTBOX_STORE, "readwrite");
      const store = transaction.objectStore(OUTBOX_STORE);
      const current = await requestToPromise(store.get(record.id)) as OutboxRecord | undefined;
      const ownsLease = stillOwnsLease(current, record);
      if (ownsLease) {
        store.put({
          ...current,
          status: "failed",
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError: message,
        } satisfies OutboxRecord);
      }
      await transactionDone(transaction);
      return ownsLease;
    },
  };
}
