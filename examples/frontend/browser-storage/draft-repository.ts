import { DRAFT_STORE } from "./database.js";
import { migrateDraft } from "./draft-migration.js";
import { requestToPromise, transactionDone } from "./idb-helpers.js";
import type { LessonDraft } from "./types.js";

export function createDraftRepository(database: IDBDatabase) {
  return {
    async get(id: string): Promise<LessonDraft | null> {
      const transaction = database.transaction(DRAFT_STORE, "readonly");
      const value: unknown = await requestToPromise(transaction.objectStore(DRAFT_STORE).get(id));
      await transactionDone(transaction);
      return value === undefined ? null : migrateDraft(value);
    },
    async put(draft: LessonDraft): Promise<void> {
      const transaction = database.transaction(DRAFT_STORE, "readwrite", { durability: "strict" });
      transaction.objectStore(DRAFT_STORE).put(draft);
      await transactionDone(transaction);
    },
    async delete(id: string): Promise<void> {
      const transaction = database.transaction(DRAFT_STORE, "readwrite");
      transaction.objectStore(DRAFT_STORE).delete(id);
      await transactionDone(transaction);
    },
  };
}
