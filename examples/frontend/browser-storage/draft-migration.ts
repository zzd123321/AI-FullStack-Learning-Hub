import type { LessonDraft } from "./types.js";

interface LessonDraftV1 {
  readonly id: string;
  readonly content: string;
  readonly savedAt: number;
  readonly schemaVersion: 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function migrateDraft(value: unknown): LessonDraft {
  if (!isRecord(value)) throw new TypeError("Invalid draft record");

  if (
    value.schemaVersion === 2 &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.content === "string" &&
    typeof value.updatedAt === "number"
  ) {
    return value as unknown as LessonDraft;
  }

  if (
    value.schemaVersion === 1 &&
    typeof value.id === "string" &&
    typeof value.content === "string" &&
    typeof value.savedAt === "number"
  ) {
    const oldDraft = value as unknown as LessonDraftV1;
    return {
      id: oldDraft.id,
      title: "未命名草稿",
      content: oldDraft.content,
      updatedAt: oldDraft.savedAt,
      schemaVersion: 2,
    };
  }

  throw new TypeError("Unsupported draft schema");
}
