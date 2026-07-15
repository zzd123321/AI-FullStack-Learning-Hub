import { requestToPromise } from "./idb-helpers.js";

export const DATABASE_NAME = "ai-learning-workspace";
export const DATABASE_VERSION = 3;
export const DRAFT_STORE = "lesson-drafts";
export const OUTBOX_STORE = "sync-outbox";

export interface OpenDatabaseOptions {
  readonly onBlocked?: () => void;
  readonly onVersionChange?: () => void;
}

export async function openLearningDatabase(options: OpenDatabaseOptions = {}): Promise<IDBDatabase> {
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

  request.addEventListener("upgradeneeded", (event) => {
    const database = request.result;
    const transaction = request.transaction;
    const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
    if (!transaction) throw new Error("Missing versionchange transaction");

    if (oldVersion < 1) {
      database.createObjectStore(DRAFT_STORE, { keyPath: "id" });
    }
    if (oldVersion < 2) {
      const outbox = database.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
      outbox.createIndex("by-next-attempt", "nextAttemptAt");
      outbox.createIndex("by-status", "status");
    }
    if (oldVersion < 3) {
      transaction.objectStore(DRAFT_STORE).createIndex("by-updated-at", "updatedAt");
    }
  });

  request.addEventListener("blocked", () => options.onBlocked?.());
  const database = await requestToPromise(request);
  database.addEventListener("versionchange", () => {
    database.close();
    options.onVersionChange?.();
  });
  return database;
}
